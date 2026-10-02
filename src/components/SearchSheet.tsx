"use client";

import "./edit-sheet.css";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { usePathname } from "next/navigation";
import {
  Cake,
  CalendarDays,
  Camera,
  CircleCheck,
  Flag,
  MapPin,
  Plane,
  Plus,
  Receipt,
  Repeat,
  Search,
  Star,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";

import { searchEverything, searchRecent } from "@/app/(app)/search-actions";
import { Sheet } from "@/components/Sheet";
import { useT } from "@/components/I18nProvider";
import { fillQuickAdd, openQuickAdd } from "@/lib/quickadd-bus";
import type { SearchGroup, SearchHit, SearchType } from "@/lib/search";

const DEBOUNCE_MS = 200;

const KIND: Record<SearchType, { label: string; Icon: LucideIcon }> = {
  task: { label: "Tasks", Icon: CircleCheck },
  event: { label: "Events", Icon: CalendarDays },
  deadline: { label: "Deadlines", Icon: Flag },
  budget: { label: "Budget", Icon: Wallet },
  subscription: { label: "Subscriptions", Icon: Repeat },
  trip: { label: "Trips", Icon: Plane },
  tripItem: { label: "Trip plans", Icon: MapPin },
  date: { label: "Special dates", Icon: Cake },
  favorite: { label: "Favourites", Icon: Star },
};

/** The composer's own camera input (QuickAdd renders it only when photo reading is on). */
const CAMERA_INPUT = 'input[type="file"][capture]';

/** Typing "/" in a field is typing, not a shortcut. */
function inField(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName);
}

/**
 * The header's search button and the sheet it raises.
 *
 * One box over everything in the hub: it searches as you type (200ms after
 * the last keystroke, on the server — see lib/search.ts for what is searched
 * and how privacy is kept), groups what it finds by type, and a tap opens the
 * item — in the edit sheet where one exists, since results link to the same
 * routes the lists do. Before anything is typed it offers recent items and
 * the three things people open a "find" box to do anyway: add a task, add an
 * expense, take a photo — handed to the composer over the quick-add bus.
 *
 * "/" or Ctrl/Cmd+K opens it from a keyboard; Escape closes (Sheet).
 */
