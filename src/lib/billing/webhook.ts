import type { PlanStatus } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { logInfo, logWarn } from "@/lib/observability";
import { creditWallet } from "@/lib/billing/credits-hook";
import { stripe } from "@/lib/billing/stripe";
import { CREDIT_PACKS_CENTS } from "@/lib/billing/plans";

/**
 * Applies one verified Stripe event to the database. Called by
 * /api/billing/webhook only after the signature check.
 *
 * Two kinds of effect:
 *   - Plan state (PlanAccount): synced from the subscription object itself,
 *     which is idempotent — replaying an event writes the same values.
 *   - Money (BillingEvent): one ledger row per Stripe event id, unique, so a
 *     retried webhook never books the same payment twice.
 *
 * Objects are typed loosely on purpose: we read a handful of fields, and
 * Stripe moves some between API versions (current_period_end moved from the
 * subscription onto its items), so each read tolerates both places.
 */

type Obj = Record<string, unknown>;
type StripeEvent = { id: string; type: string; created: number; data: { object: Obj } };

const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const obj = (v: unknown): Obj => (v && typeof v === "object" ? (v as Obj) : {});
const idOf = (v: unknown): string | null => str(v) ?? str(obj(v).id);
const date = (seconds: number | null): Date | null => (seconds ? new Date(seconds * 1000) : null);

/** Stripe subscription status → ours. `null` = leave the row as it is. */
export function mapStatus(s: string | null): PlanStatus | null {
  switch (s) {
    case "active":
    case "trialing":
      return "ACTIVE";
    case "past_due":
      return "PAST_DUE";
    case "canceled":
    case "unpaid":
    case "incomplete_expired":
      return "CANCELED";
    default:
      return null; // "incomplete", "paused": no change until Stripe settles it
  }
}

async function userIdForCustomer(customerId: string | null): Promise<string | null> {
  if (!customerId) return null;
  const row = await prisma.planAccount.findUnique({ where: { stripeCustomerId: customerId }, select: { userId: true } });
  return row?.userId ?? null;
}

async function syncSubscription(sub: Obj): Promise<void> {
  const subId = str(sub.id);
  const customerId = idOf(sub.customer);
  const metaUser = str(obj(sub.metadata).userId);
  const userId =
    (subId &&
      (await prisma.planAccount.findUnique({ where: { stripeSubscriptionId: subId }, select: { userId: true } }))?.userId) ||
    (await userIdForCustomer(customerId)) ||
    metaUser;
  if (!userId || !subId) {
    logWarn("billing.subscription_unmatched", { subId, customerId });
    return;
  }
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } });
  if (!user) return; // account deleted since

  const status = mapStatus(str(sub.status));
  const item = obj((obj(sub.items).data as unknown[] | undefined)?.[0]);
  const interval = str(obj(obj(item.price).recurring).interval);
  const periodEnd = date(num(sub.current_period_end) ?? num(item.current_period_end));
  const data = {
    stripeSubscriptionId: subId,
    ...(customerId ? { stripeCustomerId: customerId } : {}),
    ...(status ? { status } : {}),
    ...(interval === "year" ? { interval: "YEAR" as const } : interval === "month" ? { interval: "MONTH" as const } : {}),
    currentPeriodEnd: periodEnd,
    cancelAtPeriodEnd: sub.cancel_at_period_end === true,
  };
  await prisma.planAccount.upsert({
    where: { userId },
    update: data,
    create: { userId, status: status ?? "ACTIVE", ...data },
  });
  logInfo("billing.subscription_synced", { userId, status: status ?? "unchanged" });
}

async function book(event: StripeEvent, row: { kind: string; userId: string | null; amountCents: number; currency?: string | null }) {
  await prisma.billingEvent.upsert({
    where: { stripeEventId: event.id },
    update: {},
    create: {
      stripeEventId: event.id,
      type: event.type,
      kind: row.kind,
      userId: row.userId,
      amountCents: row.amountCents,
      currency: (row.currency ?? "cad").toLowerCase(),
      occurredAt: date(event.created) ?? new Date(),
    },
  });
}

export async function handleStripeEvent(event: StripeEvent): Promise<void> {
  const o = event.data.object;
  switch (event.type) {
    case "checkout.session.completed": {
      const userId = str(o.client_reference_id) ?? str(obj(o.metadata).userId);
      const customerId = idOf(o.customer);
      if (o.mode === "subscription" && userId) {
        // Link the customer first, so the subscription events (which may
        // arrive before or after this one) can find the person.
        if (customerId) {
          await prisma.planAccount.upsert({
            where: { userId },
            update: { stripeCustomerId: customerId },
            create: { userId, status: "CANCELED", stripeCustomerId: customerId },
          });
        }
        const subId = idOf(o.subscription);
        if (subId) {
          await syncSubscription(await stripe("GET", `/subscriptions/${subId}`));
        }
      }
      if (o.mode === "payment" && obj(o.metadata).kind === "ai_credits" && userId && o.payment_status === "paid") {
        const cents = Number(obj(o.metadata).cents);
        if (!(CREDIT_PACKS_CENTS as readonly number[]).includes(cents)) {
          logWarn("billing.credits_unknown_pack", { cents });
          break;
        }
        await book(event, { kind: "credits", userId, amountCents: num(o.amount_total) ?? cents, currency: str(o.currency) });
        await creditWallet(userId, cents, str(o.id) ?? event.id);
      }
      break;
    }
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await syncSubscription(o);
      break;
    case "invoice.paid": {
      const amount = num(o.amount_paid) ?? 0;
      if (amount > 0) {
        await book(event, { kind: "plan", userId: await userIdForCustomer(idOf(o.customer)), amountCents: amount, currency: str(o.currency) });
      }
      break;
    }
    case "invoice.payment_failed":
      await book(event, { kind: "payment_failed", userId: await userIdForCustomer(idOf(o.customer)), amountCents: 0, currency: str(o.currency) });
      break;
    case "charge.refunded": {
      // amount_refunded is cumulative per charge, so key the ledger row on the
      // charge and overwrite it: two partial refunds end as one correct total.
      const chargeId = str(o.id);
      if (!chargeId) break;
      const amount = -(num(o.amount_refunded) ?? 0);
      const userId = await userIdForCustomer(idOf(o.customer));
      await prisma.billingEvent.upsert({
        where: { stripeEventId: `refund:${chargeId}` },
        update: { amountCents: amount, occurredAt: date(event.created) ?? new Date() },
        create: {
          stripeEventId: `refund:${chargeId}`,
          type: event.type,
          kind: "refund",
          userId,
          amountCents: amount,
          currency: (str(o.currency) ?? "cad").toLowerCase(),
          occurredAt: date(event.created) ?? new Date(),
        },
      });
      break;
    }
    default:
      // Not subscribed to in the dashboard setup; ignore quietly.
      break;
  }
}
