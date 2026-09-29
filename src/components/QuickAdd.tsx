"use client";

import { useEffect, useRef, useState, useSyncExternalStore, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowUp, Camera, ChevronDown, Images, Loader2, Mic, Paperclip, Pencil, SlidersHorizontal, Star, X } from "lucide-react";

import { createTask, discardAttachments } from "@/app/(app)/tasks/actions";
import {
  parseQuickAdd,
  commitDrafts,
  type Draft,
  type ParseResult,
} from "@/app/(app)/quick-actions";
import { DraftCard } from "@/components/DraftCard";
import { PrivacyToggle } from "@/components/PrivacyToggle";
import { useLang, useT } from "@/components/I18nProvider";
import { showToast } from "@/components/Toast";
import { applyFavorite, undoFavorite, saveDraftAsFavorite } from "@/app/(app)/favorites/actions";
import { downscaleImage } from "@/lib/downscale";
import { jpegBlobFromBase64, uploadAttachment } from "@/lib/attachments";
import { readPhoto } from "@/lib/photo-read";
import { sameFavorite, type FavoriteChip } from "@/lib/favorites";
import { dollarsToCents } from "@/lib/money";
import { haptic } from "@/lib/haptics";
import { QUICKADD_EVENT, type QuickAddIntent } from "@/lib/quickadd-bus";

type Option = { id: string; name: string | null; email?: string | null };

/** What "⭐ Save as favourite" would save, taken from the draft just committed. */
type FavOffer = {
  kind: "task" | "budget";
  title: string;
  amount: string | null;
  entryType: "INCOME" | "EXPENSE";
  ventureId: string | null;
};

/** The first saved draft worth repeating: a budget entry, or a task with an amount. */
function favoriteOffer(saved: Draft[], existing: FavoriteChip[]): FavOffer | null {
  const d = saved.find((x) => (x.kind === "budget" || x.kind === "task") && dollarsToCents(x.amount));
  if (!d || (d.kind !== "budget" && d.kind !== "task")) return null;
  const title = d.title.trim().slice(0, 60);
  if (!title) return null;
  const candidate = {
    label: title,
    kind: d.kind === "budget" ? "BUDGET" : "TASK",
    amountCents: dollarsToCents(d.amount),
    entryType: d.entryType,
  };
  if (existing.some((f) => sameFavorite(f, candidate))) return null;
  return { kind: d.kind, title, amount: d.amount, entryType: d.entryType, ventureId: d.ventureId };
}

