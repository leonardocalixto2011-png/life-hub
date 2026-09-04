"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireHub } from "@/lib/session";
import { commitDrafts } from "@/app/(app)/quick-actions";
import type { Draft } from "@/lib/parse";

export async function acceptReview(
  id: string,
  draft: Draft,
): Promise<{ ok: boolean; error?: string }> {
  await requireHub();
  z.string().cuid().parse(id);

  const item = await prisma.reviewItem.findUnique({ where: { id } });
  if (!item || item.status !== "PENDING") {
    return { ok: false, error: "Already handled." };
  }

  const res = await commitDrafts([draft]);
  if (!res.ok) return { ok: false, error: res.error ?? "Could not save." };

  await prisma.reviewItem.update({
    where: { id },
    data: { status: "ACCEPTED", reviewedAt: new Date() },
  });

  revalidatePath("/inbox");
  revalidatePath("/today");
  return { ok: true };
}

export async function discardReview(id: string): Promise<{ ok: boolean }> {
  await requireHub();
  z.string().cuid().parse(id);
  await prisma.reviewItem.updateMany({
    where: { id, status: "PENDING" },
    data: { status: "DISCARDED", reviewedAt: new Date() },
  });
  revalidatePath("/inbox");
  revalidatePath("/today");
  return { ok: true };
}
