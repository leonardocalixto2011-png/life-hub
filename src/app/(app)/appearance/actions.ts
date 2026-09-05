"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";

/**
 * Deletes whatever was already stored before persisting the new one, so a
 * user only ever has one background blob at a time — no orphaned files
 * accumulating in storage every time someone changes their photo.
 */
async function deletePreviousBlob(userId: string) {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { backgroundImageUrl: true } });
  if (existing?.backgroundImageUrl) {
    try {
      await del(existing.backgroundImageUrl);
    } catch {
      // Already gone or otherwise unreachable — not worth failing the request over.
    }
  }
}

export async function setBackgroundImage(url: string) {
  const user = await requireUser();
  const parsedUrl = z.string().url().parse(url);

  await deletePreviousBlob(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { backgroundImageUrl: parsedUrl } });

  revalidatePath("/", "layout");
}

export async function removeBackgroundImage() {
  const user = await requireUser();

  await deletePreviousBlob(user.id);
  await prisma.user.update({ where: { id: user.id }, data: { backgroundImageUrl: null } });

  revalidatePath("/", "layout");
}
