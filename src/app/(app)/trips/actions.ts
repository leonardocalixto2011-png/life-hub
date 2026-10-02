"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub, type HubTx } from "@/lib/hub-context";
import { prisma } from "@/lib/prisma";
import { fmtDay, langOf } from "@/lib/i18n";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import { revalidateContent } from "@/lib/revalidate";
import { assertActiveMember } from "@/lib/membership";
import { formResult, type ActionResult } from "@/lib/action-result";
import {
  deadlineKey,
  deadlineKeys,
  isRealDay,
  legacyPlanDeadlines,
  missingPlanRows,
  noon,
  planNote,
  planShiftDays,
  planTripPatch,
  resolvePlan,
  retiredRowIds,
  TRIP_TEMPLATES,
  tripPlanSchema,
  type ResolvedPlan,
  type TripPlan,
  ymd,
} from "@/lib/trip-plan";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the dates")
  .refine(isRealDay, "That date doesn't exist");

/**
 * An optional money field that may be blank but never negative. `dollarsToCents`
 * keeps a minus sign, and a negative budget or cost would turn every
 * "planned vs spent" figure on the trip page upside down.
 */
function optionalCents(raw: string | null, negativeMessage: string): number | null {
  const cents = dollarsToCents(raw);
  // The whole sentence is passed in (not a label spliced into one) so it
  // stays a single translatable key.
  if (cents != null && cents < 0) throw new Error(negativeMessage);
  return cents;
}

const tripFields = {
  title: z.string().trim().min(1, "Give the trip a name").max(120),
  destination: z.preprocess(emptyToNull, z.string().trim().max(120).nullable()),
  startDate: day,
  endDate: day,
  budget: z.preprocess(emptyToNull, z.string().nullable()),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("SHARED"),
};

function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> {
  const res = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  return res.data;
}

function tripData(d: z.infer<z.ZodObject<typeof tripFields>>) {
  const startDate = fromDateInput(d.startDate);
  const endDate = fromDateInput(d.endDate);
  if (!startDate || !endDate) throw new Error("Invalid dates");
  if (endDate < startDate) throw new Error("The trip can't end before it starts.");
  return {
    title: d.title,
    destination: d.destination,
    startDate,
    endDate,
    budgetCents: optionalCents(d.budget, "The budget can't be negative."),
    notes: d.notes,
    visibility: d.visibility,
  };
}

/** App-level mirror of trip_hub_and_privacy_isolation. */
function visibleTrip(hubId: string, userId: string) {
  return { hubId, OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };
}

export async function createTrip(fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const { user, hub } = await requireHub();
    const data = tripData(parse(z.object(tripFields), fd));
    const trip = await withHub(user.id, (tx) =>
      tx.trip.create({ data: { ...data, hubId: hub.id, createdById: user.id } }),
    );
    revalidateContent("/trips");
    redirect(`/trips/${trip.id}`);
  });
}

/** Edited in place on the trip page, so no redirect — revalidation re-renders it. */
export async function updateTrip(fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const { user, hub } = await requireHub();
    const d = parse(z.object({ ...tripFields, id: z.string().cuid() }), fd);
    // Checkboxes, so read with getAll — `parse` flattens repeated keys. Only
    // touched when the form rendered the picker (a hub of one has none).
    const travelerIds = fd.has("travelersShown")
      ? z.array(z.string().cuid()).parse(fd.getAll("travelerIds"))
      : undefined;
    // Plain ids with no FK, so RLS can't vouch for them — same as assignees.
    for (const id of travelerIds ?? []) await assertActiveMember(hub.id, id);
    await withHub(user.id, async (tx) => {
      const trip = await tx.trip.findFirst({ where: { id: d.id, ...visibleTrip(hub.id, user.id) } });
      if (!trip) throw new Error("Trip not found");
      await tx.trip.update({
        where: { id: d.id },
        data: { ...tripData(d), ...(travelerIds ? { travelerIds } : {}) },
      });
    });
    revalidateContent("/trips", `/trips/${d.id}`);
  });
}

/**
 * Deletes a trip, its items (cascade) and the reminders its plan created.
 * Those are ordinary hub Deadlines — "book the flights", one per savings
 * deposit — and used to outlive the trip, pushing and emailing about a
 * holiday nobody was taking any more.
 *
 * Open reminders are deleted. Ones already ticked are kept as a record of
 * something that happened and simply lose their link (the FK is SET NULL).
 */
