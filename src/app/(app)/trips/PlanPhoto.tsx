"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ImagePlus, Link2, Loader2, RefreshCw, Trash2 } from "lucide-react";

import { FormSection } from "@/components/Form";
import { PhotoThumb } from "@/components/PhotoViewer";
import { useT } from "@/components/I18nProvider";
import { downscaleImage } from "@/lib/downscale";
import { jpegBlobFromBase64, uploadAttachment } from "@/lib/attachments";

/**
 * A photo for a trip or one item of its plan: take or pick one from the phone,
 * or paste a link to one on the web (the server copies it into our storage, so
 * nobody's browser ever loads it from the other site). Saved on the spot, like
 * a task's photo, so the form beside it can never clear it by accident.
 */
export function PlanPhoto({
  imageUrl,
  alt,
  userId,
  save,
  saveLink,
}: {
  imageUrl: string | null;
  alt: string;
  userId: string;
  save: (url: string | null) => Promise<void>;
  saveLink: (link: string) => Promise<void>;
}) {
  const t = useT();
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [link, setLink] = useState("");

  function run(work: () => Promise<void>, failure: string) {
    setError(null);
    start(async () => {
      try {
        await work();
        router.refresh();
      } catch {
        setError(failure);
      }
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    run(async () => {
      const small = jpegBlobFromBase64(await downscaleImage(file));
      await save(await uploadAttachment(small, userId));
    }, t("The photo couldn't be uploaded. Try again in a moment."));
  }

  function onLink() {
    const value = link.trim();
    if (!value) return;
    run(async () => {
      await saveLink(value);
      setLink("");
    }, t("That link isn't a photo we could copy. Try another one."));
  }

  return (
    <FormSection title={t("Photo")}>
      {imageUrl && <PhotoThumb src={imageUrl} alt={alt} size="full" />}
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
          {imageUrl ? t("Replace photo") : t("Add a photo")}
        </button>
        {imageUrl && (
          <button
            type="button"
            onClick={() => run(() => save(null), t("Could not save"))}
            disabled={pending}
            className="btn btn-quiet-danger"
          >
            <Trash2 size={16} strokeWidth={2} aria-hidden />
            {t("Remove")}
          </button>
        )}
      </div>
      <div className="flex gap-2">
        <input
          type="url"
          inputMode="url"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder={t("…or paste a photo link (https://…)")}
          aria-label={t("Photo link")}
          className="field min-w-0 flex-1"
        />
        <button type="button" onClick={onLink} disabled={pending || !link.trim()} className="btn btn-secondary">
          <Link2 size={16} strokeWidth={2} aria-hidden />
          {t("Use")}
        </button>
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
