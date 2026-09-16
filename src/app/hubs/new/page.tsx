import Link from "next/link";

import { requireUser, listMyHubs } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { createHub } from "@/app/(app)/hubs/actions";
import { getT } from "@/lib/i18n-server";

export const dynamic = "force-dynamic";

export default async function NewHubPage() {
  const user = await requireUser();
  const t = await getT();
  const [hubs, pendingInvites] = await Promise.all([
    listMyHubs(user.id),
    prisma.hubMembership.count({ where: { userId: user.id, status: "INVITED" } }),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{t("Create a hub")}</h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          {t("A hub is its own space — tasks, deadlines, subscriptions, budget and calendar, shared only with the people you invite into it.")}
        </p>
      </div>

      {pendingInvites > 0 && (
        <Link
          href="/hubs/invites"
          className="card block border-[var(--color-primary)] p-3 text-sm font-semibold text-[var(--color-primary)]"
        >
          {t("You have {n} pending invitations →", { n: pendingInvites })}
        </Link>
      )}

      <form action={createHub} className="card space-y-3 p-4">
        <div>
          <label className="mb-1 block text-xs font-semibold text-[var(--color-text-dim)]">
            {t("Hub name")}
          </label>
          <input
            name="name"
            required
            maxLength={80}
            placeholder={t("e.g. Dan & Chantelle")}
            className="input w-full"
            autoFocus
          />
        </div>
        <button type="submit" className="btn btn-primary w-full">
          {t("Create hub")}
        </button>
      </form>

      {hubs.length > 0 && (
        <p className="px-1 text-center text-[0.7rem] text-[var(--color-text-dim)]">
          {t("You're already in {n} hubs —", { n: hubs.length })}{" "}
          <Link href="/today" className="font-semibold underline">
            {t("go back")}
          </Link>
          .
        </p>
      )}
    </main>
  );
}
