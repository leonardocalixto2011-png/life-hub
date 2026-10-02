import { z } from "zod";

import { thailand2027 } from "./trip-plans/thailand-2027";

/**
 * A whole trip plan as data: where you sleep, what to do each day, what to
 * book and when, the savings schedule and the packing list. Used by the
 * "Import a plan" form on a trip page (pasted JSON or a built-in template)
 * and by prisma/seed-trip-thailand.ts, so both write exactly the same rows.
 *
 * No "@/" imports here: the seed script loads this file through tsx, which
 * doesn't resolve the app's path alias.
 */

/**
 * True only for a YYYY-MM-DD that names a real calendar day. `new Date(y, m, d)`
 * silently rolls 2027-02-30 over to March 2, so the round trip is the check.
 */
export function isRealDay(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const dt = new Date(y, mo - 1, d, 12);
  return dt.getFullYear() === y && dt.getMonth() === mo - 1 && dt.getDate() === d;
}

const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "Dates are YYYY-MM-DD")
  .refine(isRealDay, "That date doesn't exist");

const ITEM_KINDS = ["BOOK", "TODO", "PACK", "ACTIVITY", "SAVE", "BUDGET", "TIP"] as const;

/** The trip's own fields as a plan sets them. */
const tripFields = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().max(160).optional(),
  start: day.optional(),
  end: day.optional(),
  budget: z.number().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional(),
});

export const tripPlanSchema = z.object({
  budget: z.number().nonnegative().optional(),
  /** What the trip itself should say (title, dates, notes) under this plan. */
  trip: tripFields.omit({ budget: true }).optional(),
  /**
   * The trip as an earlier version of this plan set it. A trip field is only
   * moved to the new value while it still holds the old one (or nothing), so
   * a date or title a person changed by hand is never overwritten.
   */
  previous: tripFields.optional(),
  stops: z
    .array(
      z
        .object({ name: z.string().trim().min(1).max(80), from: day, to: day })
        // Same rule as adding a stop by hand: you leave after you arrive.
        // Zero-padded YYYY-MM-DD compares correctly as a string.
        .refine((s) => s.to > s.from, "A stop's \"to\" date must be after its \"from\" date"),
    )
    .max(30)
    .default([]),
  items: z
    .array(
      z.object({
        kind: z.enum(ITEM_KINDS),
        title: z.string().trim().min(1).max(160),
        date: day.optional(),
        cost: z.number().nonnegative().optional(),
        note: z.string().trim().max(800).optional(),
      }),
    )
    .max(300)
    .default([]),
  /**
   * Rows an earlier version of this plan had and this one drops. Importing
   * deletes them from the trip, unless someone ticked them: a ticked deposit
   * or booking is a record of something that happened.
   */
  retired: z
    .array(z.object({ kind: z.enum(["STOP", ...ITEM_KINDS]), title: z.string().trim().min(1).max(160) }))
    .max(300)
    .optional(),
  /** Dated reminders the plan keeps as hub deadlines, matched on title + day. */
  deadlines: z
    .array(
      z.object({
        title: z.string().trim().min(1).max(160),
        due: day,
        notes: z.string().trim().max(800).optional(),
        remind: z.array(z.number().int().min(0).max(60)).max(6).optional(),
      }),
    )
    .max(30)
    .optional(),
  /** Deadlines an earlier version of the plan created; removed unless done. */
  retiredDeadlines: z
    .array(z.object({ title: z.string().trim().min(1).max(160), due: day }))
    .max(30)
    .optional(),
});

export type TripPlan = z.infer<typeof tripPlanSchema>;

/** Built-in plans offered on the import form, by key. */
export const TRIP_TEMPLATES: Record<string, { label: string; plan: TripPlan }> = {
  "thailand-2027": { label: "Thailand, one week, March 2027", plan: thailand2027 },
};

