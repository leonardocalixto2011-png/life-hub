import { Send, X } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { inviteQuota, maskEmail } from "@/lib/app-invites";
import { fmt, langOf } from "@/lib/i18n";
import { personName } from "@/lib/people";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";
import { FormSection } from "@/components/Form";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { inviteByEmail, revokeAppInvite } from "./actions";
import { InviteLinkButton } from "./InviteLinkButton";

export const dynamic = "force-dynamic";

/**
 * Invite someone to Life Hub itself. They get their own account and set it up
 * their way; which hubs they join is a separate question — an owner invites
 * them, or they ask with a hub's code.
 */
export default async function InvitationsPage() {
  const user = await requireUser();
  const t = await getT();
  const lang = langOf(user.locale);
  const [quota, sent] = await Promise.all([
    inviteQuota(user.id, user.role),
    prisma.appInvite.findMany({
      where: { createdById: user.id },
      select: {
        id: true,
        email: true,
        claimedEmail: true,
        createdAt: true,
        expiresAt: true,
        usedAt: true,
        revokedAt: true,
        usedBy: { select: { name: true, username: true } },
        hub: { select: { name: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 30,
    }),
  ]);
  const now = new Date();
  const outOfInvites = quota.left <= 0;

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/account", label: t("Your account") }}
        title={t("Invite to Life Hub")}
        sub={
          quota.limit === null
            ? t("No limit on your invitations.")
            : t("{n} of {limit} invitations left this month.", { n: quota.left, limit: quota.limit })
        }
      />

      <p className="text-sm text-[var(--color-text-dim)]">
        {t("The person creates their own account — name, username, language. Joining one of your hubs stays a separate yes: invite them from its Members page, or give them its code.")}
      </p>

      <FormSection title={t("By email")}>
        <ActionForm action={inviteByEmail} className="form-stack">
          <label className="field-label">
            {t("Their email address")}
            <input name="email" type="email" required autoComplete="off" placeholder="someone@example.com" className="field" />
          </label>
          <SubmitButton className="btn btn-primary w-full" pendingLabel={t("Sending…")} disabled={outOfInvites}>
            <Send size={16} strokeWidth={2} aria-hidden />
            {t("Send the invitation")}
          </SubmitButton>
        </ActionForm>
      </FormSection>

      <FormSection title={t("By link")}>
        <p className="field-hint mt-0">
          {t("For a text message or Messenger. Whoever opens it first enters their address, and the account is tied to it.")}
        </p>
        <InviteLinkButton disabled={outOfInvites} />
      </FormSection>

      {sent.length > 0 && (
        <section>
          <SectionHeader title={t("Sent")} />
          <div className="list">
            {sent.map((inv) => {
              const state = inv.usedAt
                ? "used"
                : inv.revokedAt
                  ? "revoked"
                  : inv.expiresAt <= now
                    ? "expired"
                    : "pending";
              const who = inv.email ?? inv.claimedEmail;
              return (
                <div key={inv.id} className="row pr-2">
                  <div className="row-main">
                    <span className="row-title break-all">
                      {state === "used" && inv.usedBy
                        ? personName(inv.usedBy, inv.usedBy.username ? `@${inv.usedBy.username}` : t("Member"))
                        : who
                          ? maskEmail(who)
                          : t("Invitation link")}
                    </span>
                    <span className="row-sub">
                      {state === "used"
                        ? t("Joined Life Hub")
                        : state === "revoked"
                          ? t("Cancelled")
                          : state === "expired"
                            ? t("Expired")
                            : t("Waiting · until {date}", { date: fmt(inv.expiresAt, lang === "fr" ? "d MMM" : "MMM d", lang) })}
                      {inv.hub ? ` · ${inv.hub.name}` : ""}
                    </span>
                  </div>
                  {state === "pending" && (
                    <form action={revokeAppInvite.bind(null, inv.id)}>
                      <SubmitButton className="btn btn-ghost btn-sm text-[var(--color-text-dim)]" pendingLabel="…">
                        <X size={14} strokeWidth={2} aria-hidden />
                        {t("cancel")}
                      </SubmitButton>
                    </form>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
