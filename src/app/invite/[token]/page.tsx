import Link from "next/link";

import { getUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { findInviteByToken, maskEmail } from "@/lib/app-invites";
import { LegalLinks } from "@/components/LegalPage";
import { ClaimForm } from "./ClaimForm";

export const dynamic = "force-dynamic";

/**
 * Where an invitation link lands — public, since the person has no account
 * yet. Says who invited them (first name only) and asks for an address;
 * nothing about anyone's hub beyond its name when the invitation carries one.
 */
export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const [user, invite, t] = await Promise.all([getUser(), findInviteByToken(token), getT()]);
  const inviter = invite?.createdBy.name?.trim().split(/\s+/)[0] ?? null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <p className="text-sm font-semibold text-[var(--color-primary)]">Life Hub</p>
        <h1 className="display mt-1 text-3xl leading-tight">
          {!invite
            ? t("This invitation doesn't work any more.")
            : inviter
              ? t("{name} invites you to Life Hub.", { name: inviter })
              : t("You're invited to Life Hub.")}
        </h1>
        <p className="mt-2 text-sm text-[var(--color-text-dim)]">
          {!invite
            ? t("It was used, cancelled or has expired. Ask the person who sent it for a new one.")
            : invite.hub
              ? t("Tasks, bills, budget and calendar — yours, and shared in “{hub}” if you say yes.", { hub: invite.hub.name })
              : t("Tasks, bills, budget and calendar — alone or with the people you choose.")}
        </p>
      </div>

      {user ? (
        <div className="card space-y-3 p-5 text-sm">
          <p>{t("You already have an account, so this invitation isn't needed.")}</p>
          <Link href="/today" className="btn btn-primary w-full">
            {t("Open Life Hub")}
          </Link>
        </div>
      ) : invite ? (
        <ClaimForm token={token} hint={invite.email ? maskEmail(invite.email) : null} />
      ) : (
        <Link href="/login" className="btn btn-secondary w-full">
          {t("I already have an account")}
        </Link>
      )}

      <footer>
        <LegalLinks
          privacy="Confidentialité · Privacy"
          terms="Conditions · Terms"
          className="text-center text-xs text-[var(--color-text-dim)]"
        />
      </footer>
    </main>
  );
}
