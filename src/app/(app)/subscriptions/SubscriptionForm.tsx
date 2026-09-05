"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSubscription,
  deleteSubscription,
  updateSubscription,
} from "./actions";

type Opt = { id: string; name: string | null; email?: string | null };

type Existing = {
  id: string;
  name: string;
  cost: string; // "12.50"
  currency: string;
  billingCycle: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  renewalDate: string;
  cancelByDate: string;
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
          placeholder="Adobe CC, Shopify, gym…"
        />
      </label>

      <div className="grid grid-cols-3 gap-2">
        <label className="col-span-1 block text-xs font-semibold text-[var(--color-text-dim)]">
          Cost
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={existing?.cost}
            required
            className="field mt-1"
          />
        </label>
        <label className="col-span-1 block text-xs font-semibold text-[var(--color-text-dim)]">
          Currency
          <input
            name="currency"
            defaultValue={existing?.currency ?? "CAD"}
            maxLength={3}
            className="field mt-1 uppercase"
          />
        </label>
        <label className="col-span-1 block text-xs font-semibold text-[var(--color-text-dim)]">
          Cycle
          <select
            name="billingCycle"
            defaultValue={existing?.billingCycle ?? "MONTHLY"}
            className="field mt-1"
          >
            <option value="WEEKLY">Weekly</option>
            <option value="MONTHLY">Monthly</option>
            <option value="QUARTERLY">Quarterly</option>
            <option value="YEARLY">Yearly</option>
            <option value="CUSTOM">Custom</option>
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Next renewal
          <input
            type="date"
            name="renewalDate"
            defaultValue={existing?.renewalDate}
            required
            className="field mt-1"
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Cancel by (optional)
          <input
            type="date"
            name="cancelByDate"
            defaultValue={existing?.cancelByDate}
            className="field mt-1"
          />
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
            <option value="">— (no owner)</option>
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
        <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field mt-1" />
      </label>
    </>
  );
}

export function SubscriptionForm({
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
        <form action={updateSubscription} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} members={members} existing={existing} />
          <button type="submit" className="btn btn-primary w-full">
            Save
          </button>
        </form>
        <form action={deleteSubscription}>
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="btn w-full text-[var(--color-danger)]">
            Delete subscription
          </button>
        </form>
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        + New subscription
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createSubscription(fd);
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
          {pending ? "Saving…" : "Add subscription"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          Cancel
        </button>
      </div>
    </form>
  );
}
