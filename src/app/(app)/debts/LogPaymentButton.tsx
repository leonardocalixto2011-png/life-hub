"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { money } from "@/lib/format";
import { logDebtPayment } from "./actions";
import { useT } from "@/components/I18nProvider";

/** One-tap "log the usual payment" for a debt row. */
export function LogPaymentButton({
  id,
  amountCents,
  currency,
  locale,
}: {
  id: string;
  amountCents: number;
  currency: string;
  locale: string;
}) {
  const router = useRouter();
  const t = useT();
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
      className="mt-2 inline-flex min-h-[32px] items-center rounded-full bg-[var(--primary-wash)] px-3 text-xs font-semibold text-[var(--color-primary)] transition-transform active:scale-95 disabled:opacity-50"
    >
      {pending ? t("logging…") : error ? t("failed — retry") : t("log {amount} payment", { amount: money(amountCents, currency, locale) })}
    </button>
  );
}
