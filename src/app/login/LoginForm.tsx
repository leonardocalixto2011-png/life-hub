"use client";

import { useActionState } from "react";

import { requestMagicLink, type LoginState } from "./actions";
import { useT } from "@/components/I18nProvider";

const initial: LoginState = { sent: false };

export function LoginForm({ open }: { open: boolean }) {
  const [state, formAction, pending] = useActionState(requestMagicLink, initial);
  const t = useT();

  if (state.sent) {
    return (
      <div className="card p-5 text-sm">
        <p className="font-semibold">{t("Check your email")}</p>
        <p className="mt-1 text-[var(--color-text-dim)]">
          {open
            ? t("A sign-in link is on its way. It expires in 24 hours — clicking it both verifies your address and signs you in, so there is no password to set.")
            : t("If that address has access, a sign-in link is on its way. It expires in 24 hours.")}
        </p>
        <p className="mt-3 text-xs text-[var(--color-text-dim)]">
          Running locally with no email key? The link is printed in the dev server console.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="card p-5">
      <label htmlFor="email" className="text-sm font-semibold">
        {t("Email")}
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="email"
        inputMode="email"
        required
        placeholder="you@example.com"
        className="field mt-2"
      />
      {state.error && (
        <p className="mt-2 text-sm text-[var(--color-danger)]">{state.error}</p>
      )}
      <button type="submit" disabled={pending} className="btn btn-primary mt-3 w-full">
        {pending ? t("Sending…") : t("Send sign-in link")}
      </button>
      <p className="mt-3 text-xs text-[var(--color-text-dim)]">
        {open
          ? t("New here? Enter your email — the same link creates your account.")
          : t("Invite-only. Ask an admin to add your address.")}
      </p>
    </form>
  );
}