/** Date-only values are stored at local noon, like the rest of the app. */
export function noon(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

const cents = (dollars: number | undefined) => (dollars == null ? null : Math.round(dollars * 100));

/** The TripItem rows a plan becomes, ready for createMany. */
export function planRows(plan: TripPlan, tripId: string, hubId: string) {
  // A bulk insert stamps every row with the same createdAt, and the page
  // orders same-day items by createdAt, so a day's activities would come out
  // shuffled. One millisecond apart keeps them in the order the plan lists.
  const base = Date.now();
  const rows = [
    ...plan.stops.map((s) => ({
      tripId,
      hubId,
      kind: "STOP" as const,
      title: s.name,
      date: noon(s.from),
      endDate: noon(s.to),
    })),
    ...plan.items.map((i) => ({
      tripId,
      hubId,
      kind: i.kind,
      title: i.title,
      date: i.date ? noon(i.date) : null,
      costCents: cents(i.cost),
      note: i.note ?? null,
    })),
  ];
  return rows.map((r, n) => ({ ...r, createdAt: new Date(base + n) }));
}

/**
 * Only the rows of a plan the trip doesn't have yet, matched on kind + title,
 * so importing the same plan twice adds nothing, and importing a newer version
 * of a plan (new tips, a budget breakdown) adds just what's new. Existing rows
 * are left as they are: done ticks, edits and assignments survive.
 */
export function missingPlanRows(
  plan: TripPlan,
  tripId: string,
  hubId: string,
  existing: { kind: string; title: string }[],
) {
  const have = new Set(existing.map((e) => `${e.kind}|${e.title.trim().toLowerCase()}`));
  return planRows(plan, tripId, hubId).filter((r) => !have.has(`${r.kind}|${r.title.trim().toLowerCase()}`));
}

/** The note a plan gives an item, looked up the same way missingPlanRows matches. */
export function planNote(plan: TripPlan, kind: string, title: string): string | null {
  const t = title.trim().toLowerCase();
  return plan.items.find((i) => i.kind === kind && i.title.trim().toLowerCase() === t)?.note ?? null;
}

const itemKey = (kind: string, title: string) => `${kind}|${title.trim().toLowerCase()}`;

/**
 * Ids of the trip's rows an updated plan drops: listed in `retired`, not
 * ticked, and not also in the plan itself under the same kind + title.
 */
export function retiredRowIds(
  plan: TripPlan,
  existing: { id: string; kind: string; title: string; done: boolean }[],
): string[] {
  const keep = new Set([
    ...plan.stops.map((s) => itemKey("STOP", s.name)),
    ...plan.items.map((i) => itemKey(i.kind, i.title)),
  ]);
  const drop = new Set((plan.retired ?? []).map((r) => itemKey(r.kind, r.title)).filter((k) => !keep.has(k)));
  return existing.filter((e) => !e.done && drop.has(itemKey(e.kind, e.title))).map((e) => e.id);
}

/** A stored date-only value as YYYY-MM-DD, in the app's pinned zone. */
export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type TripRow = {
  title: string;
  destination: string | null;
  startDate: Date;
  endDate: Date;
  budgetCents: number | null;
  notes: string | null;
};

/**
 * The trip fields a plan moves: each one only while the trip still holds what
 * the previous version of the plan set, or nothing. A budget the plan gives
 * with no previous version is filled only when the trip has none, as before.
 */
export function planTripPatch(plan: TripPlan, trip: TripRow) {
  const prev = plan.previous ?? {};
  const next = plan.trip ?? {};
  const patch: Partial<TripRow> = {};
  const same = (a: string | null | undefined, b: string | undefined) => (a ?? "").trim() === (b ?? "").trim();

  if (next.title && next.title !== trip.title && same(trip.title, prev.title)) patch.title = next.title;
  if (next.destination != null && !same(trip.destination, next.destination)) {
    if (!trip.destination || same(trip.destination, prev.destination)) patch.destination = next.destination;
  }
  if (next.notes != null && !same(trip.notes, next.notes)) {
    if (!trip.notes || same(trip.notes, prev.notes)) patch.notes = next.notes;
  }
  if (next.start && next.start !== ymd(trip.startDate) && ymd(trip.startDate) === prev.start) {
    patch.startDate = noon(next.start);
  }
  if (next.end && next.end !== ymd(trip.endDate) && ymd(trip.endDate) === prev.end) {
    patch.endDate = noon(next.end);
  }
  if (plan.budget != null) {
    const want = cents(plan.budget);
    const was = cents(prev.budget);
    if (trip.budgetCents !== want && (trip.budgetCents == null || trip.budgetCents === was)) patch.budgetCents = want;
  }
  // Never leave the trip ending before it starts.
  const start = patch.startDate ?? trip.startDate;
  const end = patch.endDate ?? trip.endDate;
  if (end < start) {
    delete patch.startDate;
    delete patch.endDate;
  }
  return patch;
}

/** title + day, the key a plan's deadlines are matched on. */
export const deadlineKey = (title: string, due: string) => `${title.trim().toLowerCase()}|${due}`;
