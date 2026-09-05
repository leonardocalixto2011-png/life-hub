"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createEntry, updateEntry } from "./actions";
import { toDateInput } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import type { BudgetEntryWithRefs } from "@/lib/data";

export function EntryForm({
  ventures,
  entry,
  onCancel,
}: {
  ventures: { id: string; name: string }[];
  /** When set, the form opens pre-filled in edit mode and calls updateEntry instead of createEntry. */
  entry?: BudgetEntryWithRefs;
  /** Only relevant in edit mode — lets the caller collapse back to the display row. */
  onCancel?: () => void;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(Boolean(entry));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        + Log income / expense
      </button>
    );
  }

  function close() {
    setOpen(false);
    onCancel?.();
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        if (entry) {
          await updateEntry(fd);
          onCancel?.();
        } else {
          await createEntry(fd);
          formRef.current?.reset();
          setOpen(false);
        }
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 p-4">
      {entry && <input type="hidden" name="id" value={entry.id} />}
      <div className="grid grid-cols-3 gap-2">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Type
          <select name="type" defaultValue={entry?.type ?? "EXPENSE"} className="field mt-1">
            <option value="EXPENSE">Expense</option>
            <option value="INCOME">Income</option>
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Amount
          <input
            name="amount"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            required
            defaultValue={centsToInput(entry?.amountCents)}
            className="field mt-1"
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Currency
          <input
            name="currency"
            defaultValue={entry?.currency ?? "CAD"}
            maxLength={3}
            className="field mt-1 uppercase"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Category
          <input
            name="category"
            required
            list="budget-categories"
            defaultValue={entry?.category ?? ""}
            className="field mt-1"
            placeholder="Supplies, Ads, Tuition…"
          />
          <datalist id="budget-categories">
            <option value="Supplies" />
            <option value="Ads" />
            <option value="Software" />
            <option value="Salary" />
            <option value="Rent" />
            <option value="Tuition" />
            <option value="Sales" />
            <option value="Fees" />
          </datalist>
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Venture
          <select name="ventureId" defaultValue={entry?.ventureId ?? ""} className="field mt-1">
            <option value="">—</option>
            {ventures.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Date
          <input
            type="date"
            name="date"
            defaultValue={toDateInput(entry?.date ?? new Date())}
            className="field mt-1"
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Note
          <input name="description" defaultValue={entry?.description ?? ""} className="field mt-1" />
        </label>
      </div>

      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}

      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? "Saving…" : entry ? "Save changes" : "Add entry"}
        </button>
        <button type="button" onClick={close} className="btn">
          Cancel
        </button>
      </div>
    </form>
  );
}
