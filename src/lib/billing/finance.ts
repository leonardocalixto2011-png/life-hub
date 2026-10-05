import { prisma } from "@/lib/prisma";
import { planIsPlus } from "@/lib/billing/plan";
import { PLUS_PRICE_CENTS } from "@/lib/billing/plans";

/**
 * The numbers behind /admin/finance. Admin-only by its one caller; aggregates
 * only — no names or addresses leave this module.
 *
 * Costs we can't read from an API are settings with defaults from the
 * monetization audit (MONETIZATION.md), meant to be corrected from the real
 * invoices: FIN_FIXED_MONTHLY_CAD (Vercel, Resend, Neon, domain),
 * FIN_AI_USD_PER_MTOK (blended Claude price across models), FIN_USD_CAD.
 */

function envNum(name: string, fallback: number): number {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v > 0 ? v : fallback;
}

/** Stripe Canada: 2.9 % + 0,30 $ per card payment, plus 0.7 % Billing on subscriptions. */
export function stripeFeeCents(amountCents: number, subscription: boolean): number {
  if (amountCents <= 0) return 0;
  return Math.round(amountCents * (0.029 + (subscription ? 0.007 : 0)) + 30);
}

export async function financeSnapshot(now = new Date()) {
  const since30 = new Date(now.getTime() - 30 * 86_400_000);
  const [plans, events, aiRow, recent] = await Promise.all([
    prisma.planAccount.findMany({
      select: {
        status: true,
        interval: true,
        trialEndsAt: true,
        compUntil: true,
        currentPeriodEnd: true,
        cancelAtPeriodEnd: true,
        stripeSubscriptionId: true,
      },
    }),
    prisma.billingEvent.findMany({
      where: { occurredAt: { gte: since30 } },
      select: { kind: true, amountCents: true, feeCents: true },
    }),
    prisma.rateLimit.findFirst({
      where: { key: "ai-tokens:__global__" },
      orderBy: { windowStart: "desc" },
      select: { count: true, windowStart: true },
    }),
    prisma.billingEvent.findMany({
      orderBy: { occurredAt: "desc" },
      take: 15,
      select: { kind: true, amountCents: true, currency: true, occurredAt: true },
    }),
  ]);

  const live = plans.filter((p) => planIsPlus(p, now));
  const paying = live.filter((p) => p.stripeSubscriptionId && (p.status === "ACTIVE" || p.status === "PAST_DUE"));
  const mrrCents = paying
    .filter((p) => !p.cancelAtPeriodEnd)
    .reduce((s, p) => s + (p.interval === "YEAR" ? Math.round(PLUS_PRICE_CENTS.YEAR / 12) : PLUS_PRICE_CENTS.MONTH), 0);

  const sum = (kind: string) => events.filter((e) => e.kind === kind).reduce((s, e) => s + e.amountCents, 0);
  const planRevenue = sum("plan");
  const creditRevenue = sum("credits");
  const refunds = sum("refund");
  const fees = events.reduce(
    (s, e) => s + (e.feeCents ?? stripeFeeCents(e.amountCents, e.kind === "plan")),
    0,
  );

  const usdPerMTok = envNum("FIN_AI_USD_PER_MTOK", 2);
  const usdCad = envNum("FIN_USD_CAD", 1.38);
  const aiTokens = aiRow?.count ?? 0;
  const aiCostCents = Math.round((aiTokens / 1_000_000) * usdPerMTok * usdCad * 100);
  const fixedCents = Math.round(envNum("FIN_FIXED_MONTHLY_CAD", 84) * 100);

  const revenue = planRevenue + creditRevenue + refunds;
  const net = revenue - fees - aiCostCents - fixedCents;
  // What one paying household leaves after its own variable costs, from the
  // audit's estimate (≈ 3 $), refined by the real MRR per payer once there are payers (minus ≈ 1,70 $ of
  // AI, hosting and Stripe per household).
  const perHousehold = paying.length > 0 ? Math.max(100, Math.round(mrrCents / paying.length) - 170) : 300;
  const breakEven = Math.ceil(fixedCents / perHousehold);

  return {
    counts: {
      paying: paying.length,
      trialing: live.filter((p) => p.status === "TRIALING").length,
      comp: live.filter((p) => p.status === "COMP").length,
      pastDue: live.filter((p) => p.status === "PAST_DUE").length,
      cancelling: paying.filter((p) => p.cancelAtPeriodEnd).length,
      yearly: paying.filter((p) => p.interval === "YEAR").length,
    },
    mrrCents,
    arrCents: mrrCents * 12,
    last30: { planRevenue, creditRevenue, refunds, fees, aiCostCents, aiTokens, fixedCents, net },
    aiWindowStart: aiRow?.windowStart ?? null,
    breakEven,
    recent,
    assumptions: { usdPerMTok, usdCad, fixedCad: fixedCents / 100 },
  };
}
