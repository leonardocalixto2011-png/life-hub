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

/** The day a recurrence is anchored to: the stored anchor, else the date's own day. */
export function anchorOf(d: Date, stored: number | null | undefined): number {
  return stored ?? d.getDate();
}
