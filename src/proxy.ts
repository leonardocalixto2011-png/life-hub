import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next 16 renamed Middleware → Proxy; same contract. This builds an edge-safe
// gate from the provider-less config (see src/auth.config.ts).
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  // Run on everything except Next internals, the auth API, and static PWA assets.
  matcher: [
    // Everything except API routes (they auth themselves), Next internals and
    // static PWA assets.
    // apple-touch-icon.png and splash/ must stay public: iOS fetches them
    // while installing from the (signed-out) login page, and a redirect to
    // /login there leaves the home screen with a blank tile.
    "/((?!api/|_next/static|_next/image|favicon.ico|icon.svg|apple-icon.png|apple-touch-icon.png|manifest.webmanifest|sw.js|icons/|splash/).*)",
  ],
};
