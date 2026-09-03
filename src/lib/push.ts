import webpush from "web-push";

import { prisma } from "@/lib/prisma";

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

export type PushPayload = {
  title: string;
  body: string;
  url?: string;
  tag?: string;
};

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
