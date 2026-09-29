import { issueImageUploadToken } from "@/lib/image-upload";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Background-photo uploads. The auth gate, limits and content rules live in
 * issueImageUploadToken (shared with /api/attachments/upload). No
 * `onUploadCompleted` — the client persists the resulting URL itself via
 * setBackgroundImage (see actions.ts), which also means this works in local
 * dev with no extra setup (that callback needs Vercel's Blob service to reach
 * a public URL, which it can't for localhost).
 */
export async function POST(request: Request) {
  // Ten background photos an hour is far more than anyone changing a
  // wallpaper needs.
  return issueImageUploadToken(request, {
    bucket: "upload",
    perHour: 10,
    tooMany: "Too many uploads. Try again in a little while.",
  });
}
