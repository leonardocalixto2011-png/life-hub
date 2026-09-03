import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";

import { authConfig } from "@/auth.config";
import { prisma } from "@/lib/prisma";
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
     * Invite-only gate. Runs on both the request step (before an email is sent)
     * and the callback step (after the link is clicked). An address with no
     * seeded User row gets nothing — no email, no account.
     */
    async signIn({ user }) {
      if (!user?.email) return false;
      const existing = await prisma.user.findUnique({
        where: { email: user.email.toLowerCase() },
        select: { id: true },
      });
      return Boolean(existing);
    },
  },
});
