"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";

import { DangerZone } from "@/components/Form";
import { ConfirmButton } from "@/components/ConfirmButton";

import { createDebt, deleteDebt, updateDebt } from "./actions";
import { useT } from "@/components/I18nProvider";
import type { T } from "@/lib/i18n";
import { SubmitButton } from "@/components/SubmitButton";

type Opt = { id: string; name: string | null; email?: string | null };

type Existing = {
  id: string;
  name: string;
  balance: string; // "1250.00"
  apr: string; // "25.99"
  minimumPayment: string;
  actualPayment: string;
  dueDate: string;
  status: "CURRENT" | "DEFAULT" | "PAID_OFF";
  type: "CREDIT_CARD" | "LINE_OF_CREDIT" | "LOAN" | "CAR_LOAN" | "BNPL" | "OTHER";
  originalBalance: string;
  paymentFrequency: "WEEKLY" | "BIWEEKLY" | "MONTHLY";
  ventureId: string | null;
  notes: string | null;
};

function Fields({
  ventures,
  existing,
  t,
}: {
  ventures: { id: string; name: string }[];
  existing?: Existing;
  t: T;
}) {
  const label = "field-label";
  const num = { type: "number", step: "0.01", min: "0", inputMode: "decimal" as const };
  return (
    <>
      <label className={label}>
        {t("Name")}
        <input name="name" defaultValue={existing?.name} required className="field" placeholder={t("RBC Visa, Ford loan…")} />
      </label>

      <label className={label}>
        {t("Kind")}
        <select name="type" defaultValue={existing?.type ?? "CREDIT_CARD"} className="field">
          <option value="CREDIT_CARD">{t("Credit card")}</option>
          <option value="LINE_OF_CREDIT">{t("Line of credit")}</option>
          <option value="LOAN">{t("Loan")}</option>
          <option value="CAR_LOAN">{t("Car loan")}</option>
          <option value="BNPL">{t("Buy now, pay later")}</option>
          <option value="OTHER">{t("Other")}</option>
        </select>
      </label>

      <div className="form-grid">
        <label className={label}>
          {t("Balance")}
          <input name="balance" {...num} defaultValue={existing?.balance} required className="field" />
        </label>
        <label className={label}>
          {t("APR % (optional)")}
          <input name="apr" {...num} defaultValue={existing?.apr} className="field" placeholder="25.99" />
        </label>
      </div>

      <div className="form-grid">
        <label className={label}>
          {t("Payment")}
          <input name="minimumPayment" {...num} defaultValue={existing?.minimumPayment} className="field" />
        </label>
        <label className={label}>
          {t("How often")}
          <select name="paymentFrequency" defaultValue={existing?.paymentFrequency ?? "MONTHLY"} className="field">
            <option value="MONTHLY">{t("Monthly")}</option>
            <option value="BIWEEKLY">{t("Every 2 weeks")}</option>
            <option value="WEEKLY">{t("Weekly")}</option>
          </select>
        </label>
      </div>

      <label className={label}>
        {t("Next due date")}
        <input type="date" name="dueDate" defaultValue={existing?.dueDate} className="field" />
      </label>

      {/* Name + balance + APR + payment + due date covers a normal card or loan.
          The rest is for the negotiated / hardship cases. */}
      <details open={Boolean(existing)} className="group">
        <summary className="cursor-pointer list-none text-xs font-semibold text-[var(--color-primary)]">
          <span className="group-open:hidden">{t("More options")}</span>
          <span className="hidden group-open:inline">{t("Fewer options")}</span>
        </summary>

        <div className="form-stack mt-4">
          <div className="form-grid">
            <label className={label}>
              {t("Actual payment")}
              <input name="actualPayment" {...num} defaultValue={existing?.actualPayment} className="field" placeholder={t("if negotiated")} />
            </label>
            <label className={label}>
              {t("Status")}
              <select name="status" defaultValue={existing?.status ?? "CURRENT"} className="field">
                <option value="CURRENT">{t("Current")}</option>
                <option value="DEFAULT">{t("In default")}</option>
                <option value="PAID_OFF">{t("Paid off")}</option>
              </select>
            </label>
          </div>

          {/* No owner picker: a debt belongs to whoever creates it, and only
              they can edit it. Exposure to other people is the separate,
              explicit share control on /debts. */}
          <div className="form-grid">
            <label className={label}>
              {t("Started at")}
              <input name="originalBalance" {...num} defaultValue={existing?.originalBalance} className="field" placeholder={t("for payoff %")} />
            </label>
            <label className={label}>
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

          <label className={label}>
            {t("Notes")}
            <textarea name="notes" defaultValue={existing?.notes ?? ""} rows={2} className="field" />
          </label>
        </div>
      </details>
    </>
  );
}

export function DebtForm({
  ventures,
  existing,
}: {
  ventures: { id: string; name: string }[];
  members?: Opt[];
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
        <form action={updateDebt} className="space-y-5">
          <input type="hidden" name="id" value={existing.id} />
          <section>
            <h2 className="section-title">{t("Details")}</h2>
            <div className="form-card">
              <Fields ventures={ventures} existing={existing} t={t} />
            </div>
          </section>
          <SubmitButton className="btn btn-primary btn-lg w-full">{t("Save")}</SubmitButton>
        </form>
        <DangerZone>
          <form action={deleteDebt}>
            <input type="hidden" name="id" value={existing.id} />
            <ConfirmButton>
              <Trash2 size={16} strokeWidth={2} aria-hidden />
              {t("Delete debt")}
            </ConfirmButton>
          </form>
        </DangerZone>
      </>
    );
  }

  if (!open) {
    return (
      <button onClick={() => setOpen(true)} className="btn btn-primary w-full">
        {t("+ New debt")}
      </button>
    );
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    startTransition(async () => {
      try {
        await createDebt(fd);
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
          {pending ? t("Saving…") : t("Add debt")}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="btn">
          {t("Cancel")}
        </button>
      </div>
    </form>
  );
}
