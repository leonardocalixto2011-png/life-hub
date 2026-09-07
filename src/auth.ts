import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
import { findOrCreateUser } from "@/lib/signup";
import { sendMagicLinkEmail } from "@/lib/email";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(prisma),
  providers: [
    Resend({
      apiKey: process.env.AUTH_RESEND_KEY ?? "no-key-dev",
      from: process.env.EMAIL_FROM ?? "onboarding@resend.dev",
      maxAge: 60 * 60 * 24, // magic link valid 24h
      async sendVerificationRequest({ identifier, url }) {
        await sendMagicLinkEmail(identifier, url);
      },
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    /**
     * The account gate. Runs on both the request step (before an email is
     * sent) and the callback step (after the link is clicked).
     *
     * With SIGNUPS_OPEN unset — the default — an address with no User row gets
     * nothing: no email, no account. With it set, reaching here means the
     * address provably received a link, so the account is created then. There
     * is no separate verification step because there is nothing to verify
     * that clicking the link has not already proven.
     */
    async signIn({ user }) {
      if (!user?.email) return false;
      return findOrCreateUser(user.email, user.name);
    },
  },
});
