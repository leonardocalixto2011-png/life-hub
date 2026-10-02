"use client";

import "./interact.css";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { calmPreferred, haptic } from "@/lib/haptics";

/** Coming back to the foreground refreshes at most this often. */
const FOCUS_THROTTLE_MS = 30_000;
/** `online` can flap on a weak signal; it gets its own, shorter, floor. */
const ONLINE_THROTTLE_MS = 5_000;
/** How far the page must be pulled before letting go refreshes it. */
const PULL_THRESHOLD = 64;
/** The spinner stays at least this long, so a fast refresh still reads as one. */
const MIN_BUSY_MS = 500;

/** Someone mid-sentence: a focused field that already has something in it. */
function isEditing(): boolean {
  const el = document.activeElement;
  if (!el || el === document.body) return false;
  if (el instanceof HTMLSelectElement) return true;
  if (el instanceof HTMLElement && el.isContentEditable) return true;
  if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
    const type = el instanceof HTMLInputElement ? el.type : "textarea";
    if (["checkbox", "radio", "button", "submit", "file", "range"].includes(type)) return false;
    // The composer keeps the cursor in its (empty) box after every add, so an
    // empty focused field can't count — /today would never refresh again.
    return el.value !== "";
  }
  return false;
}

/** True if the touch began inside something that is itself scrolled down. */
function inScrolledContainer(target: EventTarget | null): boolean {
  for (let el = target instanceof Element ? target : null; el && el !== document.body; el = el.parentElement) {
    if (el.scrollTop > 0) return true;
  }
  return false;
}

/**
 * An installed PWA has no reload button and no address bar, and nothing told
 * it that the other person in the hub ticked something while it sat in the
 * background. This is the missing reload, in the two forms a phone expects:
 *
 *  - coming back to the app (or back online) refreshes the current route, at
 *    most once per 30 s, never while a transition is already running and never
 *    under someone who is typing — that one waits until they leave the field;
 *  - pulling the page down from the top refreshes it on demand.
 *
 * `router.refresh()` re-renders the server components and merges the result
 * in place: scroll position, open forms and client state all survive, which
 * is what makes it safe to fire without asking.
 *
 * Pull-to-refresh listens passively and never calls preventDefault, so it
 * cannot fight native scrolling; it only arms when the page is at the very
 * top, the gesture is mostly vertical (a sideways swipe on a task row wins)
 * and no sheet is open.
 */
