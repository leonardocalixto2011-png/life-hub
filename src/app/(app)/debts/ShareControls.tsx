"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { MyShare } from "@/lib/debt-sharing";
import { setDebtShare } from "./actions";

type Level = "SUMMARY" | "FULL" | null;

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: null, label: "Private", hint: "Nobody in this hub sees anything" },
  { value: "SUMMARY", label: "Summary", hint: "Totals only — no individual debts" },
  { value: "FULL", label: "Full detail", hint: "Every debt, amount and due date" },
];

/**
 * One row per hub the person belongs to, each with its own independent
 * visibility. Sharing is deliberately per-hub rather than one global switch:
 * you can be open with the household and private in a business hub.
 */
export function ShareControls({ shares }: { shares: MyShare[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [local, setLocal] = useState<Record<string, Level>>(
    Object.fromEntries(shares.map((s) => [s.hubId, s.visibility])),
  );

  function choose(hubId: string, level: Level) {
    if (local[hubId] === level) return;
    setLocal((p) => ({ ...p, [hubId]: level }));
    startTransition(async () => {
      await setDebtShare(hubId, level);
      router.refresh();
    });
  }

  if (shares.length === 0) return null;

  return (
    <div className="card space-y-3 p-3">
      <div>
        <div className="text-xs font-semibold">Who can see your debts</div>
        <p className="mt-0.5 text-[0.68rem] text-[var(--color-text-dim)]">
          Private by default. Being in a hub doesn&apos;t reveal your tracker — you
          choose per hub, and you can change it any time.
        </p>
      </div>

      {shares.map((s) => {
        const current = local[s.hubId] ?? null;
        return (
          <div key={s.hubId} className="space-y-1.5">
            <div className="text-[0.72rem] font-semibold">{s.hubName}</div>
            <div
              className="grid grid-cols-3 gap-1"
              role="radiogroup"
              aria-label={`Debt visibility in ${s.hubName}`}
            >
              {LEVELS.map((l) => {
                const active = current === l.value;
                return (
                  <button
                    key={String(l.value)}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    disabled={pending}
                    onClick={() => choose(s.hubId, l.value)}
                    className="rounded-lg border px-2 py-1.5 text-[0.68rem] font-semibold disabled:opacity-60"
                    style={
                      active
                        ? {
                            background: "var(--color-primary)",
                            borderColor: "var(--color-primary)",
                            color: "var(--color-primary-fg)",
                          }
                        : { borderColor: "var(--color-border)" }
                    }
                  >
                    {l.label}
                  </button>
                );
              })}
            </div>
            <p className="text-[0.65rem] text-[var(--color-text-dim)]">
              {LEVELS.find((l) => l.value === current)?.hint}
            </p>
          </div>
        );
      })}
    </div>
  );
}
