"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { blobUrlSchema } from "@/lib/blob-url";
import { deleteBlobIfUnreferenced } from "@/lib/blob-delete";
import { hashedKey, rateLimit } from "@/lib/rate-limit";
import { isCurrency } from "@/lib/locales";
import { revalidateContent } from "@/lib/revalidate";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { CURRENT_HUB_COOKIE, listMyHubs, requireHub, requireUser } from "@/lib/session";
import { sendPushToUser } from "@/lib/push";
import { acceptInviteFor, createHubFor, setCurrentHub } from "@/lib/hub-setup";
import { formResult, type ActionResult } from "@/lib/action-result";
import { INVITE_TTL_DAYS, InviteLimitError, createAppInvite, inviteUrl } from "@/lib/app-invites";
import { sendAppInviteEmail, sendHubInviteEmail } from "@/lib/account-emails";
import { newJoinCode } from "@/lib/join-codes";
import { normalizeUsername } from "@/lib/username";
import { langOf, translate } from "@/lib/i18n";
import { logActivity } from "@/lib/activity";
import { assertMemberRoom } from "@/lib/billing/plan";

/**
 * Hub creation itself runs on the owner-role client (bypasses RLS), same as
 * every other hub-membership write for someone other than "self" — see the
 * comment atop prisma/migrations/*_multihub_rls/migration.sql. There's no
 * chicken-and-egg way to satisfy a hub-membership RLS check before the first
 * membership row exists.
 */
export async function createHub(formData: FormData) {
  const user = await requireUser();
  const name = z.string().trim().min(1, "Name is required").max(80).parse(formData.get("name"));

  const hub = await createHubFor(user.id, name);
  await setCurrentHub(hub.id);
  redirect("/today");
}

export async function switchHub(hubId: string) {
  const user = await requireUser();
  const hubs = await listMyHubs(user.id);
  if (!hubs.some((h) => h.id === hubId)) {
    throw new Error("Not a member of that hub.");
  }
  const store = await cookies();
  store.set(CURRENT_HUB_COOKIE, hubId, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
  redirect("/today");
}

const emailSchema = z.string().trim().toLowerCase().email();

/**
 * How the inviter is named in an invite push or email. Their name — never
 * their address: an invite is sent to someone who is not in the hub yet.
 */
function inviterName(user: { name: string | null }): string {
  return user.name?.trim() || "Someone";
}

/**
 * Throws unless `userId` is an **active** owner of `hubId`.
 *
 * A single helper rather than the check written out at each call site: the
 * three owner-gated actions had drifted apart, two testing only `role` while
 * `setHubCurrency` also tested `status`. An INVITED row exists from the moment
 * someone is invited, so "has a membership row" is not "is in this hub" — and
 * these actions run on the owner-role client, where RLS will not catch a
 * mistake. Every owner-only action must go through here.
 */
async function requireHubOwner(hubId: string, userId: string, action: string) {
  const membership = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId } },
    select: { role: true, status: true },
  });
  if (!membership || membership.role !== "OWNER" || membership.status !== "ACTIVE") {
    throw new Error(`Only the hub owner can ${action}.`);
  }
}

/** Push in the recipient's own language — they may not share the sender's. */
async function pushTo(
  userId: string,
  msg: { title: string; body: string; vars: Record<string, string>; url: string; tag: string },
) {
  try {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { locale: true } });
    const lang = langOf(target?.locale);
    await sendPushToUser(userId, {
      title: translate(lang, msg.title, msg.vars),
      body: translate(lang, msg.body, msg.vars),
      url: msg.url,
      tag: msg.tag,
    });
  } catch {
    // No devices is the normal case for someone new; a push is a nudge, never
    // the thing that makes an invite or an approval real.
  }
}

/**
 * Turns a REQUESTED membership into an ACTIVE one. Owner-checked by every
 * caller. Trusted client: the row is someone else's, which the self-only
 * HubMembership policy would refuse — same as inviting. The feed line is
 * written as the person who joined, like accepting an invite.
 */
