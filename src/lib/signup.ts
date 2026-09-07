import { prisma } from "@/lib/prisma";
import { logInfo } from "@/lib/observability";

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
  return process.env.SIGNUPS_OPEN === "1";
}

/**
 * Called from the Auth.js signIn callback after a link is verified — i.e.
 * only ever for an address that provably received mail. Returns false when
 * the address has no account and signups are closed, which is what keeps the
 * app invite-only.
 *
 * The new user gets a hub immediately rather than being dropped on
 * /hubs/new: someone arriving with zero context should land on a working
 * app, not a form asking them to name something they don't understand yet.
 */
export async function findOrCreateUser(email: string, name?: string | null): Promise<boolean> {
  const address = email.toLowerCase().trim();

  const existing = await prisma.user.findUnique({
    where: { email: address },
    select: { id: true },
  });
  if (existing) return true;

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
