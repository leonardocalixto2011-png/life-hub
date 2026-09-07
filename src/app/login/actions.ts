"use server";

import { headers } from "next/headers";
import { AuthError } from "next-auth";
import { z } from "zod";

import { signIn } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { signupsOpen } from "@/lib/signup";

const schema = z.object({ email: z.string().email() });

export type LoginState = { sent: boolean; error?: string };

/** Best-effort client IP. Vercel sets x-forwarded-for; the left-most entry is
 *  the client, the rest are proxies. Absent means we simply don't IP-limit. */
async function clientIp(): Promise<string | null> {
  const h = await headers();
  const fwd = h.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
}

export async function requestMagicLink(
  _prev: LoginState,
  formData: FormData,
): Promise<LoginState> {
  const parsed = schema.safeParse({ email: formData.get("email") });
  if (!parsed.success) {
    return { sent: false, error: "Enter a valid email address." };
  }

  const email = parsed.data.email.toLowerCase();

  // Two limits, for two different abuses.
  //
  // Per-address (3/hr) stops one inbox being flooded, and every send costs
  // money at Resend. Per-IP (10/hr) matters once signups are open: without
  // it, one script can walk a list of addresses creating accounts, each
  // limited to 3 but unlimited in aggregate. Neither is checked separately in
  // the response — see below.
  const ip = await clientIp();
  const limited =
    !(await rateLimit(`magic-link:${email}`, 3, 3600)).ok ||
    (ip !== null && !(await rateLimit(`magic-link-ip:${ip}`, 10, 3600)).ok);

  // Whether this address has an account, and whether signups are open,
  // together decide if a link is sent. The response below is identical
  // regardless — a distinguishable "rate limited" or "no such account" reply
  // would turn this form into an oracle for which addresses are registered,
  // which is exactly what the constant response exists to prevent.
  const known = limited
    ? null
    : await prisma.user.findUnique({ where: { email }, select: { id: true } });

  if (!limited && (known || signupsOpen())) {
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
