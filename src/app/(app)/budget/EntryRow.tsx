"use client";

import { useState } from "react";
import { format } from "date-fns";

import { money } from "@/lib/format";
import { splitLabel } from "@/lib/couple";
import { VentureChip } from "@/components/VentureChip";
import { deleteEntry } from "./actions";
import { EntryForm } from "./EntryForm";
import type { BudgetEntryWithRefs } from "@/lib/data";

type Member = { id: string; name: string | null; email: string | null };

export function EntryRow({
  e,
  ventures,
  members,
  currentUserId,
}: {
  e: BudgetEntryWithRefs;
  ventures: { id: string; name: string }[];
  members: Member[];
  currentUserId: string;
}) {
  const [editing, setEditing] = useState(false);
  const income = e.type === "INCOME";

  if (editing) {
    return (
      <div className="p-3">
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
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{e.category}</span>
          {e.venture && <VentureChip name={e.venture.name} color={e.venture.color} />}
          {e.isSettlement ? (
            <span className="chip text-[var(--color-text-dim)]">settle-up</span>
          ) : (
            split && <span className="chip text-[var(--color-text-dim)]">shared {split}</span>
          )}
        </div>
        <div className="mt-0.5 text-xs text-[var(--color-text-dim)]">
          {format(e.date, "MMM d")}
          {payerName && members.length > 1 ? ` · paid by ${payerName}` : ""}
          {e.description ? ` · ${e.description}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-semibold tabular-nums"
          style={{
            color: income
              ? "var(--color-ok)"
              : e.isSettlement
                ? "var(--color-text-dim)"
                : "var(--color-text)",
          }}
        >
          {income ? "+" : "−"}
          {money(e.amountCents, e.currency)}
        </div>
        <div className="flex gap-2">
          {!e.isSettlement && (
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline"
            >
              edit
            </button>
          )}
          <form action={deleteEntry}>
            <input type="hidden" name="id" value={e.id} />
            <button className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline">
              delete
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
