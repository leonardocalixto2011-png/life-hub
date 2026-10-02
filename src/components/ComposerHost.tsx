"use client";

import "./interact.css";

import { useCallback, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import { Plus } from "lucide-react";

import { QuickAdd } from "@/components/QuickAdd";
import { Sheet } from "@/components/Sheet";
import { useT } from "@/components/I18nProvider";

type QuickAddProps = Omit<React.ComponentProps<typeof QuickAdd>, "variant" | "active" | "onActivate" | "onClose">;

/** The one route where capture is the point of the screen. */
const INLINE_ON = "/today";

/**
 * Where the quick-add composer lives.
 *
 * Header + composer + tab bar came to ~225 of 812px on every screen — more
 * than a quarter of a phone given to chrome on pages people open to *read* a
 * list. So the composer stays in the page on /today only, and everywhere
 * else it is a "+" in the thumb's corner that raises the same component in a
 * bottom sheet.
 *
 * The sheet's composer is mounted even while closed (see Sheet), so anything
 * that asks for it — an empty state's "Speak it" / "Type it", the welcome's
 * example chips, a home-screen shortcut landing on another route — reaches a
 * live component, which then raises the sheet around itself via `onActivate`.
 */
export function ComposerHost(props: QuickAddProps) {
  const pathname = usePathname();
  const t = useT();
  // Open *for a route*, not just open: following a link out of the sheet
  // ("View", "Edit favourites") closes it by construction, with no effect.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  const close = useCallback(() => setOpenFor(null), []);
  /**
   * flushSync so the sheet is really on screen before this returns: whoever
   * called (a tap) can then focus the input in the same gesture, which is the
   * only way iOS raises the keyboard.
   */
  const raise = useCallback(() => {
    flushSync(() => setOpenFor(pathname));
  }, [pathname]);

  if (pathname === INLINE_ON) return <QuickAdd {...props} />;

  return (
    <>
      <button
        type="button"
        className="fab"
        aria-label={t("Add something")}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => {
          raise();
          document.querySelector<HTMLInputElement>(".sheet-root [data-autofocus]")?.focus({ preventScroll: true });
        }}
      >
        <Plus size={26} strokeWidth={2.4} aria-hidden />
      </button>
      <Sheet open={open} onClose={close} label={t("Quick add")}>
        <QuickAdd {...props} variant="sheet" active={open} onActivate={raise} onClose={close} />
      </Sheet>
    </>
  );
}
