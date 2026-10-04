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
import { rescopeActivity } from "@/lib/activity-rescope";
import { assertActiveMember } from "@/lib/membership";
import { formResult, type ActionResult } from "@/lib/action-result";
import { logActivity } from "@/lib/activity";
import { blobUrlSchema } from "@/lib/blob-url";
import { deleteBlobIfUnreferenced } from "@/lib/blob-delete";
import { copyImageToBlob } from "@/lib/remote-image";
import { rateLimit } from "@/lib/rate-limit";
import { mapLimit } from "@/lib/async";
import {
  deadlineKey,
  deadlineKeys,
  isRealDay,
  legacyPlanDeadlines,
  missingPlanRows,
  noon,
  planExtras,
  planNote,
  planShiftDays,
  planTripPatch,
  resolvePlan,
  retiredRowIds,
  TRIP_TEMPLATES,
  tripPlanSchema,
  type ResolvedPlan,
  type TripPlan,
  webUrl,
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
    const trip = await withHub(user.id, async (tx) => {
      const row = await tx.trip.create({ data: { ...data, hubId: hub.id, createdById: user.id } });
      await logActivity(tx, {
        hubId: hub.id,
        actorId: user.id,
        verb: "TRIP_ADDED",
        entityType: "trip",
        entityId: row.id,
        summary: row.title,
        visibility: row.visibility,
      });
      return row;
    });
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
    await rescopeActivity(hub.id, "trip", d.id, { visibility: d.visibility, title: d.title });
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
      select: { title: true, coverImageUrl: true, items: { select: { kind: true, title: true, imageUrl: true } } },
    });
    if (!trip) return null;

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
    return count > 0 ? [trip.coverImageUrl, ...trip.items.map((i) => i.imageUrl)] : null;
  });

  for (const url of deleted ?? []) await deleteBlobIfUnreferenced(url);
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
  url: z.preprocess(emptyToNull, webUrl.nullable()),
  place: z.preprocess(emptyToNull, z.string().trim().max(200).nullable()),
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
        url: d.url,
        place: d.place,
      },
    });
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
}

/**
 * Edits one item of the plan: most often its real price once it's booked
 * ("the hotel came to $281"), but also its date, details, link and map place.
 * The kind stays; a booking doesn't turn into a packing item.
 */
export async function updateTripItem(itemId: string, fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const { user, hub } = await requireHub();
    z.string().cuid().parse(itemId);
    const d = parse(itemSchema.omit({ kind: true }).extend({ paid: z.preprocess(emptyToNull, z.string().nullable()) }), fd);
    const costCents = optionalCents(d.cost, "The amount can't be negative.");
    const paidCents = optionalCents(d.paid, "The amount can't be negative.");
    const tripId = await withHub(user.id, async (tx) => {
      const item = await tx.tripItem.findFirst({
        where: { id: itemId, trip: visibleTrip(hub.id, user.id) },
        select: { kind: true, tripId: true, hubId: true, done: true },
      });
      if (!item) throw new Error("Item not found");
      if ((item.kind === "ACTIVITY" || item.kind === "SAVE" || item.kind === "STOP") && !d.date) {
        throw new Error("Pick a date");
      }
      if (item.kind === "STOP" && (!d.endDate || d.endDate <= d.date!)) {
        throw new Error("A stop needs the day you leave, after the day you arrive.");
      }
      if (item.kind === "BUDGET" && costCents == null) throw new Error("A budget line needs an amount.");
      if (d.assignedToId) await assertActiveMember(item.hubId, d.assignedToId);
      await tx.tripItem.update({
        where: { id: itemId },
        data: {
          title: d.title,
          costCents,
          date: fromDateInput(d.date),
          endDate: item.kind === "STOP" ? fromDateInput(d.endDate) : null,
          assignedToId: d.assignedToId,
          note: d.note,
          url: d.url,
          place: d.place,
          // Same rule as setTripItemPaid: a real price on a booking means it's booked.
          ...(item.kind === "BUDGET" || item.kind === "SAVE" ? {} : { paidCents }),
          ...(paidCents != null && item.kind === "BOOK" && !item.done ? { done: true } : {}),
        },
      });
      return item.tripId;
    });
    revalidateContent(`/trips/${tripId}`, `/trips/${tripId}/items/${itemId}`, "/trips");
    redirect(`/trips/${tripId}`);
  });
}

/** Writes a trip item's photo and returns the one it replaced. */
async function writeItemImage(itemId: string, next: string | null) {
  const { user, hub } = await requireHub();
  z.string().cuid().parse(itemId);
  const res = await withHub(user.id, async (tx) => {
    const item = await tx.tripItem.findFirst({
      where: { id: itemId, trip: visibleTrip(hub.id, user.id) },
      select: { imageUrl: true, tripId: true },
    });
    if (!item) throw new Error("Item not found");
    await tx.tripItem.update({ where: { id: itemId }, data: { imageUrl: next } });
    return item;
  });
  // New value first, then the old file — only if nothing else points at it.
  if (res.imageUrl !== next) await deleteBlobIfUnreferenced(res.imageUrl);
  revalidateContent(`/trips/${res.tripId}`, `/trips/${res.tripId}/items/${itemId}`);
}

