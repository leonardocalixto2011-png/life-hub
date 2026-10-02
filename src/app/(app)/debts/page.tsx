import Link from "next/link";
import { Figure } from "@/components/Figure";

import {
  countMyDebtsElsewhere,
  hubChrome,
  listDebtsNeedingOwnerReview,
  listMyDebts,
  listSharedDebts,
  type DebtWithRefs,
} from "@/lib/data";
import { myShares, sharedDebtSummaries } from "@/lib/debt-sharing";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import type { Lang, T } from "@/lib/i18n";
import { countdownLabel, money } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import { Avatar } from "@/components/Avatar";
import { DebtForm } from "./DebtForm";
import { DebtStatusChip } from "./DebtStatusChip";
import { LogPaymentButton } from "./LogPaymentButton";
import { ShareControls } from "./ShareControls";
import { DebtConsentCard } from "./DebtConsentCard";
import { moveMyDebtsHere, withdrawDebtConsent } from "./actions";
import { consentIn } from "@/lib/consent";
import { personName } from "@/lib/people";
import { perMonth } from "@/lib/money";
import { SubmitButton } from "@/components/SubmitButton";

export const dynamic = "force-dynamic";

const TYPE_LABEL: Record<string, string> = {
  CREDIT_CARD: "credit card",
  LINE_OF_CREDIT: "line of credit",
  LOAN: "loan",
  CAR_LOAN: "car loan",
  BNPL: "buy now pay later",
  OTHER: "",
};

const FREQ_SUFFIX: Record<string, string> = {
  WEEKLY: "/wk",
  BIWEEKLY: "/2wk",
  MONTHLY: "/mo",
};

/** Fraction paid off, when we know what it started at. */
function progress(d: DebtWithRefs): number | null {
  if (d.originalBalanceCents == null || d.originalBalanceCents <= 0) return null;
  const paid = d.originalBalanceCents - d.balanceCents;
  return Math.max(0, Math.min(1, paid / d.originalBalanceCents));
}

