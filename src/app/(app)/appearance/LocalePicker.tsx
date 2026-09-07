"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { LOCALES } from "@/lib/locales";
import { money } from "@/lib/format";
import { setLocale } from "./actions";

/**
 * Shows a live example rather than only a language name — the whole point of
 * this setting is how numbers look, and "fr-CA" means nothing until you see
 * that it renders 1 234,56 $ instead of $1,234.56.
 */
export function LocalePicker({ current, currency }: { current: string; currency: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [value, setValue] = useState(current);

  function choose(next: string) {
    if (next === value) return;
    setValue(next);
    start(async () => {
      await setLocale(next);
      router.refresh();
    });
  }

  return (
    <div className="space-y-1.5">
      <select
        value={value}
        disabled={pending}
        onChange={(e) => choose(e.target.value)}
        aria-label="Number and date formatting"
        className="field"
      >
        {LOCALES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <p className="text-[0.68rem] text-[var(--color-text-dim)]">
        Amounts look like <span className="font-semibold">{money(123456, currency, value)}</span>.
        This changes formatting only — the app is still in English.
      </p>
    </div>
  );
}
