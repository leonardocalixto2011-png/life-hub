import type { HubTx } from "@/lib/hub-context";

/** Most favourites one person keeps per hub. A chip row past this stops being one tap. */
export const FAVORITE_CAP = 12;

export type FavoriteKindKey = "TASK" | "BUDGET" | "EVENT";

/** What the quick-add chip row needs — no ids beyond the favourite's own. */
export type FavoriteChip = {
  id: string;
  label: string;
  kind: FavoriteKindKey;
  amountCents: number | null;
  entryType: "INCOME" | "EXPENSE";
  /** Pre-formatted in the hub's currency and the viewer's locale. */
  amountLabel: string | null;
};

/**
 * Where-clause for one person's favourites in one hub. App-level mirror of
 * the `quick_favorite_own` policy (hub membership is implied by the caller
 * having passed requireHub) — per this project's defense-in-depth rule, every
 * favourite query carries both the hub and the creator, never RLS alone.
 */
export function ownFavorites(hubId: string, userId: string) {
  return { hubId, createdById: userId };
}

export function listFavorites(tx: HubTx, hubId: string, userId: string) {
  return tx.quickFavorite.findMany({
    where: ownFavorites(hubId, userId),
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    take: FAVORITE_CAP,
    select: {
      id: true,
      label: true,
      kind: true,
      amountCents: true,
      category: true,
      ventureId: true,
      entryType: true,
      sortOrder: true,
    },
  });
}

/** Same favourite, ignoring case and spacing in the label. */
export function sameFavorite(
  a: { label: string; kind: string; amountCents: number | null; entryType: string },
  b: { label: string; kind: string; amountCents: number | null; entryType: string },
): boolean {
  const norm = (s: string) => s.trim().replace(/\s+/g, " ").toLowerCase();
  return (
    norm(a.label) === norm(b.label) &&
    a.kind === b.kind &&
    (a.amountCents ?? null) === (b.amountCents ?? null) &&
    (a.kind !== "BUDGET" || a.entryType === b.entryType)
  );
}
