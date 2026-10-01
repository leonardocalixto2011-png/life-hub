import type { Lang } from "@/lib/i18n";

/**
 * First-run welcome (/welcome). Plain module — imported by server components
 * (Today's shortcut order) and the client stepper alike, so it must never
 * become a "use client" file (see the BUDGET_CATEGORIES gotcha in CLAUDE.md).
 */

/** What someone can say they want to track. Stored on `User.interests`. */
export const INTERESTS = [
  { key: "tasks", label: "Tasks", href: "/tasks" },
  { key: "budget", label: "Budget", href: "/budget" },
  { key: "subscriptions", label: "Subscriptions", href: "/subscriptions" },
  { key: "debts", label: "Debts", href: "/debts" },
  { key: "trips", label: "Trips", href: "/trips" },
  { key: "schedules", label: "Schedules", href: "/schedule" },
  { key: "dates", label: "Special dates", href: "/calendar/dates" },
] as const;

export type InterestKey = (typeof INTERESTS)[number]["key"];

export function isInterest(v: unknown): v is InterestKey {
  return typeof v === "string" && INTERESTS.some((i) => i.key === v);
}

/**
 * The language to greet someone in before they have chosen one: French when
 * their browser's first French-or-English preference is French. Québec phones
 * set to "fr-CA, en-CA" land in French; "en-US, fr" lands in English.
 */
export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  if (!header) return "en";
  for (const part of header.split(",")) {
    const tag = part.split(";")[0].trim().toLowerCase();
    if (tag.startsWith("fr")) return "fr";
    if (tag.startsWith("en")) return "en";
  }
  return "en";
}

/** First name for the hub suggestion: the profile name, else the address. */
export function firstNameOf(name: string | null, email: string): string {
  const fromName = name?.trim().split(/\s+/)[0];
  if (fromName) return fromName;
  const local = email.split("@")[0].split(/[._+-]/)[0];
  return local ? local.charAt(0).toUpperCase() + local.slice(1) : "";
}

/** "Maison de Lucky" / "Lucky's home". */
export function defaultHubName(first: string, lang: Lang): string {
  if (!first) return lang === "fr" ? "Ma maison" : "My home";
  return lang === "fr" ? `Maison de ${first}` : `${first}'s home`;
}

/** The placeholder names signup gives a hub — worth replacing with a real suggestion. */
export function isPlaceholderHubName(name: string): boolean {
  return /'s hub$/i.test(name) || /^my hub$/i.test(name);
}

/** Tappable example sentences on the last step, in the person's language. */
export const FIRST_ADD_EXAMPLES: Record<Lang, string[]> = {
  fr: ["Payer Hydro 84 $ vendredi", "Souper chez maman dimanche 18 h", "Acheter du lait"],
  en: ["Pay Hydro $84 Friday", "Dinner at Mom's Sunday 6 pm", "Buy milk"],
};
