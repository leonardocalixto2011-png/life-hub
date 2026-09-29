"use client";

import { useState, useTransition } from "react";

import { createTrip, updateTrip } from "./actions";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useT } from "@/components/I18nProvider";
import type { T } from "@/lib/i18n";
import { SubmitButton } from "@/components/SubmitButton";
import { ActionForm } from "@/components/ActionForm";

type Existing = {
  id: string;
  title: string;
  destination: string | null;
  startDate: string; // yyyy-MM-dd
  endDate: string;
  budget: string;
  notes: string | null;
  visibility: "PRIVATE" | "SHARED";
  travelerIds: string[];
};

type Member = { id: string; name: string | null; email: string | null };

function Fields({ existing, members = [], t }: { existing?: Existing; members?: Member[]; t: T }) {
  const label = "field-label";
  return (
    <>
      <div className="form-grid">
        <label className={label}>
          {t("Trip")}
          <input
            name="title"
            required
            defaultValue={existing?.title}
            className="field"
            placeholder={t("Punta Cana, weekend in Québec…")}
          />
        </label>
        <label className={label}>
          {t("Destination")}
          <input name="destination" defaultValue={existing?.destination ?? ""} className="field" />
        </label>
      </div>
      <div className="form-grid">
        <label className={label}>
          {t("Leaving")}
          <input type="date" name="startDate" required defaultValue={existing?.startDate} className="field" />
        </label>
        <label className={label}>
          {t("Back")}
          <input type="date" name="endDate" required defaultValue={existing?.endDate} className="field" />
        </label>
      </div>
      <label className={label}>
        {t("Budget (optional)")}
        <input
          name="budget"
          type="number"
          step="0.01"
          min="0"
          inputMode="decimal"
          defaultValue={existing?.budget}
          className="field"
        />
      </label>
      <label className={label}>
        {t("Notes")}
        <textarea name="notes" rows={2} defaultValue={existing?.notes ?? ""} className="field" />
      </label>
      {members.length > 1 && (
        <fieldset className={label}>
          <legend>{t("Who's going")}</legend>
          <input type="hidden" name="travelersShown" value="1" />
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm font-normal text-[var(--color-text)]">
            {members.map((m) => (
              <label key={m.id} className="check-row">
                <input
                  type="checkbox"
                  name="travelerIds"
                  value={m.id}
                  defaultChecked={!existing?.travelerIds.length || existing.travelerIds.includes(m.id)}
                />
                {m.name ?? m.email}
              </label>
            ))}
          </div>
          <p className="field-hint">{t("Deposits are split between the people going.")}</p>
        </fieldset>
      )}
      <PrivacyToggle defaultValue={existing?.visibility} />
    </>
  );
}

export function TripForm({ existing, members }: { existing?: Existing; members?: Member[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (existing) {
    return (
      <ActionForm action={updateTrip} className="form-card mt-1">
        <input type="hidden" name="id" value={existing.id} />
        <Fields existing={existing} members={members} t={t} />
        <SubmitButton className="btn btn-primary w-full">
          {t("Save trip")}
        </SubmitButton>
      </ActionForm>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        {t("+ Plan a trip")}
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        // Redirects to the new trip on success; returns { error } otherwise.
        const res = await createTrip(fd);
        if (res.error) setError(t(res.error));
      } catch (err) {
        // A redirect is thrown as a special error Next handles itself; only
        // surface real failures.
        if (err instanceof Error && !err.message.includes("NEXT_REDIRECT")) setError(t(err.message));
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="form-card">
      <Fields t={t} />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? t("Saving…") : t("Create trip")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
