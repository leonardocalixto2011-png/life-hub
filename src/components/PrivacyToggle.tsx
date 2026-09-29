"use client";

import { Lock } from "lucide-react";

import { useT } from "@/components/I18nProvider";

export function PrivacyToggle({
  defaultValue = "SHARED",
}: {
  defaultValue?: "PRIVATE" | "SHARED";
}) {
  const t = useT();
  return (
    <label className="check-row">
      <input
        type="checkbox"
        name="visibility"
        value="PRIVATE"
        defaultChecked={defaultValue === "PRIVATE"}
        // A checked box submits "PRIVATE"; unchecked submits nothing, so the
        // server default (SHARED) applies — matches the confirmed default.
      />
      <Lock size={15} strokeWidth={2} aria-hidden className="text-[var(--color-text-dim)]" />
      {t("Private (only you see this)")}
    </label>
  );
}
