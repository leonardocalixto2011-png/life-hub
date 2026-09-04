import Link from "next/link";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { acceptInvite, declineInvite } from "@/app/(app)/hubs/actions";

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
          createdBy: { select: { name: true, email: true } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Hub invites</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          Accept to join, or decline to remove the invite.
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
            <div key={inv.id} className="card space-y-3 p-4">
              <div className="flex items-center gap-2">
                <span
                  className="h-3 w-3 shrink-0 rounded-full"
                  style={{ background: inv.hub.color }}
                />
                <div>
                  <div className="font-semibold">{inv.hub.name}</div>
                  <div className="text-xs text-[var(--color-text-dim)]">
                    invited by {inv.hub.createdBy.name ?? inv.hub.createdBy.email}
                  </div>
                </div>
              </div>
              <div className="flex gap-2">
                <form action={acceptInvite.bind(null, inv.hub.id)} className="flex-1">
                  <button type="submit" className="btn btn-primary w-full">
                    Accept
                  </button>
                </form>
                <form action={declineInvite.bind(null, inv.hub.id)} className="flex-1">
                  <button type="submit" className="btn btn-ghost w-full">
                    Decline
                  </button>
                </form>
              </div>
            </div>
          ))}
        </div>
      )}
    </main>
  );
}
