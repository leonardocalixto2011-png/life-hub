/**
 * Browser-only: photo → base64 JPEG for `parseImage`. Shared by quick-add's
 * "Snap" and the Android share sheet (/share), so both send Claude the same
 * size and quality.
 */

/** Long edge after downscaling. Plenty for a receipt's small print. */
export const SNAP_MAX_EDGE = 1600;

/**
 * Image blob → base64 JPEG, at most SNAP_MAX_EDGE on the long side. Throws
 * when the browser can't decode the file at all — HEIC outside Safari, mainly.
 *
 * createImageBitmap first, with imageOrientation "from-image" so a portrait
 * receipt isn't sent sideways. The old `<img>.decode()` path waits for the
 * page to render, so it stalled whenever the tab was hidden — including the
 * moment a phone returns from its photo picker. The `<img>` fallback waits on
 * onload instead.
 */
export async function downscaleImage(file: Blob): Promise<string> {
  const source = await decodeImage(file);
  try {
    const scale = Math.min(1, SNAP_MAX_EDGE / Math.max(source.width, source.height));
    const w = Math.max(1, Math.round(source.width * scale));
    const h = Math.max(1, Math.round(source.height * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(source.image, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (!dataUrl.startsWith("data:image/jpeg") || !b64) throw new Error("encode failed");
    return b64;
  } finally {
    source.release();
  }
}

type Decoded = {
  image: CanvasImageSource;
  width: number;
  height: number;
  release: () => void;
};

async function decodeImage(file: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" });
      return { image: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() };
    } catch {
      // Some browsers decode formats in <img> that they refuse as a bitmap.
    }
  }
  const url = URL.createObjectURL(file);
  const img = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("decode failed"));
      img.src = url;
    });
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
  return {
    image: img,
    width: img.naturalWidth,
    height: img.naturalHeight,
    release: () => URL.revokeObjectURL(url),
  };
}
