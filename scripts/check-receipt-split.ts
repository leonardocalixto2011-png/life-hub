/**
 * Checks the receipt-split arithmetic (src/lib/receipt-split.ts) on fabricated
 * receipts. No database, no network:
 *
 *   npx tsx scripts/check-receipt-split.ts
 *
 * What it pins down:
 *   - the percentage comes from the lines, and tax/tip follow in proportion;
 *   - the amounts shown are derived from the INTEGER percent the entry stores,
 *     with the same rounding as the shared balance, and always sum to the total;
 *   - rounding to a whole percent never moves the payer's part by more than
 *     half a percent of the total;
 *   - the edges: everything the other's (0 %), everything mine (100 %), paid by
 *     the other member, three people, junk lines, no lines;
 *   - lines read off a photo are cleaned: totals, taxes, payment and anything
 *     that looks like a card number never reach the screen.
 */
import { shareAmounts } from "../src/lib/couple";
import { cleanReceiptLines, computeItemisedSplit, type LineOwner } from "../src/lib/receipt-split";

let failures = 0;
function check(label: string, ok: boolean, detail = "") {
  console.log(`${ok ? "✔" : "✗"} ${label}${detail ? `  (${detail})` : ""}`);
  if (!ok) failures++;
}
const L = (amountCents: number, owner: LineOwner) => ({ amountCents, owner });
const fmt = (c: number) => (c / 100).toFixed(2);

// 1. Grocery receipt, two people, I paid. Lines 40.00 before tax, total 45.99.
//    Mine 10.00, theirs 6.00, shared 24.00 → my basis 10 + 12 = 22 of 40 = 55 %.
{
  const r = computeItemisedSplit({
    totalCents: 4599,
    lines: [L(1000, "mine"), L(600, "theirs"), L(1500, "shared"), L(900, "shared")],
    payerIsViewer: true,
    memberCount: 2,
  })!;
  check("grocery: 55 % from the lines", r.payerSharePct === 55, `pct=${r.payerSharePct}`);
  check("grocery: tax is spread in proportion (payer 25.29 of 45.99)", r.payerCents === 2529 && r.othersCents === 2070,
    `payer=${fmt(r.payerCents)} other=${fmt(r.othersCents)}`);
  check("grocery: the two parts sum to the total", r.payerCents + r.othersCents === 4599);
  check("grocery: extras = total − lines (5.99 of tax)", r.extrasCents === 599);
}

// 2. Restaurant with tax AND tip: lines 62.00, total 81.07. I had 38.50, they had 23.50.
{
  const r = computeItemisedSplit({
    totalCents: 8107,
    lines: [L(2450, "mine"), L(1400, "mine"), L(1650, "theirs"), L(700, "theirs")],
    payerIsViewer: true,
    memberCount: 2,
  })!;
  // 3850 / 6200 = 62.096… % → 62 %
  check("restaurant: 62 % (38.50 of 62.00)", r.payerSharePct === 62, `pct=${r.payerSharePct}`);
  check("restaurant: other owes 38 % of the total incl. tax and tip", r.othersCents === Math.round(8107 * 0.38),
    `other=${fmt(r.othersCents)}`);
  check("restaurant: whole-percent rounding moved the payer's part by under 0.5 % of the total",
    Math.abs(r.payerCents - r.exactPayerCents) <= Math.ceil(8107 * 0.005),
    `stored=${fmt(r.payerCents)} exact=${fmt(r.exactPayerCents)}`);
}

// 3. Everything was the other's: 100 % other, payer keeps nothing.
{
  const r = computeItemisedSplit({
    totalCents: 2874,
    lines: [L(1299, "theirs"), L(1201, "theirs")],
    payerIsViewer: true,
    memberCount: 2,
  })!;
  check("100 % other: payer share 0 %, other owes the whole total", r.payerSharePct === 0 && r.othersCents === 2874 && r.payerCents === 0,
    `pct=${r.payerSharePct} other=${fmt(r.othersCents)}`);
}

// 4. Everything mine: nothing is owed.
{
  const r = computeItemisedSplit({ totalCents: 1150, lines: [L(1000, "mine")], payerIsViewer: true, memberCount: 2 })!;
  check("100 % mine: payer share 100 %, nothing owed", r.payerSharePct === 100 && r.othersCents === 0);
}

// 5. All shared, two people: plain 50/50 — odd cent goes somewhere, never lost.
{
  const r = computeItemisedSplit({
    totalCents: 3333,
    lines: [L(1000, "shared"), L(1899, "shared")],
    payerIsViewer: true,
    memberCount: 2,
  })!;
  check("all shared: 50 %", r.payerSharePct === 50);
  check("all shared: odd total still sums exactly (16.66 + 16.67)", r.payerCents + r.othersCents === 3333 && Math.abs(r.payerCents - r.othersCents) === 1,
    `payer=${fmt(r.payerCents)} other=${fmt(r.othersCents)}`);
}

