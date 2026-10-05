"use client";

import { useEffect, useRef, useState } from "react";
import { Check } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { haptic } from "@/lib/haptics";

/**
 * Today's completion as a ring: done / everything that was due by tonight.
 *
 * Two rungs of the celebration ladder, and only two:
 *   - progress (220ms, `--base`): the arc sweeps to its new length when a
 *     tick lands and the page refreshes. No sound, no pop.
 *   - arrival (300ms, `--moment`): when the *last* item of the day is ticked
 *     while you're watching, "Day wrapped ✓" settles in once. Once per day —
 *     a localStorage flag keyed on the date, so re-ticking and un-ticking
 *     can't farm it, and opening the app to an already-finished day shows the
 *     same words without the entrance.
 *
 * Deliberately not the milestone <Celebrate> overlay: finishing a Tuesday is
 * good, not a debt paid off. No confetti, nothing to dismiss, nothing that
 * blocks the way back to work.
 */
const FLAG = "lh-day-wrapped";

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

function alreadyWrapped(): boolean {
  try {
    return localStorage.getItem(FLAG) === todayKey();
  } catch {
    return true; // storage blocked: fail quiet rather than replay every visit
  }
}

function markWrapped() {
  try {
    localStorage.setItem(FLAG, todayKey());
  } catch {
    /* private mode — the moment just isn't remembered */
  }
}

const R = 21;
const C = 2 * Math.PI * R;

export function DayRing({ done, total }: { done: number; total: number }) {
  const t = useT();
  const complete = total > 0 && done >= total;
  const ratio = total > 0 ? Math.min(1, done / total) : 0;
  const prev = useRef<{ done: number; total: number } | null>(null);
  const [arrived, setArrived] = useState(false);

  useEffect(() => {
    const before = prev.current;
    prev.current = { done, total };
    // Only a transition seen on this screen counts — i.e. the person just
    // ticked the last thing. First render (arriving at a finished day) never
    // triggers it.
    if (!before || !complete || before.done >= before.total) return;
    if (alreadyWrapped()) return;
    markWrapped();
    haptic(12);
    // Set from an effect on purpose: the trigger is a change *between*
    // renders (the server refresh after a tick), which only an effect sees.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setArrived(true);
  }, [done, total, complete]);

  if (total === 0) return null;

  return (
    <div className="flex items-center gap-3">
      <div
        className="day-ring relative h-[52px] w-[52px] shrink-0"
        role="img"
        aria-label={t("{done} of {total} done today", { done, total })}
        data-complete={complete ? "" : undefined}
      >
        <svg viewBox="0 0 52 52" className="h-full w-full -rotate-90" aria-hidden>
          <circle cx="26" cy="26" r={R} className="day-ring-track" />
          <circle
            cx="26"
            cy="26"
            r={R}
            className="day-ring-arc"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - ratio)}
            // A round cap on a zero-length arc still draws a dot; at 0% there
            // should be nothing but the track.
            opacity={ratio === 0 ? 0 : 1}
          />
        </svg>
        <span className="absolute inset-0 grid place-items-center text-[0.8125rem] font-bold tabular-nums tracking-tight">
          {complete ? <Check size={20} strokeWidth={2.75} className="text-[var(--color-ok)]" aria-hidden /> : `${done}/${total}`}
        </span>
      </div>
      <div className="min-w-0">
        {complete ? (
          <p
            className={`display text-[1.125rem] leading-tight text-[var(--color-ok)] ${arrived ? "day-arrive" : ""}`}
            role={arrived ? "status" : undefined}
          >
            {t("Day wrapped ✓")}
          </p>
        ) : (
          <p className="text-[0.9375rem] font-semibold leading-tight">
            {done === 0
              ? t("{n} to do today", { n: total - done })
              : t("{n} left — nice pace", { n: total - done })}
          </p>
        )}
        {/* Only once the day is done: before that, the ring already shows
            "0/1" and the line above says how many are left — a third
            "0 of 1 done today" just repeated them. */}
        {complete && (
          <p className="mt-0.5 text-xs text-[var(--color-text-dim)]">{t("Everything due today is done.")}</p>
        )}
      </div>
    </div>
  );
}
