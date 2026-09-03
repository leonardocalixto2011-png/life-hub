"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";

const subSchema = z.object({
  endpoint: z.string().url(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
});

export async function savePushSubscription(
  raw: unknown,
  userAgent?: string,
): Promise<{ ok: boolean }> {
  const user = await requireUser();
  const sub = subSchema.parse(raw);

  await prisma.pushSubscription.upsert({
    where: { endpoint: sub.endpoint },
    update: { userId: user.id, p256dh: sub.keys.p256dh, auth: sub.keys.auth, userAgent, lastError: null },
    create: {
      userId: user.id,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent,
    },
  });

  // Make sure a preferences row exists.
  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: { pushEnabled: true },
    create: { userId: user.id, pushEnabled: true },
  });

  revalidatePath("/notifications");
  return { ok: true };
}

export async function removePushSubscription(endpoint: string): Promise<{ ok: boolean }> {
  await requireUser();
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  revalidatePath("/notifications");
  return { ok: true };
}

const prefsSchema = z.object({
  emailDigestEnabled: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  digestHour: z.coerce.number().int().min(0).max(23),
  timezone: z.string().min(1).max(64),
});

export async function updateNotificationPrefs(formData: FormData) {
  const user = await requireUser();
  const data = prefsSchema.parse({
    emailDigestEnabled: formData.get("emailDigestEnabled"),
    digestHour: formData.get("digestHour"),
    timezone: formData.get("timezone"),
  });

  await prisma.notificationPreference.upsert({
    where: { userId: user.id },
    update: data,
    create: { userId: user.id, ...data },
  });

  revalidatePath("/notifications");
}

export async function sendTestPush(): Promise<{ sent: number; failed: number; pruned: number }> {
  const user = await requireUser();
  return sendPushToUser(user.id, {
    title: "Life Hub",
    body: "Test notification — you're all set. 🎉",
    url: "/today",
    tag: "test",
  });
}
