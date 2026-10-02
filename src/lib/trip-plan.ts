import { z } from "zod";

import { thailand2027 } from "./trip-plans/thailand-2027";
import { thailand2027Fr } from "./trip-plans/thailand-2027.fr";

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

/**
 * Optional French for a plan's text, beside the English it translates. The
 * English title stays the row's identity: importing in French writes the
 * French title, and matching (here and on every later import) accepts either,
 * so the same plan imported in both languages never doubles up.
 */
const frTitle = z.object({ title: z.string().trim().min(1).max(160).optional() });

/** The trip's own fields as a plan sets them. */
const tripFields = z.object({
  title: z.string().trim().min(1).max(120).optional(),
  destination: z.string().trim().max(160).optional(),
  start: day.optional(),
  end: day.optional(),
  budget: z.number().nonnegative().optional(),
  notes: z.string().trim().max(2000).optional(),
  fr: z
    .object({
      title: z.string().trim().min(1).max(120).optional(),
      destination: z.string().trim().max(160).optional(),
      notes: z.string().trim().max(2000).optional(),
    })
    .optional(),
});

export const tripPlanSchema = z.object({
  budget: z.number().nonnegative().optional(),
  /** What the trip itself should say (title, dates, notes) under this plan. */
  trip: tripFields.omit({ budget: true }).optional(),
  /**
   * The trip as earlier versions of this plan set it. A trip field is only
   * moved to the new value while it still holds one of those (or nothing), so
   * a date or title a person changed by hand is never overwritten.
   */
  previous: z.array(tripFields).max(10).optional(),
  stops: z
    .array(
      z
        .object({
          name: z.string().trim().min(1).max(80),
          from: day,
          to: day,
          fr: z.object({ name: z.string().trim().min(1).max(80) }).optional(),
        })
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
        fr: frTitle.extend({ note: z.string().trim().max(800).optional() }).optional(),
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
    .array(
      z.object({
        kind: z.enum(["STOP", ...ITEM_KINDS]),
        title: z.string().trim().min(1).max(160),
        fr: frTitle.optional(),
      }),
    )
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
        fr: frTitle.extend({ notes: z.string().trim().max(800).optional() }).optional(),
      }),
    )
    .max(30)
    .optional(),
  /** Deadlines an earlier version of the plan created; removed unless done. */
  retiredDeadlines: z
    .array(z.object({ title: z.string().trim().min(1).max(160), due: day, fr: frTitle.optional() }))
    .max(30)
    .optional(),
});

export type TripPlan = z.infer<typeof tripPlanSchema>;

/** Built-in plans offered on the import form, by key. */
export const TRIP_TEMPLATES: Record<string, { label: string; labelFr?: string; plan: TripPlan }> = {
  "thailand-2027": { label: "Thailand, one week, March 2027", labelFr: thailand2027Fr.label, plan: thailand2027 },
};

export type PlanLang = "en" | "fr";

type Alt = {
  /** The same text in the other language — a second key to match rows on. */
  alt?: string;
};

/**
 * A plan made ready for one trip and one person: text in their language, and
 * every date moved by `shiftDays` so the plan starts when the trip does. A
 * plain `TripPlan` is a valid ResolvedPlan (English, nothing moved), which is
 * what the seed script passes.
 */
export type ResolvedPlan = Omit<TripPlan, "stops" | "items" | "retired" | "deadlines" | "retiredDeadlines"> & {
  shiftDays?: number;
  stops: (TripPlan["stops"][number] & Alt)[];
  items: (TripPlan["items"][number] & Alt & { altNote?: string })[];
  retired?: (NonNullable<TripPlan["retired"]>[number] & Alt)[];
  /** `altDue` is the day as the plan wrote it, before any shift. */
  deadlines?: (NonNullable<TripPlan["deadlines"]>[number] & Alt & { altDue?: string })[];
  retiredDeadlines?: (NonNullable<TripPlan["retiredDeadlines"]>[number] & Alt & { altDue?: string })[];
};

/** Date-only values are stored at local noon, like the rest of the app. */
export function noon(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d, 12, 0, 0);
}

const cents = (dollars: number | undefined) => (dollars == null ? null : Math.round(dollars * 100));

/** Whole calendar days from one YYYY-MM-DD to another. Noon to noon, so a
 *  clock change in between can't make it 23 or 25 hours and round wrong. */
function dayDiff(from: string, to: string): number {
  return Math.round((noon(to).getTime() - noon(from).getTime()) / 86_400_000);
}

function shiftDay(value: string, days: number): string {
  if (days === 0) return value;
  const d = noon(value);
  d.setDate(d.getDate() + days);
  return ymd(d);
}

/**
 * How many days a plan has to move to start when the trip does. A template
 * written for March 11–20 imported into a trip on March 1–8 used to keep its
 * own dates, so the whole itinerary landed outside the trip and the day-by-day
 * view showed a week of "nothing planned".
 *
 * A plan that states its own start is measured from that. One that doesn't
 * (pasted JSON, usually written for this very trip) is measured from its
 * first stop or activity, and only moved when that day falls outside the trip:
 * a plan whose first activity is on day 2 must stay where it is.
 */
