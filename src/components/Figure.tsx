import { money } from "@/lib/format";

/**
 * A money figure, sized like it matters.
 *
 * Every headline total in this app was `text-sm font-bold` — 14px, the same
 * size as the label underneath it. People open Life Hub to find out what they
 * owe and what's left; the number is the reason the screen exists, so it gets
 * the largest type on it.
 *
 * One component rather than the same Tailwind string copied onto five pages,
 * because the whole point is that a total looks identical on /budget, /debts
 * and /today. They had already drifted.
 *
 * Tabular figures throughout: these sit in columns and grids, and
 * proportional digits make a column of amounts look ragged and untrustworthy.
 */

type Tone = "neutral" | "ok" | "danger" | "dim";

const TONE: Record<Tone, string | undefined> = {
  neutral: undefined,
  ok: "var(--color-ok)",
  danger: "var(--color-danger)",
  dim: "var(--color-text-dim)",
};

export function Figure({
  cents,
  currency,
  locale,
  label,
  tone = "neutral",
  size = "md",
  align = "center",
}: {
  cents: number;
  currency?: string;
  locale?: string;
  label?: string;
  tone?: Tone;
  /** `lg` for the one figure a page is about; `md` for a row of peers. */
  size?: "lg" | "md";
  align?: "center" | "left";
}) {
  return (
    <div className={align === "center" ? "text-center" : "text-left"}>
      <div
        className={`font-bold tabular-nums ${
          size === "lg" ? "text-[1.6rem] leading-none tracking-[-0.035em]" : "text-lg leading-tight tracking-[-0.02em]"
        }`}
        style={{ color: TONE[tone] }}
      >
        {money(cents, currency, locale)}
      </div>
      {label && (
        <div className="mt-1 text-[0.6rem] uppercase tracking-wide text-[var(--color-text-dim)]">
          {label}
        </div>
      )}
    </div>
  );
}
