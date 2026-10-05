"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { requireUser } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { normalizeJoinCode } from "@/lib/join-codes";
import { acceptInviteFor, setCurrentHub } from "@/lib/hub-setup";
import { sendPushToUser } from "@/lib/push";
import { langOf, translate } from "@/lib/i18n";
import { formResult, type ActionResult } from "@/lib/action-result";

/**
 * The asking side of "join a hub": someone with a hub's code files a request,
 * an owner approves or declines it on the members page
 * ((app)/hubs/actions.ts). Lives outside the (app) group, like /hubs/invites,
 * because a person with no hub at all must be able to use it.
 */

/** From the "Have a code?" box: tidy what was typed and open its page. */
export async function goToJoinCode(formData: FormData): Promise<ActionResult> {
  return formResult(async () => {
    await requireUser();
    const code = normalizeJoinCode(String(formData.get("code") ?? ""));
    if (!code) throw new Error("A hub code has 8 letters and digits, like ABCD-2345.");
    redirect(`/hubs/join/${code}`);
  });
}

const noteSchema = z.string().trim().max(140);

/**
 * Files a request to join the hub with this code. If the person was already
 * invited there, asking is a yes: they're let in on the spot, since both
 * sides want it.
 */
export async function requestToJoin(code: string, formData: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    const normalized = normalizeJoinCode(code);
    if (!normalized) throw new Error("That code doesn't work any more. Ask for a new one.");
    if (!(await rateLimit(`join-request:${user.id}`, 10, 86400)).ok) {
      throw new Error("You've sent a lot of requests today. Try again tomorrow.");
    }
    const note = noteSchema.safeParse(formData.get("note") ?? "");
    if (!note.success) throw new Error("Keep the message under 140 characters.");
    // A note is read by the owner; an address in it would undo hiding emails.
    if (note.data.includes("@")) throw new Error("Leave your email address out of the message.");

    const hub = await prisma.hub.findUnique({
      where: { joinCode: normalized },
      select: { id: true, name: true },
    });
    if (!hub) throw new Error("That code doesn't work any more. Ask for a new one.");

    const existing = await prisma.hubMembership.findUnique({
      where: { hubId_userId: { hubId: hub.id, userId: user.id } },
      select: { status: true },
    });
    if (existing?.status === "ACTIVE") {
      await setCurrentHub(hub.id);
      redirect("/today");
    }
    if (existing?.status === "INVITED") {
      await acceptInviteFor(user.id, hub.id);
      await setCurrentHub(hub.id);
      revalidatePath("/", "layout");
      redirect("/today");
    }

    // The person's own row, so it goes through the app role and RLS like
    // any self-row write. Status is fixed here, never taken from the client.
    await withHub(user.id, (tx) =>
      tx.hubMembership.upsert({
        where: { hubId_userId: { hubId: hub.id, userId: user.id } },
        update: { requestNote: note.data || null },
        create: {
          hubId: hub.id,
          userId: user.id,
          role: "MEMBER",
          status: "REQUESTED",
          requestNote: note.data || null,
        },
      }),
    );

    if (!existing) await notifyOwners(hub, user);
    revalidatePath(`/hubs/join/${normalized}`);
    revalidatePath("/hubs/invites");
    return { notice: "Request sent. You'll get a notification when you're in." };
  });
}

async function notifyOwners(
  hub: { id: string; name: string },
  requester: { name: string | null; username: string | null },
) {
  const owners = await prisma.hubMembership.findMany({
    where: { hubId: hub.id, role: "OWNER", status: "ACTIVE" },
    select: { userId: true, user: { select: { locale: true } } },
  });
  const who = requester.name?.trim() || (requester.username ? `@${requester.username}` : null);
  for (const o of owners) {
    const lang = langOf(o.user.locale);
    try {
      await sendPushToUser(o.userId, {
        title: translate(lang, "Request to join \"{hub}\"", { hub: hub.name }),
        body: who
          ? translate(lang, "{name} is asking to join. Tap to answer.", { name: who })
          : translate(lang, "Someone is asking to join. Tap to answer."),
        url: `/hubs/${hub.id}/members`,
        tag: `hub-request-${hub.id}`,
      });
    } catch {
      // The request is on the members page either way.
    }
  }
}

/** Withdraws the person's own pending request. Only ever a REQUESTED row. */
export async function cancelJoinRequest(hubId: string) {
  const user = await requireUser();
  z.string().cuid().parse(hubId);
  await withHub(user.id, (tx) =>
    tx.hubMembership.deleteMany({ where: { hubId, userId: user.id, status: "REQUESTED" } }),
  );
  revalidatePath("/hubs/invites");
}