async function approveRequestRow(hubId: string, targetId: string): Promise<boolean> {
  const approved = await prisma.$transaction(async (tx) => {
    const { count } = await tx.hubMembership.updateMany({
      where: { hubId, userId: targetId, status: "REQUESTED" },
      data: { status: "ACTIVE", joinedAt: new Date(), requestNote: null },
    });
    if (count === 0) return false;
    await logActivity(tx, {
      hubId,
      actorId: targetId,
      verb: "MEMBER_JOINED",
      entityType: "member",
      entityId: targetId,
      summary: "",
    });
    return true;
  });
  if (approved) {
    const hub = await prisma.hub.findUnique({ where: { id: hubId }, select: { name: true } });
    await pushTo(targetId, {
      title: "You're in \"{hub}\"",
      body: "Your request was approved. Tap to open it.",
      vars: { hub: hub?.name ?? "" },
      url: "/today",
      tag: `hub-request-${hubId}`,
    });
  }
  return approved;
}

type Placed = "invited" | "reinvited" | "active" | "approved";

/**
 * Invites an existing account into a hub, whichever way the owner picked them
 * (email, username, someone they know). Someone already in stays as they are;
 * someone who had ASKED to join is simply let in — both sides now want it.
 * An unanswered invite is refreshed, not duplicated.
 */
async function placeInvite(hubId: string, targetId: string, inviter: { id: string; name: string | null }): Promise<Placed> {
  const existing = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId: targetId } },
    select: { status: true },
  });
  if (existing?.status === "ACTIVE") return "active";
  if (existing?.status === "REQUESTED") {
    await assertMemberRoom(hubId);
    await approveRequestRow(hubId, targetId);
    return "approved";
  }
  if (existing?.status === "INVITED") {
    await prisma.hubMembership.update({
      where: { hubId_userId: { hubId, userId: targetId } },
      data: { invitedById: inviter.id },
    });
  } else {
    await assertMemberRoom(hubId);
    await prisma.hubMembership.create({
      data: { hubId, userId: targetId, role: "MEMBER", status: "INVITED", invitedById: inviter.id },
    });
  }

  // Re-inviting re-sends the push, which is the point of re-inviting — but a
  // few a day at most, so an owner can't buzz someone's phone on repeat.
  if ((await rateLimit(`hub-invite-push:${hubId}:${targetId}`, 3, 86400)).ok) {
    const hub = await prisma.hub.findUnique({ where: { id: hubId }, select: { name: true } });
    await pushTo(targetId, {
      title: "Invited to \"{hub}\"",
      body: "{name} invited you. Tap to answer.",
      vars: { hub: hub?.name ?? "", name: inviterName(inviter) },
      url: "/hubs/invites",
      tag: `hub-invite-${hubId}`,
    });
  }
  return existing ? "reinvited" : "invited";
}

const PLACED_NOTICE: Record<Placed, string> = {
  invited: "Invitation sent to {who}.",
  reinvited: "Invitation sent to {who} again.",
  active: "{who} is already in this hub.",
  approved: "{who} had asked to join — they're in now.",
};

/** The three invite paths each cap themselves; these are the shared caps. */
async function inviteLimitsOk(userId: string): Promise<boolean> {
  return (
    (await rateLimit(`invite:${userId}`, 20, 3600)).ok &&
    (await rateLimit(`invite-day:${userId}`, 50, 86400)).ok
  );
}

/**
 * Owner-only. Invites by email address.
 *
 * An address with an account gets an INVITED membership, as before. An
 * address with NO account no longer gets a User row made for it on the spot
 * (an account the person never agreed to, which never expired): it gets an
 * app invitation carrying this hub (lib/app-invites.ts). Their account exists
 * only once they open the link and sign in, and the hub invitation then
 * waits for their yes like any other.
 */
