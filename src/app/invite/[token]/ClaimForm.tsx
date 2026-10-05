"use client";

import { useActionState, useState } from "react";
import { MailCheck, RotateCw } from "lucide-react";

import { claimInvite, type ClaimState } from "../actions";
import { useT } from "@/components/I18nProvider";

const initial: ClaimState = { sent: false };

export function ClaimForm({ token, hint }: { token: string; hint: string | null }) {
  const [state, formAction, pending] = useActionState(claimInvite.bind(null, token), initial);
  const t = useT();
  // "Use another address" goes back to the form; the next send hides it again.
  const [editing, setEditing] = useState(false);

  if (state.sent && !editing) {
    return (
      <div className="card space-y-3 p-5 text-sm" role="status">
        <p className="flex items-center gap-2 font-semibold">
          <MailCheck size={18} aria-hidden /> {state.resent ? t("Sent again") : t("Check your email")}
        </p>
        <p className="text-[var(--color-text-dim)]">
          {t("We sent a link to {email}. Opening it creates your account and signs you in.", {
            email: state.email ?? "",
          })}
        </p>
        <p className="text-xs text-[var(--color-text-dim)]">
          {t("Nothing after a few minutes? Look in junk or promotions for “Life Hub”, check the address above, then send it again.")}
        </p>
        {state.error && <p className="text-sm text-[var(--color-danger)]">{t(state.error)}</p>}
        <form action={formAction}>
          <input type="hidden" name="email" value={state.email ?? ""} />
          <input type="hidden" name="resend" value="1" />
          <button type="submit" disabled={pending} className="btn btn-secondary w-full">
            <RotateCw size={16} strokeWidth={2} aria-hidden />
            {pending ? t("Sending…") : t("Send the link again")}
          </button>
        </form>
        <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost w-full">
          {t("Use another address")}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={() => setEditing(false)} className="card space-y-3 p-5">
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
        defaultValue={editing ? state.email : undefined}
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
