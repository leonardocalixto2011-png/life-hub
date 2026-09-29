import { notFound } from "next/navigation";

import { getSubscription, hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { money, toDateInput } from "@/lib/format";
import { centsToInput } from "@/lib/money";
import { PageHeader } from "@/components/SectionHeader";
import { SubscriptionForm } from "../SubscriptionForm";

export const dynamic = "force-dynamic";

const CYCLE: Record<string, string> = {
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  QUARTERLY: "Quarterly",
  YEARLY: "Yearly",
  CUSTOM: "Custom",
};

export default async function SubscriptionDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, hub } = await requireHub();
  const t = await getT();
  const { id } = await params;
  const [sub, { ventures, members }] = await Promise.all([
    withHub(user.id, (tx) => getSubscription(tx, hub.id, id)),
    hubChrome(user.id, hub.id),
  ]);
  if (!sub) notFound();

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/subscriptions", label: t("Subscriptions") }}
        title={sub.name}
        sub={`${money(sub.costCents, hub.currency, user.locale ?? undefined)} · ${t(CYCLE[sub.billingCycle] ?? "Monthly")}`}
      />
      <SubscriptionForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
        existing={{
          id: sub.id,
          name: sub.name,
          cost: centsToInput(sub.costCents),
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
