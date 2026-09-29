"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CURRENCIES } from "@/lib/locales";
import { setHubCurrency } from "@/app/(app)/hubs/actions";
import { useT } from "@/components/I18nProvider";

/**
 * Hub-wide, owner-only. Every total in the app is a sum across rows, so a
 * single currency per hub is what makes those sums mean anything — mixing
 * them would need exchange rates and a decision about which day's.
 */
export function CurrencyPicker({ hubId, current }: { hubId: string; current: string }) {
  const router = useRouter();
  const t = useT();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current);
  const [err, setErr] = useState<string | null>(null);

  function choose(next: string) {
    if (next === value) return;
    const previous = value;
    setValue(next);
    setErr(null);
    start(async () => {
      try {
        await setHubCurrency(hubId, next);
        router.refresh();
      } catch (e) {
        setValue(previous);
        setErr(e instanceof Error ? t(e.message) : t("Could not change the currency."));
      }
    });
  }

  return (
    <div className="form-stack gap-2">
      <label className="field-label">
        {t("Currency")}
        <select
          value={value}
          disabled={pending}
          onChange={(e) => choose(e.target.value)}
          className="field"
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <p className="field-hint mt-0">
        {t("Applies to everyone in this hub. It re-labels existing amounts — it does not convert them, so only change this if the figures really are in the new currency.")}
      </p>
      {err && <p className="text-xs text-[var(--color-danger)]">{err}</p>}
    </div>
  );
}
