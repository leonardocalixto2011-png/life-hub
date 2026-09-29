"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import type { WeekRecapData } from "@/lib/data";

/**
 * "Your week" — a look back at last week, shown on the first visit of a new
 * week (usually a Monday morning) and for the rest of that day, or until it's
 * dismissed. Then it's gone until next week.
 *
 * Only ever positive facts, never a comparison or a streak: "7 things done"
 * is a thing you did; "down 3 from the week before" would be a thing to feel
 * bad about, and a household app has no business keeping score on people.
 * A quiet week gets no card at all rather than a card that says "0".
 */
const KEY = "lh-week-recap";

type Seen = { week: string; day: string; dismissed?: boolean };

function dayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function read(): Seen | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Seen) : null;
  } catch {
    return null;
  }
}

function write(v: Seen) {
  try {
    localStorage.setItem(KEY, JSON.stringify(v));
  } catch {
    /* storage blocked — the card simply shows again next visit */
  }
}

const noop = () => () => {};

export function WeekRecap({
  data,
  formatMoney,
  force = false,
}: {
  data: WeekRecapData;
  /** Always show (design preview only) — skips the once-a-week check. */
  force?: boolean;
  /** Pre-formatted by the server so the client needn't know the hub currency. */
  formatMoney: { in: string; out: string };
}) {
  const t = useT();
  const [dismissed, setDismissed] = useState(false);

  // Pure read — whether this week's recap is still due. Server snapshot is
  // "no", so the card never flashes in the HTML and then vanishes.
  const dueStored = useSyncExternalStore(
    noop,
    () => {
      const s = read();
      if (!s || s.week !== data.weekOf) return true; // first visit this week
      return s.day === dayKey() && !s.dismissed; // still that first day
    },
    () => false,
  );
  const due = force || dueStored;

  // Record the first sighting (a write, not state) so it's gone tomorrow.
  useEffect(() => {
    if (!dueStored || force) return;
    const s = read();
    if (!s || s.week !== data.weekOf) write({ week: data.weekOf, day: dayKey() });
  }, [dueStored, force, data.weekOf]);

  const something = data.done > 0 || data.entries > 0;
  if (!due || dismissed || !something) return null;

  function dismiss() {
    write({ week: data.weekOf, day: dayKey(), dismissed: true });
    setDismissed(true);
  }

  const line =
    data.done >= 10
      ? t("A big week. Well played.")
      : data.done > 0
        ? t("Every box you ticked counts.")
        : t("You kept your money in view — that counts.");

  return (
    <section className="card recap-in relative overflow-hidden p-4" aria-labelledby="week-recap">
      <button
        type="button"
        onClick={dismiss}
        className="icon-btn absolute right-1 top-1 h-10 w-10 text-[var(--color-text-dim)]"
        aria-label={t("Dismiss")}
      >
        <X size={18} strokeWidth={2} aria-hidden />
      </button>
      <h2 id="week-recap" className="section-title px-0">
        {t("Your week")}
      </h2>
      <p className="display pr-8 text-[1.25rem] leading-snug">{line}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        {data.done > 0 && (
          <div className="rounded-xl bg-[var(--color-ok-wash)] px-3 py-2.5">
            <dt className="text-[0.6875rem] font-medium text-[var(--color-text-dim)]">{t("done last week")}</dt>
            <dd className="text-[1.375rem] font-bold leading-tight tabular-nums">{data.done}</dd>
          </div>
        )}
        {data.entries > 0 && (
          <div className="rounded-xl bg-[var(--color-surface-2)] px-3 py-2.5">
            <dt className="text-[0.6875rem] font-medium text-[var(--color-text-dim)]">
              {t("{n} entries logged", { n: data.entries })}
            </dt>
            <dd className="text-[0.9375rem] font-semibold leading-snug tabular-nums">
              {data.outCents > 0 && <span className="block">−{formatMoney.out}</span>}
              {data.inCents > 0 && <span className="block text-[var(--color-ok)]">+{formatMoney.in}</span>}
            </dd>
          </div>
        )}
      </dl>
    </section>
  );
}
