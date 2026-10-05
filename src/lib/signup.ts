import { prisma } from "@/lib/prisma";
import { logInfo } from "@/lib/observability";
import { legalPublished } from "@/content/legal/version";
import { consumeInvite, pendingInviteFor } from "@/lib/app-invites";

/**
 * Self-serve signup, off by default.
 *
 * `SIGNUPS_OPEN=1` is the only thing that opens registration. It defaults
 * closed on purpose: invite-only is currently doing real work as a security
 * and a cost control (every account can spend the Anthropic budget), and
 * opening it before there is a privacy policy and terms would mean collecting
 * strangers' financial data with no stated lawful basis. Turn it on
 * deliberately, after those exist — not as a side effect of a deploy.
 *
 * There is no password anywhere in this flow. A magic link *is* the email
 * verification: an address that can't receive the link can't sign in, so
 * "create account", "verify email" and "reset password" collapse into one
 * step, and there is no password hash to leak.
 */
export function signupsOpen(): boolean {
  // Also requires LEGAL_PUBLISHED=1: strangers must not be able to create an
  // account while the privacy policy and terms are still the draft. One flag
  // flipped early in Vercel should not be enough to open the doors.
  return process.env.SIGNUPS_OPEN === "1" && legalPublished();
}

/**
 * Whether an address with no account may still be sent a sign-in link: when
 * signups are open, or when someone invited it (lib/app-invites.ts).
 */
export async function mayCreateAccount(email: string): Promise<boolean> {
  if (signupsOpen()) return true;
  return (await pendingInviteFor(email)) !== null;
}

/**
 * Called from the Auth.js signIn callback after a link is verified — i.e.
 * only ever for an address that provably received mail. Returns false when
 * the address has no account, signups are closed and nobody invited it,
 * which is what keeps the app invite-only.
 *
 * An invited person gets no hub here: the welcome (/welcome) asks them to
 * make their own, answer a hub invitation, or ask to join one with a code.
 * Someone signing up on their own (open signups) gets a hub immediately —
 * arriving with zero context, they should land on a working app.
 */
export async function findOrCreateUser(email: string, name?: string | null): Promise<boolean> {
  const address = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: address },
    select: { id: true },
  });
  if (existing) return true;

  const invite = await pendingInviteFor(address);
  if (invite) {
    const created = await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: { email: address, name: name?.trim() || null, role: "MEMBER", invitedById: invite.createdById },
      });
      // Single use: if another click already used it, roll the account back.
      if (!(await consumeInvite(tx, invite, user.id))) throw new InviteRace();
      return true;
    }).catch((e) => {
      if (e instanceof InviteRace) return false;
      throw e;
    });
    if (created) {
      logInfo("signup.created", { via: "app-invite" });
      return true;
    }
  }

  if (!signupsOpen()) return false;

  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { email: address, name: name?.trim() || null, role: "MEMBER" },
    });

    const hub = await tx.hub.create({
      // Named after them where possible; "My hub" is a placeholder they can
      // rename, not a decision being made for them.
      data: { name: name?.trim() ? `${name.trim().split(/\s+/)[0]}'s hub` : "My hub", createdById: user.id },
    });

    await tx.hubMembership.create({
      data: { hubId: hub.id, userId: user.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
    });
  });

  logInfo("signup.created", { via: "magic-link" });
  return true;
}

class InviteRace extends Error {}
