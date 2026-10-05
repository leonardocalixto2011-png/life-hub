import { logWarn } from "@/lib/observability";

/**
 * Where a paid AI-credit pack lands. The wallet itself (balance, metering of
 * each AI call) belongs to the assistant work; billing only has to hand it a
 * top-up once Stripe has confirmed the payment.
 *
 * Until the wallet exists this returns false and the purchase stays recorded
 * in the BillingEvent ledger (kind "credits", the Stripe checkout session id
 * as reference), so nothing paid is lost: the wallet can be credited from the
 * ledger once wired. The credit packs are hidden on /billing while
 * CREDITS_WIRED is false, so in practice nobody can buy before that.
 *
 * Contract for the replacement: idempotent on `ref` (Stripe retries webhooks),
 * `cents` is the pack's face value in cents of CAD, excluding any sales tax.
 */
export const CREDITS_WIRED: boolean = false;

export async function creditWallet(userId: string, cents: number, ref: string): Promise<boolean> {
  logWarn("billing.credits_not_wired", { userId, cents, ref });
  return false;
}
