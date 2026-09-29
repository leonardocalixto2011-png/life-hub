"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTask } from "@/app/(app)/tasks/actions";
import {
  parseQuickAdd,
  parseImage,
  commitDrafts,
  type Draft,
} from "@/app/(app)/quick-actions";
import { DraftCard } from "@/components/DraftCard";
import { useT } from "@/components/I18nProvider";
import { downscaleImage } from "@/lib/downscale";

/** Must match SHARE_CACHE / SHARE_MAX_IMAGES in public/sw.js. */
const SHARE_CACHE = "lifehub-share-v1";
const SHARE_MAX_IMAGES = 3;

/**
 * Takes the photos public/sw.js parked for this share out of the Cache API,
 * in the order they were shared, and deletes them — they are read once. Empty
 * when the page is reloaded after they were consumed.
 */
/** How long a shared photo may wait in the cache before it is discarded. */
const SHARE_MAX_AGE_MS = 5 * 60 * 1000;

async function takeSharedImages(): Promise<Blob[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(SHARE_CACHE);
  const out: Blob[] = [];
  for (let i = 0; i < SHARE_MAX_IMAGES; i++) {
    const res = await cache.match(`/__share/${i}`);
    // Photos parked by a share that never reached this page (it landed on
    // the sign-in screen, say) must not be read by whoever opens /share next
    // on the same device. public/sw.js stamps each one when it stores it.
    const at = Number(res?.headers.get("X-Shared-At"));
    if (res && Number.isFinite(at) && Date.now() - at < SHARE_MAX_AGE_MS) out.push(await res.blob());
  }
  await caches.delete(SHARE_CACHE);
  return out;
}

export type ShareNotices = { more: number; skipped: number; noFile: boolean; error: boolean };

