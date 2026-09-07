"use client";

import Link from "next/link";
import { useOptimistic, useRef, useState, useTransition } from "react";
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

  /**
   * Ticking a checkbox used to wait for `setTaskDone` *and* a full
   * `router.refresh()` before the tick appeared — a server round trip for a
   * result the client already knows. On a phone that's the single most
   * repeated interaction in the app, and the delay read as the app being
   * stuck. The optimistic value paints immediately and React reverts it on
   * its own if the action throws.
   */
  const [done, setDoneOptimistic] = useOptimistic(task.status === "DONE");
  const due = task.dueDate ? new Date(task.dueDate) : null;
  const overdue = !done && isOverdue(due);
  const canEdit = Boolean(ventures && members);

  function act(fn: () => Promise<unknown>) {
    startTransition(async () => {
      await fn();
      router.refresh();
    });
  }

  /** `next` is absolute, not a toggle, so a double-tap can't land inverted. */
  function setDone(next: boolean) {
    startTransition(async () => {
      setDoneOptimistic(next);
      await setTaskDone(task.id, next);
      router.refresh();
    });
  }

  function toggle() {
    setDone(!done);
  }

  function completeBySwipe() {
    setDone(true);
    showToast({
      message: "Marked done",
      onAction: () => setDone(false),
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
        style={{
          transform: `translateX(${dx}px)`,
          // Mid-swipe the row must track the finger exactly, so transform gets
          // no transition at all; opacity keeps one either way, because a
          // completed row settling is a separate thing from the drag.
          transition:
            dx === 0
              ? "transform var(--base) var(--ease), opacity var(--base) var(--ease)"
              : "opacity var(--base) var(--ease)",
          // A done row recedes rather than vanishing — you can still see what
          // you just finished. The heavier fade is the not-yet-saved state of
          // the inline editor below, which isn't optimistic.
          opacity: pending && editing ? 0.6 : done ? 0.62 : 1,
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        <div className="flex items-start gap-3 px-3 py-2.5">
          <button
            type="button"
            onClick={toggle}
            // Deliberately not disabled while pending: the optimistic tick is
            // already showing, so disabling would only block the undo tap.
            aria-label={done ? "Mark not done" : "Mark done"}
            aria-pressed={done}
            data-done={done ? "" : undefined}
            className="tick mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border"
          >
            {/* Drawn rather than typed. A "✓" character appears all at once;
                a stroked path can be dashed, so the check writes itself in the
                same beat the circle fills. Bottom rung of the ladder — 220ms,
                no sound, nothing to dismiss. */}
            <svg viewBox="0 0 16 16" aria-hidden="true" className="h-3 w-3">
              <path d="M3 8.4 6.4 11.8 13 5.2" />
            </svg>
          </button>

          <div className="min-w-0 flex-1">
            <Link
              href={`/tasks/${task.id}`}
              className="task-title block max-w-full truncate text-[0.95rem]"
              data-done={done ? "" : undefined}
              style={{ color: done ? "var(--color-text-dim)" : "var(--color-text)" }}
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
