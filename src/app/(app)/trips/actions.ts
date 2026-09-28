"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import { revalidateContent } from "@/lib/revalidate";
import { assertActiveMember } from "@/lib/membership";
import { formResult, type ActionResult } from "@/lib/action-result";
import {
  isRealDay,
  missingPlanRows,
  planNote,
  TRIP_TEMPLATES,
  tripPlanSchema,
  type TripPlan,
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

export async function deleteTrip(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) =>
    tx.trip.deleteMany({ where: { id, ...visibleTrip(hub.id, user.id) } }),
  );
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

async function importTripPlanCore(tripId: string, fd: FormData) {
  const { user, hub } = await requireHub();
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

  await withHub(user.id, async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id: tripId, ...visibleTrip(hub.id, user.id) },
      select: { hubId: true, budgetCents: true, items: { select: { id: true, kind: true, title: true, note: true } } },
    });
    if (!trip) throw new Error("Trip not found");
    const rows = missingPlanRows(plan, tripId, trip.hubId, trip.items);
    if (rows.length > 0) await tx.tripItem.createMany({ data: rows });
    // Rows already there keep everything, but pick up a note the plan now has.
    for (const e of trip.items) {
      if (e.note) continue;
      const note = planNote(plan, e.kind, e.title);
      if (note) await tx.tripItem.update({ where: { id: e.id }, data: { note } });
    }
    if (trip.budgetCents == null && plan.budget != null) {
      await tx.trip.update({ where: { id: tripId }, data: { budgetCents: Math.round(plan.budget * 100) } });
    }
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
}
