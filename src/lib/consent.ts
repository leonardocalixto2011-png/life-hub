import type { ConsentKind, Prisma, PrismaClient } from "@prisma/client";

import { POLICY_VERSION } from "@/content/legal/version";
import { withHub } from "@/lib/hub-context";
import { prisma } from "@/lib/prisma";

/**
 * The consent ledger (Québec Law 25). One `Consent` row per consent given;
 * revoking stamps `revokedAt` instead of deleting, so what was agreed to,
 * when, and under which policy version stays on record. A consent is active
 * while `revokedAt` is null.
 *
 * Two families of helpers:
 *
 *   - The person's own consents (`hasConsent`, `grantConsent`, `revokeConsent`,
 *     `myActiveConsents`) run through `withHub`, i.e. as the low-privilege
 *     role under the `consent_self_only` policy. They also filter on `userId`
 *     in app code — the standing defence-in-depth rule in this project.
 *
 *   - Session-less jobs that need to know whether SOMEONE ELSE consented (the
 *     mail poller, /api/inbound, the "analysis paused" label on a hub-mate's
 *     mailbox) use the trusted client and return booleans / id sets only —
 *     never a ledger row.
 */

type Db = PrismaClient | Prisma.TransactionClient;

/** Hub-scoped kinds must name the hub; account-wide ones must not. */
const HUB_SCOPED: ReadonlySet<ConsentKind> = new Set<ConsentKind>(["DEBT_SHARE", "MAIL_AI"]);

function scope(kind: ConsentKind, hubId?: string | null): string | null {
  if (HUB_SCOPED.has(kind)) {
    if (!hubId) throw new Error(`${kind} consent needs a hub.`);
    return hubId;
  }
  return null;
}

export type ActiveConsent = { kind: ConsentKind; hubId: string | null };

/** Whether `list` (from `myActiveConsents`) contains this consent. */
export function consentIn(list: ActiveConsent[], kind: ConsentKind, hubId?: string | null): boolean {
  const h = HUB_SCOPED.has(kind) ? (hubId ?? null) : null;
  return list.some((c) => c.kind === kind && c.hubId === h);
}

/** The check, inside a transaction (or on a client) the caller already holds. */
export async function hasConsentIn(
  db: Db,
  userId: string,
  kind: ConsentKind,
  hubId?: string | null,
): Promise<boolean> {
  const row = await db.consent.findFirst({
    where: { userId, kind, hubId: scope(kind, hubId), revokedAt: null },
    select: { id: true },
  });
  return row !== null;
}

export function hasConsent(userId: string, kind: ConsentKind, hubId?: string | null): Promise<boolean> {
  return withHub(userId, (tx) => hasConsentIn(tx, userId, kind, hubId));
}

/** Every consent the person has in force — one query for a page that checks several. */
export function myActiveConsents(userId: string): Promise<ActiveConsent[]> {
  return withHub(userId, (tx) =>
    tx.consent.findMany({ where: { userId, revokedAt: null }, select: { kind: true, hubId: true } }),
  );
}

/**
 * Records a consent. Idempotent by default: an active row is left alone, so
 * its original date stands. `fresh` closes the active row and writes a new
 * one — for consents that must be given again each time the thing consented
 * to widens (sharing debts with a hub at a higher level).
 */
export async function grantConsentIn(
  db: Db,
  userId: string,
  kind: ConsentKind,
  hubId?: string | null,
  opts: { fresh?: boolean } = {},
): Promise<void> {
  const h = scope(kind, hubId);
  // A double tap runs two of these at once: both would see no active row and
  // both insert. Serialise per (user, kind, hub) for the rest of the
  // transaction; every caller passes a withHub transaction.
  await db.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`consent:${userId}:${kind}:${h ?? ""}`}))`;
  if (opts.fresh) {
    await db.consent.updateMany({
      where: { userId, kind, hubId: h, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  } else if (await hasConsentIn(db, userId, kind, h)) {
    return;
  }
  await db.consent.create({ data: { userId, kind, hubId: h, policyVersion: POLICY_VERSION } });
}

export function grantConsent(
  userId: string,
  kind: ConsentKind,
  hubId?: string | null,
  opts: { fresh?: boolean } = {},
): Promise<void> {
  return withHub(userId, (tx) => grantConsentIn(tx, userId, kind, hubId, opts));
}

export async function revokeConsentIn(
  db: Db,
  userId: string,
  kind: ConsentKind,
  hubId?: string | null,
): Promise<void> {
  await db.consent.updateMany({
    where: { userId, kind, hubId: scope(kind, hubId), revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

export function revokeConsent(userId: string, kind: ConsentKind, hubId?: string | null): Promise<void> {
  return withHub(userId, (tx) => revokeConsentIn(tx, userId, kind, hubId));
}

// ---------------------------------------------------------------------------
// Trusted lookups — about other people, for jobs with no session. Booleans
// and id sets only.
// ---------------------------------------------------------------------------

/** Which of `userIds` have AI mail analysis switched on for `hubId`. */
export async function mailAiConsenters(hubId: string, userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const rows = await prisma.consent.findMany({
    where: { kind: "MAIL_AI", hubId, revokedAt: null, userId: { in: userIds } },
    select: { userId: true },
  });
  return new Set(rows.map((r) => r.userId));
}

/** "userId:hubId" for every active MAIL_AI consent — one query for a whole poll run. */
export async function allMailAiConsentKeys(): Promise<Set<string>> {
  const rows = await prisma.consent.findMany({
    where: { kind: "MAIL_AI", revokedAt: null, hubId: { not: null } },
    select: { userId: true, hubId: true },
  });
  return new Set(rows.map((r) => `${r.userId}:${r.hubId}`));
}

/**
 * Whether forwarded mail arriving for `hubId` may be sent to the AI: at least
 * one ACTIVE member of that hub has switched analysis on for it. A consent
 * left behind by someone who is no longer a member does not count.
 */
export async function hubHasMailAiConsent(hubId: string): Promise<boolean> {
  const row = await prisma.consent.findFirst({
    where: {
      kind: "MAIL_AI",
      hubId,
      revokedAt: null,
      user: { hubMemberships: { some: { hubId, status: "ACTIVE" } } },
    },
    select: { id: true },
  });
  return row !== null;
}

/**
 * A `Debt.owner` filter: owners who currently consent to keeping debts. Every
 * aggregate that reads debts outside /debts (Today, Budget, Agenda, digests,
 * timely pushes, shared summaries) adds it, so withdrawing consent stops the
 * processing everywhere, not only on the Debts page.
 */
export const DEBT_CONSENTED = {
  consents: { some: { kind: "DEBTS_SENSITIVE", revokedAt: null } },
} satisfies Prisma.UserWhereInput;
