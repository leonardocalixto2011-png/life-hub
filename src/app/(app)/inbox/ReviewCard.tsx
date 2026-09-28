"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";

import type { Draft } from "@/lib/parse";
import { DraftCard } from "@/components/DraftCard";
import { showToast } from "@/components/Toast";
import { useLang, useT } from "@/components/I18nProvider";
import { dateLocale } from "@/lib/i18n";
import { acceptReview, discardReview, trustThisSender, muteThisSender } from "./actions";

export type ReviewCardData = {
  id: string;
  source: string;
  fromAddress: string | null;
  sourceSnippet: string | null;
  note: string | null;
  createdAt: string | Date;
  draft: Draft;
};

export function ReviewCard({
  item,
  ventures,
}: {
  item: ReviewCardData;
  ventures: { id: string; name: string }[];
}) {
  const router = useRouter();
  const t = useT();
  const lang = useLang();
  const [draft, setDraft] = useState<Draft>(item.draft);
  const [pending, start] = useTransition();

  /** Stops future classification calls for this sender AND clears whatever of
   *  theirs is already pending — muting something you are looking at should
   *  make it go away, not leave it sitting there. */
  function mute() {
    if (!item.fromAddress) return;
    start(async () => {
      const r = await muteThisSender(item.fromAddress!);
      if (r.ok) router.refresh();
    });
  }
  const [gone, setGone] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  if (gone) return null;

  function accept() {
    setErr(null);
    start(async () => {
      const r = await acceptReview(item.id, draft);
      if (r.ok) {
        setGone(true);
        if (r.offerTrust) {
          const { hubId, fromAddress, category } = r.offerTrust;
          showToast({
            message: t("Always trust {email}?", { email: fromAddress }),
            actionLabel: t("Trust sender"),
            onAction: () => {
              void trustThisSender(hubId, fromAddress, category);
              showToast({ message: t("Future emails from them will auto-file.") });
            },
          });
        } else {
          showToast({ message: t("Added") });
        }
        router.refresh();
      } else {
        setErr(t(r.error ?? "Could not save"));
      }
    });
  }

  function discard() {
    start(async () => {
      await discardReview(item.id);
      setGone(true);
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-[var(--radius)] border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 px-1 text-[0.68rem] text-[var(--color-text-dim)]">
        <span className="chip">{t(item.source)}</span>
        {item.fromAddress && <span className="truncate">{t("from {email}", { email: item.fromAddress })}</span>}
        <span>· {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true, locale: dateLocale(lang) })}</span>
      </div>

      {item.note && (
        <p className="px-1 text-[0.7rem] font-semibold text-[var(--color-warn)]">{item.note}</p>
      )}

      <DraftCard
        draft={draft}
        ventures={ventures}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        onRemove={discard}
      />

      {item.sourceSnippet && (
        <details className="px-1">
          <summary className="cursor-pointer text-[0.68rem] font-semibold text-[var(--color-text-dim)]">
            {t("Source")}
          </summary>
          <p className="mt-1 whitespace-pre-wrap text-[0.7rem] text-[var(--color-text-dim)]">
            {item.sourceSnippet}
          </p>
        </details>
      )}

      {err && <p className="px-1 text-xs text-[var(--color-danger)]">{err}</p>}

      <div className="flex gap-2">
        <button onClick={accept} disabled={pending} className="btn btn-primary flex-1">
          {pending ? "…" : t("Accept")}
        </button>
        <button onClick={discard} disabled={pending} className="btn">
          {t("Discard")}
        </button>
      </div>

      {item.fromAddress && (
        <button
          onClick={mute}
          disabled={pending}
          className="text-[0.65rem] font-semibold text-[var(--color-text-dim)] underline disabled:opacity-60"
        >
          {t("Never show mail from {email} again", { email: item.fromAddress })}
        </button>
      )}
    </div>
  );
}
