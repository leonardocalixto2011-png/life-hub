"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createShifts } from "./actions";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useT } from "@/components/I18nProvider";

type Member = { id: string; name: string | null; email: string | null };

const WEEKDAYS = [
  { value: 1, label: "Mon" },
  { value: 2, label: "Tue" },
  { value: 3, label: "Wed" },
  { value: 4, label: "Thu" },
  { value: 5, label: "Fri" },
  { value: 6, label: "Sat" },
  { value: 0, label: "Sun" },
] as const;

export function ShiftForm({
  members,
  currentUserId,
  defaultFrom,
}: {
  members: Member[];
  currentUserId: string;
  /** yyyy-MM-dd — the Monday of the week being viewed. */
  defaultFrom: string;
}) {
  const router = useRouter();
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const label = "block text-xs font-semibold text-[var(--color-text-dim)]";

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        {t("+ Add a work schedule")}
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createShifts(fd);
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t("Could not save"));
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 p-4">
      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("Whose schedule")}
          <select name="personId" defaultValue={currentUserId} className="field mt-1">
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name ?? m.email}
              </option>
            ))}
          </select>
        </label>
        <label className={label}>
          {t("Label")}
          <input name="label" className="field mt-1" placeholder={t("Work, school, gym…")} />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("Starts")}
          <input type="time" name="startTime" required defaultValue="09:00" className="field mt-1" />
        </label>
        <label className={label}>
          {t("Ends")}
          <input type="time" name="endTime" required defaultValue="17:00" className="field mt-1" />
        </label>
      </div>
      <p className="-mt-2 text-[0.65rem] text-[var(--color-text-dim)]">
        {t("An end time before the start is a night shift ending the next morning.")}
      </p>

      <fieldset className="rounded-lg border border-[var(--color-border)] p-2.5 text-xs font-semibold text-[var(--color-text-dim)]">
        {t("On these days")}
        <div className="mt-1 flex flex-wrap gap-2">
          {WEEKDAYS.map((w) => (
            <label key={w.value} className="flex items-center gap-1 font-normal">
              <input type="checkbox" name="days" value={w.value} defaultChecked={w.value >= 1 && w.value <= 5} />
              {t(w.label)}
            </label>
          ))}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-3">
          <label className="block font-normal">
            {t("From")}
            <input type="date" name="fromDate" required defaultValue={defaultFrom} className="field mt-1" />
          </label>
          <label className="block font-normal">
            {t("Until")}
            <input type="date" name="untilDate" className="field mt-1" />
          </label>
        </div>
        <p className="mt-1 font-normal">{t("Leave “Until” empty for a single day.")}</p>
      </fieldset>

      <PrivacyToggle />

      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? t("Saving…") : t("Add schedule")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
