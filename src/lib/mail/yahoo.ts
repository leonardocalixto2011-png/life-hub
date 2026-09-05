import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import type { MailAccount } from "@prisma/client";

import { decrypt } from "./crypto";
import { MAX_MESSAGES_PER_RUN, stripHtml, type MailBatchItem, type ParsedMessage } from "./types";

/**
 * Yahoo Mail — plain IMAP with an app-specific password (see mail/actions.ts
 * for why: Yahoo has no self-serve OAuth2+IMAP access for third parties,
 * only a formal commercial-access application). No SDK — `imapflow` is the
 * one exception to this project's fetch-only style, since hand-rolling the
 * IMAP protocol (unlike a REST API) is impractical. Read-only: every mailbox
 * lock below is opened `readOnly: true` and fetches use `source: true`
 * (peek semantics — never marks messages `\Seen`).
 */

function client(email: string, appPassword: string): ImapFlow {
  return new ImapFlow({
    host: "imap.mail.yahoo.com",
    port: 993,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
    connectionTimeout: 10_000,
    greetingTimeout: 5_000,
    socketTimeout: 20_000,
  });
}

/** Verifies credentials work before saving them — see connectYahooAccount. */
export async function testYahooLogin(email: string, appPassword: string): Promise<void> {
  const c = client(email, appPassword);
  await c.connect();
  try {
    const lock = await c.getMailboxLock("INBOX", { readOnly: true });
    lock.release();
  } finally {
    await c.logout();
  }
}

/**
 * Yahoo caps IMAP to 5 concurrent connections per source IP. A non-issue
 * today since lib/mail/poll.ts polls accounts sequentially — don't
 * parallelize that loop without accounting for this.
 */
export async function fetchYahooBatch(account: MailAccount): Promise<MailBatchItem[]> {
  const appPassword = decrypt(account.appPasswordEnc!);
  const c = client(account.emailAddress, appPassword);
  await c.connect();
  try {
    const lock = await c.getMailboxLock("INBOX", { readOnly: true });
    try {
      const status = await c.status("INBOX", { uidValidity: true });
      const uidValidityChanged =
        account.imapUidValidity != null && Number(status.uidValidity) !== account.imapUidValidity;

      // UIDVALIDITY is guaranteed non-decreasing per RFC 3501, so UID order
      // is a safe proxy for "order added to INBOX" — same guarantee Gmail's
      // internalDate gives us, with one narrow caveat: a message moved into
      // INBOX from another folder gets a new UID at move-time, not
      // original-send-time. Accepted given this app's actual use.
      const uids = (
        account.imapLastUid != null && !uidValidityChanged
          ? await c.search({ uid: `${account.imapLastUid + 1}:*` }, { uid: true })
          : await c.search({ since: new Date(Date.now() - 24 * 3600 * 1000) }, { uid: true })
      ) as number[];
      uids.sort((a, b) => a - b);
      const uidsToFetch = uids.slice(0, MAX_MESSAGES_PER_RUN);

      const items: MailBatchItem[] = [];
      for await (const msg of c.fetch(uidsToFetch, { source: true, internalDate: true }, { uid: true })) {
        const parsed = await simpleParser(msg.source!);
        const bodyText = (parsed.text ?? stripHtml(parsed.html || "")).slice(0, 4000);
        const message: ParsedMessage = {
          // Message-ID (not the raw UID) is the stable, mailbox-independent
          // id used as ReviewItem.sourceRef — see poll.ts's dedup check,
          // which guards against a rare UIDVALIDITY-reset reprocessing the
          // same message under a fresh UID.
          id: parsed.messageId ?? `yahoo:${status.uidValidity}:${msg.uid}`,
          from: parsed.from?.text ?? "",
          subject: parsed.subject ?? "",
          // No server-side snippet over IMAP (unlike Gmail's API) — synthesize one.
          snippet: bodyText.replace(/\s+/g, " ").trim().slice(0, 200),
          bodyText,
          internalDate: msg.internalDate ? new Date(msg.internalDate) : new Date(),
        };
        items.push({
          message,
          checkpoint: {
            lastSyncedAt: message.internalDate,
            imapUidValidity: Number(status.uidValidity),
            imapLastUid: msg.uid,
          },
        });
      }
      return items;
    } finally {
      lock.release();
    }
  } finally {
    await c.logout();
  }
}
