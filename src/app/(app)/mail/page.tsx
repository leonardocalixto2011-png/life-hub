import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { AlertCircle, CheckCircle2, Mail, PauseCircle, Plus, ShieldCheck, Unplug, VolumeX } from "lucide-react";

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
  enableMailAi,
  disableMailAi,
} from "./actions";
import { consentIn, mailAiConsenters } from "@/lib/consent";
import { personName } from "@/lib/people";
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";
import { FormSection } from "@/components/Form";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Connected",
  ERROR: "Needs reconnecting",
  REVOKED: "Revoked",
};

/** Shown instead of the address when the mailbox belongs to another member. */
const PROVIDER_LABEL: Record<string, string> = {
  GOOGLE: "Gmail",
  GMAIL_IMAP: "Gmail",
  YAHOO: "Yahoo Mail",
  MICROSOFT: "Outlook",
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

  const [accounts, trustedSenders, mutedSenders, consents] = await withHub(user.id, (tx) =>
    Promise.all([
      tx.mailAccount.findMany({
        where: { hubId: hub.id },
        // Name only — the connecting member's own address is not shown to the hub.
        include: { user: { select: { id: true, name: true } } },
        orderBy: { createdAt: "asc" },
      }),
      tx.trustedSender.findMany({
        where: { hubId: hub.id },
        orderBy: { createdAt: "desc" },
      }),
      tx.mutedSender.findMany({ where: { hubId: hub.id }, orderBy: { createdAt: "desc" } }),
      tx.consent.findMany({
        where: { userId: user.id, revokedAt: null },
        select: { kind: true, hubId: true },
      }),
    ]),
  );

  // AI analysis is off until the person turns it on for this hub (Law 25).
  // Mailboxes connected before that existed are NOT treated as consented:
  // they stay connected, unanalysed, until their owner ticks the box.
  const aiOn = consentIn(consents, "MAIL_AI", hub.id);
  const adult = consentIn(consents, "AGE_18");
  const myAccounts = accounts.filter((a) => a.userId === user.id);
  // A yes/no per connecting member, so a hub-mate's paused mailbox is labelled too.
  const analysed = await mailAiConsenters(hub.id, [...new Set(accounts.map((a) => a.userId))]);

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

      {!aiOn && myAccounts.length > 0 && (
        <div
          role="status"
          className="card flex items-start gap-2 border-[var(--color-danger)] bg-[var(--color-danger-wash)] p-4 text-sm"
        >
          <PauseCircle size={18} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-[var(--color-danger)]" />
          <span>
            <span className="font-semibold">
              {myAccounts.length === 1
                ? t("Your mailbox is connected, but its mail is not being analysed.")
                : t("Your mailboxes are connected, but their mail is not being analysed.")}
            </span>{" "}
            {t("AI analysis now needs your agreement. Until you turn it on below, nothing is read and nothing new reaches the review inbox.")}
          </span>
        </div>
      )}

      <section aria-labelledby="mail-ai-title">
        <h2 id="mail-ai-title" className="section-title">
          {t("AI analysis")}
        </h2>
        {aiOn ? (
          <form action={disableMailAi} className="form-card">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-semibold">{t("On for {hub}", { hub: hub.name })}</div>
                <p className="field-hint mt-0.5">
                  {t("New mail in the mailboxes you connected here, and mail forwarded to this hub, is sent to Anthropic (United States) to suggest tasks, bills and appointments.")}
                </p>
              </div>
              <SubmitButton className="btn btn-secondary btn-sm shrink-0" pendingLabel="…">
                {t("Turn off")}
              </SubmitButton>
            </div>
            <p className="field-hint mt-0">
              {t("Turning it off stops the analysis right away. Your mailboxes stay connected, and you can turn it back on whenever you like.")}
            </p>
          </form>
        ) : (
          <form action={enableMailAi} className="form-card">
            <p className="text-sm">
              {t("Off by default. When it is on, the subject and text of new mail in the mailboxes you connect here — and of mail forwarded to this hub's address — are sent to Anthropic, in the United States, to work out whether it is a bill, a renewal, an appointment or something to answer.")}
            </p>
            <ul className="list-disc space-y-1 pl-5 text-sm text-[var(--color-text-dim)]">
              <li>{t("What it finds goes to this hub's review inbox, which the members of {hub} can see.", { hub: hub.name })}</li>
              <li>{t("Advertising and newsletters are skipped, and never stored.")}</li>
              <li>{t("Nothing is ever sent, deleted or changed in your mailbox.")}</li>
              <li>{t("For adults only: you must be 18 or older.")}</li>
            </ul>
            <label className="check-row items-start">
              <input type="checkbox" name="consent" required className="mt-0.5" />
              <span>{t("Analyse my email with AI (Anthropic, United States) to suggest tasks, bills and appointments")}</span>
            </label>
            {!adult && (
              <label className="check-row items-start">
                <input type="checkbox" name="age18" required className="mt-0.5" />
                <span>{t("I am 18 or older.")}</span>
              </label>
            )}
            <SubmitButton className="btn btn-primary w-full" pendingLabel={t("Saving…")}>
              {t("Turn on AI analysis")}
            </SubmitButton>
            <p className="field-hint mt-0">
              <Link href="/confidentialite" className="underline">
                {t("Privacy policy")}
              </Link>
            </p>
          </form>
        )}
      </section>

      <section>
        <SectionHeader title={t("Mailboxes")} />
        <div className="list">
          {accounts.length === 0 ? (
            <p className="p-4 text-center text-sm text-[var(--color-text-dim)]">{t("No mailboxes connected yet.")}</p>
          ) : (
            accounts.map((a) => {
              // A mailbox address is its owner's email address: other members
              // see which service is connected and by whom, not the address.
              const label =
                a.userId === user.id ? a.emailAddress : (PROVIDER_LABEL[a.provider] ?? t("Mailbox"));
              return (
              <div key={a.id} className="row pr-2">
                <span className="icon-tile" aria-hidden>
                  <Mail size={16} strokeWidth={2} />
                </span>
                <div className="row-main">
                  <span className="row-title">{label}</span>
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
                  <span className="row-sub whitespace-normal">
                    {a.user.id === user.id
                      ? t("connected by you")
                      : t("connected by {name}", { name: personName(a.user, t("Member")) })}
                    {!analysed.has(a.userId) ? ` · ${t("analysis paused")}` : ""}
                  </span>
                </div>
                <form action={disconnectMailAccount.bind(null, a.id)}>
                  <SubmitButton
                    className="btn btn-quiet-danger btn-sm"
                    pendingLabel="…"
                    aria-label={t("Disconnect {email}", { email: label })}
                  >
                    <Unplug size={14} strokeWidth={2} aria-hidden />
                    {t("disconnect")}
                  </SubmitButton>
                </form>
              </div>
              );
            })
          )}
        </div>
      </section>

      {!aiOn && (
        <p className="card p-4 text-center text-sm text-[var(--color-text-dim)]">
          {t("Turn on AI analysis above to connect a mailbox or get this hub's forwarding address.")}
        </p>
      )}

      {aiOn && (
      <>
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
      </>
      )}

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
