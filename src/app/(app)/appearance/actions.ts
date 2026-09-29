"use server";

import { revalidatePath } from "next/cache";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { blobUrlSchema } from "@/lib/blob-url";
import { deleteBlobIfUnreferenced } from "@/lib/blob-delete";
import { isThemeId } from "@/lib/themes";
import { isLocale } from "@/lib/locales";

/**
 * Points the user's row at `next` (a new URL, or null), then cleans up the
 * old blob so a user only ever has one background file at a time.
 *
 * Row first, delete second, and only if nothing else still references the old
 * URL: the stored value came from the client, so it may be someone else's
 * file (the hub cover, another member's background) — "remove" must never
 * delete that.
 */
async function replaceBackground(userId: string, next: string | null) {
  const existing = await prisma.user.findUnique({ where: { id: userId }, select: { backgroundImageUrl: true } });
  await prisma.user.update({ where: { id: userId }, data: { backgroundImageUrl: next } });
  if (existing?.backgroundImageUrl && existing.backgroundImageUrl !== next) {
    await deleteBlobIfUnreferenced(existing.backgroundImageUrl);
  }
}

export async function setBackgroundImage(url: string) {
  const user = await requireUser();
  const parsedUrl = blobUrlSchema.parse(url);

  await replaceBackground(user.id, parsedUrl);

  revalidatePath("/", "layout");
}

export async function removeBackgroundImage() {
  const user = await requireUser();

  await replaceBackground(user.id, null);

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
 * Language (French or English interface) and number/date formatting in one
 * setting. Per-user, because two people sharing a hub can reasonably want
 * different ones. Set from /appearance and from the account menu's switch.
 */
export async function setLocale(locale: string) {
  const user = await requireUser();
  if (!isLocale(locale)) throw new Error("Unknown locale.");
  await prisma.user.update({ where: { id: user.id }, data: { locale } });
  revalidatePath("/", "layout");
}
