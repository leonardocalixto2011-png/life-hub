"use client";

import { useState, useTransition } from "react";

import { createTrip, updateTrip } from "./actions";
import { PrivacyToggle } from "@/components/PrivacyToggle";

type Existing = {
  id: string;
  title: string;
  destination: string | null;
  startDate: string; // yyyy-MM-dd
  endDate: string;
  budget: string;
  notes: string | null;
  visibility: "PRIVATE" | "SHARED";
};

function Fields({ existing }: { existing?: Existing }) {
  return (
    <>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Trip
          <input
            name="title"
            required
            defaultValue={existing?.title}
            className="field mt-1"
            placeholder="Punta Cana, weekend in Québec…"
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Destination
          <input name="destination" defaultValue={existing?.destination ?? ""} className="field mt-1" />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Leaving
          <input type="date" name="startDate" required defaultValue={existing?.startDate} className="field mt-1" />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Back
          <input type="date" name="endDate" required defaultValue={existing?.endDate} className="field mt-1" />
        </label>
      </div>
      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Budget (optional)
        <input
          name="budget"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          defaultValue={existing?.budget}
          className="field mt-1"
        />
      </label>
      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Notes
        <textarea name="notes" rows={2} defaultValue={existing?.notes ?? ""} className="field mt-1" />
      </label>
      <PrivacyToggle defaultValue={existing?.visibility} />
    </>
  );
}

export function TripForm({ existing }: { existing?: Existing }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (existing) {
    return (
      <form action={updateTrip} className="card space-y-3 p-4">
        <input type="hidden" name="id" value={existing.id} />
        <Fields existing={existing} />
        <button type="submit" className="btn btn-primary w-full">
          Save trip
        </button>
      </form>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        + Plan a trip
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createTrip(fd); // redirects to the new trip on success
      } catch (err) {
        // A redirect is thrown as a special error Next handles itself; only
        // surface real failures.
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) setError(err.message);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="card space-y-3 p-4">
      <Fields />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? "Saving…" : "Create trip"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          Cancel
        </button>
      </div>
    </form>
  );
}
