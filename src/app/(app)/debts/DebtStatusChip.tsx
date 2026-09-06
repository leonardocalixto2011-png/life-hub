"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";

import { setDebtStatus } from "./actions";

type Status = "CURRENT" | "DEFAULT" | "PAID_OFF";

/**
 * Inline status control on the debts list — subscriptions, deadlines and
 * budget rows all have one; debts used to require opening the detail page.
 * Doubles as the status badge, so `current` and `paid off` are visible too
 * (only `in default` used to show at all).
 */
export function DebtStatusChip({ id, status }: { id: string; status: Status }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function change(next: string) {
    if (next === status) return;
    const fd = new FormData();
    fd.set("id", id);
    fd.set("status", next);
    startTransition(async () => {
      await setDebtStatus(fd);
      router.refresh();
    });
  }

  const danger = status === "DEFAULT";

  return (
    <select
      value={status}
      disabled={pending}
      onChange={(e) => change(e.target.value)}
      aria-label={`Status for ${id}`}
      className="chip"
      style={
        danger
          ? {
              background: "var(--color-danger)",
              borderColor: "var(--color-danger)",
              color: "#fff",
            }
          : undefined
      }
    >
      <option value="CURRENT">current</option>
      <option value="DEFAULT">in default</option>
      <option value="PAID_OFF">paid off</option>
    </select>
  );
}