/** A photo uploaded from the phone (already in our Blob store), or null to remove. */
export async function setTripItemImage(itemId: string, url: string | null) {
  await writeItemImage(itemId, url == null ? null : blobUrlSchema.parse(url));
}

/** A photo linked from the web: copied into our storage first. */
export async function setTripItemImageFromLink(itemId: string, link: string) {
  const { user, hub } = await requireHub();
  const source = webUrl.parse(link);
  if (!(await rateLimit(`tripimg:${user.id}`, 150, 3600)).ok) {
    throw new Error("Too many photo uploads. Try again in a little while.");
  }
  const url = await copyImageToBlob(source, `trips/${hub.id}/`);
  if (!url) throw new Error("That link isn't a photo we could copy. Try another one.");
  await writeItemImage(itemId, url);
}

async function writeTripCover(tripId: string, next: string | null) {
  const { user, hub } = await requireHub();
  z.string().cuid().parse(tripId);
  const old = await withHub(user.id, async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id: tripId, ...visibleTrip(hub.id, user.id) },
      select: { coverImageUrl: true },
    });
    if (!trip) throw new Error("Trip not found");
    await tx.trip.update({ where: { id: tripId }, data: { coverImageUrl: next } });
    return trip.coverImageUrl;
  });
  if (old !== next) await deleteBlobIfUnreferenced(old);
  revalidateContent(`/trips/${tripId}`, "/trips");
}

export async function setTripCover(tripId: string, url: string | null) {
  await writeTripCover(tripId, url == null ? null : blobUrlSchema.parse(url));
}

export async function setTripCoverFromLink(tripId: string, link: string) {
  const { user, hub } = await requireHub();
  const source = webUrl.parse(link);
  if (!(await rateLimit(`tripimg:${user.id}`, 150, 3600)).ok) {
    throw new Error("Too many photo uploads. Try again in a little while.");
  }
  const url = await copyImageToBlob(source, `trips/${hub.id}/`);
  if (!url) throw new Error("That link isn't a photo we could copy. Try another one.");
  await writeTripCover(tripId, url);
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
      select: { done: true, tripId: true, title: true, hubId: true, trip: { select: { visibility: true } } },
    });
    if (!item) throw new Error("Item not found");
    await tx.tripItem.update({ where: { id }, data: { done: !item.done } });
    // Ticking is news, un-ticking is a correction. The line follows its trip's
    // visibility, so a private trip's checklist stays out of everyone's feed.
    if (!item.done) {
      await logActivity(tx, {
        hubId: item.hubId,
        actorId: user.id,
        verb: "TRIP_ITEM_DONE",
        entityType: "trip",
        entityId: item.tripId,
        summary: item.title,
        visibility: item.trip.visibility,
      });
    }
    return item.tripId;
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
}

/**
 * Records what an item really cost, next to the plan's estimate. A blank
 * amount clears it. Entering a price on a booking also ticks it: you only
 * know the real price once it's booked.
 */
export async function setTripItemPaid(fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const { user, hub } = await requireHub();
    const id = z.string().cuid().parse(fd.get("id"));
    const paidCents = optionalCents(
      (fd.get("paid") as string | null) ?? null,
      "The amount can't be negative.",
    );
    const tripId = await withHub(user.id, async (tx) => {
      const item = await tx.tripItem.findFirst({
        where: { id, trip: visibleTrip(hub.id, user.id) },
        select: { tripId: true, kind: true, done: true },
      });
      if (!item) throw new Error("Item not found");
      await tx.tripItem.update({
        where: { id },
        data: {
          paidCents,
          ...(paidCents != null && item.kind === "BOOK" && !item.done ? { done: true } : {}),
        },
      });
      return item.tripId;
    });
    revalidateContent(`/trips/${tripId}`, "/trips");
  });
}

