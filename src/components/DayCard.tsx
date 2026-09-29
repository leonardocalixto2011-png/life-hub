import Link from "next/link";

import { money } from "@/lib/format";
import type { T } from "@/lib/i18n";

/** One figure in the "Your day" card — sized like Figure (md) so it reads as
 *  the same system as the Budget row below, but takes a pre-formatted value
 *  because one of the three is a count, not money. */
function DayStat({
  href,
  value,
  label,
  danger,
}: {
  href: string;
  value: string;
  label: string;
  danger?: boolean;
}) {
  return (
    <Link
      href={href}
      className="block min-w-0 rounded-xl px-2 py-2.5 text-center transition-colors hover:bg-[var(--color-surface-2)] active:bg-[var(--color-surface-2)]"
    >
      <div
        className="truncate text-[1.375rem] font-bold leading-none tracking-[-0.03em] tabular-nums"
        style={{ color: danger ? "var(--color-danger)" : undefined }}
      >
        {value}
      </div>
      <div className="mt-1.5 text-[0.6875rem] font-medium text-[var(--color-text-dim)]">{label}</div>
    </Link>
  );
}

export function DayCard({
  day,
  currency,
  locale,
  t,
}: {
  day: { dueToday: number; outWeekCents: number; budgetLeftCents: number | null };
  currency: string;
  locale: string;
  t: T;
}) {
  const $ = (cents: number) => money(cents, currency, locale);
  const stats: { href: string; value: string; label: string; danger?: boolean }[] = [];
  if (day.dueToday > 0) {
    stats.push({ href: "/agenda", value: String(day.dueToday), label: t("due today") });
  }
  if (day.outWeekCents > 0) {
    stats.push({ href: "/budget", value: $(day.outWeekCents), label: t("out in 7 days") });
  }
  if (day.budgetLeftCents != null) {
    const over = day.budgetLeftCents < 0;
    stats.push({
      href: "/budget",
      value: $(Math.abs(day.budgetLeftCents)),
      label: over ? t("over budget") : t("left in budget"),
      danger: over,
    });
  }
  const calm = day.dueToday === 0 && day.outWeekCents === 0;

  return (
    <section aria-labelledby="your-day" className="card overflow-hidden p-4 pb-3">
      <h2 id="your-day" className="section-title px-0">
        {t("Your day")}
      </h2>
      {calm && <p className="text-[0.9375rem] font-medium">{t("Nothing urgent today.")}</p>}
      {stats.length > 0 && (
        // auto-fit: three across on a phone, wrapping rather than squeezing
        // when a long amount or a narrow screen needs the room.
        <div className="-mx-2 grid grid-cols-[repeat(auto-fit,minmax(6.5rem,1fr))] gap-1">
          {stats.map((s) => (
            <DayStat key={s.label} {...s} />
          ))}
        </div>
      )}
    </section>
  );
}