export function planShiftDays(plan: TripPlan, trip: { startDate: Date; endDate: Date }): number {
  const start = ymd(trip.startDate);
  if (plan.trip?.start) return dayDiff(plan.trip.start, start);
  const days = [
    ...plan.stops.map((s) => s.from),
    ...plan.items.filter((i) => i.kind === "ACTIVITY" && i.date).map((i) => i.date!),
  ].sort();
  if (days.length === 0) return 0;
  if (days[0] >= start && days[0] <= ymd(trip.endDate)) return 0;
  return dayDiff(days[0], start);
}

/** The day a plan starts on, as planShiftDays measures it (null: no dated days). */
export function planStartDay(plan: TripPlan): string | null {
  if (plan.trip?.start) return plan.trip.start;
  const days = [
    ...plan.stops.map((s) => s.from),
    ...plan.items.filter((i) => i.kind === "ACTIVITY" && i.date).map((i) => i.date!),
  ].sort();
  return days[0] ?? null;
}

const norm = (s: string) => s.trim().toLowerCase();

/**
 * The plan in one language with every date moved by `shiftDays`: stops,
 * activities, bookings, deposits and reminders all move together, so "book
 * the flights 100 days before" stays 100 days before. The trip's own start
 * and end are left as written — planTripPatch reads those to decide whether
 * the trip follows the plan, which is a different question.
 *
 * Nothing here touches rows already on the trip: an import never moves an
 * existing row, in time or in language.
 */
export function resolvePlan(plan: TripPlan, opts: { lang?: PlanLang; shiftDays?: number } = {}): ResolvedPlan {
  const fr = opts.lang === "fr";
  const by = opts.shiftDays ?? 0;
  const day = (d: string) => shiftDay(d, by);
  const other = (shown: string, alt: string | undefined) => (alt && norm(alt) !== norm(shown) ? alt : undefined);
  const t = plan.trip;
  return {
    ...plan,
    shiftDays: by,
    trip: t && {
      ...t,
      title: fr ? (t.fr?.title ?? t.title) : t.title,
      destination: fr ? (t.fr?.destination ?? t.destination) : t.destination,
      notes: fr ? (t.fr?.notes ?? t.notes) : t.notes,
    },
    stops: plan.stops.map((s) => {
      const name = fr ? (s.fr?.name ?? s.name) : s.name;
      return { ...s, name, from: day(s.from), to: day(s.to), alt: other(name, fr ? s.name : s.fr?.name) };
    }),
    items: plan.items.map((i) => {
      const title = fr ? (i.fr?.title ?? i.title) : i.title;
      return {
        ...i,
        title,
        note: fr ? (i.fr?.note ?? i.note) : i.note,
        date: i.date ? day(i.date) : undefined,
        alt: other(title, fr ? i.title : i.fr?.title),
        altNote: fr ? i.note : i.fr?.note,
      };
    }),
    retired: plan.retired?.map((r) => ({ ...r, alt: other(r.title, r.fr?.title) })),
    deadlines: plan.deadlines?.map((d) => {
      const title = fr ? (d.fr?.title ?? d.title) : d.title;
      return {
        ...d,
        title,
        notes: fr ? (d.fr?.notes ?? d.notes) : d.notes,
        due: day(d.due),
        alt: other(title, fr ? d.title : d.fr?.title),
        altDue: by !== 0 ? d.due : undefined,
      };
    }),
    retiredDeadlines: plan.retiredDeadlines?.map((d) => ({
      ...d,
      due: day(d.due),
      alt: other(d.title, d.fr?.title),
      altDue: by !== 0 ? d.due : undefined,
    })),
  };
}

/** The TripItem rows a plan becomes, ready for createMany. */
export function planRows(plan: ResolvedPlan, tripId: string, hubId: string) {
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
  plan: ResolvedPlan,
  tripId: string,
  hubId: string,
  existing: { kind: string; title: string }[],
) {
  const have = new Set(existing.map((e) => itemKey(e.kind, e.title)));
  // Same order planRows builds its rows in: stops, then items. A row counts
  // as present under either language's title.
  const alts = [...plan.stops.map((s) => s.alt), ...plan.items.map((i) => i.alt)];
  return planRows(plan, tripId, hubId).filter((r, n) => {
    const alt = alts[n];
    return !have.has(itemKey(r.kind, r.title)) && !(alt && have.has(itemKey(r.kind, alt)));
  });
}

/**
 * The note a plan gives an item, looked up the same way missingPlanRows
 * matches — and in the language of the row's own title, so a row imported in
 * English doesn't pick up a French note under it (or the reverse).
 */
export function planNote(plan: ResolvedPlan, kind: string, title: string): string | null {
  const t = norm(title);
  for (const i of plan.items) {
    if (i.kind !== kind) continue;
    if (norm(i.title) === t) return i.note ?? null;
    if (i.alt && norm(i.alt) === t) return i.altNote ?? null;
  }
  return null;
}

function itemKey(kind: string, title: string) {
  return `${kind}|${norm(title)}`;
}

/**
 * Ids of the trip's rows an updated plan drops: listed in `retired`, not
 * ticked, and not also in the plan itself under the same kind + title.
 */
