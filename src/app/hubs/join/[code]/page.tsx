import Link from "next/link";
import { Hourglass, Send } from "lucide-react";

import { requireUser } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { formatJoinCode, normalizeJoinCode } from "@/lib/join-codes";
import { HubCover } from "@/components/HubCover";
import { ActionForm } from "@/components/ActionForm";
import { SubmitButton } from "@/components/SubmitButton";
import { InviteCard } from "@/app/hubs/invites/InviteCard";
import { cancelJoinRequest, requestToJoin } from "../actions";

export const dynamic = "force-dynamic";

/**
 * Where a hub's join link lands (/hubs/join/ABCD2345). Shows which hub the
 * code belongs to — name, colour, cover, how many people — and asks before
 * sending anything. Never the members' names or addresses: the person isn't
 * in yet, and a code can travel further than intended.
 *
 * Outside the (app) group so it works for someone with no hub at all.
 */
export default async function JoinHubPage({ params }: { params: Promise<{ code: string }> }) {
  const user = await requireUser();
  const t = await getT();
  const { code: raw } = await params;
  const code = normalizeJoinCode(decodeURIComponent(raw));

  // Every lookup is a guess at a code, so they are counted per person: plenty
  // for typos, nowhere near enough to find a hub by trying codes.
  const allowed = code ? (await rateLimit(`join-code:${user.id}`, 20, 3600)).ok : false;
  const hub =
    code && allowed
      ? await prisma.hub.findUnique({
          where: { joinCode: code },
          select: {
            id: true,
            name: true,
            color: true,
            coverImageUrl: true,
            coverBy: { select: { name: true } },
            _count: { select: { memberships: { where: { status: "ACTIVE" } } } },
          },
        })
      : null;
  const mine = hub
    ? await prisma.hubMembership.findUnique({
        where: { hubId_userId: { hubId: hub.id, userId: user.id } },
        select: { status: true, requestNote: true, invitedBy: { select: { name: true } } },
      })
    : null;

  return (
    <main className="mx-auto flex min-h-dvh max-w-sm flex-col justify-center gap-6 p-6">
      {!hub ? (
        <>
          <h1 className="display text-3xl">{allowed || !code ? t("That code doesn't work.") : t("Too many tries.")}</h1>
          <p className="text-sm text-[var(--color-text-dim)]">
            {allowed || !code
              ? t("It may have been changed or turned off. Ask someone in the hub for the current one.")
              : t("Wait an hour, then try the code again.")}
          </p>
          <Link href="/today" className="btn btn-secondary w-full">
            {t("Back to Life Hub")}
          </Link>
        </>
      ) : mine?.status === "INVITED" ? (
        <>
          <h1 className="display text-3xl">{t("You've been invited.")}</h1>
          <InviteCard
            hubId={hub.id}
            name={hub.name}
            color={hub.color}
            coverImageUrl={hub.coverImageUrl}
            coverBy={hub.coverBy?.name ?? null}
            invitedBy={mine.invitedBy?.name ?? t("Someone")}
            members={[]}
          />
        </>
      ) : (
        <>
          <div className="card overflow-hidden p-0">
            <HubCover
              name={hub.name}
              color={hub.color}
              imageUrl={hub.coverImageUrl}
              by={hub.coverBy?.name?.split(" ")[0] ?? null}
              height="h-32"
            />
            <p className="px-4 py-3 text-sm text-[var(--color-text-dim)]">
              {hub._count.memberships === 1 ? t("1 person") : t("{n} people", { n: hub._count.memberships })} ·{" "}
              {t("Code {code}", { code: formatJoinCode(code!) })}
            </p>
          </div>

          {mine?.status === "ACTIVE" ? (
            <>
              <h1 className="display text-2xl">{t("You're already in {name}.", { name: hub.name })}</h1>
              <Link href="/today" className="btn btn-primary w-full">
                {t("Open Life Hub")}
              </Link>
            </>
          ) : mine?.status === "REQUESTED" ? (
            <>
              <h1 className="display flex items-center gap-2 text-2xl">
                <Hourglass size={22} aria-hidden /> {t("Request sent.")}
              </h1>
              <p className="text-sm text-[var(--color-text-dim)]">
                {t("An owner of {name} will answer. You'll get a notification when you're in.", { name: hub.name })}
              </p>
              <form action={cancelJoinRequest.bind(null, hub.id)}>
                <SubmitButton className="btn btn-ghost w-full" pendingLabel="…">
                  {t("Cancel my request")}
                </SubmitButton>
              </form>
              <Link href="/today" className="btn btn-secondary w-full">
                {t("Back to Life Hub")}
              </Link>
            </>
          ) : (
            <>
              <div>
                <h1 className="display text-2xl">{t("Ask to join {name}?", { name: hub.name })}</h1>
                <p className="mt-1 text-sm text-[var(--color-text-dim)]">
                  {t("An owner sees your name and username and decides. Joining shares the hub's bills, deadlines and calendar with you; your debts stay private.")}
                </p>
              </div>
              <ActionForm action={requestToJoin.bind(null, code!)} className="form-stack">
                <label className="field-label">
                  {t("A word for the owner (optional)")}
                  <textarea
                    name="note"
                    rows={2}
                    maxLength={140}
                    className="field"
                    placeholder={t("e.g. It's Marie, Chantelle's sister")}
                  />
                </label>
                <SubmitButton className="btn btn-primary btn-lg w-full" pendingLabel={t("Sending…")}>
                  <Send size={17} strokeWidth={2} aria-hidden />
                  {t("Ask to join")}
                </SubmitButton>
              </ActionForm>
              {!user.username && (
                <p className="field-hint mt-0">
                  {t("Tip: pick a username under Your account, so the owner can tell who you are.")}
                </p>
              )}
            </>
          )}
        </>
      )}
    </main>
  );
}
