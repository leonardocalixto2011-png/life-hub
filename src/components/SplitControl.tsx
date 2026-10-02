"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

import type { Draft } from "@/lib/parse";
import { SPLIT_OPTIONS, shareAmounts } from "@/lib/couple";
import { computeItemisedSplit, type LineOwner } from "@/lib/receipt-split";
import { dollarsToCents } from "@/lib/money";
import { personFirstName, personName } from "@/lib/people";
import { useLang, useT } from "@/components/I18nProvider";
import "./social.css";

export type SplitMember = { id: string; name: string | null; email?: string | null };

const OWNERS: LineOwner[] = ["mine", "theirs", "shared"];

/**
 * Reçu → partage. Shown on a budget *expense* draft when the hub has someone
 * to share with: who paid, and how it is split.
 *
 * Two ways to arrive at the same stored number (`payerSharePct`, the part the
 * payer keeps — exactly what budget/EntryForm writes):
 *   - a preset (not shared · 50/50 · 60/40 · 40/60 · the other pays it all);
 *   - when the photo's lines could be read, "Itemise": mark each line mine /
 *     theirs / shared and the percentage is worked out from them, tax and tip
 *     following in proportion (lib/receipt-split.ts).
 * Either way ONE entry is saved, and the amounts shown here are computed with
 * the same rounding the balance uses, so what you read is what gets recorded.
 */
