"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The top rung of the celebration ladder — the only place in Life Hub that
 * spends real time on an animation.
 *
 * Everything else acknowledges (a tick is 220ms and silent). This is for the
 * handful of things that genuinely deserve a moment: clearing a debt, joining
 * a hub. Keeping it rare is the entire point; if this fires on routine
 * actions it stops meaning anything and becomes something to dismiss.
 *
 * Guardrails, because a celebration must never become a step:
 *   - It fires *after* the action has already committed. Nothing waits on it.
 *   - It dismisses itself. Tap, Escape, or 2.6s — whichever comes first.
 *   - Under reduced motion there is no burst and no count-up; the same words
 *     appear and leave quickly, so the information is identical.
 *   - The text is a live region; the confetti is `aria-hidden` decoration.
 */

function prefersCalm(): boolean {
  if (typeof window === "undefined") return false;
  return (
    document.documentElement.classList.contains("calm") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

/** Cubic ease-out — fast first, so the number is readable almost immediately. */
const easeOut = (p: number) => 1 - Math.pow(1 - p, 3);

export function Celebrate({
  headline,
  detail,
  countFrom,
  format,
  onDone,
}: {
  /** Short, in the app's voice. Rendered in the display serif. */
  headline: string;
  detail?: string;
  /**
   * When set, the figure counts down to zero instead of appearing. Watching
   * the balance you have been carrying actually run out is the moment — a
   * number that simply reads "$0.00" is a fact, not an event.
   */
  countFrom?: number;
  format?: (cents: number) => string;
  onDone: () => void;
}) {
  // Lazy initialiser rather than setting this from the effect: under reduced
  // motion the figure must already be 0 on the first render, and writing it in
  // an effect would both flash the old value for a frame and mean a
  // set-state-during-mount that React rightly warns about.
  const [amount, setAmount] = useState(() => (prefersCalm() ? 0 : (countFrom ?? 0)));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const closed = useRef(false);

  const close = useCallback(() => {
    if (closed.current) return;
    closed.current = true;
    onDone();
  }, [onDone]);

  useEffect(() => {
    const calm = prefersCalm();
    const timer = window.setTimeout(close, calm ? 1400 : 2600);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);

    // The count itself only runs when motion is allowed; the calm case is
    // already at zero from the lazy initialiser above.
    let raf = 0;
    if (countFrom != null && !calm) {
      const t0 = performance.now();
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / 850);
        setAmount(Math.round(countFrom * (1 - easeOut(p))));
        if (p < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    }

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("keydown", onKey);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [close, countFrom]);

  // Canvas rather than a pile of animated DOM nodes: ~30 particles as elements
  // would mean 30 composited layers on a phone for two seconds.
  useEffect(() => {
    if (prefersCalm()) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = canvas.offsetWidth;
    const h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.scale(dpr, dpr);

    const colour =
      getComputedStyle(document.documentElement).getPropertyValue("--ok").trim() || "#15803d";

    const bits = Array.from({ length: 28 }, () => ({
      x: w / 2,
      y: h / 2,
      vx: (Math.random() - 0.5) * 7,
      vy: -Math.random() * 6 - 1.5,
      r: 2 + Math.random() * 2.5,
      a: 1,
    }));

    let frame = 0;
    let raf = 0;
    const tick = () => {
      ctx.clearRect(0, 0, w, h);
      for (const b of bits) {
        b.x += b.vx;
        b.y += b.vy;
        b.vy += 0.3;
        b.a -= 0.016;
        if (b.a <= 0) continue;
        ctx.globalAlpha = Math.max(0, b.a);
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      if (++frame < 80) raf = requestAnimationFrame(tick);
      else ctx.clearRect(0, 0, w, h);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div
      className="celebrate-scrim fixed inset-0 z-50 grid place-items-center p-6"
      onClick={close}
    >
      <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden />
      <div
        className="celebrate-card card relative w-full max-w-xs p-6 text-center"
        style={{ background: "var(--color-ok-wash)", borderColor: "var(--color-ok)" }}
        role="status"
        aria-live="polite"
      >
        <p className="display text-2xl leading-tight" style={{ color: "var(--color-ok)" }}>
          {headline}
        </p>
        {countFrom != null && format && (
          <p className="mt-2 text-3xl font-bold tabular-nums tracking-tight">{format(amount)}</p>
        )}
        {detail && (
          <p className="mt-2 text-xs text-[var(--color-text-dim)]">{detail}</p>
        )}
      </div>
    </div>
  );
}
