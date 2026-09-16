"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createEvent, deleteEvent, deleteEventSeries, updateEvent } from "./actions";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useT } from "@/components/I18nProvider";
import type { T } from "@/lib/i18n";

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

/** From a "plan something" link on a holiday or special date. */
type Prefill = { title: string; startAt: string };

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
  prefill,
  t,
}: {
  ventures: Venture[];
  members: Member[];
  existing?: Existing;
  prefill?: Prefill;
  t: T;
}) {
  const attending = new Set(existing?.attendeeIds ?? []);
  const label = "block text-xs font-semibold text-[var(--color-text-dim)]";
  return (
    <>
      <label className={label}>
        {t("Title")}
        <input
          name="title"
          defaultValue={existing?.title ?? prefill?.title}
          required
          className="field mt-1"
          placeholder={t("Dinner, supplier call, photoshoot…")}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("Starts")}
          <input
            type="datetime-local"
            name="startAt"
            defaultValue={existing?.startAt ?? prefill?.startAt}
            required
            className="field mt-1"
          />
        </label>
        <label className={label}>
          {t("Ends (same day)")}
          <input type="datetime-local" name="endAt" defaultValue={existing?.endAt} className="field mt-1" />
        </label>
      </div>
      {!existing && (
        <p className="-mt-2 text-[0.65rem] text-[var(--color-text-dim)]">
          {t("For something that repeats on several days, keep “Ends” on the same day and use Repeat below.")}
        </p>
      )}

      {!existing && (
        <fieldset className="rounded-lg border border-[var(--color-border)] p-2.5 text-xs font-semibold text-[var(--color-text-dim)]">
          {t("Repeat (optional)")}
          <div className="mt-1 flex flex-wrap gap-2">
            {WEEKDAYS.map((w) => (
              <label key={w.value} className="flex items-center gap-1 font-normal">
                <input type="checkbox" name="repeatDays" value={w.value} />
                {t(w.label)}
              </label>
            ))}
          </div>
          <label className="mt-2 block font-normal">
            {t("Repeat until")}
            <input type="date" name="repeatUntil" className="field mt-1" />
          </label>
        </fieldset>
      )}

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("Location")}
          <input name="location" defaultValue={existing?.location ?? ""} className="field mt-1" />
        </label>
        <label className={label}>
          {t("Venture")}
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
        {t("Attendees")}
        <div className="mt-1 flex flex-wrap gap-3">
          {members.map((m) => (
            <label key={m.id} className="flex items-center gap-1.5 font-normal">
              <input type="checkbox" name="attendeeIds" value={m.id} defaultChecked={attending.has(m.id)} />
              {m.name ?? m.email}
            </label>
          ))}
        </div>
      </fieldset>

      <label className={label}>
        {t("Notes")}
        <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field mt-1" />
      </label>

      <PrivacyToggle defaultValue={existing?.visibility} />
    </>
  );
}

export function EventForm({
  ventures,
  members,
  existing,
  prefill,
}: {
  ventures: Venture[];
  members: Member[];
  existing?: Existing;
  prefill?: Prefill;
}) {
  const router = useRouter();
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(Boolean(prefill));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (existing) {
    return (
      <div className="space-y-3">
        <form action={updateEvent} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} members={members} existing={existing} t={t} />
          <button type="submit" className="btn btn-primary w-full">
            {t("Save")}
          </button>
        </form>
        <form action={deleteEvent}>
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="btn w-full text-[var(--color-danger)]">
            {existing.recurrenceGroupId ? t("Delete just this one") : t("Delete event")}
          </button>
        </form>
        {existing.recurrenceGroupId && (
          <form action={deleteEventSeries}>
            <input type="hidden" name="recurrenceGroupId" value={existing.recurrenceGroupId} />
            <input type="hidden" name="fromDate" value={existing.startAt} />
            <button type="submit" className="btn w-full text-[var(--color-danger)]">
              {t("Delete this and future")}
            </button>
          </form>
        )}
      </div>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        {t("+ New event")}
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
        // Drop ?title=&date= so a refresh doesn't reopen the pre-filled form.
        if (prefill) router.replace("/calendar");
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Could not save"));
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 p-4">
      <Fields ventures={ventures} members={members} prefill={prefill} t={t} />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? t("Saving…") : t("Add event")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
