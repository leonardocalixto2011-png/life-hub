"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Info, ListPlus, ScanText, Sparkles } from "lucide-react";

import { createTask, discardAttachments } from "@/app/(app)/tasks/actions";
import {
  parseQuickAdd,
  commitDrafts,
  type Draft,
} from "@/app/(app)/quick-actions";
import { DraftCard } from "@/components/DraftCard";
import { FormSection } from "@/components/Form";
import { useT } from "@/components/I18nProvider";
import { readPhoto } from "@/lib/photo-read";
import { showToast } from "@/components/Toast";
import type { SplitMember } from "@/components/SplitControl";

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
  userId,
  ventures,
  aiEnabled,
  members,
  currency,
  sharedImages = false,
  notices = { more: 0, skipped: 0, noFile: false, error: false },
}: {
  /** The hub's active members: lets a shared receipt be split on its draft card. */
  members?: SplitMember[];
  currency?: string;
  initialText: string;
  /** Whose attachment folder a pinned photo uploads into. */
  userId: string;
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
  // Photos uploaded while reading; handed to discardAttachments when the
  // review ends, which keeps only the ones a saved task points at.
  const uploadsRef = useRef<string[]>([]);

  function releaseUploads() {
    const urls = uploadsRef.current;
    uploadsRef.current = [];
    if (urls.length) void discardAttachments(urls).catch(() => {});
  }

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
      releaseUploads();
      const found: Draft[] = [];
      const problems: string[] = [];
      for (let i = 0; i < images.length; i++) {
        setMsg(
          images.length > 1
            ? t("Reading photo {i} of {n}…", { i: i + 1, n: images.length })
            : t("Reading the photo…"),
        );
        // Read and upload together, so a "buy this" photo stays pinned to the
        // task it becomes — same as quick-add.
        const r = await readPhoto(images[i].blob, userId);
        if (r.uploaded) uploadsRef.current.push(r.uploaded);
        found.push(...r.drafts);
        if (r.error) problems.push(t(r.error));
        if (r.pinFailed) problems.push(t("The photo couldn't be attached this time — the items below are still fine."));
      }
      if (found.length) setDrafts(found.slice(0, 25));
      else releaseUploads();
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
        if (r.ok) {
          releaseUploads();
          // A split expense: say where the shared balance now stands. A toast,
          // because this screen is about to be replaced.
          if (r.balance) showToast({ message: r.balance });
          router.replace("/today");
        }
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
    <div className="space-y-5">
      {noticeLines.length > 0 && (
        <div className="card flex items-start gap-2 p-4 text-sm text-[var(--color-text-dim)]" role="status">
          <Info size={17} strokeWidth={2} aria-hidden className="mt-0.5 shrink-0 text-[var(--color-primary)]" />
          <div className="space-y-1">
            {noticeLines.map((line) => (
              <p key={line}>{line}</p>
            ))}
          </div>
        </div>
      )}

      {images.length > 0 && !drafts && (
        <FormSection title={t("Photos")}>
          <div className="flex gap-2">
            {images.map((img, i) => (
              // eslint-disable-next-line @next/next/no-img-element -- a local blob: URL, nothing for next/image to optimise
              <img
                key={img.url}
                src={img.url}
                alt={t("Shared photo {i}", { i: i + 1 })}
                className="h-20 w-20 rounded-[var(--r-md)] object-cover"
              />
            ))}
          </div>
          {aiEnabled && (
            <button onClick={readPhotos} disabled={pending} className="btn btn-primary w-full">
              <ScanText size={17} strokeWidth={2} aria-hidden />
              {pending
                ? t("Reading…")
                : images.length > 1
                  ? t("Read {n} photos", { n: images.length })
                  : t("Read the photo")}
            </button>
          )}
        </FormSection>
      )}

      {!drafts && (
        <FormSection title={t("Shared content")}>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            className="field"
            aria-label={t("Shared content")}
          />
          <div className="form-stack gap-2">
            {aiEnabled && (
              <button
                onClick={parse}
                disabled={pending || !text.trim()}
                className={`btn w-full ${images.length ? "btn-secondary" : "btn-primary btn-lg"}`}
              >
                <Sparkles size={17} strokeWidth={2} aria-hidden />
                {pending ? t("Reading…") : t("Parse")}
              </button>
            )}
            <button
              onClick={saveAsTask}
              disabled={pending || !text.trim()}
              className={`btn w-full ${aiEnabled ? "btn-secondary" : "btn-primary btn-lg"}`}
            >
              <ListPlus size={17} strokeWidth={2} aria-hidden />
              {t("Save as task")}
            </button>
          </div>
        </FormSection>
      )}

      {drafts && (
        <section className="space-y-3">
          <h2 className="section-title">{t("Review before saving:")}</h2>
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              draft={d}
              ventures={ventures}
              members={members}
              currentUserId={userId}
              currency={currency}
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
          <button onClick={saveDrafts} disabled={pending} className="btn btn-primary btn-lg w-full">
            <Check size={18} strokeWidth={2.25} aria-hidden />
            {pending ? t("Saving…") : t("Save {n}", { n: drafts.length })}
          </button>
          <button
            onClick={() => {
              setDrafts(null);
              releaseUploads();
            }}
            disabled={pending}
            className="btn btn-ghost w-full"
          >
            {t("Back")}
          </button>
        </section>
      )}

      {msg && (
        <p role="status" className="px-1 text-sm text-[var(--color-text-dim)]">
          {msg}
        </p>
      )}
    </div>
  );
}
