import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, CheckCircle2, Mail, Plus, ShieldCheck, Unplug, VolumeX } from "lucide-react";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { getLang, getT } from "@/lib/i18n-server";
import { dateLocale } from "@/lib/i18n";
import { googleOAuthConfigured } from "@/lib/mail/google";
import { microsoftOAuthConfigured } from "@/lib/mail/microsoft";
import { addressFor, inboundDomain } from "@/lib/inbound-address";
import { prisma } from "@/lib/prisma";
import { ForwardingAddress } from "./ForwardingAddress";
import {
  startGoogleConnect,
  startMicrosoftConnect,
  connectImapAccount,
  disconnectMailAccount,
  removeTrustedSender,
  unmuteThisSender,
} from "./actions";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";
import { FormSection } from "@/components/Form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Connected",
  ERROR: "Needs reconnecting",
  REVOKED: "Revoked",
};

/** ReviewCategory → a readable, translatable label. */
const CATEGORY_LABEL: Record<string, string> = {
  BILL_PAYMENT: "bill payment",
  SUBSCRIPTION_RENEWAL: "subscription renewal",
  APPOINTMENT_EVENT: "appointment / event",
  NEEDS_REPLY: "needs reply",
};

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { user, hub } = await requireHub();
  const [t, lang] = await Promise.all([getT(), getLang()]);

  const [accounts, trustedSenders, mutedSenders] = await withHub(user.id, (tx) =>
    Promise.all([
      tx.mailAccount.findMany({
        where: { hubId: hub.id },
        include: { user: { select: { name: true, email: true } } },
        orderBy: { createdAt: "asc" },
      }),
      tx.trustedSender.findMany({
        where: { hubId: hub.id },
        orderBy: { createdAt: "desc" },
      }),
      tx.mutedSender.findMany({ where: { hubId: hub.id }, orderBy: { createdAt: "desc" } }),
    ]),
  );

  // Show the existing address if one has been minted; ForwardingAddress mints
  // on demand so a hub that never uses forwarding never gets a token.
  const hubRow = inboundDomain()
    ? await prisma.hub.findUnique({ where: { id: hub.id }, select: { inboundToken: true } })
    : null;

  const configured = googleOAuthConfigured();
  const microsoftConfigured = microsoftOAuthConfigured();

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/today", label: t("Today") }}
        title={t("Connected mailboxes")}
        sub={
          <>
            {t(
              "Read-only access — Life Hub never sends, deletes, or modifies anything in a connected inbox. New mail is classified and either filed automatically or sent to your review inbox.",
            )}{" "}
            <Link href="/inbox" className="font-semibold text-[var(--color-primary)]">
              {t("Open the review inbox")}
            </Link>
          </>
        }
      />

      {sp.error && (
        <div
          role="alert"
          className="card flex items-start gap-2 border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-4 text-sm text-[var(--color-danger)]"
        >
          <AlertCircle size={18} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
          {t(sp.error)}
        </div>
      )}
      {sp.connected && (
        <div className="card flex items-start gap-2 border-[var(--color-ok)] bg-[var(--color-ok-wash)] p-4 text-sm text-[var(--color-ok)]">
          <CheckCircle2 size={18} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0" />
          {t("Connected {email}.", { email: sp.connected })}
        </div>
      )}

      <section>
        <SectionHeader title={t("Mailboxes")} />
        <div className="list">
          {accounts.length === 0 ? (
            <p className="p-4 text-center text-sm text-[var(--color-text-dim)]">{t("No mailboxes connected yet.")}</p>
          ) : (
            accounts.map((a) => (
              <div key={a.id} className="row pr-2">
                <span className="icon-tile" aria-hidden>
                  <Mail size={16} strokeWidth={2} />
                </span>
                <div className="row-main">
                  <span className="row-title">{a.emailAddress}</span>
                  <span
                    className="row-sub whitespace-normal"
                    style={a.status === "ERROR" ? { color: "var(--color-danger)" } : undefined}
                  >
                    {STATUS_LABEL[a.status] ? t(STATUS_LABEL[a.status]) : a.status}
                    {" · "}
                    {a.lastSyncedAt
                      ? t("synced {when}", {
                          when: formatDistanceToNow(a.lastSyncedAt, { addSuffix: true, locale: dateLocale(lang) }),
                        })
                      : t("not synced yet")}
                    {a.status === "ERROR" && a.lastError ? ` — ${a.lastError}` : ""}
                  </span>
                  <span className="row-sub">
                    {t("connected by {name}", { name: a.user.name ?? a.user.email ?? "" })}
                  </span>
                </div>
                <form action={disconnectMailAccount.bind(null, a.id)}>
                  <SubmitButton
                    className="btn btn-quiet-danger btn-sm"
                    pendingLabel="…"
                    aria-label={t("Disconnect {email}", { email: a.emailAddress })}
                  >
                    <Unplug size={14} strokeWidth={2} aria-hidden />
                    {t("disconnect")}
                  </SubmitButton>
                </form>
              </div>
            ))
          )}
        </div>
      </section>

      <form action={connectImapAccount}>
        <input type="hidden" name="provider" value="GMAIL_IMAP" />
        <FormSection title={t("Connect Gmail")}>
          <p className="field-hint mt-0">
            {t(
              "Turn on 2-step verification, then create an app password at {path} and paste it below. This avoids Google's sign-in screen entirely, which otherwise makes you reconnect every week.",
              { path: "myaccount.google.com → Security → App passwords" },
            )}
          </p>
          <label className="field-label">
            {t("Gmail address")}
            <input type="email" name="email" placeholder="you@gmail.com" required className="field" />
          </label>
          <label className="field-label">
            {t("App password")}
            <input type="password" name="appPassword" required className="field" />
          </label>
          <SubmitButton className="btn btn-primary w-full" pendingLabel={t("Connecting…")}>
            <Plus size={17} strokeWidth={2.25} aria-hidden />
            {t("Connect Gmail")}
          </SubmitButton>
        </FormSection>
      </form>

      <form action={connectImapAccount}>
        <input type="hidden" name="provider" value="YAHOO" />
        <FormSection title={t("Connect Yahoo Mail")}>
          <p className="field-hint mt-0">
            {t(
              "Yahoo Account Security → External connections → Create app password (needs two-step verification on first).",
            )}
          </p>
          <label className="field-label">
            {t("Yahoo address")}
            <input type="email" name="email" placeholder="you@yahoo.com" required className="field" />
          </label>
          <label className="field-label">
            {t("App password")}
            <input type="password" name="appPassword" required className="field" />
          </label>
          <SubmitButton className="btn btn-primary w-full" pendingLabel={t("Connecting…")}>
            <Plus size={17} strokeWidth={2.25} aria-hidden />
            {t("Connect Yahoo Mail")}
          </SubmitButton>
        </FormSection>
      </form>

      <FormSection title={t("Connect Outlook")}>
        <p className="field-hint mt-0">
          {t(
            "A personal/household Outlook account should connect without issue. A work or school account may be blocked by your employer's own security policy — there's no way to know until you try.",
          )}
        </p>
        <form action={startMicrosoftConnect}>
          <SubmitButton disabled={!microsoftConfigured} className="btn btn-primary w-full" pendingLabel={t("Connecting…")}>
            <Plus size={17} strokeWidth={2.25} aria-hidden />
            {t("Connect Outlook")}
          </SubmitButton>
        </form>

        {/* Gmail-over-OAuth is kept only for mailboxes already connected that way.
            Its refresh tokens expire every 7 days while the Google Cloud client is
            in "Testing", so new connections should use the app-password form above. */}
        <details className="border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-text-dim)]">
          <summary className="cursor-pointer font-semibold text-[var(--color-primary)]">
            {t("Connect Gmail the old way (Google sign-in)")}
          </summary>
          <div className="form-stack mt-3">
            <p>
              {t(
                "Needs you to be on the app's Google test-user list, and stops working about once a week until Google verifies the app — use the app-password form above instead.",
              )}
            </p>
            <form action={startGoogleConnect}>
              <SubmitButton disabled={!configured} className="btn w-full" pendingLabel={t("Connecting…")}>
                {t("Sign in with Google")}
              </SubmitButton>
            </form>
          </div>
        </details>
      </FormSection>

      {inboundDomain() && <ForwardingAddress initial={addressFor(hubRow?.inboundToken ?? null)} />}

      {mutedSenders.length > 0 && (
        <section>
          <SectionHeader title={t("Muted senders")} />
          <p className="mb-2 px-1 text-xs text-[var(--color-text-dim)]">
            {t("Mail from these never reaches the assistant, so it costs nothing and never appears in the review inbox.")}
          </p>
          <div className="list">
            {mutedSenders.map((m) => (
              <div key={m.id} className="row pr-2">
                <span className="icon-tile" aria-hidden>
                  <VolumeX size={16} strokeWidth={2} />
                </span>
                <span className="row-main">
                  <span className="row-title">{m.fromAddress}</span>
                </span>
                <form action={unmuteThisSender.bind(null, m.fromAddress)}>
                  <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                    {t("unmute")}
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {trustedSenders.length > 0 && (
        <section>
          <SectionHeader title={t("Trusted senders")} />
          <div className="list">
            {trustedSenders.map((s) => (
              <div key={s.id} className="row pr-2">
                <span className="icon-tile" aria-hidden>
                  <ShieldCheck size={16} strokeWidth={2} />
                </span>
                <div className="row-main">
                  <span className="row-title">{s.fromAddress}</span>
                  <span className="row-sub">
                    {t("{category} auto-filed, no review", {
                      category: t(s.category ? (CATEGORY_LABEL[s.category] ?? s.category) : "all categories"),
                    })}
                  </span>
                </div>
                <form action={removeTrustedSender.bind(null, s.id)}>
                  <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                    {t("remove")}
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
