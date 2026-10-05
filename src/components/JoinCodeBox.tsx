"use client";

import { KeyRound } from "lucide-react";

import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { useT } from "@/components/I18nProvider";
import { goToJoinCode } from "@/app/hubs/join/actions";

/**
 * "Have a hub code?" — the typed way to ask to join a hub (the other is
 * opening the link someone shared). Opens /hubs/join/<code>, which shows the
 * hub and asks before anything is sent.
 */
export function JoinCodeBox({ className }: { className?: string }) {
  const t = useT();
  return (
    <ActionForm action={goToJoinCode} className={className ?? "form-stack"}>
      <label className="field-label">
        {t("Have a hub code?")}
        <div className="flex gap-2">
          <input
            name="code"
            required
            autoComplete="off"
            autoCapitalize="characters"
            spellCheck={false}
            maxLength={12}
            placeholder="ABCD-2345"
            className="field min-w-0 flex-1 font-mono uppercase tracking-wider"
          />
          <SubmitButton className="btn btn-secondary shrink-0" pendingLabel="…">
            <KeyRound size={16} strokeWidth={2} aria-hidden />
            {t("Open")}
          </SubmitButton>
        </div>
        <span className="field-hint">{t("Someone in the hub can give you its code. The owner approves your request.")}</span>
      </label>
    </ActionForm>
  );
}
