import { shareAmounts } from "@/lib/couple";

/**
 * Receipt → split. Pure arithmetic, no I/O — the review card runs it in the
 * browser, `scripts/check-receipt-split.ts` runs it on fabricated receipts.
 *
 * A receipt read from a photo may come with its purchased lines. The person
 * marks each one "mine", "theirs" or "shared"; this turns that into the one
 * number the budget entry stores (`payerSharePct`, an integer percent — see
 * lib/couple.ts). Nothing itemised is saved.
 */

/** From the point of view of the person holding the phone. */
export type LineOwner = "mine" | "theirs" | "shared";

export type SplitLine = { amountCents: number; owner: LineOwner };

export type ItemisedSplit = {
  /** What the entry stores: the part of the total the payer keeps, 0–100. */
  payerSharePct: number;
  /** What that percentage makes the payer's part, in cents — the saved result. */
  payerCents: number;
  /** What the other member(s) owe the payer between them — the saved result. */
  othersCents: number;
  /** Sum of the lines. */
  itemsCents: number;
  /** total − lines: tax, tip, discounts. Spread in proportion to the lines. */
  extrasCents: number;
  /** The payer's part before rounding to a whole percent, for comparison. */
  exactPayerCents: number;
};

/**
 * The payer's share = their own lines + their part of the shared lines, as a
 * fraction of all the lines. Applying that fraction to the *total* is what
 * spreads tax and tip proportionally: someone who had 70% of the food carries
 * 70% of the tax and the tip.
 *
 * A shared line is split equally among everyone in the hub (half each for two
 * people), which is how `sharedBalances` splits what the others owe.
 *
 * Returns null when there is nothing to compute from (no positive lines, no
 * total) — the caller falls back to the presets.
 */
export function computeItemisedSplit(input: {
  totalCents: number;
  lines: SplitLine[];
  /** False when the receipt was paid by someone other than the viewer. */
  payerIsViewer: boolean;
  /** Active members of the hub, payer included. 2 for a couple. */
  memberCount: number;
}): ItemisedSplit | null {
  const { totalCents, payerIsViewer } = input;
  const people = Math.max(2, Math.floor(input.memberCount));
  const lines = input.lines.filter((l) => Number.isFinite(l.amountCents) && l.amountCents > 0);
  const itemsCents = lines.reduce((n, l) => n + l.amountCents, 0);
  if (!(totalCents > 0) || itemsCents <= 0) return null;

  const payerOwner: LineOwner = payerIsViewer ? "mine" : "theirs";
  let payerBasis = 0;
  for (const l of lines) {
    if (l.owner === payerOwner) payerBasis += l.amountCents;
    else if (l.owner === "shared") payerBasis += l.amountCents / people;
  }

  const fraction = payerBasis / itemsCents;
  const payerSharePct = Math.min(100, Math.max(0, Math.round(fraction * 100)));
  return {
    payerSharePct,
    ...shareAmounts(totalCents, payerSharePct),
    itemsCents,
    extrasCents: totalCents - itemsCents,
    exactPayerCents: Math.round(totalCents * fraction),
  };
}

// ---- reading the lines off a photo ------------------------------------------

/** Lines that are the receipt's own arithmetic or its payment, not purchases. */
const NOT_A_PURCHASE =
  /^\s*(sub[\s-]?total|sous[\s-]?total|total|tps|tvq|tvh|gst|hst|pst|qst|tax(e|es)?|tip|pourboire|gratuity|change|monnaie|rendu|cash|comptant|argent|visa|master\s?card|amex|american express|interac|d[ée]bit|cr[ée]dit|paiement|payment|solde|balance|approved|approuv[ée]e?)(?![\p{L}\p{N}])/iu;

/** A masked or grouped card / account number: "**** 1234", "XXXX-1234", "4520 1234 5678". */
const CARD_LIKE = /([*xX•#]{2,}[\s-]*\d{2,})|(\b\d{4}[\s-]\d{4}[\s-]\d{4}\b)/;

/**
 * What the model returned → what the card may show. The prompt already asks
 * for purchases only and no card numbers; this is the part that does not rely
 * on being asked. A line that looks like a card number is dropped whole;
 * any run of six or more digits (a barcode, a SKU — or an unmasked number we
 * failed to recognise) is stripped from the name, and a line left with no
 * name at all goes too; totals, taxes and payment lines are dropped; at most
 * `max` lines survive.
 */
export function cleanReceiptLines(
  raw: readonly { name: string; amount: number }[] | null | undefined,
  max: number,
): { name: string; amount: string }[] {
  if (!raw) return [];
  const out: { name: string; amount: string }[] = [];
  for (const l of raw) {
    if (out.length >= max) break;
    if (!l || typeof l.name !== "string" || !Number.isFinite(l.amount) || l.amount <= 0) continue;
    if (CARD_LIKE.test(l.name) || NOT_A_PURCHASE.test(l.name)) continue;
    const name = l.name.replace(/\d{6,}/g, "").replace(/\s+/g, " ").trim().slice(0, 60);
    if (!name) continue;
    out.push({ name, amount: l.amount.toFixed(2) });
  }
  return out;
}
