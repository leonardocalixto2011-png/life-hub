"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createSpecialDate } from "./actions";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useT } from "@/components/I18nProvider";

export function SpecialDateForm() {
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
        {t("+ Add a birthday, anniversary…")}
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createSpecialDate(fd);
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
      <label className={label}>
        {t("What")}
        <input name="title" required className="field mt-1" placeholder={t("Chantelle's birthday, our anniversary…")} />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("Kind")}
          <select name="kind" defaultValue="BIRTHDAY" className="field mt-1">
            <option value="BIRTHDAY">🎂 {t("Birthday")}</option>
            <option value="ANNIVERSARY">💍 {t("Anniversary")}</option>
            <option value="OTHER">⭐ {t("Other")}</option>
          </select>
        </label>
        <label className={label}>
          {t("Date")}
          <input type="date" name="date" required className="field mt-1" />
        </label>
      </div>
      <label className="flex items-center gap-2 text-xs text-[var(--color-text-dim)]">
        <input type="checkbox" name="yearUnknown" />
        {t("I don't know the year (hides the age / years count)")}
      </label>

      <label className={label}>
        {t("Remind days before")}
        <input name="remindDaysBefore" defaultValue="7, 1" className="field mt-1" />
        <span className="mt-1 block font-normal">{t("A push notification on each of those days, every year.")}</span>
      </label>

      <label className={label}>
        {t("Notes")}
        <textarea name="notes" rows={2} className="field mt-1" placeholder={t("Gift ideas, favourite restaurant…")} />
      </label>

      <PrivacyToggle />

      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? t("Saving…") : t("Save date")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
