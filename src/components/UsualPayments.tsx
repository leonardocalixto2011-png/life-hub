"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Repeat, X } from "lucide-react";

import { confirmUsualPayment } from "@/app/(app)/budget/actions";
import { undoFavorite } from "@/app/(app)/favorites/actions";
import { SectionHeader } from "@/components/SectionHeader";
import { showToast } from "@/components/Toast";
import { useT } from "@/components/I18nProvider";
import { haptic } from "@/lib/haptics";

export type UsualItem = {
  key: string;
  category: string;
  amountCents: number;
  amountLabel: string;
  /** "prévu le 1er" / "expected on the 1st", pre-formatted on the server. */
  dayLabel: string;
  ventureId: string | null;
  late: boolean;
};

// ---- "pas ce mois-ci", per pattern + month, in this browser only ----------
// A per-viewer convenience (per the project's storage rule): if storage is
// blocked the item simply shows again, which is harmless.

const skipKey = (month: string, key: string) => `lh.usual.skip.${month}.${key}`;
let listeners: Array<() => void> = [];

function readSkip(month: string, key: string): boolean {
  try {
    return window.localStorage.getItem(skipKey(month, key)) === "1";
  } catch {
    return false;
  }
}

function writeSkip(month: string, key: string, on: boolean) {
  try {
    if (on) window.localStorage.setItem(skipKey(month, key), "1");
    else window.localStorage.removeItem(skipKey(month, key));
  } catch {
    // Private mode / blocked storage: nothing to remember it in.
  }
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.push(cb);
  window.addEventListener("storage", cb);
  return () => {
    listeners = listeners.filter((l) => l !== cb);
    window.removeEventListener("storage", cb);
  };
}

export function UsualPayments({ items, month }: { items: UsualItem[]; month: string }) {
  const t = useT();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [done, setDone] = useState<Set<string>>(() => new Set());

  // Server snapshot is null: the dismissals live in this browser, so the card
  // renders only once they're known — never a flash of a hidden item.
  const skipped = useSyncExternalStore(
    subscribe,
    () =>
      items
        .filter((i) => readSkip(month, i.key))
        .map((i) => i.key)
        .join("\n"),
    () => null,
  );
  if (skipped === null) return null;

  const hidden = new Set(skipped ? skipped.split("\n") : []);
  const visible = items.filter((i) => !hidden.has(i.key) && !done.has(i.key));
  if (visible.length === 0) return null;

  const mark = (key: string, on: boolean) =>
    setDone((prev) => {
      const next = new Set(prev);
      if (on) next.add(key);
      else next.delete(key);
      return next;
    });

  function confirm(i: UsualItem) {
    haptic();
    mark(i.key, true);
    startTransition(async () => {
      const r = await confirmUsualPayment({
        category: i.category,
        amountCents: i.amountCents,
        ventureId: i.ventureId,
      }).catch(() => ({ ok: false as const, error: "Could not save" }));
      if (!r.ok) {
        mark(i.key, false);
        showToast({ message: t(r.error) });
        return;
      }
      router.refresh();
      showToast({
        message: t("Logged {what}", { what: `${i.category} · ${i.amountLabel}` }),
        actionLabel: t("Undo"),
        onAction: () => {
          mark(i.key, false);
          void undoFavorite(r.created).then(() => router.refresh());
        },
      });
    });
  }

  function skip(i: UsualItem) {
    writeSkip(month, i.key, true);
    showToast({
      message: t("{what} hidden until next month", { what: i.category }),
      actionLabel: t("Undo"),
      onAction: () => writeSkip(month, i.key, false),
    });
  }

  return (
    <section aria-labelledby="usual-title">
      <SectionHeader id="usual-title" title={t("To confirm")} />
      <div className="list">
        {visible.map((i) => (
          <div key={i.key} className="row gap-2 pr-2">
            <span className="icon-tile" aria-hidden>
              <Repeat size={16} strokeWidth={2} />
            </span>
            <span className="row-main">
              <span className="row-title">{i.category}</span>
              <span className="row-sub">
                <span className="font-semibold text-[var(--color-text)]">{i.amountLabel}</span>
                {" · "}
                <span style={i.late ? { color: "var(--color-warn)", fontWeight: 600 } : undefined}>
                  {i.dayLabel}
                </span>
              </span>
            </span>
            <button
              type="button"
              onClick={() => skip(i)}
              className="btn btn-ghost btn-icon text-[var(--color-text-dim)]"
              aria-label={t("Not this month: {what}", { what: i.category })}
              title={t("Not this month")}
            >
              <X size={18} strokeWidth={2} aria-hidden />
            </button>
            <button
              type="button"
              onClick={() => confirm(i)}
              className="btn btn-primary btn-icon"
              aria-label={t("Paid: {what}", { what: `${i.category} ${i.amountLabel}` })}
              title={t("Paid")}
            >
              <Check size={18} strokeWidth={2.5} aria-hidden />
            </button>
          </div>
        ))}
      </div>
      <p className="mt-2 px-1 text-xs text-[var(--color-text-dim)]">
        {t("Paid the usual? One tap logs it in the budget for today.")}
      </p>
    </section>
  );
}
