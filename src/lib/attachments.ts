/**
 * Task photo attachments — shared by the upload route (server) and the
 * uploader (browser). Plain module: no server-only imports.
 */

/** Where one person's task photos live in the Blob store. */
export function attachmentPrefix(userId: string): string {
  return `attachments/${userId}/`;
}

/** Base64 JPEG (what downscaleImage returns) → Blob, without fetch(data:), which CSP connect-src blocks. */
export function jpegBlobFromBase64(b64: string): Blob {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: "image/jpeg" });
}

/**
 * Browser-only: uploads a photo to Vercel Blob for pinning to a task and
 * returns its URL. Throws on any failure (no Blob token locally, rate limit,
 * network) — callers treat the photo as optional and carry on without it.
 */
export async function uploadAttachment(file: Blob, userId: string): Promise<string> {
  const { upload } = await import("@vercel/blob/client");
  const ext = file.type === "image/png" ? "png" : file.type === "image/webp" ? "webp" : "jpg";
  const blob = await upload(`${attachmentPrefix(userId)}photo.${ext}`, file, {
    access: "public",
    handleUploadUrl: "/api/attachments/upload",
    contentType: file.type || "image/jpeg",
  });
  return blob.url;
}
