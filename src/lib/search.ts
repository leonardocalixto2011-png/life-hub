import { subDays } from "date-fns";

import type { HubTx } from "@/lib/hub-context";
import type { Lang } from "@/lib/i18n";
import { fmt, fmtShort, translate } from "@/lib/i18n";
import { money } from "@/lib/format";
import { ownFavorites } from "@/lib/favorites";
import { visibleTo } from "@/lib/visibility";

/**
 * Search across one hub, for one viewer.
 *
 * Scoping is the same two layers as every list query: RLS (the caller runs
 * this inside `withHub`), and an app-level mirror in each `where` below —
 * `hubId` everywhere, plus `visibleTo(userId)` (SHARED, or created by the
 * viewer) on the four models that have a privacy flag: Task, Deadline, Event
 * and Trip/SpecialDate. Trip items inherit their trip's visibility, exactly
 * like the `trip_item_via_visible_trip` policy. Favourites are the viewer's
 * own. Subscriptions and budget entries are hub-wide, as on their pages.
 * Debts are deliberately not searched: they are person-owned with per-hub
 * sharing, and a search box is not the place to re-derive that.
 *
 * Matching is done here, in JS, over a bounded set of candidates per type —
 * not in SQL — because it has to ignore accents ("epicerie" finds
 * "Épicerie") and Postgres can only do that with the `unaccent` extension,
 * which this database does not have and this feature should not add. A hub is
 * a household: a few hundred rows per type is the realistic ceiling, and the
 * caps keep a pathological one bounded.
 */

export type SearchType =
  | "task"
  | "deadline"
  | "event"
  | "subscription"
  | "budget"
  | "trip"
  | "tripItem"
  | "date"
  | "favorite";

export type SearchHit = {
  id: string;
  type: SearchType;
  title: string;
  /** One line under the title: a date, an amount, where it belongs. */
  meta: string | null;
  href: string;
  /** Struck through in the list: a finished task or deadline. */
  done?: boolean;
};

export type SearchGroup = {
  type: SearchType;
  hits: SearchHit[];
  /** How many matched in all; `hits` holds at most PER_GROUP of them. */
  total: number;
  /** The list page, when there is one and there is more to see. */
  more: string | null;
};

export type SearchScope = {
  hubId: string;
  userId: string;
  currency: string;
  locale: string | undefined;
  lang: Lang;
};

export const PER_GROUP = 5;
export const MAX_QUERY = 80;

/** Most rows read per type for one search. */
const CAP = 400;
/** How far back events are searched. */
const EVENT_PAST_DAYS = 90;

