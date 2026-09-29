/**
 * Browser-only: one photo → reviewable drafts, with the photo itself uploaded
 * alongside so it can be pinned to the task(s) it becomes. Shared by
 * quick-add (take / choose) and the Android share sheet (/share).
 *
 * The upload runs in parallel with the paid read, so pinning costs no extra
 * wait. It is optional: when it fails (no Blob token in local dev, the upload
 * rate limit, a flaky network) the drafts still come back, just without a
 * photo, and `pinFailed` lets the caller say so gently.
 */
import { parseImage, type Draft } from "@/app/(app)/quick-actions";
import { downscaleImage } from "@/lib/downscale";
import { jpegBlobFromBase64, uploadAttachment } from "@/lib/attachments";

export type PhotoReadResult = {
  drafts: Draft[];
  /** An English i18n key, for the caller's t(). */
  error: string | null;
  /** Uploaded URL, whether or not any draft kept it — see discardAttachments. */
  uploaded: string | null;
  /** A task came out of the photo but the photo couldn't be stored. */
  pinFailed: boolean;
};

export async function readPhoto(file: Blob, userId: string): Promise<PhotoReadResult> {
  let data: string;
  try {
    data = await downscaleImage(file);
  } catch {
    return {
      drafts: [],
      error: "This photo format can't be read here. Try a JPEG, or take a screenshot of it.",
      uploaded: null,
      pinFailed: false,
    };
  }

  const upload = uploadAttachment(jpegBlobFromBase64(data), userId).catch(() => null);

  let drafts: Draft[] = [];
  let error: string | null = null;
  try {
    const r = await parseImage({ data, mediaType: "image/jpeg" });
    if (r.ok) drafts = r.drafts;
    else error = r.error;
  } catch {
    error = "Something went wrong. Try again.";
  }

  const url = await upload;
  const hasTask = drafts.some((d) => d.kind === "task");
  return {
    drafts: drafts.map((d) => ({ ...d, imageUrl: url })),
    error,
    uploaded: url,
    pinFailed: hasTask && !url,
  };
}