export function SplitControl({
  draft,
  members,
  currentUserId,
  currency = "CAD",
  onChange,
}: {
  draft: Draft;
  members: SplitMember[];
  currentUserId: string;
  /** The hub's currency, for the amounts in the preview. */
  currency?: string;
  onChange: (patch: Partial<Draft>) => void;
}) {
  const t = useT();
  const lang = useLang();
  const lines = draft.lines ?? [];
  const [open, setOpen] = useState(false);
  // True while the percentage comes from the lines rather than a preset.
  const [itemised, setItemised] = useState(false);
  const [owners, setOwners] = useState<LineOwner[]>(() => lines.map(() => "shared"));

  const two = members.length === 2;
  const payerId = draft.paidById ?? currentUserId;
  const payerIsViewer = payerId === currentUserId;
  const payer = members.find((m) => m.id === payerId);
  const other = two ? members.find((m) => m.id !== payerId) : undefined;
  const pct = draft.payerSharePct ?? null;
  const totalCents = dollarsToCents(draft.amount) ?? 0;

  const $ = (cents: number) =>
    new Intl.NumberFormat(lang === "fr" ? "fr-CA" : "en-CA", { style: "currency", currency }).format(cents / 100);

  function fromLines(nextOwners: LineOwner[], viewerPays: boolean) {
    return computeItemisedSplit({
      // The ratio only depends on the lines; any positive total will do when
      // the amount field is momentarily empty.
      totalCents: totalCents > 0 ? totalCents : 100,
      lines: lines.map((l, i) => ({ amountCents: dollarsToCents(l.amount) ?? 0, owner: nextOwners[i] ?? "shared" })),
      payerIsViewer: viewerPays,
      memberCount: members.length,
    });
  }

  function pickPreset(next: number | null) {
    setItemised(false);
    onChange({ payerSharePct: next, paidById: next == null ? null : payerId });
  }

  function pickPayer(id: string) {
    const viewerPays = id === currentUserId;
    const split = itemised ? fromLines(owners, viewerPays) : null;
    onChange({ paidById: id, ...(split ? { payerSharePct: split.payerSharePct } : {}) });
  }

  function setOwner(i: number, owner: LineOwner) {
    const next = owners.map((o, idx) => (idx === i ? owner : o));
    setOwners(next);
    setItemised(true);
    const split = fromLines(next, payerIsViewer);
    if (split) onChange({ payerSharePct: split.payerSharePct, paidById: payerId });
  }

  function toggleLines() {
    const willOpen = !open;
    setOpen(willOpen);
    // Opening it is choosing to split by the lines: start from what is marked.
    if (willOpen && !itemised) {
      setItemised(true);
      const split = fromLines(owners, payerIsViewer);
      if (split) onChange({ payerSharePct: split.payerSharePct, paidById: payerId });
    }
  }

  const result = pct != null && totalCents > 0 ? shareAmounts(totalCents, pct) : null;
  const detail = itemised ? fromLines(owners, payerIsViewer) : null;
  const ownerLabel: Record<LineOwner, string> = {
    mine: t("Mine"),
    theirs: two ? t("Theirs") : t("The others'"),
    shared: t("Shared"),
  };

  return (
    <div className="split-box space-y-2.5">
      <label className="block text-[0.7rem] font-semibold text-[var(--color-text-dim)]">
        {t("Paid by")}
        <select value={payerId} onChange={(e) => pickPayer(e.target.value)} className="field mt-1">
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {personName(m, t("Member"))}
            </option>
          ))}
        </select>
      </label>

      <div>
        <p className="mb-1.5 text-[0.7rem] font-semibold text-[var(--color-text-dim)]">{t("Share")}</p>
        <div className="split-chips" role="group" aria-label={t("Share")}>
          {SPLIT_OPTIONS.map((o) => (
            <button
              key={o.value}
              type="button"
              className="split-chip"
              aria-pressed={!itemised && pct === o.pct}
              onClick={() => pickPreset(o.pct)}
            >
              {o.pct === 0 && !two ? t("The others pay it all") : t(o.short)}
            </button>
          ))}
        </div>
      </div>

      {lines.length > 0 && (
        <div>
          <button
            type="button"
            onClick={toggleLines}
            aria-expanded={open}
            className="inline-flex min-h-[36px] items-center gap-1.5 text-xs font-semibold text-[var(--color-primary)]"
          >
            {open ? t("Hide the lines") : t("Itemise")}
            {itemised && pct != null && !open ? ` · ${t("From the lines: {pct} %", { pct })}` : ""}
            <ChevronDown
              size={14}
              strokeWidth={2.25}
              aria-hidden
              style={{ transform: open ? "rotate(180deg)" : undefined, transition: "transform var(--fast) var(--ease)" }}
            />
          </button>

          {open && (
            <div>
              <p className="pb-1 text-[0.7rem] text-[var(--color-text-dim)]">
                {t("Who had what? Tax and tip follow the lines.")}
              </p>
              {lines.map((l, i) => (
                <div key={i} className="split-line">
                  <span className="split-line-name">{l.name || t("Item")}</span>
                  <span className="split-line-amount">{$(dollarsToCents(l.amount) ?? 0)}</span>
                  <div className="split-seg" role="group" aria-label={l.name || t("Item")}>
                    {OWNERS.map((o) => (
                      <button
                        key={o}
                        type="button"
                        aria-pressed={itemised && owners[i] === o}
                        onClick={() => setOwner(i, o)}
                      >
                        {ownerLabel[o]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              {detail && totalCents > 0 && detail.itemsCents !== totalCents && (
                <p className="pt-1 text-[0.7rem] text-[var(--color-text-dim)]">
                  {t("The lines add up to {items}; the rest of the {total} total (tax, tip) is spread the same way.", {
                    items: $(detail.itemsCents),
                    total: $(totalCents),
                  })}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {pct != null &&
        (result ? (
          <p className="split-result" role="status">
            <span>
              {itemised ? `${t("From the lines: {pct} %", { pct })} · ` : ""}
              {payerIsViewer
                ? t("You keep {amount}", { amount: $(result.payerCents) })
                : t("{name} keeps {amount}", {
                    name: personFirstName(payer, t("Member")),
                    amount: $(result.payerCents),
                  })}
            </span>
            <span>
              {!two
                ? t("The others owe {amount}", { amount: $(result.othersCents) })
                : payerIsViewer
                  ? t("{name} owes {amount}", {
                      name: personFirstName(other, t("Member")),
                      amount: $(result.othersCents),
                    })
                  : t("You owe {amount} of it", { amount: $(result.othersCents) })}
            </span>
          </p>
        ) : (
          <p className="text-[0.7rem] text-[var(--color-text-dim)]">{t("Add the amount to see the split.")}</p>
        ))}
    </div>
  );
}