export function LiveRefresh() {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const indicator = useRef<HTMLDivElement>(null);

  const pendingRef = useRef(false);
  const lastAt = useRef(0);
  const stale = useRef(false);
  const busySince = useRef(0);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  // The spinner outlasts the refresh by enough to be seen, then leaves.
  useEffect(() => {
    if (!busy || pending) return;
    const wait = Math.max(0, MIN_BUSY_MS - (Date.now() - busySince.current));
    const id = window.setTimeout(() => setBusy(false), wait);
    return () => window.clearTimeout(id);
  }, [busy, pending]);

  // ---- refresh on focus / online -------------------------------------------
  useEffect(() => {
    // The page was just rendered: that counts as fresh.
    lastAt.current = Date.now();

    const run = () => {
      lastAt.current = Date.now();
      stale.current = false;
      startTransition(() => router.refresh());
    };

    const maybe = (floorMs: number) => {
      if (document.visibilityState !== "visible") return;
      if (pendingRef.current) return;
      if (Date.now() - lastAt.current < floorMs) return;
      if (isEditing()) {
        stale.current = true; // picked up when they leave the field
        return;
      }
      run();
    };

    const onVisible = () => maybe(FOCUS_THROTTLE_MS);
    const onOnline = () => maybe(ONLINE_THROTTLE_MS);
    // Restored from the back/forward cache: the page is as old as its last visit.
    const onPageShow = (e: PageTransitionEvent) => {
      if (e.persisted) maybe(FOCUS_THROTTLE_MS);
    };
    const onFocusOut = () => {
      if (!stale.current) return;
      // Deferred a tick: focus may be moving to the next field of the same form.
      window.setTimeout(() => {
        if (stale.current && !isEditing() && !pendingRef.current && document.visibilityState === "visible") run();
      }, 0);
    };
    // A notification button did something in the background (public/sw.js).
    const onSwMessage = (e: MessageEvent) => {
      if (e.data && e.data.type === "lh:refresh" && !pendingRef.current) run();
    };

    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", onOnline);
    window.addEventListener("pageshow", onPageShow);
    document.addEventListener("focusout", onFocusOut);
    const sw = "serviceWorker" in navigator ? navigator.serviceWorker : null;
    sw?.addEventListener("message", onSwMessage);
    return () => {
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pageshow", onPageShow);
      document.removeEventListener("focusout", onFocusOut);
      sw?.removeEventListener("message", onSwMessage);
    };
  }, [router]);

  // ---- pull to refresh -------------------------------------------------------
  useEffect(() => {
    if (!("ontouchstart" in window) && !(navigator.maxTouchPoints > 0)) return;
    const root = document.documentElement;
    root.classList.add("ptr-on");

    let start: { x: number; y: number } | null = null;
    let pulling = false;
    let dist = 0;
    let armed = false;

    const paint = () => {
      const el = indicator.current;
      // Reduced motion: the gesture still works, nothing follows the finger.
      if (!el || calmPreferred()) return;
      const p = Math.min(1, dist / PULL_THRESHOLD);
      el.setAttribute("data-pulling", "");
      el.style.opacity = String(Math.min(1, dist / 40));
      el.style.transform = `translateY(${Math.min(64, -56 + p * 112)}px)`;
      const icon = el.firstElementChild as HTMLElement | null;
      if (icon) icon.style.transform = `rotate(${Math.round(p * 270)}deg)`;
    };
    const release = () => {
      const el = indicator.current;
      if (el) {
        el.removeAttribute("data-pulling");
        el.style.opacity = "";
        el.style.transform = "";
        const icon = el.firstElementChild as HTMLElement | null;
        if (icon) icon.style.transform = "";
      }
      start = null;
      pulling = false;
      dist = 0;
      armed = false;
    };

    const onStart = (e: TouchEvent) => {
      start = null;
      if (e.touches.length !== 1 || pendingRef.current) return;
      if (window.scrollY > 0) return;
      if (document.querySelector(".sheet-root[data-open]")) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[role="dialog"], [role="menu"], input[type="range"]')) return;
      if (inScrolledContainer(e.target)) return;
      start = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    };

    const onMove = (e: TouchEvent) => {
      if (!start) return;
      const dx = e.touches[0].clientX - start.x;
      const dy = e.touches[0].clientY - start.y;
      if (!pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return; // not a gesture yet
        // Sideways (a task-row swipe, a chip strip) or upward: not ours.
        if (dy <= 0 || Math.abs(dx) >= Math.abs(dy)) {
          start = null;
          return;
        }
        pulling = true;
      }
      // The page scrolled after all, or the finger turned sideways: let go.
      if (window.scrollY > 0 || Math.abs(dx) > Math.abs(dy)) {
        release();
        return;
      }
      dist = Math.max(0, dy);
      const nowArmed = dist >= PULL_THRESHOLD;
      if (nowArmed && !armed) haptic(8);
      armed = nowArmed;
      paint();
    };

    const onEnd = () => {
      const go = pulling && armed;
      release();
      if (!go || pendingRef.current) return;
      busySince.current = Date.now();
      lastAt.current = Date.now();
      stale.current = false;
      setBusy(true);
      startTransition(() => router.refresh());
    };

    document.addEventListener("touchstart", onStart, { passive: true });
    document.addEventListener("touchmove", onMove, { passive: true });
    document.addEventListener("touchend", onEnd, { passive: true });
    document.addEventListener("touchcancel", release, { passive: true });
    return () => {
      root.classList.remove("ptr-on");
      document.removeEventListener("touchstart", onStart);
      document.removeEventListener("touchmove", onMove);
      document.removeEventListener("touchend", onEnd);
      document.removeEventListener("touchcancel", release);
    };
  }, [router]);

  return (
    <>
      <div ref={indicator} className="ptr" data-busy={busy ? "" : undefined} aria-hidden>
        <RefreshCw size={18} strokeWidth={2.25} />
      </div>
      <span role="status" className="sr-only">
        {busy ? t("Refreshing…") : ""}
      </span>
    </>
  );
}
