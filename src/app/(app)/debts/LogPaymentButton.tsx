"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { money } from "@/lib/format";
import { logDebtPayment } from "./actions";

/** One-tap "log the usual payment" for a debt row. */
export function LogPaymentButton({ id, amountCents }: { id: string; amountCents: number }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState(false);

  function submit() {
    setError(false);
    startTransition(async () => {
      try {
        const fd = new FormData();
        fd.set("id", id);
        fd.set("amount", (amountCents / 100).toFixed(2));
        await logDebtPayment(fd);
        router.refresh();
      } catch {
        setError(true);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={submit}
      disabled={pending}
      className="mt-1 text-[0.62rem] font-semibold text-[var(--color-primary)] underline disabled:opacity-50"
    >
      {pending ? "logging…" : error ? "failed — retry" : `log ${money(amountCents, "CAD")} payment`}
    </button>
  );
}