export function retiredRowIds(
  plan: ResolvedPlan,
  existing: { id: string; kind: string; title: string; done: boolean }[],
): string[] {
  const both = (kind: string, title: string, alt?: string) =>
    alt ? [itemKey(kind, title), itemKey(kind, alt)] : [itemKey(kind, title)];
  const keep = new Set([
    ...plan.stops.flatMap((s) => both("STOP", s.name, s.alt)),
    ...plan.items.flatMap((i) => both(i.kind, i.title, i.alt)),
  ]);
  const drop = new Set(
    (plan.retired ?? []).flatMap((r) => both(r.kind, r.title, r.alt)).filter((k) => !keep.has(k)),
  );
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
export function planTripPatch(plan: TripPlan | ResolvedPlan, trip: TripRow) {
  const prev = plan.previous ?? [];
  const next = plan.trip ?? {};
  const patch: Partial<TripRow> = {};
  const same = (a: string | null | undefined, b: string | undefined) => (a ?? "").trim() === (b ?? "").trim();
  // An earlier version counts in either language it was imported in.
  const wasText = (key: "title" | "destination" | "notes", value: string | null) =>
    prev.some((p) => (p[key] != null && same(value, p[key])) || (p.fr?.[key] != null && same(value, p.fr[key])));
  const wasDay = (key: "start" | "end", value: Date) => prev.some((p) => p[key] === ymd(value));

  if (next.title && next.title !== trip.title && wasText("title", trip.title)) patch.title = next.title;
  if (next.destination != null && !same(trip.destination, next.destination)) {
    if (!trip.destination || wasText("destination", trip.destination)) patch.destination = next.destination;
  }
  if (next.notes != null && !same(trip.notes, next.notes)) {
    if (!trip.notes || wasText("notes", trip.notes)) patch.notes = next.notes;
  }
  if (next.start && next.start !== ymd(trip.startDate) && wasDay("start", trip.startDate)) {
    patch.startDate = noon(next.start);
  }
  if (next.end && next.end !== ymd(trip.endDate) && wasDay("end", trip.endDate)) {
    patch.endDate = noon(next.end);
  }
  if (plan.budget != null) {
    const want = cents(plan.budget);
    const was = prev.some((p) => p.budget != null && cents(p.budget) === trip.budgetCents);
    if (trip.budgetCents !== want && (trip.budgetCents == null || was)) patch.budgetCents = want;
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

/**
 * Every key a plan's reminder might be stored under: either language's title,
 * on the shifted day or the day the plan wrote. The first is where this import
 * would put it; the rest find one an earlier import (another language, or
 * before the trip's dates moved) already made.
 */
export function deadlineKeys(d: { title: string; due: string; alt?: string; altDue?: string }): string[] {
  const titles = d.alt ? [d.title, d.alt] : [d.title];
  const days = d.altDue ? [d.due, d.altDue] : [d.due];
  return days.flatMap((due) => titles.map((t) => deadlineKey(t, due)));
}

/**
 * For a trip made before deadlines carried a `tripId`: the reminders a
 * built-in plan would have created for it, so deleting the trip can still
 * take them along. Deliberately narrow — only when the trip is recognisably
 * that template (its title is one the plan has used, or at least five of its
 * rows are the plan's own), and only exact title + day pairs the plan (or an
 * earlier version of it) lists. Returns null when the trip matches no
 * template.
 */
export function legacyPlanDeadlines(trip: { title: string; items: { kind: string; title: string }[] }): {
  tripTitles: string[];
  titles: string[];
  keys: Set<string>;
} | null {
  const have = new Set(trip.items.map((i) => itemKey(i.kind, i.title)));
  const tripTitles = new Set<string>();
  const titles = new Set<string>();
  const keys = new Set<string>();
  for (const { plan } of Object.values(TRIP_TEMPLATES)) {
    const names = [plan.trip?.title, plan.trip?.fr?.title, ...(plan.previous ?? []).flatMap((p) => [p.title, p.fr?.title])]
      .filter((n): n is string => !!n);
    const rows = [
      ...plan.stops.flatMap((s) => [itemKey("STOP", s.name), ...(s.fr ? [itemKey("STOP", s.fr.name)] : [])]),
      ...plan.items.flatMap((i) => [itemKey(i.kind, i.title), ...(i.fr?.title ? [itemKey(i.kind, i.fr.title)] : [])]),
      ...(plan.retired ?? []).map((r) => itemKey(r.kind, r.title)),
    ];
    const shared = rows.filter((k) => have.has(k)).length;
    if (!names.some((n) => norm(n) === norm(trip.title)) && shared < 5) continue;
    for (const n of names) tripTitles.add(n);
    for (const d of [...(plan.deadlines ?? []), ...(plan.retiredDeadlines ?? [])]) {
      for (const t of [d.title, d.fr?.title]) {
        if (!t) continue;
        titles.add(t);
        keys.add(deadlineKey(t, d.due));
      }
    }
  }
  return keys.size > 0 ? { tripTitles: [...tripTitles], titles: [...titles], keys } : null;
}
