"use client";

import { useRef, useState } from "react";
import { Check, Copy } from "lucide-react";

import { useT } from "@/components/I18nProvider";

/**
 * A value to hand to someone else — an invite link, a hub code — with a Copy
 * button. Falls back to selecting the text where the clipboard is refused
 * (some in-app browsers), so it can always be copied by hand.
 */
export function CopyField({ value, label, mono = false }: { value: string; label: string; mono?: boolean }) {
  const t = useT();
  const ref = useRef<HTMLInputElement>(null);
  const [copied, setCopied] = useState(false);

  function select() {
    ref.current?.focus();
    ref.current?.select();
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      select();
    }
  }

  return (
    <div className="flex gap-2">
      <input
        ref={ref}
        readOnly
        value={value}
        aria-label={label}
        onFocus={select}
        className={`field min-w-0 flex-1 text-sm ${mono ? "font-mono tracking-wider" : ""}`}
      />
      <button type="button" onClick={copy} className="btn btn-secondary shrink-0" aria-live="polite">
        {copied ? <Check size={16} strokeWidth={2} aria-hidden /> : <Copy size={16} strokeWidth={2} aria-hidden />}
        {copied ? t("Copied") : t("Copy")}
      </button>
    </div>
  );
}
