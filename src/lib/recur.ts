import { addMonths, getDaysInMonth, setDate } from "date-fns";

/**
 * `addMonths` clamps to the target month's length and forgets where it came
 * from, so a bill due on the 31st drifts: Jan 31 → Feb 28 → Mar 28 → … forever.
 * This steps `n` months and lands on `anchorDay`, clamped only for that month,
 * so the next step recovers: Jan 31 → Feb 28 → Mar 31. Keeps the time of day.
 */
export function addMonthsOnDay(d: Date, n: number, anchorDay: number): Date {
  const month = addMonths(setDate(d, 1), n);
  return setDate(month, Math.min(anchorDay, getDaysInMonth(month)));
}

/**
 * True when two dates fall on the same calendar day (local — the process TZ is
 * pinned in instrumentation.ts). Edit forms re-submit the stored date on every
 * save, so an anchor must only be reset when the day actually changed: a
 * rolled Feb 28 re-saved unchanged keeps anchor 31 and still returns to Mar 31.
 */
export function sameDay(a: Date | null | undefined, b: Date | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return (
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()
  );
}

/** The day a recurrence is anchored to: the stored anchor, else the date's own day. */
export function anchorOf(d: Date, stored: number | null | undefined): number {
  return stored ?? d.getDate();
}
