import { LogOut, Send, UserMinus, UserPlus } from "lucide-react";
import { notFound } from "next/navigation";

import { requireHub } from "@/lib/session";
import { getT } from "@/lib/i18n-server";
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
import { SubmitButton } from "@/components/SubmitButton";
import { PageHeader, SectionHeader } from "@/components/SectionHeader";
import { DangerZone, FormSection } from "@/components/Form";

export const dynamic = "force-dynamic";

export default async function HubMembersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { user } = await requireHub();
  const t = await getT();
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
    // People the owner may add without an email round-trip: everyone, for an
    // app ADMIN (they admitted every account); otherwise people they already
    // share another hub with. Same rule addKnownMember enforces server-side —
    // the list is a convenience, the action is the boundary. Someone already
    // invited here still shows, so a stalled invite can be completed in a tap.
    isOwner
      ? prisma.user.findMany({
          where: {
            id: { not: user.id },
            email: { not: null },
            hubMemberships: {
              ...(user.role === "ADMIN"
                ? {}
                : {
                    some: {
                      status: "ACTIVE",
                      hub: { memberships: { some: { userId: user.id, status: "ACTIVE" } } },
                    },
                  }),
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
  const activeCount = members.filter((m) => m.status === "ACTIVE").length;

  return (
    <div className="page">
      <PageHeader
        back={{ href: "/today", label: t("Today") }}
        title={t("Members & invites")}
        sub={activeCount === 1 ? t("1 member") : t("{n} members", { n: activeCount })}
      />

      {/* The hub's own face, at the top of its own page. */}
      <div className="card overflow-hidden p-0">
        <HubCover name={hub.name} color={hub.color} imageUrl={hub.coverImageUrl} by={coverBy} height="h-32" />
        {isOwner && (
          <div className="border-t border-[var(--color-border)] p-4">
            <CoverUpload hubId={hubId} hasCover={Boolean(hub.coverImageUrl)} />
          </div>
        )}
      </div>

      <section>
        <SectionHeader title={t("Members")} />
        <div className="list">
          {members.map((m) => (
            <div key={m.id} className="row pr-2">
              <Avatar name={m.user.name} email={m.user.email} size={32} />
              <div className="row-main">
                <span className="row-title">{m.user.name ?? m.user.email}</span>
                <span className="row-sub">
                  {m.role === "OWNER" ? t("Owner") : t("Member")}
                  {m.status === "INVITED" ? ` · ${t("invited")}` : ""}
                </span>
              </div>
              {isOwner && m.user.id !== user.id && (
                <form action={removeMember.bind(null, hubId, m.user.id)}>
                  <SubmitButton
                    className="btn btn-ghost btn-sm text-[var(--color-text-dim)]"
                    pendingLabel="…"
                    aria-label={t("Remove {name}", { name: m.user.name ?? m.user.email ?? "" })}
                  >
                    <UserMinus size={14} strokeWidth={2} aria-hidden />
                    {t("remove")}
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
        </div>
      </section>

      {isOwner && (
        <FormSection title={t("Invite")}>
          {known.length > 0 && (
            <form action={addKnownMember.bind(null, hubId)} className="form-stack border-b border-[var(--color-border)] pb-4">
              <label className="field-label">
                {t("Invite someone already on Life Hub")}
                <select name="userId" required className="field" defaultValue="">
                  <option value="" disabled>
                    {t("Pick a person…")}
                  </option>
                  {known.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.name ? `${k.name} (${k.email})` : k.email}
                    </option>
                  ))}
                </select>
                <span className="field-hint">{t("They get a notification and join once they accept.")}</span>
              </label>
              <SubmitButton className="btn btn-secondary w-full" pendingLabel="…">
                <UserPlus size={16} strokeWidth={2} aria-hidden />
                {t("Invite")}
              </SubmitButton>
            </form>
          )}

          <form action={inviteMember.bind(null, hubId)} className="form-stack">
            <label className="field-label">
              {t("Invite someone new by email")}
              <input
                name="email"
                type="email"
                required
                autoComplete="off"
                placeholder="someone@example.com"
                className="field"
              />
              <span className="field-hint">
                {t("They'll get an email to sign in and accept — works even if they've never used Life Hub before.")}
              </span>
            </label>
            <SubmitButton className="btn btn-primary w-full" pendingLabel="…">
              <Send size={16} strokeWidth={2} aria-hidden />
              {t("Send invite")}
            </SubmitButton>
          </form>
        </FormSection>
      )}

      {isOwner && (
        <FormSection title={t("Hub settings")}>
          <CurrencyPicker hubId={hubId} current={hub.currency} />
          <form
            action={setShowOccasions.bind(null, hubId, !hub.showOccasions)}
            className="flex items-center justify-between gap-3 border-t border-[var(--color-border)] pt-4"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("Holidays on the calendar")}</div>
              <div className="field-hint mt-0.5">
                {t("Valentine's Day, Mother's Day, Christmas, the seasons… with a week's notice.")}
              </div>
            </div>
            <SubmitButton
              className={`btn btn-sm shrink-0 ${hub.showOccasions ? "btn-primary" : "btn-secondary"}`}
              pendingLabel="…"
              aria-pressed={hub.showOccasions}
            >
              {hub.showOccasions ? t("On") : t("Off")}
            </SubmitButton>
          </form>
        </FormSection>
      )}

      {!isOwner && (
        <DangerZone>
          <form action={leaveHub.bind(null, hubId)}>
            <SubmitButton className="btn btn-quiet-danger w-full" pendingLabel="…">
              <LogOut size={16} strokeWidth={2} aria-hidden />
              {t("Leave this hub")}
            </SubmitButton>
          </form>
        </DangerZone>
      )}
    </div>
  );
}
