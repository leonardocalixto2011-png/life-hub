import { addCredit } from "@/lib/credits";

/**
 * Where a paid Claude-credit pack lands: the one wallet of lib/credits.ts,
 * never a second balance. Called by the Stripe webhook once the payment is
 * confirmed.
 *
 * Idempotent on `ref` (the Stripe checkout session id, stored as the ledger
 * entry's externalRef): Stripe retries webhooks, and a replay returns false
 * without adding anything. `cents` is the pack's face value in cents of CAD,
 * excluding any sales tax.
 */
export async function creditWallet(userId: string, cents: number, ref: string): Promise<boolean> {
  return addCredit({ userId, cents, kind: "TOPUP", note: "Stripe", externalRef: ref });
}
