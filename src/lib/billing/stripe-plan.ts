import { prisma } from "@/lib/prisma";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";

/**
 * Cancels a person's Stripe subscription immediately — for account deletion.
 * (The cancel button on /billing cancels at period end instead.) No-op
 * without a live subscription. Throws if Stripe refuses, so the caller can
 * stop rather than delete someone who would go on being charged.
 */
export async function endPaidPlan(userId: string): Promise<void> {
  const row = await prisma.planAccount.findUnique({
    where: { userId },
    select: { stripeSubscriptionId: true, status: true },
  });
  if (!row?.stripeSubscriptionId || row.status === "CANCELED") return;
  if (!stripeConfigured()) throw new Error("Can't stop your subscription right now. Try again later.");
  await stripe("DELETE", `/subscriptions/${row.stripeSubscriptionId}`);
}
