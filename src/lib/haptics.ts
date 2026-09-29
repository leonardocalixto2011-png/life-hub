/**
 * A 10ms buzz — the physical half of the routine rung (a tick, a favourite
 * tap). Deliberately tiny: long enough to feel under the thumb, too short to
 * be heard on a table.
 *
 * Skipped whenever motion is reduced (OS setting or the Appearance "calm"
 * toggle): someone who asked the app to stop moving didn't ask it to start
 * shaking instead. Feature-detected, because iOS Safari has no Vibration API
 * at all and simply gets nothing.
 */
export function calmPreferred(): boolean {
  if (typeof window === "undefined") return true;
  return (
    document.documentElement.classList.contains("calm") ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function haptic(ms = 10): void {
  try {
    if (calmPreferred()) return;
    if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
      navigator.vibrate(ms);
    }
  } catch {
    // Some embedded webviews throw on vibrate from a non-user gesture. Silent.
  }
}
