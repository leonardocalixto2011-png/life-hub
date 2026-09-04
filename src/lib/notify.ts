import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";

/**
 * Direct, immediate notification to a newly-assigned member — separate from
 * (and in addition to) the daily/weekly hub digest. No-op when the assignee
 * has push disabled or no registered devices; callers are responsible for
 * skipping self-assignment and unchanged assignments before calling this.
 */
export async function notifyAssignment(
  taskId: string,
  title: string,
  assigneeId: string,
  actorName: string,
) {
  const pref = await prisma.notificationPreference.findUnique({ where: { userId: assigneeId } });
  if (pref && pref.pushEnabled === false) return;
  await sendPushToUser(assigneeId, {
    title: "Assigned to you",
    body: `${actorName} assigned you "${title}"`,
    url: `/tasks/${taskId}`,
    tag: `assign-${taskId}`,
  });
}
