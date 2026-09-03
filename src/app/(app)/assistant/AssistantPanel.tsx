"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { parseAndAdd, weeklyBriefing } from "./actions";

export function AssistantPanel() {
  const router = useRouter();
  const [text, setText] = useState("");
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [briefing, setBriefing] = useState<string | null>(null);
  const [addPending, startAdd] = useTransition();
  const [briefPending, startBrief] = useTransition();

  function add() {
    if (!text.trim()) return;
    setResult(null);
    startAdd(async () => {
      const r = await parseAndAdd(text);
      setResult(r);
      if (r.ok) {
        setText("");
        router.refresh();
      }
    });
  }

  function brief() {
    setBriefing(null);
    startBrief(async () => {
      const r = await weeklyBriefing();
      setBriefing(r.text);
    });
  }

  return (
    <div className="space-y-4">
      <div className="card p-4">
        <p className="text-sm font-semibold">Add in plain language</p>
        <p className="mt-1 text-xs text-[var(--color-text-dim)]">
          e.g. “Order gloves for CMAC Beauty by Friday, high priority. Call the
          accountant Tuesday 10am. Chantelle: post the reel tomorrow.”
        </p>
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={4}
          className="field mt-2"
          placeholder="Type notes, get tasks and events…"
        />
        <button onClick={add} disabled={addPending} className="btn btn-primary mt-2 w-full">
          {addPending ? "Reading…" : "Add"}
        </button>
        {result && (
          <p
            className="mt-2 text-xs"
            style={{ color: result.ok ? "var(--color-ok)" : "var(--color-danger)" }}
          >
            {result.message}
          </p>
        )}
      </div>

      <div className="card p-4">
        <p className="text-sm font-semibold">Weekly briefing</p>
        <p className="mt-1 text-xs text-[var(--color-text-dim)]">
          A short read on what’s coming up, from your tasks, deadlines, events and budget.
        </p>
        <button onClick={brief} disabled={briefPending} className="btn mt-2 w-full">
          {briefPending ? "Writing…" : "Generate briefing"}
        </button>
        {briefing && (
          <p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{briefing}</p>
        )}
      </div>
    </div>
  );
}
