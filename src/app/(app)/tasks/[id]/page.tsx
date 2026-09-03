import Link from "next/link";
import { notFound } from "next/navigation";

import { getTask, listMembers, listVentures } from "@/lib/data";
import { requireUser } from "@/lib/session";
import { toDateInput } from "@/lib/format";
import { TaskEditForm } from "./TaskEditForm";

export const dynamic = "force-dynamic";

export default async function TaskDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUser();
  const { id } = await params;
  const [task, ventures, members] = await Promise.all([
    getTask(id),
    listVentures(),
    listMembers(),
  ]);

  if (!task) notFound();

  return (
    <div className="space-y-3 p-3">
      <Link href="/tasks" className="text-xs font-semibold text-[var(--color-text-dim)]">
        ← Tasks
      </Link>
      <TaskEditForm
        task={{
          id: task.id,
          title: task.title,
          notes: task.notes,
          ventureId: task.ventureId,
          assignedToId: task.assignedToId,
          dueDate: toDateInput(task.dueDate),
          priority: task.priority,
          isRecurring: task.isRecurring,
          recurrence: (task.recurrence as "weekly" | "monthly" | null) ?? null,
        }}
        ventures={ventures.map((v) => ({ id: v.id, name: v.name }))}
        members={members}
      />
      <p className="px-1 text-[0.7rem] text-[var(--color-text-dim)]">
        Added by {task.createdBy.name ?? task.createdBy.email}
      </p>
    </div>
  );
}
