import { prisma } from "@/lib/prisma";

/**
 * Retention sweep, run from the daily digest cron (the only daily job this
 * deployment has). Schedule documented in DATA-INVENTORY.md §5.
 *
 * Review-inbox items hold parsed email — subject, a snippet, the sender's
 * address, amounts. Once an item is accepted its useful content already lives
 * on as the task/bill/event it became, and a discarded one is of no further
 * use, so neither needs to be kept. 90 days from the day the mail arrived,
 * whatever its status:
 *
 *   1. Still PENDING after 90 days → marked DISCARDED. Nobody is going to
 *      review a three-month-old bill, and this clears it from the inbox badge
 *      even if step 2 were to fail.
 *   2. Anything not PENDING and older than 90 days → deleted, row and parsed
 *      content together (which now includes what step 1 just expired).
 *
 * Trusted client: this spans every hub and runs with no session.
 */
export const REVIEW_RETENTION_DAYS = 90;

export async function pruneReviewItems(
  now: Date = new Date(),
): Promise<{ expired: number; deleted: number }> {
  const cutoff = new Date(now.getTime() - REVIEW_RETENTION_DAYS * 864e5);

  const expired = await prisma.reviewItem.updateMany({
    where: { status: "PENDING", createdAt: { lt: cutoff } },
    data: { status: "DISCARDED", reviewedAt: now },
  });
  const deleted = await prisma.reviewItem.deleteMany({
    where: { status: { not: "PENDING" }, createdAt: { lt: cutoff } },
  });
  return { expired: expired.count, deleted: deleted.count };
}
