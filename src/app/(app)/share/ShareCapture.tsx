"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTask } from "@/app/(app)/tasks/actions";
import {
  parseQuickAdd,
  commitDrafts,
  type Draft,
} from "@/app/(app)/quick-actions";
import { DraftCard } from "@/components/DraftCard";

export function ShareCapture({
  initialText,
  ventures,
  aiEnabled,
}: {
  initialText: string;
  ventures: { id: string; name: string }[];
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const [text, setText] = useState(initialText);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const parsedOnce = useRef(false);

  // Auto-parse the shared content once on arrival.
  useEffect(() => {
    if (parsedOnce.current || !aiEnabled || !initialText.trim()) return;
    parsedOnce.current = true;
    start(async () => {
      const r = await parseQuickAdd(initialText);
      if (r.ok) setDrafts(r.drafts);
      else setMsg(r.error);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aiEnabled, initialText]);

  function parse() {
    setMsg(null);
    start(async () => {
      const r = await parseQuickAdd(text);
      if (r.ok) setDrafts(r.drafts);
      else setMsg(r.error);
    });
  }

  function saveDrafts() {
    if (!drafts?.length) return;
    start(async () => {
      const r = await commitDrafts(drafts);
      if (r.ok) router.replace("/today");
      else setMsg(r.error ?? "Could not save");
    });
  }

  function saveAsTask() {
    const fd = new FormData();
    fd.set("title", text.trim().slice(0, 200) || "Shared note");
    fd.set("priority", "MED");
    fd.set("isRecurring", "false");
    start(async () => {
      await createTask(fd);
      router.replace("/today");
    });
  }

  return (
    <div className="space-y-3">
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="field"
        aria-label="Shared content"
      />

      {!drafts && (
        <div className="flex gap-2">
          {aiEnabled && (
            <button onClick={parse} disabled={pending} className="btn btn-primary flex-1">
              {pending ? "Reading…" : "Parse"}
            </button>
          )}
          <button onClick={saveAsTask} disabled={pending} className="btn flex-1">
            Save as task
          </button>
        </div>
      )}

      {drafts && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--color-text-dim)]">
            Review before saving:
          </p>
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              draft={d}
              ventures={ventures}
              onChange={(patch) =>
                setDrafts((cur) => cur?.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) ?? null)
              }
              onRemove={() =>
                setDrafts((cur) => {
                  const next = cur?.filter((_, idx) => idx !== i) ?? [];
                  return next.length ? next : null;
                })
              }
            />
          ))}
          <div className="flex gap-2">
            <button onClick={saveDrafts} disabled={pending} className="btn btn-primary flex-1">
              {pending ? "Saving…" : `Save ${drafts.length}`}
            </button>
            <button onClick={() => setDrafts(null)} disabled={pending} className="btn">
              Back
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-xs text-[var(--color-text-dim)]">{msg}</p>}
    </div>
  );
}
