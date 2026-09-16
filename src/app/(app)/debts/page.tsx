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
import { moveMyDebtsHere } from "./actions";
import { perMonth } from "@/lib/money";

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
    <div className="px-3 py-3">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          {own ? (
            <Link
              href={`/debts/${d.id}`}
              className="block truncate font-medium"
              style={{
                textDecoration: paidOff ? "line-through" : "none",
                color: paidOff ? "var(--color-text-dim)" : "var(--color-text)",
              }}
            >
              {d.name}
            </Link>
          ) : (
            <span className="block truncate font-medium">{d.name}</span>
          )}

          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {TYPE_LABEL[d.type] && (
              <span className="chip text-[var(--color-text-dim)]">{t(TYPE_LABEL[d.type])}</span>
            )}
            {d.venture && <VentureChip name={d.venture.name} color={d.venture.color} />}
            {!own && d.owner && (
              <span className="flex items-center gap-1 text-[0.68rem] text-[var(--color-text-dim)]">
                <Avatar name={d.owner.name} email={d.owner.email} size={16} />
                {d.owner.name ?? d.owner.email}
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

        <div className="flex flex-col items-end text-right">
          <div className="font-semibold tabular-nums">{money(d.balanceCents, currency, locale)}</div>
          <div className="text-[0.62rem] uppercase tracking-wide text-[var(--color-text-dim)]">
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
        <div className="mt-2">
          <div className="h-1 rounded-full bg-[var(--color-surface-2)]">
            <div className="h-full rounded-full bg-[var(--color-ok)]" style={{ width: `${Math.max(2, pct * 100)}%` }} />
          </div>
          <div className="mt-0.5 text-[0.6rem] text-[var(--color-text-dim)]">
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

  const [{ ventures, members }, [mine, shared, needsReview, elsewhere], shares, summaries] = await Promise.all([
    hubChrome(user.id, hub.id),
    withHub(user.id, (tx) =>
      Promise.all([
        listMyDebts(tx, user.id, hub.id, { includeOther: true }),
        listSharedDebts(tx, hub.id, user.id),
        listDebtsNeedingOwnerReview(tx, user.id),
        countMyDebtsElsewhere(tx, user.id, hub.id),
      ]),
    ),
    myShares(user.id),
    sharedDebtSummaries(hub.id, user.id),
  ]);

  const currency = hub.currency;
  const locale = user.locale ?? "en-CA";

  const current = mine.filter((d) => d.status !== "PAID_OFF");
  const paidOff = mine.filter((d) => d.status === "PAID_OFF");
  const totalBalance = current.reduce((n, d) => n + d.balanceCents, 0);
  const totalMonthly = current.reduce(
    (n, d) => n + perMonth(d.actualPaymentCents ?? d.minimumPaymentCents ?? 0, d.paymentFrequency),
    0,
  );
  const rowProps = { currency, locale, t, lang };

  return (
    <div className="space-y-4 p-3">
      <div>
        <h1 className="text-lg font-bold">{t("Debts")}</h1>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          {t("Yours alone, and only in {hub} — unless you share them below.", { hub: hub.name })}
        </p>
      </div>

      {elsewhere > 0 && (
        <form action={moveMyDebtsHere} className="card flex items-center justify-between gap-3 p-3 text-xs">
          <span className="text-[var(--color-text-dim)]">
            {t("{n} of your debts live in another hub, so they aren't shown here.", { n: elsewhere })}
          </span>
          <button type="submit" className="btn btn-primary shrink-0 px-3 py-1.5 text-xs">
            {t("Move here")}
          </button>
        </form>
      )}

      {needsReview.length > 0 && (
        <div className="card border-[var(--color-danger)] p-3 text-xs">
          <div className="font-semibold text-[var(--color-danger)]">
            {t("{n} debts assigned to you automatically", { n: needsReview.length })}
          </div>
          <p className="mt-1 text-[var(--color-text-dim)]">
            {t("When debts became personal these had no owner recorded, so they went to the hub owner. Open each one and save to confirm — or reassign it if it isn't yours:")}{" "}
            {needsReview.map((d) => d.name).join(", ")}.
          </p>
        </div>
      )}

      {/* The balance is what this page is about — the only `lg` figure on it. */}
      <div className="card grid grid-cols-2 divide-x divide-[var(--color-border)] p-0">
        <div className="p-3">
          <Figure cents={totalBalance} currency={currency} locale={locale} label={t("total balance")} size="lg" />
        </div>
        <div className="p-3">
          <Figure cents={totalMonthly} currency={currency} locale={locale} label={`${t("per month")} · ${t("{n} current", { n: current.length })}`} />
        </div>
      </div>

      <DebtForm ventures={ventures.map((v) => ({ id: v.id, name: v.name }))} members={members} />

      {mine.length === 0 && (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">{t("No debts tracked yet.")}</p>
      )}

      {current.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {t("Current")} · {current.length}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {current.map((d) => (
              <Row key={d.id} d={d} own {...rowProps} />
            ))}
          </div>
        </section>
      )}

      {paidOff.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {t("Paid off")} · {paidOff.length}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {paidOff.map((d) => (
              <Row key={d.id} d={d} own {...rowProps} />
            ))}
          </div>
        </section>
      )}

      <ShareControls shares={shares} />

      {(shared.length > 0 || summaries.length > 0) && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {t("Shared with {hub}", { hub: hub.name })}
          </h2>

          {summaries.length > 0 && (
            <div className="card mb-2 divide-y divide-[var(--color-border)]">
              {summaries.map((s) => (
                <div key={s.ownerId} className="flex items-start justify-between gap-3 px-3 py-3">
                  <div className="min-w-0">
                    <div className="truncate font-medium">{s.ownerName}</div>
                    <div className="text-[0.68rem] text-[var(--color-text-dim)]">
                      {t("{n} debts", { n: s.debtCount })}
                      {s.inDefaultCount > 0 ? ` · ${t("{n} in default", { n: s.inDefaultCount })}` : ""} · {t("summary only")}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-semibold tabular-nums">{money(s.totalBalanceCents, currency, locale)}</div>
                    <div className="text-[0.62rem] uppercase tracking-wide text-[var(--color-text-dim)]">
                      {money(s.monthlyPaymentCents, currency, locale)}{t("/mo")}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {shared.length > 0 && (
            <div className="card divide-y divide-[var(--color-border)]">
              {shared.map((d) => (
                <Row key={d.id} d={d} own={false} {...rowProps} />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
