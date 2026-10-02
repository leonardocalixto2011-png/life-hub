import { prisma } from "@/lib/prisma";
import { sendPushToUser, taskActions } from "@/lib/push";
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
  /** The assigner's display name. Null = no name on file; never pass an email. */
  actorName: string | null,
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
    body: translate(lang, "{actor} assigned you \"{title}\"", {
      // A notification lands on a lock screen: the assigner's address stays out of it.
      actor: actorName?.trim() || translate(lang, "Someone"),
      title,
    }),
    url: `/tasks/${taskId}`,
    tag: `assign-${taskId}`,
    // One task, so it can be answered from the notification itself.
    taskId,
    actions: taskActions(lang),
  });
}

/**
 * "Lucky te dit merci pour « Payer Hydro »" — one push to the person whose
 * feed line was thanked (see thankActivity). Same rules as above: their
 * language, their push preference, a name and never an address. The caller
 * guarantees it is sent at most once per person per line, and rate limits it.
 */
export async function notifyThanks(
  activityId: string,
  summary: string,
  recipientId: string,
  actorName: string | null,
) {
  const [pref, recipient] = await Promise.all([
    prisma.notificationPreference.findUnique({ where: { userId: recipientId } }),
    prisma.user.findUnique({ where: { id: recipientId }, select: { locale: true } }),
  ]);
  if (pref && pref.pushEnabled === false) return { sent: 0, failed: 0, pruned: 0 };
  const lang = langOf(recipient?.locale);
  const actor = actorName?.trim().split(/\s+/)[0] || translate(lang, "Someone");
  return sendPushToUser(recipientId, {
    title: translate(lang, "Thanks 🙏"),
    body: summary.trim()
      ? translate(lang, "{actor} says thanks for “{title}”", { actor, title: summary.trim() })
      : translate(lang, "{actor} says thanks", { actor }),
    url: "/activity",
    tag: `thanks-${activityId}`,
  });
}
