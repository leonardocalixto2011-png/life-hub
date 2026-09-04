import type { Prisma } from "@prisma/client";

import { appPrisma } from "@/lib/prisma";

export type HubTx = Prisma.TransactionClient;

/**
 * Runs `fn` inside a transaction on the low-privilege app connection
 * (appPrisma) with `app.user_id` set for that transaction only —
 * `set_config(..., true)` is transaction-local, which is safe under
 * PgBouncer's transaction-pooling mode (the setting cannot leak onto the next
 * pooled connection because it dies with the transaction). RLS policies
 * (prisma/migrations/*_multihub_rls) reference `current_setting('app.user_id', true)`
 * to decide what each query can see.
 *
 * Every hub-scoped read/write should go through this instead of the raw
 * `prisma`/`appPrisma` client.
 */
export async function withHub<T>(
  userId: string,
  fn: (tx: HubTx) => Promise<T>,
): Promise<T> {
  return appPrisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT set_config('app.user_id', ${userId}, true)`;
      return fn(tx);
    },
    // Generous vs. Prisma's 2s/5s defaults — Next's App Router renders a
    // layout and its page concurrently, so two withHub() calls can briefly
    // compete for a connection. Real Postgres acquires near-instantly
    // regardless; this only matters for the local single-process dev engine.
    { maxWait: 15_000, timeout: 15_000 },
  );
}
