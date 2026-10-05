import { createHash, randomBytes } from "node:crypto";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";

/**
 * Invitations to the app itself — the way a new person gets an account while
 * public signup is closed. Distinct from a hub invite (an INVITED membership):
 * an app invite lets someone create their own account and set it up as they
 * like; joining anyone's hub stays a separate yes.
 *
 * Two kinds, one table:
 *   - by email: bound to that address from the start;
 *   - by link: bound to whichever address the person enters when they open it
 *     (`claimedEmail`), so a link sent over text messages still ends up tied
 *     to one inbox before any account exists.
 *
 * Either way the account is created only when the person clicks the sign-in
 * link that reached that address (src/lib/signup.ts) — the invite never
 * creates an account by itself, and an address nobody can read gets nothing.
 *
 * Only a SHA-256 of the token is stored. The token is 24 random bytes, so a
 * hash without a salt is enough: there is nothing to guess.
 *
 * Every function here runs on the owner-role client. The table has RLS on and
 * no grant for the app role (migration 20261005120000), so the checks below
 * are the only gate: callers must already have run requireUser().
 */

export const INVITE_TTL_DAYS = 14;

/** Default invitations per person per 30 days; an app ADMIN has no limit. */
const DEFAULT_PER_MONTH = 10;

export function invitesPerMonth(): number {
  const n = Number(process.env.APP_INVITES_PER_MONTH);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_PER_MONTH;
}

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function newToken(): { token: string; tokenHash: string } {
  const token = randomBytes(24).toString("base64url");
  return { token, tokenHash: hashToken(token) };
}

/** Tokens are base64url, 32 characters. Anything else is not worth a query. */
export function looksLikeToken(value: string): boolean {
  return /^[A-Za-z0-9_-]{32}$/.test(value);
}

export function appUrl(): string {
  return (process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
}

export function inviteUrl(token: string): string {
  return `${appUrl()}/invite/${token}`;
}

/** Valid = not used, not revoked, not expired. */
function validWhere(now = new Date()): Prisma.AppInviteWhereInput {
  return { usedAt: null, revokedAt: null, expiresAt: { gt: now } };
}

/**
 * How many invitations someone has left this 30-day window. `limit: null`
 * means unlimited (the app ADMIN, who admitted everyone by hand before this).
 * Revoked invites still count: revoking and re-sending must not be a way
 * around the limit.
 */
export async function inviteQuota(userId: string, role: "ADMIN" | "MEMBER") {
  if (role === "ADMIN") return { used: 0, limit: null as number | null, left: Infinity };
  const since = new Date(Date.now() - 30 * 864e5);
  const used = await prisma.appInvite.count({ where: { createdById: userId, createdAt: { gte: since } } });
  const limit = invitesPerMonth();
  return { used, limit: limit as number | null, left: Math.max(0, limit - used) };
}

export class InviteLimitError extends Error {}

/**
 * Creates an invitation and returns the one copy of its token. The caller
 * puts the token in an email or shows it as a link, and nowhere else.
 */
export async function createAppInvite(opts: {
  createdById: string;
  role: "ADMIN" | "MEMBER";
  email?: string | null;
  hubId?: string | null;
}) {
  const quota = await inviteQuota(opts.createdById, opts.role);
  if (quota.left <= 0) {
    throw new InviteLimitError("You've used all your invitations for this month.");
  }
  const { token, tokenHash } = newToken();
  const email = opts.email?.trim().toLowerCase() || null;

  // One live email invite per address and inviter: sending again replaces the
  // old link rather than leaving two that both work.
  if (email) {
    await prisma.appInvite.updateMany({
      where: { createdById: opts.createdById, email, ...validWhere() },
      data: { revokedAt: new Date() },
    });
  }

  const invite = await prisma.appInvite.create({
    data: {
      tokenHash,
      createdById: opts.createdById,
      email,
      hubId: opts.hubId ?? null,
      expiresAt: new Date(Date.now() + INVITE_TTL_DAYS * 864e5),
    },
  });
  return { token, invite };
}

/** A usable invitation for this token, with who sent it — or null. */
export async function findInviteByToken(token: string) {
  if (!looksLikeToken(token)) return null;
  return prisma.appInvite.findFirst({
    where: { tokenHash: hashToken(token), ...validWhere() },
    select: {
      id: true,
      email: true,
      claimedEmail: true,
      hubId: true,
      expiresAt: true,
      createdBy: { select: { name: true } },
      hub: { select: { name: true, color: true } },
    },
  });
}

/**
 * The usable invitation that lets `email` create an account, if any: one sent
 * to that address, or a link that address claimed. Newest first, so a fresh
 * invite wins over an older one from someone else.
 */
export async function pendingInviteFor(email: string) {
  const address = email.trim().toLowerCase();
  return prisma.appInvite.findFirst({
    where: { OR: [{ email: address }, { email: null, claimedEmail: address }], ...validWhere() },
    orderBy: { createdAt: "desc" },
    select: { id: true, createdById: true, hubId: true },
  });
}

/**
 * Marks the invitation used by `userId`, inside the transaction that creates
 * the account. The `usedAt: null` condition makes it single-use even if two
 * clicks race: the second update matches nothing and the caller rolls back.
 * When the invite also carried a hub, the person gets an INVITED membership —
 * an invitation they accept or decline at /welcome, never a done deal.
 */
export async function consumeInvite(
  tx: Prisma.TransactionClient,
  invite: { id: string; createdById: string; hubId: string | null },
  userId: string,
): Promise<boolean> {
  const { count } = await tx.appInvite.updateMany({
    where: { id: invite.id, ...validWhere() },
    data: { usedAt: new Date(), usedById: userId },
  });
  if (count === 0) return false;

  if (invite.hubId) {
    // Only while the inviter still owns that hub: an owner who has since left
    // or been removed doesn't get to place anyone in it any more.
    const owner = await tx.hubMembership.findFirst({
      where: { hubId: invite.hubId, userId: invite.createdById, role: "OWNER", status: "ACTIVE" },
      select: { id: true },
    });
    if (owner) {
      await tx.hubMembership.upsert({
        where: { hubId_userId: { hubId: invite.hubId, userId } },
        update: {},
        create: {
          hubId: invite.hubId,
          userId,
          role: "MEMBER",
          status: "INVITED",
          invitedById: invite.createdById,
        },
      });
    }
  }
  return true;
}

/** "l•••••@yahoo.com" — enough for someone to recognise their own address. */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return "•••";
  return `${local.slice(0, 1)}${"•".repeat(Math.max(2, Math.min(6, local.length - 1)))}@${domain}`;
}
