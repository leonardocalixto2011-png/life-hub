"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTask } from "@/app/(app)/tasks/actions";

type Option = { id: string; name: string | null; email?: string | null };

export function QuickAdd({
  ventures,
  members,
  defaultAssigneeId,
}: {
  ventures: { id: string; name: string }[];
  members: Option[];
  defaultAssigneeId?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    if (!String(fd.get("title") ?? "").trim()) return;
    setError(null);
    startTransition(async () => {
      try {
        await createTask(fd);
        formRef.current?.reset();
        setOpen(false);
        router.refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Could not add task");
      }
    });
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3"
    >
      <div className="flex gap-2">
        <input
          name="title"
          placeholder="Add a task…"
          autoComplete="off"
          className="field"
          aria-label="Task title"
        />
        <button type="submit" className="btn btn-primary" disabled={pending}>
          {pending ? "…" : "Add"}
        </button>
      </div>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="mt-2 text-xs font-semibold text-[var(--color-text-dim)]"
      >
        {open ? "Hide details" : "+ Details"}
      </button>

      {open && (
        <div className="mt-2 grid grid-cols-2 gap-2">
          <label className="text-xs font-semibold text-[var(--color-text-dim)]">
            Due
            <input type="date" name="dueDate" className="field mt-1" />
          </label>
          <label className="text-xs font-semibold text-[var(--color-text-dim)]">
            Priority
            <select name="priority" defaultValue="MED" className="field mt-1">
              <option value="LOW">Low</option>
              <option value="MED">Medium</option>
              <option value="HIGH">High</option>
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--color-text-dim)]">
            Venture
            <select name="ventureId" defaultValue="" className="field mt-1">
              <option value="">—</option>
              {ventures.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
          <label className="text-xs font-semibold text-[var(--color-text-dim)]">
            Assignee
            <select
              name="assignedToId"
              defaultValue={defaultAssigneeId ?? ""}
              className="field mt-1"
            >
              <option value="">Shared / unassigned</option>
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name ?? m.email}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}

      {error && <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>}
    </form>
  );
}
