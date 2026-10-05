import { notFound } from "next/navigation";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { fmt, langOf } from "@/lib/i18n";
import { money } from "@/lib/format";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";
import { FormSection } from "@/components/Form";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { Figure } from "@/components/Figure";
import { billingEnabled } from "@/lib/billing/plan";
import { stripeConfigured } from "@/lib/billing/stripe";
import { financeSnapshot } from "@/lib/billing/finance";
import { compAllOwners, grantComp } from "./actions";

export const dynamic = "force-dynamic";

/**
 * The finance department's desk: who pays, what came in, what it cost, and
 * how far from break-even. App ADMIN only (404 for anyone else, so the page's
 * existence isn't advertised). Aggregates only — no customer names.
 */
export default async function FinancePage() {
  const user = await requireUser();
  if (user.role !== "ADMIN") notFound();
  const t = await getT();
  const lang = langOf(user.locale);
  const locale = user.locale ?? "fr-CA";
  const s = await financeSnapshot();
  const cad = (c: number) => money(c, "CAD", locale);
  const l = s.last30;

  const kindLabel: Record<string, string> = {
    plan: t("Plus payment"),
    credits: t("Claude credit"),
    refund: t("Refund"),
    payment_failed: t("Failed payment"),
  };
  const rows: [string, number][] = [
    [t("Plus subscriptions"), l.planRevenue],
    [t("Claude credit sold"), l.creditRevenue],
    [t("Refunds"), l.refunds],
    [t("Stripe fees (est.)"), l.fees ? -l.fees : 0],
    [t("Claude API"), l.aiCostCents ? -l.aiCostCents : 0],
    [t("Servers and services"), -l.fixedCents],
  ];

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/billing", label: t("Plan & billing") }}
        title={t("Finance")}
        sub={
          !billingEnabled()
            ? t("Billing is off (beta): nobody is charged and everyone has Plus.")
            : stripeConfigured()
              ? t("Billing is on.")
              : t("Billing is on, but Stripe isn't configured yet.")
        }
      />

      <section className="card grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Figure cents={s.mrrCents} locale={locale} label={t("monthly recurring")} />
        <Figure cents={s.arrCents} locale={locale} label={t("yearly run rate")} />
        <Figure cents={l.net} locale={locale} label={t("net, last 30 days")} tone={l.net < 0 ? "danger" : "ok"} />
        <div className="text-center">
          <div className="text-[1.25rem] font-bold leading-none tabular-nums">
            {s.counts.paying} / {s.breakEven}
          </div>
          <div className="mt-1.5 text-[0.6875rem] font-medium text-[var(--color-text-dim)]">{t("paying / break-even")}</div>
        </div>
      </section>

      <section>
        <SectionHeader title={t("Households")} />
        <div className="list">
          {(
            [
              [t("Paying"), s.counts.paying],
              [t("of which yearly"), s.counts.yearly],
              [t("On trial"), s.counts.trialing],
              [t("Offered (beta, founders)"), s.counts.comp],
              [t("Payment failing"), s.counts.pastDue],
              [t("Cancelled, running to period end"), s.counts.cancelling],
            ] as [string, number][]
          ).map(([label, n]) => (
            <div key={label} className="row pr-3">
              <span className="row-main row-title">{label}</span>
              <span className="tabular-nums font-semibold">{n}</span>
            </div>
          ))}
        </div>
      </section>

      <section>
        <SectionHeader title={t("Last 30 days")} />
        <div className="list">
          {rows.map(([label, c]) => (
            <div key={label} className="row pr-3">
              <span className="row-main row-title">{label}</span>
              <span className="tabular-nums font-semibold" style={{ color: c < 0 ? "var(--color-danger)" : undefined }}>
                {cad(c)}
              </span>
            </div>
          ))}
          <div className="row pr-3">
            <span className="row-main row-title font-bold">{t("Net")}</span>
            <span className="tabular-nums font-bold">{cad(l.net)}</span>
          </div>
        </div>
        <p className="field-hint">
          {t("Claude: {calls} requests at Anthropic's price, from the credit ledger; people were charged {used} for them. Credit still held in wallets: {held}. Servers: {fixed} a month, set with FIN_FIXED_MONTHLY_CAD from the real invoices.", {
            calls: l.aiCalls.toLocaleString(locale),
            used: cad(l.creditUsedCents),
            held: cad(s.creditOutstandingCents),
            fixed: cad(l.fixedCents),
          })}
        </p>
      </section>

      {s.recent.length > 0 && (
        <section>
          <SectionHeader title={t("Latest movements")} />
          <div className="list">
            {s.recent.map((e, i) => (
              <div key={i} className="row pr-3">
                <span className="row-main">
                  <span className="row-title">{kindLabel[e.kind] ?? e.kind}</span>
                  <span className="row-sub">{fmt(e.occurredAt, lang === "fr" ? "d MMM yyyy" : "MMM d, yyyy", lang)}</span>
                </span>
                <span className="tabular-nums">{money(e.amountCents, e.currency.toUpperCase(), locale)}</span>
              </div>
            ))}
          </div>
        </section>
      )}

      <FormSection title={t("Offer Plus to someone")}>
        <ActionForm action={grantComp} className="form-stack">
          <label className="field-label">
            {t("Their email address")}
            <input name="email" type="email" required autoComplete="off" className="field" />
          </label>
          <label className="field-label">
            {t("Until (empty = no end)")}
            <input name="until" type="date" className="field" />
          </label>
          <label className="field-label">
            {t("Note")}
            <input name="note" maxLength={120} className="field" placeholder={t("founder, friend, support…")} />
          </label>
          <SubmitButton className="btn btn-primary w-full" pendingLabel="…">
            {t("Offer Plus")}
          </SubmitButton>
        </ActionForm>
      </FormSection>

      <FormSection title={t("Thank the beta households")}>
        <p className="field-hint mt-0">
          {t("Gives Plus until the date to everyone who owns a hub today. Do it before turning billing on. People who already pay are left alone.")}
        </p>
        <ActionForm action={compAllOwners} className="form-stack">
          <label className="field-label">
            {t("Until")}
            <input name="until" type="date" required className="field" />
          </label>
          <SubmitButton className="btn btn-secondary w-full" pendingLabel="…">
            {t("Offer Plus to every hub owner")}
          </SubmitButton>
        </ActionForm>
      </FormSection>
    </div>
  );
}
