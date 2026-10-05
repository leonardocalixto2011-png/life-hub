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
        pathname.startsWith("/api/auth") ||
        // Legal pages must be readable before signing in — they are linked
        // from the login screen. Exact paths, not prefixes.
        pathname === "/confidentialite" ||
        pathname === "/conditions" ||
        // An invitation must open before the person has an account. The
        // page itself only shows who invited them and asks for an address.
        pathname.startsWith("/invite/");

      if (isPublic) return true;
      return isLoggedIn;
    },
    jwt({ token, user, account }) {
      if (user) {
        token.role = (user as { role?: string }).role ?? "MEMBER";
        token.uid = user.id;
        // How and when this session began. Setting a password without the
        // current one is allowed only right after an emailed link proved
        // the address ((app)/account/actions.ts) — that is the reset path.
        token.via = account?.provider ?? null;
        token.authAt = Date.now();
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        (session.user as { role?: string }).role = token.role as string;
        session.user.id = (token.uid as string) ?? session.user.id;
      }
      (session as { via?: string | null; authAt?: number | null }).via = (token.via as string | null) ?? null;
      (session as { via?: string | null; authAt?: number | null }).authAt = (token.authAt as number | null) ?? null;
      return session;
    },
  },
} satisfies NextAuthConfig;
