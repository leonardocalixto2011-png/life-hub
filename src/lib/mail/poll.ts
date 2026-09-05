import type { MailAccount } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { commitDraftsCore } from "@/lib/commit-drafts";
import { classifyEmail, type ActionableCategory } from "./classify";
import { fetchGoogleBatch } from "./google";
import { fetchYahooBatch } from "./yahoo";
import { isTrusted } from "./trust";
import { RUN_TIME_BUDGET_MS, type MailBatchItem } from "./types";

const MIN_AUTO_FILE_CONFIDENCE = 0.6;
const MIN_AUTO_FILE_CONFIDENCE_UNTRUSTED_EVENT = 0.85; // "high-confidence, low-stakes" per the prompt

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

/**
 * Fetches the batch of messages to process this run — provider-specific
 * (Gmail REST vs Yahoo IMAP), but both return the same provider-neutral
 * shape so the loop below never needs to know which one it's dealing with.
 */
async function fetchBatch(account: MailAccount): Promise<MailBatchItem[]> {
  if (account.provider === "GOOGLE") return fetchGoogleBatch(account);
  if (account.provider === "YAHOO") return fetchYahooBatch(account);
  throw new Error(`Unhandled mail provider: ${account.provider}`);
}

async function pollMailAccount(account: MailAccount, runStartedAt: number): Promise<void> {
  try {
    const batch = await fetchBatch(account);

    for (const item of batch) {
      if (Date.now() - runStartedAt > RUN_TIME_BUDGET_MS) break;

      const { message } = item;
      const fromAddress = extractAddress(message.from);

      // Guards against a rare edge case (a Yahoo UIDVALIDITY reset re-walks
      // its lookback window) reprocessing a message that already landed in
      // the Review Inbox — see yahoo.ts's checkpoint comment. Doesn't catch
      // an already-auto-filed duplicate on that same rare path; accepted.
      const alreadyReviewed = await prisma.reviewItem.findFirst({
        where: { hubId: account.hubId, sourceRef: message.id },
        select: { id: true },
      });

      if (alreadyReviewed) {
        // skip re-processing, but still advance the checkpoint below
      } else {
        const result = await classifyEmail({
          subject: message.subject,
          from: message.from,
          snippet: message.snippet,
          body: message.bodyText,
        });

        // Assistant unavailable or the call failed — still record a bare
        // review item so nothing silently vanishes, rather than skip it.
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
      }

      // Advance per-message, not once at the end — if this run gets cut off
      // by the function timeout partway through the batch, whatever's
      // already committed above stays safely non-duplicated next run.
      await prisma.mailAccount.update({
        where: { id: account.id },
        data: { ...item.checkpoint, status: "ACTIVE", lastError: null },
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

/**
 * Polls accounts strictly sequentially, not in parallel — Yahoo caps IMAP to
 * 5 concurrent connections per source IP (see yahoo.ts). Don't parallelize
 * this loop without accounting for that.
 *
 * RUN_TIME_BUDGET_MS is a budget for the WHOLE run, not per account —
 * with 2+ mail accounts connected, giving each one its own full budget
 * could add up past the external scheduler's own (shorter than Vercel's)
 * request timeout. `runStartedAt` is shared across every account polled
 * this run; an account whose turn comes up after the budget is already
 * spent is skipped entirely (fetchBatch itself takes real time — a real
 * IMAP/REST round trip — so budget is checked before starting it, not
 * just between messages) and picked up on the next scheduled run.
 */
export async function pollAllMailAccounts(): Promise<{ accounts: number; errors: number }> {
  const accounts = await prisma.mailAccount.findMany({ where: { status: { not: "REVOKED" } } });
  const runStartedAt = Date.now();
  let errors = 0;
  let processed = 0;

  for (const account of accounts) {
    if (Date.now() - runStartedAt > RUN_TIME_BUDGET_MS) break;
    await pollMailAccount(account, runStartedAt);
    processed++;
    const fresh = await prisma.mailAccount.findUnique({ where: { id: account.id } });
    if (fresh?.status === "ERROR") errors++;
  }

  return { accounts: processed, errors };
}
