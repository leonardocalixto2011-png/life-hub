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

/** AI credit packs, cents of CAD. Credits never expire and never auto-reload. */
export const CREDIT_PACKS_CENTS = [500, 1000, 2500] as const;

/**
 * What a credit costs us, as a multiple of Anthropic's list price. ×2 covers
 * Stripe (8.9 % on a 5 $ pack), currency swings and rounding, and leaves a
 * margin. Read by the wallet's metering, not by checkout.
 */
export const CREDIT_MARKUP = 2;

export const TRIAL_DAYS = 14;

/** Days before the trial ends that the Bill 10 notice goes out (law: 2–10). */
export const TRIAL_NOTICE_DAYS = 3;

export type PlanName = "FREE" | "PLUS";

export type PlanLimits = {
  /** Hubs a person may own (create). */
  ownedHubs: number;
  /** Members (active + invited) per hub. */
  membersPerHub: number;
  /** AI quick-adds (text, voice, photo) per person per 30 days; null = fair use only. */
  aiQuickAddsPerMonth: number | null;
  /** Mailbox connectors and AI mail sorting. */
  mailboxes: boolean;
};

export const LIMITS: Record<PlanName, PlanLimits> = {
  FREE: { ownedHubs: 1, membersPerHub: 6, aiQuickAddsPerMonth: 30, mailboxes: false },
  PLUS: { ownedHubs: 10, membersPerHub: 10, aiQuickAddsPerMonth: null, mailboxes: true },
};

/** A Plus subscriber's plan covers this many of the hubs they own (oldest first). */
export const PLUS_COVERED_HUBS = 3;

/** Assistant credit included with Plus each month, cents of CAD, not carried over. */
export const PLUS_INCLUDED_ASSISTANT_CENTS = 200;
