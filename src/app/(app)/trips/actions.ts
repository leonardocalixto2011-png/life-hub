"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import { revalidateContent } from "@/lib/revalidate";
import { planRows, TRIP_TEMPLATES, tripPlanSchema, type TripPlan } from "@/lib/trip-plan";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);
const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the dates");

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
    budgetCents: dollarsToCents(d.budget),
    notes: d.notes,
    visibility: d.visibility,
  };
}

/** App-level mirror of trip_hub_and_privacy_isolation. */
function visibleTrip(hubId: string, userId: string) {
  return { hubId, OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };
}

export async function createTrip(fd: FormData) {
  const { user, hub } = await requireHub();
  const data = tripData(parse(z.object(tripFields), fd));
  const trip = await withHub(user.id, (tx) =>
    tx.trip.create({ data: { ...data, hubId: hub.id, createdById: user.id } }),
  );
  revalidateContent("/trips");
  redirect(`/trips/${trip.id}`);
}

export async function updateTrip(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = parse(z.object({ ...tripFields, id: z.string().cuid() }), fd);
  await withHub(user.id, async (tx) => {
    const trip = await tx.trip.findFirst({ where: { id: d.id, ...visibleTrip(hub.id, user.id) } });
    if (!trip) throw new Error("Trip not found");
    await tx.trip.update({ where: { id: d.id }, data: tripData(d) });
  });
  revalidateContent("/trips", `/trips/${d.id}`);
  redirect(`/trips/${d.id}`);
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
  kind: z.enum(["BOOK", "TODO", "PACK", "ACTIVITY", "SAVE", "STOP"]).default("TODO"),
  title: z.string().trim().min(1, "What needs doing?").max(160),
  cost: z.preprocess(emptyToNull, z.string().nullable()),
  date: z.preprocess(emptyToNull, day.nullable()),
  endDate: z.preprocess(emptyToNull, day.nullable()),
  assignedToId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
});

export async function addTripItem(tripId: string, fd: FormData) {
  const { user, hub } = await requireHub();
  z.string().cuid().parse(tripId);
  const d = parse(itemSchema, fd);
  if ((d.kind === "ACTIVITY" || d.kind === "SAVE" || d.kind === "STOP") && !d.date) {
    throw new Error("Pick a date");
  }
  if (d.kind === "STOP" && (!d.endDate || d.endDate <= d.date!)) {
    throw new Error("A stop needs the day you leave, after the day you arrive.");
  }
  await withHub(user.id, async (tx) => {
    const trip = await tx.trip.findFirst({
      where: { id: tripId, ...visibleTrip(hub.id, user.id) },
      select: { hubId: true },
    });
    if (!trip) throw new Error("Trip not found");
    await tx.tripItem.create({
      data: {
        tripId,
        hubId: trip.hubId,
        kind: d.kind,
        title: d.title,
        costCents: dollarsToCents(d.cost),
        date: fromDateInput(d.date),
        endDate: d.kind === "STOP" ? fromDateInput(d.endDate) : null,
        assignedToId: d.assignedToId,
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
export async function addTripSavings(tripId: string, fd: FormData) {
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
export async function importTripPlan(tripId: string, fd: FormData) {
  const { user, hub } = await requireHub();
  z.string().cuid().parse(tripId);

  let plan: TripPlan;
  const key = String(fd.get("template") ?? "");
  const json = String(fd.get("json") ?? "").trim();
  if (key && TRIP_TEMPLATES[key]) {
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
      select: { hubId: true, budgetCents: true },
    });
    if (!trip) throw new Error("Trip not found");
    await tx.tripItem.createMany({ data: planRows(plan, tripId, trip.hubId) });
    if (trip.budgetCents == null && plan.budget != null) {
      await tx.trip.update({ where: { id: tripId }, data: { budgetCents: Math.round(plan.budget * 100) } });
    }
  });
  revalidateContent(`/trips/${tripId}`, "/trips");
}