export async function deleteTrip(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));

  // Linked reminders this person may not be able to see: a trip imported
  // while private and shared afterwards leaves its deadlines PRIVATE to the
  // importer, out of reach of anyone else's RLS. Only their ids are read
  // here, and nothing is done with them unless the trip delete below — which
  // *is* subject to visibility — goes through.
  const linked = await prisma.deadline.findMany({
    where: { tripId: id, hubId: hub.id, doneAt: null },
    select: { id: true },
  });

  const deleted = await withHub(user.id, async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id, ...visibleTrip(hub.id, user.id) },
      select: { title: true, items: { select: { kind: true, title: true } } },
    });
    if (!trip) return false;

    // Mirrors the deadline RLS policy, per this app's defense-in-depth rule.
    const visible = { OR: [{ visibility: "SHARED" as const }, { createdById: user.id }] };
    await tx.deadline.deleteMany({ where: { hubId: hub.id, tripId: id, doneAt: null, ...visible } });

    // Trips imported before reminders carried a tripId have nothing to follow.
    // For those, fall back to the exact title + day pairs of the built-in plan
    // the trip was made from — and not at all if another trip in the hub could
    // be from the same plan, since then there's no telling whose they are.
    const legacy = legacyPlanDeadlines(trip);
    if (legacy) {
      const twins = await tx.trip.count({
        where: { hubId: hub.id, id: { not: id }, title: { in: legacy.tripTitles, mode: "insensitive" } },
      });
      if (twins === 0) {
        const rows = await tx.deadline.findMany({
          where: { hubId: hub.id, tripId: null, doneAt: null, title: { in: legacy.titles }, ...visible },
          select: { id: true, title: true, dueDate: true },
        });
        const ids = rows.filter((r) => legacy.keys.has(deadlineKey(r.title, ymd(r.dueDate)))).map((r) => r.id);
        if (ids.length > 0) await tx.deadline.deleteMany({ where: { hubId: hub.id, id: { in: ids } } });
      }
    }

    const { count } = await tx.trip.deleteMany({ where: { id, ...visibleTrip(hub.id, user.id) } });
    return count > 0;
  });

  if (deleted && linked.length > 0) {
    await prisma.deadline.deleteMany({
      where: { id: { in: linked.map((d) => d.id) }, hubId: hub.id, doneAt: null },
    });
  }
  revalidateContent("/trips");
  redirect("/trips");
}

const itemSchema = z.object({
  kind: z.enum(["BOOK", "TODO", "PACK", "ACTIVITY", "SAVE", "STOP", "BUDGET", "TIP"]).default("TODO"),
  title: z.string().trim().min(1, "What needs doing?").max(160),
  cost: z.preprocess(emptyToNull, z.string().nullable()),
  date: z.preprocess(emptyToNull, day.nullable()),
  endDate: z.preprocess(emptyToNull, day.nullable()),
  assignedToId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  note: z.preprocess(emptyToNull, z.string().trim().max(800).nullable()),
});

export async function addTripItem(tripId: string, fd: FormData): Promise<ActionResult> {
  return formResult(() => addTripItemCore(tripId, fd));
}

async function addTripItemCore(tripId: string, fd: FormData) {
  const { user, hub } = await requireHub();
  z.string().cuid().parse(tripId);
  const d = parse(itemSchema, fd);
  if ((d.kind === "ACTIVITY" || d.kind === "SAVE" || d.kind === "STOP") && !d.date) {
    throw new Error("Pick a date");
  }
  if (d.kind === "STOP" && (!d.endDate || d.endDate <= d.date!)) {
    throw new Error("A stop needs the day you leave, after the day you arrive.");
  }
  if (d.kind === "BUDGET" && !d.cost) throw new Error("A budget line needs an amount.");
  const costCents = optionalCents(d.cost, "The amount can't be negative.");
  await withHub(user.id, async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id: tripId, ...visibleTrip(hub.id, user.id) },
      select: { hubId: true },
    });
    if (!trip) throw new Error("Trip not found");
    // A plain member id with no FK — checked against the trip's own hub.
    if (d.assignedToId) await assertActiveMember(trip.hubId, d.assignedToId);
    await tx.tripItem.create({
      data: {
        tripId,
        hubId: trip.hubId,
        kind: d.kind,
        title: d.title,
        costCents,
        date: fromDateInput(d.date),
        endDate: d.kind === "STOP" ? fromDateInput(d.endDate) : null,
        assignedToId: d.assignedToId,
        note: d.note,
      },
    });
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
}

/**
 * Items are only reachable through a trip the viewer can see — the app-level
 * mirror of trip_item_via_visible_trip, so a private trip's checklist can't be
 * ticked or deleted by id from outside it.
 */