/** Heuristic: does this look like a sentence worth parsing, vs. a bare title? */
function worthParsing(text: string): boolean {
  const t = text.trim();
  if (t.length < 6) return false;
  return (
    /\d/.test(t) || // a number (date/amount)
    /\$|€|\bby\b|\bon\b|\bevery\b|\brenew|\bdue\b|\bpay\b|tomorrow|tonight|monday|tuesday|wednesday|thursday|friday|saturday|sunday|next week/i.test(
      t,
    ) ||
    // The same signals in French. Without these, a short "payer hydro
    // vendredi" skipped parsing and was saved as a bare task.
    /demain|ce soir|aujourd|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|semaine prochaine|\bpayer\b|\bfacture|\brdv\b|rendez-vous|\bchaque\b|renouvel|[ée]ch[ée]ance|\bavant le\b/i.test(
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

export function QuickAdd({
  ventures,
  members,
  defaultAssigneeId,
  aiEnabled,
  favorites = [],
  userId,
}: {
  ventures: { id: string; name: string }[];
  members: Option[];
  defaultAssigneeId?: string;
  /** Whose attachment folder a pinned photo uploads into. */
  userId: string;
  aiEnabled: boolean;
  favorites?: FavoriteChip[];
}) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const formRef = useRef<HTMLFormElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const libraryRef = useRef<HTMLInputElement>(null);
  const [photoMenu, setPhotoMenu] = useState(false);
  const attachRef = useRef<HTMLInputElement>(null);
  // Details → "Attach a photo" for a plain task: held locally until Add.
  const [attached, setAttached] = useState<{ file: File; preview: string } | null>(null);
  // Every photo uploaded during this review. When it ends, each is handed to
  // discardAttachments, which keeps the ones a saved task now points at.
  const uploadsRef = useRef<string[]>([]);
  const recRef = useRef<Recognition | null>(null);
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Draft[] | null>(null);
  const [listening, setListening] = useState(false);
  // Set by the home-screen shortcuts when the browser won't open the camera
  // or mic without a tap: a big one-tap button replaces the missing gesture.
  const [prompt, setPrompt] = useState<"snap" | "voice" | null>(null);
  const [favOffer, setFavOffer] = useState<FavOffer | null>(null);
  const [favBusy, setFavBusy] = useState<string | null>(null);
  // State alone can't stop a double-tap: both taps land before the re-render
  // that would disable the chip, and each would record the entry.
  const favInFlight = useRef(false);
  const pressTimer = useRef<number | null>(null);
  const longPressed = useRef(false);
  const [pending, startTransition] = useTransition();
  const canSpeak = useSyncExternalStore(noop, readSpeech, () => false);

  /** Photos uploaded for a review that no saved task kept are deleted. */
  function releaseUploads() {
    const urls = uploadsRef.current;
    uploadsRef.current = [];
    if (urls.length) void discardAttachments(urls).catch(() => {});
  }

  function clearAttached() {
    setAttached((cur) => {
      if (cur) URL.revokeObjectURL(cur.preview);
      return null;
    });
  }

  function reset() {
    formRef.current?.reset();
    setDrafts(null);
    setOpen(false);
    clearAttached();
    releaseUploads();
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
      // A thrown server action (network drop, function timeout) would
      // otherwise bubble out of the transition to error.tsx and lose the
      // typed text. Nothing was created, so the text stays for a retry.
      let r: ParseResult;
      try {
        r = await parseQuickAdd(title);
      } catch {
        setMsg(t("Something went wrong. Try again."));
        return;
      }
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
    const photo = attached;
    startTransition(async () => {
      try {
        if (photo) {
          // Optional: a failed upload still adds the task, with a note.
          try {
            const small = jpegBlobFromBase64(await downscaleImage(photo.file));
            const url = await uploadAttachment(small, userId);
            uploadsRef.current.push(url);
            fd.set("imageUrl", url);
          } catch {
            setMsg(t("The photo couldn't be pinned — the item was added without it."));
          }
        }
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
    // Mid-dictation, "Add" (or Enter) means "that's it": stop the mic and let
    // its onend — the one path that submits spoken text — send it, exactly
    // once. Submitting here too would parse the same sentence twice.
    if (recRef.current) {
      recRef.current.stop();
      return;
    }
    const fd = new FormData(e.currentTarget);
    let title = String(fd.get("title") ?? "").trim();
    // A photo on its own is enough: nobody should have to type to pin one.
    if (!title && attached) {
      title = t("See photo");
      fd.set("title", title);
    }
    if (!title) return;
    setMsg(null);
    setFavOffer(null);

    if (aiEnabled && !open && !attached && worthParsing(title)) parseAndReview(title, fd);
    else addPlain(fd);
  }

  // ---- voice ---------------------------------------------------------------
  function startVoice() {
    const Ctor = speechCtor();
    if (!Ctor || recRef.current) return;
    setPrompt(null);
    setMsg(null);
    setFavOffer(null);

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
    setPhotoMenu(false);
    fileRef.current?.click();
  }

  /** Photos already on the phone — a receipt screenshot, last week's bill. */
  function openLibrary() {
    setPhotoMenu(false);
    libraryRef.current?.click();
  }

  // Up to 3 at once: each is its own paid read, and the review list gets long
  // past that. Read one after another so a burst doesn't trip the rate limit.
  const MAX_PHOTOS = 3;

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []).slice(0, MAX_PHOTOS);
    const extra = (e.target.files?.length ?? 0) - files.length;
    e.target.value = ""; // so picking the same photo again still fires
    if (!files.length) return;
    setMsg(files.length > 1 ? t("Reading {n} photos…", { n: files.length }) : t("Reading the photo…"));
    setFavOffer(null);
    setDrafts(null);
    releaseUploads(); // a previous review abandoned by picking new photos
    startTransition(async () => {
      const all: Draft[] = [];
      let lastError: string | null = null;
      let pinFailed = false;
      for (const file of files) {
        // Each photo is read and uploaded at once; the upload is what lets
        // the task it becomes carry the photo ("buy this" with no typing).
        const r = await readPhoto(file, userId);
        if (r.uploaded) uploadsRef.current.push(r.uploaded);
        all.push(...r.drafts);
        if (r.error) lastError = t(r.error);
        if (r.pinFailed) pinFailed = true;
      }
      if (all.length) {
        setDrafts(all);
        setMsg(
          [
            extra > 0 ? t("Only the first {n} photos were read.", { n: MAX_PHOTOS }) : lastError,
            pinFailed ? t("The photo couldn't be attached this time — the items below are still fine.") : null,
          ]
            .filter(Boolean)
            .join(" ") || null,
        );
      } else {
        releaseUploads();
        setMsg(lastError ?? t("Nothing to add from that photo."));
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

  // ---- "start here" buttons in empty states --------------------------------
  // An empty screen offers "Speak it" / "Type it"; they land here. Synchronous
  // with the click, so the mic still counts as user-initiated.
  const startVoiceRef = useRef<() => void>(() => {});
  useEffect(() => {
    startVoiceRef.current = startVoice;
  });
  useEffect(() => {
    const onIntent = (e: Event) => {
      const intent = (e as CustomEvent<QuickAddIntent>).detail;
      inputRef.current?.scrollIntoView({ block: "nearest" });
      if (intent === "voice" && speechCtor() && !recRef.current) startVoiceRef.current();
      else inputRef.current?.focus();
    };
    window.addEventListener(QUICKADD_EVENT, onIntent);
    return () => window.removeEventListener(QUICKADD_EVENT, onIntent);
  }, []);

  // ---- favourites ----------------------------------------------------------
  // One tap = the entry exists, for today. Routine rung of the ladder: the
  // chip presses (160ms), a toast offers Undo, nothing celebrates.
  function tapFavorite(f: FavoriteChip) {
    if (longPressed.current) {
      longPressed.current = false;
      return;
    }
    if (favInFlight.current) return;
    favInFlight.current = true;
    haptic();
    setFavBusy(f.id);
    setMsg(null);
    setFavOffer(null);
    applyFavorite(f.id)
      .then((r) => {
        if (!r.ok) {
          setMsg(t(r.error));
          return;
        }
        router.refresh();
        const what = f.amountLabel ? `${f.label} · ${f.amountLabel}` : f.label;
        showToast({
          message: t("Added {what}", { what }),
          actionLabel: t("Undo"),
          onAction: () => {
            void undoFavorite(r.created).then(() => router.refresh());
          },
        });
      })
      .catch(() => setMsg(t("Could not add")))
      .finally(() => {
        favInFlight.current = false;
        setFavBusy(null);
      });
  }

  /** Long-press a chip → manage favourites. */
  function pressStart() {
    longPressed.current = false;
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      longPressed.current = true;
      router.push("/favorites");
    }, 550);
  }
  function pressEnd() {
    if (pressTimer.current) window.clearTimeout(pressTimer.current);
    pressTimer.current = null;
  }

  function saveOfferAsFavorite() {
    const offer = favOffer;
    if (!offer) return;
    setFavOffer(null);
    saveDraftAsFavorite(offer)
      .then((r) => {
        if (r.status === "saved") {
          setMsg(t("Saved as a favourite — it's one tap now."));
          router.refresh();
        } else if (r.status === "exists") setMsg(t("That's already a favourite."));
        else if (r.status === "full") setMsg(t("You can keep up to 12 favourites per hub. Delete one first."));
        else setMsg(t("Could not save"));
      })
      .catch(() => setMsg(t("Could not save")));
  }

  // ---- review --------------------------------------------------------------
  function patchDraft(i: number, patch: Partial<Draft>) {
    setDrafts((cur) => cur?.map((d, idx) => (idx === i ? { ...d, ...patch } : d)) ?? null);
  }

  function removeDraft(i: number) {
    const next = drafts?.filter((_, idx) => idx !== i) ?? [];
    setDrafts(next.length ? next : null);
    if (!next.length) releaseUploads();
  }

  function onAttach(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    clearAttached();
    setAttached({ file, preview: URL.createObjectURL(file) });
  }

  function saveDrafts() {
    if (!drafts?.length) return;
    startTransition(async () => {
      const r = await commitDrafts(drafts);
      if (r.ok) {
        setMsg(`${t("Added {n}", { n: r.created.length })}: ${r.created.join(" · ")}`);
        setFavOffer(favoriteOffer(drafts, favorites));
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
    } else if (inputRef.current?.value || msg || prompt || favOffer) {
      reset();
      setMsg(null);
      setFavOffer(null);
      setPrompt(null);
    } else return;
    e.preventDefault();
  }

  return (
    <div
      className="opaque border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 pb-2.5 pt-3"
      onKeyDown={onKeyDown}
    >
      <form ref={formRef} onSubmit={onSubmit}>
        <div className="composer">
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
            aria-label={t("Quick add")}
          />
          {canSpeak && (
            <button
              type="button"
              onClick={toggleVoice}
              disabled={pending && !listening}
              className={`btn btn-icon${listening ? " mic-live" : ""}`}
              aria-label={listening ? t("Stop listening") : t("Speak")}
              aria-pressed={listening}
              title={listening ? t("Stop listening") : t("Speak")}
            >
              <Mic size={20} strokeWidth={2} aria-hidden />
            </button>
          )}
          {aiEnabled && (
            <div className="relative">
              <button
                type="button"
                onClick={() => setPhotoMenu((v) => !v)}
                disabled={pending}
                className="btn btn-icon"
                aria-label={t("Add from a photo")}
                aria-haspopup="menu"
                aria-expanded={photoMenu}
                title={t("Add from a photo")}
              >
                <Camera size={20} strokeWidth={2} aria-hidden />
              </button>
              {photoMenu && (
                <>
                  <div className="fixed inset-0 z-30" onClick={() => setPhotoMenu(false)} />
                  <div role="menu" className="menu absolute right-0 top-full z-40 mt-2 w-60">
                    <button type="button" role="menuitem" onClick={openCamera} className="menu-item w-full">
                      <Camera size={18} strokeWidth={2} aria-hidden />
                      {t("Take a photo")}
                    </button>
                    <button type="button" role="menuitem" onClick={openLibrary} className="menu-item w-full">
                      <Images size={18} strokeWidth={2} aria-hidden />
                      {t("Choose from your photos")}
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
          <button
            type="submit"
            className="btn btn-primary ml-1 shrink-0 px-3.5"
            disabled={pending}
            aria-label={t("Add")}
          >
            {pending ? (
              <Loader2 size={18} strokeWidth={2.25} className="animate-spin" aria-hidden />
            ) : (
              <>
                <span className="hidden min-[400px]:inline">{t("Add")}</span>
                <ArrowUp size={18} strokeWidth={2.4} className="min-[400px]:hidden" aria-hidden />
              </>
            )}
          </button>
        </div>
        {favorites.length > 0 && !drafts && (
          <div
            className="no-scrollbar -mx-3 mt-2 flex gap-1.5 overflow-x-auto px-3"
            role="group"
            aria-label={t("Favourites")}
          >
            {favorites.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => tapFavorite(f)}
                onPointerDown={pressStart}
                onPointerUp={pressEnd}
                onPointerLeave={pressEnd}
                onPointerCancel={pressEnd}
                onContextMenu={(e) => e.preventDefault()}
                disabled={favBusy !== null}
                aria-busy={favBusy === f.id || undefined}
                className="chip fav-chip shrink-0 select-none"
                title={t("Tap to add for today · hold to edit")}
              >
                {f.label}
                {f.amountLabel && (
                  <span className="font-normal text-[var(--color-text-dim)]">{f.amountLabel}</span>
                )}
              </button>
            ))}
            <Link
              href="/favorites"
              className="chip fav-chip shrink-0"
              aria-label={t("Edit favourites")}
              title={t("Edit favourites")}
            >
              <Pencil size={14} strokeWidth={2} aria-hidden />
            </Link>
          </div>
        )}
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
        {aiEnabled && (
          // No capture attribute: the phone opens its photo library (iOS also
          // offers Files), so a screenshot or an older photo can be read.
          <input
            ref={libraryRef}
            type="file"
            accept="image/*"
            multiple
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
            className="btn btn-primary btn-lg mt-2 w-full"
          >
            {prompt === "snap" ? (
              <>
                <Camera size={20} aria-hidden /> {t("Take photo")}
              </>
            ) : (
              <>
                <Mic size={20} aria-hidden /> {t("Tap to speak")}
              </>
            )}
          </button>
        )}

        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="-ml-1 mt-1.5 inline-flex min-h-[32px] items-center gap-1.5 rounded-lg px-1 text-xs font-semibold text-[var(--color-text-dim)]"
        >
          <SlidersHorizontal size={14} strokeWidth={2} aria-hidden />
          {open ? t("Hide details") : t("Details")}
          <ChevronDown
            size={14}
            strokeWidth={2.25}
            aria-hidden
            style={{
              transform: open ? "rotate(180deg)" : undefined,
              transition: "transform var(--fast) var(--ease)",
            }}
          />
        </button>

        {open && (
          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-3">
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
            <div className="col-span-2 flex items-center gap-2">
              {attached ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element -- a local blob: preview, nothing to optimise */}
                  <img
                    src={attached.preview}
                    alt={t("Attached photo")}
                    className="h-12 w-12 rounded-[var(--r-md)] border border-[var(--color-border)] object-cover"
                  />
                  <span className="flex-1 text-xs text-[var(--color-text-dim)]">
                    {t("Pinned to this task when you add it.")}
                  </span>
                  <button
                    type="button"
                    onClick={clearAttached}
                    className="btn btn-ghost btn-icon"
                    aria-label={t("Remove photo")}
                  >
                    <X size={18} strokeWidth={2.25} aria-hidden />
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => attachRef.current?.click()} className="btn btn-secondary">
                  <Paperclip size={16} strokeWidth={2} aria-hidden />
                  {t("Attach a photo")}
                </button>
              )}
              <input
                ref={attachRef}
                type="file"
                accept="image/*"
                onChange={onAttach}
                className="hidden"
                tabIndex={-1}
                aria-hidden
              />
            </div>
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
      {favOffer && (
        <button
          type="button"
          onClick={saveOfferAsFavorite}
          className="mt-1 inline-flex min-h-[32px] items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)]"
        >
          <Star size={14} strokeWidth={2.25} aria-hidden /> {t("Save as favourite")}
        </button>
      )}
    </div>
  );
}
