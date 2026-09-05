"use client";

import Link from "next/link";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { addDays, format } from "date-fns";

import { setTaskDone, setTaskFields } from "@/app/(app)/tasks/actions";
import { dueLabel, isOverdue, money, toDateInput } from "@/lib/format";
import { showToast } from "@/components/Toast";
import { Avatar } from "@/components/Avatar";
import { VentureChip } from "@/components/VentureChip";

type Venture = { id: string; name: string };
type Member = { id: string; name: string | null; email: string | null };

export type TaskRowData = {
  id: string;
  title: string;
  status: "OPEN" | "DONE";
  priority: "LOW" | "MED" | "HIGH";
  dueDate: Date | string | null;
  amountCents: number | null;
  ventureId: string | null;
  assignedToId: string | null;
  venture: { name: string; color: string | null } | null;
  assignedTo: { name: string | null; email: string | null } | null;
};

const SWIPE_THRESHOLD = 72;

export function TaskRow({
  task,
  ventures,
  members,
}: {
  task: TaskRowData;
  ventures?: Venture[];
  members?: Member[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editing, setEditing] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false });

  const done = task.status === "DONE";
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const overdue = !done && isOverdue(due);
  const canEdit = Boolean(ventures && members);

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  function toggle() {
    act(() => setTaskDone(task.id, !done));
  }

  function completeBySwipe() {
    act(() => setTaskDone(task.id, true));
    showToast({
      message: "Marked done",
      onAction: () => act(() => setTaskDone(task.id, false)),
    });
  }

  function snoozeBySwipe() {
    const prev = due ? toDateInput(due) : null;
    const tomorrow = format(addDays(new Date(), 1), "yyyy-MM-dd");
    act(() => setTaskFields({ id: task.id, dueDate: tomorrow }));
    showToast({
      message: "Snoozed to tomorrow",
      onAction: () => act(() => setTaskFields({ id: task.id, dueDate: prev })),
    });
  }

  // --- touch swipe ---------------------------------------------------------
  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    drag.current = { x: t.clientX, y: t.clientY, active: false };
  }
  function onTouchMove(e: React.TouchEvent) {
    const t = e.touches[0];
    const mx = t.clientX - drag.current.x;
    const my = t.clientY - drag.current.y;
    if (!drag.current.active && Math.abs(mx) > 12 && Math.abs(mx) > Math.abs(my) * 1.5) {
      drag.current.active = true;
    }
    if (drag.current.active) setDx(Math.max(-120, Math.min(120, mx)));
  }
  function onTouchEnd() {
    if (drag.current.active) {
      if (dx >= SWIPE_THRESHOLD) completeBySwipe();
      else if (dx <= -SWIPE_THRESHOLD) snoozeBySwipe();
    }
    drag.current.active = false;
    setDx(0);
  }

  return (
    <div className="relative overflow-hidden" style={{ touchAction: "pan-y" }}>
      {/* swipe backdrops */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-between px-4 text-xs font-bold uppercase tracking-wide"
        aria-hidden
      >
        <span style={{ color: "var(--color-ok)", opacity: dx > 12 ? 1 : 0 }}>✓ Done</span>
        <span style={{ color: "#b45309", opacity: dx < -12 ? 1 : 0 }}>Tomorrow ⏰</span>
      </div>

      <div
        className="relative bg-[var(--color-surface)]"
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform .18s" : "none" }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
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

            <button
              type="button"
              onClick={() => canEdit && setEditing((v) => !v)}
              className="mt-1 flex flex-wrap items-center gap-1.5 text-left"
              style={{ cursor: canEdit ? "pointer" : "default" }}
            >
              {task.venture ? (
                <VentureChip name={task.venture.name} color={task.venture.color} />
              ) : canEdit ? (
                <span className="chip text-[var(--color-text-dim)]">+ venture</span>
              ) : null}
              {due ? (
                <span
                  className="text-[0.72rem] font-semibold"
                  style={{ color: overdue ? "var(--color-danger)" : "var(--color-text-dim)" }}
                >
                  {dueLabel(due)}
                </span>
              ) : canEdit ? (
                <span className="text-[0.72rem] font-semibold text-[var(--color-text-dim)]">
                  + date
                </span>
              ) : null}
              {task.amountCents != null && (
                <span className="chip tabular-nums font-semibold text-[var(--color-text-dim)]">
                  {money(task.amountCents)}
                </span>
              )}
              {task.assignedTo && (
                <Avatar name={task.assignedTo.name} email={task.assignedTo.email} size={18} />
              )}
            </button>
          </div>
        </div>

        {editing && canEdit && (
          <div className="grid grid-cols-2 gap-2 border-t border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
            <label className="text-[0.68rem] font-semibold text-[var(--color-text-dim)]">
              Due
              <input
                type="date"
                defaultValue={due ? toDateInput(due) : ""}
                onChange={(e) =>
                  act(() => setTaskFields({ id: task.id, dueDate: e.target.value || null }))
                }
                className="field mt-1"
              />
            </label>
            <label className="text-[0.68rem] font-semibold text-[var(--color-text-dim)]">
              Priority
              <select
                defaultValue={task.priority}
                onChange={(e) =>
                  act(() =>
                    setTaskFields({
                      id: task.id,
                      priority: e.target.value as "LOW" | "MED" | "HIGH",
                    }),
                  )
                }
                className="field mt-1"
              >
                <option value="LOW">Low</option>
                <option value="MED">Medium</option>
                <option value="HIGH">High</option>
              </select>
            </label>
            <label className="text-[0.68rem] font-semibold text-[var(--color-text-dim)]">
              Venture
              <select
                defaultValue={task.ventureId ?? ""}
                onChange={(e) =>
                  act(() => setTaskFields({ id: task.id, ventureId: e.target.value || null }))
                }
                className="field mt-1"
              >
                <option value="">—</option>
                {ventures!.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-[0.68rem] font-semibold text-[var(--color-text-dim)]">
              Assignee
              <select
                defaultValue={task.assignedToId ?? ""}
                onChange={(e) =>
                  act(() => setTaskFields({ id: task.id, assignedToId: e.target.value || null }))
                }
                className="field mt-1"
              >
                <option value="">Shared</option>
                {members!.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="col-span-2 text-[0.68rem] font-semibold text-[var(--color-primary)]"
            >
              Done editing
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
