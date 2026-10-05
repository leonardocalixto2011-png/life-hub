import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import Credentials from "next-auth/providers/credentials";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { findOrCreateUser, mayCreateAccount } from "@/lib/signup";
import { sendConfirmAddressEmail, sendMagicLinkEmail } from "@/lib/email";
import { verifyAgainstNothing, verifyPassword } from "@/lib/password";
import { hashedKey, rateLimit } from "@/lib/rate-limit";
import { logWarn } from "@/lib/observability";

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
 * trips, or the address has no account, signups are closed and nobody invited it, nothing is
 * sent and nothing different is returned, so the endpoint is not an oracle for
 * which addresses are registered.
 */
async function maySendLink(email: string, request: Request | undefined): Promise<boolean> {
  const address = email.toLowerCase().trim();
  // Each refusal is logged with its reason (never the address): the screen
  // says "check your email" either way, so the log is the only place that
  // tells "never sent" apart from "sent, but lost in junk".
  const refuse = (reason: string) => {
    logWarn("magic_link.not_sent", { reason, domain: address.split("@")[1] ?? null });
    return false;
  };
  if (!(await rateLimit(`magic-link:${hashedKey(address)}`, 3, 3600)).ok) return refuse("address_limit");
  const ip = clientIp(request);
  if (ip !== null && !(await rateLimit(`magic-link-ip:${hashedKey(ip)}`, 10, 3600)).ok) return refuse("ip_limit");
  const known = await prisma.user.findUnique({ where: { email: address }, select: { id: true } });
  if (known) return true;
  // No account yet: only with open signups or an invitation for this address.
  return (await mayCreateAccount(address)) || refuse("no_account_or_invite");
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
        // Someone who made their account with a password on an invitation
        // and hasn't opened a link yet: this link is what confirms the
        // address, so the email says that rather than "sign in".
        const pending = await prisma.user.findUnique({
          where: { email: identifier.toLowerCase().trim() },
          select: { emailVerified: true, password: { select: { userId: true } } },
        });
        if (pending && !pending.emailVerified && pending.password) {
          await sendConfirmAddressEmail(identifier, url);
          return;
        }
        await sendMagicLinkEmail(identifier, url);
      },
    }),
    /**
     * Email + password, for accounts that set one. Every failure looks the
     * same — no account, no password on it, wrong password, too many tries —
     * and takes the same time, so this can't be used to learn who has an
     * account. Limits: 10 tries per address per 15 minutes, 30 per IP per
     * hour: plenty for typos, useless for guessing.
     */
    Credentials({
      id: "password",
      name: "Password",
      credentials: { email: {}, password: {} },
      async authorize(credentials, request) {
        const email = String(credentials?.email ?? "").toLowerCase().trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password || password.length > 256) return null;
        const ip = clientIp(request);
        const limited =
          !(await rateLimit(`pw-login:${hashedKey(email)}`, 10, 900)).ok ||
          (ip !== null && !(await rateLimit(`pw-login-ip:${hashedKey(ip)}`, 30, 3600)).ok);
        const user = await prisma.user.findUnique({
          where: { email },
          select: { id: true, email: true, name: true, role: true, password: { select: { hash: true } } },
        });
        if (limited || !user?.password) {
          await verifyAgainstNothing(password);
          return null;
        }
        if (!(await verifyPassword(password, user.password.hash))) return null;
        return { id: user.id, email: user.email, name: user.name, role: user.role };
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
    async signIn({ user, email, account }) {
      if (!user?.email) return false;
      // A password only exists on an account that already exists, and
      // `authorize` above already checked it.
      if (account?.provider === "password") return true;
      if (email?.verificationRequest) return true;
      return findOrCreateUser(user.email, user.name);
    },
  },
});
