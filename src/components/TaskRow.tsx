"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { toggleTask } from "@/app/(app)/tasks/actions";
import { dueLabel, isOverdue } from "@/lib/format";
import { Avatar } from "@/components/Avatar";
import { VentureChip } from "@/components/VentureChip";

export type TaskRowData = {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  priority: "LOW" | "MED" | "HIGH";
  dueDate: Date | string | null;
  venture: { name: string; color: string | null } | null;
  assignedTo: { name: string | null; email: string | null } | null;
};

export function TaskRow({ task }: { task: TaskRowData }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const done = task.status === "DONE";
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const overdue = !done && isOverdue(due);

  function toggle() {
    const fd = new FormData();
    fd.set("id", task.id);
    fd.set("done", String(!done));
    startTransition(async () => {
      await toggleTask(fd);
      router.refresh();
    });
  }

  return (
    <div className="flex items-start gap-3 px-3 py-2.5">
      <button
        type="button"
        onClick={toggle}
        disabled={pending}
        aria-label={done ? "Mark not done" : "Mark done"}
        className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border"
        style={{
          borderColor: done ? "var(--color-ok)" : "var(--color-border)",
          background: done ? "var(--color-ok)" : "transparent",
          color: "#fff",
        }}
      >
        {done ? "✓" : ""}
      </button>

      <div className="min-w-0 flex-1">
        <Link
          href={`/tasks/${task.id}`}
          className="block truncate text-[0.95rem]"
          style={{
            textDecoration: done ? "line-through" : "none",
            color: done ? "var(--color-text-dim)" : "var(--color-text)",
          }}
        >
          {task.priority === "HIGH" && !done && (
            <span className="mr-1 text-[var(--color-danger)]">!</span>
          )}
          {task.title}
        </Link>

        {(task.venture || task.assignedTo || due) && (
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {task.venture && (
              <VentureChip name={task.venture.name} color={task.venture.color} />
            )}
            {due && (
              <span
                className="text-[0.72rem] font-semibold"
                style={{ color: overdue ? "var(--color-danger)" : "var(--color-text-dim)" }}
              >
                {dueLabel(due)}
              </span>
            )}
            {task.assignedTo && (
              <Avatar name={task.assignedTo.name} email={task.assignedTo.email} size={18} />
            )}
          </div>
        )}
      </div>
    </div>
  );
}
