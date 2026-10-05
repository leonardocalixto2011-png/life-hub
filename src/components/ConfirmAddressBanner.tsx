"use client";

import { MailCheck } from "lucide-react";

import { resendConfirmation } from "@/app/(app)/account/actions";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { useT } from "@/components/I18nProvider";

/**
 * For someone who made their account with a password on an invitation and
 * hasn't opened the confirmation link yet. Everything works meanwhile; this
 * just keeps asking, quietly, until the address is proven.
 */
export function ConfirmAddressBanner({ email }: { email: string }) {
  const t = useT();
  return (
    <ActionForm
      action={resendConfirmation}
      className="mx-3 mt-2 flex items-center gap-3 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
    >
      <MailCheck size={18} aria-hidden className="shrink-0 text-[var(--color-primary)]" />
      <span className="min-w-0 flex-1">
        {t("Confirm your address: open the link we sent to {email}.", { email })}
      </span>
      <SubmitButton className="btn btn-ghost btn-sm shrink-0" pendingLabel="…">
        {t("Resend")}
      </SubmitButton>
    </ActionForm>
  );
}
