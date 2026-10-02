"use client";

import "./interact.css";

import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";

import { useT } from "@/components/I18nProvider";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** How far the handle must be dragged down before letting go closes the sheet. */
const DISMISS_PX = 80;

const noop = () => () => {};

/**
 * A bottom sheet: backdrop, drag handle, slides up over `--base`.
 *
 * The children stay mounted while it is closed. That is deliberate — the
 * composer inside keeps its half-typed sentence, its review in progress and
 * its window listeners (the "Speak it" button on an empty page has to reach a
 * live component in the same tick as the tap, or the mic isn't user-started).
 * Closed, the whole thing is `inert`, so none of it is reachable by keyboard
 * or screen reader.
 *
 * Portalled to <body>: the app's content column is its own stacking context
 * (it sits above the background-photo scrim), and a sheet inside it would
 * slide up *under* the header and the tab bar.
 *
 * Escape closes — unless something inside already used the key (the composer
 * backs out of its photo menu, then its review, then its text, first).
 */
export function Sheet({
  open,
  onClose,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** What the dialog is, for screen readers. */
  label: string;
  children: React.ReactNode;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const returnTo = useRef<HTMLElement | null>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  // The click that follows a drag's pointerup must not count as a tap.
  const dragged = useRef(false);
  // No portal target on the server; one render later on the client.
  const mounted = useSyncExternalStore(noop, () => true, () => false);

  // Focus moves in when it opens and back where it came from when it closes.
  // A layout effect, so that when the opener wraps its state change in
  // flushSync the focus still happens inside the tap — iOS only raises the
  // keyboard for focus that a gesture caused.
  useLayoutEffect(() => {
    if (!mounted) return;
    if (open) {
      returnTo.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      panelRef.current?.focus({ preventScroll: true });
    } else if (returnTo.current) {
      const el = returnTo.current;
      returnTo.current = null;
      if (el.isConnected) el.focus({ preventScroll: true });
    }
  }, [open, mounted]);

  // The page behind must not scroll under the finger.
  useEffect(() => {
    if (!open) return;
    const root = document.documentElement;
    const prev = root.style.overflow;
    root.style.overflow = "hidden";
    return () => {
      root.style.overflow = prev;
    };
  }, [open]);

  // Ride above the on-screen keyboard (see --kb in interact.css).
  useEffect(() => {
    if (!open) return;
    const vv = window.visualViewport;
    const panel = panelRef.current;
    if (!vv || !panel) return;
    const sync = () => {
      const kb = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      panel.style.setProperty("--kb", `${Math.round(kb)}px`);
    };
    sync();
    vv.addEventListener("resize", sync);
    vv.addEventListener("scroll", sync);
    return () => {
      vv.removeEventListener("resize", sync);
      vv.removeEventListener("scroll", sync);
      panel.style.removeProperty("--kb");
    };
  }, [open]);

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      if (e.defaultPrevented) return; // something inside backed out a level
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key !== "Tab") return;
    const panel = panelRef.current;
    if (!panel) return;
    const items = Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.getClientRects().length > 0,
    );
    if (items.length === 0) {
      e.preventDefault();
      return;
    }
    const first = items[0];
    const last = items[items.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === panel)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  }

  // ---- drag the handle down to dismiss -------------------------------------
  function onPointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    drag.current = { y: e.clientY, dy: 0 };
    dragged.current = false;
    e.currentTarget.setPointerCapture(e.pointerId);
  }
  function onPointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const d = drag.current;
    const panel = panelRef.current;
    if (!d || !panel) return;
    d.dy = Math.max(0, e.clientY - d.y);
    if (d.dy > 4) {
      dragged.current = true;
      panel.setAttribute("data-dragging", "");
      panel.style.transform = `translateY(${d.dy}px)`;
    }
  }
  function onPointerEnd() {
    const d = drag.current;
    const panel = panelRef.current;
    drag.current = null;
    if (!d || !panel) return;
    panel.removeAttribute("data-dragging");
    panel.style.transform = "";
    if (d.dy > DISMISS_PX) onClose();
  }

  if (!mounted) return null;

  return createPortal(
    <div className="sheet-root" data-open={open ? "" : undefined} inert={!open} onKeyDown={onKeyDown}>
      <div className="sheet-backdrop" onClick={onClose} aria-hidden />
      <div ref={panelRef} className="sheet-panel" role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>
        <button
          type="button"
          className="sheet-handle"
          aria-label={t("Close")}
          // A tap (no drag) closes too: the handle is the sheet's close button
          // for anyone not using a pointer that can drag.
          onClick={() => {
            if (dragged.current) dragged.current = false;
            else onClose();
          }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerEnd}
          onPointerCancel={onPointerEnd}
        />
        <div className="sheet-body">{children}</div>
      </div>
    </div>,
    document.body,
  );
}
