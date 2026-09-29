import {
  addWeeks,
  endOfDay,
  endOfMonth,
  startOfDay,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import type { BillingCycle, Prisma } from "@prisma/client";

import { cache } from "react";

import type { HubTx } from "@/lib/hub-context";
import { withHub } from "@/lib/hub-context";
import { prisma } from "@/lib/prisma";
import { money } from "@/lib/format";
import { monthlyCents, perMonth } from "@/lib/money";
import { addMonthsOnDay, anchorOf } from "@/lib/recur";
import { listFavorites } from "@/lib/favorites";

/**
 * Rolls any ACTIVE subscription whose `renewalDate` has already passed
 * forward by whole billing cycles until it's in the future. Nothing else
 * advances it, so without this `/subscriptions` and `/today` drift into
 * showing "renews 6 days ago" and the digest re-sends lapsed renewals
 * forever. Only writes rows that are actually stale; CUSTOM cycles (no
 * defined interval) are left alone.
 */
export async function advanceLapsedRenewals(tx: HubTx, hubId: string): Promise<void> {
  const todayStart = startOfDay(new Date());
  const stale = await tx.subscription.findMany({
    where: {
      hubId,
      status: "ACTIVE",
      billingCycle: { not: "CUSTOM" },
      renewalDate: { lt: todayStart },
    },
    select: { id: true, renewalDate: true, renewalDay: true, billingCycle: true },
  });
  if (stale.length === 0) return;

  const step = (d: Date, cycle: BillingCycle, day: number): Date => {
    if (cycle === "WEEKLY") return addWeeks(d, 1);
    if (cycle === "QUARTERLY") return addMonthsOnDay(d, 3, day);
    // Twelve anchored months, not addYears: that clamps Feb 29 to Feb 28 and
    // forgets, so a leap-day renewal would never come back to the 29th.
    if (cycle === "YEARLY") return addMonthsOnDay(d, 12, day);
    return addMonthsOnDay(d, 1, day); // MONTHLY
  };

  await Promise.all(
    stale.map((s) => {
      const day = anchorOf(s.renewalDate, s.renewalDay);
      let next = s.renewalDate;
      while (next < todayStart) next = step(next, s.billingCycle, day);
      return tx.subscription.update({ where: { id: s.id }, data: { renewalDate: next, renewalDay: day } });
    }),
  );
}

export function listVentures(tx: HubTx, hubId: string) {
  return tx.venture.findMany({
    where: { hubId, archived: false },
    orderBy: { sortOrder: "asc" },
  });
}

/**
 * Active members of a hub — the source for every people picker (assignee,
 * attendees, paid-by, whose schedule).
 *
 * Trusted client on purpose, guarded by the viewer's own membership. The
 * HubMembership RLS policy is self-row-only (documented in the multihub_rls
 * migration), so under `app_user` this query returned exactly one row — the
 * viewer — and in production every picker offered nobody else. Local dev
 * never showed it, since its Postgres enforces no policy. The membership
 * check below is the boundary that policy would otherwise have been.
 */
export async function listMembers(viewerId: string, hubId: string) {
  const viewer = await prisma.hubMembership.findFirst({
    where: { hubId, userId: viewerId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!viewer) return [];
  return prisma.hubMembership
    .findMany({
      where: { hubId, status: "ACTIVE" },
      include: { user: { select: { id: true, name: true, email: true, role: true } } },
      orderBy: [{ role: "asc" }, { joinedAt: "asc" }],
    })
    .then((rows) =>
      rows.map((m) => ({ ...m.user, hubRole: m.role, joinedAt: m.joinedAt })),
    );
}

/**
 * Ventures + members + the review-inbox badge — the three things the app
 * shell needs and that almost every page also needs for its own venture and
 * assignee pickers.
 *
 * `cache`d on (userId, hubId) rather than taking a `tx`, because the layout
 * and its page render concurrently in separate transactions: keyed on a `tx`
 * object nothing would ever dedupe, and every route was paying for the same
 * two queries twice per navigation. Primitive keys make the layout's call and
 * the page's call the same call.
 */
export const hubChrome = cache(async (userId: string, hubId: string) => {
  // Members run on the trusted client, so they stay OUT of the transaction:
  // awaiting a second connection while holding one open deadlocks a
  // single-connection pool (the local dev database hung here until the 15s
  // transaction timeout) and needlessly holds a pooled connection in prod.
  const [[ventures, reviewCount, favorites], members] = await Promise.all([
    withHub(userId, (tx) =>
      Promise.all([
        listVentures(tx, hubId),
        pendingReviewCount(tx, userId),
        // Quick-add's chip row, on every page — same transaction, no extra round trip.
        listFavorites(tx, hubId, userId),
      ]),
    ),
    listMembers(userId, hubId),
  ]);
  return { ventures, members, reviewCount, favorites };
});

/**
 * App-level mirror of the RLS privacy clause (`visibility = 'SHARED' OR
 * createdById = current_setting('app.user_id')`) — real defense-in-depth, not
 * just belt-and-suspenders: this project's local dev Postgres silently
 * authenticates any connection string as its superuser (see prisma dev's
 * known trust-all-credentials behavior), so RLS is a no-op there regardless
 * of APP_DATABASE_URL. Without this filter, private items would leak to
 * every hub member in local dev even though they're correctly RLS-blocked in
 * production. Keep this in sync with prisma/migrations/*_multihub_rls.
 */
function visibilityFilter(userId: string): Prisma.TaskWhereInput {
  return { OR: [{ visibility: "SHARED" }, { createdById: userId }] };
}

const taskInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
  assignedTo: { select: { id: true, name: true, email: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

export type TaskFilter = {
  ventureSlug?: string;
  mineUserId?: string; // when set, only tasks assigned to this user
  includeDone?: boolean;
  /** Shopping: open tasks titled "Acheter …" / "Buy …", or with a pinned photo. */
  toBuy?: boolean;
};

export function listTasks(tx: HubTx, hubId: string, userId: string, filter: TaskFilter = {}) {
  return tx.task.findMany({
    where: {
      hubId,
      ...visibilityFilter(userId),
      ...(filter.includeDone ? {} : { status: "OPEN" }),
      ...(filter.ventureSlug ? { venture: { slug: filter.ventureSlug } } : {}),
      ...(filter.mineUserId ? { assignedToId: filter.mineUserId } : {}),
      ...(filter.toBuy
        ? {
            status: "OPEN" as const,
            OR: [
              { title: { startsWith: "Acheter", mode: "insensitive" as const } },
              { title: { startsWith: "Buy ", mode: "insensitive" as const } },
              { imageUrl: { not: null } },
            ],
          }
        : {}),
    },
    include: taskInclude,
    orderBy: [
      { status: "asc" },
      { dueDate: { sort: "asc", nulls: "last" } },
      { priority: "desc" },
      { createdAt: "desc" },
    ],
  });
}

export function getTask(tx: HubTx, hubId: string, userId: string, id: string) {
  return tx.task.findFirst({
    where: { id, hubId, ...visibilityFilter(userId) },
    include: taskInclude,
  });
}

export type TaskWithRefs = Awaited<ReturnType<typeof listTasks>>[number];

/** One-off task titles created 3+ times — candidates to make recurring. */
export async function recurringSuggestions(tx: HubTx, hubId: string, userId: string) {
  const rows = await tx.task.findMany({
    where: { hubId, isRecurring: false, ...visibilityFilter(userId) },
    select: { id: true, title: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });

  const groups = new Map<string, { title: string; count: number; latestId: string }>();
  for (const r of rows) {
    const key = r.title.trim().toLowerCase();
    if (!key) continue;
    const g = groups.get(key);
    if (g) g.count += 1;
    else groups.set(key, { title: r.title.trim(), count: 1, latestId: r.id });
  }

  return [...groups.values()]
    .filter((g) => g.count >= 3)
    .sort((a, b) => b.count - a.count)
    .slice(0, 2);
}

// --------------------------------------------------------------------------
// Deadlines
// --------------------------------------------------------------------------

const deadlineInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
} as const;

function deadlineVisibility(userId: string): Prisma.DeadlineWhereInput {
  return { OR: [{ visibility: "SHARED" }, { createdById: userId }] };
}

export function listDeadlines(
  tx: HubTx,
  hubId: string,
  userId: string,
  opts: { includeDone?: boolean } = {},
) {
  return tx.deadline.findMany({
    where: {
      hubId,
      ...deadlineVisibility(userId),
      ...(opts.includeDone ? {} : { doneAt: null }),
    },
    include: deadlineInclude,
    orderBy: [{ doneAt: "asc" }, { dueDate: "asc" }],
  });
}

export function getDeadline(tx: HubTx, hubId: string, userId: string, id: string) {
  return tx.deadline.findFirst({
    where: { id, hubId, ...deadlineVisibility(userId) },
    include: deadlineInclude,
  });
}

export type DeadlineWithRefs = Awaited<ReturnType<typeof listDeadlines>>[number];

// --------------------------------------------------------------------------
// Subscriptions
// --------------------------------------------------------------------------

const subscriptionInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
  owner: { select: { id: true, name: true, email: true } },
} as const;

export function listSubscriptions(
  tx: HubTx,
  hubId: string,
  opts: { includeCancelled?: boolean } = {},
) {
  return tx.subscription.findMany({
    where: { hubId, ...(opts.includeCancelled ? {} : { status: "ACTIVE" }) },
    include: subscriptionInclude,
    orderBy: [{ status: "asc" }, { renewalDate: "asc" }],
  });
}

export function getSubscription(tx: HubTx, hubId: string, id: string) {
  return tx.subscription.findUnique({ where: { id, hubId }, include: subscriptionInclude });
}

export type SubscriptionWithRefs = Awaited<ReturnType<typeof listSubscriptions>>[number];

// --------------------------------------------------------------------------
// Debts — separate from Subscription: a shrinking balance + rate + payoff
// date, none of which a flat recurring cost can express.
// --------------------------------------------------------------------------

const debtInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
  owner: { select: { id: true, name: true, email: true } },
} as const;

/**
 * The viewer's own debts **in one hub**. Debts used to follow their owner into
 * every hub; the owner wanted them only where they were put (a personal hub),
 * so the hub is now part of the owner's own view. Access is still ownerId +
 * DebtShare at the RLS layer — this is organisation, not a security boundary.
 */
export function listMyDebts(
  tx: HubTx,
  userId: string,
  hubId: string,
  opts: { includeOther?: boolean } = {},
) {
  return tx.debt.findMany({
    where: {
      ownerId: userId,
      hubId,
      ...(opts.includeOther ? {} : { status: { not: "PAID_OFF" } }),
    },
    include: debtInclude,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
}

/**
 * Other people's debts, visible here only because they opened a FULL share
 * into this hub. RLS enforces the same rule independently — this is the
 * app-level mirror the project keeps for every policy (see visibilityFilter).
 */
export function listSharedDebts(tx: HubTx, hubId: string, viewerId: string) {
  return tx.debt.findMany({
    where: {
      ownerId: { not: viewerId },
      owner: {
        debtShares: {
          some: {
            visibility: "FULL",
            // Both halves of the rule, not just the owner's half. Before this,
            // the query asked only "did the owner share FULL into `hubId`?"
            // and trusted the caller to have passed a hub the viewer belongs
            // to. That was true of the one call site, but it made the
            // viewer's own membership something a future caller could forget
            // to establish. Now the function cannot be misused.
            hub: { memberships: { some: { userId: viewerId, status: "ACTIVE" } } },
            hubId,
          },
        },
      },
      status: { not: "PAID_OFF" },
    },
    include: debtInclude,
    orderBy: [{ ownerId: "asc" }, { dueDate: "asc" }],
  });
}

/**
 * Takes `viewerId` and resolves ownership itself rather than returning any row
 * with this id and leaving the ownership test to the page. The detail page did
 * check, correctly — but a lookup that returns other people's financial rows
 * and relies on every caller remembering to compare `ownerId` is the shape
 * IDOR bugs grow in, and RLS is inert on the local dev database, so a mistake
 * would not show up until production.
 */
export function getDebt(tx: HubTx, viewerId: string, id: string) {
  return tx.debt.findFirst({ where: { id, ownerId: viewerId }, include: debtInclude });
}

/** Rows whose owner the ownership migration guessed — the UI asks for confirmation. */
export function listDebtsNeedingOwnerReview(tx: HubTx, userId: string) {
  return tx.debt.findMany({
    where: { ownerId: userId, ownerBackfilled: true },
    select: { id: true, name: true },
  });
}

/** How many of the user's debts live in other hubs — /debts offers to gather them. */
export function countMyDebtsElsewhere(tx: HubTx, userId: string, hubId: string) {
  return tx.debt.count({ where: { ownerId: userId, hubId: { not: hubId } } });
}

export type DebtWithRefs = Awaited<ReturnType<typeof listMyDebts>>[number];

// --------------------------------------------------------------------------
// Budget
// --------------------------------------------------------------------------

const budgetInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

/** `month` is any date inside the target month. */
export async function budgetMonth(tx: HubTx, hubId: string, month: Date, ventureSlug?: string) {
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  const ventureFilter = ventureSlug ? { venture: { slug: ventureSlug } } : {};

  const entries = await tx.budgetEntry.findMany({
    where: { hubId, date: { gte: from, lte: to }, ...ventureFilter },
    include: budgetInclude,
    orderBy: { date: "desc" },
  });

  let income = 0;
  let expense = 0;
  const byCategory = new Map<string, number>();

  for (const e of entries) {
    // A pay-back between members moves money inside the household; counting
    // it as spending would inflate "out" by every settle-up.
    if (e.isSettlement) continue;
    if (e.type === "INCOME") income += e.amountCents;
    else {
      expense += e.amountCents;
      byCategory.set(e.category, (byCategory.get(e.category) ?? 0) + e.amountCents);
    }
  }

  const categories = [...byCategory.entries()]
    .map(([category, cents]) => ({ category, cents }))
    .sort((a, b) => b.cents - a.cents);

  return { from, to, entries, income, expense, net: income - expense, categories };
}

export type BudgetEntryWithRefs = Awaited<
  ReturnType<typeof budgetMonth>
>["entries"][number];

/**
 * Flat expected-monthly totals, not per-day date matching — a
 * Subscription's renewalDate isn't automatically advanced month to month,
 * so pinning "does this land in September" would silently go stale.
 * Summing to a monthly figure instead is always correct regardless of
 * which exact day each one is due.
 */
export async function upcomingSummary(tx: HubTx, hubId: string, userId: string) {
  const [subs, debts, bills, pendingBills] = await Promise.all([
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE" },
      select: { costCents: true, billingCycle: true },
    }),
    tx.debt.findMany({
      // Own debts only. A debt shared into this hub belongs to someone else —
      // folding it into *your* forecast would make the number meaningless.
      // DEFAULT still counts: it is owed, usually on a negotiated payment.
      where: { ownerId: userId, hubId, status: { not: "PAID_OFF" } },
      select: { minimumPaymentCents: true, actualPaymentCents: true, paymentFrequency: true },
    }),
    tx.task.findMany({
      where: {
        hubId,
        status: "OPEN",
        amountCents: { not: null },
        ...visibilityFilter(userId),
      },
      select: { amountCents: true, isRecurring: true, recurrence: true, dueDate: true },
    }),
    tx.reviewItem.count({ where: { hubId, status: "PENDING", category: "BILL_PAYMENT" } }),
  ]);

  const subscriptionsCents = subs.reduce(
    (sum, s) => sum + monthlyCents(s.costCents, s.billingCycle),
    0,
  );
  const debtsCents = debts.reduce(
    (sum, d) => sum + perMonth(d.actualPaymentCents ?? d.minimumPaymentCents ?? 0, d.paymentFrequency),
    0,
  );
  // A one-off bill is not a monthly commitment: five one-off payments spread
  // over two months used to all land in "per month". Recurring bills are
  // normalised to a month; a one-off counts only if it's due by month's end.
  const monthEnd = endOfMonth(new Date());
  const billsCents = bills.reduce((sum, t) => {
    const cents = t.amountCents ?? 0;
    if (t.isRecurring && t.recurrence === "weekly") return sum + Math.round((cents * 52) / 12);
    if (t.isRecurring) return sum + cents;
    return !t.dueDate || t.dueDate <= monthEnd ? sum + cents : sum;
  }, 0);

  return { subscriptionsCents, debtsCents, billsCents, pendingBills };
}

// --------------------------------------------------------------------------
// Events / calendar
// --------------------------------------------------------------------------

const eventInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

function eventVisibility(userId: string): Prisma.EventWhereInput {
  return { OR: [{ visibility: "SHARED" }, { createdById: userId }] };
}

export function listEvents(
  tx: HubTx,
  hubId: string,
  userId: string,
  opts: { from?: Date; to?: Date; kind?: "EVENT" | "SHIFT" } = {},
) {
  const range =
    opts.from || opts.to
      ? {
          startAt: {
            ...(opts.from ? { gte: opts.from } : {}),
            ...(opts.to ? { lte: opts.to } : {}),
          },
        }
      : {};
  return tx.event.findMany({
    where: { hubId, kind: opts.kind ?? "EVENT", ...eventVisibility(userId), ...range },
    include: eventInclude,
    orderBy: { startAt: "asc" },
  });
}

export function getEvent(tx: HubTx, hubId: string, userId: string, id: string) {
  return tx.event.findFirst({
    where: { id, hubId, ...eventVisibility(userId) },
    include: eventInclude,
  });
}

export type EventWithRefs = Awaited<ReturnType<typeof listEvents>>[number];

// --------------------------------------------------------------------------
// Review inbox
// --------------------------------------------------------------------------
//
// ReviewItem.hubId is nullable: mail-connector rows always set it, the older
// manual-forward path does not. Accepted items land in the row's hub when it
// has one, else the accepting user's current hub.

/**
 * App-level mirror of review_item_hub_isolation. These two were the only
 * queries in the codebase relying on RLS *alone* — no hub or user predicate at
 * all — so with APP_DATABASE_URL unset (owner role, policies inert) every user
 * saw every other user's parsed email: subjects, snippets, senders, amounts.
 *
 * ⚠ The `hubId: null` arm is a real cross-tenant leak at any scale beyond a
 * trusted group, and it is deliberate here only because it matches the policy.
 * POST /api/inbound still creates hub-less rows (the pre-multi-hub
 * manual-forward path), and a hub-less row is visible to EVERYONE. Inbound
 * mail needs hub attribution before this app is public — see CLAUDE.md.
 */
function reviewVisibility(userId: string): Prisma.ReviewItemWhereInput {
  return {
    OR: [
      { hubId: null },
      { hub: { memberships: { some: { userId, status: "ACTIVE" } } } },
    ],
  };
}

export function listPendingReviews(tx: HubTx, userId: string) {
  return tx.reviewItem.findMany({
    where: { status: "PENDING", ...reviewVisibility(userId) },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export function pendingReviewCount(tx: HubTx, userId: string) {
  return tx.reviewItem.count({ where: { status: "PENDING", ...reviewVisibility(userId) } });
}

export type ReviewRow = Awaited<ReturnType<typeof listPendingReviews>>[number];

// --------------------------------------------------------------------------
// Merged agenda — tasks + deadlines + events on one timeline
// --------------------------------------------------------------------------

export type AgendaItem = {
  kind: "task" | "deadline" | "event" | "subscription" | "debt";
  id: string;
  title: string;
  at: Date;
  href: string;
  allDay: boolean;
  venture: { name: string; color: string | null } | null;
  meta: string | null;
};

export async function agendaItems(tx: HubTx, hubId: string, userId: string, days = 30) {
  const now = new Date();
  const from = startOfDay(now);
  const to = endOfDay(new Date(now.getTime() + days * 864e5));

  // Same as dashboard(): roll lapsed renewals forward first, otherwise a
  // subscription whose date has passed would be filtered out by `gte: from`
  // below and silently vanish from the agenda.
  await advanceLapsedRenewals(tx, hubId);

  const [tasks, deadlines, events, renewals, debts] = await Promise.all([
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { not: null, lte: to }, ...visibilityFilter(userId) },
      include: { venture: { select: { name: true, color: true } }, assignedTo: { select: { name: true, email: true } } },
      orderBy: { dueDate: "asc" },
    }),
    tx.deadline.findMany({
      where: { hubId, doneAt: null, dueDate: { lte: to }, ...deadlineVisibility(userId) },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { dueDate: "asc" },
    }),
    tx.event.findMany({
      where: { hubId, kind: "EVENT", endAt: { gte: from }, startAt: { lte: to }, ...eventVisibility(userId) },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { startAt: "asc" },
    }),
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE", renewalDate: { gte: from, lte: to } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { renewalDate: "asc" },
    }),
    tx.debt.findMany({
      // Own debts only — the agenda is your timeline, not the hub's.
      where: { ownerId: userId, hubId, status: { not: "PAID_OFF" }, dueDate: { gte: from, lte: to } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  const items: AgendaItem[] = [
    ...tasks.map((t): AgendaItem => ({
      kind: "task",
      id: t.id,
      title: t.title,
      at: t.dueDate!,
      href: `/tasks/${t.id}`,
      allDay: true,
      venture: t.venture,
      meta: t.assignedTo ? (t.assignedTo.name ?? t.assignedTo.email) : null,
    })),
    ...deadlines.map((d): AgendaItem => ({
      kind: "deadline",
      id: d.id,
      title: d.title,
      at: d.dueDate,
      href: `/deadlines/${d.id}`,
      allDay: true,
      venture: d.venture,
      meta: null,
    })),
    ...events.map((e): AgendaItem => ({
      kind: "event",
      id: e.id,
      title: e.title,
      at: e.startAt,
      href: `/calendar/${e.id}`,
      allDay: false,
      venture: e.venture,
      meta: e.location,
    })),
    ...renewals.map((s): AgendaItem => ({
      kind: "subscription",
      id: s.id,
      title: `${s.name} renews`,
      at: s.renewalDate,
      href: `/subscriptions/${s.id}`,
      allDay: true,
      venture: s.venture,
      meta: money(s.costCents, s.currency),
    })),
    ...debts.map((d): AgendaItem => ({
      kind: "debt",
      id: d.id,
      title: `${d.name} payment`,
      at: d.dueDate!,
      href: `/debts/${d.id}`,
      allDay: true,
      venture: d.venture,
      meta:
        d.actualPaymentCents ?? d.minimumPaymentCents
          ? money(d.actualPaymentCents ?? d.minimumPaymentCents!)
          : null,
    })),
  ];

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { now, from, items };
}

// --------------------------------------------------------------------------
// Cross-hub "Mine" view
// --------------------------------------------------------------------------

/** Narrower than AgendaItem: myItemsInHub only ever yields tasks and deadlines
 *  (subscriptions and debts aren't assigned to a person). */
export type MyItem = Omit<AgendaItem, "kind"> & {
  kind: "task" | "deadline";
  hub: { id: string; name: string; color: string };
};

/**
 * Assigned-to-me items across every hub the user belongs to. Unlike the rest
 * of this module, this intentionally loops per hub (via a separate withHub()
 * call per hub from the caller) rather than relying on RLS's natural
 * cross-hub union — see the plan §4. Tasks are filtered to `assignedToId`
 * already being this user, so no separate visibility filter is needed there;
 * deadlines have no assignee concept, so they're scoped by the visibility
 * filter alone (shared items, or ones this user created).
 */
export async function myItemsInHub(
  tx: HubTx,
  hubId: string,
  userId: string,
): Promise<Omit<MyItem, "hub">[]> {
  const to = endOfDay(new Date(Date.now() + 60 * 864e5));

  const [tasks, deadlines] = await Promise.all([
    tx.task.findMany({
      where: { hubId, status: "OPEN", assignedToId: userId, dueDate: { not: null, lte: to } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { dueDate: "asc" },
    }),
    tx.deadline.findMany({
      where: { hubId, doneAt: null, dueDate: { lte: to }, ...deadlineVisibility(userId) },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { dueDate: "asc" },
    }),
  ]);

  return [
    ...tasks.map((t): Omit<MyItem, "hub"> => ({
      kind: "task",
      id: t.id,
      title: t.title,
      at: t.dueDate!,
      href: `/tasks/${t.id}`,
      allDay: true,
      venture: t.venture,
      meta: null,
    })),
    ...deadlines.map((d): Omit<MyItem, "hub"> => ({
      kind: "deadline",
      id: d.id,
      title: d.title,
      at: d.dueDate,
      href: `/deadlines/${d.id}`,
      allDay: true,
      venture: d.venture,
      meta: null,
    })),
  ];
}

// --------------------------------------------------------------------------
// Dashboard aggregate
// --------------------------------------------------------------------------

export async function dashboard(tx: HubTx, hubId: string, userId: string, currency = "CAD") {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekEnd = endOfDay(new Date(now.getTime() + 6 * 864e5));
  const soon = endOfDay(new Date(now.getTime() + 13 * 864e5)); // ~2 weeks

  await advanceLapsedRenewals(tx, hubId);

  const [tasks, deadlines, renewals, cancelBys, events, debts, month, deadlinesToday, targets] = await Promise.all([
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { lte: weekEnd }, ...visibilityFilter(userId) },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    }),
    tx.deadline.findMany({
      where: { hubId, doneAt: null, dueDate: { lte: soon }, ...deadlineVisibility(userId) },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE", renewalDate: { lte: soon } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { renewalDate: "asc" },
    }),
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE", cancelByDate: { gte: todayStart, lte: soon } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { cancelByDate: "asc" },
    }),
    tx.event.findMany({
      where: { hubId, kind: "EVENT", endAt: { gte: todayStart }, startAt: { lte: weekEnd }, ...eventVisibility(userId) },
      include: eventInclude,
      orderBy: { startAt: "asc" },
    }),
    tx.debt.findMany({
      // Own debts only, same reasoning as upcomingSummary. DEFAULT still
      // counts — it has a payment due and arguably needs the reminder more.
      // No lower bound: an unpaid debt past its due date is the one that most
      // needs showing, not one that should silently drop off.
      where: { ownerId: userId, hubId, status: { not: "PAID_OFF" }, dueDate: { lte: soon } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { dueDate: "asc" },
    }),
    budgetMonth(tx, hubId, now),
    // Counted separately: the list above is capped at 5, so it can't answer
    // "how many are due today" once a few overdue ones sit ahead of them.
    tx.deadline.count({
      where: { hubId, doneAt: null, dueDate: { gte: todayStart, lte: todayEnd }, ...deadlineVisibility(userId) },
    }),
    tx.budgetTarget.findMany({ where: { hubId }, select: { category: true, monthlyCents: true } }),
  ]);

  // ---- today's progress ring. "Today's list" = everything that was due by
  // tonight: still-open tasks due today or earlier (from `tasks` above) and
  // open deadlines due by tonight, plus whatever was finished today. Same hub
  // + visibility clauses as the rows above, so a hub-mate's private task can
  // never move your ring. Events are left out: nothing to tick.
  const [tasksDoneToday, deadlinesDoneToday, deadlinesOpenByToday] = await Promise.all([
    tx.task.count({
      where: { hubId, status: "DONE", completedAt: { gte: todayStart, lte: todayEnd }, ...visibilityFilter(userId) },
    }),
    tx.deadline.count({
      where: { hubId, doneAt: { gte: todayStart, lte: todayEnd }, ...deadlineVisibility(userId) },
    }),
    tx.deadline.count({
      where: { hubId, doneAt: null, dueDate: { lte: todayEnd }, ...deadlineVisibility(userId) },
    }),
  ]);
  const progressDone = tasksDoneToday + deadlinesDoneToday;
  const progressOpen = tasks.filter((t) => t.dueDate && t.dueDate <= todayEnd).length + deadlinesOpenByToday;

  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < todayStart);
  const dueSoon = tasks.filter((t) => !t.dueDate || t.dueDate >= todayStart);

  // ---- "Your day" line. Built from the rows fetched above, so it inherits
  // every hub / visibility / owner filter they already carry.
  const dueToday =
    tasks.filter((t) => t.dueDate && t.dueDate >= todayStart && t.dueDate <= todayEnd).length +
    deadlinesToday +
    events.filter((e) => e.startAt <= todayEnd).length;

  // Money leaving in the next 7 days. Overdue bills and missed debt payments
  // count too — still owed, and sooner rather than later. Per-payment amounts,
  // not perMonth(): this is a dated window, not a monthly forecast.
  const inWeek = (d: Date | null) => d != null && d <= weekEnd;
  const outWeekCents =
    tasks.reduce((n, t) => n + (inWeek(t.dueDate) ? (t.amountCents ?? 0) : 0), 0) +
    debts.reduce(
      (n, x) => n + (inWeek(x.dueDate) ? (x.actualPaymentCents ?? x.minimumPaymentCents ?? 0) : 0),
      0,
    ) +
    // Another currency is left out rather than summed as if it were the hub's.
    renewals.reduce(
      (n, s) =>
        n + (s.renewalDate >= todayStart && inWeek(s.renewalDate) && s.currency === currency ? s.costCents : 0),
      0,
    );

  // Case-folded like /budget's target list, so "Food" and "food" meet.
  let budgetLeftCents: number | null = null;
  if (targets.length > 0) {
    const spentBy = new Map<string, number>();
    for (const c of month.categories) {
      const k = c.category.toLowerCase();
      spentBy.set(k, (spentBy.get(k) ?? 0) + c.cents);
    }
    const counted = new Set<string>();
    let spent = 0;
    let limit = 0;
    for (const tg of targets) {
      const k = tg.category.toLowerCase();
      limit += tg.monthlyCents;
      if (!counted.has(k)) spent += spentBy.get(k) ?? 0;
      counted.add(k);
    }
    budgetLeftCents = limit - spent;
  }

  return {
    now,
    overdue,
    dueSoon,
    deadlines,
    renewals,
    cancelBys,
    events,
    debts,
    budget: { income: month.income, expense: month.expense, net: month.net },
    day: {
      dueToday,
      outWeekCents,
      budgetLeftCents,
      progress: { done: progressDone, total: progressDone + progressOpen },
    },
  };
}

/**
 * Last week (Monday to Sunday, just ended) in three facts for the "Your week"
 * recap on /today: what got done, and what money was written down. Counts
 * only — no rows — and every clause mirrors the pages that list these things
 * (hub + task/deadline privacy; settle-ups excluded from money, like /budget).
 */
export async function weekRecap(tx: HubTx, hubId: string, userId: string, currency = "CAD") {
  const thisWeek = startOfWeek(new Date(), { weekStartsOn: 1 });
  const from = addWeeks(thisWeek, -1);
  const to = new Date(thisWeek.getTime() - 1);

  const [tasksDone, deadlinesDone, entries] = await Promise.all([
    tx.task.count({
      where: { hubId, status: "DONE", completedAt: { gte: from, lte: to }, ...visibilityFilter(userId) },
    }),
    tx.deadline.count({
      where: { hubId, doneAt: { gte: from, lte: to }, ...deadlineVisibility(userId) },
    }),
    tx.budgetEntry.groupBy({
      by: ["type"],
      where: { hubId, isSettlement: false, currency, date: { gte: from, lte: to } },
      _sum: { amountCents: true },
      _count: { _all: true },
    }),
  ]);

  const sum = (type: "INCOME" | "EXPENSE") => entries.find((e) => e.type === type)?._sum.amountCents ?? 0;
  return {
    /** Monday of the week the recap belongs to — the client keys its "seen" flag on this. */
    weekOf: thisWeek.toISOString().slice(0, 10),
    done: tasksDone + deadlinesDone,
    entries: entries.reduce((n, e) => n + e._count._all, 0),
    inCents: sum("INCOME"),
    outCents: sum("EXPENSE"),
  };
}

export type WeekRecapData = Awaited<ReturnType<typeof weekRecap>>;
