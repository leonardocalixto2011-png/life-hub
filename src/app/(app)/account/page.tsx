import { Download, Trash2 } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { deleteMyAccount } from "./actions";
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
          {sp.error}
        </div>
      )}

      <FormSection title={t("Download your data")}>
        <p className="field-hint mt-0">
          {t("A JSON file with everything Life Hub holds about you — tasks, events, budget entries, subscriptions, debts, hub memberships and settings. Mailbox passwords and push endpoints are left out on purpose.")}
        </p>
        <a href="/api/account/export" className="btn btn-primary w-full" download>
          <Download size={17} strokeWidth={2} aria-hidden />
          {t("Download JSON")}
        </a>
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
