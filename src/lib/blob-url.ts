import { z } from "zod";

/**
 * Validates that a URL is one of our own Vercel Blob objects.
 *
 * `z.string().url()` alone is not enough for anything other people will load.
 * It accepts any scheme and any host, so a stored value could point anywhere
 * — and an image URL is a request the viewer's browser makes, carrying their
 * IP and user agent to whoever owns that host. For a personal background that
 * only ever loads for the person who set it, that is their own business. For
 * a **hub cover**, one member picks an image that then loads in everyone
 * else's browser, which makes an arbitrary host a way to silently collect the
 * whole hub's IP addresses.
 *
 * So: https only, and only the Blob host the upload route actually writes to.
 * The Content-Security-Policy blocks other image origins at render time too;
 * this stops the bad value from being stored in the first place, which is the
 * half CSP can't do.
 */
const BLOB_HOST = /^[a-z0-9-]+\.public\.blob\.vercel-storage\.com$/;

export function isOwnBlobUrl(value: string): boolean {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  return url.protocol === "https:" && BLOB_HOST.test(url.hostname);
}

/**
 * Zod schema for a stored image URL.
 *
 * Local development has no Blob store, so uploads there produce whatever the
 * dev harness returns; the host check is skipped outside production rather
 * than making the feature untestable locally. Production is where the value
 * is shared with other people, and that is where it is enforced.
 */
export const blobUrlSchema = z
  .string()
  .url()
  .refine(
    (v) => process.env.NODE_ENV !== "production" || isOwnBlobUrl(v),
    "That image must be uploaded here, not linked from another site.",
  );
