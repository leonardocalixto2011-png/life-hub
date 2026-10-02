import { addWeeks } from "date-fns";

import type { HubTx } from "@/lib/hub-context";
import { visibleTo } from "@/lib/visibility";
import { addMonthsOnDay, anchorOf, sameDay } from "@/lib/recur";

/**
 * The task writes shared by the server actions (`tasks/actions.ts`) and the
 * notification-button route (`/api/push/action`), which has a session but no
 * "current hub" worth trusting — a push can be about any hub the person is in.
 *
 * Every write goes by a client-supplied id. RLS already limits that to the
 * viewer's hubs and visible rows, but — as everywhere in this app — the same
 * rule is mirrored in app code so a missing/misconfigured app role can't turn
 * a bare id into access to another hub's (or someone's private) task.
 */
export function scopedTask(id: string, hubId: string, userId: string) {
  return { id, hubId, ...visibleTo(userId) };
}

export async function findScopedTask(tx: HubTx, id: string, hubId: string, userId: string) {
  const task = await tx.task.findFirst({ where: scopedTask(id, hubId, userId) });
  if (!task) throw new Error("Not found.");
  return task;
}

/** A new due date, resetting the monthly anchor only if the day really changed. */
export function dueFields(before: Date | null, dueDate: Date | null) {
  return sameDay(before, dueDate) ? { dueDate } : { dueDate, dueDay: null };
}

/**
 * Marking a recurring task done spawns its next occurrence: same fields, due date
 * advanced by the recurrence interval (from the old due date, or today).
 */
export async function completeTask(tx: HubTx, id: string, hubId: string, userId: string) {
  const task = await findScopedTask(tx, id, hubId, userId);

  // Conditional, so two devices pressing "Done" at once can't both pass and
  // spawn two next occurrences of a recurring task: only the one that
  // actually flips the row continues.
  const flipped = await tx.task.updateMany({
    where: { ...scopedTask(id, hubId, userId), status: { not: "DONE" } },
    data: { status: "DONE", completedAt: new Date() },
  });
  if (flipped.count === 0) return;

  if (task.isRecurring && task.recurrence) {
    const base = task.dueDate ?? new Date();
    const dueDay = task.recurrence === "weekly" ? null : anchorOf(base, task.dueDay);
    const nextDue = dueDay == null ? addWeeks(base, 1) : addMonthsOnDay(base, 1, dueDay);
    await tx.task.create({
      data: {
        title: task.title,
        notes: task.notes,
        hubId: task.hubId,
        ventureId: task.ventureId,
        assignedToId: task.assignedToId,
        priority: task.priority,
        isRecurring: true,
        recurrence: task.recurrence,
        dueDate: nextDue,
        dueDay,
        createdById: task.createdById,
        visibility: task.visibility,
      },
    });
  }
}
