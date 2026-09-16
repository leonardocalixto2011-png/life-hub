"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { LOCALES } from "@/lib/locales";
import { money } from "@/lib/format";
import { langOf } from "@/lib/i18n";
import { useT } from "@/components/I18nProvider";
import { setLocale } from "./actions";

/**
 * One setting picks both the interface language and how numbers look —
 * "Français (Canada)" speaks French *and* renders 1 234,56 $. The live example
 * shows the second half, which "fr-CA" alone never explains.
 */
export function LocalePicker({ current, currency }: { current: string; currency: string }) {
  const router = useRouter();
  const t = useT();
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
        aria-label={t("Language and formatting")}
        className="field"
      >
        {LOCALES.map((l) => (
          <option key={l.value} value={l.value}>
            {l.label}
          </option>
        ))}
      </select>
      <p className="text-[0.68rem] text-[var(--color-text-dim)]">
        {t("Amounts look like {example}.", { example: money(123456, currency, value) })}{" "}
        {langOf(value) === "fr"
          ? t("The interface is in French.")
          : t("The interface is in English.")}
      </p>
    </div>
  );
}
