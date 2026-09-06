import Link from "next/link";
import { notFound } from "next/navigation";

import { getDeadline, hubChrome } from "@/lib/data";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { toDateInput } from "@/lib/format";
import { DeadlineForm } from "../DeadlineForm";

export const dynamic = "force-dynamic";

export default async function DeadlineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user, hub } = await requireHub();
  const { id } = await params;
  const [deadline, { ventures }] = await Promise.all([
    withHub(user.id, (tx) => getDeadline(tx, hub.id, user.id, id)),
    hubChrome(user.id, hub.id),
  ]);
  if (!deadline) notFound();

  return (
    <div className="space-y-3 p-3">
      <Link href="/deadlines" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← Deadlines
      </Link>
      <DeadlineForm
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        existing={{
          id: deadline.id,
          title: deadline.title,
          notes: deadline.notes,
          dueDate: toDateInput(deadline.dueDate),
          ventureId: deadline.ventureId,
          remindDaysBefore: deadline.remindDaysBefore,
          visibility: deadline.visibility,
        }}
      />
    </div>
  );
}
