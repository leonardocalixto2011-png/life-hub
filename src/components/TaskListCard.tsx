import { TaskRow, type TaskRowData } from "@/components/TaskRow";
import type { TaskWithRefs } from "@/lib/data";

export function toRowData(t: TaskWithRefs): TaskRowData {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    priority: t.priority,
    dueDate: t.dueDate,
    venture: t.venture ? { name: t.venture.name, color: t.venture.color } : null,
    assignedTo: t.assignedTo
      ? { name: t.assignedTo.name, email: t.assignedTo.email }
      : null,
  };
}

export function TaskListCard({
  tasks,
  empty = "Nothing here.",
}: {
  tasks: TaskWithRefs[];
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
        <TaskRow key={t.id} task={toRowData(t)} />
      ))}
    </div>
  );
}
