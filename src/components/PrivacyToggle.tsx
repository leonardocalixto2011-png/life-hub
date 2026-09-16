"use client";

import { useT } from "@/components/I18nProvider";

export function PrivacyToggle({
  defaultValue = "SHARED",
}: {
  defaultValue?: "PRIVATE" | "SHARED";
}) {
  const t = useT();
  return (
    <label className="flex items-center gap-2 text-xs font-semibold text-[var(--color-text-dim)]">
      <input
        type="checkbox"
        name="visibility"
        value="PRIVATE"
        defaultChecked={defaultValue === "PRIVATE"}
        // A checked box submits "PRIVATE"; unchecked submits nothing, so the
        // server default (SHARED) applies — matches the confirmed default.
      />
      {t("Private (only you see this)")}
    </label>
  );
}
