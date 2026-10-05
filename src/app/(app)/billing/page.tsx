import Link from "next/link";
import { BadgeCheck, CreditCard, LineChart, Sparkles } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { fmt, langOf } from "@/lib/i18n";
import { money } from "@/lib/format";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";
import { FormSection } from "@/components/Form";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { billingEnabled, coveredHubNames, getPlanRow, planIsPlus } from "@/lib/billing/plan";
import { stripeConfigured } from "@/lib/billing/stripe";
import {
  LIMITS,
  PLUS_COVERED_HUBS,
  PLUS_INCLUDED_ASSISTANT_CENTS,
  PLUS_PRICE_CENTS,
  TRIAL_DAYS,
} from "@/lib/billing/plans";
import { Agree } from "./Agree";
import { cancelPlan, checkoutPlus, openPortal, resumePlan, startTrial } from "./actions";

export const dynamic = "force-dynamic";

/**
 * Plan & billing. Shows the plan, starts the trial, subscribes, cancels in one
 * tap, and points to the Claude credit page for AI top-ups. Before a payment it states who sells, the price
 * in CAD, taxes, renewal and how to cancel (LPC s. 54.4 — distance contracts).
 */
export default async function BillingPage({ searchParams }: { searchParams: Promise<{ done?: string }> }) {
  const user = await requireUser();
  const t = await getT();
  const lang = langOf(user.locale);
  const { done } = await searchParams;
  const [row, hubs] = await Promise.all([getPlanRow(user.id), coveredHubNames(user.id)]);
  const enabled = billingEnabled();
  const plus = planIsPlus(row);
  const cad = (cents: number) => money(cents, "CAD", user.locale ?? "fr-CA");
  const day = (d: Date) => fmt(d, lang === "fr" ? "d MMMM yyyy" : "MMMM d, yyyy", lang);
  const seller = process.env.LEGAL_ENTITY_NAME?.trim() || "Life Hub";
  const payable = enabled && stripeConfigured();

  let status: string;
  if (!enabled) status = t("Beta: every Plus feature is included for everyone, free.");
  else if (!row || !plus) status = t("Free plan.");
  else if (row.status === "COMP")
    status = row.compUntil ? t("Plus, offered until {date}.", { date: day(row.compUntil) }) : t("Plus, offered.");
  else if (row.status === "TRIALING" && row.trialEndsAt)
    status = t("Plus trial until {date}. Nothing is charged when it ends.", { date: day(row.trialEndsAt) });
  else if (row.status === "PAST_DUE") status = t("Plus. Your last payment didn't go through: update your card below.");
  else if (row.cancelAtPeriodEnd && row.currentPeriodEnd)
    status = t("Plus until {date}, then the free plan. It won't renew.", { date: day(row.currentPeriodEnd) });
  else if (row.currentPeriodEnd)
    status = t("Plus, renews on {date} at {price}.", {
      date: day(row.currentPeriodEnd),
      price: cad(row.interval === "YEAR" ? PLUS_PRICE_CENTS.YEAR : PLUS_PRICE_CENTS.MONTH),
    });
  else status = t("Plus.");

  const stripePlan = row?.stripeSubscriptionId && (row.status === "ACTIVE" || row.status === "PAST_DUE");

  return (
    <div className="page">
      <PageHeader back={{ href: "/account", label: t("Your account") }} title={t("Plan & billing")} sub={status} />

      {done === "plus" && <p className="card p-4 text-sm">{t("Thank you! Plus is being switched on; it can take a few seconds.")}</p>}

      {plus && enabled && hubs.length > 0 && (
        <p className="text-sm text-[var(--color-text-dim)]">
          {t("Your Plus covers everyone in: {hubs}.", { hubs: hubs.join(", ") })}
        </p>
      )}

      <section>
        <SectionHeader title={t("What each plan includes")} />
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="card flex flex-col gap-2 p-4">
            <h3 className="font-semibold">{t("Free plan")}</h3>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              <li>{t("Tasks, calendar, budget, debts and trips, unlimited")}</li>
              <li>{t("{n} hub you own, up to {m} members", { n: LIMITS.FREE.ownedHubs, m: LIMITS.FREE.membersPerHub })}</li>
              <li>{t("AI features paid from your own Claude credit ({amount} to start)", { amount: cad(200) })}</li>
            </ul>
          </div>
          <div className="card flex flex-col gap-2 border-[var(--color-primary)] p-4">
            <h3 className="flex items-center gap-2 font-semibold">
              <BadgeCheck size={18} strokeWidth={2} aria-hidden /> Plus
            </h3>
            <p className="text-sm">
              {t("{month} a month or {year} a year", { month: cad(PLUS_PRICE_CENTS.MONTH), year: cad(PLUS_PRICE_CENTS.YEAR) })}
            </p>
            <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
              <li>{t("Covers up to {n} hubs you own, {m} members each", { n: PLUS_COVERED_HUBS, m: LIMITS.PLUS.membersPerHub })}</li>
              <li>{t("Connected mailboxes with automatic sorting")}</li>
              <li>{t("{amount} of Claude credit each month", { amount: cad(PLUS_INCLUDED_ASSISTANT_CENTS) })}</li>
            </ul>
          </div>
        </div>
      </section>

      {enabled && !plus && (
        <>
          {!row?.trialUsedAt && (
            <FormSection title={t("Try Plus free for {n} days", { n: TRIAL_DAYS })}>
              <p className="field-hint mt-0">
                {t("No card asked. When the trial ends you're back on the free plan, unless you subscribe. We email you 3 days before.")}
              </p>
              <ActionForm action={startTrial} className="form-stack">
                <Agree t={t} id="trial" />
                <SubmitButton className="btn btn-primary w-full" pendingLabel="…">
                  <Sparkles size={16} strokeWidth={2} aria-hidden />
                  {t("Start the free trial")}
                </SubmitButton>
              </ActionForm>
            </FormSection>
          )}

          {payable && (
            <FormSection title={t("Subscribe to Plus")}>
              <p className="field-hint mt-0">
                {t("Sold by {seller}, in Canadian dollars. {month} a month or {year} a year, plus applicable taxes. Renews automatically until you cancel; cancel any time here in one tap, and Plus runs to the end of the period already paid. Payment by card through Stripe.", {
                  seller,
                  month: cad(PLUS_PRICE_CENTS.MONTH),
                  year: cad(PLUS_PRICE_CENTS.YEAR),
                })}
              </p>
              <ActionForm action={checkoutPlus} className="form-stack">
                <fieldset className="flex flex-col gap-2 text-sm">
                  <label className="flex items-center gap-2" htmlFor="interval-year">
                    <input id="interval-year" type="radio" name="interval" value="YEAR" defaultChecked />
                    {t("{price} a year (two months free)", { price: cad(PLUS_PRICE_CENTS.YEAR) })}
                  </label>
                  <label className="flex items-center gap-2" htmlFor="interval-month">
                    <input id="interval-month" type="radio" name="interval" value="MONTH" />
                    {t("{price} a month", { price: cad(PLUS_PRICE_CENTS.MONTH) })}
                  </label>
                </fieldset>
                <Agree t={t} id="sub" />
                <SubmitButton className="btn btn-primary w-full" pendingLabel="…">
                  <CreditCard size={16} strokeWidth={2} aria-hidden />
                  {t("Continue to payment")}
                </SubmitButton>
              </ActionForm>
            </FormSection>
          )}
        </>
      )}

      {enabled && row && (row.status === "TRIALING" || stripePlan) && plus && (
        <FormSection title={t("Your subscription")}>
          <div className="flex flex-col gap-2">
            {row.cancelAtPeriodEnd ? (
              <ActionForm action={resumePlan}>
                <SubmitButton className="btn btn-secondary w-full" pendingLabel="…">
                  {t("Keep Plus")}
                </SubmitButton>
              </ActionForm>
            ) : (
              <ActionForm action={cancelPlan}>
                <SubmitButton className="btn btn-secondary w-full" pendingLabel="…">
                  {row.status === "TRIALING" ? t("End the trial") : t("Cancel")}
                </SubmitButton>
              </ActionForm>
            )}
            {row.stripeCustomerId && payable && (
              <ActionForm action={openPortal}>
                <SubmitButton className="btn btn-ghost w-full" pendingLabel="…">
                  {t("Card and invoices")}
                </SubmitButton>
              </ActionForm>
            )}
          </div>
        </FormSection>
      )}

      <FormSection title={t("Claude credit")}>
        <p className="field-hint mt-0">
          {t("For every AI feature: the assistant, quick add, photos and mail sorting. Each person pays for their own use, on any plan.")}
        </p>
        <Link href="/credits" className="btn btn-ghost w-full">
          <Sparkles size={16} strokeWidth={2} aria-hidden />
          {t("Your Claude credit")}
        </Link>
      </FormSection>

      {user.role === "ADMIN" && (
        <Link href="/admin/finance" className="btn btn-ghost w-full">
          <LineChart size={16} strokeWidth={2} aria-hidden />
          {t("Finance dashboard")}
        </Link>
      )}
    </div>
  );
}
