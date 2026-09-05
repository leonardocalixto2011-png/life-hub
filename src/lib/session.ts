import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export type SessionUser = {
  id: string;
  email: string;
  name: string | null;
  role: "ADMIN" | "MEMBER";
  backgroundImageUrl: string | null;
};

export type SessionHub = {
  id: string;
  name: string;
  color: string;
  role: "OWNER" | "MEMBER";
};

export const CURRENT_HUB_COOKIE = "current_hub";

/** Server-side: current DB user, or redirect to /login. Use in guarded layouts + actions. */
export async function requireUser(): Promise<SessionUser> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, backgroundImageUrl: true },
  });
  if (!user?.email) redirect("/login");

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    backgroundImageUrl: user.backgroundImageUrl,
  };
}

export async function getUser(): Promise<SessionUser | null> {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email) return null;
  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, email: true, name: true, role: true, backgroundImageUrl: true },
  });
  return user?.email
    ? {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        backgroundImageUrl: user.backgroundImageUrl,
      }
    : null;
}

/**
 * All of a user's hubs (ACTIVE memberships only), ordered by when they joined.
 * Used by the hub switcher and to resolve the current hub.
 */
export async function listMyHubs(userId: string): Promise<SessionHub[]> {
  const memberships = await prisma.hubMembership.findMany({
    where: { userId, status: "ACTIVE" },
    include: { hub: { select: { id: true, name: true, color: true } } },
    orderBy: { joinedAt: "asc" },
  });
  return memberships.map((m) => ({
    id: m.hub.id,
    name: m.hub.name,
    color: m.hub.color,
    role: m.role,
  }));
}

/**
 * Resolves the "current" hub from the `current_hub` cookie, falling back to
 * the user's oldest ACTIVE membership. Returns null if the user belongs to no
 * hub yet (brand new invited user who hasn't accepted anything).
 */
async function resolveCurrentHub(userId: string): Promise<SessionHub | null> {
  const hubs = await listMyHubs(userId);
  if (hubs.length === 0) return null;

  const store = await cookies();
  const cookieHubId = store.get(CURRENT_HUB_COOKIE)?.value;
  return hubs.find((h) => h.id === cookieHubId) ?? hubs[0];
}

/**
 * Server-side: current DB user + current hub, or redirect. Use at the top of
 * every hub-scoped page/layout/action instead of requireUser() alone — the
 * hub id returned here is what every data.ts call and withHub() write must be
 * scoped to (RLS also enforces this at the database layer, see
 * src/lib/hub-context.ts, but the app still has to pick *which* of the user's
 * hubs is active).
 */
export async function requireHub(): Promise<{ user: SessionUser; hub: SessionHub }> {
  const user = await requireUser();
  const hub = await resolveCurrentHub(user.id);
  if (!hub) redirect("/hubs/new");
  return { user, hub };
}