export async function inviteMember(hubId: string, formData: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    const parsed = emailSchema.safeParse(formData.get("email"));
    if (!parsed.success) throw new Error("Enter a valid email address.");
    const email = parsed.data;

    await requireHubOwner(hubId, user.id, "invite people");

    // Every invite can send an email from our domain to an address the
    // inviter chose — without a cap, an owner account is a free spam relay.
    // Per inviter, plus per recipient across all inviters, so one address
    // can't be flooded by several accounts taking turns.
    if (!(await inviteLimitsOk(user.id)) || !(await rateLimit(`invite-to:${hashedKey(email)}`, 5, 86400)).ok) {
      throw new Error("You've sent a lot of invites this hour. Try again later.");
    }

    const [hub, target] = await Promise.all([
      prisma.hub.findUniqueOrThrow({ where: { id: hubId }, select: { name: true } }),
      prisma.user.findUnique({ where: { email }, select: { id: true } }),
    ]);

    if (!target) {
      let token: string;
      try {
        ({ token } = await createAppInvite({ createdById: user.id, role: user.role, email, hubId }));
      } catch (e) {
        if (e instanceof InviteLimitError) throw new Error(e.message);
        throw e;
      }
      await sendAppInviteEmail({
        to: email,
        inviter: inviterName(user),
        url: inviteUrl(token),
        hubName: hub.name,
        days: INVITE_TTL_DAYS,
      });
      revalidatePath(`/hubs/${hubId}/members`);
      return { notice: "Invitation sent to {who}.", noticeVars: { who: email } };
    }

    if (target.id === user.id) throw new Error("That's you.");
    const placed = await placeInvite(hubId, target.id, user);
    if (placed === "invited") {
      await sendHubInviteEmail({
        to: email,
        inviter: inviterName(user),
        hubName: hub.name,
        url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/hubs/invites`,
      });
    }
    revalidatePath(`/hubs/${hubId}/members`);
    return { notice: PLACED_NOTICE[placed], noticeVars: { who: email } };
  });
}

/**
 * Owner-only. Invites someone by their @username — no address needed. The
 * answer says whether the username exists: a handle is something people
 * choose to give out, so confirming one is not leaking anything private, and
 * the lookups are rate-limited so it can't be used to walk the user list.
 */
export async function inviteByUsername(hubId: string, formData: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    z.string().cuid().parse(hubId);
    const username = normalizeUsername(String(formData.get("username") ?? ""));
    if (!username) throw new Error("Type a username.");

    await requireHubOwner(hubId, user.id, "invite people");
    if (!(await inviteLimitsOk(user.id)) || !(await rateLimit(`invite-username:${user.id}`, 30, 3600)).ok) {
      throw new Error("You've sent a lot of invites this hour. Try again later.");
    }

    const target = await prisma.user.findUnique({ where: { username }, select: { id: true } });
    if (!target) throw new Error("Nobody has that username. Check the spelling.");
    if (target.id === user.id) throw new Error("That's you.");

    const placed = await placeInvite(hubId, target.id, user);
    revalidatePath(`/hubs/${hubId}/members`);
    return { notice: PLACED_NOTICE[placed], noticeVars: { who: `@${username}` } };
  });
}

/** Owner-only: withdraws an invitation sent to an address with no account yet. */
export async function revokeHubAppInvite(hubId: string, inviteId: string) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  z.string().cuid().parse(inviteId);
  await requireHubOwner(hubId, user.id, "cancel invitations");
  await prisma.appInvite.updateMany({
    where: { id: inviteId, hubId, usedAt: null, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  revalidatePath(`/hubs/${hubId}/members`);
}

/** Self-scoped — RLS allows this straight through app_user. */
export async function acceptInvite(hubId: string) {
  const user = await requireUser();
  await acceptInviteFor(user.id, hubId);
  await setCurrentHub(hubId);
  revalidatePath("/hubs/invites");
  redirect("/today");
}

/**
 * Self-scoped — RLS allows this straight through app_user. Only ever an
 * INVITED row: this used to delete whatever membership the person had in
 * that hub, so a crafted call could drop an ACTIVE membership without the
 * departure cleanup, or leave a hub without an owner.
 */
export async function declineInvite(hubId: string) {
  const user = await requireUser();
  await withHub(user.id, (tx) =>
    tx.hubMembership.deleteMany({ where: { hubId, userId: user.id, status: "INVITED" } }),
  );
  revalidatePath("/hubs/invites");
}

/**
 * Cleans up a departing member's footprint in one hub before the membership
 * row itself is removed: unassign (don't delete) items assigned to them,
 * delete their PRIVATE items in that hub. Shared items they created stay —
 * createdById is a historical record, not a live permission.
 *
 * Trusted client, not `withHub`: the RLS privacy clause hides another
 * person's PRIVATE rows from the actor, so when an owner removed someone the
 * deletes below matched nothing in production and silently left the departed
 * member's private items behind. Authorization is the callers' job (leaveHub
 * is self, removeMember is owner-checked), and every statement here is pinned
 * to this hub *and* this subject, so the bypass can't reach anything else.
 */
async function cleanupDepartingMember(hubId: string, subjectUserId: string) {
  await prisma.$transaction(async (tx) => {
    await tx.task.updateMany({
      where: { hubId, assignedToId: subjectUserId },
      data: { assignedToId: null },
    });
    await tx.deadline.deleteMany({ where: { hubId, createdById: subjectUserId, visibility: "PRIVATE" } });
    await tx.task.deleteMany({ where: { hubId, createdById: subjectUserId, visibility: "PRIVATE" } });
    await tx.event.deleteMany({ where: { hubId, createdById: subjectUserId, visibility: "PRIVATE" } });
    await tx.specialDate.deleteMany({ where: { hubId, createdById: subjectUserId, visibility: "PRIVATE" } });
    await tx.trip.deleteMany({ where: { hubId, createdById: subjectUserId, visibility: "PRIVATE" } });
    // The feed lines about those private items were only ever theirs to see.
    await tx.activity.deleteMany({ where: { hubId, actorId: subjectUserId, visibility: "PRIVATE" } });
    // Favourites are always personal — nobody left in the hub could ever see them.
    await tx.quickFavorite.deleteMany({ where: { hubId, createdById: subjectUserId } });
    // Leaving ends what they agreed to show or send for this hub: the debt
    // share goes, and both hub-scoped consents are closed in the ledger
    // (revoked, not deleted). Closing MAIL_AI also stops a mailbox they left
    // connected here from being analysed into a hub they are no longer in.
    await tx.debtShare.deleteMany({ where: { hubId, ownerId: subjectUserId } });
    await tx.consent.updateMany({
      where: { userId: subjectUserId, hubId, kind: { in: ["DEBT_SHARE", "MAIL_AI"] }, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await tx.tripItem.updateMany({
      where: { hubId, assignedToId: subjectUserId },
      data: { assignedToId: null },
    });
  });
}

/** Self-removal. The membership delete is self-scoped, so it goes through app_user/RLS. */
export async function leaveHub(hubId: string) {
  const user = await requireUser();
  const me = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId: user.id } },
    select: { role: true, status: true },
  });
  if (!me || me.status !== "ACTIVE") throw new Error("Not a member of that hub.");
  // A hub must keep an owner: nobody else can invite, approve or change its
  // settings. An owner leaves only once someone else is one too.
  if (me.role === "OWNER") {
    const otherOwners = await prisma.hubMembership.count({
      where: { hubId, role: "OWNER", status: "ACTIVE", userId: { not: user.id } },
    });
    if (otherOwners === 0) throw new Error("Make someone else an owner before you leave.");
  }
  await cleanupDepartingMember(hubId, user.id);
  await withHub(user.id, (tx) =>
    tx.hubMembership.delete({ where: { hubId_userId: { hubId, userId: user.id } } }),
  );
  revalidatePath("/today");
  redirect("/today");
}

/**
 * Owner-only removal of someone else. The membership delete itself must use
 * the owner-role client (RLS's HubMembership policy is self-only), same
 * reasoning as inviteMember.
 */
export async function removeMember(hubId: string, targetUserId: string) {
  const { user } = await requireHub();
  await requireHubOwner(hubId, user.id, "remove members");
  if (targetUserId === user.id) {
    throw new Error("Use \"Leave hub\" to remove yourself.");
  }
  // Co-owners can't remove each other: either could otherwise lock the other
  // out of a hub they both run. An owner who wants out leaves.
  const target = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId: targetUserId } },
    select: { role: true },
  });
  if (!target) return;
  if (target.role === "OWNER") throw new Error("An owner can't be removed. They can leave on their own.");

  await cleanupDepartingMember(hubId, targetUserId);
  await prisma.hubMembership.delete({ where: { hubId_userId: { hubId, userId: targetUserId } } });

  revalidatePath(`/hubs/${hubId}/members`);
}

/**
 * One currency per hub — every total on /budget, /subscriptions and /debts is
 * a sum across rows, which only means anything in a single currency. Owners
 * only: changing it re-labels money everyone in the hub can see.
 */
export async function setHubCurrency(hubId: string, currency: string) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  if (!isCurrency(currency)) throw new Error("Unsupported currency.");

  await requireHubOwner(hubId, user.id, "change its currency");

  await prisma.hub.update({ where: { id: hubId }, data: { currency } });
  revalidateContent(`/hubs/${hubId}/members`);
}

/**
 * The hub's shared cover photo — everyone in the hub sees the same one.
 *
 * Owner-only, because this is the one image in the app a person picks *for
 * other people*: it appears on the invite before anyone has agreed to
 * anything, and on the members page thereafter. `User.backgroundImageUrl`
 * stays exactly as it was — personal, private, unaffected.
 */
export async function setHubCover(hubId: string, url: string) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  const parsedUrl = blobUrlSchema.parse(url);

  await requireHubOwner(hubId, user.id, "change the cover photo");

  await replaceCover(hubId, parsedUrl, user.id);
  revalidateContent(`/hubs/${hubId}/members`, "/hubs/invites");
}

export async function removeHubCover(hubId: string) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);

  await requireHubOwner(hubId, user.id, "change the cover photo");

  await replaceCover(hubId, null, null);
  revalidateContent(`/hubs/${hubId}/members`, "/hubs/invites");
}

/**
 * Owner-only. Adds someone the owner **already shares another hub with**,
 * picked by name — no email round-trip. Inviting by email is how a person
 * first arrives in the app, and it can only happen from inside some hub, so
 * everyone landed in Main Hub and there was no way to then bring them into a
 * second one without a fresh email invite.
 *
 * Creates an INVITED membership, like an email invite: being in one hub with
 * someone is not consent to be placed in another, so they accept (or decline)
 * from /hubs/invites. Someone already ACTIVE here is left as is. The "already
 * share a hub" check is still the privacy boundary for who can be invited
 * without an email — without it, any user id copied from anywhere would be a
 * way to put a stranger's name on this hub's roster.
 */
export async function addKnownMember(hubId: string, formData: FormData) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  const targetId = z.string().cuid("Pick someone to add").parse(formData.get("userId"));

  await requireHubOwner(hubId, user.id, "add people");

  // An app ADMIN admitted every account into this invite-only app, so they may
  // place anyone; everyone else is limited to people they already share a hub
  // with. Both are the entire privacy boundary here — keep them server-side.
  const known =
    user.role === "ADMIN"
      ? await prisma.user.findUnique({ where: { id: targetId }, select: { id: true } })
      : await prisma.hubMembership.findFirst({
          where: {
            userId: targetId,
            status: "ACTIVE",
            hub: { memberships: { some: { userId: user.id, status: "ACTIVE" } } },
          },
          select: { id: true },
        });
  if (!known) throw new Error("You can only add people you already share a hub with.");

  await placeInvite(hubId, targetId, user);
  revalidatePath(`/hubs/${hubId}/members`);
}

/**
 * A member's own choice, per hub: let the other members of THIS hub see their
 * email address. Off by default. Self-row write, so it runs through withHub
 * under the self-only HubMembership policy; the `userId` pin is the app-level
 * mirror of that policy.
 */
export async function setShowEmail(hubId: string, show: boolean) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  await withHub(user.id, async (tx) => {
    const { count } = await tx.hubMembership.updateMany({
      where: { hubId, userId: user.id, status: "ACTIVE" },
      data: { showEmail: Boolean(show) },
    });
    if (count === 0) throw new Error("Not a member of that hub.");
  });
  // Every page with a people picker renders the roster.
  revalidatePath("/", "layout");
}

/** Owner-only: holidays and special days on this hub's calendar, on or off. */
export async function setShowOccasions(hubId: string, show: boolean) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  await requireHubOwner(hubId, user.id, "change the calendar settings");
  await prisma.hub.update({ where: { id: hubId }, data: { showOccasions: Boolean(show) } });
  revalidateContent(`/hubs/${hubId}/members`, "/calendar/dates");
}

/**
 * One cover blob per hub, so changing the photo doesn't orphan the old file.
 * Row first, then the old URL is deleted only if nothing else references it —
 * the stored URL came from the client and may be someone's background photo.
 */
async function replaceCover(hubId: string, next: string | null, coverById: string | null) {
  const existing = await prisma.hub.findUnique({
    where: { id: hubId },
    select: { coverImageUrl: true },
  });
  await prisma.hub.update({ where: { id: hubId }, data: { coverImageUrl: next, coverById } });
  if (existing?.coverImageUrl && existing.coverImageUrl !== next) {
    await deleteBlobIfUnreferenced(existing.coverImageUrl);
  }
}

/**
 * Owner-only. Makes an active member a co-owner — the way an owner can hand
 * a hub over, or share running it, and then leave if they want to.
 */
export async function makeOwner(hubId: string, targetUserId: string) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  await requireHubOwner(hubId, user.id, "change roles");
  const { count } = await prisma.hubMembership.updateMany({
    where: { hubId, userId: targetUserId, status: "ACTIVE", role: "MEMBER" },
    data: { role: "OWNER" },
  });
  if (count === 0) throw new Error("That person isn't a member of this hub.");
  revalidatePath(`/hubs/${hubId}/members`);
}

/** Owner-only: lets in someone who asked to join. */
export async function approveJoinRequest(hubId: string, targetUserId: string) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  await requireHubOwner(hubId, user.id, "approve requests");
  await assertMemberRoom(hubId);
  await approveRequestRow(hubId, targetUserId);
  revalidatePath(`/hubs/${hubId}/members`);
}

/**
 * Owner-only: turns a request down. Quietly — the request just disappears
 * from the person's list; no notification saying no.
 */
export async function declineJoinRequest(hubId: string, targetUserId: string) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  await requireHubOwner(hubId, user.id, "decline requests");
  await prisma.hubMembership.deleteMany({ where: { hubId, userId: targetUserId, status: "REQUESTED" } });
  revalidatePath(`/hubs/${hubId}/members`);
}

/**
 * Owner-only. Turns "ask to join" on with a fresh code, or off. A new code
 * replaces the old one at once, so a code that travelled too far stops
 * working. Requests already sent are kept either way: the owner still
 * decides each one.
 */
export async function setJoinCode(hubId: string, on: boolean) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  await requireHubOwner(hubId, user.id, "change the join code");
  if (!on) {
    await prisma.hub.update({ where: { id: hubId }, data: { joinCode: null } });
  } else {
    // A collision on the unique index is astronomically unlikely; retry anyway.
    for (let i = 0; ; i++) {
      try {
        await prisma.hub.update({ where: { id: hubId }, data: { joinCode: newJoinCode() } });
        break;
      } catch (e) {
        if (i >= 2) throw e;
      }
    }
  }
  revalidatePath(`/hubs/${hubId}/members`);
}
