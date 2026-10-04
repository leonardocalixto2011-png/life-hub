"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn, signOut } from "@/auth";
import { getUser } from "@/lib/session";

const schema = z.object({ email: z.string().email() });

export type LoginState = { sent: boolean; error?: string };

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { sent: false, error: "Enter a valid email address." };
  }

  const email = parsed.data.email.toLowerCase();

  // Rate limits, the account check and the signups switch all live in the
  // provider's sendVerificationRequest (src/auth.ts), so this form and a
  // direct POST to /api/auth/signin/resend are held to the same rules. The
  // response is identical whatever happens there.
  try {
    await signIn("resend", { email, redirect: false, redirectTo: "/today" });
  } catch (err) {
    if (err instanceof AuthError && err.type !== "AccessDenied") {
      return { sent: false, error: "Something went wrong. Try again." };
    }
  }

  return { sent: true };
}

/**
 * Drops a session cookie that no longer maps to an account (the user was
 * deleted, or the database was reseeded under a still-valid JWT). The proxy
 * only checks that a JWT exists while every page needs the database row, so
 * such a cookie used to bounce /today → /login → /today forever.
 *
 * Does nothing for a session that *does* resolve to a user: this action is
 * callable by anyone, and must never be a way to sign a real person out.
 */
export async function clearStaleSession(): Promise<void> {
  if (await getUser()) return;
  await signOut({ redirect: false });
}
