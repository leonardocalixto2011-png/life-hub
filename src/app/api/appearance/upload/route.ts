import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getUser } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Issues a short-lived client token so the browser can upload directly to
 * Vercel Blob, bypassing the 4.5MB Server Action body limit — real phone
 * photos routinely exceed that. `onBeforeGenerateToken` is the actual auth
 * gate here (not optional): without it, anyone who finds this URL could
 * request an upload token. No `onUploadCompleted` — the client persists the
 * resulting URL itself via setBackgroundImage (see actions.ts), which also
 * means this works in local dev with no extra setup (that callback needs
 * Vercel's Blob service to reach a public URL, which it can't for localhost).
 */
export async function POST(request: Request) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async () => {
        const user = await getUser();
        if (!user) throw new Error("Not signed in.");
        return {
          allowedContentTypes: ["image/jpeg", "image/png", "image/webp", "image/heic"],
          maximumSizeInBytes: 15 * 1024 * 1024,
          addRandomSuffix: true,
        };
      },
    });
    return NextResponse.json(jsonResponse);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Upload failed." },
      { status: 400 },
    );
  }
}
