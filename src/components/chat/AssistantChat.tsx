"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Sparkles, X, AlertTriangle } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { confirmAssistantAction } from "@/app/(app)/chats/actions";
import { Composer } from "./Composer";
import type { WireMessage } from "./types";

type Step = { label: string; ok: boolean };
type Pending = { id: string; summary: string; status: "waiting" | "done" | "cancelled" | "failed" };
type Meta = { steps?: Step[]; pending?: Pending[]; system?: boolean } | null;

type Turn = {
  key: string;
  messageId: string | null;
  role: "user" | "assistant" | "note";
  text: string;
  steps: Step[];
  pending: Pending[];
};

function fromWire(m: WireMessage): Turn {
  const meta = (m.meta ?? null) as Meta;
  return {
    key: m.id,
    messageId: m.id,
    role: meta?.system ? "note" : m.role === "ASSISTANT" ? "assistant" : "user",
    text: m.body,
    steps: meta?.steps ?? [],
    pending: meta?.pending ?? [],
  };
}

const SUGGESTIONS = [
  "What's on this week?",
  "Add milk and eggs to the shopping list",
  "Remind me to pay Hydro on the 20th",
  "How much did we spend on groceries this month?",
];

/**
 * The assistant chat. Each turn streams from /api/assistant as NDJSON: text
 * as it's written, a line per action as it happens, a card for anything that
 * needs a tap to confirm.
 */
