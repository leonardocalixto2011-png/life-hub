import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Next 16 renamed Middleware → Proxy; same contract. This builds an edge-safe
// gate from the provider-less config (see src/auth.config.ts).
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  // Run on everything except Next internals, the auth API, and static PWA assets.
  matcher: [
    "/((?!api/auth|_next/static|_next/image|favicon.ico|manifest.webmanifest|sw.js|icons/).*)",
  ],
};
