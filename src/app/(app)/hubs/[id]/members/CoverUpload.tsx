"use client";

import { useRef, useState, useTransition } from "react";
import { upload } from "@vercel/blob/client";

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
        disabled={pending || removing}
        onChange={handleChange}
        className="field w-full"
        aria-label={hasCover ? "Replace the hub cover photo" : "Add a hub cover photo"}
      />
      <p className="text-[0.65rem] text-[var(--color-text-dim)]">
        Everyone in this hub sees this one, and it&apos;s the first thing on an invite. Your
        own background photo stays private.
      </p>
      {pending && <p className="text-xs text-[var(--color-text-dim)]">Uploading…</p>}
      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      {hasCover && !pending && (
        <button
          type="button"
          disabled={removing}
          onClick={() => startRemove(() => removeHubCover(hubId).catch(() => {}))}
          className="text-[0.68rem] font-semibold text-[var(--color-danger)] underline"
        >
          {removing ? "Removing…" : "Remove cover photo"}
        </button>
      )}
    </div>
  );
}