export async function toggleTripItem(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  const tripId = await withHub(user.id, async (tx) => {
    const item = await tx.tripItem.findFirst({
      where: { id, trip: visibleTrip(hub.id, user.id) },
      select: { done: true, tripId: true },
    });
    if (!item) throw new Error("Item not found");
    await tx.tripItem.update({ where: { id }, data: { done: !item.done } });
    return item.tripId;
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
}

export async function deleteTripItem(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  const tripId = await withHub(user.id, async (tx) => {
    const item = await tx.tripItem.findFirst({
      where: { id, trip: visibleTrip(hub.id, user.id) },
      select: { tripId: true },
    });
    if (!item) throw new Error("Item not found");
    await tx.tripItem.delete({ where: { id } });
    return item.tripId;
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
}

/**
 * Adds to (or, with a negative amount, takes back from) what's been saved for
 * a trip. Never lets the total go below zero.
 */
export async function addTripSavings(tripId: string, fd: FormData): Promise<ActionResult> {
  return formResult(() => addTripSavingsCore(tripId, fd));
}

async function addTripSavingsCore(tripId: string, fd: FormData) {
  const { user, hub } = await requireHub();
  z.string().cuid().parse(tripId);
  const { amount } = parse(z.object({ amount: z.string().trim().min(1, "Enter an amount") }), fd);
  const cents = dollarsToCents(amount);
  if (cents == null || cents === 0) throw new Error("Enter an amount");
  await withHub(user.id, async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id: tripId, ...visibleTrip(hub.id, user.id) },
      select: { savedCents: true },
    });
    if (!trip) throw new Error("Trip not found");
    await tx.trip.update({
      where: { id: tripId },
      data: { savedCents: Math.max(0, trip.savedCents + cents) },
    });
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
}

/**
 * Loads a whole plan into a trip: stops, day-by-day activities, dated
 * bookings and to-dos, the savings schedule and the packing list. The plan
 * is either a built-in template or pasted JSON in the same shape. Adds to
 * what's there; sets the budget only when the trip has none.
 */
export async function importTripPlan(tripId: string, fd: FormData): Promise<ActionResult> {
  return formResult(() => importTripPlanCore(tripId, fd));
}

async function importTripPlanCore(tripId: string, fd: FormData): Promise<ActionResult> {
  const { user, hub } = await requireHub();
  const lang = langOf(user.locale);
  z.string().cuid().parse(tripId);

  let plan: TripPlan;
  const key = String(fd.get("template") ?? "");
  const json = String(fd.get("json") ?? "").trim();
  // Object.hasOwn, not a plain lookup: "constructor" or "__proto__" would
  // otherwise find something on Object.prototype and crash on `.plan`.
  if (key && Object.hasOwn(TRIP_TEMPLATES, key)) {
    plan = TRIP_TEMPLATES[key].plan;
  } else if (json) {
    let raw: unknown;
    try {
      raw = JSON.parse(json);
    } catch {
      throw new Error("That isn't valid JSON.");
    }
    const res = tripPlanSchema.safeParse(raw);
    if (!res.success) throw new Error(res.error.issues[0]?.message ?? "That plan doesn't look right.");
    plan = res.data;
  } else {
    throw new Error("Pick a plan or paste one.");
  }

  const moved = await withHub(user.id, async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id: tripId, ...visibleTrip(hub.id, user.id) },
      select: {
        hubId: true,
        title: true,
        destination: true,
        startDate: true,
        endDate: true,
        budgetCents: true,
        notes: true,
        visibility: true,
        items: { select: { id: true, kind: true, title: true, note: true, done: true } },
      },
    });
    if (!trip) throw new Error("Trip not found");

    // The trip's own fields first: an updated plan may move the trip's dates,
    // and how far the plan's rows have to shift depends on where the trip
    // ends up. Dates the person set themselves are never moved — the plan is.
    const patch = planTripPatch(resolvePlan(plan, { lang }), trip);
    const dates = { startDate: patch.startDate ?? trip.startDate, endDate: patch.endDate ?? trip.endDate };
    const shiftDays = planShiftDays(plan, dates);
    const resolved = resolvePlan(plan, { lang, shiftDays });

    // An updated plan first drops the rows it no longer has (untouched ones only).
    const dropIds = retiredRowIds(resolved, trip.items);
    if (dropIds.length > 0) await tx.tripItem.deleteMany({ where: { tripId, id: { in: dropIds } } });
    const kept = trip.items.filter((i) => !dropIds.includes(i.id));

    const rows = missingPlanRows(resolved, tripId, trip.hubId, kept);
    if (rows.length > 0) await tx.tripItem.createMany({ data: rows });
    // Rows already there keep everything, but pick up a note the plan now has.
    for (const e of kept) {
      if (e.note) continue;
      const note = planNote(resolved, e.kind, e.title);
      if (note) await tx.tripItem.update({ where: { id: e.id }, data: { note } });
    }

    if (Object.keys(patch).length > 0) await tx.trip.update({ where: { id: tripId }, data: patch });

    const reminders = await syncPlanDeadlines(tx, resolved, tripId, trip.hubId, user.id, trip.visibility);
    // Only worth saying when something new actually landed on moved dates.
    return shiftDays !== 0 && (rows.some((r) => r.date) || reminders > 0) ? dates.startDate : null;
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
  return moved
    ? { notice: "Plan imported. Its dates were moved to start on {date}, like your trip.", noticeVars: { date: fmtDay(moved, lang) } }
    : {};
}

