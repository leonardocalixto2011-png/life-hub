import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns";
import type { Prisma } from "@prisma/client";

import type { HubTx } from "@/lib/hub-context";
import { monthlyCents } from "@/lib/money";

export function listVentures(tx: HubTx, hubId: string) {
  return tx.venture.findMany({
    where: { hubId, archived: false },
    orderBy: { sortOrder: "asc" },
  });
}

/** Active members of a hub — the source for assignee pickers and the members list. */
export function listMembers(tx: HubTx, hubId: string) {
  return tx.hubMembership
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
};

export function listTasks(tx: HubTx, hubId: string, userId: string, filter: TaskFilter = {}) {
  return tx.task.findMany({
    where: {
      hubId,
      ...visibilityFilter(userId),
      ...(filter.includeDone ? {} : { status: "OPEN" }),
      ...(filter.ventureSlug ? { venture: { slug: filter.ventureSlug } } : {}),
      ...(filter.mineUserId ? { assignedToId: filter.mineUserId } : {}),
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

/** Buckets for the "Today" view. */
export async function todayView(tx: HubTx, hubId: string, userId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekEnd = endOfDay(new Date(now.getTime() + 6 * 864e5));
  const vis = visibilityFilter(userId);

  const [overdue, today, upcoming, undatedCount] = await Promise.all([
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { lt: todayStart }, ...vis },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    }),
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { gte: todayStart, lte: todayEnd }, ...vis },
      include: taskInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    tx.task.findMany({
      where: { hubId, status: "OPEN", dueDate: { gt: todayEnd, lte: weekEnd }, ...vis },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    }),
    tx.task.count({ where: { hubId, status: "OPEN", dueDate: null, ...vis } }),
  ]);

  return { overdue, today, upcoming, undatedCount };
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

export function listDebts(tx: HubTx, hubId: string, opts: { includeOther?: boolean } = {}) {
  return tx.debt.findMany({
    where: { hubId, ...(opts.includeOther ? {} : { status: { not: "PAID_OFF" } }) },
    include: debtInclude,
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  });
}

export function getDebt(tx: HubTx, hubId: string, id: string) {
  return tx.debt.findUnique({ where: { id, hubId }, include: debtInclude });
}

export type DebtWithRefs = Awaited<ReturnType<typeof listDebts>>[number];

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
export async function upcomingSummary(tx: HubTx, hubId: string) {
  const [subs, debts, pendingBills] = await Promise.all([
    tx.subscription.findMany({
      where: { hubId, status: "ACTIVE" },
      select: { costCents: true, billingCycle: true },
    }),
    tx.debt.findMany({
      where: { hubId, status: "CURRENT" },
      select: { minimumPaymentCents: true, actualPaymentCents: true },
    }),
    tx.reviewItem.count({ where: { hubId, status: "PENDING", category: "BILL_PAYMENT" } }),
  ]);

  const subscriptionsCents = subs.reduce(
    (sum, s) => sum + monthlyCents(s.costCents, s.billingCycle),
    0,
  );
  const debtsCents = debts.reduce(
    (sum, d) => sum + (d.actualPaymentCents ?? d.minimumPaymentCents ?? 0),
    0,
  );

  return { subscriptionsCents, debtsCents, pendingBills };
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
  opts: { from?: Date; to?: Date } = {},
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
    where: { hubId, ...eventVisibility(userId), ...range },
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
// ReviewItem has no hubId yet (see plan §5, known gap not solved this phase)
// — it stays global; accepted items land in whichever hub is current for the
// user who clicks Accept.

export function listPendingReviews(tx: HubTx) {
  return tx.reviewItem.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
}

export function pendingReviewCount(tx: HubTx) {
  return tx.reviewItem.count({ where: { status: "PENDING" } });
}

export type ReviewRow = Awaited<ReturnType<typeof listPendingReviews>>[number];

// --------------------------------------------------------------------------
// Merged agenda — tasks + deadlines + events on one timeline
// --------------------------------------------------------------------------

export type AgendaItem = {
  kind: "task" | "deadline" | "event";
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

  const [tasks, deadlines, events] = await Promise.all([
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
      where: { hubId, endAt: { gte: from }, startAt: { lte: to }, ...eventVisibility(userId) },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { startAt: "asc" },
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
  ];

  items.sort((a, b) => a.at.getTime() - b.at.getTime());
  return { now, from, items };
}

// --------------------------------------------------------------------------
// Cross-hub "Mine" view
// --------------------------------------------------------------------------

export type MyItem = AgendaItem & { hub: { id: string; name: string; color: string } };

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

export async function dashboard(tx: HubTx, hubId: string, userId: string) {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekEnd = endOfDay(new Date(now.getTime() + 6 * 864e5));
  const soon = endOfDay(new Date(now.getTime() + 13 * 864e5)); // ~2 weeks

  const [tasks, deadlines, renewals, cancelBys, events, month] = await Promise.all([
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
      where: { hubId, status: "ACTIVE", cancelByDate: { not: null, lte: soon } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { cancelByDate: "asc" },
    }),
    tx.event.findMany({
      where: { hubId, endAt: { gte: todayStart }, startAt: { lte: weekEnd }, ...eventVisibility(userId) },
      include: eventInclude,
      orderBy: { startAt: "asc" },
    }),
    budgetMonth(tx, hubId, now),
  ]);

  const overdue = tasks.filter((t) => t.dueDate && t.dueDate < todayStart);
  const dueSoon = tasks.filter((t) => !t.dueDate || t.dueDate >= todayStart);

  return {
    now,
    overdue,
    dueSoon,
    deadlines,
    renewals,
    cancelBys,
    events,
    budget: { income: month.income, expense: month.expense, net: month.net },
  };
}
