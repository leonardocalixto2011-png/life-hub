import { countdownLabel, daysUntil } from "@/lib/format";
import type { Lang } from "@/lib/i18n";
import { translate } from "@/lib/i18n";

/** Big signed day count + label. Red when overdue, amber within 3 days. */
export function Countdown({
  date,
  done = false,
  lang = "en",
}: {
  date: Date;
  done?: boolean;
  lang?: Lang;
}) {
  const d = daysUntil(date);
  const color = done
    ? "var(--color-text-dim)"
    : d < 0
      ? "var(--color-danger)"
      : d <= 3
        ? "#b45309"
        : "var(--color-text)";
  const t = (k: string) => translate(lang, k);

  return (
    <div className="text-right leading-none" style={{ color }}>
      <div className="text-xl font-bold tabular-nums">
        {done ? "✓" : d < 0 ? `−${Math.abs(d)}` : d}
      </div>
      <div className="text-[0.62rem] font-semibold uppercase tracking-wide">
        {done ? t("done") : d < 0 ? t("days over") : d === 1 ? t("day") : t("days")}
      </div>
      <div className="mt-0.5 text-[0.62rem] text-[var(--color-text-dim)]">
        {countdownLabel(date, lang)}
      </div>
    </div>
  );
}
