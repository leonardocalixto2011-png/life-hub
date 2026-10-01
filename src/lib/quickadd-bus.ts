/**
 * Lets an empty state (or anything else on a page) hand the person straight to
 * the quick-add composer in the app layout without threading a ref through the
 * whole tree. QuickAdd listens for this event; the dispatch happens inside the
 * button's click handler, so the mic still counts as started by a user gesture
 * (Safari and Chrome both require that for speech recognition).
 */
export const QUICKADD_EVENT = "lh:quickadd";

export type QuickAddIntent = "type" | "voice";

/** Puts a sentence in the composer (the welcome's example chips) and focuses it. */
export const QUICKADD_FILL_EVENT = "lh:quickadd-fill";

export function fillQuickAdd(text: string): void {
  window.dispatchEvent(new CustomEvent<string>(QUICKADD_FILL_EVENT, { detail: text }));
}

export function openQuickAdd(intent: QuickAddIntent): void {
  window.dispatchEvent(new CustomEvent<QuickAddIntent>(QUICKADD_EVENT, { detail: intent }));
}
