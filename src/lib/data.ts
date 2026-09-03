import { endOfDay, startOfDay } from "date-fns";

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
