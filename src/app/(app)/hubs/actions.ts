"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { CURRENT_HUB_COOKIE, listMyHubs, requireHub, requireUser } from "@/lib/session";
import { sendEmail } from "@/lib/email";

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
 * Owner-only. Invite creation writes a HubMembership row for someone else, so
 * it runs on the owner-role client — RLS's self-only HubMembership policy
 * would reject it under app_user regardless of who's asking (documented gap,
 * enforced by the OWNER-role check below instead of the database).
 */
export async function inviteMember(hubId: string, formData: FormData) {
  const user = await requireUser();
  const email = emailSchema.parse(formData.get("email"));

  const membership = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId: user.id } },
  });
  if (!membership || membership.role !== "OWNER") {
    throw new Error("Only the hub owner can invite people.");
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
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
    await sendEmail({
      to: email,
      subject: `You're invited to "${hub.name}" on Life Hub`,
      text: `${user.name ?? user.email} invited you to join "${hub.name}" on Life Hub. Sign in at ${appUrl}/login with this email address, then open ${appUrl}/hubs/invites to accept.`,
      html: `
        <div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">
          <h1 style="font-size:18px;margin:0 0 12px">You're invited to "${hub.name}"</h1>
          <p style="color:#444;font-size:14px;line-height:1.5;margin:0 0 20px">
            ${user.name ?? user.email} invited you to join their Life Hub. Sign in with this email address, then accept the invite.
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
 * createdById is a historical record, not a live permission. Runs while the
 * subject is still an active member so RLS still recognizes the hub as
 * theirs; `actorId` just needs to be *some* active member of the same hub
 * (Task/Deadline/Event RLS only checks hub membership, not whose row it is).
 */
async function cleanupDepartingMember(actorId: string, hubId: string, subjectUserId: string) {
  await withHub(actorId, async (tx) => {
    await tx.task.updateMany({
      where: { hubId, assignedToId: subjectUserId },
      data: { assignedToId: null },
    });
    await tx.deadline.deleteMany({ where: { hubId, createdById: subjectUserId, visibility: "PRIVATE" } });
    await tx.task.deleteMany({ where: { hubId, createdById: subjectUserId, visibility: "PRIVATE" } });
    await tx.event.deleteMany({ where: { hubId, createdById: subjectUserId, visibility: "PRIVATE" } });
  });
}

/** Self-removal. Fully self-scoped, so it runs entirely through app_user/RLS. */
export async function leaveHub(hubId: string) {
  const user = await requireUser();
  await cleanupDepartingMember(user.id, hubId, user.id);
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
  const membership = await prisma.hubMembership.findUnique({
    where: { hubId_userId: { hubId, userId: user.id } },
  });
  if (!membership || membership.role !== "OWNER") {
    throw new Error("Only the hub owner can remove members.");
  }
  if (targetUserId === user.id) {
    throw new Error("Use \"Leave hub\" to remove yourself.");
  }

  await cleanupDepartingMember(user.id, hubId, targetUserId);
  await prisma.hubMembership.delete({ where: { hubId_userId: { hubId, userId: targetUserId } } });

  revalidatePath(`/hubs/${hubId}/members`);
}
