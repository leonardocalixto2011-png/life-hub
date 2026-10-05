"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { z } from "zod";

import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashedKey, rateLimit } from "@/lib/rate-limit";
import { findInviteByToken, looksLikeToken } from "@/lib/app-invites";

export type ClaimState = { sent: boolean; error?: string; email?: string; resent?: boolean };

/**
 * Someone opened an invitation and entered their address. Ties the
 * invitation to that address (for a link) or checks it is the one it was
 * sent to (for an email), then sends the ordinary sign-in link. Opening that
 * link is what creates the account (lib/signup.ts) — so an address the
 * person can't read gets nothing, and a typo can be corrected by entering
 * the right address: only whichever address is on the invitation when a
 * link is clicked can use it.
 */
export async function claimInvite(token: string, _prev: ClaimState, formData: FormData): Promise<ClaimState> {
  if (!looksLikeToken(token)) return { sent: false, error: "This invitation doesn't work any more." };
  const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!parsed.success) return { sent: false, error: "Enter a valid email address." };
  const email = parsed.data;

  // Counted per invitation and per IP: a forwarded link must not become a way
  // to make us email a list of addresses. (The sign-in provider caps each
  // address separately, src/auth.ts.)
  const ip = (await headers()).get("x-forwarded-for")?.split(",")[0]?.trim();
  if (
    !(await rateLimit(`invite-claim:${hashedKey(token)}`, 6, 86400)).ok ||
    (ip && !(await rateLimit(`invite-claim-ip:${hashedKey(ip)}`, 10, 3600)).ok)
  ) {
    return { sent: false, error: "Too many tries. Wait a little and try again." };
  }

  const invite = await findInviteByToken(token);
  if (!invite) return { sent: false, error: "This invitation doesn't work any more." };

  if (invite.email) {
    if (invite.email !== email) {
      return { sent: false, error: "This invitation was sent to another address. Use that one." };
    }
  } else {
    await prisma.appInvite.updateMany({
      where: { id: invite.id, usedAt: null },
      data: { claimedEmail: email },
    });
  }

  try {
    await signIn("resend", { email, redirect: false, redirectTo: "/welcome" });
  } catch (err) {
    if (err instanceof AuthError && err.type !== "AccessDenied") {
      return { sent: false, error: "Something went wrong. Try again." };
    }
  }
  return { sent: true, email, resent: formData.get("resend") === "1" };
}
