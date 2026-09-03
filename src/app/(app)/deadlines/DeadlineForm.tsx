"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createDeadline, deleteDeadline, updateDeadline } from "./actions";

type Venture = { id: string; name: string };

type Existing = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string; // yyyy-mm-dd
  ventureId: string | null;
  remindDaysBefore: number[];
};

function Fields({ ventures, existing }: { ventures: Venture[]; existing?: Existing }) {
  return (
    <>
      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Title
        <input
          name="title"
          defaultValue={existing?.title}
          required
          className="field mt-1"
          placeholder="Tax filing, lease renewal, permit…"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Due date
          <input
            type="date"
            name="dueDate"
            defaultValue={existing?.dueDate}
            required
            className="field mt-1"
          />
        </label>
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
      </div>

      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Remind days before
        <input
          name="remindDaysBefore"
          defaultValue={(existing?.remindDaysBefore ?? [7, 3, 1]).join(", ")}
          className="field mt-1"
          placeholder="7, 3, 1"
        />
        <span className="mt-1 block font-normal">
          Comma-separated. Surfaced in the daily digest on those days.
        </span>
      </label>

      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Notes
        <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field mt-1" />
      </label>
    </>
  );
}

export function DeadlineForm({
  ventures,
  existing,
}: {
  ventures: Venture[];
  existing?: Existing;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ---- Edit mode: plain server-action forms (they redirect on success) ----
  if (existing) {
    return (
      <div className="space-y-3">
        <form action={updateDeadline} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} existing={existing} />
          <button type="submit" className="btn btn-primary w-full">
            Save
          </button>
        </form>
        <form action={deleteDeadline}>
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="btn w-full text-[var(--color-danger)]">
            Delete deadline
          </button>
        </form>
      </div>
    );
  }

  // ---- Create mode: collapsible client form with reset + refresh ----
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        + New deadline
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createDeadline(fd);
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
      <Fields ventures={ventures} />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? "Saving…" : "Add deadline"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          Cancel
        </button>
      </div>
    </form>
  );
}
