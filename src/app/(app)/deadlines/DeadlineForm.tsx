"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { createDeadline, deleteDeadline, updateDeadline } from "./actions";
import { DangerZone, FormSection } from "@/components/Form";
import { ConfirmButton } from "@/components/ConfirmButton";
import { useSheetAction } from "@/components/EditSheet";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useT } from "@/components/I18nProvider";
import type { T } from "@/lib/i18n";
import { SubmitButton } from "@/components/SubmitButton";

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

/** `grouped` splits the fields into titled cards (the edit screen); the
 *  inline create form is already one card, so it renders them flat. */
function Fields({
  ventures,
  existing,
  t,
  grouped,
}: {
  ventures: Venture[];
  existing?: Existing;
  t: T;
  grouped?: boolean;
}) {
  const plain = !grouped;
  return (
    <>
      <FormSection title={t("Details")} plain={plain}>
        <label className="field-label">
          {t("Title")}
          <input
            name="title"
            defaultValue={existing?.title}
            required
            className="field"
            placeholder={t("Tax filing, lease renewal, permit…")}
          />
        </label>

        <div className="form-grid">
          <label className="field-label">
            {t("Due date")}
            <input type="date" name="dueDate" defaultValue={existing?.dueDate} required className="field" />
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
      </FormSection>

      <FormSection title={t("Reminders & notes")} plain={plain}>
        <label className="field-label">
          {t("Remind days before")}
          <input
            name="remindDaysBefore"
            defaultValue={(existing?.remindDaysBefore ?? [7, 3, 1]).join(", ")}
            className="field"
            placeholder="7, 3, 1"
          />
          <span className="field-hint">{t("Comma-separated. A notification on each of those days.")}</span>
        </label>

        <label className="field-label">
          {t("Notes")}
          <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field" />
        </label>

        <PrivacyToggle defaultValue={existing?.visibility} />
      </FormSection>
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
  const inSheet = useSheetAction();
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // ---- Edit mode: plain server-action forms (they redirect on success) ----
  if (existing) {
    return (
      <>
        <form action={inSheet(updateDeadline)} className="space-y-5">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} existing={existing} t={t} grouped />
          <SubmitButton className="btn btn-primary btn-lg w-full">{t("Save")}</SubmitButton>
        </form>
        <DangerZone>
          <form action={inSheet(deleteDeadline)}>
            <input type="hidden" name="id" value={existing.id} />
            <ConfirmButton>
              <Trash2 size={16} strokeWidth={2} aria-hidden />
              {t("Delete deadline")}
            </ConfirmButton>
          </form>
        </DangerZone>
      </>
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
        setError(err instanceof Error ? t(err.message) : t("Could not save"));
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="form-card">
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
