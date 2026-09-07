import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config: no adapter, no providers that touch Node APIs or the
 * database. `proxy.ts` builds its middleware from this. The full config in
 * `auth.ts` spreads this and adds the Prisma adapter + Resend provider.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  /**
   * Auth.js defaults to a 30-day session. That is a long time to hold a
   * bearer credential for an app showing bank balances and debts, especially
   * on a phone: the cookie is the whole credential, and with the JWT strategy
   * there is no server-side session row to revoke if a device is lost.
   *
   * 7 days, refreshed at most once a day (`updateAge`). Someone using this
   * daily is never signed out; someone who stops has a cookie that expires
   * within the week. Signing back in is one emailed link, so the cost of
   * being wrong in the strict direction is very low.
   */
  session: {
    strategy: "jwt" as const,
    maxAge: 60 * 60 * 24 * 7,
    updateAge: 60 * 60 * 24,
  },
  // Trust the deployment host (Vercel, custom domain) for callback URL building.
  trustHost: true,
  providers: [],
  callbacks: {
    /** Gate every route except the public ones. */
    authorized({ auth, request: { nextUrl } }) {
      const isLoggedIn = !!auth?.user;
      const { pathname } = nextUrl;

      const isPublic =
        pathname === "/" ||
        pathname.startsWith("/login") ||
        pathname.startsWith("/api/auth");

      if (isPublic) return true;
      return isLoggedIn;
    },
    jwt({ token, user }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "MEMBER";
        token.uid = user.id;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        session.user.id = (token.uid as string) ?? session.user.id;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;
