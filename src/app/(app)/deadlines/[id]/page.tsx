import Link from "next/link";
import { notFound } from "next/navigation";

import { getDeadline, listVentures } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { toDateInput } from "@/lib/format";
import { DeadlineForm } from "../DeadlineForm";

export const dynamic = "force-dynamic";

export default async function DeadlineDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [deadline, ventures] = await Promise.all([getDeadline(id), listVentures()]);
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
        }}
      />
    </div>
  );
}
