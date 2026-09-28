import "./viz.css";

import { isSameDay } from "date-fns";

import { fmt, translate, type Lang } from "@/lib/i18n";

/**
 * Hours free together, per day of the week — one series, so one colour and no
 * legend box; the title names it. The value rides each column's cap, which is
 * the whole label budget: seven numbers, nothing else.
 */
export function WeekFreeBars({
  days,
  lang,
  now,
}: {
  days: { date: Date; freeMinutes: number }[];
  lang: Lang;
  now: Date;
}) {
  const t = (k: string, v?: Record<string, string | number>) => translate(lang, k, v);
  const maxMin = 16 * 60; // the 7:00–23:00 window freeWindows measures
  const hours = (m: number) => {
    const h = Math.round((m / 60) * 10) / 10;
    return lang === "fr" ? `${String(h).replace(".", ",")} h` : `${h}h`;
  };
  const total = days.reduce((n, d) => n + d.freeMinutes, 0);

  return (
    <figure className="viz card p-3" aria-label={t("Free time together this week")}>
      <figcaption className="flex items-baseline justify-between">
        <span className="text-xs font-semibold">{t("Free time together this week")}</span>
        <span className="text-xs font-semibold text-[var(--color-text-dim)]">{hours(total)}</span>
      </figcaption>
      <div className="mt-3 grid h-24 grid-cols-7 items-end gap-1 border-b border-[var(--viz-axis)]">
        {days.map((d) => {
          const pct = Math.max(0, Math.min(1, d.freeMinutes / maxMin));
          const tip = `${fmt(d.date, "EEEE", lang)} · ${hours(d.freeMinutes)}`;
          return (
            <div key={d.date.toISOString()} className="flex h-full flex-col items-center justify-end">
              <span className="mb-0.5 text-[0.6rem] font-semibold tabular-nums text-[var(--color-text-dim)]">
                {d.freeMinutes > 0 ? hours(d.freeMinutes) : "–"}
              </span>
              <span
                tabIndex={0}
                role="img"
                aria-label={tip}
                data-tip={tip}
                className="viz-hit !relative block w-full max-w-6 rounded-t"
                style={{
                  height: `${Math.max(pct * 100, d.freeMinutes > 0 ? 3 : 0)}%`,
                  background: "var(--viz-free)",
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1 text-center text-[0.6rem] text-[var(--viz-muted)]">
        {days.map((d) => (
          <span
            key={d.date.toISOString()}
            className={isSameDay(d.date, now) ? "font-bold text-[var(--color-text)]" : undefined}
          >
            {fmt(d.date, "EEEEE", lang).toUpperCase()}
          </span>
        ))}
      </div>
    </figure>
  );
}
