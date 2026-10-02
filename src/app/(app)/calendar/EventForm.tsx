"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { createEvent, deleteEvent, deleteEventSeries, updateEvent } from "./actions";
import { DangerZone, FormSection } from "@/components/Form";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useSheetAction } from "@/components/EditSheet";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { SubmitButton } from "@/components/SubmitButton";
import { useT } from "@/components/I18nProvider";
import type { T } from "@/lib/i18n";
import { personName } from "@/lib/people";

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

/** `grouped` = the edit screen's titled cards; the inline create form is
 *  already a card, so it renders the same fields flat. */
function Fields({
  ventures,
  members,
  existing,
  prefill,
  t,
  grouped,
}: {
  ventures: Venture[];
  members: Member[];
  existing?: Existing;
  prefill?: Prefill;
  t: T;
  grouped?: boolean;
}) {
  const attending = new Set(existing?.attendeeIds ?? []);
  const plain = !grouped;
  return (
    <>
      <FormSection title={t("Details")} plain={plain}>
        <label className="field-label">
          {t("Title")}
          <input
            name="title"
            defaultValue={existing?.title ?? prefill?.title}
            required
            className="field"
            placeholder={t("Dinner, supplier call, photoshoot…")}
          />
        </label>

        {/* One per row, not side by side: a datetime-local in half of a 375px
            screen clips its own time, so you could not see what you'd picked. */}
        <div className="form-stack">
          <label className="field-label">
            {t("Starts")}
            <input
              type="datetime-local"
              name="startAt"
              defaultValue={existing?.startAt ?? prefill?.startAt}
              required
              className="field"
            />
          </label>
          <label className="field-label">
            {t("Ends (same day)")}
            <input type="datetime-local" name="endAt" defaultValue={existing?.endAt} className="field" />
          </label>
        </div>
        {!existing && (
          <p className="field-hint -mt-2">
            {t("For something that repeats on several days, keep “Ends” on the same day and use Repeat below.")}
          </p>
        )}

        {!existing && (
          <fieldset className="rounded-[var(--r-md)] border border-[var(--color-border)] p-3">
            <legend className="field-label px-1">{t("Repeat (optional)")}</legend>
            <div className="flex flex-wrap gap-x-3">
              {WEEKDAYS.map((w) => (
                <label key={w.value} className="check-row">
                  <input type="checkbox" name="repeatDays" value={w.value} />
                  {t(w.label)}
                </label>
              ))}
            </div>
            <label className="field-label mt-2">
              {t("Repeat until")}
              <input type="date" name="repeatUntil" className="field" />
            </label>
          </fieldset>
        )}
      </FormSection>

      <FormSection title={t("Where & who")} plain={plain}>
        <div className="form-grid">
          <label className="field-label">
            {t("Location")}
            <input name="location" defaultValue={existing?.location ?? ""} className="field" />
          </label>
          <label className="field-label">
            {t("Venture")}
            <select name="ventureId" defaultValue={existing?.ventureId ?? ""} className="field">
              <option value="">—</option>
              {ventures.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <fieldset>
          <legend className="field-label">{t("Attendees")}</legend>
          <div className="flex flex-wrap gap-x-4">
            {members.map((m) => (
              <label key={m.id} className="check-row">
                <input type="checkbox" name="attendeeIds" value={m.id} defaultChecked={attending.has(m.id)} />
                {personName(m, t("Member"))}
              </label>
            ))}
          </div>
        </fieldset>

        <label className="field-label">
          {t("Notes")}
          <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field" />
        </label>

        <PrivacyToggle defaultValue={existing?.visibility} />
      </FormSection>
    </>
  );
}

export function EventForm({
  ventures,
  members,
  existing,
  prefill,
  beforeDanger,
}: {
  ventures: Venture[];
  members: Member[];
  existing?: Existing;
  prefill?: Prefill;
  /** Edit screen only: secondary actions shown between Save and Delete. */
  beforeDanger?: React.ReactNode;
}) {
  const router = useRouter();
  const inSheet = useSheetAction();
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(Boolean(prefill));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (existing) {
    return (
      <>
        <form action={inSheet(updateEvent)} className="space-y-5">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} members={members} existing={existing} t={t} grouped />
          <SubmitButton className="btn btn-primary btn-lg w-full">{t("Save")}</SubmitButton>
        </form>
        {beforeDanger}
        <DangerZone>
          <form action={inSheet(deleteEvent)}>
            <input type="hidden" name="id" value={existing.id} />
            <ConfirmButton>
              <Trash2 size={16} strokeWidth={2} aria-hidden />
              {existing.recurrenceGroupId ? t("Delete just this one") : t("Delete event")}
            </ConfirmButton>
          </form>
          {existing.recurrenceGroupId && (
            <form action={inSheet(deleteEventSeries)}>
              <input type="hidden" name="recurrenceGroupId" value={existing.recurrenceGroupId} />
              <input type="hidden" name="fromDate" value={existing.startAt} />
              <ConfirmButton confirmLabel={t("Delete this and every later one?")}>
                <Trash2 size={16} strokeWidth={2} aria-hidden />
                {t("Delete this and future")}
              </ConfirmButton>
            </form>
          )}
        </DangerZone>
      </>
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
        setError(err instanceof Error ? t(err.message) : t("Could not save"));
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="form-card">
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
