"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { commitDrafts } from "@/app/(app)/quick-actions";
import { commitDraftsCore } from "@/lib/commit-drafts";
import { shouldOfferTrust, trustSender } from "@/lib/mail/trust";
import type { ActionableCategory } from "@/lib/mail/classify";
import type { Draft } from "@/lib/parse";

export type AcceptResult = {
  ok: boolean;
  error?: string;
  /** Present when this sender/category has crossed the trust threshold — ReviewCard offers a one-tap "always trust" prompt. */
  offerTrust?: { hubId: string; fromAddress: string; category: ActionableCategory };
};

export async function acceptReview(id: string, draft: Draft): Promise<AcceptResult> {
  const { user } = await requireHub();
  z.string().cuid().parse(id);

  const item = await prisma.reviewItem.findUnique({ where: { id } });
  if (!item || item.status !== "PENDING") {
    return { ok: false, error: "Already handled." };
  }

  // Mail-connector items always have a hubId — commit into that hub
  // explicitly rather than the accepting user's current hub (they might be
  // viewing /inbox from a different one). The old manual-forward path has no
  // hubId, so it keeps today's behavior: commit into whichever hub the
  // accepting user currently has selected.
  if (item.hubId) {
    const result = await withHub(user.id, (tx) =>
      commitDraftsCore(tx, item.hubId!, user.id, [draft]),
    );
    if (!result.ok) return { ok: false, error: result.error };
  } else {
    const result = await commitDrafts([draft]);
    if (!result.ok) return { ok: false, error: result.error ?? "Could not save." };
  }

  await prisma.reviewItem.update({
    where: { id },
    data: { status: "ACCEPTED", reviewedAt: new Date() },
  });

  revalidatePath("/inbox");
  revalidatePath("/today");

  let offerTrust: AcceptResult["offerTrust"];
  if (item.hubId && item.fromAddress && item.category) {
    const offer = await shouldOfferTrust(prisma, item.hubId, item.fromAddress, item.category as ActionableCategory);
    if (offer) {
      offerTrust = {
        hubId: item.hubId,
        fromAddress: item.fromAddress,
        category: item.category as ActionableCategory,
      };
    }
  }

  return { ok: true, offerTrust };
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

export async function trustThisSender(hubId: string, fromAddress: string, category: ActionableCategory) {
  const { user } = await requireHub();
  await withHub(user.id, (tx) => trustSender(tx, hubId, fromAddress, category));
  revalidatePath("/mail");
}
