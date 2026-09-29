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
async function takeSharedImages(): Promise<Blob[]> {
  if (typeof caches === "undefined") return [];
  const cache = await caches.open(SHARE_CACHE);
  const out: Blob[] = [];
  for (let i = 0; i < SHARE_MAX_IMAGES; i++) {
    const res = await cache.match(`/__share/${i}`);
    if (res) out.push(await res.blob());
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
  const parsedOnce = useRef(false);

  // Auto-parse the shared content once on arrival: the photos if the share
  // sheet sent any, otherwise the text.
  useEffect(() => {
    if (parsedOnce.current) return;
    parsedOnce.current = true;

    // The share flags have done their job; a reload shouldn't re-announce them.
    const url = new URL(window.location.href);
    for (const k of ["shared", "more", "skipped", "nofile", "shareError"]) url.searchParams.delete(k);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

    if (sharedImages) {
      start(async () => {
        const images = await takeSharedImages().catch(() => [] as Blob[]);
        if (!images.length) {
          setMsg(t("The shared photo is no longer here — share it again."));
          return;
        }
        if (!aiEnabled) {
          setMsg(t("Reading photos needs the assistant, which isn't set up on this server."));
          return;
        }
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
            data = await downscaleImage(images[i]);
          } catch {
            problems.push(t("This photo format can't be read here. Try a JPEG, or take a screenshot of it."));
            continue;
          }
          const r = await parseImage({ data, mediaType: "image/jpeg" });
          if (r.ok) found.push(...r.drafts);
          else problems.push(t(r.error));
        }
        if (found.length) setDrafts(found.slice(0, 25));
        setMsg(problems.length ? Array.from(new Set(problems)).join(" ") : null);
      });
      return;
    }

    if (!aiEnabled || !initialText.trim()) return;
    start(async () => {
      const r = await parseQuickAdd(initialText);
      if (r.ok) setDrafts(r.drafts);
      else setMsg(t(r.error));
    });
  }, [aiEnabled, initialText, sharedImages, t]);

  function parse() {
    setMsg(null);
    start(async () => {
      const r = await parseQuickAdd(text);
      if (r.ok) setDrafts(r.drafts);
      else setMsg(t(r.error));
    });
  }

  function saveDrafts() {
    if (!drafts?.length) return;
    start(async () => {
      const r = await commitDrafts(drafts);
      if (r.ok) router.replace("/today");
      else setMsg(t(r.error ?? "Could not save"));
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
            <button onClick={parse} disabled={pending || !text.trim()} className="btn btn-primary flex-1">
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
