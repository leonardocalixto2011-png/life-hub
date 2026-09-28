"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";

import { createTask } from "@/app/(app)/tasks/actions";
import {
  parseQuickAdd,
  parseImage,
  commitDrafts,
  type Draft,
  type ParseResult,
} from "@/app/(app)/quick-actions";
import { DraftCard } from "@/components/DraftCard";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useLang, useT } from "@/components/I18nProvider";

type Option = { id: string; name: string | null; email?: string | null };

/** Heuristic: does this look like a sentence worth parsing, vs. a bare title? */
function worthParsing(text: string): boolean {
  const t = text.trim();
  if (t.length < 6) return false;
  return (
    /\d/.test(t) || // a number (date/amount)
    /\$|€|\bby\b|\bon\b|\bevery\b|\brenew|\bdue\b|\bpay\b|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week/i.test(
      t,
    ) ||
    t.split(/\s+/).length >= 5
  );
}

// ---- voice ---------------------------------------------------------------
// The Web Speech API isn't in TypeScript's DOM lib (only its result types
// are), and Chrome/Safari still ship it prefixed. Just the surface used here.
type Recognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((e: { results: SpeechRecognitionResultList }) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type RecognitionCtor = new () => Recognition;

function speechCtor(): RecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// Support never changes while the page is open; useSyncExternalStore is here
// for its server snapshot (no mic button in the HTML), so hydration matches
// and a browser without the API — iOS home-screen PWAs, Firefox — simply
// never shows the button.
const noop = () => () => {};
const readSpeech = () => speechCtor() !== null;

// ---- snap ----------------------------------------------------------------
/** Long edge after downscaling. Plenty for a receipt's small print. */
const SNAP_MAX_EDGE = 1600;

/**
 * Photo file → base64 JPEG, at most SNAP_MAX_EDGE on the long side. Goes
 * through an <img> rather than createImageBitmap because <img> applies the
 * EXIF rotation, so a portrait receipt isn't sent sideways. Throws when the
 * browser can't decode the file at all — HEIC outside Safari, mainly.
 */
async function downscale(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, SNAP_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no canvas");
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.8);
    const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    if (!dataUrl.startsWith("data:image/jpeg") || !b64) throw new Error("encode failed");
    return b64;
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function QuickAdd({
  ventures,
  members,
  defaultAssigneeId,
  aiEnabled,
}: {
  ventures: { id: string; name: string }[];
  members: Option[];
  defaultAssigneeId?: string;
  aiEnabled: boolean;
}) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const recRef = useRef<Recognition | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [listening, setListening] = useState(false);
  // Set by the home-screen shortcuts when the browser won't open the camera
  // or mic without a tap: a big one-tap button replaces the missing gesture.
  const [prompt, setPrompt] = useState<"snap" | "voice" | null>(null);
  const [pending, startTransition] = useTransition();
  const canSpeak = useSyncExternalStore(noop, readSpeech, () => false);

  function reset() {
    formRef.current?.reset();
    setDrafts(null);
    setOpen(false);
  }

  /** After anything lands, the cursor is back in the box for the next one. */
  function ready() {
    inputRef.current?.focus();
  }

  function showParsed(r: Extract<ParseResult, { ok: true }>) {
    setDrafts(r.drafts);
    if (r.truncated) {
      setMsg(
        t("Only got through {n} items — the rest didn't fit. Review these, then paste the remainder separately.", { n: r.drafts.length }),
      );
    }
  }

  /** Sentence → AI drafts, falling back to a plain task if parsing fails. */
  function parseAndReview(title: string, fd: FormData) {
    startTransition(async () => {
      const r = await parseQuickAdd(title);
      if (r.ok) {
        showParsed(r);
      } else {
        setMsg(`${t(r.error)} — ${t("added as a plain task.")}`);
        await createTask(fd);
        reset();
        router.refresh();
        ready();
      }
    });
  }

  function addPlain(fd: FormData) {
    startTransition(async () => {
      try {
        await createTask(fd);
        reset();
        router.refresh();
        ready();
      } catch (err) {
        setMsg(err instanceof Error ? t(err.message) : t("Could not add"));
      }
    });
  }

  function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const title = String(fd.get("title") ?? "").trim();
    if (!title) return;
    setMsg(null);

    if (aiEnabled && !open && worthParsing(title)) parseAndReview(title, fd);
    else addPlain(fd);
  }

  // ---- voice ---------------------------------------------------------------
  function startVoice() {
    const Ctor = speechCtor();
    if (!Ctor || recRef.current) return;
    setPrompt(null);
    setMsg(null);

    const rec = new Ctor();
    rec.lang = lang === "fr" ? "fr-CA" : "en-CA";
    rec.interimResults = true;
    rec.continuous = false; // one utterance, then straight into review
    rec.maxAlternatives = 1;

    let finalText = "";
    let cancelled = false;
    rec.onresult = (e) => {
      let interim = "";
      finalText = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalText += r[0].transcript;
        else interim += r[0].transcript;
      }
      // Live transcript in the box, so a misheard word is visible at once.
      if (inputRef.current) inputRef.current.value = (finalText + interim).trim();
    };
    rec.onerror = (e) => {
      if (e.error === "aborted") cancelled = true;
      else if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setMsg(t("Microphone access is blocked. Allow it in your browser settings to use voice."));
      } else if (e.error === "no-speech") {
        setMsg(t("Didn't catch that — try again."));
      } else {
        setMsg(t("Voice input stopped. Try again, or type it."));
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      const spoken = finalText.trim();
      if (cancelled || !spoken) return;
      if (inputRef.current) inputRef.current.value = spoken;
      // Speaking a sentence is asking for it to be understood, so it skips the
      // typed path's "is this worth parsing?" guess and goes straight to review.
      const fd = formRef.current ? new FormData(formRef.current) : new FormData();
      fd.set("title", spoken);
      if (aiEnabled) parseAndReview(spoken, fd);
      else addPlain(fd);
    };

    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      // Some browsers refuse to start without a tap (the shortcut path).
      setPrompt("voice");
    }
  }

  /** Second tap: stop and use what was heard so far. */
  function toggleVoice() {
    if (recRef.current) recRef.current.stop();
    else startVoice();
  }

  // Leaving the page mid-sentence shouldn't leave the mic open.
  useEffect(() => () => recRef.current?.abort(), []);

  // ---- snap ----------------------------------------------------------------
  function openCamera() {
    setPrompt(null);
    fileRef.current?.click();
  }

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // so picking the same photo again still fires
    if (!file) return;
    setMsg(t("Reading the photo…"));
    setDrafts(null);
    startTransition(async () => {
      let data: string;
      try {
        data = await downscale(file);
      } catch {
        setMsg(t("This photo format can't be read here. Try a JPEG, or take a screenshot of it."));
        return;
      }
      const r = await parseImage({ data, mediaType: "image/jpeg" });
      if (r.ok) {
        setMsg(null);
        showParsed(r);
      } else {
        setMsg(t(r.error));
      }
    });
  }

  // ---- home-screen shortcuts ----------------------------------------------
  // manifest.ts points "Add" / "Speak" / "Snap a receipt" at /today?add=1,
  // ?voice=1, ?snap=1. Read once from window.location rather than
  // useSearchParams: this component lives in the app layout, and the param
  // is consumed and removed on arrival, not something to re-render on.
  useEffect(() => {
    const url = new URL(window.location.href);
    const params = url.searchParams;
    const wants = params.get("snap") ? "snap" : params.get("voice") ? "voice" : params.get("add") ? "add" : null;
    if (!wants) return;
    for (const k of ["add", "voice", "snap"]) params.delete(k);
    window.history.replaceState(window.history.state, "", url.pathname + url.search + url.hash);

    // Deferred a tick so state set here lands after hydration, not inside it.
    const id = window.setTimeout(() => {
      if (wants === "add") inputRef.current?.focus();
      // A file picker needs a real tap in every browser; the mic sometimes does.
      else if (wants === "snap") setPrompt("snap");
      else if (speechCtor()) startVoice();
      else {
        inputRef.current?.focus();
        setMsg(t("Voice input isn't available in this browser — type it instead."));
      }
    }, 0);
    return () => window.clearTimeout(id);
    // Runs once on arrival; startVoice/t are stable enough for a one-shot.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---- review --------------------------------------------------------------
  function patchDraft(i: number, patch: Partial<Draft>) {
    setDrafts((cur) => cur?.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) ?? null);
  }

  function removeDraft(i: number) {
    setDrafts((cur) => {
      const next = cur?.filter((_, idx) => idx !== i) ?? [];
      return next.length ? next : null;
    });
  }

  function saveDrafts() {
    if (!drafts?.length) return;
    startTransition(async () => {
      const r = await commitDrafts(drafts);
      if (r.ok) {
        setMsg(`${t("Added {n}", { n: r.created.length })}: ${r.created.join(" · ")}`);
        reset();
        router.refresh();
        ready();
      } else {
        setMsg(r.error ?? t("Could not save"));
      }
    });
  }

  /** Escape backs out one level: the mic, then the review, then the text. */
  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key !== "Escape") return;
    if (recRef.current) {
      recRef.current.abort();
    } else if (drafts) {
      reset();
      ready();
    } else if (inputRef.current?.value || msg || prompt) {
      reset();
      setMsg(null);
      setPrompt(null);
    } else return;
    e.preventDefault();
  }

  return (
    <div
      className="border-b border-[var(--color-border)] bg-[var(--color-surface)] p-3"
      onKeyDown={onKeyDown}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        <div className="flex gap-2">
          <input
            ref={inputRef}
            name="title"
            placeholder={
              listening
                ? t("Listening…")
                : aiEnabled
                  ? t("Add anything — plain sentences work")
                  : t("Add a task…")
            }
            autoComplete="off"
            enterKeyHint="send"
            className="field min-w-0 flex-1"
            aria-label={t("Quick add")}
          />
          {canSpeak && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={pending && !listening}
              className={`btn shrink-0 px-2.5${listening ? " mic-live" : ""}`}
              aria-label={listening ? t("Stop listening") : t("Speak")}
              aria-pressed={listening}
              title={listening ? t("Stop listening") : t("Speak")}
            >
              <span aria-hidden>🎤</span>
            </button>
          )}
          {aiEnabled && (
            <button
              type="button"
              onClick={openCamera}
              disabled={pending}
              className="btn shrink-0 px-2.5"
              aria-label={t("Snap a photo")}
              title={t("Snap a photo")}
            >
              <span aria-hidden>📷</span>
            </button>
          )}
          <button type="submit" className="btn btn-primary shrink-0" disabled={pending}>
            {pending ? "…" : t("Add")}
          </button>
        </div>
        {aiEnabled && (
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPhoto}
            className="hidden"
            tabIndex={-1}
            aria-hidden
          />
        )}

        {prompt && (
          <button
            type="button"
            onClick={prompt === "snap" ? openCamera : startVoice}
            className="btn btn-primary mt-2 w-full py-3 text-base"
          >
            {prompt === "snap" ? `📷 ${t("Take photo")}` : `🎤 ${t("Tap to speak")}`}
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="mt-2 text-xs font-semibold text-[var(--color-text-dim)]"
        >
          {open ? t("Hide details") : t("+ Details")}
        </button>

        {open && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <label className="text-xs font-semibold text-[var(--color-text-dim)]">
              {t("Due")}
              <input type="date" name="dueDate" className="field mt-1" />
            </label>
            <label className="text-xs font-semibold text-[var(--color-text-dim)]">
              {t("Priority")}
              <select name="priority" defaultValue="MED" className="field mt-1">
                <option value="LOW">{t("Low")}</option>
                <option value="MED">{t("Medium")}</option>
                <option value="HIGH">{t("High")}</option>
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--color-text-dim)]">
              {t("Venture")}
              <select name="ventureId" defaultValue="" className="field mt-1">
                <option value="">—</option>
                {ventures.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs font-semibold text-[var(--color-text-dim)]">
              {t("Assignee")}
              <select
                name="assignedToId"
                defaultValue={defaultAssigneeId ?? ""}
                className="field mt-1"
              >
                <option value="">{t("Shared / unassigned")}</option>
                {members.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name ?? m.email}
                  </option>
                ))}
              </select>
            </label>
            <div className="col-span-2">
              <PrivacyToggle />
            </div>
          </div>
        )}
      </form>

      {drafts && (
        <div className="mt-3 space-y-2">
          <p className="text-xs font-semibold text-[var(--color-text-dim)]">
            {t("Review before saving — edit anything:")}
          </p>
          {drafts.map((d, i) => (
            <DraftCard
              key={i}
              draft={d}
              ventures={ventures}
              onChange={(patch) => patchDraft(i, patch)}
              onRemove={() => removeDraft(i)}
            />
          ))}
          <div className="flex gap-2">
            <button onClick={saveDrafts} disabled={pending} className="btn btn-primary flex-1">
              {pending
                ? t("Saving…")
                : drafts.length > 1
                  ? t("Save all ({n})", { n: drafts.length })
                  : t("Save")}
            </button>
            <button
              onClick={() => {
                reset();
                ready();
              }}
              disabled={pending}
              className="btn"
            >
              {t("Cancel")}
            </button>
          </div>
        </div>
      )}

      {msg && <p className="mt-2 text-xs text-[var(--color-text-dim)]" role="status">{msg}</p>}
    </div>
  );
}
