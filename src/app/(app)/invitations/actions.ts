"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { hashedKey, rateLimit } from "@/lib/rate-limit";
import { formResult, type ActionResult } from "@/lib/action-result";
import { INVITE_TTL_DAYS, InviteLimitError, createAppInvite, inviteUrl } from "@/lib/app-invites";
import { sendAppInviteEmail } from "@/lib/account-emails";

/**
 * Inviting someone to the app — not into a hub. They create their own
 * account, pick their name, username and language, and decide later which
 * hubs to join. Capped per person per month (lib/app-invites.ts): every
 * account can spend the shared AI budget, so invitations are the cost control
 * while signups are closed.
 */

const emailSchema = z.string().trim().toLowerCase().email();

function inviterName(name: string | null): string {
  return name?.trim() || "Someone";
}

/** Sends an invitation by email. */
export async function inviteByEmail(formData: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    const parsed = emailSchema.safeParse(formData.get("email"));
    if (!parsed.success) throw new Error("Enter a valid email address.");
    const email = parsed.data;
    if (email === user.email.toLowerCase()) throw new Error("That's you.");

    // Counted before the lookup below: saying "already has an account" tells
    // the inviter whether an address is registered, so it is capped like
    // any other probe.
    if (!(await rateLimit(`app-invite:${user.id}`, 20, 3600)).ok) {
      throw new Error("You've sent a lot of invites this hour. Try again later.");
    }
    // Someone who already has an account doesn't need one, and an invitation
    // they can't use would only confuse them. The inviter is a member of an
    // invite-only app, the answer is capped above, and it points them to the
    // way that does work.
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (existing) {
      throw new Error("That person already has an account. Invite them to a hub from its Members page.");
    }
    if (!(await rateLimit(`app-invite-to:${hashedKey(email)}`, 3, 86400)).ok) {
      throw new Error("That address was invited several times today. Try again tomorrow.");
    }

    let token: string;
    try {
      ({ token } = await createAppInvite({ createdById: user.id, role: user.role, email }));
    } catch (e) {
      if (e instanceof InviteLimitError) throw new Error(e.message);
      throw e;
    }
    await sendAppInviteEmail({
      to: email,
      inviter: inviterName(user.name),
      url: inviteUrl(token),
      days: INVITE_TTL_DAYS,
    });
    revalidatePath("/invitations");
    return { notice: "Invitation sent to {who}.", noticeVars: { who: email } };
  });
}

/**
 * Makes a one-person invitation link to send any way you like (text message,
 * Messenger…). The link is returned once and never stored — only its hash —
 * so it can't be shown again later; a lost link is revoked and replaced.
 */
export async function createInviteLink(): Promise<{ link?: string; error?: string }> {
  const user = await requireUser();
  try {
    const { token } = await createAppInvite({ createdById: user.id, role: user.role });
    revalidatePath("/invitations");
    return { link: inviteUrl(token) };
  } catch (e) {
    if (e instanceof InviteLimitError) return { error: e.message };
    throw e;
  }
}

export async function revokeAppInvite(inviteId: string) {
  const user = await requireUser();
  z.string().cuid().parse(inviteId);
  await prisma.appInvite.updateMany({
    where: { id: inviteId, createdById: user.id, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath("/invitations");
}
