"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createDeadline, deleteDeadline, updateDeadline } from "./actions";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useT } from "@/components/I18nProvider";
import type { T } from "@/lib/i18n";

type Venture = { id: string; name: string };

type Existing = {
  id: string;
  title: string;
  notes: string | null;
  dueDate: string; // yyyy-mm-dd
  ventureId: string | null;
  remindDaysBefore: number[];
  visibility?: "PRIVATE" | "SHARED";
};

function Fields({ ventures, existing, t }: { ventures: Venture[]; existing?: Existing; t: T }) {
  const label = "block text-xs font-semibold text-[var(--color-text-dim)]";
  return (
    <>
      <label className={label}>
        {t("Title")}
        <input
          name="title"
          defaultValue={existing?.title}
          required
          className="field mt-1"
          placeholder={t("Tax filing, lease renewal, permit…")}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className={label}>
          {t("Due date")}
          <input type="date" name="dueDate" defaultValue={existing?.dueDate} required className="field mt-1" />
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

      <label className={label}>
        {t("Remind days before")}
        <input
          name="remindDaysBefore"
          defaultValue={(existing?.remindDaysBefore ?? [7, 3, 1]).join(", ")}
          className="field mt-1"
          placeholder="7, 3, 1"
        />
        <span className="mt-1 block font-normal">{t("Comma-separated. A notification on each of those days.")}</span>
      </label>

      <label className={label}>
        {t("Notes")}
        <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field mt-1" />
      </label>

      <PrivacyToggle defaultValue={existing?.visibility} />
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
  const t = useT();
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
          <Fields ventures={ventures} existing={existing} t={t} />
          <button type="submit" className="btn btn-primary w-full">
            {t("Save")}
          </button>
        </form>
        <form action={deleteDeadline}>
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="btn w-full text-[var(--color-danger)]">
            {t("Delete deadline")}
          </button>
        </form>
      </div>
    );
  }

  // ---- Create mode: collapsible client form with reset + refresh ----
  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        {t("+ New deadline")}
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
        setError(err instanceof Error ? err.message : t("Could not save"));
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 p-4">
      <Fields ventures={ventures} t={t} />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? t("Saving…") : t("Add deadline")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
