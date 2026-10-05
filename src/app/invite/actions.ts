"use server";

import { AuthError } from "next-auth";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { hashedKey, rateLimit } from "@/lib/rate-limit";
import { findInviteByToken, looksLikeToken } from "@/lib/app-invites";
import { createInvitedAccount } from "@/lib/signup";
import { hashPassword, passwordProblem } from "@/lib/password";

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

  if (invite.email && invite.email !== email) {
    return { sent: false, error: "This invitation was sent to another address. Use that one." };
  }

  const password = String(formData.get("password") ?? "");
  if (formData.get("intent") !== "link" && password) {
    return createWithPassword(invite, email, password);
  }

  if (!invite.email) {
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

/**
 * The person chose a password on the invitation: the account is made now and
 * they're signed in straight away, without waiting on an inbox. The address
 * still gets a link, which confirms it (Auth.js marks it verified when it is
 * opened); until then /today shows a reminder.
 *
 * What stops this from being a way to claim someone else's address: the
 * invitation. An emailed one only works for the address it was sent to; a
 * link one is single-use and came from someone who chose to hand it over.
 */
async function createWithPassword(
  invite: { id: string; email: string | null; hubId: string | null; createdById: string },
  email: string,
  password: string,
): Promise<ClaimState> {
  const problem = passwordProblem(password, email);
  if (problem) return { sent: false, email, error: problem };

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    return { sent: false, email, error: "This address already has an account. Sign in instead." };
  }

  const hash = await hashPassword(password);
  if (!(await createInvitedAccount(email, invite, { passwordHash: hash }))) {
    return { sent: false, error: "This invitation doesn't work any more." };
  }

  try {
    await signIn("password", { email, password, redirect: false });
  } catch (err) {
    if (err instanceof AuthError) {
      // The account exists; only the automatic sign-in failed (a rate limit).
      return { sent: false, email, error: "Your account is ready. Sign in with your email and password." };
    }
    throw err;
  }

  // The confirmation link. Not fatal: the account works without it, and
  // /today offers to send it again.
  try {
    await signIn("resend", { email, redirect: false, redirectTo: "/today" });
  } catch {
    // Logged by the provider (src/auth.ts, lib/email.ts).
  }
  redirect("/welcome");
}
