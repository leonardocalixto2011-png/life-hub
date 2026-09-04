"use client";

export function PrivacyToggle({
  defaultValue = "SHARED",
}: {
  defaultValue?: "PRIVATE" | "SHARED";
}) {
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
      Private (only you see this)
    </label>
  );
}
