import type { MailAccount } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { commitDraftsCore } from "@/lib/commit-drafts";
import { classifyEmail, type ActionableCategory } from "./classify";
import { getValidAccessToken, getMessage, listRecentMessageIds } from "./google";
import { isTrusted } from "./trust";

const DEFAULT_LOOKBACK_MS = 24 * 3600 * 1000; // first-ever poll of a mailbox
const MIN_AUTO_FILE_CONFIDENCE = 0.6;
const MIN_AUTO_FILE_CONFIDENCE_UNTRUSTED_EVENT = 0.85; // "high-confidence, low-stakes" per the prompt

/**
 * Vercel's Hobby-plan function ceiling is 60s (this route's `maxDuration`).
 * Classifying each message is a sequential Claude call plus a Gmail fetch —
 * fine for a handful of messages, but a real backlog (e.g. the very first
 * poll of a busy inbox) can blow past 60s if processed all at once. Cap how
 * many messages one run handles per account; the rest get picked up on the
 * next scheduled run (every 15-30 min via the external scheduler).
 */
const MAX_MESSAGES_PER_RUN = 8;

/**
 * Money categories only auto-file for an already-trusted sender — "anything
 * involving money with an unclear or first-seen amount... goes to review"
 * (prompt §3). Events can auto-file for a first-seen sender too, but only at
 * a high confidence bar, since there's nothing financial at stake. Replies
 * always go to review — silently auto-filing a "needs a reply" email would
 * defeat the entire point of surfacing it.
 */
function shouldAutoFile(category: ActionableCategory, confidence: number, trusted: boolean): boolean {
  if (category === "NEEDS_REPLY") return false;
  if (trusted) return confidence >= MIN_AUTO_FILE_CONFIDENCE;
  if (category === "APPOINTMENT_EVENT") return confidence >= MIN_AUTO_FILE_CONFIDENCE_UNTRUSTED_EVENT;
  return false;
}

function extractAddress(from: string): string {
  const match = from.match(/<([^>]+)>/);
  return (match ? match[1] : from).trim().toLowerCase();
}

async function pollMailAccount(account: MailAccount): Promise<void> {
  try {
    const accessToken = await getValidAccessToken(account);
    const after = account.lastSyncedAt ?? new Date(Date.now() - DEFAULT_LOOKBACK_MS);
    const ids = await listRecentMessageIds(accessToken, after);

    const messages = [];
    for (const id of ids) {
      messages.push(await getMessage(accessToken, id));
    }
    // Oldest first: lastSyncedAt only ever advances to what's actually been
    // processed (updated after each message below), so if this run gets cut
    // off partway, nothing already-handled gets reprocessed next time and
    // nothing in between gets silently skipped — the backlog just drains a
    // bit at a time across successive runs instead of all at once.
    messages.sort((a, b) => a.internalDate.getTime() - b.internalDate.getTime());
    const batch = messages.slice(0, MAX_MESSAGES_PER_RUN);

    for (const message of batch) {
      const fromAddress = extractAddress(message.from);
      const result = await classifyEmail({
        subject: message.subject,
        from: message.from,
        snippet: message.snippet,
        body: message.bodyText,
      });

      // Assistant unavailable or the call failed — still record a bare review
      // item so nothing silently vanishes, rather than skip the message.
      if (!result) {
        await prisma.reviewItem.create({
          data: {
            source: "mail-connector",
            sourceRef: message.id,
            sourceSnippet: message.snippet.slice(0, 500),
            fromAddress,
            hubId: account.hubId,
            note: `From ${account.emailAddress} — couldn't classify (assistant unavailable).`,
            draft: {
              kind: "task",
              title: message.subject || "(no subject)",
              date: null,
              time: null,
              amount: null,
              entryType: "EXPENSE",
              billingCycle: "MONTHLY",
              priority: "MED",
              ventureId: null,
              note: message.snippet.slice(0, 500),
              visibility: "SHARED",
              suggestedReply: null,
            },
          },
        });
      } else if (result.category === "INFORMATIONAL" || result.category === "PROMOTIONAL" || !result.draft) {
        // discarded by design — see plan
      } else {
        const trusted = await isTrusted(prisma, account.hubId, fromAddress, result.category);

        if (shouldAutoFile(result.category, result.confidence, trusted)) {
          await prisma.$transaction((tx) =>
            commitDraftsCore(tx, account.hubId, account.userId, [result.draft!]),
          );
        } else {
          await prisma.reviewItem.create({
            data: {
              source: "mail-connector",
              sourceRef: message.id,
              sourceSnippet: message.snippet.slice(0, 500),
              fromAddress,
              hubId: account.hubId,
              category: result.category,
              draft: result.draft,
            },
          });
        }
      }

      // Advance per-message, not once at the end — if this run gets cut off
      // by the function timeout partway through the batch, whatever's
      // already committed above stays safely non-duplicated next run.
      await prisma.mailAccount.update({
        where: { id: account.id },
        data: { lastSyncedAt: message.internalDate, status: "ACTIVE", lastError: null },
      });
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    await prisma.mailAccount.update({
      where: { id: account.id },
      data: { status: "ERROR", lastError: message.slice(0, 500) },
    });
  }
}

export async function pollAllMailAccounts(): Promise<{ accounts: number; errors: number }> {
  const accounts = await prisma.mailAccount.findMany({ where: { status: { not: "REVOKED" } } });
  let errors = 0;

  for (const account of accounts) {
    await pollMailAccount(account);
    const fresh = await prisma.mailAccount.findUnique({ where: { id: account.id } });
    if (fresh?.status === "ERROR") errors++;
  }

  return { accounts: accounts.length, errors };
}
