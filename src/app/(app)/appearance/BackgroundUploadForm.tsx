"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";
import { ImagePlus } from "lucide-react";

import { useT } from "@/components/I18nProvider";
import { setBackgroundImage } from "./actions";

export function BackgroundUploadForm() {
  const t = useT();
  const [pending, setPending] = useState(false);
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
      await setBackgroundImage(blob.url);
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
        aria-disabled={pending}
      >
        <ImagePlus size={16} strokeWidth={2} aria-hidden />
        {t("Choose a background photo")}
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          disabled={pending}
          onChange={handleChange}
          className="sr-only"
        />
      </label>
      {pending && <p className="text-xs text-[var(--color-text-dim)]">{t("Uploading…")}</p>}
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
