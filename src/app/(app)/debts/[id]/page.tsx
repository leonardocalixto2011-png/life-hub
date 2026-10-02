import { notFound, redirect } from "next/navigation";
import { Banknote } from "lucide-react";

import { getDebt, hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { hasConsentIn } from "@/lib/consent";
import { getT } from "@/lib/i18n-server";
import { money, toDateInput } from "@/lib/format";
import { basisPointsToInput, centsToInput } from "@/lib/money";
import { DebtForm } from "../DebtForm";
import { logDebtPayment } from "../actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/SectionHeader";
import { FormSection } from "@/components/Form";

export const dynamic = "force-dynamic";

export default async function DebtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, hub } = await requireHub();
  const t = await getT();
  const { id } = await params;
  const [[debt, consented], { ventures, members }] = await Promise.all([
    withHub(user.id, (tx) =>
      Promise.all([getDebt(tx, user.id, id), hasConsentIn(tx, user.id, "DEBTS_SENSITIVE")]),
    ),
    hubChrome(user.id, hub.id),
  ]);
  // No consent on file (never given, or withdrawn): the consent card on /debts
  // comes first, same as the list.
  if (!consented) redirect("/debts");
  // getDebt is now owner-scoped itself (RLS would otherwise let a FULL-share
  // viewer read the row, and this page is the edit form). Kept as a belt on
  // top of that brace — it costs nothing and states the rule at the point a
  // reader of this page will look for it.
  if (!debt || debt.ownerId !== user.id) notFound();

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/debts", label: t("Debts") }}
        title={debt.name}
        sub={t("Balance {amount}", {
          amount: money(debt.balanceCents, hub.currency, user.locale ?? undefined),
        })}
      />

      {/* The thing done most often on this screen, so it comes first. */}
      {debt.status !== "PAID_OFF" && (
        <form action={logDebtPayment}>
          <input type="hidden" name="id" value={debt.id} />
          <FormSection title={t("Log a payment")}>
            <p className="field-hint mt-0">
              {t("Adds a matching Budget expense, drops the balance, and moves the due date forward one payment.")}
            </p>
            <div className="form-grid">
              <label className="field-label">
                {t("Amount")}
                <input
                  name="amount"
                  type="number"
                  step="0.01"
                  min="0"
                  inputMode="decimal"
                  required
                  defaultValue={centsToInput(debt.actualPaymentCents ?? debt.minimumPaymentCents)}
                  className="field"
                />
              </label>
              <label className="field-label">
                {t("Date")}
                <input type="date" name="date" defaultValue={toDateInput(new Date())} className="field" />
              </label>
            </div>
            <SubmitButton className="btn btn-primary w-full">
              <Banknote size={17} strokeWidth={2} aria-hidden />
              {t("Log payment")}
            </SubmitButton>
          </FormSection>
        </form>
      )}

      <DebtForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
        existing={{
          id: debt.id,
          name: debt.name,
          balance: centsToInput(debt.balanceCents),
          apr: basisPointsToInput(debt.aprBasisPoints),
          minimumPayment: centsToInput(debt.minimumPaymentCents),
          actualPayment: centsToInput(debt.actualPaymentCents),
          dueDate: toDateInput(debt.dueDate),
          status: debt.status,
          type: debt.type,
          originalBalance: centsToInput(debt.originalBalanceCents),
          paymentFrequency: debt.paymentFrequency,
          ventureId: debt.ventureId,
          notes: debt.notes,
        }}
      />
    </div>
  );
}
