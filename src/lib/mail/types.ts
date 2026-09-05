import type { MailAccount } from "@prisma/client";

/**
 * Vercel's Hobby-plan function ceiling is 60s (this route's `maxDuration`),
 * and the external scheduler (cron-job.org) enforces its own shorter ~30s
 * request timeout. Cap how many messages one run handles per account, and
 * stop early once RUN_TIME_BUDGET_MS is spent — remaining messages just
 * pick up on the next scheduled run (every 15 min).
 */
export const MAX_MESSAGES_PER_RUN = 8;
export const RUN_TIME_BUDGET_MS = 20_000;

/** Provider-neutral shape both `google.ts` and `yahoo.ts` fetch into. */
export type ParsedMessage = {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  bodyText: string;
  internalDate: Date;
};

/** Fields to persist onto `MailAccount` once a message has been processed. */
export type MailCheckpoint = Partial<
  Pick<MailAccount, "lastSyncedAt" | "imapUidValidity" | "imapLastUid">
>;

export type MailBatchItem = { message: ParsedMessage; checkpoint: MailCheckpoint };

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
