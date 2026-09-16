/**
 * Holidays and special days — computed, never stored.
 *
 * A couple's calendar should know it's Fête des Mères without anyone typing it
 * in, and know it again next year. Stored rows would have to be seeded per hub
 * and per year and kept in sync; a pure function of the date cannot drift.
 * Québec / Canada public holidays, the days people actually buy flowers for,
 * the four seasons, and Haitian national days (this household's culture).
 *
 * Dates are built with the local-date constructor, the same way the rest of the
 * app builds date-only values, so "in 3 days" compares cleanly with startOfDay.
 * Shown only in hubs whose owner leaves `Hub.showOccasions` on.
 */

export type OccasionKind = "holiday" | "love" | "family" | "season" | "culture" | "fun";

export type Occasion = {
  /** Stable per occurrence, e.g. "valentine-2027" — used as a React key. */
  key: string;
  /** In the viewer's language — see `occasionsBetween`'s `lang`. */
  title: string;
  date: Date;
  emoji: string;
  kind: OccasionKind;
};

/** Western (Gregorian) Easter Sunday — the anonymous Gregorian algorithm. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

/** The nth `weekday` (0 = Sunday) of a 0-based `month`. */
function nthWeekday(year: number, month: number, weekday: number, n: number): Date {
  const first = new Date(year, month, 1);
  const offset = (weekday - first.getDay() + 7) % 7;
  return new Date(year, month, 1 + offset + (n - 1) * 7);
}

function shift(d: Date, days: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
}

const fixed = (month: number, day: number) => (y: number) => new Date(y, month - 1, day);

type Def = {
  key: string;
  title: string;
  fr: string;
  emoji: string;
  kind: OccasionKind;
  date: (year: number) => Date;
};

