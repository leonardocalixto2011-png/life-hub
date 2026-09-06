import { prisma } from "@/lib/prisma";

/**
 * Summary-only debt sharing.
 *
 * SUMMARY shares are the one place this app deliberately steps around RLS,
 * so the reasoning is worth stating plainly.
 *
 * Row-level security grants or denies whole rows. If the policy let a hub
 * member SELECT someone's debt rows so the app could add them up, that member
 * could read every balance, creditor and default status — "summary only"
 * would be a UI convention, not a guarantee, and this project has already
 * been burned once by trusting a policy that turned out not to bite
 * (see the RLS gotcha in CLAUDE.md). So the policy grants **no** row access
 * for SUMMARY shares, and the totals are produced here instead: a narrow
 * function that verifies the share itself, aggregates with the trusted
 * client, and can only ever return scalars.
 *
 * The safety of this file rests on two things — keep both true:
 *   1. Every export returns counts and totals. No function may return a Debt
 *      row, an id, a creditor name, or anything else per-debt.
 *   2. Access is checked here, from the caller's own user id, before any
 *      aggregate runs. Never take a pre-filtered list from the caller.
 */

export type SharedDebtSummary = {
  ownerId: string;
  ownerName: string;
  totalBalanceCents: number;
  monthlyPaymentCents: number;
  debtCount: number;
  inDefaultCount: number;
};

/** Active members of `hubId`, excluding the viewer, who share a SUMMARY here. */
async function summarySharers(hubId: string, viewerId: string) {
  const viewerIsMember = await prisma.hubMembership.findFirst({
    where: { hubId, userId: viewerId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!viewerIsMember) return [];

  return prisma.debtShare.findMany({
    where: { hubId, visibility: "SUMMARY", ownerId: { not: viewerId } },
    select: { ownerId: true, owner: { select: { name: true, email: true } } },
  });
}

/**
 * Totals for everyone sharing a summary into this hub. Returns scalars only —
 * never the underlying debts.
 */
export async function sharedDebtSummaries(
  hubId: string,
  viewerId: string,
): Promise<SharedDebtSummary[]> {
  const sharers = await summarySharers(hubId, viewerId);
  if (sharers.length === 0) return [];

  const out: SharedDebtSummary[] = [];
  for (const s of sharers) {
    // Trusted client on purpose: the viewer has no RLS route to these rows,
    // and must not — only these aggregates leave this function.
    const debts = await prisma.debt.findMany({
      where: { ownerId: s.ownerId, status: { not: "PAID_OFF" } },
      select: { balanceCents: true, actualPaymentCents: true, minimumPaymentCents: true, status: true },
    });
    if (debts.length === 0) continue;

    out.push({
      ownerId: s.ownerId,
      ownerName: s.owner.name ?? s.owner.email ?? "A member",
      totalBalanceCents: debts.reduce((n, d) => n + d.balanceCents, 0),
      monthlyPaymentCents: debts.reduce(
        (n, d) => n + (d.actualPaymentCents ?? d.minimumPaymentCents ?? 0),
        0,
      ),
      debtCount: debts.length,
      inDefaultCount: debts.filter((d) => d.status === "DEFAULT").length,
    });
  }
  return out;
}

export type MyShare = { hubId: string; hubName: string; visibility: "SUMMARY" | "FULL" | null };

/** Every hub the user belongs to, with how their tracker is shared into it. */
export async function myShares(userId: string): Promise<MyShare[]> {
  const [memberships, shares] = await Promise.all([
    prisma.hubMembership.findMany({
      where: { userId, status: "ACTIVE" },
      select: { hubId: true, hub: { select: { name: true } } },
      orderBy: { joinedAt: "asc" },
    }),
    prisma.debtShare.findMany({ where: { ownerId: userId }, select: { hubId: true, visibility: true } }),
  ]);

  const byHub = new Map(shares.map((s) => [s.hubId, s.visibility]));
  return memberships.map((m) => ({
    hubId: m.hubId,
    hubName: m.hub.name,
    visibility: byHub.get(m.hubId) ?? null,
  }));
}