function Row({
  d,
  own,
  currency,
  locale,
  t,
  lang,
}: {
  d: DebtWithRefs;
  own: boolean;
  currency: string;
  locale: string;
  t: T;
  lang: Lang;
}) {
  const paidOff = d.status === "PAID_OFF";
  const payment = d.actualPaymentCents ?? d.minimumPaymentCents;
  const pct = progress(d);

  return (
    <div className="px-4 py-3.5">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {own ? (
            <Link
              href={`/debts/${d.id}`}
              className="block truncate text-[0.9375rem] font-medium"
              style={{
                textDecoration: paidOff ? "line-through" : "none",
                color: paidOff ? "var(--color-text-dim)" : "var(--color-text)",
              }}
            >
              {d.name}
            </Link>
          ) : (
            <span className="block truncate text-[0.9375rem] font-medium">{d.name}</span>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {TYPE_LABEL[d.type] && (
              <span className="chip text-[var(--color-text-dim)]">{t(TYPE_LABEL[d.type])}</span>
            )}
            {d.venture && <VentureChip name={d.venture.name} color={d.venture.color} />}
            {!own && d.owner && (
              <span className="flex items-center gap-1 text-[0.68rem] text-[var(--color-text-dim)]">
                <Avatar name={d.owner.name} size={16} />
                {personName(d.owner, t("Member"))}
              </span>
            )}
            {own ? (
              <DebtStatusChip
                id={d.id}
                status={d.status}
                name={d.name}
                balanceCents={d.balanceCents}
                currency={currency}
                locale={locale}
              />
            ) : (
              d.status === "DEFAULT" && (
                <span
                  className="chip"
                  style={{ background: "var(--color-danger)", borderColor: "var(--color-danger)", color: "#fff" }}
                >
                  {t("in default")}
                </span>
              )
            )}
            {!paidOff && d.dueDate && (
              <span className="text-[0.68rem] text-[var(--color-text-dim)]">
                {t("due")} {countdownLabel(d.dueDate, lang)}
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 flex-col items-end text-right">
          <div className="row-amount tabular-nums">{money(d.balanceCents, currency, locale)}</div>
          <div className="mt-0.5 text-[0.6875rem] tabular-nums text-[var(--color-text-dim)]">
            {payment != null
              ? `${money(payment, currency, locale)}${t(FREQ_SUFFIX[d.paymentFrequency])}`
              : t("balance")}
            {d.aprBasisPoints != null ? ` · ${(d.aprBasisPoints / 100).toFixed(2)}%` : ""}
          </div>
          {own && !paidOff && payment != null && payment > 0 && (
            <LogPaymentButton id={d.id} amountCents={payment} currency={currency} locale={locale} />
          )}
        </div>
      </div>

      {pct != null && !paidOff && (
        <div className="mt-2.5">
          <div className="h-1.5 rounded-full bg-[var(--color-surface-2)]">
            <div className="h-full rounded-full bg-[var(--color-ok)]" style={{ width: `${Math.max(2, pct * 100)}%` }} />
          </div>
          <div className="mt-1 text-[0.6875rem] text-[var(--color-text-dim)]">
            {t("{pct}% paid off", { pct: Math.round(pct * 100) })}
          </div>
        </div>
      )}
    </div>
  );
}

export default async function DebtsPage() {
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);

  const [{ ventures, members }, [mine, shared, needsReview, elsewhere, consents], shares, summaries] = await Promise.all([
    hubChrome(user.id, hub.id),
    withHub(user.id, (tx) =>
      Promise.all([
        listMyDebts(tx, user.id, hub.id, { includeOther: true }),
        listSharedDebts(tx, hub.id, user.id),
        listDebtsNeedingOwnerReview(tx, user.id),
        countMyDebtsElsewhere(tx, user.id, hub.id),
        // Same transaction as the debts themselves — no extra round trip.
        tx.consent.findMany({
          where: { userId: user.id, revokedAt: null },
          select: { kind: true, hubId: true },
        }),
      ]),
    ),
    myShares(user.id),
    sharedDebtSummaries(hub.id, user.id),
  ]);

  const currency = hub.currency;
  const locale = user.locale ?? "en-CA";

  // Law 25: nothing of the person's own tracker is rendered — and no debt can
  // be added (createDebt re-checks) — until they have expressly agreed.
  const adult = consentIn(consents, "AGE_18");
  const consented = consentIn(consents, "DEBTS_SENSITIVE") && adult;

  const current = mine.filter((d) => d.status !== "PAID_OFF");
  const paidOff = mine.filter((d) => d.status === "PAID_OFF");
  const totalBalance = current.reduce((n, d) => n + d.balanceCents, 0);
  const totalMonthly = current.reduce(
    (n, d) => n + perMonth(d.actualPaymentCents ?? d.minimumPaymentCents ?? 0, d.paymentFrequency),
    0,
  );
  const rowProps = { currency, locale, t, lang };

  return (
    <div className="page">
      <div className="px-1">
        <h1 className="page-title">{t("Debts")}</h1>
        <p className="page-sub">
          {t("Yours alone, and only in {hub} — unless you share them below.", { hub: hub.name })}
        </p>
      </div>

      {!consented && (
        <DebtConsentCard t={t} existingCount={mine.length + elsewhere} alreadyAdult={adult} />
      )}

      {consented && elsewhere > 0 && (
        <form action={moveMyDebtsHere} className="card flex items-center justify-between gap-3 p-4 text-xs">
          <span className="text-[var(--color-text-dim)]">
            {t("{n} of your debts live in another hub, so they aren't shown here.", { n: elsewhere })}
          </span>
          <SubmitButton className="btn btn-primary btn-sm shrink-0" pendingLabel="…">
            {t("Move here")}
          </SubmitButton>
        </form>
      )}

      {consented && needsReview.length > 0 && (
        <div className="card border-[var(--color-danger)] bg-[var(--danger-wash)] p-4 text-xs">
          <div className="font-semibold text-[var(--color-danger)]">
            {t("{n} debts assigned to you automatically", { n: needsReview.length })}
          </div>
          <p className="mt-1 text-[var(--color-text-dim)]">
            {t("When debts became personal these had no owner recorded, so they went to the hub owner. Open each one and save to confirm — or reassign it if it isn't yours:")}{" "}
            {needsReview.map((d) => d.name).join(", ")}.
          </p>
        </div>
      )}

      {consented && (
      <>
      {/* The balance is what this page is about — the only `lg` figure on it. */}
      <div className="card grid grid-cols-2 divide-x divide-[var(--color-border)] p-0">
        <div className="px-2 py-4">
          <Figure cents={totalBalance} currency={currency} locale={locale} label={t("total balance")} size="lg" />
        </div>
        <div className="px-2 py-4">
          <Figure cents={totalMonthly} currency={currency} locale={locale} label={`${t("per month")} · ${t("{n} current", { n: current.length })}`} />
        </div>
      </div>

      <DebtForm ventures={ventures.map((v) => ({ id: v.id, name: v.name }))} members={members} />

      {mine.length === 0 && (
        <p className="card px-5 py-8 text-center text-sm text-[var(--color-text-dim)]">{t("No debts tracked yet.")}</p>
      )}

      {current.length > 0 && (
        <section>
          <h2 className="section-title">
            {t("Current")} · {current.length}
          </h2>
          <div className="list">
            {current.map((d) => (
              <Row key={d.id} d={d} own {...rowProps} />
            ))}
          </div>
        </section>
      )}

      {paidOff.length > 0 && (
        <section>
          <h2 className="section-title">
            {t("Paid off")} · {paidOff.length}
          </h2>
          <div className="list">
            {paidOff.map((d) => (
              <Row key={d.id} d={d} own {...rowProps} />
            ))}
          </div>
        </section>
      )}

      <ShareControls shares={shares} />
      </>
      )}

      {(shared.length > 0 || summaries.length > 0) && (
        <section>
          <h2 className="section-title">
            {t("Shared with {hub}", { hub: hub.name })}
          </h2>

          {summaries.length > 0 && (
            <div className="list mb-2">
              {summaries.map((s) => (
                <div key={s.ownerId} className="flex items-start justify-between gap-3 px-4 py-3.5">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.ownerName ?? t("Member")}</div>
                    <div className="text-[0.68rem] text-[var(--color-text-dim)]">
                      {t("{n} debts", { n: s.debtCount })}
                      {s.inDefaultCount > 0 ? ` · ${t("{n} in default", { n: s.inDefaultCount })}` : ""} · {t("summary only")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="row-amount tabular-nums">{money(s.totalBalanceCents, currency, locale)}</div>
                    <div className="mt-0.5 text-[0.6875rem] tabular-nums text-[var(--color-text-dim)]">
                      {money(s.monthlyPaymentCents, currency, locale)}{t("/mo")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {shared.length > 0 && (
            <div className="list">
              {shared.map((d) => (
                <Row key={d.id} d={d} own={false} {...rowProps} />
              ))}
            </div>
          )}
        </section>
      )}

      {consented && (
        <form action={withdrawDebtConsent} className="px-1 text-xs text-[var(--color-text-dim)]">
          {t("You agreed to Life Hub keeping your debts.")}{" "}
          <button type="submit" className="font-semibold underline">
            {t("Withdraw my consent")}
          </button>
          {" — "}
          {t("your debts stay saved but hidden until you agree again; delete them one by one, or your whole account, to erase them.")}
        </form>
      )}
    </div>
  );
}
