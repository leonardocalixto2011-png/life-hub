import Link from "next/link";
import { notFound } from "next/navigation";

import { getSubscription, listMembers, listVentures } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { toDateInput } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { SubscriptionForm } from "../SubscriptionForm";

export const dynamic = "force-dynamic";

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [sub, ventures, members] = await Promise.all([
    getSubscription(id),
    listVentures(),
    listMembers(),
  ]);
  if (!sub) notFound();

  return (
    <div className="space-y-3 p-3">
      <Link href="/subscriptions" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← Subscriptions
      </Link>
      <SubscriptionForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
        existing={{
          id: sub.id,
          name: sub.name,
          cost: centsToInput(sub.costCents),
          currency: sub.currency,
          billingCycle: sub.billingCycle,
          renewalDate: toDateInput(sub.renewalDate),
          cancelByDate: toDateInput(sub.cancelByDate),
          ventureId: sub.ventureId,
          ownerId: sub.ownerId,
          notes: sub.notes,
        }}
      />
    </div>
  );
}
