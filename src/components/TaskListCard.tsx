import { TaskRow, type TaskRowData } from "@/components/TaskRow";
import type { TaskWithRefs } from "@/lib/data";

type Venture = { id: string; name: string };
type Member = { id: string; name: string | null; email: string | null };

export function toRowData(t: TaskWithRefs): TaskRowData {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    ventureId: t.ventureId,
    assignedToId: t.assignedToId,
    venture: t.venture ? { name: t.venture.name, color: t.venture.color } : null,
    assignedTo: t.assignedTo
      ? { name: t.assignedTo.name, email: t.assignedTo.email }
      : null,
  };
}

export function TaskListCard({
  tasks,
  ventures,
  members,
  empty = "Nothing here.",
}: {
  tasks: TaskWithRefs[];
  ventures?: Venture[];
  members?: Member[];
  empty?: React.ReactNode;
}) {
  if (tasks.length === 0) {
    return typeof empty === "string" ? (
      <p className="px-1 py-8 text-center text-sm text-[var(--color-text-dim)]">
        {empty}
      </p>
    ) : (
      <>{empty}</>
    );
  }
  return (
    <div className="card divide-y divide-[var(--color-border)]">
      {tasks.map((t) => (
        <TaskRow key={t.id} task={toRowData(t)} ventures={ventures} members={members} />
      ))}
    </div>
  );
}
