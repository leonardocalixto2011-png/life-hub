import webpush from "web-push";

import { prisma } from "@/lib/prisma";
import { translate, type Lang } from "@/lib/i18n";

let configured = false;

/** Configure web-push once. Returns false when VAPID env is missing. */
export function ensureWebPush(): boolean {
  if (configured) return true;
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  const privateKey = process.env.VAPID_PRIVATE_KEY;
  if (!publicKey || !privateKey) return false;

  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:admin@example.com",
    publicKey,
    privateKey,
  );
  configured = true;
  return true;
}

/** A button on the notification itself. `action` is what public/sw.js switches on. */
export type PushAction = { action: "done" | "tomorrow" | "view"; title: string };

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  /**
   * Notification buttons — Android and desktop show them (two at most on
   * Android); iOS ignores the field and the notification is otherwise the
   * same. Kept short: a push payload is capped around 4 KB and these ride
   * inside it.
   */
  actions?: PushAction[];
  /** The one task a "Done" / "Tomorrow" button acts on (see /api/push/action). */
  taskId?: string;
};

/** "Done" + "Tomorrow" for a push that is about exactly one task. */
export function taskActions(lang: Lang): PushAction[] {
  return [
    { action: "done", title: translate(lang, "Done ✓") },
    { action: "tomorrow", title: translate(lang, "Tomorrow") },
  ];
}

/** A single "View" button, for a push that summarises rather than asks. */
export function viewAction(lang: Lang): PushAction[] {
  return [{ action: "view", title: translate(lang, "View") }];
}

export type PushResult = { sent: number; failed: number; pruned: number };

/** Send a payload to every registered device for a user. Prunes dead endpoints. */
export async function sendPushToUser(
  userId: string,
  payload: PushPayload,
): Promise<PushResult> {
  if (!ensureWebPush()) return { sent: 0, failed: 0, pruned: 0 };

  const subs = await prisma.pushSubscription.findMany({ where: { userId } });
  const body = JSON.stringify(payload);
  let sent = 0;
  let failed = 0;
  let pruned = 0;

  await Promise.all(
    subs.map(async (s) => {
      try {
        await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } },
          body,
        );
        sent++;
        await prisma.pushSubscription.update({
          where: { id: s.id },
          data: { lastOkAt: new Date(), lastError: null },
        });
      } catch (err) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await prisma.pushSubscription.delete({ where: { id: s.id } });
          pruned++;
        } else {
          failed++;
          await prisma.pushSubscription.update({
            where: { id: s.id },
            data: { lastError: String((err as Error).message ?? err).slice(0, 300) },
          });
        }
      }
    }),
  );

  return { sent, failed, pruned };
}
