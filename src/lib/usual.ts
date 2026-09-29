import { endOfMonth, getDaysInMonth, startOfMonth, subMonths } from "date-fns";

import type { HubTx } from "@/lib/hub-context";

/**
 * "Paiements habituels" — money that leaves every month without anyone
 * having modelled it as a subscription or a debt: rent paid by e-transfer, the
 * daycare, a savings deposit. Detected from the Budget log itself, so it
 * costs the person nothing to set up; confirmed on /today in one tap.
 *
 * The detector is a pure function over plain rows (unit-testable with
 * fabricated data); `usualPaymentsFor` is the scoped query that feeds it.
 */

export type UsualRow = {
  category: string;
  amountCents: number;
  date: Date;
  ventureId: string | null;
};

export type UsualPattern = {
  /** Stable per pattern: normalised category + typical amount. Used for the
   *  per-month "not this month" dismissal in localStorage. */
  key: string;
  /** Display casing, from the most recent matching entry. */
  category: string;
  amountCents: number;
  /** Median day-of-month, clamped to the current month's length. */
  expectedDay: number;
  ventureId: string | null;
  /** Months (of the last three) the payment was seen in. */
  months: number;
  /** Already an entry like it this month. */
  loggedThisMonth: boolean;
  /** Expected day is before today and it isn't logged. */
  late: boolean;
};

export type UsualExclusions = {
  /** Active subscription names and the viewer's debt names in this hub. */
  names?: string[];
  /** BUDGET favourites: already one tap away from the quick-add row. */
  favorites?: { label: string; amountCents: number }[];
};

/** How close two amounts must be to count as "the same payment". */
export const AMOUNT_TOLERANCE = 0.1;
/** Show a usual payment this many days ahead of its expected day. */
export const LEAD_DAYS = 3;

export const normCategory = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();

function similar(a: number, b: number): boolean {
  return Math.abs(a - b) <= AMOUNT_TOLERANCE * Math.max(a, b);
}

function median(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

const monthIndex = (d: Date) => d.getFullYear() * 12 + d.getMonth();

/**
 * Every usual payment found in `rows` (EXPENSE entries only — the caller
 * filters), relative to `now`. A pattern is a category (case-insensitive)
 * whose amount stays within ±10% in at least two of the three previous
 * calendar months. The current month never counts toward detection; it only
 * decides `loggedThisMonth`.
 */
export function detectUsualPayments(
  rows: UsualRow[],
  now: Date,
  exclude: UsualExclusions = {},
): UsualPattern[] {
  const thisMonth = monthIndex(now);
  const excludedNames = new Set((exclude.names ?? []).map(normCategory));
  const favorites = (exclude.favorites ?? []).map((f) => ({
    label: normCategory(f.label),
    amountCents: f.amountCents,
  }));

  const groups = new Map<string, UsualRow[]>();
  for (const r of rows) {
    if (r.amountCents <= 0) continue;
    const key = normCategory(r.category);
    if (!key || excludedNames.has(key)) continue;
    const age = thisMonth - monthIndex(r.date);
    if (age < 0 || age > 3) continue;
    const g = groups.get(key);
    if (g) g.push(r);
    else groups.set(key, [r]);
  }

  const out: UsualPattern[] = [];
  const daysThisMonth = getDaysInMonth(now);

  for (const [key, list] of groups) {
    const past = list.filter((r) => monthIndex(r.date) < thisMonth);
    if (past.length < 2) continue;

    // Try each past amount as the anchor; keep the one seen in the most
    // distinct months (ties: the most recent anchor, so a raise wins).
    let best: { anchor: number; matches: UsualRow[]; months: number; latest: number } | null = null;
    for (const cand of past) {
      const byMonth = new Map<number, UsualRow>();
      for (const r of past) {
        if (!similar(r.amountCents, cand.amountCents)) continue;
        const m = monthIndex(r.date);
        const prev = byMonth.get(m);
        // One entry per month: the one closest to the anchor.
        if (
          !prev ||
          Math.abs(r.amountCents - cand.amountCents) < Math.abs(prev.amountCents - cand.amountCents)
        ) {
          byMonth.set(m, r);
        }
      }
      const months = byMonth.size;
      const latest = cand.date.getTime();
      if (!best || months > best.months || (months === best.months && latest > best.latest)) {
        best = { anchor: cand.amountCents, matches: [...byMonth.values()], months, latest };
      }
    }
    if (!best || best.months < 2) continue;

    const amountCents = median(best.matches.map((r) => r.amountCents));
    if (favorites.some((f) => f.label === key && similar(f.amountCents, amountCents))) continue;

    const newest = best.matches.reduce((a, b) => (b.date > a.date ? b : a));
    const expectedDay = Math.min(median(best.matches.map((r) => r.date.getDate())), daysThisMonth);
    const loggedThisMonth = list.some(
      (r) => monthIndex(r.date) === thisMonth && similar(r.amountCents, amountCents),
    );

    out.push({
      key: `${key}|${amountCents}`,
      category: newest.category.trim(),
      amountCents,
      expectedDay,
      ventureId: newest.ventureId,
      months: best.months,
      loggedThisMonth,
      late: !loggedThisMonth && expectedDay < now.getDate(),
    });
  }

  return out.sort((a, b) => a.expectedDay - b.expectedDay || a.category.localeCompare(b.category));
}

/**
 * The ones to put in front of the person today: not yet logged this month,
 * and expected within the next LEAD_DAYS days or already past.
 */
export function dueUsualPayments(patterns: UsualPattern[], now: Date): UsualPattern[] {
  const today = now.getDate();
  return patterns.filter((p) => !p.loggedThisMonth && p.expectedDay - today <= LEAD_DAYS);
}

/**
 * The scoped query. BudgetEntry is hub-scoped with no per-item privacy, so
 * the app-level mirror of `budget_entry_hub_isolation` is the `hubId`
 * predicate. Exclusions follow /budget's forecast: ACTIVE subscriptions in
 * the hub and the viewer's own debts in the hub (`listMyDebts`' filter).
 * Settle-ups and logged debt payments are never "usual payments".
 */
export async function usualPaymentsFor(
  tx: HubTx,
  hubId: string,
  userId: string,
  now: Date = new Date(),
): Promise<UsualPattern[]> {
  const from = startOfMonth(subMonths(now, 3));
  const to = endOfMonth(now);
  const [rows, subs, debts, favs] = await Promise.all([
    tx.budgetEntry.findMany({
      where: { hubId, type: "EXPENSE", isSettlement: false, date: { gte: from, lte: to } },
      select: { category: true, amountCents: true, date: true, ventureId: true, description: true },
      orderBy: { date: "desc" },
      take: 3000,
    }),
    tx.subscription.findMany({ where: { hubId, status: "ACTIVE" }, select: { name: true } }),
    tx.debt.findMany({
      where: { ownerId: userId, hubId, status: { not: "PAID_OFF" } },
      select: { name: true },
    }),
    tx.quickFavorite.findMany({
      where: { hubId, createdById: userId, kind: "BUDGET", entryType: "EXPENSE", amountCents: { not: null } },
      select: { label: true, category: true, amountCents: true },
    }),
  ]);

  return detectUsualPayments(
    // logDebtPayment writes description "Debt payment"; filtered here rather
    // than in SQL because NOT(description = …) drops NULL descriptions too.
    rows.filter((r) => r.description !== "Debt payment"),
    now,
    {
      names: [...subs.map((s) => s.name), ...debts.map((d) => d.name)],
      favorites: favs.map((f) => ({ label: f.category ?? f.label, amountCents: f.amountCents! })),
    },
  );
}
