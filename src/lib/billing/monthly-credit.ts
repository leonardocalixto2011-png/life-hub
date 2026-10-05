import { format } from "date-fns";

import { prisma } from "@/lib/prisma";
import { addCredit } from "@/lib/credits";
import { billingEnabled } from "@/lib/billing/plan";
import { PLUS_INCLUDED_ASSISTANT_CENTS } from "@/lib/billing/plans";

/**
 * The Claude credit included with Plus: PLUS_INCLUDED_ASSISTANT_CENTS once per
 * calendar month to each person paying for Plus (ACTIVE, monthly or yearly).
 * Run from the daily cron; the ledger key `plus:<user>:<YYYY-MM>` makes every
 * later run that month a no-op, so a missed day only delays the grant.
 *
 * Not for trials (a free trial must not hand out free money every time) nor
 * COMP plans (beta households: their AI use is a cost we chose to carry, and
 * it shows on /admin/finance through the wallet's raw cost). Nothing while
 * BILLING_ENABLED is off, since then nobody pays.
 */
export async function grantPlusMonthlyCredit(now = new Date()): Promise<number> {
  if (!billingEnabled() || PLUS_INCLUDED_ASSISTANT_CENTS <= 0) return 0;
  const month = format(now, "yyyy-MM");
  const payers = await prisma.planAccount.findMany({ where: { status: "ACTIVE" }, select: { userId: true } });
  let granted = 0;
  for (const { userId } of payers) {
    const added = await addCredit({
      userId,
      cents: PLUS_INCLUDED_ASSISTANT_CENTS,
      kind: "GRANT",
      note: "Plus",
      externalRef: `plus:${userId}:${month}`,
    });
    if (added) granted++;
  }
  return granted;
}