export function SearchButton() {
  const t = useT();
  const pathname = usePathname();
  // Open *for a route*: following a result closes the sheet by construction.
  const [openFor, setOpenFor] = useState<string | null>(null);
  const open = openFor === pathname;

  const [q, setQ] = useState("");
  const [groups, setGroups] = useState<SearchGroup[] | null>(null);
  const [recent, setRecent] = useState<SearchHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [limited, setLimited] = useState(false);
  const [canPhoto, setCanPhoto] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Answers can arrive out of order; only the latest question's counts.
  const asked = useRef(0);

  const close = useCallback(() => setOpenFor(null), []);

  const raise = useCallback(() => {
    // flushSync: the sheet is on screen before focus(), so the focus happens
    // inside the tap — the only way iOS raises the keyboard.
    flushSync(() => setOpenFor(pathname));
    inputRef.current?.focus({ preventScroll: true });
    inputRef.current?.select();
    setCanPhoto(document.querySelector(CAMERA_INPUT) !== null);
    searchRecent().then(setRecent, () => {});
  }, [pathname]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const cmdK = (e.ctrlKey || e.metaKey) && !e.altKey && e.key.toLowerCase() === "k";
      const slash = e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !inField(e.target);
      if (!cmdK && !slash) return;
      e.preventDefault();
      raise();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [raise]);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function onType(value: string) {
    setQ(value);
    if (timer.current) clearTimeout(timer.current);
    const mine = ++asked.current;
    if (value.trim() === "") {
      setGroups(null);
      setBusy(false);
      setLimited(false);
      return;
    }
    setBusy(true);
    timer.current = setTimeout(async () => {
      try {
        const res = await searchEverything(value);
        if (asked.current !== mine) return;
        setLimited(Boolean(res.limited));
        // Rate-limited: keep what is on screen rather than blanking it.
        if (!res.limited) setGroups(res.groups);
      } catch {
        if (asked.current === mine) setGroups([]);
      } finally {
        if (asked.current === mine) setBusy(false);
      }
    }, DEBOUNCE_MS);
  }

  /** Close first, and really (flushSync), so the composer's focus isn't taken back by this sheet closing. */
  function toComposer(then: () => void) {
    flushSync(close);
    then();
  }

  const hit = (h: SearchHit) => {
    const { Icon } = KIND[h.type];
    return (
      <Link key={`${h.type}:${h.id}`} href={h.href} className="search-hit" onClick={close}>
        <span className="search-hit-icon" aria-hidden>
          <Icon size={17} strokeWidth={2} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="search-hit-title block" data-done={h.done ? "" : undefined}>
            {h.title}
          </span>
          {h.meta && <span className="search-hit-meta block">{h.meta}</span>}
        </span>
      </Link>
    );
  };

  const action = (label: string, Icon: LucideIcon, run: () => void) => (
    <button type="button" className="search-hit" onClick={() => toComposer(run)}>
      <span className="search-hit-icon" aria-hidden>
        <Icon size={17} strokeWidth={2} />
      </span>
      <span className="search-hit-title">{label}</span>
    </button>
  );

  return (
    <>
      <button
        type="button"
        className="icon-btn"
        aria-label={t("Search")}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="/ Control+K Meta+K"
        onClick={raise}
      >
        <Search size={22} strokeWidth={1.9} aria-hidden />
      </button>

      <Sheet open={open} onClose={close} label={t("Search")}>
        <div className="search-sheet">
          <div className="search-bar" role="search">
            <Search size={18} strokeWidth={2} aria-hidden />
            <input
              ref={inputRef}
              type="search"
              className="search-input"
              value={q}
              onChange={(e) => onType(e.target.value)}
              placeholder={t("Search everything…")}
              aria-label={t("Search")}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="search"
            />
            {q !== "" && (
              <button
                type="button"
                aria-label={t("Clear")}
                className="grid h-8 w-8 place-items-center rounded-full"
                onClick={() => {
                  onType("");
                  inputRef.current?.focus();
                }}
              >
                <X size={16} strokeWidth={2.2} aria-hidden />
              </button>
            )}
          </div>

          <div className="search-results" aria-busy={busy || undefined} aria-live="polite">
            {limited && (
              <p role="status" className="search-empty">
                {t("Too many searches — wait a moment.")}
              </p>
            )}

            {groups === null ? (
              <>
                <div className="search-group-head">
                  <h3 className="search-group-title">{t("Quick actions")}</h3>
                </div>
                {action(t("Add a task"), Plus, () => openQuickAdd("type"))}
                {action(t("Add an expense"), Receipt, () => fillQuickAdd(t("Expense: ")))}
                {canPhoto &&
                  action(t("Take a photo"), Camera, () => {
                    openQuickAdd("type");
                    // Still inside the tap, which is what lets a file input open.
                    document.querySelector<HTMLInputElement>(CAMERA_INPUT)?.click();
                  })}

                {recent.length > 0 && (
                  <>
                    <div className="search-group-head">
                      <h3 className="search-group-title">{t("Recent")}</h3>
                    </div>
                    {recent.map(hit)}
                  </>
                )}
              </>
            ) : groups.length === 0 ? (
              !busy && !limited && <p className="search-empty">{t("Nothing found for “{q}”", { q: q.trim() })}</p>
            ) : (
              groups.map((g) => (
                <section key={g.type}>
                  <div className="search-group-head">
                    <h3 className="search-group-title">{t(KIND[g.type].label)}</h3>
                    {g.more && (
                      <Link href={g.more} className="search-more" onClick={close}>
                        {t("See all")} ({g.total})
                      </Link>
                    )}
                  </div>
                  {g.hits.map(hit)}
                </section>
              ))
            )}
          </div>
        </div>
      </Sheet>
    </>
  );
}
