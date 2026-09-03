import { endOfDay, endOfMonth, startOfDay, startOfMonth } from "date-fns";

import { prisma } from "@/lib/prisma";

export function listVentures() {
  return prisma.venture.findMany({
    where: { archived: false },
    orderBy: { sortOrder: "asc" },
  });
}

export function listMembers() {
  return prisma.user.findMany({
    orderBy: [{ name: "asc" }, { email: "asc" }],
    select: { id: true, name: true, email: true, role: true },
  });
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

export function listTasks(filter: TaskFilter = {}) {
  return prisma.task.findMany({
    where: {
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

export function getTask(id: string) {
  return prisma.task.findUnique({ where: { id }, include: taskInclude });
}

/** Buckets for the "Today" view. */
export async function todayView() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const todayEnd = endOfDay(now);
  const weekEnd = endOfDay(new Date(now.getTime() + 6 * 864e5));

  const [overdue, today, upcoming, undatedCount] = await Promise.all([
    prisma.task.findMany({
      where: { status: "OPEN", dueDate: { lt: todayStart } },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    }),
    prisma.task.findMany({
      where: { status: "OPEN", dueDate: { gte: todayStart, lte: todayEnd } },
      include: taskInclude,
      orderBy: [{ priority: "desc" }, { createdAt: "asc" }],
    }),
    prisma.task.findMany({
      where: { status: "OPEN", dueDate: { gt: todayEnd, lte: weekEnd } },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    }),
    prisma.task.count({ where: { status: "OPEN", dueDate: null } }),
  ]);

  return { overdue, today, upcoming, undatedCount };
}

export type TaskWithRefs = Awaited<ReturnType<typeof listTasks>>[number];

// --------------------------------------------------------------------------
// Deadlines
// --------------------------------------------------------------------------

const deadlineInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
} as const;

export function listDeadlines(opts: { includeDone?: boolean } = {}) {
  return prisma.deadline.findMany({
    where: opts.includeDone ? {} : { doneAt: null },
    include: deadlineInclude,
    orderBy: [{ doneAt: "asc" }, { dueDate: "asc" }],
  });
}

export function getDeadline(id: string) {
  return prisma.deadline.findUnique({ where: { id }, include: deadlineInclude });
}

export type DeadlineWithRefs = Awaited<ReturnType<typeof listDeadlines>>[number];

// --------------------------------------------------------------------------
// Subscriptions
// --------------------------------------------------------------------------

const subscriptionInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
  owner: { select: { id: true, name: true, email: true } },
} as const;

export function listSubscriptions(opts: { includeCancelled?: boolean } = {}) {
  return prisma.subscription.findMany({
    where: opts.includeCancelled ? {} : { status: "ACTIVE" },
    include: subscriptionInclude,
    orderBy: [{ status: "asc" }, { renewalDate: "asc" }],
  });
}

export function getSubscription(id: string) {
  return prisma.subscription.findUnique({ where: { id }, include: subscriptionInclude });
}

export type SubscriptionWithRefs = Awaited<ReturnType<typeof listSubscriptions>>[number];

// --------------------------------------------------------------------------
// Budget
// --------------------------------------------------------------------------

const budgetInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

/** `month` is any date inside the target month. */
export async function budgetMonth(month: Date, ventureSlug?: string) {
  const from = startOfMonth(month);
  const to = endOfMonth(month);
  const ventureFilter = ventureSlug ? { venture: { slug: ventureSlug } } : {};

  const entries = await prisma.budgetEntry.findMany({
    where: { date: { gte: from, lte: to }, ...ventureFilter },
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

// --------------------------------------------------------------------------
// Events / calendar
// --------------------------------------------------------------------------

const eventInclude = {
  venture: { select: { id: true, name: true, slug: true, color: true } },
  createdBy: { select: { id: true, name: true, email: true } },
} as const;

export function listEvents(opts: { from?: Date; to?: Date } = {}) {
  const range =
    opts.from || opts.to
      ? {
          startAt: {
            ...(opts.from ? { gte: opts.from } : {}),
            ...(opts.to ? { lte: opts.to } : {}),
          },
        }
      : {};
  return prisma.event.findMany({
    where: range,
    include: eventInclude,
    orderBy: { startAt: "asc" },
  });
}

export function getEvent(id: string) {
  return prisma.event.findUnique({ where: { id }, include: eventInclude });
}

export type EventWithRefs = Awaited<ReturnType<typeof listEvents>>[number];

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

export async function agendaItems(days = 30) {
  const now = new Date();
  const from = startOfDay(now);
  const to = endOfDay(new Date(now.getTime() + days * 864e5));

  const [tasks, deadlines, events] = await Promise.all([
    prisma.task.findMany({
      where: { status: "OPEN", dueDate: { not: null, lte: to } },
      include: { venture: { select: { name: true, color: true } }, assignedTo: { select: { name: true, email: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.deadline.findMany({
      where: { doneAt: null, dueDate: { lte: to } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { dueDate: "asc" },
    }),
    prisma.event.findMany({
      where: { endAt: { gte: from }, startAt: { lte: to } },
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
// Dashboard aggregate
// --------------------------------------------------------------------------

export async function dashboard() {
  const now = new Date();
  const todayStart = startOfDay(now);
  const weekEnd = endOfDay(new Date(now.getTime() + 6 * 864e5));
  const soon = endOfDay(new Date(now.getTime() + 13 * 864e5)); // ~2 weeks

  const [tasks, deadlines, renewals, cancelBys, events, month] = await Promise.all([
    prisma.task.findMany({
      where: { status: "OPEN", dueDate: { lte: weekEnd } },
      include: taskInclude,
      orderBy: [{ dueDate: "asc" }, { priority: "desc" }],
    }),
    prisma.deadline.findMany({
      where: { doneAt: null, dueDate: { lte: soon } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { dueDate: "asc" },
      take: 5,
    }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE", renewalDate: { lte: soon } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { renewalDate: "asc" },
    }),
    prisma.subscription.findMany({
      where: { status: "ACTIVE", cancelByDate: { not: null, lte: soon } },
      include: { venture: { select: { name: true, color: true } } },
      orderBy: { cancelByDate: "asc" },
    }),
    prisma.event.findMany({
      where: { endAt: { gte: todayStart }, startAt: { lte: weekEnd } },
      include: eventInclude,
      orderBy: { startAt: "asc" },
    }),
    budgetMonth(now),
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
