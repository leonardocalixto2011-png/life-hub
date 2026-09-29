import { prisma } from "@/lib/prisma";
import { sendPushToUser } from "@/lib/push";
import { langOf, translate } from "@/lib/i18n";

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
  const [pref, assignee] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: assigneeId } }),
    prisma.user.findUnique({ where: { id: assigneeId }, select: { locale: true } }),
  ]);
  if (pref && pref.pushEnabled === false) return;
  // The assignee's language, not the assigner's: they are the one reading it.
  const lang = langOf(assignee?.locale);
  await sendPushToUser(assigneeId, {
    title: translate(lang, "Assigned to you"),
    body: translate(lang, "{actor} assigned you \"{title}\"", { actor: actorName, title }),
    url: `/tasks/${taskId}`,
    tag: `assign-${taskId}`,
  });
}
