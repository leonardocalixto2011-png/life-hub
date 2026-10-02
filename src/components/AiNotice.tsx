"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Info } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { dismissAiNotice } from "@/app/(app)/quick-actions";

/**
 * Shown once, the first time someone uses AI parsing — a typed sentence, a
 * photo, or dictation — and never again after they dismiss it
 * (`User.aiNoticeAt`). It says who processes what: the text or photo goes to
 * Anthropic in the United States; turning speech into text is done by the
 * browser or phone vendor, before Life Hub sees anything.
 *
 * Informational, never blocking: the action that triggered it carries on
 * underneath. The express-consent gates (debts, mail analysis) are separate.
 */
export function AiNotice({ onDismissed }: { onDismissed?: () => void }) {
  const t = useT();
  const [gone, setGone] = useState(false);
  const [pending, start] = useTransition();
  if (gone) return null;

  function dismiss() {
    setGone(true);
    onDismissed?.();
    start(async () => {
      try {
        await dismissAiNotice();
      } catch {
        // Not worth interrupting anyone over: it will simply show once more.
      }
    });
  }

  return (
    <div role="note" className="card flex items-start gap-2.5 p-3 text-xs" data-ai-notice>
      <Info size={16} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="font-semibold">{t("How the AI part works")}</p>
        <p className="text-[var(--color-text-dim)]">
          {t("What you type or photograph here is sent to Anthropic, in the United States, to turn it into tasks, bills and events.")}{" "}
          {t("When you dictate, your voice is turned into text by your browser or phone maker (Apple, Google…), not by Life Hub.")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" onClick={dismiss} disabled={pending} className="btn btn-secondary btn-sm">
            {t("Got it")}
          </button>
          <Link href="/confidentialite" className="font-semibold underline">
            {t("Privacy policy")}
          </Link>
        </div>
      </div>
    </div>
  );
}
