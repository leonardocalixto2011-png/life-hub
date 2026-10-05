"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Loader2, Trash2 } from "lucide-react";

import { Avatar } from "@/components/Avatar";
import { useT } from "@/components/I18nProvider";
import { downscaleImage } from "@/lib/downscale";
import { jpegBlobFromBase64, uploadAttachment } from "@/lib/attachments";
import { setAvatar } from "./actions";

/**
 * Profile photo: pick or take one, it's shrunk on the phone, uploaded straight
 * to our Blob store, then saved. Shown to the people in your hubs.
 */
export function AvatarUpload({
  userId,
  name,
  email,
  avatarUrl,
}: {
  userId: string;
  name: string | null;
  email: string;
  avatarUrl: string | null;
}) {
  const t = useT();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(work: () => Promise<void>) {
    setError(null);
    start(async () => {
      try {
        await work();
        router.refresh();
      } catch {
        setError(t("The photo couldn't be uploaded. Try again in a moment."));
      }
    });
  }

  function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    run(async () => {
      const small = jpegBlobFromBase64(await downscaleImage(file));
      await setAvatar(await uploadAttachment(small, userId));
    });
  }

  return (
    <div className="flex items-center gap-4">
      <Avatar name={name} email={email} src={avatarUrl} size={64} />
      <div className="flex flex-1 flex-wrap gap-2">
        <button type="button" className="btn btn-secondary btn-sm" disabled={pending} onClick={() => input.current?.click()}>
          {pending ? (
            <Loader2 size={14} className="animate-spin" aria-hidden />
          ) : (
            <Camera size={14} strokeWidth={2} aria-hidden />
          )}
          {avatarUrl ? t("Change photo") : t("Add a photo")}
        </button>
        {avatarUrl && (
          <button type="button" className="btn btn-quiet-danger btn-sm" disabled={pending} onClick={() => run(() => setAvatar(null))}>
            <Trash2 size={14} strokeWidth={2} aria-hidden />
            {t("Remove")}
          </button>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" onChange={onFile} className="hidden" tabIndex={-1} aria-hidden />
      {error && <p className="basis-full text-xs text-[var(--color-danger)]">{error}</p>}
    </div>
  );
}
