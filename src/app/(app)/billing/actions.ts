"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { grantConsent } from "@/lib/consent";
import { appUrl } from "@/lib/app-invites";
import { rateLimit } from "@/lib/rate-limit";
import { formResult, type ActionResult } from "@/lib/action-result";
import { langOf } from "@/lib/i18n";
import { billingEnabled, getPlanRow, planIsPlus } from "@/lib/billing/plan";
import { stripe, stripeConfigured } from "@/lib/billing/stripe";
import { CREDITS_WIRED } from "@/lib/billing/credits-hook";
import { CREDIT_PACKS_CENTS, TRIAL_DAYS } from "@/lib/billing/plans";

/**
 * Everything a person does on /billing. Each action acts on the caller's own
 * plan only (keyed by the session's user id), on the owner client: the plan
 * tables are server-only.
 *
 * Québec rules this file carries:
 *   - Paid plans are 18+ and need the paid-plan terms accepted first; both are
 *     stamped in the consent ledger with the policy version (`agree`).
 *   - Cancelling is one tap (Bill 10): `cancelPlan` needs no confirmation
 *     page, survey or call, and takes effect at the end of the paid period.
 */

const BILLING_OFF = "Paid plans aren't open yet. Everything is included during the beta.";
const STRIPE_OFF = "Payments aren't set up yet. Try again later.";

async function agree(userId: string, fd: FormData): Promise<void> {
  if (fd.get("adult") !== "on" || fd.get("terms") !== "on") {
    throw new Error("Confirm you are 18 or older and accept the plan terms to continue.");
  }
  await grantConsent(userId, "AGE_18");
  await grantConsent(userId, "PAID_TERMS");
}

/** The 14-day trial: no card, no Stripe, and it simply ends. One per person. */
export async function startTrial(fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    if (!billingEnabled()) throw new Error(BILLING_OFF);
    const row = await getPlanRow(user.id);
    if (planIsPlus(row)) throw new Error("You already have Plus.");
    if (row?.trialUsedAt) throw new Error("You've already used your free trial.");
    await agree(user.id, fd);
    const now = new Date();
    const trialEndsAt = new Date(now.getTime() + TRIAL_DAYS * 86_400_000);
    await prisma.planAccount.upsert({
      where: { userId: user.id },
      update: { status: "TRIALING", trialEndsAt, trialUsedAt: now, trialNoticeSentAt: null },
      create: { userId: user.id, status: "TRIALING", trialEndsAt, trialUsedAt: now },
    });
    revalidatePath("/", "layout");
    return { notice: "Your 14-day Plus trial has started." };
  });
}

/** The person's Stripe customer, created on first need. */
async function customerFor(user: { id: string; email: string; name: string | null; locale: string | null }) {
  const row = await getPlanRow(user.id);
  if (row?.stripeCustomerId) return row.stripeCustomerId;
  const customer = await stripe<{ id: string }>(
    "POST",
    "/customers",
    {
      email: user.email,
      name: user.name ?? undefined,
      preferred_locales: [langOf(user.locale) === "fr" ? "fr-CA" : "en-CA"],
      metadata: { userId: user.id },
    },
    { idempotencyKey: `customer:${user.id}` },
  );
  await prisma.planAccount.upsert({
    where: { userId: user.id },
    update: { stripeCustomerId: customer.id },
    create: { userId: user.id, status: "CANCELED", stripeCustomerId: customer.id },
  });
  return customer.id;
}

function taxParams() {
  // Off until the business registers for GST/QST (small supplier under
  // 30 000 $ over four quarters). Then STRIPE_AUTOMATIC_TAX=1.
  return process.env.STRIPE_AUTOMATIC_TAX === "1"
    ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" }, billing_address_collection: "required" }
    : {};
}

const IntervalSchema = z.enum(["MONTH", "YEAR"]);

/** Stripe Checkout for Plus. Redirects to Stripe's hosted page. */
export async function checkoutPlus(fd: FormData): Promise<ActionResult> {
  let url: string | null = null;
  const res = await formResult(async () => {
    const user = await requireUser();
    if (!billingEnabled()) throw new Error(BILLING_OFF);
    if (!stripeConfigured()) throw new Error(STRIPE_OFF);
    const interval = IntervalSchema.parse(fd.get("interval"));
    const price = interval === "YEAR" ? process.env.STRIPE_PRICE_PLUS_YEAR : process.env.STRIPE_PRICE_PLUS_MONTH;
    if (!price) throw new Error(STRIPE_OFF);
    const row = await getPlanRow(user.id);
    if (row?.stripeSubscriptionId && (row.status === "ACTIVE" || row.status === "PAST_DUE")) {
      throw new Error("You already have Plus.");
    }
    if (!(await rateLimit(`checkout:${user.id}`, 10, 3600)).ok) throw new Error("Too many attempts. Try again in an hour.");
    await agree(user.id, fd);
    const customer = await customerFor(user);
    const session = await stripe<{ url: string }>("POST", "/checkout/sessions", {
      mode: "subscription",
      customer,
      client_reference_id: user.id,
      line_items: [{ price, quantity: 1 }],
      subscription_data: { metadata: { userId: user.id } },
      allow_promotion_codes: true,
      locale: langOf(user.locale) === "fr" ? "fr-CA" : "en",
      success_url: `${appUrl()}/billing?done=plus`,
      cancel_url: `${appUrl()}/billing`,
      ...taxParams(),
    });
    url = session.url;
  });
  if (url) redirect(url);
  return res;
}

