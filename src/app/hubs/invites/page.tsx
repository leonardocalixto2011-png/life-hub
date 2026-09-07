import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { InviteCard } from "./InviteCard";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const user = await requireUser();
  const invites = await prisma.hubMembership.findMany({
    where: { userId: user.id, status: "INVITED" },
    include: {
      hub: {
        select: {
          id: true,
          name: true,
          color: true,
          coverImageUrl: true,
          coverBy: { select: { name: true, email: true } },
          createdBy: { select: { name: true, email: true } },
          // Who is already inside. Only enough to draw an avatar — no email
          // is rendered, so accepting isn't a precondition for seeing that
          // the hub is real, but declining doesn't hand over a contact list
          // either.
          memberships: {
            where: { status: "ACTIVE" },
            select: { user: { select: { id: true, name: true, email: true } } },
            orderBy: { joinedAt: "asc" },
            take: 5,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="display text-3xl">
          {invites.length === 0 ? "Nothing waiting." : "You've been invited."}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          Joining a hub shares its bills, deadlines and calendar. Your debts stay private
          until you choose otherwise.
        </p>
      </div>

      {invites.length === 0 ? (
        <p className="card p-6 text-center text-sm text-[var(--color-text-dim)]">
          No pending invites.{" "}
          <Link href="/today" className="font-semibold underline">
            Back to Life Hub
          </Link>
        </p>
      ) : (
        <div className="space-y-3">
          {invites.map((inv) => (
            <InviteCard
              key={inv.id}
              hubId={inv.hub.id}
              name={inv.hub.name}
              color={inv.hub.color}
              coverImageUrl={inv.hub.coverImageUrl}
              coverBy={inv.hub.coverBy?.name ?? null}
              invitedBy={inv.hub.createdBy.name ?? inv.hub.createdBy.email ?? "Someone"}
              members={inv.hub.memberships.map((m) => m.user)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
