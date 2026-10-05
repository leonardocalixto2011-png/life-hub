import Link from "next/link";
import { redirect } from "next/navigation";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { InviteCard } from "./InviteCard";
import { JoinCodeBox } from "@/components/JoinCodeBox";
import { SubmitButton } from "@/components/SubmitButton";
import { cancelJoinRequest } from "@/app/hubs/join/actions";

export const dynamic = "force-dynamic";

export default async function InvitesPage() {
  const user = await requireUser();
  // Someone new is walked through /welcome, which handles hubs and invites itself.
  if (!user.onboardedAt) redirect("/welcome");
  const t = await getT();
  const [invites, requests, hubCount] = await Promise.all([
    prisma.hubMembership.findMany({
    where: { userId: user.id, status: "INVITED" },
    include: {
      invitedBy: { select: { name: true } },
      hub: {
        select: {
          id: true,
          name: true,
          color: true,
          coverImageUrl: true,
          coverBy: { select: { name: true } },
          createdBy: { select: { name: true } },
          // Who is already inside. Only enough to draw an avatar — no email
          // is rendered, so accepting isn't a precondition for seeing that
          // the hub is real, but declining doesn't hand over a contact list
          // either.
          memberships: {
            where: { status: "ACTIVE" },
            select: { user: { select: { id: true, name: true } } },
            orderBy: { joinedAt: "asc" },
            take: 5,
          },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  }),
    // Requests this person sent and nobody has answered yet. Hub name and
    // colour only — they aren't in it.
    prisma.hubMembership.findMany({
      where: { userId: user.id, status: "REQUESTED" },
      select: { hubId: true, createdAt: true, hub: { select: { name: true, color: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.hubMembership.count({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      <div>
        <h1 className="display text-3xl">
          {invites.length > 0 ? t("You've been invited.") : requests.length > 0 ? t("Waiting for an answer.") : t("Nothing waiting.")}
        </h1>
        <p className="mt-1 text-sm text-[var(--color-text-dim)]">
          {t("Joining a hub shares its bills, deadlines and calendar. Your debts stay private until you choose otherwise.")}
        </p>
      </div>

      {requests.length > 0 && (
        <section className="space-y-2">
          <h2 className="section-title">{t("Your requests")}</h2>
          <div className="list">
            {requests.map((r) => (
              <div key={r.hubId} className="row pr-2">
                <span className="h-8 w-8 shrink-0 rounded-full" style={{ background: r.hub.color }} aria-hidden />
                <div className="row-main">
                  <span className="row-title">{r.hub.name}</span>
                  <span className="row-sub">{t("Waiting for an owner to answer")}</span>
                </div>
                <form action={cancelJoinRequest.bind(null, r.hubId)}>
                  <SubmitButton className="btn btn-ghost btn-sm" pendingLabel="…">
                    {t("Cancel")}
                  </SubmitButton>
                </form>
              </div>
            ))}
          </div>
        </section>
      )}

      {invites.length === 0 ? (
        requests.length === 0 && (
          <p className="card px-5 py-8 text-center text-sm text-[var(--color-text-dim)]">
            {t("No pending invites.")}{" "}
            {hubCount > 0 && (
              <Link href="/today" className="font-semibold underline">
                {t("Back to Life Hub")}
              </Link>
            )}
          </p>
        )
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
              invitedBy={inv.invitedBy?.name ?? inv.hub.createdBy.name ?? t("Someone")}
              members={inv.hub.memberships.map((m) => m.user)}
            />
          ))}
        </div>
      )}

      <div className="card space-y-4 p-4">
        <JoinCodeBox />
        {hubCount === 0 && (
          <Link href="/hubs/new" className="btn btn-secondary w-full">
            {t("Or create your own hub")}
          </Link>
        )}
      </div>
      {hubCount > 0 && (invites.length > 0 || requests.length > 0) && (
        <Link href="/today" className="text-center text-sm font-semibold underline">
          {t("Back to Life Hub")}
        </Link>
      )}
    </main>
  );
}
