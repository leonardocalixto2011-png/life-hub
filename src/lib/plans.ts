import { addDays, differenceInMinutes, format, startOfDay } from "date-fns";

import type { HubTx } from "@/lib/hub-context";
import { isPlanAhead, occasionsBetween } from "@/lib/occasions";
import { translate, type Lang } from "@/lib/i18n";

/**
 * Everything dated that a household plans for but that isn't a task:
 * computed holidays, yearly special dates, trips, and work schedules.
 *
 * Every query here mirrors the RLS privacy clause in app code
 * (`visibility = SHARED OR createdById = viewer`), per this project's standing
 * rule — the local dev Postgres enforces no policy at all.
 */

function privacy(userId: string) {
  return { OR: [{ visibility: "SHARED" as const }, { createdById: userId }] };
}

// --------------------------------------------------------------------------
// Special dates
// --------------------------------------------------------------------------

/**
 * The next date, today or later, that a month/day falls on. Feb 29 lands on
 * Feb 28 in a non-leap year rather than disappearing for three years.
 */
export function nextOccurrence(month: number, day: number, from = new Date()): Date {
  const today = startOfDay(from);
  for (const y of [today.getFullYear(), today.getFullYear() + 1]) {
    const lastDay = new Date(y, month, 0).getDate();
    const d = new Date(y, month - 1, Math.min(day, lastDay));
    if (d >= today) return d;
  }
  return new Date(today.getFullYear() + 1, month - 1, day);
}

export const SPECIAL_EMOJI = { BIRTHDAY: "🎂", ANNIVERSARY: "💍", OTHER: "⭐" } as const;

/** "30 ans" for a birthday, "5 ans" for an anniversary — only when the year is known. */
export function specialMeta(
  s: { kind: string; year: number | null },
  on: Date,
  lang: Lang = "en",
): string | null {
  if (!s.year) return null;
  const n = on.getFullYear() - s.year;
  if (n <= 0) return null;
  if (s.kind === "BIRTHDAY") return translate(lang, "turns {n}", { n });
  if (s.kind === "ANNIVERSARY") return translate(lang, n === 1 ? "1 year together" : "{n} years together", { n });
  return translate(lang, n === 1 ? "1 year" : "{n} years", { n });
}

export function listSpecialDates(tx: HubTx, hubId: string, userId: string) {
  return tx.specialDate.findMany({
    where: { hubId, ...privacy(userId) },
    orderBy: [{ month: "asc" }, { day: "asc" }],
  });
}

export type SpecialDateRow = Awaited<ReturnType<typeof listSpecialDates>>[number];

// --------------------------------------------------------------------------
// Merged plan items — shared by /calendar, /agenda and /today so they agree
// --------------------------------------------------------------------------

export type PlanItem = {
  kind: "occasion" | "special" | "trip";
  key: string;
  title: string;
  date: Date;
  emoji: string;
  /** Where tapping goes; occasions have no page of their own. */
  href: string | null;
  meta: string | null;
  /** Worth a "plan something" nudge — a gift, a reservation. */
  planAhead: boolean;
};

export async function planItemsBetween(
  tx: HubTx,
  hub: { id: string; showOccasions: boolean },
  userId: string,
  from: Date,
  to: Date,
  lang: Lang = "en",
): Promise<PlanItem[]> {
  const start = startOfDay(from);

  const [specials, trips] = await Promise.all([
    tx.specialDate.findMany({ where: { hubId: hub.id, ...privacy(userId) } }),
    tx.trip.findMany({
      where: {
        hubId: hub.id,
        ...privacy(userId),
        endDate: { gte: start },
        startDate: { lte: to },
      },
      orderBy: { startDate: "asc" },
    }),
  ]);

  const items: PlanItem[] = [];

  if (hub.showOccasions) {
    for (const o of occasionsBetween(start, to, lang)) {
      items.push({
        kind: "occasion",
        key: o.key,
        title: o.title,
        date: o.date,
        emoji: o.emoji,
        href: null,
        meta: null,
        planAhead: isPlanAhead(o.kind),
      });
    }
  }

  for (const s of specials) {
    const date = nextOccurrence(s.month, s.day, start);
    if (date > to) continue;
    items.push({
      kind: "special",
      key: `special-${s.id}`,
      title: s.title,
      date,
      emoji: SPECIAL_EMOJI[s.kind],
      href: "/calendar/dates",
      meta: specialMeta(s, date, lang),
      planAhead: true,
    });
  }

  for (const t of trips) {
    const ongoing = t.startDate < start;
    items.push({
      kind: "trip",
      key: `trip-${t.id}`,
      title: t.title,
      date: ongoing ? start : t.startDate,
      emoji: "✈️",
      href: `/trips/${t.id}`,
      meta: ongoing ? translate(lang, "in progress") : t.destination,
      planAhead: false,
    });
  }

  return items.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** `/calendar?title=…&date=…` — opens the new-event form pre-filled. */
export function planHref(p: PlanItem): string | null {
  if (p.href && p.kind !== "special") return p.href;
  if (!p.planAhead) return p.href;
  const q = new URLSearchParams({ title: p.title, date: format(p.date, "yyyy-MM-dd") });
  return `/calendar?${q.toString()}`;
}

// --------------------------------------------------------------------------
// Work schedules
// --------------------------------------------------------------------------

export function listShifts(tx: HubTx, hubId: string, userId: string, from: Date, to: Date) {
  return tx.event.findMany({
    where: {
      hubId,
      kind: "SHIFT",
      startAt: { lt: to },
      endAt: { gt: from },
      OR: [{ visibility: "SHARED" }, { createdById: userId }],
    },
    select: {
      id: true,
      title: true,
      startAt: true,
      endAt: true,
      personId: true,
      recurrenceGroupId: true,
    },
    orderBy: { startAt: "asc" },
  });
}

export type ShiftRow = Awaited<ReturnType<typeof listShifts>>[number];

export type Window = { start: Date; end: Date };

/**
 * Gaps in a day when nobody in `busy` is working — the "when are we both
 * free?" answer. The day is bounded to waking hours (7:00–23:00 by default)
 * because a free 2 a.m. is not a plan, and gaps under an hour are dropped.
 */
export function freeWindows(
  day: Date,
  busy: { startAt: Date; endAt: Date }[],
  opts: { fromHour?: number; toHour?: number; minMinutes?: number } = {},
): Window[] {
  const { fromHour = 7, toHour = 23, minMinutes = 60 } = opts;
  const dayStart = startOfDay(day);
  const open = new Date(dayStart.getTime() + fromHour * 3600e3);
  const close = new Date(dayStart.getTime() + toHour * 3600e3);

  const clipped = busy
    .map((b) => ({
      start: b.startAt < open ? open : b.startAt,
      end: b.endAt > close ? close : b.endAt,
    }))
    .filter((b) => b.end > b.start)
    .sort((a, b) => a.start.getTime() - b.start.getTime());

  const out: Window[] = [];
  let cursor = open;
  for (const b of clipped) {
    if (b.start > cursor && differenceInMinutes(b.start, cursor) >= minMinutes) {
      out.push({ start: cursor, end: b.start });
    }
    if (b.end > cursor) cursor = b.end;
  }
  if (close > cursor && differenceInMinutes(close, cursor) >= minMinutes) {
    out.push({ start: cursor, end: close });
  }
  return out;
}

/** Monday of the week containing `d`. */
export function mondayOf(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}
