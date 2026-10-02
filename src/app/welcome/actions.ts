"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser, listMyHubs } from "@/lib/session";
import { langOf } from "@/lib/i18n";
import {
  HubLimitError,
  acceptInviteFor,
  createHubFor,
  isHubColor,
  setCurrentHub,
} from "@/lib/hub-setup";
import { defaultHubName, firstNameOf, isInterest } from "@/lib/onboarding";
import { grantConsent, hasConsent } from "@/lib/consent";

/**
 * Server actions for the first-run welcome. Unlike their counterparts under
 * (app)/hubs these return instead of redirecting: the welcome stays on its
 * own page and moves to the next step, and the client calls router.refresh()
 * so the server half re-reads hubs and language.
 */

type Result = { ok: true } | { ok: false; error: string };

export async function setWelcomeLocale(locale: string): Promise<Result> {
  const user = await requireUser();
  const value = z.enum(["fr-CA", "en-CA"]).safeParse(locale);
  if (!value.success) return { ok: false, error: "Unknown language." };
  await prisma.user.update({ where: { id: user.id }, data: { locale: value.data } });
  revalidatePath("/", "layout");
  return { ok: true };
}

const hubInput = z.object({
  name: z.string().trim().min(1, "Name is required").max(80),
  color: z.string().refine(isHubColor, "Pick one of the colours."),
});

/** Creates the person's first hub, or renames/recolours one they own. */
export async function saveWelcomeHub(input: {
  hubId?: string | null;
  name: string;
  color: string;
}): Promise<Result> {
  const user = await requireUser();
  const parsed = hubInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid." };
  const { name, color } = parsed.data;

  if (input.hubId) {
    // Owner-only, checked on the trusted client: the membership row is the
    // authority, never the id the browser sent.
    const m = await prisma.hubMembership.findUnique({
      where: { hubId_userId: { hubId: input.hubId, userId: user.id } },
      select: { role: true, status: true },
    });
    if (m?.role !== "OWNER" || m.status !== "ACTIVE") {
      return { ok: false, error: "Only the hub's owner can rename it." };
    }
    await prisma.hub.update({ where: { id: input.hubId }, data: { name, color } });
    await setCurrentHub(input.hubId);
  } else {
    try {
      const hub = await createHubFor(user.id, name, color);
      await setCurrentHub(hub.id);
    } catch (e) {
      if (e instanceof HubLimitError) return { ok: false, error: e.message };
      throw e;
    }
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function acceptWelcomeInvite(hubId: string): Promise<Result> {
  const user = await requireUser();
  const id = z.string().min(1).max(64).parse(hubId);
  try {
    await acceptInviteFor(user.id, id);
  } catch {
    return { ok: false, error: "Could not join — try again." };
  }
  await setCurrentHub(id);
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function declineWelcomeInvite(hubId: string): Promise<Result> {
  const user = await requireUser();
  const id = z.string().min(1).max(64).parse(hubId);
  // Self-row delete on the trusted client, scoped to an INVITED row so this
  // can never be used to leave a hub you're active in (that's leaveHub).
  await prisma.hubMembership.deleteMany({ where: { hubId: id, userId: user.id, status: "INVITED" } });
  revalidatePath("/", "layout");
  return { ok: true };
}

/**
 * The age attestation (Law 25: a person under 14 cannot consent for
 * themselves). `attested` is the state of a checkbox that starts unchecked;
 * anything but `true` records nothing. Also saves the name other hub members
 * will see, since members no longer see each other's email address.
 */
export async function saveWelcomeAboutYou(input: { attested: boolean; name?: string }): Promise<Result> {
  const user = await requireUser();
  if (input?.attested !== true) {
    return { ok: false, error: "Confirm that you are 14 or older to continue." };
  }
  const name = z.string().trim().max(80).safeParse(input.name ?? "");
  if (!name.success || name.data.includes("@")) {
    return { ok: false, error: "A name can't contain @ — your email stays private." };
  }
  await grantConsent(user.id, "AGE_14");
  if (name.data && name.data !== user.name) {
    await prisma.user.update({ where: { id: user.id }, data: { name: name.data } });
  }
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function saveInterests(keys: string[]): Promise<Result> {
  const user = await requireUser();
  const list = z.array(z.string()).max(20).safeParse(keys);
  if (!list.success) return { ok: false, error: "Invalid." };
  const interests = [...new Set(list.data.filter(isInterest))];
  await prisma.user.update({ where: { id: user.id }, data: { interests } });
  return { ok: true };
}

/**
 * Finish (or skip) the welcome. Someone with no hub and no invite to answer
 * gets a hub with the suggested name rather than being dropped on a form —
 * skipping should still land on a working app.
 */
export async function finishWelcome(): Promise<void> {
  const user = await requireUser();

  // The welcome cannot be finished — or skipped — without the age attestation.
  // This is the server-side gate: `onboardedAt` is what lets someone into the
  // app (see the (app) layout), and it is only ever set below. People who
  // onboarded before the attestation existed were recorded as 14+ by the
  // migration, so a replay passes straight through.
  if (!(await hasConsent(user.id, "AGE_14"))) redirect("/welcome?age=1");

  const hubs = await listMyHubs(user.id);
  if (hubs.length === 0) {
    const invites = await prisma.hubMembership.count({ where: { userId: user.id, status: "INVITED" } });
    if (invites === 0) {
      try {
        const hub = await createHubFor(
          user.id,
          defaultHubName(firstNameOf(user.name, user.email), langOf(user.locale)),
        );
        await setCurrentHub(hub.id);
      } catch (e) {
        if (!(e instanceof HubLimitError)) throw e;
      }
    }
  }

  // A replay keeps the original date; it records when they first got going.
  if (!user.onboardedAt) {
    await prisma.user.update({ where: { id: user.id }, data: { onboardedAt: new Date() } });
  }
  revalidatePath("/", "layout");
  redirect("/today");
}
