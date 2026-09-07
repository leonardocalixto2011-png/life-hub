import type { Metadata, Viewport } from "next";
import { Fraunces, Instrument_Sans } from "next/font/google";
import "./globals.css";

import { getUser } from "@/lib/session";
import { resolveThemeId, themeColor } from "@/lib/themes";
import { MOTION_INIT_SCRIPT } from "@/lib/motion";

/**
 * Two faces, strictly rationed — see the design direction.
 *
 * Fraunces is the app's voice: greetings, empty states, the "Cleared" stamp.
 * Nowhere operational. The SOFT axis rounds its terminals so it stays warm at
 * the large sizes those moments use; used everywhere it would just become
 * wallpaper, which is why nothing else is allowed to reach for it.
 *
 * Instrument Sans replaces Geist for the interface. It is slightly narrower,
 * which is the actual reason: this app is half French, and "Ligne de crédit"
 * and "Prêt comptant" have to fit a debt row on a phone without truncating.
 *
 * Both are self-hosted by next/font, so the Content-Security-Policy added in
 * the security pass needs no font exception.
 */
const display = Fraunces({
  variable: "--font-display",
  subsets: ["latin"],
  axes: ["SOFT"],
  display: "swap",
});

const sans = Instrument_Sans({
  variable: "--font-sans",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "Life Hub",
  description: "Shared life & business admin — tasks, deadlines, subscriptions, budget.",
  applicationName: "Life Hub",
  appleWebApp: { capable: true, statusBarStyle: "default", title: "Life Hub" },
  manifest: "/manifest.webmanifest",
};

/** Async so the installed-PWA status bar picks up the user's chosen palette
 *  instead of a hardcoded indigo. `getUser` is React.cache'd, so this shares
 *  the lookup with RootLayout below. */
export async function generateViewport(): Promise<Viewport> {
  const user = await getUser();
  return {
    themeColor: themeColor(user?.themeId),
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
    maximumScale: 1,
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // Signed-out routes (/login) resolve to the default palette.
  const user = await getUser();

  return (
    <html
      lang="en"
      data-theme={resolveThemeId(user?.themeId)}
      className={`${sans.variable} ${display.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: MOTION_INIT_SCRIPT }} />
      </head>
      <body className="min-h-full">{children}</body>
    </html>
  );
}
