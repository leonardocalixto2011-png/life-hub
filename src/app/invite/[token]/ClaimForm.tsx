"use client";

import { useActionState, useState } from "react";
import Link from "next/link";
import { MailCheck, RotateCw } from "lucide-react";

import { claimInvite, type ClaimState } from "../actions";
import { useT } from "@/components/I18nProvider";

const initial: ClaimState = { sent: false };

export function ClaimForm({ token, hint }: { token: string; hint: string | null }) {
  const [state, formAction, pending] = useActionState(claimInvite.bind(null, token), initial);
  const t = useT();
  // "Use another address" goes back to the form; the next send hides it again.
  const [editing, setEditing] = useState(false);
  // Controlled, so a failed try (wrong password, taken address) doesn't wipe
  // the address: React resets uncontrolled fields after every form action.
  const [email, setEmail] = useState("");

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
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        placeholder={hint ?? "you@example.com"}
        className="field"
      />
      {hint && <p className="field-hint mt-0">{t("This invitation was sent to {email}.", { email: hint })}</p>}
      <label htmlFor="password" className="block text-sm font-semibold">
        {t("Choose a password")}
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        maxLength={128}
        className="field"
      />
      <p className="field-hint mt-0">{t("At least 8 characters. Your phone can save it for you.")}</p>
      {state.error && <p className="text-sm text-[var(--color-danger)]">{t(state.error)}</p>}
      {state.error === "This address already has an account. Sign in instead." && (
        <Link href="/login" className="btn btn-secondary w-full">
          {t("Sign in")}
        </Link>
      )}
      <button type="submit" name="intent" value="password" disabled={pending} className="btn btn-primary btn-lg w-full">
        {pending ? t("One moment…") : t("Create my account")}
      </button>
      <p className="text-xs text-[var(--color-text-dim)]">
        {t("You're in right away. We also email you a link to confirm the address is yours.")}
      </p>
      <button type="submit" name="intent" value="link" formNoValidate disabled={pending} className="btn btn-ghost w-full">
        {t("No password: email me a link instead")}
      </button>
      <p className="text-xs text-[var(--color-text-dim)]">
        {t("Your address stays private: other people see your name and username.")}
      </p>
    </form>
  );
}
