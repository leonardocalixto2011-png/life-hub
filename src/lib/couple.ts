import type { HubTx } from "@/lib/hub-context";

export type MemberBalance = {
  userId: string;
  /** Positive = is owed money; negative = owes. Balances across a hub sum to zero. */
  netCents: number;
};

/**
 * Who owes whom for shared expenses in a hub.
 *
 * An expense of A paid by P, where P keeps s%, means the other members owe P
 * A × (100 − s)% between them, split equally. A settle-up from X is stored as
 * the same shape with s = 0 — X paying the others back — which credits X.
 *
 * Computed over all time, not the viewed month: a balance that silently reset
 * on the 1st would be a lie. Rows whose payer has left the hub are skipped
 * rather than redistributed, because nobody left can settle them.
 */
export async function sharedBalances(
  tx: HubTx,
  hubId: string,
  memberIds: string[],
): Promise<MemberBalance[]> {
  const rows = await tx.budgetEntry.findMany({
    where: {
      hubId,
      type: "EXPENSE",
      paidById: { not: null },
      payerSharePct: { not: null },
    },
    select: { amountCents: true, paidById: true, payerSharePct: true },
  });

  const net = new Map(memberIds.map((id) => [id, 0]));
  for (const r of rows) {
    const payer = r.paidById!;
    if (!net.has(payer)) continue;
    const others = memberIds.filter((id) => id !== payer);
    if (others.length === 0) continue;

    const owed = shareAmounts(r.amountCents, r.payerSharePct!).othersCents;
    net.set(payer, net.get(payer)! + owed);

    // Equal parts; leftover cents go to the first members so the sum is exact.
    const each = Math.floor(owed / others.length);
    let rem = owed - each * others.length;
    for (const o of others) {
      const part = each + (rem > 0 ? 1 : 0);
      if (rem > 0) rem--;
      net.set(o, net.get(o)! - part);
    }
  }

  return [...net.entries()].map(([userId, netCents]) => ({ userId, netCents }));
}

/**
 * Suggested categories for entries and monthly targets. Lives here, not in
 * the client EntryForm: a value exported from a "use client" module reaches a
 * server component as a client reference, not an array, so `.map` throws.
 */
export const BUDGET_CATEGORIES = [
  "Groceries",
  "Restaurants",
  "Rent",
  "Utilities",
  "Transport",
  "Outings",
  "Gifts",
  "Travel",
  "Home",
  "Health",
  "Subscriptions",
  "Supplies",
  "Ads",
  "Software",
  "Salary",
  "Sales",
  "Fees",
];

/** Split options offered in the entry form, as the payer's kept percentage. */
export const SPLIT_OPTIONS = [
  { value: "none", label: "Not shared", short: "Not shared", pct: null },
  { value: "50", label: "Shared 50/50", short: "50/50", pct: 50 },
  { value: "60", label: "Shared — I keep 60%", short: "60/40", pct: 60 },
  { value: "40", label: "Shared — I keep 40%", short: "40/60", pct: 40 },
  { value: "0", label: "Paid entirely for the other(s)", short: "The other pays it all", pct: 0 },
] as const;

/**
 * What a shared expense moves, in cents — the same arithmetic as
 * `sharedBalances` above, so a preview shown before saving is exactly what
 * the balance will do after. `payerSharePct` is an integer percent (that is
 * what the row stores), so the amounts are derived from it, not from whatever
 * finer split produced it.
 */
export function shareAmounts(amountCents: number, payerSharePct: number) {
  const othersCents = Math.round((amountCents * (100 - payerSharePct)) / 100);
  return { payerCents: amountCents - othersCents, othersCents };
}

export function splitLabel(pct: number | null): string | null {
  if (pct == null) return null;
  if (pct === 50) return "50/50";
  if (pct === 0) return "for the others";
  return `${pct}/${100 - pct}`;
}
