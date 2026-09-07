"use client";

import { useCallback, useSyncExternalStore } from "react";

import { REDUCE_MOTION_KEY as KEY } from "@/lib/motion";

/**
 * The `calm` class on <html> and the OS media query are both external stores,
 * so they're read with useSyncExternalStore rather than mirrored into state
 * from an effect. That keeps the server render and the first client render
 * agreeing (both "off"), and avoids the render-then-correct flash — the
 * blocking script in the root layout has already set the class by the time
 * this hydrates.
 */
function subscribeToMediaQuery(callback: () => void) {
  const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
  mq.addEventListener("change", callback);
  return () => mq.removeEventListener("change", callback);
}

/**
 * In-app "reduce motion", on top of the OS setting.
 *
 * The OS switch is respected already (`prefers-reduced-motion` zeroes the
 * three duration tokens in globals.css). This exists because plenty of people
 * who find motion unpleasant have never found that setting, or want it for
 * this app only — and because a celebration that someone can't turn off is a
 * celebration inflicted on them.
 *
 * Stored in localStorage rather than on the User row: it must apply on the
 * very first paint, before any server round trip, and it is genuinely
 * per-device — the phone you scroll in bed is not the laptop you do the books
 * on. The trade-off is that it doesn't follow you to a new device, which is
 * the right way round for a comfort setting.
 */
export function MotionToggle() {
  // Version counter forces a re-read after the class is flipped locally.
  const subscribeToClass = useCallback((callback: () => void) => {
    const observer = new MutationObserver(callback);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const on = useSyncExternalStore(
    subscribeToClass,
    () => document.documentElement.classList.contains("calm"),
    () => false, // server: nothing is calm until the client says so
  );

  const osReduces = useSyncExternalStore(
    subscribeToMediaQuery,
    () => window.matchMedia("(prefers-reduced-motion: reduce)").matches,
    () => false,
  );

  function toggle() {
    const next = !on;
    // The class is the source of truth — the MutationObserver above turns this
    // into the re-render, so there is no second copy of the state to drift.
    document.documentElement.classList.toggle("calm", next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      // Private mode or blocked storage — the toggle still works for this
      // session, it just won't be remembered. Not worth an error.
    }
  }

  return (
    <div className="card space-y-1.5 p-3">
      <label className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold">Reduce motion</span>
        <input
          type="checkbox"
          checked={on}
          onChange={toggle}
          className="h-5 w-5 accent-[var(--color-primary)]"
        />
      </label>
      <p className="text-[0.65rem] text-[var(--color-text-dim)]">
        {osReduces
          ? "Your device already asks for reduced motion, so this is on everywhere. Nothing here animates."
          : "Turns off the small animations — ticking a task, joining a hub, clearing a debt. Everything still works exactly the same, just instantly."}
      </p>
    </div>
  );
}
