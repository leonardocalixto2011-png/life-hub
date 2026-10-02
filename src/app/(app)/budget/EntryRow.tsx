"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Trash2 } from "lucide-react";

import { money } from "@/lib/format";
import { fmtShort } from "@/lib/i18n";
import { splitLabel } from "@/lib/couple";
import { VentureChip } from "@/components/VentureChip";
import { useLang, useT } from "@/components/I18nProvider";
import { deleteEntry, restoreEntry } from "./actions";
import { EntryForm } from "./EntryForm";
import type { BudgetEntryWithRefs } from "@/lib/data";
import { showToast } from "@/components/Toast";
import { personFirstName } from "@/lib/people";

type Member = { id: string; name: string | null; email: string | null };

/**
 * Descriptions the app itself writes (settle-up and debt-payment rows) are
 * stored in English; translate those at render. Anything else is the
 * person's own text and is shown as typed — running it through t() could
 * turn a note that happens to match a UI key into something else.
 */
function describe(description: string, t: (k: string, v?: Record<string, string>) => string): string {
  if (description === "Debt payment" || description === "Paid back") return t(description);
  const paidBack = /^Paid back (.+)$/.exec(description);
  return paidBack ? t("Paid back {name}", { name: paidBack[1] }) : description;
}

export function EntryRow({
  e,
  ventures,
  members,
  currentUserId,
  locale,
}: {
  e: BudgetEntryWithRefs;
  ventures: { id: string; name: string }[];
  members: Member[];
  currentUserId: string;
  locale: string;
}) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  // Hidden the moment it's deleted; the server refresh then removes the row
  // for real. Comes back if the delete fails.
  const [gone, setGone] = useState(false);
  const [, startTransition] = useTransition();
  const income = e.type === "INCOME";

  /**
   * Undo rather than "are you sure?": deleting a mistyped entry is the common
   * case and shouldn't cost two taps, while a slip is one tap on the toast
   * away from being put back exactly as it was (split and payer included).
   */
  function remove() {
    setGone(true);
    startTransition(async () => {
      const r = await deleteEntry(e.id).catch(() => ({ ok: false as const, error: "Could not delete" }));
      if (!r.ok) {
        setGone(false);
        showToast({ message: t(r.error) });
        return;
      }
      showToast({
        message: t("Entry deleted"),
        actionLabel: t("Undo"),
        onAction: () => {
          void restoreEntry(r.snapshot)
            .catch(() => ({ ok: false as const, error: "Could not undo" }))
            .then((u) => {
              if (!u.ok) showToast({ message: t(u.error) });
              router.refresh();
            });
        },
      });
    });
  }

  if (gone) return null;

  if (editing) {
    return (
      <div className="p-4">
        <EntryForm
          ventures={ventures}
          members={members}
          currentUserId={currentUserId}
          entry={e}
          onCancel={() => setEditing(false)}
        />
      </div>
    );
  }

  const payer = e.paidById ? members.find((m) => m.id === e.paidById) : null;
  const payerName = payer ? personFirstName(payer, t("Member")) : null;
  const split = splitLabel(e.payerSharePct);

  return (
    <div className="flex items-start gap-3 px-4 py-3">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[0.9375rem] font-medium">{t(e.category)}</span>
          {e.venture && <VentureChip name={e.venture.name} color={e.venture.color} />}
          {e.isSettlement ? (
            <span className="chip text-[var(--color-text-dim)]">{t("settle-up")}</span>
          ) : (
            split && <span className="chip text-[var(--color-text-dim)]">{t("shared")} {t(split)}</span>
          )}
        </div>
        <div className="mt-1 text-xs text-[var(--color-text-dim)]">
          {fmtShort(new Date(e.date), lang)}
          {payerName && members.length > 1 ? ` · ${t("paid by {name}", { name: payerName })}` : ""}
          {e.description ? ` · ${describe(e.description, t)}` : ""}
        </div>
      </div>
      <div className="shrink-0 text-right">
        <div
          className="row-amount tabular-nums"
          style={{
            color: income
              ? "var(--color-ok)"
              : e.isSettlement
                ? "var(--color-text-dim)"
                : "var(--color-text)",
          }}
        >
          {income ? "+" : "−"}
          {money(e.amountCents, e.currency, locale)}
        </div>
        {/* Real buttons with a thumb-sized target; the negative margin keeps
            the icons optically aligned with the amount above. */}
        <div className="-mb-2 -mr-2 mt-0.5 flex justify-end">
          {!e.isSettlement && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={t("Edit")}
              title={t("Edit")}
              className="grid h-9 w-9 place-items-center rounded-full text-[var(--color-text-dim)]"
            >
              <Pencil size={15} strokeWidth={2} aria-hidden />
            </button>
          )}
          <button
            type="button"
            onClick={remove}
            aria-label={t("Delete")}
            title={t("Delete")}
            className="grid h-9 w-9 place-items-center rounded-full text-[var(--color-text-dim)]"
          >
            <Trash2 size={15} strokeWidth={2} aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