// 6. The OTHER member paid. "Mine" lines are then the non-payer's.
{
  const r = computeItemisedSplit({
    totalCents: 5000,
    lines: [L(1000, "mine"), L(3000, "theirs")],
    payerIsViewer: false,
    memberCount: 2,
  })!;
  check("paid by the other: payer keeps their 75 %, I owe 12.50", r.payerSharePct === 75 && r.othersCents === 1250,
    `pct=${r.payerSharePct} iOwe=${fmt(r.othersCents)}`);
}

// 7. Three people: a shared line is a third each.
{
  const r = computeItemisedSplit({ totalCents: 9000, lines: [L(9000, "shared")], payerIsViewer: true, memberCount: 3 })!;
  check("three people, all shared: payer keeps a third (33 %)", r.payerSharePct === 33 && r.othersCents === 6030,
    `pct=${r.payerSharePct} others=${fmt(r.othersCents)}`);
}

// 8. Rounding sweep: for every split of a 1..9999-cent total, the stored
//    amounts sum to the total and stay within half a percent of exact.
{
  let sumOk = true;
  let driftOk = true;
  let worst = 0;
  for (let total = 1; total <= 9999; total += 7) {
    for (let mine = 0; mine <= 100; mine += 3) {
      const r = computeItemisedSplit({
        totalCents: total,
        lines: [L(mine + 1, "mine"), L(101 - mine, "theirs"), L(37, "shared")],
        payerIsViewer: true,
        memberCount: 2,
      })!;
      if (r.payerCents + r.othersCents !== total) sumOk = false;
      const drift = Math.abs(r.payerCents - r.exactPayerCents);
      if (total >= 1000) worst = Math.max(worst, drift / total);
      if (drift > total * 0.005 + 1) driftOk = false;
      const again = shareAmounts(total, r.payerSharePct);
      if (again.othersCents !== r.othersCents) sumOk = false;
    }
  }
  check("sweep: payer + others always equals the total, and matches the balance's own formula", sumOk);
  check("sweep: whole-percent rounding never drifts more than 0.5 % of the total (+1 cent)", driftOk,
    `worst on totals ≥ $10: ${(worst * 100).toFixed(2)} %`);
}

// 9. Nothing to compute from.
check("no lines → null (falls back to the presets)",
  computeItemisedSplit({ totalCents: 1000, lines: [], payerIsViewer: true, memberCount: 2 }) === null);
check("zero total → null",
  computeItemisedSplit({ totalCents: 0, lines: [L(500, "mine")], payerIsViewer: true, memberCount: 2 }) === null);
check("negative and NaN lines are ignored",
  computeItemisedSplit({
    totalCents: 1000,
    lines: [L(-300, "theirs"), L(Number.NaN, "theirs"), L(800, "mine")],
    payerIsViewer: true,
    memberCount: 2,
  })?.payerSharePct === 100);

// 10. Lines off a photo: only purchases survive, never a card number.
{
  const cleaned = cleanReceiptLines(
    [
      { name: "Lait 2 % 4L", amount: 7.49 },
      { name: "Cashews 400g", amount: 8.99 },
      { name: "Carte cadeau iTunes", amount: 25 },
      { name: "Pain 0062891234567", amount: 3.5 },
      { name: "SOUS-TOTAL", amount: 44.98 },
      { name: "TPS 5 %", amount: 2.25 },
      { name: "TVQ 9,975 %", amount: 4.49 },
      { name: "Total", amount: 51.72 },
      { name: "VISA **** **** **** 4242", amount: 51.72 },
      { name: "Débit Interac", amount: 51.72 },
      { name: "4520 1234 5678 9012", amount: 51.72 },
      { name: "4520123456789012", amount: 51.72 },
      { name: "Rabais", amount: -2 },
      { name: "Tipsy cake", amount: 6 },
    ],
    30,
  );
  const names = cleaned.map((l) => l.name);
  check("clean: purchases kept (incl. 'Cashews', 'Tipsy cake', 'Carte cadeau' — not mistaken for cash / tip / card)",
    names.includes("Lait 2 % 4L") && names.includes("Cashews 400g") && names.includes("Tipsy cake") && names.includes("Carte cadeau iTunes"),
    names.join(" | "));
  check("clean: subtotal, taxes, total and payment lines dropped", cleaned.length === 5, `kept=${cleaned.length}`);
  check("clean: no card-like number survives anywhere", !cleaned.some((l) => /\d{6,}|\*{2,}/.test(l.name)));
  check("clean: a barcode is stripped from a name, the line kept", names.includes("Pain"));
  check("clean: capped", cleanReceiptLines(Array.from({ length: 80 }, (_, i) => ({ name: `Item ${i}`, amount: 1 })), 30).length === 30);
}

console.log(failures === 0 ? "\nAll receipt-split checks passed." : `\n${failures} check(s) FAILED.`);
process.exit(failures === 0 ? 0 : 1);
