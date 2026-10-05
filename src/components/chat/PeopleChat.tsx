"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Trash2 } from "lucide-react";

import { useLang, useT } from "@/components/I18nProvider";
import { Avatar } from "@/components/Avatar";
import { deleteChatMessage, pollMessages, sendChatMessage } from "@/app/(app)/chats/actions";
import { Composer } from "./Composer";
import type { WireMessage } from "./types";

/**
 * A chat between people. No sockets on this hosting: the open chat asks for
 * anything new every few seconds while it's on screen, and a push notification
 * covers the rest of the time.
 */
export function PeopleChat({
  conversationId,
  meId,
  initial,
  showNames,
}: {
  conversationId: string;
  meId: string;
  initial: WireMessage[];
  showNames: boolean;
}) {
  const t = useT();
  const lang = useLang();
  const [messages, setMessages] = useState<WireMessage[]>(initial);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const bottom = useRef<HTMLDivElement>(null);
  const lastAt = useRef<string | null>(initial.at(-1)?.createdAt ?? null);

  const merge = useCallback((incoming: WireMessage[]) => {
    if (!incoming.length) return;
    setMessages((cur) => {
      const ids = new Set(cur.map((m) => m.id));
      const next = [...cur.filter((m) => !m.id.startsWith("local-")), ...incoming.filter((m) => !ids.has(m.id))];
      return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    });
    lastAt.current = incoming.at(-1)!.createdAt;
  }, []);

  const poll = useCallback(async () => {
    try {
      merge(await pollMessages(conversationId, lastAt.current));
    } catch {
      /* offline for a moment; the next tick tries again */
    }
  }, [conversationId, merge]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (document.visibilityState === "visible") poll();
    }, 4000);
    const onVis = () => document.visibilityState === "visible" && poll();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [poll]);

  useEffect(() => {
    bottom.current?.scrollIntoView({ block: "end" });
  }, [messages.length]);

  async function send(text: string) {
    setError(null);
    setSending(true);
    const local: WireMessage = {
      id: `local-${Date.now()}`,
      authorId: meId,
      authorName: null,
      authorAvatar: null,
      role: "USER",
      body: text,
      meta: null,
      createdAt: new Date().toISOString(),
    };
    setMessages((m) => [...m, local]);
    const r = await sendChatMessage(conversationId, text);
    setSending(false);
    if (!r.ok) {
      setMessages((m) => m.filter((x) => x.id !== local.id));
      setError(t(r.error ?? "Could not send"));
      return;
    }
    await poll();
  }

  async function remove(id: string) {
    if (!confirm(t("Delete this message?"))) return;
    await deleteChatMessage(id);
    setMessages((m) => m.filter((x) => x.id !== id));
  }

  const time = (iso: string) =>
    new Date(iso).toLocaleTimeString(lang === "fr" ? "fr-CA" : "en-CA", { hour: "numeric", minute: "2-digit" });

  return (
    <div className="flex flex-1 flex-col">
      <ol className="flex flex-col gap-2" aria-live="polite">
        {messages.length === 0 && (
          <li className="py-8 text-center text-sm text-[var(--color-text-dim)]">{t("Say hi 👋")}</li>
        )}
        {messages.map((m, i) => {
          const mine = m.authorId === meId;
          const prev = messages[i - 1];
          const firstOfRun = !prev || prev.authorId !== m.authorId;
          return (
            <li key={m.id} className={`group flex items-end gap-2 ${mine ? "flex-row-reverse" : ""}`}>
              {!mine && (
                <span className="w-7 shrink-0">
                  {firstOfRun && <Avatar name={m.authorName} email={null} src={m.authorAvatar} size={28} />}
                </span>
              )}
              <div className={`max-w-[78%] ${mine ? "items-end" : "items-start"} flex flex-col`}>
                {showNames && !mine && firstOfRun && (
                  <span className="mb-0.5 px-1 text-xs text-[var(--color-text-dim)]">{m.authorName ?? t("Member")}</span>
                )}
                <div
                  className={`whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-[15px] leading-snug ${
                    mine
                      ? "bg-[var(--color-primary)] text-[var(--color-primary-fg)]"
                      : "bg-[var(--color-surface)] border border-[var(--color-border)]"
                  } ${m.id.startsWith("local-") ? "opacity-70" : ""}`}
                >
                  {m.body}
                </div>
                <span className="mt-0.5 flex items-center gap-2 px-1 text-[11px] text-[var(--color-text-dim)]">
                  {time(m.createdAt)}
                  {mine && !m.id.startsWith("local-") && (
                    <button type="button" onClick={() => remove(m.id)} aria-label={t("Delete")} className="opacity-60 hover:opacity-100">
                      <Trash2 size={12} aria-hidden />
                    </button>
                  )}
                </span>
              </div>
            </li>
          );
        })}
      </ol>
      <div ref={bottom} />
      {error && (
        <p role="alert" className="mt-2 text-sm text-[var(--color-danger)]">
          {error}
        </p>
      )}
      <Composer onSend={send} disabled={sending} />
    </div>
  );
}
