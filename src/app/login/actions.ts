"use server";

import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";

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

  // Rate limit BEFORE the lookup, and return the same generic success below
  // either way — a distinguishable "rate limited" response would turn this
  // into the account-enumeration oracle the constant-response design exists to
  // prevent. Sending is what costs money (Resend) and floods an inbox, so the
  // limit is per-address; a wide-net attacker just gets 3 mails per address
  // per hour instead of thousands.
  const limited = !(await rateLimit(`magic-link:${email}`, 3, 3600)).ok;

  // Invite-only: only seeded addresses get a link. Respond identically either
  // way so the form can't be used to probe who has an account. (The signIn
  // callback in src/auth.ts enforces the same rule on the verify step.)
  const known = limited
    ? null
    : await prisma.user.findUnique({
        where: { email },
        select: { id: true },
      });

  if (known) {
    try {
      await signIn("resend", { email, redirect: false, redirectTo: "/today" });
    } catch (err) {
      if (err instanceof AuthError && err.type !== "AccessDenied") {
        return { sent: false, error: "Something went wrong. Try again." };
      }
    }
  }

  return { sent: true };
}
