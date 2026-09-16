import { format as formatDate, type Locale } from "date-fns";
import { enCA, frCA } from "date-fns/locale";

import { FR } from "@/lib/i18n-fr";

/**
 * Interface language. English is the source: every string in the code is the
 * English text, and `t()` looks it up in the French dictionary when the person
 * has chosen a French locale. That keeps the code readable, makes a missing
 * translation fall back to something sensible rather than a key, and means
 * adding a language is one dictionary file.
 *
 * Derived from the locale the person already picks under Appearance —
 * "Français (Canada)" both formats "1 234,56 $" and speaks French. One
 * setting, because nobody wants French dates with an English interface.
 */
export type Lang = "en" | "fr";

export function langOf(locale: string | null | undefined): Lang {
  return locale?.toLowerCase().startsWith("fr") ? "fr" : "en";
}

export type Vars = Record<string, string | number>;

function interpolate(text: string, vars?: Vars): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

export function translate(lang: Lang, key: string, vars?: Vars): string {
  const text = lang === "fr" ? (FR[key] ?? key) : key;
  return interpolate(text, vars);
}

export type T = (key: string, vars?: Vars) => string;

export function makeT(lang: Lang): T {
  return (key, vars) => translate(lang, key, vars);
}

// --------------------------------------------------------------------------
// Dates — day names and month names follow the language too.
// --------------------------------------------------------------------------

const DATE_LOCALE: Record<Lang, Locale> = { en: enCA, fr: frCA };

export function fmt(date: Date, pattern: string, lang: Lang): string {
  return formatDate(date, pattern, { locale: DATE_LOCALE[lang] });
}

/** "Tuesday, Sep 15" / "mardi 15 sept." */
export function fmtDay(date: Date, lang: Lang): string {
  return fmt(date, lang === "fr" ? "EEEE d MMM" : "EEEE, MMM d", lang);
}

/** "Sep 15" / "15 sept." */
export function fmtShort(date: Date, lang: Lang): string {
  return fmt(date, lang === "fr" ? "d MMM" : "MMM d", lang);
}

/** "2:30 PM" / "14 h 30" */
export function fmtTime(date: Date, lang: Lang): string {
  return lang === "fr" ? fmt(date, "H 'h' mm", lang) : fmt(date, "h:mm a", lang);
}

export function fmtMonth(date: Date, lang: Lang): string {
  const s = fmt(date, "MMMM yyyy", lang);
  return lang === "fr" ? s : s;
}
