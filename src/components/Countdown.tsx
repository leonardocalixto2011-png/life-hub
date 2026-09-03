import { countdownLabel, daysUntil } from "@/lib/format";

/** Big signed day count + label. Red when overdue, amber within 3 days. */
export function Countdown({ date, done = false }: { date: Date; done?: boolean }) {
  const d = daysUntil(date);
  const color = done
    ? "var(--color-text-dim)"
    : d < 0
      ? "var(--color-danger)"
      : d <= 3
        ? "#b45309"
        : "var(--color-text)";

  return (
    <div className="text-right leading-none" style={{ color }}>
      <div className="text-xl font-bold tabular-nums">
        {done ? "✓" : d < 0 ? `−${Math.abs(d)}` : d}
      </div>
      <div className="text-[0.62rem] font-semibold uppercase tracking-wide">
        {done ? "done" : d < 0 ? "days over" : d === 1 ? "day" : "days"}
      </div>
      <div className="mt-0.5 text-[0.62rem] text-[var(--color-text-dim)]">
        {countdownLabel(date)}
      </div>
    </div>
  );
}
