import type { PrismaClient } from "@prisma/client";

import type { ActionableCategory } from "./classify";

/** Reads happen from the no-session poller (owner `prisma` client) and the
 * writes happen from a real request (a `withHub` tx) — both satisfy this. */
type DbLike = Pick<PrismaClient, "trustedSender" | "reviewItem">;

const TRUST_THRESHOLD = 3;

export async function isTrusted(
  db: DbLike,
  hubId: string,
  fromAddress: string,
  category: ActionableCategory,
): Promise<boolean> {
  const count = await db.trustedSender.count({
    where: { hubId, fromAddress, OR: [{ category }, { category: null }] },
  });
  return count > 0;
}

/**
 * Whether this hub should be offered a "always trust this sender" prompt —
 * called after an accept succeeds (src/app/(app)/inbox/actions.ts), not from
 * the poller. Requires TRUST_THRESHOLD prior ACCEPTED items from the same
 * sender/category in this hub, and that they aren't already trusted.
 */
export async function shouldOfferTrust(
  db: DbLike,
  hubId: string,
  fromAddress: string,
  category: ActionableCategory,
): Promise<boolean> {
  if (await isTrusted(db, hubId, fromAddress, category)) return false;
  const acceptedCount = await db.reviewItem.count({
    where: { hubId, fromAddress, category, status: "ACCEPTED" },
  });
  return acceptedCount >= TRUST_THRESHOLD;
}

/**
 * `category: null` trusts every category from this sender, not just the one
 * offered. Uses findFirst + create rather than upsert-by-compound-unique:
 * Prisma doesn't generate a null-accepting WhereUniqueInput for a nullable
 * column in a compound @@unique (Postgres itself treats NULL as distinct in
 * unique constraints), so the generated unique lookup type can't express
 * `category: null` at all.
 */
export async function trustSender(
  db: DbLike,
  hubId: string,
  fromAddress: string,
  category: ActionableCategory | null,
) {
  const existing = await db.trustedSender.findFirst({ where: { hubId, fromAddress, category } });
  if (existing) return;
  await db.trustedSender.create({ data: { hubId, fromAddress, category } });
}
