"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { MyShare } from "@/lib/debt-sharing";
import { setDebtShare } from "./actions";
import { useT } from "@/components/I18nProvider";

type Level = "SUMMARY" | "FULL" | null;

const LEVELS: { value: Level; label: string; hint: string }[] = [
  { value: null, label: "Private", hint: "Nobody in this hub sees anything" },
  { value: "SUMMARY", label: "Summary", hint: "Totals only — no individual debts" },
  { value: "FULL", label: "Full detail", hint: "Every debt, amount and due date" },
];

const RANK: Record<string, number> = { null: 0, SUMMARY: 1, FULL: 2 };

/** What the person is agreeing to show, spelled out per level. */
const CONSENT_TEXT: Record<"SUMMARY" | "FULL", string> = {
  SUMMARY:
    "I agree to show the members of {hub} the totals of my debts: how many, the total balance, my monthly payments and how many are in default.",
  FULL:
    "I agree to show the members of {hub} each of my debts: creditor, balance, payment, due date and whether it is in default.",
};

/**
 * One row per hub the person belongs to, each with its own independent
 * visibility. Sharing is deliberately per-hub rather than one global switch:
 * you can be open with the household and private in a business hub.
 *
 * Showing MORE than before (a new share, or Summary → Full) is never one tap:
 * it opens a confirmation with a checkbox that starts unchecked, naming the
 * hub and exactly what its members will see. That tick is the DEBT_SHARE
 * consent recorded by `setDebtShare`, which re-checks it on the server.
 * Showing less, or going back to Private, applies at once — and Private
 * revokes the consent.
 */
export function ShareControls({ shares }: { shares: MyShare[] }) {
  const router = useRouter();
  const t = useT();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [local, setLocal] = useState<Record<string, Level>>(
    Object.fromEntries(shares.map((s) => [s.hubId, s.visibility])),
  );
  /** A widening choice waiting for its checkbox. */
  const [asking, setAsking] = useState<{ hubId: string; level: "SUMMARY" | "FULL" } | null>(null);
  const [agreed, setAgreed] = useState(false);

  function apply(hubId: string, level: Level, consent: boolean) {
    const before = local[hubId] ?? null;
    setError(null);
    setLocal((p) => ({ ...p, [hubId]: level }));
    startTransition(async () => {
      try {
        await setDebtShare(hubId, level, consent);
        router.refresh();
      } catch {
        // Nothing was shared: put the control back where it was.
        setLocal((p) => ({ ...p, [hubId]: before }));
        setError(t("Could not save"));
      }
    });
  }

  function choose(hubId: string, level: Level) {
    const current = local[hubId] ?? null;
    if (current === level) {
      setAsking(null);
      return;
    }
    if (level !== null && RANK[String(level)] > RANK[String(current)]) {
      setAgreed(false);
      setAsking({ hubId, level });
      return;
    }
    setAsking(null);
    apply(hubId, level, false);
  }

  if (shares.length === 0) return null;

  return (
    <div className="card space-y-3 p-3">
      <div>
        <div className="text-xs font-semibold">{t("Who can see your debts")}</div>
        <p className="mt-0.5 text-[0.68rem] text-[var(--color-text-dim)]">
          {t("Private by default. Being in a hub doesn't reveal your tracker — you choose per hub, and you can change it any time.")}
        </p>
      </div>

      {shares.map((s) => {
        const current = local[s.hubId] ?? null;
        const ask = asking?.hubId === s.hubId ? asking : null;
        return (
          <div key={s.hubId} className="space-y-1.5">
            <div className="text-[0.72rem] font-semibold">{s.hubName}</div>
            <div
              className="grid grid-cols-3 gap-1"
              role="radiogroup"
              aria-label={t("Debt visibility in {hub}", { hub: s.hubName })}
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
                    className="min-h-[44px] rounded-lg border px-2 py-1.5 text-[0.68rem] font-semibold disabled:opacity-60"
                    style={
                      active
                        ? {
                            background: "var(--color-primary)",
                            borderColor: "var(--color-primary)",
                            color: "var(--color-primary-fg)",
                          }
                        : ask?.level === l.value
                          ? { borderColor: "var(--color-primary)" }
                          : { borderColor: "var(--color-border)" }
                    }
                  >
                    {t(l.label)}
                  </button>
                );
              })}
            </div>
            <p className="text-[0.65rem] text-[var(--color-text-dim)]">
              {t(LEVELS.find((l) => l.value === current)?.hint ?? "")}
            </p>

            {ask && (
              <div
                className="space-y-2 rounded-lg border border-[var(--color-primary)] p-3"
                role="group"
                aria-label={t("Confirm sharing with {hub}", { hub: s.hubName })}
              >
                <label className="check-row items-start text-[0.8125rem]">
                  <input
                    type="checkbox"
                    checked={agreed}
                    onChange={(e) => setAgreed(e.target.checked)}
                    className="mt-0.5"
                  />
                  <span>{t(CONSENT_TEXT[ask.level], { hub: s.hubName })}</span>
                </label>
                <p className="text-[0.65rem] text-[var(--color-text-dim)]">
                  {t("You can go back to Private at any time; that withdraws this consent.")}
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    className="btn btn-primary btn-sm flex-1"
                    disabled={!agreed || pending}
                    onClick={() => {
                      const { hubId, level } = ask;
                      setAsking(null);
                      apply(hubId, level, true);
                    }}
                  >
                    {t("Share with {hub}", { hub: s.hubName })}
                  </button>
                  <button type="button" className="btn btn-sm" onClick={() => setAsking(null)}>
                    {t("Cancel")}
                  </button>
                </div>
              </div>
            )}
          </div>
        );
      })}

      {error && (
        <p role="alert" className="text-xs text-[var(--color-danger)]">
          {error}
        </p>
      )}
    </div>
  );
}
