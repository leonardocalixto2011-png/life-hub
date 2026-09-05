"use client";

import { useState } from "react";
import { format } from "date-fns";

import { money } from "@/lib/format";
import { VentureChip } from "@/components/VentureChip";
import { deleteEntry } from "./actions";
import { EntryForm } from "./EntryForm";
import type { BudgetEntryWithRefs } from "@/lib/data";

export function EntryRow({
  e,
  ventures,
}: {
  e: BudgetEntryWithRefs;
  ventures: { id: string; name: string }[];
}) {
  const [editing, setEditing] = useState(false);
  const income = e.type === "INCOME";

  if (editing) {
    return (
      <div className="p-3">
        <EntryForm ventures={ventures} entry={e} onCancel={() => setEditing(false)} />
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium">{e.category}</span>
          {e.venture && <VentureChip name={e.venture.name} color={e.venture.color} />}
        </div>
        <div className="mt-0.5 text-xs text-[var(--color-text-dim)]">
          {format(e.date, "MMM d")}
          {e.description ? ` · ${e.description}` : ""}
        </div>
      </div>
      <div className="text-right">
        <div
          className="font-semibold tabular-nums"
          style={{ color: income ? "var(--color-ok)" : "var(--color-text)" }}
        >
          {income ? "+" : "−"}
          {money(e.amountCents, e.currency)}
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-[0.62rem] font-semibold text-[var(--color-text-dim)] underline"
          >
            edit
          </button>
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
