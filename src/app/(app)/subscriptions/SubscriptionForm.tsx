"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import {
  createSubscription,
  deleteSubscription,
  updateSubscription,
} from "./actions";
import { DangerZone, FormSection } from "@/components/Form";
import { useT } from "@/components/I18nProvider";
import type { T } from "@/lib/i18n";
import { SubmitButton } from "@/components/SubmitButton";
import { personName } from "@/lib/people";

type Opt = { id: string; name: string | null; email?: string | null };

type Existing = {
  id: string;
  name: string;
  cost: string; // "12.50"
  billingCycle: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  renewalDate: string;
  cancelByDate: string;
  ventureId: string | null;
  ownerId: string | null;
  notes: string | null;
};

function MoreFields({
  ventures,
  members,
  existing,
  t,
}: {
  ventures: { id: string; name: string }[];
  members: Opt[];
  existing?: Existing;
  t: T;
}) {
  return (
    <>
      <label className="field-label">
        {t("Cancel by")}
        <input type="date" name="cancelByDate" defaultValue={existing?.cancelByDate} className="field" />
      </label>

      <div className="form-grid">
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
        <label className="field-label">
          {t("Owner")}
          <select name="ownerId" defaultValue={existing?.ownerId ?? ""} className="field">
            <option value="">{t("— (no owner)")}</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {personName(m, t("Member"))}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="field-label">
        {t("Notes")}
        <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field" />
      </label>
    </>
  );
}

/** `grouped` = the edit screen: titled cards, everything visible. The inline
 *  create form stays one card with the rarely-set fields folded away. */
function Fields({
  ventures,
  members,
  existing,
  t,
  grouped,
}: {
  ventures: { id: string; name: string }[];
  members: Opt[];
  existing?: Existing;
  t: T;
  grouped?: boolean;
}) {
  return (
    <>
      <FormSection title={t("Details")} plain={!grouped}>
        <label className="field-label">
          {t("Name")}
          <input
            name="name"
            defaultValue={existing?.name}
            required
            className="field"
            placeholder={t("Adobe CC, Shopify, gym…")}
          />
        </label>

        {/* Name + cost + cycle + renewal are all it takes to add a sub. The other
            five fields are rarely set on the first pass, so they start folded. */}
        <div className="form-grid">
          <label className="field-label">
            {t("Cost")}
            <input
              name="cost"
              type="number"
              step="0.01"
              min="0"
              inputMode="decimal"
              defaultValue={existing?.cost}
              required
              className="field"
            />
          </label>
          <label className="field-label">
            {t("Cycle")}
            <select name="billingCycle" defaultValue={existing?.billingCycle ?? "MONTHLY"} className="field">
              <option value="WEEKLY">{t("Weekly")}</option>
              <option value="MONTHLY">{t("Monthly")}</option>
              <option value="QUARTERLY">{t("Quarterly")}</option>
              <option value="YEARLY">{t("Yearly")}</option>
              <option value="CUSTOM">{t("Custom")}</option>
            </select>
          </label>
        </div>

        <label className="field-label">
          {t("Next renewal")}
          <input type="date" name="renewalDate" defaultValue={existing?.renewalDate} required className="field" />
        </label>
      </FormSection>

      {grouped ? (
        <FormSection title={t("More options")}>
          <MoreFields ventures={ventures} members={members} existing={existing} t={t} />
        </FormSection>
      ) : (
        <details className="group">
          <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--color-primary)]">
            <span className="group-open:hidden">{t("More options")}</span>
            <span className="hidden group-open:inline">{t("Fewer options")}</span>
          </summary>
          <div className="form-stack mt-4">
            <MoreFields ventures={ventures} members={members} existing={existing} t={t} />
          </div>
        </details>
      )}
    </>
  );
}

export function SubscriptionForm({
  ventures,
  members,
  existing,
}: {
  ventures: { id: string; name: string }[];
  members: Opt[];
  existing?: Existing;
}) {
  const router = useRouter();
  const t = useT();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (existing) {
    return (
      <>
        <form action={updateSubscription} className="space-y-5">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} members={members} existing={existing} t={t} grouped />
          <SubmitButton className="btn btn-primary btn-lg w-full">{t("Save")}</SubmitButton>
        </form>
        <DangerZone>
          <form action={deleteSubscription}>
            <input type="hidden" name="id" value={existing.id} />
            <SubmitButton className="btn btn-quiet-danger w-full" pendingLabel={t("Deleting…")}>
              <Trash2 size={16} strokeWidth={2} aria-hidden />
              {t("Delete subscription")}
            </SubmitButton>
          </form>
        </DangerZone>
      </>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        {t("+ New subscription")}
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createSubscription(fd);
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
      <Fields ventures={ventures} members={members} t={t} />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      <div className="flex gap-2">
        <button type="submit" disabled={pending} className="btn btn-primary flex-1">
          {pending ? t("Saving…") : t("Add subscription")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