const DEFS: Def[] = [
  { key: "new-year", title: "New Year's Day", fr: "Jour de l'An", emoji: "🎆", kind: "holiday", date: fixed(1, 1) },
  { key: "haiti-independence", title: "Haitian Independence Day", fr: "Indépendance d'Haïti", emoji: "🇭🇹", kind: "culture", date: fixed(1, 1) },
  { key: "haiti-ancestors", title: "Ancestors' Day (Haiti)", fr: "Jour des Aïeux (Haïti)", emoji: "🇭🇹", kind: "culture", date: fixed(1, 2) },
  { key: "valentine", title: "Valentine's Day", fr: "Saint-Valentin", emoji: "❤️", kind: "love", date: fixed(2, 14) },
  { key: "womens-day", title: "International Women's Day", fr: "Journée internationale des femmes", emoji: "💐", kind: "love", date: fixed(3, 8) },
  { key: "st-patrick", title: "St. Patrick's Day", fr: "Saint-Patrick", emoji: "☘️", kind: "fun", date: fixed(3, 17) },
  { key: "spring", title: "First day of spring", fr: "Premier jour du printemps", emoji: "🌸", kind: "season", date: fixed(3, 20) },
  { key: "good-friday", title: "Good Friday", fr: "Vendredi saint", emoji: "✝️", kind: "holiday", date: (y) => shift(easterSunday(y), -2) },
  { key: "easter", title: "Easter", fr: "Pâques", emoji: "🐣", kind: "family", date: easterSunday },
  { key: "easter-monday", title: "Easter Monday", fr: "Lundi de Pâques", emoji: "🐣", kind: "holiday", date: (y) => shift(easterSunday(y), 1) },
  { key: "mothers-day", title: "Mother's Day", fr: "Fête des Mères", emoji: "💐", kind: "family", date: (y) => nthWeekday(y, 4, 0, 2) },
  { key: "haiti-flag", title: "Haitian Flag Day", fr: "Fête du Drapeau haïtien", emoji: "🇭🇹", kind: "culture", date: fixed(5, 18) },
  {
    // The Monday on or before May 24 (same rule as Victoria Day).
    key: "patriotes",
    title: "National Patriots' Day", fr: "Journée nationale des patriotes",
    emoji: "🍁",
    kind: "holiday",
    date: (y) => {
      const may24 = new Date(y, 4, 24);
      return shift(may24, -((may24.getDay() + 6) % 7));
    },
  },
  { key: "fathers-day", title: "Father's Day", fr: "Fête des Pères", emoji: "👔", kind: "family", date: (y) => nthWeekday(y, 5, 0, 3) },
  { key: "summer", title: "First day of summer", fr: "Premier jour de l'été", emoji: "☀️", kind: "season", date: fixed(6, 21) },
  { key: "fete-nationale", title: "Fête nationale du Québec", fr: "Fête nationale du Québec", emoji: "⚜️", kind: "holiday", date: fixed(6, 24) },
  { key: "canada-day", title: "Canada Day", fr: "Fête du Canada", emoji: "🇨🇦", kind: "holiday", date: fixed(7, 1) },
  { key: "girlfriend-day", title: "Girlfriend Day", fr: "Girlfriend Day", emoji: "💕", kind: "love", date: fixed(8, 1) },
  { key: "labour-day", title: "Labour Day", fr: "Fête du Travail", emoji: "🛠️", kind: "holiday", date: (y) => nthWeekday(y, 8, 1, 1) },
  { key: "fall", title: "First day of fall", fr: "Premier jour de l'automne", emoji: "🍂", kind: "season", date: fixed(9, 22) },
  { key: "boyfriend-day", title: "Boyfriend Day", fr: "Boyfriend Day", emoji: "💙", kind: "love", date: fixed(10, 3) },
  { key: "thanksgiving", title: "Thanksgiving", fr: "Action de grâce", emoji: "🦃", kind: "family", date: (y) => nthWeekday(y, 9, 1, 2) },
  { key: "halloween", title: "Halloween", fr: "Halloween", emoji: "🎃", kind: "fun", date: fixed(10, 31) },
  { key: "remembrance", title: "Remembrance Day", fr: "Jour du Souvenir", emoji: "🌺", kind: "holiday", date: fixed(11, 11) },
  { key: "mens-day", title: "International Men's Day", fr: "Journée internationale des hommes", emoji: "🧔", kind: "love", date: fixed(11, 19) },
  { key: "black-friday", title: "Black Friday", fr: "Black Friday", emoji: "🛍️", kind: "fun", date: (y) => shift(nthWeekday(y, 10, 4, 4), 1) },
  { key: "winter", title: "First day of winter", fr: "Premier jour de l'hiver", emoji: "❄️", kind: "season", date: fixed(12, 21) },
  { key: "christmas-eve", title: "Christmas Eve", fr: "Réveillon de Noël", emoji: "🎄", kind: "family", date: fixed(12, 24) },
  { key: "christmas", title: "Christmas", fr: "Noël", emoji: "🎄", kind: "holiday", date: fixed(12, 25) },
  { key: "boxing-day", title: "Boxing Day", fr: "Lendemain de Noël", emoji: "🎁", kind: "holiday", date: fixed(12, 26) },
  { key: "new-years-eve", title: "New Year's Eve", fr: "Réveillon du Nouvel An", emoji: "🥂", kind: "fun", date: fixed(12, 31) },
];

/** Every occasion from the start of `from`'s day through `to`, in date order. */
export function occasionsBetween(from: Date, to: Date, lang: "en" | "fr" = "en"): Occasion[] {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const out: Occasion[] = [];
  for (let y = start.getFullYear(); y <= to.getFullYear(); y++) {
    for (const def of DEFS) {
      const date = def.date(y);
      if (date >= start && date <= to) {
        out.push({
          key: `${def.key}-${y}`,
          title: lang === "fr" ? def.fr : def.title,
          date,
          emoji: def.emoji,
          kind: def.kind,
        });
      }
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

/** Days worth planning for (a gift, a reservation) rather than just noticing. */
export function isPlanAhead(kind: OccasionKind): boolean {
  return kind === "love" || kind === "family";
}