/** Lower-case, accents stripped, ligatures opened: the form both sides are compared in. */
export function fold(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/œ/g, "oe")
    .replace(/æ/g, "ae")
    .replace(/[’`]/g, "'");
}

/** The query as folded words; every one of them must appear. */
export function tokens(query: string): string[] {
  return fold(query).split(/\s+/).filter(Boolean).slice(0, 6);
}

function matcher(words: string[]) {
  return (...fields: (string | null | undefined)[]): boolean => {
    const hay = fold(fields.filter(Boolean).join(" \n "));
    return words.every((w) => hay.includes(w));
  };
}

const join = (...parts: (string | null | undefined | false)[]) => parts.filter(Boolean).join(" · ") || null;

const LIST: Record<SearchType, string | null> = {
  task: "/tasks?show=all",
  deadline: "/deadlines",
  event: "/calendar",
  subscription: "/subscriptions",
  budget: "/budget",
  trip: "/trips",
  tripItem: "/trips",
  date: "/calendar/dates",
  favorite: "/favorites",
};

function group(type: SearchType, hits: SearchHit[]): SearchGroup | null {
  if (hits.length === 0) return null;
  return {
    type,
    hits: hits.slice(0, PER_GROUP),
    total: hits.length,
    more: hits.length > PER_GROUP ? LIST[type] : null,
  };
}

const monthParam = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

export async function searchHub(tx: HubTx, scope: SearchScope, query: string): Promise<SearchGroup[]> {
  const words = tokens(query.slice(0, MAX_QUERY));
  if (words.length === 0) return [];
  const has = matcher(words);

  const { hubId, userId, currency, locale, lang } = scope;
  const visible = visibleTo(userId);
  const cash = (cents: number | null | undefined) => (cents != null ? money(cents, currency, locale) : null);
  const day = (d: Date | null | undefined) => (d ? fmtShort(d, lang) : null);
  const now = new Date();

  const [tasks, deadlines, events, subs, entries, trips, items, dates, favorites] = await Promise.all([
    tx.task.findMany({
      where: { hubId, ...visible },
      select: { id: true, title: true, notes: true, status: true, dueDate: true, amountCents: true },
      // Open first, then whatever was touched last.
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }],
      take: CAP,
    }),
    tx.deadline.findMany({
      where: { hubId, ...visible },
      select: { id: true, title: true, notes: true, dueDate: true, doneAt: true },
      orderBy: [{ doneAt: { sort: "asc", nulls: "first" } }, { dueDate: "desc" }],
      take: CAP,
    }),
    tx.event.findMany({
      // Plans only: shifts live on /schedule and have no page of their own.
      where: { hubId, kind: "EVENT", ...visible, startAt: { gte: subDays(now, EVENT_PAST_DAYS) } },
      select: { id: true, title: true, notes: true, location: true, startAt: true },
      orderBy: { startAt: "asc" },
      take: CAP,
    }),
    tx.subscription.findMany({
      where: { hubId },
      select: { id: true, name: true, notes: true, costCents: true, status: true },
      orderBy: [{ status: "asc" }, { name: "asc" }],
      take: CAP,
    }),
    tx.budgetEntry.findMany({
      where: { hubId },
      select: { id: true, category: true, description: true, amountCents: true, type: true, date: true },
      orderBy: { date: "desc" },
      take: CAP,
    }),
    tx.trip.findMany({
      where: { hubId, ...visible },
      select: { id: true, title: true, destination: true, notes: true, startDate: true, endDate: true },
      orderBy: { startDate: "desc" },
      take: CAP,
    }),
    tx.tripItem.findMany({
      where: { hubId, trip: { hubId, ...visible } },
      select: {
        id: true,
        title: true,
        note: true,
        costCents: true,
        date: true,
        tripId: true,
        trip: { select: { title: true } },
      },
      orderBy: { createdAt: "desc" },
      take: CAP,
    }),
    tx.specialDate.findMany({
      where: { hubId, ...visible },
      select: { id: true, title: true, notes: true, month: true, day: true },
      orderBy: [{ month: "asc" }, { day: "asc" }],
      take: CAP,
    }),
    tx.quickFavorite.findMany({
      where: ownFavorites(hubId, userId),
      select: { id: true, label: true, category: true, amountCents: true },
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
      take: CAP,
    }),
  ]);

  // Upcoming events nearest-first, then the past ones most-recent-first.
  const upcoming = events.filter((e) => e.startAt >= now);
  const past = events.filter((e) => e.startAt < now).reverse();

  const groups: (SearchGroup | null)[] = [
    group(
      "task",
      tasks
        .filter((x) => has(x.title, x.notes))
        .map((x) => ({
          id: x.id,
          type: "task" as const,
          title: x.title,
          meta: join(day(x.dueDate), cash(x.amountCents)),
          href: `/tasks/${x.id}`,
          done: x.status === "DONE",
        })),
    ),
    group(
      "event",
      [...upcoming, ...past]
        .filter((x) => has(x.title, x.notes, x.location))
        .map((x) => ({
          id: x.id,
          type: "event" as const,
          title: x.title,
          meta: join(day(x.startAt), x.location),
          href: `/calendar/${x.id}`,
        })),
    ),
    group(
      "deadline",
      deadlines
        .filter((x) => has(x.title, x.notes))
        .map((x) => ({
          id: x.id,
          type: "deadline" as const,
          title: x.title,
          meta: day(x.dueDate),
          href: `/deadlines/${x.id}`,
          done: x.doneAt != null,
        })),
    ),
    group(
      "budget",
      entries
        .filter((x) => has(x.category, x.description))
        .map((x) => ({
          id: x.id,
          type: "budget" as const,
          title: x.description ? `${x.category} · ${x.description}` : x.category,
          meta: join(`${x.type === "INCOME" ? "+" : "−"}${cash(x.amountCents)}`, day(x.date)),
          href: `/budget?m=${monthParam(x.date)}`,
        })),
    ),
    group(
      "subscription",
      subs
        .filter((x) => has(x.name, x.notes))
        .map((x) => ({
          id: x.id,
          type: "subscription" as const,
          title: x.name,
          meta: join(cash(x.costCents), x.status === "CANCELLED" && translate(lang, "cancelled")),
          href: `/subscriptions/${x.id}`,
        })),
    ),
    group(
      "trip",
      trips
        .filter((x) => has(x.title, x.destination, x.notes))
        .map((x) => ({
          id: x.id,
          type: "trip" as const,
          title: x.title,
          meta: join(x.destination, `${day(x.startDate)} – ${day(x.endDate)}`),
          href: `/trips/${x.id}`,
        })),
    ),
    group(
      "tripItem",
      items
        .filter((x) => has(x.title, x.note))
        .map((x) => ({
          id: x.id,
          type: "tripItem" as const,
          title: x.title,
          meta: join(x.trip.title, day(x.date), cash(x.costCents)),
          href: `/trips/${x.tripId}`,
        })),
    ),
    group(
      "date",
      dates
        .filter((x) => has(x.title, x.notes))
        .map((x) => ({
          id: x.id,
          type: "date" as const,
          title: x.title,
          // A day and a month with no year: 2000 is a leap year, so Feb 29 formats.
          meta: fmt(new Date(2000, x.month - 1, x.day, 12), lang === "fr" ? "d MMMM" : "MMMM d", lang),
          href: "/calendar/dates",
        })),
    ),
    group(
      "favorite",
      favorites
        .filter((x) => has(x.label, x.category))
        .map((x) => ({
          id: x.id,
          type: "favorite" as const,
          title: x.label,
          meta: join(cash(x.amountCents), x.category),
          href: "/favorites",
        })),
    ),
  ];

  return groups.filter((g): g is SearchGroup => g !== null);
}

/**
 * What the sheet shows before anything is typed: the handful of things most
 * likely to be wanted — open tasks touched last, and what is coming up.
 * Same scoping as `searchHub`.
 */
export async function recentItems(tx: HubTx, scope: SearchScope): Promise<SearchHit[]> {
  const { hubId, userId, currency, locale, lang } = scope;
  const visible = visibleTo(userId);
  const now = new Date();
  const day = (d: Date | null | undefined) => (d ? fmtShort(d, lang) : null);

  const [tasks, events, deadlines] = await Promise.all([
    tx.task.findMany({
      where: { hubId, status: "OPEN", ...visible },
      select: { id: true, title: true, dueDate: true, amountCents: true },
      orderBy: { updatedAt: "desc" },
      take: 4,
    }),
    tx.event.findMany({
      where: { hubId, kind: "EVENT", ...visible, startAt: { gte: now } },
      select: { id: true, title: true, location: true, startAt: true },
      orderBy: { startAt: "asc" },
      take: 2,
    }),
    tx.deadline.findMany({
      where: { hubId, doneAt: null, ...visible },
      select: { id: true, title: true, dueDate: true },
      orderBy: { dueDate: "asc" },
      take: 2,
    }),
  ]);

  return [
    ...tasks.map((x) => ({
      id: x.id,
      type: "task" as const,
      title: x.title,
      meta: join(day(x.dueDate), x.amountCents != null ? money(x.amountCents, currency, locale) : null),
      href: `/tasks/${x.id}`,
    })),
    ...events.map((x) => ({
      id: x.id,
      type: "event" as const,
      title: x.title,
      meta: join(day(x.startAt), x.location),
      href: `/calendar/${x.id}`,
    })),
    ...deadlines.map((x) => ({
      id: x.id,
      type: "deadline" as const,
      title: x.title,
      meta: day(x.dueDate),
      href: `/deadlines/${x.id}`,
    })),
  ];
}
