import { put } from "@vercel/blob";

import { isOwnBlobUrl } from "@/lib/blob-url";

/**
 * Copies a photo from somewhere on the web into our own Blob store and returns
 * the copy's URL — how a trip plan's `image` links (and "paste a photo link"
 * on a trip item) become photos everyone in the hub can see.
 *
 * Why copy instead of storing the link: an image URL is a request each
 * viewer's browser makes, carrying their IP to whoever owns that host (see
 * lib/blob-url.ts), and the CSP only lets images load from our Blob host. A
 * copy fetched once by the server leaks nothing about the viewers, keeps
 * working when the original moves, and needs no CSP change.
 *
 * The fetch is the server's, so it is kept narrow: https only, no IP-literal
 * or local hosts, image content types only, a byte cap read off the stream
 * (Content-Length can lie), and a timeout. Returns null on any failure — a
 * plan imports fine without its pictures, and re-importing fills the gaps.
 */
const TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
};
const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 8000;

/** Hosts a server-side fetch must never reach, whatever a plan says. */
function unsafeHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".localhost") || h.endsWith(".local") || h.endsWith(".internal")) return true;
  // Any IP literal (v4 or v6): a real photo lives on a named host.
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.includes(":")) return true;
  return !h.includes(".");
}

export function isFetchableImageUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && !url.username && !url.password && !unsafeHost(url.hostname);
}

export async function copyImageToBlob(source: string, prefix: string): Promise<string | null> {
  if (isOwnBlobUrl(source)) return source;
  if (!process.env.BLOB_READ_WRITE_TOKEN || !isFetchableImageUrl(source)) return null;
  try {
    const res = await fetch(source, {
      signal: AbortSignal.timeout(TIMEOUT_MS),
      redirect: "follow",
      // Wikimedia and most CDNs refuse requests with no identifying agent.
      headers: { "User-Agent": "LifeHub/1.0 (trip plan photos; https://github.com/leonardocalixto2011-png/life-hub)", Accept: "image/*" },
    });
    // A redirect could still land somewhere it shouldn't.
    if (!res.ok || !res.body || !isFetchableImageUrl(res.url || source)) return null;
    const type = (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    const ext = TYPES[type];
    if (!ext) return null;

    const chunks: Uint8Array[] = [];
    let size = 0;
    const reader = res.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BYTES) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
    const blob = await put(`${prefix}photo.${ext}`, Buffer.concat(chunks), {
      access: "public",
      contentType: type,
      addRandomSuffix: true,
    });
    return blob.url;
  } catch {
    return null;
  }
}
