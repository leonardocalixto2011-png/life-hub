"use client";

import { useRef, useState } from "react";
import { SendHorizontal } from "lucide-react";

import { useT } from "@/components/I18nProvider";

/** The message box at the bottom of a chat. Enter sends, Shift+Enter is a new line. */
export function Composer({
  onSend,
  disabled,
  placeholder,
}: {
  onSend: (text: string) => void;
  disabled?: boolean;
  placeholder?: string;
}) {
  const t = useT();
  const [text, setText] = useState("");
  const ref = useRef<HTMLTextAreaElement>(null);

  function send() {
    const v = text.trim();
    if (!v || disabled) return;
    onSend(v);
    setText("");
    ref.current?.focus();
  }

  return (
    <div className="sticky bottom-[calc(env(safe-area-inset-bottom)+4.5rem)] z-10 mt-2 flex items-end gap-2 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-2 shadow-sm">
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            send();
          }
        }}
        rows={1}
        maxLength={4000}
        aria-label={t("Message")}
        placeholder={placeholder ?? t("Message")}
        className="max-h-40 min-h-[44px] flex-1 resize-none bg-transparent px-2 py-2.5 text-base outline-none"
        style={{ fieldSizing: "content" } as React.CSSProperties}
      />
      <button
        type="button"
        onClick={send}
        disabled={disabled || !text.trim()}
        className="btn btn-primary btn-icon shrink-0"
        aria-label={t("Send")}
      >
        <SendHorizontal size={20} aria-hidden />
      </button>
    </div>
  );
}
