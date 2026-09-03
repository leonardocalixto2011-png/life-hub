import {
  differenceInCalendarDays,
  format,
  isThisYear,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";

export function money(cents: number, currency = "CAD"): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Short, human due-date label relative to now. */
export function dueLabel(date: Date | null | undefined): string {
  if (!date) return "";
  if (isToday(date)) return "Today";
  if (isTomorrow(date)) return "Tomorrow";
  if (isYesterday(date)) return "Yesterday";

  const days = differenceInCalendarDays(date, new Date());
  if (days > 1 && days < 7) return format(date, "EEEE"); // Thursday
  if (days < 0 && days > -7) return `${Math.abs(days)}d ago`;
  return format(date, isThisYear(date) ? "MMM d" : "MMM d, yyyy");
}

export function isOverdue(date: Date | null | undefined): boolean {
  if (!date) return false;
  return differenceInCalendarDays(date, new Date()) < 0;
}

/** `<input type="date">` value (local calendar day). */
export function toDateInput(date: Date | null | undefined): string {
  if (!date) return "";
  return format(date, "yyyy-MM-dd");
}

/** Parse a `<input type="date">` value into a Date at local noon (avoids TZ slips). */
export function fromDateInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d, 12, 0, 0, 0);
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const src = name?.trim() || email?.split("@")[0] || "?";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}
