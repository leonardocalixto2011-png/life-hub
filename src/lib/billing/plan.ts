import type { PlanAccount } from "@prisma/client";

import { prisma } from "@/lib/prisma";
import { LIMITS, PLUS_COVERED_HUBS, type PlanLimits, type PlanName } from "@/lib/billing/plans";

/**
 * Who has Plus, and what that unlocks. Every limit in the app asks here, on
 * the server — a paywall enforced in a client component is not a paywall.
 *
 * Plus is bought by a PERSON and covers the hubs that person owns (the oldest
 * PLUS_COVERED_HUBS of them), for every member of those hubs. A household pays
 * once, not once per member, and the couple's hub and the subscriber's own hub
 * are both covered.
 *
 * BILLING_ENABLED is the master switch. Unset (the beta), everyone is treated
 * as Plus and nothing below limits anybody: exactly the app as it was before
 * billing existed. Turn it on at public launch, after granting the beta
 * households COMP plans from /admin/finance.
 *
 * The plan tables are server-only (no app_user grant), so this module uses
 * the owner client and only ever answers about the caller's own row or with
 * booleans/ids.
 */

export function billingEnabled(): boolean {
  return process.env.BILLING_ENABLED === "1";
}

/** Whether a plan row grants Plus right now. Pure, for tests and the dashboard. */
export function planIsPlus(row: Pick<PlanAccount, "status" | "trialEndsAt" | "compUntil" | "currentPeriodEnd"> | null, now = new Date()): boolean {
  if (!row) return false;
  switch (row.status) {
    case "COMP":
      return !row.compUntil || row.compUntil > now;
    case "TRIALING":
      return !!row.trialEndsAt && row.trialEndsAt > now;
    case "ACTIVE":
    case "PAST_DUE": // Stripe is retrying; keep Plus during its dunning window.
      return true;
    case "CANCELED":
      // Cancelled at period end is still ACTIVE in Stripe until then; a row
      // that reached CANCELED is over.
      return false;
  }
}

export function getPlanRow(userId: string) {
  return prisma.planAccount.findUnique({ where: { userId } });
}

export async function userHasPlus(userId: string): Promise<boolean> {
  if (!billingEnabled()) return true;
  return planIsPlus(await getPlanRow(userId));
}

/** The hubs a Plus subscriber's plan covers: their oldest owned hubs. */
async function coveredHubIds(userIds: string[]): Promise<Set<string>> {
  if (userIds.length === 0) return new Set();
  const owned = await prisma.hubMembership.findMany({
    where: { userId: { in: userIds }, role: "OWNER", status: "ACTIVE" },
    select: { userId: true, hubId: true, hub: { select: { createdAt: true } } },
    orderBy: { hub: { createdAt: "asc" } },
  });
  const perUser = new Map<string, number>();
  const covered = new Set<string>();
  for (const m of owned) {
    const n = perUser.get(m.userId) ?? 0;
    if (n >= PLUS_COVERED_HUBS) continue;
    perUser.set(m.userId, n + 1);
    covered.add(m.hubId);
  }
  return covered;
}

/** Every hub on Plus right now — for cron jobs that loop over many hubs. */
export async function plusHubIds(): Promise<Set<string> | "all"> {
  if (!billingEnabled()) return "all";
  const rows = await prisma.planAccount.findMany({
    where: { status: { in: ["COMP", "TRIALING", "ACTIVE", "PAST_DUE"] } },
    select: { userId: true, status: true, trialEndsAt: true, compUntil: true, currentPeriodEnd: true },
  });
  const now = new Date();
  return coveredHubIds(rows.filter((r) => planIsPlus(r, now)).map((r) => r.userId));
}

export async function hubHasPlus(hubId: string): Promise<boolean> {
  if (!billingEnabled()) return true;
  const owners = await prisma.hubMembership.findMany({
    where: { hubId, role: "OWNER", status: "ACTIVE" },
    select: { userId: true },
  });
  const rows = await prisma.planAccount.findMany({
    where: { userId: { in: owners.map((o) => o.userId) } },
  });
  const now = new Date();
  const paying = rows.filter((r) => planIsPlus(r, now)).map((r) => r.userId);
  return (await coveredHubIds(paying)).has(hubId);
}

export async function hubPlan(hubId: string): Promise<PlanName> {
  return (await hubHasPlus(hubId)) ? "PLUS" : "FREE";
}

export function limitsFor(plan: PlanName): PlanLimits {
  return LIMITS[plan];
}

export const NEEDS_PLUS_MAILBOX =
  "Connecting a mailbox is part of Plus. Start the free trial or subscribe under Plan & billing.";

/**
 * Before creating a hub: the reason it's refused, or null. Free owns one hub;
 * Plus's own ceiling is MAX_OWNED_HUBS, checked in hub-setup.ts.
 */
export async function ownHubLimitMessage(userId: string): Promise<string | null> {
  if (!billingEnabled()) return null;
  const owned = await prisma.hubMembership.count({ where: { userId, role: "OWNER" } });
  if (owned >= LIMITS.FREE.ownedHubs && !(await userHasPlus(userId))) {
    return "The free plan includes one hub you own. Plus covers up to three, see Plan & billing.";
  }
  return null;
}

/** Before adding someone to a hub (invite or approving a request). */
export async function assertMemberRoom(hubId: string): Promise<void> {
  if (!billingEnabled()) return;
  const plan = await hubPlan(hubId);
  const count = await prisma.hubMembership.count({
    where: { hubId, status: { in: ["ACTIVE", "INVITED"] } },
  });
  if (count >= LIMITS[plan].membersPerHub) {
    throw new Error(
      plan === "FREE"
        ? "This hub has reached the free plan's 6 members. The owner's Plus plan allows 10."
        : "This hub has reached its 10 members.",
    );
  }
}

/** Names of the hubs a person's Plus covers, for their billing page. */
export async function coveredHubNames(userId: string): Promise<string[]> {
  const owned = await prisma.hubMembership.findMany({
    where: { userId, role: "OWNER", status: "ACTIVE" },
    select: { hub: { select: { name: true } } },
    orderBy: { hub: { createdAt: "asc" } },
    take: PLUS_COVERED_HUBS,
  });
  return owned.map((m) => m.hub.name);
}
