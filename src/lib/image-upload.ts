import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { NextResponse } from "next/server";

import { getUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";

/** What every image upload in the app accepts. */
export const UPLOAD_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic"];
export const UPLOAD_MAX_BYTES = 15 * 1024 * 1024;

/**
 * The shared body of the Vercel Blob client-upload routes (background photo,
 * task attachments). Issues a short-lived client token so the browser uploads
 * straight to Blob, past the 4.5MB Server Action body limit.
 *
 * `onBeforeGenerateToken` is the auth gate: signed in, under the per-user
 * hourly limit for this bucket, and — when `pathnameFor` is given — writing
 * only under a path the server chose for this user. The pathname comes from
 * the client and cannot be rewritten server side, so it is checked instead.
 */
export async function issueImageUploadToken(
  request: Request,
  opts: {
    /** Rate-limit bucket, e.g. `upload` or `attach`; suffixed with the user id. */
    bucket: string;
    perHour: number;
    tooMany: string;
    /** Required pathname prefix for this user, or null for "anything". */
    pathnameFor?: (userId: string) => string;
  },
) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname) => {
        const user = await getUser();
        if (!user) throw new Error("Not signed in.");
        if (opts.pathnameFor) {
          const prefix = opts.pathnameFor(user.id);
          const rest = pathname.startsWith(prefix) ? pathname.slice(prefix.length) : "";
          if (!/^[A-Za-z0-9._-]{1,80}$/.test(rest)) throw new Error("Upload failed.");
        }
        // Blob storage is billed, so being signed in can't be the only limit:
        // one account looping uploads would run up the bill.
        if (!(await rateLimit(`${opts.bucket}:${user.id}`, opts.perHour, 3600)).ok) {
          throw new Error(opts.tooMany);
        }
        return {
          allowedContentTypes: UPLOAD_IMAGE_TYPES,
          maximumSizeInBytes: UPLOAD_MAX_BYTES,
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
