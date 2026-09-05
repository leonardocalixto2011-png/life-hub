"use client";

import { useRef, useState } from "react";
import { upload } from "@vercel/blob/client";

import { setBackgroundImage } from "./actions";

export function BackgroundUploadForm() {
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
      setError(err instanceof Error ? err.message : "Upload failed — try again.");
    } finally {
      setPending(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div className="space-y-2">
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={pending}
        onChange={handleChange}
        className="field w-full"
      />
      {pending && <p className="text-xs text-[var(--color-text-dim)]">Uploading…</p>}
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
