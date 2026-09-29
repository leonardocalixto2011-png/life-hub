/**
 * Browser-only: photo → base64 JPEG for `parseImage`. Shared by quick-add's
 * "Snap" and the Android share sheet (/share), so both send Claude the same
 * size and quality.
 */

/** Long edge after downscaling. Plenty for a receipt's small print. */
export const SNAP_MAX_EDGE = 1600;

/**
 * Image blob → base64 JPEG, at most SNAP_MAX_EDGE on the long side. Goes
 * through an <img> rather than createImageBitmap because <img> applies the
 * EXIF rotation, so a portrait receipt isn't sent sideways. Throws when the
 * browser can't decode the file at all — HEIC outside Safari, mainly.
 */
export async function downscaleImage(file: Blob): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, SNAP_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (!dataUrl.startsWith("data:image/jpeg") || !b64) throw new Error("encode failed");
    return b64;
  } finally {
    URL.revokeObjectURL(url);
  }
}
