import Link from "next/link";
import { notFound } from "next/navigation";

import { requireHub } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/Avatar";
import { inviteMember, removeMember, leaveHub } from "../../actions";

export const dynamic = "force-dynamic";

export default async function HubMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireHub();
  const { id: hubId } = await params;

  const membership = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId: user.id } },
  });
  if (!membership) notFound();

  const [hub, members] = await Promise.all([
    prisma.hub.findUniqueOrThrow({ where: { id: hubId } }),
    prisma.hubMembership.findMany({
      where: { hubId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: "asc" }, { role: "asc" }, { joinedAt: "asc" }],
    }),
  ]);

  const isOwner = membership.role === "OWNER";

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← Today
        </Link>
        <div className="mt-1 flex items-center gap-2">
          <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: hub.color }} />
          <h1 className="text-lg font-bold">{hub.name}</h1>
        </div>
        <p className="text-xs text-[var(--color-text-dim)]">
          {members.filter((m) => m.status === "ACTIVE").length} member
          {members.filter((m) => m.status === "ACTIVE").length === 1 ? "" : "s"}
        </p>
      </div>

      {isOwner && (
        <form action={inviteMember.bind(null, hubId)} className="card space-y-2 p-4">
          <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
            Invite by email
          </label>
          <div className="flex gap-2">
            <input
              name="email"
              type="email"
              required
              placeholder="someone@example.com"
              className="input flex-1"
            />
            <button type="submit" className="btn btn-primary shrink-0">
              Invite
            </button>
          </div>
          <p className="text-[0.68rem] text-[var(--color-text-dim)]">
            They'll get an email to sign in and accept — works even if they've never used
            Life Hub before.
          </p>
        </form>
      )}

      <div className="card divide-y divide-[var(--color-border)]">
        {members.map((m) => (
          <div key={m.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
            <div className="flex min-w-0 items-center gap-2.5">
              <Avatar name={m.user.name} email={m.user.email} size={28} />
              <div className="min-w-0">
                <div className="truncate text-sm font-medium">
                  {m.user.name ?? m.user.email}
                </div>
                <div className="text-[0.68rem] text-[var(--color-text-dim)]">
                  {m.role === "OWNER" ? "Owner" : "Member"}
                  {m.status === "INVITED" ? " · invited" : ""}
                </div>
              </div>
            </div>
            {isOwner && m.user.id !== user.id && (
              <form action={removeMember.bind(null, hubId, m.user.id)}>
                <button
                  type="submit"
                  className="shrink-0 text-[0.68rem] font-semibold text-[var(--color-text-dim)] underline"
                >
                  remove
                </button>
              </form>
            )}
          </div>
        ))}
      </div>

      {!isOwner && (
        <form action={leaveHub.bind(null, hubId)}>
          <button
            type="submit"
            className="text-xs font-semibold text-[var(--color-danger)] underline"
          >
            Leave this hub
          </button>
        </form>
      )}
    </div>
  );
}