export function ShareCapture({
  initialText,
  ventures,
  aiEnabled,
  sharedImages = false,
  notices = { more: 0, skipped: 0, noFile: false, error: false },
}: {
  initialText: string;
  ventures: { id: string; name: string }[];
  aiEnabled: boolean;
  sharedImages?: boolean;
  notices?: ShareNotices;
}) {
  const router = useRouter();
  const t = useT();
  const [text, setText] = useState(initialText);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [images, setImages] = useState<{ blob: Blob; url: string }[]>([]);
  const arrived = useRef(false);

  // Nothing here calls Claude on arrival. /share/receive is a plain POST
  // endpoint, so any website can auto-submit a form to it: if landing here
  // parsed automatically, visiting a hostile page would silently spend the
  // viewer's AI budget. Arrival only *shows* what came in; every parse is a
  // tap on the button below.
  useEffect(() => {
    if (arrived.current) return;
    arrived.current = true;

    // The share flags have done their job; a reload shouldn't re-announce them.
    const url = new URL(window.location.href);
    for (const k of ["shared", "more", "skipped", "nofile", "shareError"]) url.searchParams.delete(k);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

    if (!sharedImages) return;
    void takeSharedImages()
      .catch(() => [] as Blob[])
      .then((blobs) => {
        if (!blobs.length) {
          setMsg(t("The shared photo is no longer here — share it again."));
          return;
        }
        setImages(blobs.map((blob) => ({ blob, url: URL.createObjectURL(blob) })));
        if (!aiEnabled) setMsg(t("Reading photos needs the assistant, which isn't set up on this server."));
      });
  }, [aiEnabled, sharedImages, t]);

  // Thumbnails are object URLs; release them when the set changes or the page goes.
  useEffect(() => () => images.forEach((i) => URL.revokeObjectURL(i.url)), [images]);

  /** One tap reads every shared photo, one at a time. */
  function readPhotos() {
    if (!images.length) return;
    setMsg(null);
    start(async () => {
      // One at a time: each is a paid call against the same hourly budget,
      // and a failure on one photo shouldn't lose the others.
      const found: Draft[] = [];
      const problems: string[] = [];
      for (let i = 0; i < images.length; i++) {
        setMsg(
          images.length > 1
            ? t("Reading photo {i} of {n}…", { i: i + 1, n: images.length })
            : t("Reading the photo…"),
        );
        let data: string;
        try {
          data = await downscaleImage(images[i].blob);
        } catch {
          problems.push(t("This photo format can't be read here. Try a JPEG, or take a screenshot of it."));
          continue;
        }
        try {
          const r = await parseImage({ data, mediaType: "image/jpeg" });
          if (r.ok) found.push(...r.drafts);
          else problems.push(t(r.error));
        } catch {
          problems.push(t("Something went wrong. Try again."));
        }
      }
      if (found.length) setDrafts(found.slice(0, 25));
      setMsg(problems.length ? Array.from(new Set(problems)).join(" ") : null);
    });
  }

  function parse() {
    setMsg(null);
    start(async () => {
      try {
        const r = await parseQuickAdd(text);
        if (r.ok) setDrafts(r.drafts);
        else setMsg(t(r.error));
      } catch {
        setMsg(t("Something went wrong. Try again."));
      }
    });
  }

  function saveDrafts() {
    if (!drafts?.length) return;
    start(async () => {
      try {
        const r = await commitDrafts(drafts);
        if (r.ok) router.replace("/today");
        else setMsg(t(r.error ?? "Could not save"));
      } catch {
        setMsg(t("Something went wrong. Try again."));
      }
    });
  }

  function saveAsTask() {
    const fd = new FormData();
    fd.set("title", text.trim().slice(0, 200) || t("Shared note"));
    fd.set("priority", "MED");
    fd.set("isRecurring", "false");
    start(async () => {
      await createTask(fd);
      router.replace("/today");
    });
  }

  const noticeLines = [
    notices.error && t("Something went wrong receiving that share. Try sharing it again."),
    notices.noFile &&
      t("The photo couldn't come through this time (the app was still starting). Open Life Hub once, then share it again."),
    notices.more > 0 && t("Only the first 3 photos are read — share the rest separately."),
    notices.skipped > 0 && t("Only photos can be read — other files were skipped."),
  ].filter((x): x is string => Boolean(x));

  return (
    <div className="space-y-3">
      {noticeLines.length > 0 && (
        <div className="card space-y-1 p-3 text-xs text-[var(--color-text-dim)]" role="status">
          {noticeLines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
      )}

      {images.length > 0 && !drafts && (
        <div className="card space-y-3 p-3">
          <div className="flex gap-2">
            {images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, nothing for next/image to optimise
              <img
                key={img.url}
                src={img.url}
                alt={t("Shared photo {i}", { i: i + 1 })}
                className="h-20 w-20 rounded-lg object-cover"
              />
            ))}
          </div>
          {aiEnabled && (
            <button onClick={readPhotos} disabled={pending} className="btn btn-primary w-full">
              {pending
                ? t("Reading…")
                : images.length > 1
                  ? t("Read {n} photos", { n: images.length })
                  : t("Read the photo")}
            </button>
          )}
        </div>
      )}

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={4}
        className="field"
        aria-label={t("Shared content")}
      />

      {!drafts && (
        <div className="flex gap-2">
          {aiEnabled && (
            <button
              onClick={parse}
              disabled={pending || !text.trim()}
              className={`btn flex-1${images.length ? "" : " btn-primary"}`}
            >
              {pending ? t("Reading…") : t("Parse")}
            </button>
          )}
          <button onClick={saveAsTask} disabled={pending || !text.trim()} className="btn flex-1">
            {t("Save as task")}
          </button>
        </div>
      )}

      {drafts && (
        <div className="space-y-2">
          <p className="text-xs font-semibold text-[var(--color-text-dim)]">
            {t("Review before saving:")}
          </p>
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              draft={d}
              ventures={ventures}
              onChange={(patch) =>
                setDrafts((cur) => cur?.map((x, idx) => (idx === i ? { ...x, ...patch } : x)) ?? null)
              }
              onRemove={() =>
                setDrafts((cur) => {
                  const next = cur?.filter((_, idx) => idx !== i) ?? [];
                  return next.length ? next : null;
                })
              }
            />
          ))}
          <div className="flex gap-2">
            <button onClick={saveDrafts} disabled={pending} className="btn btn-primary flex-1">
              {pending ? t("Saving…") : t("Save {n}", { n: drafts.length })}
            </button>
            <button onClick={() => setDrafts(null)} disabled={pending} className="btn">
              {t("Back")}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="text-xs text-[var(--color-text-dim)]">{msg}</p>}
    </div>
  );
}
