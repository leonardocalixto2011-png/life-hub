import { issueImageUploadToken } from "@/lib/image-upload";
import { attachmentPrefix } from "@/lib/attachments";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Photos pinned to tasks ("buy this"). Same gate as the background upload,
 * its own hourly bucket (quick-add reads up to 3 photos at a time, so this
 * needs more headroom than a wallpaper), and every file lands under
 * `attachments/<userId>/` so one person's uploads are identifiable.
 */
export async function POST(request: Request) {
  return issueImageUploadToken(request, {
    bucket: "attach",
    perHour: 40,
    tooMany: "Too many photo uploads. Try again in a little while.",
    pathnameFor: attachmentPrefix,
  });
}
