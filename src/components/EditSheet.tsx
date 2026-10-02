"use client";

import "./edit-sheet.css";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";

import { Sheet } from "@/components/Sheet";
import { useT } from "@/components/I18nProvider";
import { showToast } from "@/components/Toast";

/**
 * Edit-in-place: a detail route shown in the bottom sheet, over the list the
 * person tapped it from.
 *
 * The route is real. `(app)/@modal/(.)tasks/[id]` (and its three siblings)
 * intercept a *soft* navigation to /tasks/<id>, so the URL changes, Back
 * closes the sheet, and a reload or a shared link lands on the full page —
 * which is the same form, rendered by the ordinary route.
 */

type SheetForm = { close: () => void };
const SheetFormContext = createContext<SheetForm | null>(null);

/** How long the sheet takes to slide away, read from the motion variables so
 *  "reduce motion" (0.01ms) closes at once. */
function slideMs(): number {
  const raw = getComputedStyle(document.documentElement).getPropertyValue("--base").trim();
  const n = parseFloat(raw);
  if (!Number.isFinite(n)) return 220;
  return raw.endsWith("ms") ? n : n * 1000;
}

/**
 * The sheet around an intercepted route. Lives in the slot's *layout*, so the
 * loading skeleton and the page that replaces it share one sheet (one slide,
 * not two).
 *
 * `base` is the path prefix this sheet belongs to ("/tasks/"). A parallel
 * slot keeps its last content when the app navigates somewhere the slot
 * does not match, so the sheet shows itself only while the URL is still under
 * that prefix — following a link out of the form closes it by construction.
 */
export function RouteSheet({
  base,
  except,
  children,
}: {
  base: string;
  /** Paths under `base` that are pages of their own, not items (/calendar/dates). */
  except?: string[];
  children: React.ReactNode;
}) {
  const t = useT();
  const router = useRouter();
  const pathname = usePathname();
  const here = pathname.startsWith(base) && pathname.length > base.length && !except?.includes(pathname);
  // Both are "for a path" rather than booleans: a new path resets them with
  // no effect to run.
  const [shownFor, setShownFor] = useState<string | null>(null);
  const [closedFor, setClosedFor] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // One frame closed, then open: the slide needs a state to slide from.
  useEffect(() => {
    if (!here) return;
    const id = requestAnimationFrame(() => setShownFor(pathname));
    return () => cancelAnimationFrame(id);
  }, [here, pathname]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  // The list behind keeps its place. A navigation makes the router scroll the
  // new segment into view; this one is a sheet still parked below the screen,
  // so the router decides it is out of view and jumps the document to the top
  // — the list would land on its first row under the sheet. The row links
  // live in a dozen files (`scroll={false}` on each would be the other fix),
  // so the position is held here instead.
  //
  // Where the page was is read while rendering, not in an effect: the
  // router's scroll runs in a *child's* commit lifecycle, which is before any
  // effect of this component, so by then the answer is already 0. The layout
  // effect then puts it back in the same commit, before anything is painted.
  // Nothing else can scroll the page while the sheet is up (Sheet locks it),
  // so the listener only ever undoes that jump if it comes late.
  const [anchor, setAnchor] = useState<{ path: string; y: number } | null>(null);
  if (here && anchor?.path !== pathname) {
    setAnchor({ path: pathname, y: typeof window === "undefined" ? 0 : window.scrollY });
  }
  const anchorY = here && anchor?.path === pathname ? anchor.y : null;
  useLayoutEffect(() => {
    if (anchorY === null) return;
    const keep = () => {
      if (window.scrollY !== anchorY) window.scrollTo(0, anchorY);
    };
    keep();
    window.addEventListener("scroll", keep, { passive: true });
    return () => window.removeEventListener("scroll", keep);
  }, [anchorY, pathname]);

  const close = useCallback(() => {
    if (timer.current) return;
    setClosedFor(pathname);
    // Slide away first, then go back: Back unmounts the slot at once.
    timer.current = setTimeout(() => {
      timer.current = null;
      router.back();
    }, slideMs());
  }, [pathname, router]);

  const open = here && shownFor === pathname && closedFor !== pathname;

  return (
    <Sheet open={open} onClose={close} label={t("Edit")}>
      <SheetFormContext.Provider value={here ? { close } : null}>
        <div className="edit-sheet">{children}</div>
      </SheetFormContext.Provider>
    </Sheet>
  );
}

type FormAction = (fd: FormData) => Promise<unknown>;

/**
 * For the edit forms' save and delete actions. On a full page it hands the
 * action back untouched (it redirects to the list, as before). Inside the
 * sheet it tells the action to skip that redirect (`inSheet`) and closes the
 * sheet once it has finished — the list behind is already fresh, since the
 * action's revalidation re-renders the route the sheet sits on.
 */
export function useSheetAction(): (action: FormAction) => (fd: FormData) => Promise<void> {
  const sheet = useContext(SheetFormContext);
  const t = useT();
  return (action) => {
    if (!sheet) return action as (fd: FormData) => Promise<void>;
    return async (fd: FormData) => {
      fd.set("inSheet", "1");
      try {
        await action(fd);
      } catch {
        showToast({ message: t("Could not save") });
        return;
      }
      sheet.close();
    };
  };
}

/** Title block at the top of an edit sheet. */
export function SheetTitle({ title, sub }: { title: React.ReactNode; sub?: React.ReactNode }) {
  return (
    <header className="edit-sheet-head">
      <h2 className="edit-sheet-title">{title}</h2>
      {sub && <p className="edit-sheet-sub">{sub}</p>}
    </header>
  );
}

/** What the sheet shows while the item loads. */
export function SheetSkeleton() {
  return (
    <div className="space-y-4" aria-hidden>
      <div className="sk h-6 w-2/3" />
      <div className="sk h-24 w-full" />
      <div className="sk h-24 w-full" />
      <div className="sk h-12 w-full" />
    </div>
  );
}
