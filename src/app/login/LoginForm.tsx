"use client";

import { useActionState, useState } from "react";
import { RotateCw } from "lucide-react";

import { login, type LoginState } from "./actions";
import { useT } from "@/components/I18nProvider";

const initial: LoginState = { sent: false };

export function LoginForm({ open, next }: { open: boolean; next?: string }) {
  const [state, formAction, pending] = useActionState(login, initial);
  const t = useT();
  const [editing, setEditing] = useState(false);
  // Controlled, so a failed try (wrong password, taken address) doesn't wipe
  // the address: React resets uncontrolled fields after every form action.
  const [email, setEmail] = useState("");

  if (state.sent && !editing) {
    return (
      <div className="card p-5 text-sm">
        <p className="font-semibold">{t("Check your email")}</p>
        <p className="mt-1 text-[var(--color-text-dim)]">
          {open
            ? t("A sign-in link is on its way. It expires in 24 hours — clicking it both verifies your address and signs you in, so there is no password to set.")
            : t("If that address has an account or an invitation, a sign-in link is on its way. It expires in 24 hours.")}
        </p>
        {state.email && (
          <p className="mt-2 text-[var(--color-text-dim)]">{t("Sent to {email}.", { email: state.email })}</p>
        )}
        <p className="mt-2 text-xs text-[var(--color-text-dim)]">
          {t("Nothing after a few minutes? Look in junk or promotions for “Life Hub”, check the address above, then send it again.")}
        </p>
        <form action={formAction} className="mt-3">
          {next && <input type="hidden" name="next" value={next} />}
          <input type="hidden" name="email" value={state.email ?? ""} />
          <input type="hidden" name="resend" value="1" />
          <button type="submit" disabled={pending} className="btn btn-secondary w-full">
            <RotateCw size={16} strokeWidth={2} aria-hidden />
            {pending ? t("Sending…") : state.resent ? t("Sent again") : t("Send the link again")}
          </button>
        </form>
        <button type="button" onClick={() => setEditing(true)} className="btn btn-ghost mt-1 w-full">
          {t("Use another address")}
        </button>
      </div>
    );
  }

  return (
    <form action={formAction} onSubmit={() => setEditing(false)} className="card p-5">
      {next && <input type="hidden" name="next" value={next} />}
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
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={t("you@example.com")}
        className="field mt-2"
      />
      <label htmlFor="password" className="mt-3 block text-sm font-semibold">
        {t("Password")}{" "}
        <span className="font-normal text-[var(--color-text-dim)]">{t("(if you set one)")}</span>
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        maxLength={128}
        className="field mt-2"
      />
      {state.error && (
        <p className="mt-2 text-sm text-[var(--color-danger)]">{t(state.error)}</p>
      )}
      <button type="submit" name="intent" value="password" disabled={pending} className="btn btn-primary mt-3 w-full">
        {pending ? t("One moment…") : t("Sign in")}
      </button>
      <button type="submit" name="intent" value="link" disabled={pending} className="btn btn-secondary mt-2 w-full">
        {t("Email me a sign-in link instead")}
      </button>
      <p className="mt-3 text-xs text-[var(--color-text-dim)]">
        {open
          ? t("New here? Enter your email — the same link creates your account.")
          : t("Invite-only for now: someone who uses Life Hub can send you an invitation.")}
      </p>
    </form>
  );
}
