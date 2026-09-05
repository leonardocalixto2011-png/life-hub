"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createEvent, deleteEvent, deleteEventSeries, updateEvent } from "./actions";
import { PrivacyToggle } from "@/components/PrivacyToggle";

type Member = { id: string; name: string | null; email: string | null };
type Venture = { id: string; name: string };

type Existing = {
  id: string;
  title: string;
  notes: string | null;
  location: string | null;
  startAt: string; // datetime-local
  endAt: string;
  ventureId: string | null;
  attendeeIds: string[];
  visibility?: "PRIVATE" | "SHARED";
  recurrenceGroupId: string | null;
};

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

function Fields({
  ventures,
  members,
  existing,
}: {
  ventures: Venture[];
  members: Member[];
  existing?: Existing;
}) {
  const attending = new Set(existing?.attendeeIds ?? []);
  return (
    <>
      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Title
        <input
          name="title"
          defaultValue={existing?.title}
          required
          className="field mt-1"
          placeholder="Supplier call, photoshoot, class…"
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Starts
          <input
            type="datetime-local"
            name="startAt"
            defaultValue={existing?.startAt}
            required
            className="field mt-1"
          />
        </label>
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Ends
          <input
            type="datetime-local"
            name="endAt"
            defaultValue={existing?.endAt}
            className="field mt-1"
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
          Location
          <input name="location" defaultValue={existing?.location ?? ""} className="field mt-1" />
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

      <fieldset className="text-xs font-semibold text-[var(--color-text-dim)]">
        Attendees
        <div className="mt-1 flex flex-wrap gap-3">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-1.5 font-normal">
              <input
                type="checkbox"
                name="attendeeIds"
                value={m.id}
                defaultChecked={attending.has(m.id)}
              />
              {m.name ?? m.email}
            </label>
          ))}
        </div>
      </fieldset>

      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Notes
        <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field mt-1" />
      </label>

      {!existing && (
        <fieldset className="text-xs font-semibold text-[var(--color-text-dim)]">
          Repeat (optional)
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAYS.map((w) => (
              <label key={w.value} className="flex items-center gap-1 font-normal">
                <input type="checkbox" name="repeatDays" value={w.value} />
                {w.label}
              </label>
            ))}
          </div>
          <label className="mt-2 block font-normal">
            Repeat until
            <input type="date" name="repeatUntil" className="field mt-1" />
          </label>
        </fieldset>
      )}

      <PrivacyToggle defaultValue={existing?.visibility} />
    </>
  );
}

export function EventForm({
  ventures,
  members,
  existing,
}: {
  ventures: Venture[];
  members: Member[];
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
        <form action={updateEvent} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} members={members} existing={existing} />
          <button type="submit" className="btn btn-primary w-full">
            Save
          </button>
        </form>
        <form action={deleteEvent}>
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="btn w-full text-[var(--color-danger)]">
            {existing.recurrenceGroupId ? "Delete just this one" : "Delete event"}
          </button>
        </form>
        {existing.recurrenceGroupId && (
          <form action={deleteEventSeries}>
            <input type="hidden" name="recurrenceGroupId" value={existing.recurrenceGroupId} />
            <input type="hidden" name="fromDate" value={existing.startAt} />
            <button type="submit" className="btn w-full text-[var(--color-danger)]">
              Delete this and future
            </button>
          </form>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        + New event
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createEvent(fd);
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
          {pending ? "Saving…" : "Add event"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          Cancel
        </button>
      </div>
    </form>
  );
}
