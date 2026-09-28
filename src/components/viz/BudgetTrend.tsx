import "./viz.css";

import { endOfMonth, isSameMonth, startOfMonth, subMonths } from "date-fns";

import { withHub } from "@/lib/hub-context";
import { fmt, translate, type Lang } from "@/lib/i18n";
import { money } from "@/lib/format";

const MONTHS = 6;

/** A clean axis top: 1, 2, 2.5 or 5 times a power of ten, at or above `v`. */
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * In vs out for the six months ending at the month being viewed — grouped
 * columns on one axis (same unit, so no second scale), in the two leading
 * categorical slots. Totals follow `budgetMonth`'s rules exactly: same hub,
 * same venture filter, settle-ups excluded. Every value is in the table view.
 */
export async function BudgetTrend({
  userId,
  hubId,
  month,
  ventureSlug,
  currency,
  locale,
  lang,
}: {
  userId: string;
  hubId: string;
  month: Date;
  ventureSlug?: string;
  currency: string;
  locale: string;
  lang: Lang;
}) {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const first = startOfMonth(subMonths(month, MONTHS - 1));
  const last = endOfMonth(month);

  const rows = await withHub(userId, (tx) =>
    tx.budgetEntry.findMany({
      where: {
        hubId,
        isSettlement: false,
        date: { gte: first, lte: last },
        ...(ventureSlug ? { venture: { slug: ventureSlug } } : {}),
      },
      select: { date: true, type: true, amountCents: true },
    }),
  );

  const months = Array.from({ length: MONTHS }, (_, i) => {
    const m = startOfMonth(subMonths(month, MONTHS - 1 - i));
    const inMonth = rows.filter((r) => isSameMonth(r.date, m));
    const income = inMonth.filter((r) => r.type === "INCOME").reduce((n, r) => n + r.amountCents, 0);
    const expense = inMonth.filter((r) => r.type === "EXPENSE").reduce((n, r) => n + r.amountCents, 0);
    return { m, income, expense };
  });

  // Nothing logged across the whole window: a stat line says it better than
  // six empty column pairs.
  if (months.every((x) => x.income === 0 && x.expense === 0)) return null;

  const top = niceCeil(Math.max(...months.flatMap((x) => [x.income, x.expense])));
  const $ = (c: number) => money(c, currency, locale);
  const $short = (c: number) =>
    new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(c / 100);
  const pct = (c: number) => `${Math.max(c > 0 ? 1.5 : 0, (c / top) * 100)}%`;
  const series = [
    { key: "income" as const, label: t("in"), color: "var(--viz-1)" },
    { key: "expense" as const, label: t("out"), color: "var(--viz-2)" },
  ];

  return (
    <figure className="viz card p-3" aria-label={t("In and out, last 6 months")}>
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-xs font-semibold">{t("In and out, last 6 months")}</span>
        <span className="flex gap-3 text-[0.65rem] text-[var(--color-text-dim)]">
          {series.map((s) => (
            <span key={s.key} className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} aria-hidden />
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>

      <div className="relative mt-3 h-28">
        {/* Top gridline carries the scale; the baseline anchors the columns. */}
        <div className="absolute inset-x-0 top-0 border-t border-[var(--viz-grid)]" aria-hidden />
        <span className="absolute -top-2 right-0 bg-[var(--color-surface)] pl-1 text-[0.56rem] tabular-nums text-[var(--viz-muted)]" aria-hidden>
          {$short(top)}
        </span>
        <div className="absolute inset-0 grid grid-cols-6 items-end gap-2 border-b border-[var(--viz-axis)]">
          {months.map((x) => (
            <div key={x.m.toISOString()} className="flex h-full items-end justify-center gap-[2px]">
              {series.map((s) => {
                const v = x[s.key];
                const tip = `${fmt(x.m, "MMM yyyy", lang)} · ${s.label} ${$(v)}`;
                return (
                  <span
                    key={s.key}
                    tabIndex={0}
                    role="img"
                    aria-label={tip}
                    data-tip={tip}
                    className="viz-hit !relative block w-full max-w-3 rounded-t-[4px]"
                    style={{ height: pct(v), background: s.color }}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-1 grid grid-cols-6 gap-2 text-center text-[0.6rem] text-[var(--viz-muted)]">
        {months.map((x) => (
          <span key={x.m.toISOString()} className={isSameMonth(x.m, month) ? "font-bold text-[var(--color-text)]" : undefined}>
            {fmt(x.m, "MMM", lang)}
          </span>
        ))}
      </div>

      <details className="mt-2">
        <summary className="cursor-pointer list-none text-[0.65rem] font-semibold text-[var(--color-primary)]">
          {t("See the numbers")}
        </summary>
        <table className="mt-1.5 w-full text-[0.68rem] tabular-nums">
          <thead className="text-[var(--color-text-dim)]">
            <tr>
              <th className="text-left font-semibold">{t("Month")}</th>
              <th className="text-right font-semibold">{t("in")}</th>
              <th className="text-right font-semibold">{t("out")}</th>
              <th className="text-right font-semibold">{t("net")}</th>
            </tr>
          </thead>
          <tbody>
            {months.map((x) => (
              <tr key={x.m.toISOString()}>
                <td className="capitalize">{fmt(x.m, "MMM yyyy", lang)}</td>
                <td className="text-right">{$(x.income)}</td>
                <td className="text-right">{$(x.expense)}</td>
                <td
                  className="text-right font-semibold"
                  style={{ color: x.income - x.expense < 0 ? "var(--color-danger)" : undefined }}
                >
                  {$(x.income - x.expense)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}
