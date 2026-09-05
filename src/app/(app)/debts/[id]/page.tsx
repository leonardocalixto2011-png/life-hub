import Link from "next/link";
import { notFound } from "next/navigation";

import { getDebt, listMembers, listVentures } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { toDateInput } from "@/lib/format";
import { basisPointsToInput, centsToInput } from "@/lib/money";
import { DebtForm } from "../DebtForm";

export const dynamic = "force-dynamic";

export default async function DebtDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, hub } = await requireHub();
  const { id } = await params;
  const [debt, ventures, members] = await withHub(user.id, (tx) =>
    Promise.all([getDebt(tx, hub.id, id), listVentures(tx, hub.id), listMembers(tx, hub.id)]),
  );
  if (!debt) notFound();

  return (
    <div className="space-y-3 p-3">
      <Link href="/debts" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← Debts
      </Link>
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
          ventureId: debt.ventureId,
          ownerId: debt.ownerId,
          notes: debt.notes,
        }}
      />
    </div>
  );
}
