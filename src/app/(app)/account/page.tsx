import Link from "next/link";
import { Download, Save, Sparkles, Trash2 } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { deleteMyAccount, setDisplayName } from "./actions";
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
  searchParams: Promise<{ error?: string }>;
}) {
  const sp = await searchParams;
  const user = await requireUser();
  const t = await getT();

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
