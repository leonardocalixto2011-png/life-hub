"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTask } from "@/app/(app)/tasks/actions";
import {
  parseQuickAdd,
  commitDrafts,
  type Draft,
} from "@/app/(app)/quick-actions";
import { DraftCard } from "@/components/DraftCard";

type Option = { id: string; name: string | null; email?: string | null };

/** Heuristic: does this look like a sentence worth parsing, vs. a bare title? */
function worthParsing(text: string): boolean {
  const t = text.trim();
  if (t.length < 6) return false;
  return (
    /\d/.test(t) || // a number (date/amount)
    /\$|€|\bby\b|\bon\b|\bevery\b|\brenew|\bdue\b|\bpay\b|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week/i.test(
      t,
    ) ||
    t.split(/\s+/).length >= 5
  );
}

export function QuickAdd({
  ventures,
  members,
  defaultAssigneeId,
  aiEnabled,
}: {
  ventures: { id: string; name: string }[];
  members: Option[];
  defaultAssigneeId?: string;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [pending, startTransition] = useTransition();

  function reset() {
    formRef.current?.reset();
    setDrafts(null);
    setOpen(false);
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    if (!title) return;
    setMsg(null);

    const detailsOpen = open;
    if (aiEnabled && !detailsOpen && worthParsing(title)) {
      startTransition(async () => {
        const r = await parseQuickAdd(title);
        if (r.ok) {
          setDrafts(r.drafts);
        } else {
          setMsg(`${r.error} — added as a plain task.`);
          await createTask(fd);
          reset();
          router.refresh();
        }
      });
      return;
    }

    startTransition(async () => {
      try {
        await createTask(fd);
        reset();
        router.refresh();
      } catch (err) {
        setMsg(err instanceof Error ? err.message : "Could not add");
      }
    });
  }

  function patchDraft(i: number, patch: Partial<Draft>) {
    setDrafts((cur) => cur?.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) ?? null);
  }

  function removeDraft(i: number) {
    setDrafts((cur) => {
      const next = cur?.filter((_, idx) => idx !== i) ?? [];
      return next.length ? next : null;
    });
  }

  function saveDrafts() {
    if (!drafts?.length) return;
    startTransition(async () => {
      const r = await commitDrafts(drafts);
      if (r.ok) {
        setMsg(`Added ${r.created.length}: ${r.created.join(" · ")}`);
        reset();
        router.refresh();
      } else {
        setMsg(r.error ?? "Could not save");
      }
    });
  }

  return (
    <div className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <form ref={formRef} onSubmit={onSubmit}>
        <div className="flex gap-2">
          <input
            name="title"
            placeholder={aiEnabled ? "Add anything — plain sentences work" : "Add a task…"}
            autoComplete="off"
            className="field"
            aria-label="Quick add"
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
      </form>

      {drafts && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--color-text-dim)]">
            Review before saving — edit anything:
          </p>
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              draft={d}
              ventures={ventures}
              onChange={(patch) => patchDraft(i, patch)}
              onRemove={() => removeDraft(i)}
            />
          ))}
          <div className="flex gap-2">
            <button onClick={saveDrafts} disabled={pending} className="btn btn-primary flex-1">
              {pending ? "Saving…" : `Save ${drafts.length}`}
            </button>
            <button onClick={reset} disabled={pending} className="btn">
              Cancel
            </button>
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-xs text-[var(--color-text-dim)]">{msg}</p>}
    </div>
  );
}
