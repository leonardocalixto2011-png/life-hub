"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { CURRENCIES } from "@/lib/locales";
import { setHubCurrency } from "@/app/(app)/hubs/actions";

/**
 * Hub-wide, owner-only. Every total in the app is a sum across rows, so a
 * single currency per hub is what makes those sums mean anything — mixing
 * them would need exchange rates and a decision about which day's.
 */
export function CurrencyPicker({ hubId, current }: { hubId: string; current: string }) {
  const router = useRouter();
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
        setErr(e instanceof Error ? e.message : "Could not change the currency.");
      }
    });
  }

  return (
    <div className="space-y-1.5">
      <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
        Currency
        <select
          value={value}
          disabled={pending}
          onChange={(e) => choose(e.target.value)}
          className="field mt-1"
        >
          {CURRENCIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <p className="text-[0.65rem] text-[var(--color-text-dim)]">
        Applies to everyone in this hub. It re-labels existing amounts — it does
        not convert them, so only change this if the figures really are in the
        new currency.
      </p>
      {err && <p className="text-[0.68rem] text-[var(--color-danger)]">{err}</p>}
    </div>
  );
}