/** A one-off AI credit pack. Only offered once the wallet is wired. */
export async function buyCredits(fd: FormData): Promise<ActionResult> {
  let url: string | null = null;
  const res = await formResult(async () => {
    const user = await requireUser();
    if (!CREDITS_WIRED) throw new Error("AI credits aren't on sale yet.");
    if (!stripeConfigured()) throw new Error(STRIPE_OFF);
    const cents = Number(fd.get("cents"));
    if (!(CREDIT_PACKS_CENTS as readonly number[]).includes(cents)) throw new Error("Pick one of the packs.");
    if (!(await rateLimit(`checkout:${user.id}`, 10, 3600)).ok) throw new Error("Too many attempts. Try again in an hour.");
    await agree(user.id, fd);
    const customer = await customerFor(user);
    const fr = langOf(user.locale) === "fr";
    const label = `${fr ? "Crédits IA" : "AI credits"} ${(cents / 100).toFixed(0)} $`;
    const metadata = { kind: "ai_credits", userId: user.id, cents: String(cents) };
    const session = await stripe<{ url: string }>("POST", "/checkout/sessions", {
      mode: "payment",
      customer,
      client_reference_id: user.id,
      line_items: [{ quantity: 1, price_data: { currency: "cad", unit_amount: cents, product_data: { name: label } } }],
      metadata,
      payment_intent_data: { metadata },
      locale: fr ? "fr-CA" : "en",
      success_url: `${appUrl()}/billing?done=credits`,
      cancel_url: `${appUrl()}/billing`,
      ...taxParams(),
    });
    url = session.url;
  });
  if (url) redirect(url);
  return res;
}

/**
 * The cancel button. One tap, no confirmation screen (Bill 10). A paid plan
 * stops renewing and runs to the end of the period already paid; a trial
 * ends now.
 */
export async function cancelPlan(): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    const row = await getPlanRow(user.id);
    if (!row) throw new Error("You don't have a plan to cancel.");
    if (row.status === "TRIALING") {
      await prisma.planAccount.update({ where: { userId: user.id }, data: { status: "CANCELED", trialEndsAt: new Date() } });
    } else if (row.stripeSubscriptionId && (row.status === "ACTIVE" || row.status === "PAST_DUE")) {
      await stripe("POST", `/subscriptions/${row.stripeSubscriptionId}`, { cancel_at_period_end: true });
      await prisma.planAccount.update({ where: { userId: user.id }, data: { cancelAtPeriodEnd: true } });
    } else {
      throw new Error("You don't have a plan to cancel.");
    }
    revalidatePath("/", "layout");
    return { notice: "Cancelled. Nothing more will be charged." };
  });
}

/** Undo a cancellation before the period ends. */
export async function resumePlan(): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    const row = await getPlanRow(user.id);
    if (!row?.stripeSubscriptionId || !row.cancelAtPeriodEnd) throw new Error("There's nothing to resume.");
    await stripe("POST", `/subscriptions/${row.stripeSubscriptionId}`, { cancel_at_period_end: false });
    await prisma.planAccount.update({ where: { userId: user.id }, data: { cancelAtPeriodEnd: false } });
    revalidatePath("/", "layout");
    return { notice: "Plus will renew as before." };
  });
}

/** Stripe's own page for the card on file and past invoices. */
export async function openPortal(): Promise<ActionResult> {
  let url: string | null = null;
  const res = await formResult(async () => {
    const user = await requireUser();
    if (!stripeConfigured()) throw new Error(STRIPE_OFF);
    const row = await getPlanRow(user.id);
    if (!row?.stripeCustomerId) throw new Error("No payment on file yet.");
    const session = await stripe<{ url: string }>("POST", "/billing_portal/sessions", {
      customer: row.stripeCustomerId,
      return_url: `${appUrl()}/billing`,
      locale: langOf(user.locale) === "fr" ? "fr-CA" : "en",
    });
    url = session.url;
  });
  if (url) redirect(url);
  return res;
}
