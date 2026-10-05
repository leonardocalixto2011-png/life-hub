import Link from "next/link";
import { Download, Mail, Save, Sparkles, Trash2, UserPlus } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { deleteMyAccount, requestEmailChange, setDisplayName, setUsername } from "./actions";
import { AvatarUpload } from "./AvatarUpload";
import { UsernameField } from "./UsernameField";
import { ActionForm } from "@/components/ActionForm";
import { prisma } from "@/lib/prisma";
import { suggestUsername } from "@/lib/username";
import { LegalLinks } from "@/components/LegalPage";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader } from "@/components/SectionHeader";
import { DangerZone, FormSection } from "@/components/Form";

export const dynamic = "force-dynamic";

/**
 * The two rights that need a working button rather than a paragraph in a
 * policy: get a copy of your data, and have it erased.
 */
export default async function AccountPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; changed?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const t = await getT();
  const [invitedBy, pendingChange] = await Promise.all([
    prisma.user.findUnique({ where: { id: user.id }, select: { invitedBy: { select: { name: true } } } }),
    prisma.emailChange.findFirst({
      where: { userId: user.id, expiresAt: { gt: new Date() } },
      select: { newEmail: true },
    }),
  ]);

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/today", label: t("Today") }}
        title={t("Your account")}
        sub={t("Signed in as {email}.", { email: user.email })}
      />

      {sp.error && (
        <div role="alert" className="card border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-4 text-sm text-[var(--color-danger)]">
          {t(sp.error)}
        </div>
      )}

      {sp.changed && (
        <div role="status" className="card p-4 text-sm font-semibold">
          {t("Done: you now sign in with {email}.", { email: user.email })}
        </div>
      )}

      <FormSection title={t("Photo")}>
        <AvatarUpload userId={user.id} name={user.name} email={user.email} avatarUrl={user.avatarUrl} />
        <p className="field-hint mt-0">{t("Shown to the people in your hubs, next to your name.")}</p>
      </FormSection>

      <form action={setDisplayName}>
        <FormSection title={t("Your name")}>
          <label className="field-label">
            {t("Name shown to hub members")}
            <input
              name="name"
              defaultValue={user.name ?? ""}
              maxLength={80}
              autoComplete="name"
              className="field"
              placeholder={t("First name, or how people call you")}
            />
            <span className="field-hint">
              {t("The people in your hubs see this name — not your email address, unless you choose to show it on a hub's members page.")}
            </span>
          </label>
          <SubmitButton className="btn btn-secondary w-full" pendingLabel={t("Saving…")}>
            <Save size={16} strokeWidth={2} aria-hidden />
            {t("Save")}
          </SubmitButton>
        </FormSection>
      </form>

      <ActionForm action={setUsername}>
        <FormSection title={t("Username")}>
          <UsernameField defaultValue={user.username ?? suggestUsername(user.name)} />
          {!user.username && (
            <p className="field-hint mt-0">{t("You don't have one yet — the suggestion above isn't saved until you press Save.")}</p>
          )}
          <SubmitButton className="btn btn-secondary w-full" pendingLabel={t("Saving…")}>
            <Save size={16} strokeWidth={2} aria-hidden />
            {t("Save")}
          </SubmitButton>
        </FormSection>
      </ActionForm>

      <ActionForm action={requestEmailChange}>
        <FormSection title={t("Sign-in address")}>
          <p className="field-hint mt-0">
            {t("Your sign-in links go to {email}. To change it, enter the new address: we send it a confirmation link, and nothing changes until you open it.", { email: user.email })}
          </p>
          {pendingChange && (
            <p className="field-hint mt-0 font-semibold">
              {t("Waiting for confirmation from {email}.", { email: pendingChange.newEmail })}
            </p>
          )}
          <label className="field-label">
            {t("New address")}
            <input name="email" type="email" required autoComplete="email" className="field" placeholder="you@example.com" />
          </label>
          <SubmitButton className="btn btn-secondary w-full" pendingLabel={t("Sending…")}>
            <Mail size={16} strokeWidth={2} aria-hidden />
            {t("Send the confirmation link")}
          </SubmitButton>
        </FormSection>
      </ActionForm>

      <FormSection title={t("Invite to Life Hub")}>
        <p className="field-hint mt-0">
          {invitedBy?.invitedBy?.name
            ? t("{name} invited you. Bring someone in the same way: they create their own account.", { name: invitedBy.invitedBy.name })
            : t("Bring someone in: they create their own account, then join your hubs if they want.")}
        </p>
        <Link href="/invitations" className="btn btn-secondary w-full">
          <UserPlus size={17} strokeWidth={2} aria-hidden />
          {t("Invite someone")}
        </Link>
      </FormSection>

      <FormSection title={t("Download your data")}>
        <p className="field-hint mt-0">
          {t("A JSON file with everything Life Hub holds about you — tasks, events, budget entries, subscriptions, debts, hub memberships, settings and the record of what you consented to. Mailbox passwords and push endpoints are left out on purpose.")}
        </p>
        <a href="/api/account/export" className="btn btn-primary w-full" download>
          <Download size={17} strokeWidth={2} aria-hidden />
          {t("Download JSON")}
        </a>
      </FormSection>

      <FormSection title={t("Replay the welcome")}>
        <p className="field-hint mt-0">
          {t("The first-run steps again — language, hub, what you track, notifications. Nothing you've added is reset.")}
        </p>
        <Link href="/welcome" className="btn btn-secondary w-full">
          <Sparkles size={17} strokeWidth={2} aria-hidden />
          {t("Replay the welcome")}
        </Link>
      </FormSection>

      <FormSection title={t("Privacy")}>
        <p className="field-hint mt-0">
          {t("What Life Hub collects, why, and your rights. Consents you gave are withdrawn where you gave them: debts on the Debts page, email analysis under Connected mailboxes.")}
        </p>
        <LegalLinks
          privacy={t("Privacy policy")}
          terms={t("Terms of use")}
          className="text-sm font-semibold text-[var(--color-primary)]"
        />
      </FormSection>

      <DangerZone>
        <h2 className="section-title" style={{ color: "var(--color-danger)" }}>
          {t("Delete your account")}
        </h2>
        <div className="form-card">
          <p className="field-hint mt-0">
            {t("Permanent, and there is no undo. Your debts, mailbox connections, notification settings and personal hubs are destroyed.")}
          </p>
          <p className="field-hint mt-0">
            {t("Things you created in a hub you share with other people — tasks, events, budget entries — stay, with your name removed. A shared hub you own passes to its longest-standing member; if you're its only member it's deleted with everything in it.")}
          </p>
          <form action={deleteMyAccount} className="form-stack">
            <label className="field-label">
              {t("Type {email} to confirm", { email: user.email })}
              <input
                name="confirmEmail"
                autoComplete="off"
                required
                className="field"
                placeholder={user.email}
              />
            </label>
            <SubmitButton className="btn btn-danger w-full" pendingLabel={t("Deleting…")}>
              <Trash2 size={16} strokeWidth={2} aria-hidden />
              {t("Delete my account permanently")}
            </SubmitButton>
          </form>
        </div>
      </DangerZone>
    </div>
  );
}
