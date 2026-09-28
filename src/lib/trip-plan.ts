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

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Dates are YYYY-MM-DD");

export const tripPlanSchema = z.object({
  budget: z.number().nonnegative().optional(),
  stops: z
    .array(z.object({ name: z.string().trim().min(1).max(80), from: day, to: day }))
    .max(30)
    .default([]),
  items: z
    .array(
      z.object({
        kind: z.enum(["BOOK", "TODO", "PACK", "ACTIVITY", "SAVE", "BUDGET", "TIP"]),
        title: z.string().trim().min(1).max(160),
        date: day.optional(),
        cost: z.number().nonnegative().optional(),
        note: z.string().trim().max(800).optional(),
      }),
    )
    .max(300)
    .default([]),
});

export type TripPlan = z.infer<typeof tripPlanSchema>;

/** Built-in plans offered on the import form, by key. */
export const TRIP_TEMPLATES: Record<string, { label: string; plan: TripPlan }> = {
  "thailand-2027": { label: "Thailand + Vietnam, March 2027", plan: thailand2027 },
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
