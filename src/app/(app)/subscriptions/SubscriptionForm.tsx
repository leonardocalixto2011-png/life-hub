"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  createSubscription,
  deleteSubscription,
  updateSubscription,
} from "./actions";
import { useT } from "@/components/I18nProvider";
import type { T } from "@/lib/i18n";

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

function Fields({
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
  const label = "block text-xs font-semibold text-[var(--color-text-dim)]";
  return (
    <>
      <label className={label}>
        {t("Name")}
        <input
          name="name"
          defaultValue={existing?.name}
          required
          className="field mt-1"
          placeholder={t("Adobe CC, Shopify, gym…")}
        />
      </label>

      {/* Name + cost + cycle + renewal are all it takes to add a sub. The other
          five fields are rarely set on the first pass, so they start folded. */}
      <div className="grid grid-cols-2 gap-2">
        <label className={label}>
          {t("Cost")}
          <input
            name="cost"
            type="number"
            step="0.01"
            min="0"
            inputMode="decimal"
            defaultValue={existing?.cost}
            required
            className="field mt-1"
          />
        </label>
        <label className={label}>
          {t("Cycle")}
          <select name="billingCycle" defaultValue={existing?.billingCycle ?? "MONTHLY"} className="field mt-1">
            <option value="WEEKLY">{t("Weekly")}</option>
            <option value="MONTHLY">{t("Monthly")}</option>
            <option value="QUARTERLY">{t("Quarterly")}</option>
            <option value="YEARLY">{t("Yearly")}</option>
            <option value="CUSTOM">{t("Custom")}</option>
          </select>
        </label>
      </div>

      <label className={label}>
        {t("Next renewal")}
        <input type="date" name="renewalDate" defaultValue={existing?.renewalDate} required className="field mt-1" />
      </label>

      <details open={Boolean(existing)} className="group">
        <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--color-primary)]">
          <span className="group-open:hidden">{t("More options")}</span>
          <span className="hidden group-open:inline">{t("Fewer options")}</span>
        </summary>

        <div className="mt-3 space-y-3">
          <label className={label}>
            {t("Cancel by")}
            <input type="date" name="cancelByDate" defaultValue={existing?.cancelByDate} className="field mt-1" />
          </label>

          <div className="grid grid-cols-2 gap-3">
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
            <label className={label}>
              {t("Owner")}
              <select name="ownerId" defaultValue={existing?.ownerId ?? ""} className="field mt-1">
                <option value="">{t("— (no owner)")}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <label className={label}>
            {t("Notes")}
            <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field mt-1" />
          </label>
        </div>
      </details>
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
      <div className="space-y-3">
        <form action={updateSubscription} className="card space-y-3 p-4">
          <input type="hidden" name="id" value={existing.id} />
          <Fields ventures={ventures} members={members} existing={existing} t={t} />
          <button type="submit" className="btn btn-primary w-full">
            {t("Save")}
          </button>
        </form>
        <form action={deleteSubscription}>
          <input type="hidden" name="id" value={existing.id} />
          <button type="submit" className="btn w-full text-[var(--color-danger)]">
            {t("Delete subscription")}
          </button>
        </form>
      </div>
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
        setError(err instanceof Error ? err.message : t("Could not save"));
      }
    });
  }

  return (
    <form ref={formRef} onSubmit={onSubmit} className="card space-y-3 p-4">
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