/**
 * The plan's dated steps as hub deadlines, so the digest and pushes carry the
 * schedule. Matched on title + day among deadlines this person can see: a
 * match that isn't done takes the plan's notes and reminder days, a missing
 * one is created, and a retired one is removed unless it was done.
 *
 * Every one it creates or matches is linked to the trip (`tripId`), which is
 * what lets deleteTrip remove them. A match may be under the other language's
 * title or on the plan's unshifted day (see deadlineKeys); it is adopted where
 * it stands — like trip rows, an existing reminder is never moved or renamed.
 * Returns how many it created.
 */
async function syncPlanDeadlines(
  tx: HubTx,
  plan: ResolvedPlan,
  tripId: string,
  hubId: string,
  userId: string,
  // A private trip's reminders stay private too, or they'd land in every
  // member's deadlines and digest.
  visibility: "PRIVATE" | "SHARED",
) {
  const want = plan.deadlines ?? [];
  const gone = plan.retiredDeadlines ?? [];
  if (want.length === 0 && gone.length === 0) return 0;

  const existing = await tx.deadline.findMany({
    where: {
      hubId,
      title: { in: [...want, ...gone].flatMap((d) => (d.alt ? [d.title, d.alt] : [d.title])) },
      AND: [
        // This trip's own, or ones from before the link existed. Never
        // another trip's: two trips from one template each keep their own.
        { OR: [{ tripId }, { tripId: null }] },
        // Mirrors the deadline RLS policy, per this app's defense-in-depth rule.
        { OR: [{ visibility: "SHARED" }, { createdById: userId }] },
      ],
    },
    select: { id: true, title: true, dueDate: true, doneAt: true, tripId: true },
    // Unlinked first, so that on a shared key the linked one wins the Map.
    orderBy: { tripId: { sort: "asc", nulls: "first" } },
  });
  const byKey = new Map(existing.map((d) => [deadlineKey(d.title, ymd(d.dueDate)), d]));
  const find = (d: { title: string; due: string; alt?: string; altDue?: string }) => {
    for (const k of deadlineKeys(d)) {
      const row = byKey.get(k);
      if (row) return row;
    }
    return undefined;
  };
  const wantedIds = new Set(want.map((d) => find(d)?.id).filter((id): id is string => !!id));

  // A retired step someone already ticked (an old deposit amount, paid) also
  // covers the new step due the same day: don't ask for that money twice.
  const doneDays = new Set(gone.filter((d) => find(d)?.doneAt).map((d) => d.due));

  const dropIds = gone
    .map((d) => find(d))
    .filter((d): d is NonNullable<typeof d> => !!d && !d.doneAt && !wantedIds.has(d.id))
    .map((d) => d.id);
  if (dropIds.length > 0) await tx.deadline.deleteMany({ where: { hubId, id: { in: dropIds } } });

  let created = 0;
  for (const d of want) {
    const found = find(d);
    const remindDaysBefore = d.remind ?? [7, 3, 1];
    if (!found) {
      if (doneDays.has(d.due)) continue;
      await tx.deadline.create({
        data: {
          hubId,
          tripId,
          title: d.title,
          notes: d.notes ?? null,
          remindDaysBefore,
          dueDate: noon(d.due),
          createdById: userId,
          visibility,
        },
      });
      created++;
    } else if (!found.doneAt) {
      // Notes follow the plan only when the reminder is in this language;
      // one made in the other language keeps its own text.
      const sameLanguage = found.title.trim().toLowerCase() === d.title.trim().toLowerCase();
      await tx.deadline.update({
        where: { id: found.id },
        data: { tripId, remindDaysBefore, ...(sameLanguage ? { notes: d.notes ?? null } : {}) },
      });
    }
  }
  return created;
}
