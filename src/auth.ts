import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { findOrCreateUser, signupsOpen } from "@/lib/signup";
import { sendMagicLinkEmail } from "@/lib/email";
import { hashedKey, rateLimit } from "@/lib/rate-limit";

/** Left-most x-forwarded-for entry is the client on Vercel; absent = no IP limit. */
function clientIp(request: Request | undefined): string | null {
  const fwd = request?.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || request?.headers.get("x-real-ip") || null;
}

/**
 * Whether a magic link may actually be emailed. Lives here, inside the
 * provider, rather than in the login form's server action, because
 * POST /api/auth/signin/resend reaches the provider directly: a limit that
 * only exists in the form is a limit any script can walk around.
 *
 * Two limits for two abuses: per address (3/hr) stops one inbox being flooded,
 * per IP (10/hr) stops one script walking a list of addresses. When either
 * trips, or the address has no account while signups are closed, nothing is
 * sent and nothing different is returned, so the endpoint is not an oracle for
 * which addresses are registered.
 */
async function maySendLink(email: string, request: Request | undefined): Promise<boolean> {
  const address = email.toLowerCase().trim();
  if (!(await rateLimit(`magic-link:${hashedKey(address)}`, 3, 3600)).ok) return false;
  const ip = clientIp(request);
  if (ip !== null && !(await rateLimit(`magic-link-ip:${hashedKey(ip)}`, 10, 3600)).ok) return false;
  if (signupsOpen()) return true;
  const known = await prisma.user.findUnique({ where: { email: address }, select: { id: true } });
  return known !== null;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY ?? "no-key-dev",
      from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
      maxAge: 60 * 60 * 24, // magic link valid 24h
      async sendVerificationRequest({ identifier, url, request }) {
        if (!(await maySendLink(identifier, request))) return;
        await sendMagicLinkEmail(identifier, url);
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * The account gate. Auth.js runs it twice: on the request step (before an
     * email is sent, `email.verificationRequest` set) and on the callback step
     * (after the link is clicked).
     *
     * The request step creates nothing and always says yes: whether a link is
     * really sent is decided in `maySendLink`, silently, so the response does
     * not reveal whether an address is registered. Creating the account here
     * would have made one for every address anyone typed, verified or not.
     *
     * The callback step is the only place an account is created. Reaching it
     * means the address provably received a link, so there is no separate
     * verification step. With SIGNUPS_OPEN unset an unknown address is refused.
     */
    async signIn({ user, email }) {
      if (!user?.email) return false;
      if (email?.verificationRequest) return true;
      return findOrCreateUser(user.email, user.name);
    },
  },
});
