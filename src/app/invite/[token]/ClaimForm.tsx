"use client";

import { useActionState } from "react";
import { MailCheck } from "lucide-react";

import { claimInvite, type ClaimState } from "../actions";
import { useT } from "@/components/I18nProvider";

const initial: ClaimState = { sent: false };

export function ClaimForm({ token, hint }: { token: string; hint: string | null }) {
  const [state, formAction, pending] = useActionState(claimInvite.bind(null, token), initial);
  const t = useT();

  if (state.sent) {
    return (
      <div className="card space-y-2 p-5 text-sm" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <MailCheck size={18} aria-hidden /> {t("Check your email")}
        </p>
        <p className="text-[var(--color-text-dim)]">
          {t("Open the link we just sent: it creates your account and signs you in. No password to remember.")}
        </p>
        <p className="text-xs text-[var(--color-text-dim)]">
          {t("Nothing after a few minutes? Check your junk folder, or enter your address again.")}
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card space-y-3 p-5">
      <label htmlFor="email" className="text-sm font-semibold">
        {t("Your email address")}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder={hint ?? "you@example.com"}
        className="field"
      />
      {hint && <p className="field-hint mt-0">{t("This invitation was sent to {email}.", { email: hint })}</p>}
      {state.error && <p className="text-sm text-[var(--color-danger)]">{t(state.error)}</p>}
      <button type="submit" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? t("Sending…") : t("Create my account")}
      </button>
      <p className="text-xs text-[var(--color-text-dim)]">
        {t("We email you a link instead of asking for a password. Your address stays private: other people see your name and username.")}
      </p>
    </form>
  );
}
