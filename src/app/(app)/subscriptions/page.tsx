import Link from "next/link";
import { ChevronRight, TrendingUp } from "lucide-react";
import { subDays } from "date-fns";

import { hubChrome, listSubscriptions, type SubscriptionWithRefs } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import type { Lang, T } from "@/lib/i18n";
import { countdownLabel, daysUntil, money } from "@/lib/format";
import { BILLING_LABEL, monthlyCents, yearlyCents } from "@/lib/money";
import { VentureChip } from "@/components/VentureChip";
import { Avatar } from "@/components/Avatar";
import { SubscriptionForm } from "./SubscriptionForm";
import { setSubscriptionStatus } from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { Figure } from "@/components/Figure";

export const dynamic = "force-dynamic";

function Row({ s, t, lang, locale }: { s: SubscriptionWithRefs; t: T; lang: Lang; locale: string }) {
  const cancelled = s.status === "CANCELLED";
  const cancelDays = s.cancelByDate ? daysUntil(s.cancelByDate) : null;
  const cancelUrgent = cancelDays !== null && cancelDays <= 14;

  return (
    <div className="flex items-start gap-3 px-4 py-3.5">
      <div className="min-w-0 flex-1">
        <Link
          href={`/subscriptions/${s.id}`}
          className="block truncate text-[0.9375rem] font-medium"
          style={{
            textDecoration: cancelled ? "line-through" : "none",
            color: cancelled ? "var(--color-text-dim)" : "var(--color-text)",
          }}
        >
          {s.name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {s.venture && <VentureChip name={s.venture.name} color={s.venture.color} />}
          {s.owner && <Avatar name={s.owner.name} size={18} />}
          {!cancelled && (
            <span className="text-[0.68rem] text-[var(--color-text-dim)]">
              {t("renews")} {countdownLabel(s.renewalDate, lang)}
            </span>
          )}
          {s.cancelByDate && !cancelled && (
            <span
              className="chip"
              style={
                cancelUrgent
                  ? { background: "var(--color-danger)", borderColor: "var(--color-danger)", color: "#fff" }
                  : undefined
              }
            >
              {t("cancel by")} {countdownLabel(s.cancelByDate, lang)}
            </span>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div className="row-amount tabular-nums">{money(s.costCents, s.currency, locale)}</div>
        <div className="mt-0.5 text-[0.6875rem] text-[var(--color-text-dim)]">
          {t(BILLING_LABEL[s.billingCycle])}
        </div>
        <form action={setSubscriptionStatus} className="mt-1">
          <input type="hidden" name="id" value={s.id} />
          <input type="hidden" name="status" value={cancelled ? "ACTIVE" : "CANCELLED"} />
          <SubmitButton className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline" pendingLabel="…">
            {cancelled ? t("reactivate") : t("mark cancelled")}
          </SubmitButton>
        </form>
      </div>
    </div>
  );
}

export default async function SubscriptionsPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);
  const [subs, { ventures, members }] = await Promise.all([
    withHub(user.id, (tx) => listSubscriptions(tx, hub.id, { includeCancelled: true })),
    hubChrome(user.id, hub.id),
  ]);

  const active = subs.filter((s) => s.status === "ACTIVE");
  const cancelled = subs.filter((s) => s.status === "CANCELLED");
  const monthTotal = active.reduce((n, s) => n + monthlyCents(s.costCents, s.billingCycle), 0);
  const yearTotal = active.reduce((n, s) => n + yearlyCents(s.costCents, s.billingCycle), 0);
  // Hub currency, not the first row's — monthTotal/yearTotal sum across
  // every subscription, which is only meaningful in a single currency.
  const currency = hub.currency;
  const locale = user.locale ?? "en-CA";

  // Creep signal: monthly value of subs added in the last 60 days.
  const since = subDays(new Date(), 60);
  const recentNew = active.filter((s) => s.createdAt >= since);
  const recentMonthly = recentNew.reduce(
    (n, s) => n + monthlyCents(s.costCents, s.billingCycle),
    0,
  );
  const creep =
    recentNew.length >= 2 && recentMonthly > 0
      ? { count: recentNew.length, monthly: recentMonthly }
      : null;

  return (
    <div className="page">
      <div className="flex items-end justify-between gap-3 px-1">
        <h1 className="page-title">{t("Subscriptions")}</h1>
        <Link href="/debts" className="section-link">
          {t("Debts")}
          <ChevronRight size={14} strokeWidth={2.25} aria-hidden />
        </Link>
      </div>

      {/* Same Figure as /budget and /debts, so a monthly total looks like a
          monthly total everywhere. */}
      <div className="card grid grid-cols-2 divide-x divide-[var(--color-border)] p-0">
        <div className="px-2 py-4">
          <Figure cents={monthTotal} currency={currency} locale={locale} label={t("per month")} size="lg" />
        </div>
        <div className="px-2 py-4">
          <Figure
            cents={yearTotal}
            currency={currency}
            locale={locale}
            label={`${t("per year")} · ${t("{n} active", { n: active.length })}`}
          />
        </div>
      </div>
      {creep && (
        <div className="card flex items-start gap-2.5 border-[var(--color-warn)] p-4 text-xs">
          <TrendingUp size={16} strokeWidth={2.25} className="mt-px shrink-0" style={{ color: "var(--color-warn)" }} aria-hidden />
          <span>
          <span className="font-semibold" style={{ color: "var(--color-warn)" }}>
            {t("{amount}/mo added in the last 60 days", { amount: money(creep.monthly, currency, locale) })}
          </span>{" "}
          <span className="text-[var(--color-text-dim)]">
            {t("({n} new subscriptions) — worth a review.", { n: creep.count })}
          </span>
          </span>
        </div>
      )}
      {active.some((s) => s.currency !== currency) && (
        <p className="px-1 text-xs text-[var(--color-text-dim)]">
          {t("Totals assume {currency}; mixed currencies aren't converted.", { currency })}
        </p>
      )}

      <SubscriptionForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
      />

      {subs.length === 0 && (
        <p className="card px-5 py-8 text-center text-sm text-[var(--color-text-dim)]">
          {t("No subscriptions tracked. Add the recurring ones so renewals don't surprise you.")}
        </p>
      )}

      {active.length > 0 && (
        <section>
          <h2 className="section-title">
            {t("Active")} · {active.length}
          </h2>
          <div className="list">
            {active.map((s) => (
              <Row key={s.id} s={s} t={t} lang={lang} locale={locale} />
            ))}
          </div>
        </section>
      )}

      {cancelled.length > 0 && (
        <section>
          <h2 className="section-title">
            {t("Cancelled")} · {cancelled.length}
          </h2>
          <div className="list">
            {cancelled.map((s) => (
              <Row key={s.id} s={s} t={t} lang={lang} locale={locale} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