export function AssistantChat({
  conversationId: initialId,
  initial,
  enabled,
  balanceMillicents,
}: {
  conversationId: string | null;
  initial: WireMessage[];
  enabled: boolean;
  balanceMillicents: number;
  currency: string;
}) {
  const t = useT();
  const router = useRouter();
  const [turns, setTurns] = useState<Turn[]>(initial.filter((m) => m.body || (m.meta as Meta)?.steps?.length || (m.meta as Meta)?.pending?.length).map(fromWire));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [convId, setConvId] = useState(initialId);
  const [, startConfirm] = useTransition();
  const bottom = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [turns]);

  async function send(text: string) {
    setError(null);
    setNotice(null);
    setBusy(true);
    const live: Turn = { key: `live-${Date.now()}`, messageId: null, role: "assistant", text: "", steps: [], pending: [] };
    setTurns((cur) => [...cur, { key: `u-${Date.now()}`, messageId: null, role: "user", text, steps: [], pending: [] }, live]);

    const patch = (fn: (x: Turn) => Turn) =>
      setTurns((cur) => cur.map((x) => (x.key === live.key ? fn(x) : x)));

    let changed = false;
    try {
      const res = await fetch("/api/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: convId, text }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => null);
        throw new Error(j?.error ?? t("The assistant is temporarily unavailable."));
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl);
          buf = buf.slice(nl + 1);
          if (!line.trim()) continue;
          const e = JSON.parse(line);
          if (e.type === "conversation" && e.id !== convId) {
            setConvId(e.id);
            window.history.replaceState(null, "", `/chats/${e.id}`);
          } else if (e.type === "text") patch((x) => ({ ...x, text: x.text + e.delta }));
          else if (e.type === "message") patch((x) => ({ ...x, messageId: e.id, text: x.text && !x.text.endsWith("\n\n") ? x.text + "\n\n" : x.text }));
          else if (e.type === "step") {
            changed = true;
            patch((x) => ({ ...x, steps: [...x.steps, { label: e.label, ok: e.ok }] }));
          } else if (e.type === "pending") patch((x) => ({ ...x, pending: [...x.pending, e.pending] }));
          else if (e.type === "notice") setNotice(e.text);
          else if (e.type === "error") setError(e.text);
        }
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t("The assistant is temporarily unavailable."));
    } finally {
      patch((x) => ({ ...x, text: x.text.trim() }));
      setTurns((cur) => cur.filter((x) => x.key !== live.key || x.text || x.steps.length || x.pending.length));
      setBusy(false);
      // Pages the assistant changed (Today, Tasks…) re-read on next visit.
      if (changed) router.refresh();
    }
  }

  function decide(turn: Turn, p: Pending, approve: boolean) {
    if (!turn.messageId) return;
    startConfirm(async () => {
      const r = await confirmAssistantAction(turn.messageId!, p.id, approve);
      const status: Pending["status"] = !approve ? "cancelled" : r.ok ? "done" : "failed";
      setTurns((cur) =>
        cur.map((x) =>
          x.key === turn.key ? { ...x, pending: x.pending.map((y) => (y.id === p.id ? { ...y, status } : y)) } : x,
        ),
      );
      if (!r.ok && r.error) setError(r.error);
      router.refresh();
    });
  }

  if (!enabled) {
    return (
      <div className="card p-4 text-sm">
        <p className="font-semibold">{t("Not set up yet")}</p>
        <p className="mt-1 text-[var(--color-text-dim)]">
          {t("The assistant needs {key} on the server.", { key: "ANTHROPIC_API_KEY" })}
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col">
      <ol className="flex flex-col gap-3" aria-live="polite">
        {turns.length === 0 && (
          <li className="py-4">
            <div className="flex flex-col items-center gap-2 text-center">
              <span className="icon-tile" aria-hidden>
                <Sparkles size={22} />
              </span>
              <p className="display text-lg">{t("What can I take care of?")}</p>
              <p className="text-sm text-[var(--color-text-dim)]">
                {t("Tasks, calendar, budget, trips, subscriptions, messages — just ask.")}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button key={s} type="button" className="chip" onClick={() => send(t(s))} disabled={busy}>
                  {t(s)}
                </button>
              ))}
            </div>
          </li>
        )}
        {turns.map((turn) =>
          turn.role === "note" ? (
            <li key={turn.key} className="text-center text-xs text-[var(--color-text-dim)]">
              {turn.text}
            </li>
          ) : turn.role === "user" ? (
            <li key={turn.key} className="flex justify-end">
              <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl bg-[var(--color-primary)] px-3 py-2 text-[15px] text-[var(--color-primary-fg)]">
                {turn.text}
              </div>
            </li>
          ) : (
            <li key={turn.key} className="flex flex-col items-start gap-1.5">
              {turn.steps.length > 0 && (
                <ul className="flex flex-wrap gap-1.5">
                  {turn.steps.map((s, i) => (
                    <li
                      key={i}
                      className="inline-flex items-center gap-1 rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-xs text-[var(--color-text-dim)]"
                    >
                      {s.ok ? <Check size={12} aria-hidden /> : <AlertTriangle size={12} aria-hidden />}
                      {t(s.label)}
                    </li>
                  ))}
                </ul>
              )}
              {turn.text ? (
                <div className="max-w-[88%] whitespace-pre-wrap break-words rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-[15px] leading-relaxed">
                  {turn.text}
                </div>
              ) : (
                busy &&
                turn.key.startsWith("live-") && (
                  <div className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm text-[var(--color-text-dim)]">
                    <span className="animate-pulse">{t("On it…")}</span>
                  </div>
                )
              )}
              {turn.pending.map((p) => (
                <div key={p.id} className="card w-full max-w-[88%] p-3 text-sm">
                  <p className="font-medium">{p.summary}</p>
                  {p.status === "waiting" ? (
                    <div className="mt-2 flex gap-2">
                      <button type="button" className="btn btn-primary btn-sm" onClick={() => decide(turn, p, true)} disabled={!turn.messageId || busy}>
                        <Check size={16} aria-hidden /> {t("Confirm")}
                      </button>
                      <button type="button" className="btn btn-ghost btn-sm" onClick={() => decide(turn, p, false)} disabled={!turn.messageId || busy}>
                        <X size={16} aria-hidden /> {t("Cancel")}
                      </button>
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-[var(--color-text-dim)]">
                      {p.status === "done" ? `✓ ${t("Done")}` : p.status === "failed" ? `⚠ ${t("Didn't work")}` : t("Cancelled")}
                    </p>
                  )}
                </div>
              ))}
            </li>
          ),
        )}
      </ol>
      <div ref={bottom} />
      {notice && <p className="mt-2 text-sm text-[var(--color-text-dim)]">{notice}</p>}
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
          {error}{" "}
          {balanceMillicents <= 0 && (
            <Link href="/credits" className="underline">
              {t("Claude credit")}
            </Link>
          )}
        </p>
      )}
      <Composer onSend={send} disabled={busy} placeholder={t("Ask or tell your assistant…")} />
    </div>
  );
}
