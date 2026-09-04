import Link from "next/link";

import { requireUser, listMyHubs } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createHub } from "@/app/(app)/hubs/actions";

export const dynamic = "force-dynamic";

export default async function NewHubPage() {
  const user = await requireUser();
  const [hubs, pendingInvites] = await Promise.all([
    listMyHubs(user.id),
    prisma.hubMembership.count({ where: { userId: user.id, status: "INVITED" } }),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create a hub</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          A hub is its own space — tasks, deadlines, subscriptions, budget and calendar,
          shared only with the people you invite into it.
        </p>
      </div>

      {pendingInvites > 0 && (
        <Link
          href="/hubs/invites"
          className="card block border-[var(--color-primary)] p-3 text-sm font-semibold text-[var(--color-primary)]"
        >
          You have {pendingInvites} pending hub invite{pendingInvites === 1 ? "" : "s"} →
        </Link>
      )}

      <form action={createHub} className="card space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-dim)]">
            Hub name
          </label>
          <input
            name="name"
            required
            maxLength={80}
            placeholder="e.g. Dan & Chantelle"
            className="input w-full"
            autoFocus
          />
        </div>
        <button type="submit" className="btn btn-primary w-full">
          Create hub
        </button>
      </form>

      {hubs.length > 0 && (
        <p className="px-1 text-center text-[0.7rem] text-[var(--color-text-dim)]">
          You're already in {hubs.length} hub{hubs.length === 1 ? "" : "s"} —{" "}
          <Link href="/today" className="font-semibold underline">
            go back
          </Link>
          .
        </p>
      )}
    </main>
  );
}
