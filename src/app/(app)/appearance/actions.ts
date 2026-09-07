"use server";

import { del } from "@vercel/blob";
import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { blobUrlSchema } from "@/lib/blob-url";
import { isThemeId } from "@/lib/themes";
import { isLocale } from "@/lib/locales";

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
  const parsedUrl = blobUrlSchema.parse(url);

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

export async function setTheme(themeId: string) {
  const user = await requireUser();
  if (!isThemeId(themeId)) throw new Error("Unknown theme.");

  await prisma.user.update({ where: { id: user.id }, data: { themeId } });

  // The palette lives on <html> in the root layout, so the whole tree has to
  // re-render — not just /appearance.
  revalidatePath("/", "layout");
}

/**
 * Number/date formatting only — this does not translate the interface, which
 * is still English. Per-user, because two people sharing a hub can reasonably
 * want different formatting.
 */
export async function setLocale(locale: string) {
  const user = await requireUser();
  if (!isLocale(locale)) throw new Error("Unknown locale.");
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
}
