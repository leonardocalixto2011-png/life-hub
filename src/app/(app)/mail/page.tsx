import Link from "next/link";
import { formatDistanceToNow } from "date-fns";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { googleOAuthConfigured } from "@/lib/mail/google";
import { microsoftOAuthConfigured } from "@/lib/mail/microsoft";
import {
  startGoogleConnect,
  startMicrosoftConnect,
  connectYahooAccount,
  disconnectMailAccount,
  removeTrustedSender,
} from "./actions";

export const dynamic = "force-dynamic";

const STATUS_LABEL: Record<string, string> = {
  ACTIVE: "Connected",
  ERROR: "Needs reconnecting",
  REVOKED: "Revoked",
};

export default async function MailPage({
  searchParams,
}: {
  searchParams: Promise<{ connected?: string; error?: string }>;
}) {
  const sp = await searchParams;
  const { user, hub } = await requireHub();

  const [accounts, trustedSenders] = await withHub(user.id, (tx) =>
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
    ]),
  );

  const configured = googleOAuthConfigured();
  const microsoftConfigured = microsoftOAuthConfigured();

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← Today
        </Link>
        <h1 className="mt-1 text-lg font-bold">Connected mailboxes</h1>
        <p className="text-xs text-[var(--color-text-dim)]">
          Read-only access — Life Hub never sends, deletes, or modifies anything in a
          connected inbox. New mail is classified and either filed automatically or sent
          to your <Link href="/inbox" className="underline">review inbox</Link>.
        </p>
      </div>

      {sp.error && (
        <div className="card border-[var(--color-danger)] p-3 text-xs text-[var(--color-danger)]">
          {sp.error}
        </div>
      )}
      {sp.connected && (
        <div className="card border-[var(--color-ok)] p-3 text-xs text-[var(--color-ok)]">
          Connected {sp.connected}.
        </div>
      )}

      {!configured && (
        <div className="card border-[var(--color-danger)] p-4 text-xs text-[var(--color-danger)]">
          Google OAuth isn't configured on the server yet (no
          GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET). Ask an admin to set it up.
        </div>
      )}

      <div className="card divide-y divide-[var(--color-border)] p-0">
        {accounts.length === 0 ? (
          <p className="p-4 text-center text-sm text-[var(--color-text-dim)]">
            No mailboxes connected yet.
          </p>
        ) : (
          accounts.map((a) => (
            <div key={a.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">{a.emailAddress}</div>
                <div className="text-[0.68rem] text-[var(--color-text-dim)]">
                  {STATUS_LABEL[a.status] ?? a.status}
                  {a.lastSyncedAt
                    ? ` · synced ${formatDistanceToNow(a.lastSyncedAt, { addSuffix: true })}`
                    : " · not synced yet"}
                  {a.status === "ERROR" && a.lastError ? ` — ${a.lastError}` : ""}
                </div>
                <div className="text-[0.65rem] text-[var(--color-text-dim)]">
                  connected by {a.user.name ?? a.user.email}
                </div>
              </div>
              <form action={disconnectMailAccount.bind(null, a.id)}>
                <button
                  type="submit"
                  className="shrink-0 text-[0.68rem] font-semibold text-[var(--color-danger)] underline"
                >
                  disconnect
                </button>
              </form>
            </div>
          ))
        )}
      </div>

      <form action={startGoogleConnect}>
        <button type="submit" disabled={!configured} className="btn btn-primary w-full">
          + Connect Gmail
        </button>
      </form>

      <div className="space-y-1.5">
        <form action={startMicrosoftConnect}>
          <button
            type="submit"
            disabled={!microsoftConfigured}
            className="btn btn-primary w-full"
          >
            + Connect Outlook
          </button>
        </form>
        <p className="text-[0.65rem] text-[var(--color-text-dim)]">
          A personal/household Outlook account should connect without issue. A
          work or school account may be blocked by your employer&apos;s own
          security policy — there&apos;s no way to know until you try.
        </p>
      </div>

      <form action={connectYahooAccount} className="card space-y-2 p-3">
        <div className="text-xs font-semibold">Connect Yahoo Mail</div>
        <p className="text-[0.68rem] text-[var(--color-text-dim)]">
          Yahoo doesn&apos;t support one-tap sign-in for this — generate an app
          password (Yahoo Account Security → External connections → Create app
          password; requires two-step verification turned on first) and paste it
          below.
        </p>
        <input
          type="email"
          name="email"
          placeholder="you@yahoo.com"
          required
          className="field w-full"
        />
        <input
          type="password"
          name="appPassword"
          placeholder="App password"
          required
          className="field w-full"
        />
        <button type="submit" className="btn btn-primary w-full">
          + Connect Yahoo
        </button>
      </form>

      {trustedSenders.length > 0 && (
        <section>
          <h2 className="mb-1.5 text-xs font-bold uppercase tracking-wide text-[var(--color-text-dim)]">
            Trusted senders
          </h2>
          <div className="card divide-y divide-[var(--color-border)]">
            {trustedSenders.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm">{s.fromAddress}</div>
                  <div className="text-[0.65rem] text-[var(--color-text-dim)]">
                    {s.category ? s.category.replaceAll("_", " ").toLowerCase() : "all categories"}{" "}
                    auto-filed, no review
                  </div>
                </div>
                <form action={removeTrustedSender.bind(null, s.id)}>
                  <button
                    type="submit"
                    className="shrink-0 text-[0.68rem] font-semibold text-[var(--color-text-dim)] underline"
                  >
                    remove
                  </button>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
