import { cookies } from "next/headers";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { rateLimit } from "@/lib/rate-limit";
import { CURRENT_HUB_COOKIE } from "@/lib/session";

/**
 * The parts of "make a hub" / "join a hub" that more than one caller needs —
 * /hubs/new and the invite card redirect when they finish, the first-run
 * welcome at /welcome stays on its own page and moves to the next step. Not a
 * "use server" module: these are plain helpers that trust the userId they are
 * given, so only server actions that already ran requireUser() may call them.
 */

/** Colours offered when naming a hub. The first is the schema default. */
export const HUB_COLORS = [
  "#6366f1", // indigo
  "#ec4899", // pink
  "#16a34a", // green
  "#0ea5e9", // sky
  "#f97316", // orange
  "#a855f7", // violet
  "#64748b", // slate
] as const;

export function isHubColor(v: unknown): v is (typeof HUB_COLORS)[number] {
  return typeof v === "string" && (HUB_COLORS as readonly string[]).includes(v);
}

export class HubLimitError extends Error {}

/**
 * Creates a hub with `userId` as its ACTIVE owner. Runs on the owner-role
 * client: there's no way to satisfy a hub-membership RLS check before the
 * first membership row exists (see the comment atop the multihub_rls
 * migration). Rate limited, because a hub is the one thing anyone signed in
 * can create without any other check.
 */
export async function createHubFor(userId: string, name: string, color?: string) {
  if (!(await rateLimit(`hub-create:${userId}`, 10, 3600)).ok) {
    throw new HubLimitError("Too many hubs created — try again in an hour.");
  }
  return prisma.$transaction(async (tx) => {
    const hub = await tx.hub.create({
      data: { name, createdById: userId, ...(isHubColor(color) ? { color } : {}) },
    });
    await tx.hubMembership.create({
      data: { hubId: hub.id, userId, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
    });
    return hub;
  });
}

/** Makes `hubId` the hub the app opens on. */
export async function setCurrentHub(hubId: string) {
  const store = await cookies();
  store.set(CURRENT_HUB_COOKIE, hubId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
}

/**
 * Accepts the caller's own invite. Self-scoped, so it runs through withHub and
 * RLS like any other self-row write; throws if there is no such invite.
 */
export async function acceptInviteFor(userId: string, hubId: string) {
  await withHub(userId, (tx) =>
    tx.hubMembership.update({
      where: { hubId_userId: { hubId, userId }, status: "INVITED" },
      data: { status: "ACTIVE", joinedAt: new Date() },
    }),
  );
}
