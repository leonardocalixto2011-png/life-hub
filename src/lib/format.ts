import {
  differenceInCalendarDays,
  format,
  isThisYear,
  isToday,
  isTomorrow,
  isYesterday,
} from "date-fns";

import { DEFAULT_LOCALE } from "@/lib/locales";
import { fmt, fmtShort, fmtTime, translate, type Lang } from "@/lib/i18n";

/**
 * Formats an amount. `locale` controls grouping and symbol placement — the
 * same 1234.56 EUR is "€1,234.56" in en-CA and "1 234,56 €" in fr-FR — so a
 * hardcoded en-CA misformats every non-Canadian user even when the currency
 * code is right. Falls back to en-CA rather than the runtime default, since
 * the server's locale is an accident of hosting, not a user preference.
 */
/**
 * Validated against what the runtime actually supports, NOT by try/catch.
 * `new Intl.NumberFormat("not-a-locale")` does not throw — it silently falls
 * back to the *system* locale, so on Vercel an unrecognised stored value would
 * render whatever country the container happens to be configured for. Only a
 * structurally malformed tag throws. supportedLocalesOf catches both.
 */
function safeLocale(locale: string): string {
  try {
    return Intl.NumberFormat.supportedLocalesOf(locale).length > 0 ? locale : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function money(cents: number, currency = "CAD", locale: string = DEFAULT_LOCALE): string {
  return new Intl.NumberFormat(safeLocale(locale), {
    style: "currency",
    currency,
  }).format(cents / 100);
}

/** Short, human due-date label relative to now. */
export function dueLabel(date: Date | null | undefined, lang: Lang = "en"): string {
  if (!date) return "";
  if (isToday(date)) return translate(lang, "Today");
  if (isTomorrow(date)) return translate(lang, "Tomorrow");
  if (isYesterday(date)) return translate(lang, "Yesterday");

  const days = differenceInCalendarDays(date, new Date());
  if (days > 1 && days < 7) return fmt(date, "EEEE", lang); // Thursday
  if (days < 0 && days > -7) return translate(lang, "{n}d ago", { n: Math.abs(days) });
  return isThisYear(date)
    ? fmtShort(date, lang)
    : fmt(date, lang === "fr" ? "d MMM yyyy" : "MMM d, yyyy", lang);
}

export function isOverdue(date: Date | null | undefined): boolean {
  if (!date) return false;
  return differenceInCalendarDays(date, new Date()) < 0;
}

/** Days until `date`, as a signed integer (negative = past). */
export function daysUntil(date: Date): number {
  return differenceInCalendarDays(date, new Date());
}

/** "Today" / "in 5 days" / "3 days ago" */
export function countdownLabel(date: Date, lang: Lang = "en"): string {
  const d = daysUntil(date);
  if (d === 0) return translate(lang, "Today");
  if (d === 1) return translate(lang, "Tomorrow");
  if (d === -1) return translate(lang, "Yesterday");
  if (d < 0) return translate(lang, "{n} days ago", { n: Math.abs(d) });
  return translate(lang, "in {n} days", { n: d });
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

/** `<input type="datetime-local">` value from a Date (local wall-clock). */
export function toDateTimeInput(date: Date | null | undefined): string {
  if (!date) return "";
  return format(date, "yyyy-MM-dd'T'HH:mm");
}

export function fromDateTimeInput(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "2:30 PM" or "2:30 PM – 4:00 PM" (same day) or with a date when multi-day. */
export function eventTimeRange(startAt: Date, endAt: Date, lang: Lang = "en"): string {
  const sameDay =
    startAt.getFullYear() === endAt.getFullYear() &&
    startAt.getMonth() === endAt.getMonth() &&
    startAt.getDate() === endAt.getDate();
  if (sameDay) return `${fmtTime(startAt, lang)} – ${fmtTime(endAt, lang)}`;
  return `${fmtShort(startAt, lang)}, ${fmtTime(startAt, lang)} – ${fmtShort(endAt, lang)}, ${fmtTime(endAt, lang)}`;
}

export function initials(name: string | null | undefined, email?: string | null): string {
  const src = name?.trim() || email?.split("@")[0] || "?";
  const parts = src.split(/[\s._-]+/).filter(Boolean);
  return (parts[0]?.[0] ?? "?").concat(parts[1]?.[0] ?? "").toUpperCase();
}
