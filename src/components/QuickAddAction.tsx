"use client";

import { useSyncExternalStore } from "react";
import { Mic, Pencil } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { openQuickAdd } from "@/lib/quickadd-bus";

// Same detection as QuickAdd's mic button, so the two never disagree about
// whether voice exists here. Server snapshot: no voice (hydration-safe).
const noop = () => () => {};
const hasSpeech = () => {
  const w = window as unknown as { SpeechRecognition?: unknown; webkitSpeechRecognition?: unknown };
  return Boolean(w.SpeechRecognition ?? w.webkitSpeechRecognition);
};

/**
 * The one clear action on an empty screen: say it, or type it. Both land in
 * the quick-add composer at the top of the app rather than a new form — the
 * empty state teaches the tool people will use every day after this.
 */
export function QuickAddAction() {
  const t = useT();
  const voice = useSyncExternalStore(noop, hasSpeech, () => false);

  return (
    <div className="mt-5 flex flex-wrap justify-center gap-2">
      {voice && (
        <button type="button" className="btn btn-primary" onClick={() => openQuickAdd("voice")}>
          <Mic size={17} strokeWidth={2.1} aria-hidden />
          {t("Say it")}
        </button>
      )}
      <button
        type="button"
        className={voice ? "btn btn-secondary" : "btn btn-primary"}
        onClick={() => openQuickAdd("type")}
      >
        <Pencil size={16} strokeWidth={2.1} aria-hidden />
        {t("Type it")}
      </button>
    </div>
  );
}
