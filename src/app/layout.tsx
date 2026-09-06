import type { Metadata, Viewport } from "next";
import { Geist } from "next/font/google";
import "./globals.css";

import { getUser } from "@/lib/session";
import { resolveThemeId, themeColor } from "@/lib/themes";

const geist = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });

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
      className={`${geist.variable} h-full antialiased`}
    >
      <body className="min-h-full">{children}</body>
    </html>
  );
}
