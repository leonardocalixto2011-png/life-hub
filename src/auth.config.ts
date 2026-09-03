import type { NextAuthConfig } from "next-auth";

/**
 * Edge-safe Auth.js config: no adapter, no providers that touch Node APIs or the
 * database. `proxy.ts` builds its middleware from this. The full config in
 * `auth.ts` spreads this and adds the Prisma adapter + Resend provider.
 */
export const authConfig = {
  pages: { signIn: "/login" },
  session: { strategy: "jwt" as const },
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
