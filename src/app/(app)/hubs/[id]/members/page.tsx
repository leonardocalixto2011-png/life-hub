import { AtSign, Check, Crown, Eye, EyeOff, LogOut, Send, UserMinus, UserPlus, X } from "lucide-react";
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
  approveJoinRequest,
  declineJoinRequest,
  inviteByUsername,
  inviteMember,
  leaveHub,
  makeOwner,
  removeMember,
  revokeHubAppInvite,
  setJoinCode,
  setShowEmail,
  setShowOccasions,
} from "../../actions";
import { ActionForm } from "@/components/ActionForm";
import { CopyField } from "@/components/CopyField";
import { appUrl, maskEmail } from "@/lib/app-invites";
import { formatJoinCode } from "@/lib/join-codes";
import { listHubRoster } from "@/lib/data";
import { personName } from "@/lib/people";
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

  const now = new Date();
  const [hub, members, known, requests, pendingAppInvites, ownerCount] = await Promise.all([
    prisma.hub.findUniqueOrThrow({
      where: { id: hubId },
      include: { coverBy: { select: { name: true } } },
    }),
    // Other members' email addresses are stripped in here: a member sees
    // names only, plus an address for themself, for anyone who chose to show
    // theirs in this hub, and — owner only — for pending invites.
    listHubRoster(user.id, hubId, { includeInvited: true }),
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
          // An address only where the owner could not otherwise tell people
          // apart: the app ADMIN, who admitted every account by its address,
          // sees it; anyone else sees it only for a person who chose to show
          // their email in a hub the two of them share.
          select: {
            id: true,
            name: true,
            email: true,
            hubMemberships: {
              where: {
                status: "ACTIVE",
                showEmail: true,
                hub: { memberships: { some: { userId: user.id, status: "ACTIVE" } } },
              },
              select: { id: true },
              take: 1,
            },
          },
          orderBy: { name: "asc" },
        })
      : Promise.resolve([]),
    // Join requests, owners only. Name, @username, photo and their note —
    // never the address: they asked with a code, not by giving it out.
    isOwner
      ? prisma.hubMembership.findMany({
          where: { hubId, status: "REQUESTED" },
          select: {
            createdAt: true,
            requestNote: true,
            user: { select: { id: true, name: true, username: true, avatarUrl: true } },
          },
          orderBy: { createdAt: "asc" },
        })
      : Promise.resolve([]),
    // Invitations to people with no account yet. The owner typed these
    // addresses; shown masked anyway, since the page can be open on a shared
    // screen and the full address adds nothing to recognising it.
    isOwner
      ? prisma.appInvite.findMany({
          where: { hubId, usedAt: null, revokedAt: null, expiresAt: { gt: now } },
          select: { id: true, email: true, expiresAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.hubMembership.count({ where: { hubId, role: "OWNER", status: "ACTIVE" } }),
  ]);

  // First name only — the credit is a friendly touch, not a directory entry.
  const coverBy = hub.coverBy?.name?.split(" ")[0] ?? null;
  const activeCount = members.filter((m) => m.status === "ACTIVE").length;
  const me = members.find((m) => m.id === user.id);
  const knownPeople = known.map((k) => {
    const email = user.role === "ADMIN" || k.hubMemberships.length > 0 ? k.email : null;
    return { id: k.id, label: k.name ? (email ? `${k.name} (${email})` : k.name) : (email ?? t("Member")) };
  });

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
            <div key={m.membershipId} className="row pr-2">
              <Avatar name={m.name} email={m.email} src={m.avatarUrl} size={32} />
              <div className="row-main">
                <span className="row-title">{personName(m, m.username ? `@${m.username}` : t("Member"))}</span>
                <span className="row-sub">
                  {m.username && m.name ? `@${m.username} · ` : ""}
                  {m.hubRole === "OWNER" ? t("Owner") : t("Member")}
                  {m.status === "INVITED" ? ` · ${t("invited")}` : ""}
                  {m.id === user.id ? ` · ${t("you")}` : ""}
                </span>
                {/* Shown only when the roster handed one over — and never as a
                    second copy of a name that is already the address. */}
                {m.email && m.name && <span className="row-sub break-all">{m.email}</span>}
              </div>
              {isOwner && m.id !== user.id && m.status === "ACTIVE" && m.hubRole === "MEMBER" && (
                <form action={makeOwner.bind(null, hubId, m.id)}>
                  <SubmitButton
                    className="btn btn-ghost btn-sm text-[var(--color-text-dim)]"
                    pendingLabel="…"
                    aria-label={t("Make {name} an owner", { name: personName(m, t("Member")) })}
                  >
                    <Crown size={14} strokeWidth={2} aria-hidden />
                    {t("owner")}
                  </SubmitButton>
                </form>
              )}
              {isOwner && m.id !== user.id && m.hubRole !== "OWNER" && (
                <form action={removeMember.bind(null, hubId, m.id)}>
                  <SubmitButton
                    className="btn btn-ghost btn-sm text-[var(--color-text-dim)]"
                    pendingLabel="…"
                    aria-label={t("Remove {name}", { name: personName(m, t("Member")) })}
                  >
                    <UserMinus size={14} strokeWidth={2} aria-hidden />
                    {m.status === "INVITED" ? t("cancel") : t("remove")}
                  </SubmitButton>
                </form>
              )}
            </div>
          ))}
          {pendingAppInvites.map((inv) => (
            <div key={inv.id} className="row pr-2">
              <Avatar name={null} email={inv.email} size={32} />
              <div className="row-main">
                <span className="row-title break-all">{inv.email ? maskEmail(inv.email) : t("Invitation link")}</span>
                <span className="row-sub">{t("invited · no account yet")}</span>
              </div>
              <form action={revokeHubAppInvite.bind(null, hubId, inv.id)}>
                <SubmitButton className="btn btn-ghost btn-sm text-[var(--color-text-dim)]" pendingLabel="…">
                  <X size={14} strokeWidth={2} aria-hidden />
                  {t("cancel")}
                </SubmitButton>
              </form>
            </div>
          ))}
        </div>
      </section>

      {isOwner && requests.length > 0 && (
        <section>
          <SectionHeader title={t("Asking to join")} />
          <div className="list">
            {requests.map((r) => (
              <div key={r.user.id} className="row items-start pr-2">
                <Avatar name={r.user.name} src={r.user.avatarUrl} size={32} />
                <div className="row-main">
                  <span className="row-title">{r.user.name ?? (r.user.username ? `@${r.user.username}` : t("Someone"))}</span>
                  {r.user.username && r.user.name && <span className="row-sub">@{r.user.username}</span>}
                  {r.requestNote && <span className="row-sub italic">“{r.requestNote}”</span>}
                </div>
                <div className="flex shrink-0 gap-1">
                  <form action={approveJoinRequest.bind(null, hubId, r.user.id)}>
                    <SubmitButton className="btn btn-primary btn-sm" pendingLabel="…">
                      <Check size={14} strokeWidth={2.4} aria-hidden />
                      {t("Let in")}
                    </SubmitButton>
                  </form>
                  <form action={declineJoinRequest.bind(null, hubId, r.user.id)}>
                    <SubmitButton
                      className="btn btn-ghost btn-sm"
                      pendingLabel="…"
                      aria-label={t("Decline")}
                    >
                      <X size={14} strokeWidth={2} aria-hidden />
                    </SubmitButton>
                  </form>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {me && (
        <FormSection title={t("Your email in this hub")}>
          <form
            action={setShowEmail.bind(null, hubId, !me.showEmail)}
            className="flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-sm font-semibold">{t("Show my email to the members of this hub")}</div>
              <div className="field-hint mt-0.5">
                {me.showEmail
                  ? t("On: the members of {hub} can see {email}.", { hub: hub.name, email: user.email })
                  : t("Off: the other members see your name only. Your choice applies to this hub alone.")}
              </div>
            </div>
            <SubmitButton
              className={`btn btn-sm shrink-0 ${me.showEmail ? "btn-primary" : "btn-secondary"}`}
              pendingLabel="…"
              aria-pressed={me.showEmail}
              aria-label={t("Show my email to the members of this hub")}
            >
              {me.showEmail ? <Eye size={14} strokeWidth={2} aria-hidden /> : <EyeOff size={14} strokeWidth={2} aria-hidden />}
              {me.showEmail ? t("On") : t("Off")}
            </SubmitButton>
          </form>
          {!user.name && (
            <p className="field-hint mt-0">
              {t("You have no name on file, so the others see you as “Member”. Add one under Your account.")}
            </p>
          )}
        </FormSection>
      )}

      {isOwner && (
        <FormSection title={t("Invite")}>
          {knownPeople.length > 0 && (
            <form action={addKnownMember.bind(null, hubId)} className="form-stack border-b border-[var(--color-border)] pb-4">
              <label className="field-label">
                {t("Invite someone already on Life Hub")}
                <select name="userId" required className="field" defaultValue="">
                  <option value="" disabled>
                    {t("Pick a person…")}
                  </option>
                  {knownPeople.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
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

          <ActionForm action={inviteByUsername.bind(null, hubId)} className="form-stack border-b border-[var(--color-border)] pb-4">
            <label className="field-label">
              {t("Invite by username")}
              <div className="flex gap-2">
                <input
                  name="username"
                  required
                  autoComplete="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="@marie"
                  className="field min-w-0 flex-1"
                />
                <SubmitButton className="btn btn-secondary shrink-0" pendingLabel="…">
                  <AtSign size={16} strokeWidth={2} aria-hidden />
                  {t("Invite")}
                </SubmitButton>
              </div>
              <span className="field-hint">{t("For someone already on Life Hub — no email address needed.")}</span>
            </label>
          </ActionForm>

          <ActionForm action={inviteMember.bind(null, hubId)} className="form-stack">
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
                {t("Someone new gets an invitation to create their account first; joining stays their choice.")}
              </span>
            </label>
            <SubmitButton className="btn btn-primary w-full" pendingLabel="…">
              <Send size={16} strokeWidth={2} aria-hidden />
              {t("Send invite")}
            </SubmitButton>
          </ActionForm>
        </FormSection>
      )}

      {isOwner && (
        <FormSection title={t("Code to ask to join")}>
          <p className="field-hint mt-0">
            {t("Share a code or a link: people who have it can ask to join, and you let them in or not. Nobody can find this hub without it.")}
          </p>
          {hub.joinCode ? (
            <>
              <CopyField value={formatJoinCode(hub.joinCode)} label={t("Hub code")} mono />
              <CopyField value={`${appUrl()}/hubs/join/${hub.joinCode}`} label={t("Link to ask to join")} />
              <div className="flex gap-2">
                <form action={setJoinCode.bind(null, hubId, true)} className="flex-1">
                  <SubmitButton className="btn btn-ghost btn-sm w-full" pendingLabel="…">
                    {t("New code")}
                  </SubmitButton>
                </form>
                <form action={setJoinCode.bind(null, hubId, false)} className="flex-1">
                  <SubmitButton className="btn btn-ghost btn-sm w-full" pendingLabel="…">
                    {t("Turn off")}
                  </SubmitButton>
                </form>
              </div>
              <p className="field-hint mt-0">{t("A new code stops the old one from working.")}</p>
            </>
          ) : (
            <form action={setJoinCode.bind(null, hubId, true)}>
              <SubmitButton className="btn btn-secondary w-full" pendingLabel="…">
                {t("Create a code")}
              </SubmitButton>
            </form>
          )}
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

      {(!isOwner || ownerCount > 1) && (
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
