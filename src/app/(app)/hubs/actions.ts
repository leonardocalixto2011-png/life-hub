"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { blobUrlSchema } from "@/lib/blob-url";
import { deleteBlobIfUnreferenced } from "@/lib/blob-delete";
import { rateLimit } from "@/lib/rate-limit";
import { isCurrency } from "@/lib/locales";
import { revalidateContent } from "@/lib/revalidate";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { CURRENT_HUB_COOKIE, listMyHubs, requireHub, requireUser } from "@/lib/session";
import { sendEmail } from "@/lib/email";
import { sendPushToUser } from "@/lib/push";

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

  const hub = await prisma.$transaction(async (tx) => {
    const hub = await tx.hub.create({ data: { name, createdById: user.id } });
    await tx.hubMembership.create({
      data: { hubId: hub.id, userId: user.id, role: "OWNER", status: "ACTIVE", joinedAt: new Date() },
    });
    return hub;
  });

  const store = await cookies();
  store.set(CURRENT_HUB_COOKIE, hub.id, { httpOnly: true, sameSite: "lax", maxAge: 60 * 60 * 24 * 365 });
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

/**
 * Owner-only. Invite creation writes a HubMembership row for someone else, so
 * it runs on the owner-role client — RLS's self-only HubMembership policy
 * would reject it under app_user regardless of who's asking (documented gap,
 * enforced by the OWNER-role check below instead of the database).
 */
export async function inviteMember(hubId: string, formData: FormData) {
  const user = await requireUser();
  const email = emailSchema.parse(formData.get("email"));

  await requireHubOwner(hubId, user.id, "invite people");

  // Every invite sends an email from our domain to an address the inviter
  // chose — without a cap, an owner account is a free spam relay.
  if (!(await rateLimit(`invite:${user.id}`, 20, 3600)).ok) {
    throw new Error("You've sent a lot of invites this hour. Try again later.");
  }

  const hub = await prisma.hub.findUniqueOrThrow({ where: { id: hubId } });

  const invited = await prisma.$transaction(async (tx) => {
    const target = await tx.user.upsert({
      where: { email },
      update: {},
      create: { email, role: "MEMBER" },
    });

    const existing = await tx.hubMembership.findUnique({
      where: { hubId_userId: { hubId, userId: target.id } },
    });
    if (existing) return { target, already: true };

    await tx.hubMembership.create({
      data: { hubId, userId: target.id, role: "MEMBER", status: "INVITED" },
    });
    return { target, already: false };
  });

  if (!invited.already) {
    // Someone already using the app gets a push too — the email alone was
    // easy to miss, and the invite then sat unanswered.
    try {
      await sendPushToUser(invited.target.id, {
        title: `Invited to "${hub.name}"`,
        body: `${user.name ?? user.email} invited you. Tap to join.`,
        url: "/hubs/invites",
        tag: `hub-invite-${hubId}`,
      });
    } catch {
      // No devices yet is the normal case for a brand-new address.
    }
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    // Hub and display names are free text chosen by the inviter; unescaped they
    // could inject markup/links into an email that arrives from our domain.
    const hubNameHtml = escapeHtml(hub.name);
    const inviterHtml = escapeHtml(user.name ?? user.email ?? "");
    await sendEmail({
      to: email,
      subject: `You're invited to "${hub.name}" on Life Hub`,
      text: `${user.name ?? user.email} invited you to join "${hub.name}" on Life Hub. Sign in at ${appUrl}/login with this email address, then open ${appUrl}/hubs/invites to accept.`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h1 style="font-size:18px;margin:0 0 12px">You're invited to "${hubNameHtml}"</h1>
          <p style="color:#444;font-size:14px;line-height:1.5;margin:0 0 20px">
            ${inviterHtml} invited you to join their Life Hub. Sign in with this email address, then accept the invite.
          </p>
          <p style="margin:0 0 12px">
            <a href="${appUrl}/login" style="display:inline-block;background:#4f46e5;color:#fff;text-decoration:none;padding:12px 20px;border-radius:8px;font-size:14px;font-weight:600">
              Sign in
            </a>
          </p>
        </div>
      `,
    });
  }

  revalidatePath(`/hubs/${hubId}/members`);
}

/** Self-scoped — RLS allows this straight through app_user. */
export async function acceptInvite(hubId: string) {
  const user = await requireUser();
  await withHub(user.id, (tx) =>
    tx.hubMembership.update({
      where: { hubId_userId: { hubId, userId: user.id } },
      data: { status: "ACTIVE", joinedAt: new Date() },
    }),
  );
  revalidatePath("/hubs/invites");
  redirect("/today");
}

/** Self-scoped — RLS allows this straight through app_user. */
export async function declineInvite(hubId: string) {
  const user = await requireUser();
  await withHub(user.id, (tx) =>
    tx.hubMembership.delete({ where: { hubId_userId: { hubId, userId: user.id } } }),
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
    // Favourites are always personal — nobody left in the hub could ever see them.
    await tx.quickFavorite.deleteMany({ where: { hubId, createdById: subjectUserId } });
    await tx.tripItem.updateMany({
      where: { hubId, assignedToId: subjectUserId },
      data: { assignedToId: null },
    });
  });
}

/** Self-removal. The membership delete is self-scoped, so it goes through app_user/RLS. */
export async function leaveHub(hubId: string) {
  const user = await requireUser();
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

  const hub = await prisma.hub.findUniqueOrThrow({ where: { id: hubId }, select: { name: true } });
  const existing = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId: targetId } },
    select: { status: true },
  });
  if (existing?.status === "ACTIVE") return;
  if (!existing) {
    await prisma.hubMembership.create({
      data: { hubId, userId: targetId, role: "MEMBER", status: "INVITED" },
    });
  }

  // Sent again for a stalled invite too — that's the point of picking them.
  try {
    await sendPushToUser(targetId, {
      title: `Invited to "${hub.name}"`,
      body: `${user.name ?? user.email} invited you. Tap to join.`,
      url: "/hubs/invites",
      tag: `hub-invite-${hubId}`,
    });
  } catch {
    // A missing push setup must not undo the invite that was just created.
  }

  revalidatePath(`/hubs/${hubId}/members`);
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

/** Anything a person typed (hub name, display name) before it goes into email HTML. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
