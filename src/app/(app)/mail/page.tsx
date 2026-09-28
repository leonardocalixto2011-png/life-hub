import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

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
  const fieldLabel = "block text-[0.68rem] font-semibold text-[var(--color-text-dim)]";

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← {t("Today")}
        </Link>
        <h1 className="mt-1 text-lg font-bold">{t("Connected mailboxes")}</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          {t(
            "Read-only access — Life Hub never sends, deletes, or modifies anything in a connected inbox. New mail is classified and either filed automatically or sent to your review inbox.",
          )}{" "}
          <Link href="/inbox" className="underline">
            {t("Open the review inbox")}
          </Link>
        </p>
      </div>

      {sp.error && (
        <div role="alert" className="card border-[var(--color-danger)] p-3 text-xs text-[var(--color-danger)]">
          {t(sp.error)}
        </div>
      )}
      {sp.connected && (
        <div className="card border-[var(--color-ok)] p-3 text-xs text-[var(--color-ok)]">
          {t("Connected {email}.", { email: sp.connected })}
        </div>
      )}

      <div className="card divide-y divide-[var(--color-border)] p-0">
        {accounts.length === 0 ? (
          <p className="p-4 text-center text-sm text-[var(--color-text-dim)]">{t("No mailboxes connected yet.")}</p>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{a.emailAddress}</div>
                <div className="text-[0.68rem] text-[var(--color-text-dim)]">
                  {STATUS_LABEL[a.status] ? t(STATUS_LABEL[a.status]) : a.status}
                  {" · "}
                  {a.lastSyncedAt
                    ? t("synced {when}", {
                        when: formatDistanceToNow(a.lastSyncedAt, { addSuffix: true, locale: dateLocale(lang) }),
                      })
                    : t("not synced yet")}
                  {a.status === "ERROR" && a.lastError ? ` — ${a.lastError}` : ""}
                </div>
                <div className="text-[0.65rem] text-[var(--color-text-dim)]">
                  {t("connected by {name}", { name: a.user.name ?? a.user.email ?? "" })}
                </div>
              </div>
              <form action={disconnectMailAccount.bind(null, a.id)}>
                <SubmitButton
                  className="shrink-0 text-[0.68rem] font-semibold text-[var(--color-danger)] underline"
                  pendingLabel="…"
                  aria-label={t("Disconnect {email}", { email: a.emailAddress })}
                >
                  {t("disconnect")}
                </SubmitButton>
              </form>
            </div>
          ))
        )}
      </div>

      {inboundDomain() && <ForwardingAddress initial={addressFor(hubRow?.inboundToken ?? null)} />}

      <form action={connectImapAccount} className="card space-y-2 p-3">
        <input type="hidden" name="provider" value="GMAIL_IMAP" />
        <div className="text-xs font-semibold">{t("Connect Gmail")}</div>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          {t(
            "Turn on 2-step verification, then create an app password at {path} and paste it below. This avoids Google's sign-in screen entirely, which otherwise makes you reconnect every week.",
            { path: "myaccount.google.com → Security → App passwords" },
          )}
        </p>
        <label className={fieldLabel}>
          {t("Gmail address")}
          <input type="email" name="email" placeholder="you@gmail.com" required className="field mt-1 w-full" />
        </label>
        <label className={fieldLabel}>
          {t("App password")}
          <input type="password" name="appPassword" required className="field mt-1 w-full" />
        </label>
        <SubmitButton className="btn btn-primary w-full" pendingLabel={t("Connecting…")}>
          {t("+ Connect Gmail")}
        </SubmitButton>
      </form>

      <form action={connectImapAccount} className="card space-y-2 p-3">
        <input type="hidden" name="provider" value="YAHOO" />
        <div className="text-xs font-semibold">{t("Connect Yahoo Mail")}</div>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          {t(
            "Yahoo Account Security → External connections → Create app password (needs two-step verification on first).",
          )}
        </p>
        <label className={fieldLabel}>
          {t("Yahoo address")}
          <input type="email" name="email" placeholder="you@yahoo.com" required className="field mt-1 w-full" />
        </label>
        <label className={fieldLabel}>
          {t("App password")}
          <input type="password" name="appPassword" required className="field mt-1 w-full" />
        </label>
        <SubmitButton className="btn btn-primary w-full" pendingLabel={t("Connecting…")}>
          {t("+ Connect Yahoo")}
        </SubmitButton>
      </form>

      <div className="space-y-1.5">
        <form action={startMicrosoftConnect}>
          <SubmitButton disabled={!microsoftConfigured} className="btn btn-primary w-full" pendingLabel={t("Connecting…")}>
            {t("+ Connect Outlook")}
          </SubmitButton>
        </form>
        <p className="text-[0.65rem] text-[var(--color-text-dim)]">
          {t(
            "A personal/household Outlook account should connect without issue. A work or school account may be blocked by your employer's own security policy — there's no way to know until you try.",
          )}
        </p>
      </div>

      {/* Gmail-over-OAuth is kept only for mailboxes already connected that way.
          Its refresh tokens expire every 7 days while the Google Cloud client is
          in "Testing", so new connections should use the app-password form above. */}
      <details className="text-[0.68rem] text-[var(--color-text-dim)]">
        <summary className="cursor-pointer font-semibold text-[var(--color-primary)]">
          {t("Connect Gmail the old way (Google sign-in)")}
        </summary>
        <div className="mt-2 space-y-1.5">
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

      {mutedSenders.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {t("Muted senders")}
          </h2>
          <p className="mb-1.5 text-[0.65rem] text-[var(--color-text-dim)]">
            {t("Mail from these never reaches the assistant, so it costs nothing and never appears in the review inbox.")}
          </p>
          <div className="card divide-y divide-[var(--color-border)]">
            {mutedSenders.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <span className="truncate text-sm">{m.fromAddress}</span>
                <form action={unmuteThisSender.bind(null, m.fromAddress)}>
                  <SubmitButton
                    className="shrink-0 text-[0.68rem] font-semibold text-[var(--color-text-dim)] underline"
                    pendingLabel="…"
                  >
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
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            {t("Trusted senders")}
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {trustedSenders.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm">{s.fromAddress}</div>
                  <div className="text-[0.65rem] text-[var(--color-text-dim)]">
                    {t("{category} auto-filed, no review", {
                      category: t(s.category ? (CATEGORY_LABEL[s.category] ?? s.category) : "all categories"),
                    })}
                  </div>
                </div>
                <form action={removeTrustedSender.bind(null, s.id)}>
                  <SubmitButton
                    className="shrink-0 text-[0.68rem] font-semibold text-[var(--color-text-dim)] underline"
                    pendingLabel="…"
                  >
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
