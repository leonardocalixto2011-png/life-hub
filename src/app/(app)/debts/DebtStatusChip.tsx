"use client";

import { useOptimistic, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { Celebrate } from "@/components/Celebrate";
import { money } from "@/lib/format";
import { setDebtStatus } from "./actions";

type Status = "CURRENT" | "DEFAULT" | "PAID_OFF";

/**
 * Inline status control on the debts list — subscriptions, deadlines and
 * budget rows all have one; debts used to require opening the detail page.
 * Doubles as the status badge, so `current` and `paid off` are visible too
 * (only `in default` used to show at all).
 */
export function DebtStatusChip({
  id,
  status,
  name,
  balanceCents,
  currency,
  locale,
}: {
  id: string;
  status: Status;
  /** Only used by the payoff celebration. */
  name?: string;
  balanceCents?: number;
  currency?: string;
  locale?: string;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [cleared, setCleared] = useState(false);
  // Without this the select visibly snapped back to the old value and sat
  // disabled until the server answered, so picking "paid off" looked like it
  // had been rejected. React restores the prop value if the action throws.
  const [shown, setShownOptimistic] = useOptimistic(status);

  function change(next: string) {
    if (next === shown) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", next);
    startTransition(async () => {
      setShownOptimistic(next as Status);
      await setDebtStatus(fd);
      // Fires only on the transition *into* PAID_OFF, and only after the
      // write succeeded — so it can never celebrate something that failed to
      // save, and re-selecting "paid off" on an already-cleared debt is
      // silent. Marking one paid off by mistake and correcting it shouldn't
      // set off fireworks twice either.
      if (next === "PAID_OFF" && shown !== "PAID_OFF") setCleared(true);
      router.refresh();
    });
  }

  const danger = shown === "DEFAULT";

  return (
    <>
      {cleared && (
        <Celebrate
          headline="Cleared."
          detail={name ? `${name} is paid off.` : undefined}
          countFrom={balanceCents}
          format={(c) => money(c, currency, locale)}
          onDone={() => setCleared(false)}
        />
      )}
      <select
        value={shown}
        onChange={(e) => change(e.target.value)}
        aria-label={name ? `Status for ${name}` : `Status for ${id}`}
        className="chip"
        style={
          danger
            ? {
                background: "var(--color-danger)",
                borderColor: "var(--color-danger)",
                color: "#fff",
              }
            : shown === "PAID_OFF"
              ? { background: "var(--color-ok-wash)", borderColor: "var(--color-ok)", color: "var(--color-ok)" }
              : undefined
        }
      >
        <option value="CURRENT">current</option>
        <option value="DEFAULT">in default</option>
        <option value="PAID_OFF">paid off</option>
      </select>
    </>
  );
}
