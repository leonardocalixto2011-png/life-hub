import Link from "next/link";
import { notFound } from "next/navigation";

import { requireHub } from "@/lib/session";
import { CurrencyPicker } from "./CurrencyPicker";
import { CoverUpload } from "./CoverUpload";
import { HubCover } from "@/components/HubCover";
import { prisma } from "@/lib/prisma";
import { Avatar } from "@/components/Avatar";
import {
  addKnownMember,
  inviteMember,
  leaveHub,
  removeMember,
  setShowOccasions,
} from "../../actions";

export const dynamic = "force-dynamic";

export default async function HubMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireHub();
  const { id: hubId } = await params;

  // `status: ACTIVE`, not merely "a row exists". An INVITED row is created the
  // moment someone is invited, before they have accepted anything — without
  // this check, being invited was enough to read the hub's whole roster
  // (every member's name and email address) by visiting this URL directly.
  // Nothing else guards it: this page queries with the owner-role client, so
  // RLS is not a backstop here, and `listMyHubs` filtering on ACTIVE only ever
  // hid the hub from the switcher, not from a typed-in address.
  const membership = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId: user.id } },
  });
  if (!membership || membership.status !== "ACTIVE") notFound();

  const isOwner = membership.role === "OWNER";

  const [hub, members, known] = await Promise.all([
    prisma.hub.findUniqueOrThrow({
      where: { id: hubId },
      include: { coverBy: { select: { name: true, email: true } } },
    }),
    prisma.hubMembership.findMany({
      where: { hubId },
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ status: "asc" }, { role: "asc" }, { joinedAt: "asc" }],
    }),
    // People the owner already shares another hub with, who aren't in this
    // one yet. The same rule addKnownMember enforces server-side — the list
    // is a convenience, the action is the boundary.
    isOwner
      ? prisma.user.findMany({
          where: {
            id: { not: user.id },
            hubMemberships: {
              some: {
                status: "ACTIVE",
                hub: { memberships: { some: { userId: user.id, status: "ACTIVE" } } },
              },
              none: { hubId, status: "ACTIVE" },
            },
          },
          select: { id: true, name: true, email: true },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
  ]);

  // First name only — the credit is a friendly touch, not a directory entry.
  const coverBy = hub.coverBy?.name?.split(" ")[0] ?? null;

  return (
    <div className="space-y-4 p-3">
      <div>
        <Link href="/today" className="text-xs font-semibold text-[var(--color-text-dim)]">
          ← Today
        </Link>
        <p className="mt-2 text-xs text-[var(--color-text-dim)]">
          {members.filter((m) => m.status === "ACTIVE").length} member
          {members.filter((m) => m.status === "ACTIVE").length === 1 ? "" : "s"}
        </p>
      </div>

      {/* The hub's own face, at the top of its own page. */}
      <div className="card overflow-hidden p-0">
        <HubCover
          name={hub.name}
          color={hub.color}
          imageUrl={hub.coverImageUrl}
          by={coverBy}
          height="h-32"
        />
        {isOwner && (
          <div className="border-t border-[var(--color-border)] p-3">
            <CoverUpload hubId={hubId} hasCover={Boolean(hub.coverImageUrl)} />
          </div>
        )}
      </div>

      {isOwner && (
        <div className="card space-y-3 p-4">
          <CurrencyPicker hubId={hubId} current={hub.currency} />
          <form
            action={setShowOccasions.bind(null, hubId, !hub.showOccasions)}
            className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-3"
          >
            <div className="text-xs">
              <div className="font-semibold">Holidays on the calendar</div>
              <div className="text-[var(--color-text-dim)]">
                Saint-Valentin, Fête des Mères, Noël, the seasons… with a week&apos;s notice.
              </div>
            </div>
            <button type="submit" className={`btn shrink-0 px-3 py-1.5 text-xs ${hub.showOccasions ? "btn-primary" : ""}`}>
              {hub.showOccasions ? "On" : "Off"}
            </button>
          </form>
        </div>
      )}

      {isOwner && known.length > 0 && (
        <form action={addKnownMember.bind(null, hubId)} className="card space-y-2 p-4">
          <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
            Add someone you already know on Life Hub
          </label>
          <div className="flex gap-2">
            <select name="userId" required className="field flex-1" defaultValue="">
              <option value="" disabled>
                Pick a person…
              </option>
              {known.map((k) => (
                <option key={k.id} value={k.id}>
                  {k.name ? `${k.name} (${k.email})` : k.email}
                </option>
              ))}
            </select>
            <button type="submit" className="btn btn-primary shrink-0">
              Add
            </button>
          </div>
          <p className="text-[0.68rem] text-[var(--color-text-dim)]">
            People you share another hub with. They&apos;re added right away and get a notification.
          </p>
        </form>
      )}

      {isOwner && (
        <form action={inviteMember.bind(null, hubId)} className="card space-y-2 p-4">
          <label className="block text-xs font-semibold text-[var(--color-text-dim)]">
            Invite someone new by email
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
            They&apos;ll get an email to sign in and accept — works even if they&apos;ve never used
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
