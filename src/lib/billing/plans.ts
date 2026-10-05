/**
 * The price list and what each plan includes. A plain module (no server
 * imports) so pages, client components and server code all read one source.
 * The full reasoning is in MONETIZATION.md.
 *
 * Prices here are for DISPLAY only. What a person is actually charged is the
 * Stripe Price behind STRIPE_PRICE_PLUS_MONTH / STRIPE_PRICE_PLUS_YEAR; keep
 * these two numbers equal to those prices, and change both together (with the
 * 30-day notice the terms promise, LPC s. 11.2).
 */

/** Cents of CAD. 5,99 $ a month, 59 $ a year (two months free). */
export const PLUS_PRICE_CENTS = { MONTH: 599, YEAR: 5900 } as const;

/**
 * Claude credit top-ups sold by card, cents of CAD; they land in the wallet of
 * lib/credits.ts. Credits never expire and never auto-reload. The markup
 * (AI_CREDIT_MARKUP, default ×2) is applied when calls are metered, not here.
 */
export const CREDIT_PACKS_CENTS = [500, 1000, 2000, 5000] as const;

export const TRIAL_DAYS = 14;

/** Days before the trial ends that the Bill 10 notice goes out (law: 2–10). */
export const TRIAL_NOTICE_DAYS = 3;

export type PlanName = "FREE" | "PLUS";

export type PlanLimits = {
  /** Hubs a person may own (create). */
  ownedHubs: number;
  /** Members (active + invited) per hub. */
  membersPerHub: number;
  /** Mailbox connectors and AI mail sorting. */
  mailboxes: boolean;
};

export const LIMITS: Record<PlanName, PlanLimits> = {
  FREE: { ownedHubs: 1, membersPerHub: 6, mailboxes: false },
  PLUS: { ownedHubs: 10, membersPerHub: 10, mailboxes: true },
};

/** A Plus subscriber's plan covers this many of the hubs they own (oldest first). */
export const PLUS_COVERED_HUBS = 3;

/**
 * Claude credit granted each month to a paying Plus subscriber (lib/billing/
 * monthly-credit.ts). Lands in their wallet like any credit and does not expire.
 */
export const PLUS_INCLUDED_ASSISTANT_CENTS = 200;
