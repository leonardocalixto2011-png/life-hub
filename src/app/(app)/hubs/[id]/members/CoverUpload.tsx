"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";
import { Trash2, ImagePlus } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { setHubCover, removeHubCover } from "@/app/(app)/hubs/actions";

/**
 * Owner-only control for the hub's shared cover photo.
 *
 * Reuses the same client-upload route as personal backgrounds — the browser
 * sends the file straight to Blob storage, so a phone photo isn't squeezed
 * through the 4.5MB Server Action body limit. What differs is the *save*:
 * setHubCover re-checks hub ownership on the server, because this image is
 * chosen for other people.
 */
export function CoverUpload({ hubId, hasCover }: { hubId: string; hasCover: boolean }) {
  const t = useT();
  const [pending, setPending] = useState(false);
  const [removing, startRemove] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  async function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setPending(true);
    setError(null);
    try {
      const blob = await upload(file.name, file, {
        access: "public",
        handleUploadUrl: "/api/appearance/upload",
      });
      await setHubCover(hubId, blob.url);
    } catch (err) {
      setError(err instanceof Error ? t(err.message) : t("Upload failed — try again."));
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      {/* A label styled as a button around a hidden input: the native control
          reads "Choose File · No file chosen" in English whatever the app's
          language, and can't be styled. */}
      <label
        className="btn btn-secondary w-full cursor-pointer has-[:disabled]:opacity-60"
        aria-disabled={pending || removing}
      >
        <ImagePlus size={16} strokeWidth={2} aria-hidden />
        {hasCover ? t("Replace the hub cover photo") : t("Add a hub cover photo")}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={pending || removing}
          onChange={handleChange}
          className="sr-only"
        />
      </label>
      <p className="field-hint mt-0">
        {t("Everyone in this hub sees this one, and it's the first thing on an invite. Your own background photo stays private.")}
      </p>
      {pending && <p className="text-xs text-[var(--color-text-dim)]">{t("Uploading…")}</p>}
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      {hasCover && !pending && (
        <button
          type="button"
          disabled={removing}
          onClick={() => startRemove(() => removeHubCover(hubId).catch(() => {}))}
          className="btn btn-quiet-danger btn-sm"
        >
          <Trash2 size={14} strokeWidth={2} aria-hidden />
          {removing ? t("Removing…") : t("Remove cover photo")}
        </button>
      )}
    </div>
  );
}
