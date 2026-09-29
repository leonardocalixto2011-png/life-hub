"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { setTaskImage } from "@/app/(app)/tasks/actions";
import { FormSection } from "@/components/Form";
import { PhotoThumb } from "@/components/PhotoViewer";
import { useT } from "@/components/I18nProvider";
import { downscaleImage } from "@/lib/downscale";
import { jpegBlobFromBase64, uploadAttachment } from "@/lib/attachments";

/**
 * The task's pinned photo: shown large, tap for full screen; add, replace or
 * remove it. Saved immediately rather than with the form below, so the edit
 * form can never clear a photo it doesn't know about.
 */
export function TaskPhoto({
  taskId,
  title,
  imageUrl,
  userId,
}: {
  taskId: string;
  title: string;
  imageUrl: string | null;
  userId: string;
}) {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setError(null);
    start(async () => {
      try {
        // Same 1600px JPEG as a photo read by quick-add — a phone original is
        // 5–10× the bytes for nothing a list thumbnail or a zoom needs.
        const small = jpegBlobFromBase64(await downscaleImage(file));
        const url = await uploadAttachment(small, userId);
        await setTaskImage(taskId, url);
        router.refresh();
      } catch {
        setError(t("The photo couldn't be uploaded. Try again in a moment."));
      }
    });
  }

  function remove() {
    setError(null);
    start(async () => {
      try {
        await setTaskImage(taskId, null);
        router.refresh();
      } catch {
        setError(t("Could not save"));
      }
    });
  }

  return (
    <FormSection title={t("Photo")}>
      {imageUrl && <PhotoThumb src={imageUrl} alt={title} size="full" />}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={pending}
          className="btn btn-secondary flex-1"
        >
          {pending ? (
            <Loader2 size={16} strokeWidth={2} className="animate-spin" aria-hidden />
          ) : imageUrl ? (
            <RefreshCw size={16} strokeWidth={2} aria-hidden />
          ) : (
            <ImagePlus size={16} strokeWidth={2} aria-hidden />
          )}
          {imageUrl ? t("Replace photo") : t("Attach a photo")}
        </button>
        {imageUrl && (
          <button type="button" onClick={remove} disabled={pending} className="btn btn-quiet-danger">
            <Trash2 size={16} strokeWidth={2} aria-hidden />
            {t("Remove")}
          </button>
        )}
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={onFile}
        className="hidden"
        tabIndex={-1}
        aria-hidden
      />
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </FormSection>
  );
}