export async function deleteTripItem(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  const gone = await withHub(user.id, async (tx) => {
    const item = await tx.tripItem.findFirst({
      where: { id, trip: visibleTrip(hub.id, user.id) },
      select: { tripId: true, imageUrl: true },
    });
    if (!item) throw new Error("Item not found");
    await tx.tripItem.delete({ where: { id } });
    return item;
  });
  await deleteBlobIfUnreferenced(gone.imageUrl);
  revalidateContent(`/trips/${gone.tripId}`, "/trips");
  // Deleted from its own page, which no longer exists: back to the trip.
  if (fd.get("back")) redirect(`/trips/${gone.tripId}`);
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
      select: { id: true },
    });
    if (!trip) throw new Error("Trip not found");
    // One statement, so two quick taps can't read the same total and drop
    // one of the amounts. Still floored at 0 for a withdrawal.
    await tx.$executeRaw`UPDATE "Trip" SET "savedCents" = GREATEST(0, "savedCents" + ${cents}) WHERE "id" = ${tripId}`;
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
  const builtIn = !!key && Object.hasOwn(TRIP_TEMPLATES, key);
  if (builtIn) {
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

  const done = await withHub(user.id, async (tx) => {
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
        coverImageUrl: true,
        items: {
          select: { id: true, kind: true, title: true, note: true, done: true, url: true, place: true },
        },
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
    // Same for a link or a map place the row doesn't have yet.
    for (const e of kept) {
      const note = e.note ? null : planNote(resolved, e.kind, e.title);
      const extra = planExtras(resolved, e.kind, e.title);
      const data = {
        ...(note ? { note } : {}),
        ...(!e.url && extra?.url ? { url: extra.url } : {}),
        ...(!e.place && extra?.place ? { place: extra.place } : {}),
      };
      if (Object.keys(data).length > 0) await tx.tripItem.update({ where: { id: e.id }, data });
    }

    if (Object.keys(patch).length > 0) await tx.trip.update({ where: { id: tripId }, data: patch });

    const reminders = await syncPlanDeadlines(tx, resolved, tripId, trip.hubId, user.id, trip.visibility, builtIn);
    // Only worth saying when something new actually landed on moved dates.
    return {
      moved: shiftDays !== 0 && (rows.some((r) => r.date) || reminders > 0) ? dates.startDate : null,
      resolved,
      hubId: trip.hubId,
      needCover: !trip.coverImageUrl,
    };
  });
  // Photos come after, outside the transaction: each is a download from
  // another site, far too slow to hold a database transaction open for.
  await importPlanPhotos(user.id, hub.id, tripId, done.hubId, done.resolved, done.needCover);
  const moved = done.moved;
  revalidateContent(`/trips/${tripId}`, "/trips");
  return moved
    ? { notice: "Plan imported. Its dates were moved to start on {date}, like your trip.", noticeVars: { date: fmtDay(moved, lang) } }
    : {};
}

/** Most photos one import copies in; a re-import picks up any it skipped. */
const MAX_PLAN_PHOTOS = 40;
/** How long an import spends on photos before leaving the rest for next time. */
const PHOTO_BUDGET_MS = 25_000;

/**
 * Gives the trip's rows (and the trip itself) the photos the plan names, for
 * the ones that have none yet. Each photo is copied into our own storage
 * (lib/remote-image.ts) so viewers' browsers never call another site. Only
 * rows still without a photo when the copy lands are written, so a photo
 * someone set by hand in the meantime wins.
 */
async function importPlanPhotos(
  userId: string,
  currentHubId: string,
  tripId: string,
  hubId: string,
  plan: ResolvedPlan,
  needCover: boolean,
) {
  const rows = await withHub(userId, (tx) =>
    tx.tripItem.findMany({
      where: { tripId, imageUrl: null, trip: visibleTrip(currentHubId, userId) },
      select: { id: true, kind: true, title: true },
    }),
  );
  const jobs: { id: string | null; image: string }[] = [];
  if (needCover && plan.trip?.image) jobs.push({ id: null, image: plan.trip.image });
  for (const r of rows) {
    const image = planExtras(plan, r.kind, r.title)?.image;
    if (image) jobs.push({ id: r.id, image });
  }
  if (jobs.length === 0) return;

  const started = Date.now();
  const copied = await mapLimit(jobs.slice(0, MAX_PLAN_PHOTOS), 4, async (job) => {
    if (Date.now() - started > PHOTO_BUDGET_MS) return null;
    // Storage is billed: the same hourly allowance as uploading by hand.
    if (!(await rateLimit(`tripimg:${userId}`, 150, 3600)).ok) return null;
    const url = await copyImageToBlob(job.image, `trips/${hubId}/`);
    return url ? { ...job, url } : null;
  });

  const landed = copied.filter((c): c is NonNullable<typeof c> => !!c);
  if (landed.length === 0) return;
  const unused = await withHub(userId, async (tx) => {
    const left: string[] = [];
    for (const c of landed) {
      const { count } =
        c.id == null
          ? await tx.trip.updateMany({
              where: { id: tripId, coverImageUrl: null, ...visibleTrip(currentHubId, userId) },
              data: { coverImageUrl: c.url },
            })
          : await tx.tripItem.updateMany({
              where: { id: c.id, imageUrl: null, trip: visibleTrip(currentHubId, userId) },
              data: { imageUrl: c.url },
            });
      if (count === 0) left.push(c.url);
    }
    return left;
  });
  for (const url of unused) await deleteBlobIfUnreferenced(url);
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
  // Only a built-in template may adopt unlinked deadlines from before the
  // trip link existed. Pasted JSON could otherwise name any hub deadline by
  // title and day, take it over, and have it deleted with the trip.
  builtIn: boolean,
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
        builtIn ? { OR: [{ tripId }, { tripId: null }] } : { tripId },
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
