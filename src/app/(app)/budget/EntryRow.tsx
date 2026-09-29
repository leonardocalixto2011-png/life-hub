"use client";

import { useState } from "react";

import { money } from "@/lib/format";
import { fmtShort } from "@/lib/i18n";
import { splitLabel } from "@/lib/couple";
import { VentureChip } from "@/components/VentureChip";
import { useLang, useT } from "@/components/I18nProvider";
import { deleteEntry } from "./actions";
import { EntryForm } from "./EntryForm";
import type { BudgetEntryWithRefs } from "@/lib/data";
import { SubmitButton } from "@/components/SubmitButton";

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
  const [editing, setEditing] = useState(false);
  const income = e.type === "INCOME";

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
  const payerName = payer ? (payer.name ?? payer.email ?? "").split(/[\s@]/)[0] : null;
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
        <div className="mt-1 flex justify-end gap-3">
          {!e.isSettlement && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline"
            >
              {t("edit")}
            </button>
          )}
          <form action={deleteEntry}>
            <input type="hidden" name="id" value={e.id} />
            <SubmitButton className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline" pendingLabel="…">
              {t("delete")}
            </SubmitButton>
          </form>
        </div>
      </div>
    </div>
  );
}
