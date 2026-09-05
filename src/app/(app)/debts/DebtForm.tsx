"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createDebt, deleteDebt, updateDebt } from "./actions";

type Opt = { id: string; name: string | null; email?: string | null };

type Existing = {
  id: string;
  name: string;
  balance: string; // "1250.00"
  apr: string; // "25.99"
  minimumPayment: string;
  actualPayment: string;
  dueDate: string;
  status: "CURRENT" | "DEFAULT" | "PAID_OFF";
  ventureId: string | null;
  ownerId: string | null;
  notes: string | null;
};

function Fields({
  ventures,
  members,
  existing,
}: {
  ventures: { id: string; name: string }[];
  members: Opt[];
  existing?: Existing;
}) {
  return (
    <>
      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Name
        <input
          name="name"
          defaultValue={existing?.name}
          required
          className="field mt-1"
          placeholder="RBC Signature Visa, Ford loan…"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Balance
          <input
            name="balance"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={existing?.balance}
            required
            className="field mt-1"
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          APR % (optional)
          <input
            name="apr"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={existing?.apr}
            className="field mt-1"
            placeholder="25.99"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Minimum payment
          <input
            name="minimumPayment"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={existing?.minimumPayment}
            className="field mt-1"
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Actual payment (if different)
          <input
            name="actualPayment"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={existing?.actualPayment}
            className="field mt-1"
            placeholder="leave blank if same"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Next due date
          <input
            type="date"
            name="dueDate"
            defaultValue={existing?.dueDate}
            className="field mt-1"
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Status
          <select name="status" defaultValue={existing?.status ?? "CURRENT"} className="field mt-1">
            <option value="CURRENT">Current</option>
            <option value="DEFAULT">In default</option>
            <option value="PAID_OFF">Paid off</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Venture
          <select name="ventureId" defaultValue={existing?.ventureId ?? ""} className="field mt-1">
            <option value="">—</option>
            {ventures.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Owner
          <select name="ownerId" defaultValue={existing?.ownerId ?? ""} className="field mt-1">
            <option value="">Shared</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Notes
        <textarea
          name="notes"
          defaultValue={existing?.notes ?? ""}
          rows={2}
          className="field mt-1"
          placeholder="in default, $998.79 past due; reverts to $1,235.79/mo Dec 2026…"
        />
      </label>
    </>
  );
}

export function DebtForm({
  ventures,
  members,
  existing,
}: {
  ventures: { id: string; name: string }[];
  members: Opt[];
  existing?: Existing;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (existing) {
    return (
      <div className="space-y-3">
        <form action={updateDebt} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} members={members} existing={existing} />
          <button type="submit" className="btn btn-primary w-full">
            Save
          </button>
        </form>
        <form action={deleteDebt}>
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="btn w-full text-[var(--color-danger)]">
            Delete debt
          </button>
        </form>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        + New debt
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createDebt(fd);
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not save");
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 p-4">
      <Fields ventures={ventures} members={members} />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? "Saving…" : "Add debt"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          Cancel
        </button>
      </div>
    </form>
  );
}
