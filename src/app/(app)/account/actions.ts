"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { deleteAccount } from "@/lib/account";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { createHash, randomBytes } from "node:crypto";
import { formResult, type ActionResult } from "@/lib/action-result";
import { normalizeUsername, usernameMessage, usernameProblem } from "@/lib/username";
import { blobUrlSchema } from "@/lib/blob-url";
import { deleteBlobIfUnreferenced } from "@/lib/blob-delete";
import { hashedKey, rateLimit } from "@/lib/rate-limit";
import { appUrl } from "@/lib/app-invites";
import { sendEmailChangeConfirm, sendEmailChangedNotice } from "@/lib/account-emails";

/**
 * The name other hub members see. It matters more now that members no longer
 * see each other's email address: with no name on file a person appears as a
 * neutral "Member". Also the rectification half of the access rights — the
 * one profile field that had no edit screen.
 */
export async function setDisplayName(formData: FormData) {
  const user = await requireUser();
  const name = z.string().trim().max(80).parse(formData.get("name") ?? "");
  // An address typed as a name would put back exactly what hiding emails removed.
  if (name.includes("@")) {
    redirect("/account?error=" + encodeURIComponent("A name can't contain @ — your email stays private."));
  }
  await prisma.user.update({ where: { id: user.id }, data: { name: name || null } });
  revalidatePath("/", "layout");
}

/**
 * Irreversible. Requires the person to type their own email address, which is
 * the cheapest reliable guard against a mis-tap on a phone — a confirm dialog
 * is one accidental tap away, typing an address is not.
 */
export async function deleteMyAccount(formData: FormData) {
  const user = await requireUser();

  const typed = z.string().parse(formData.get("confirmEmail") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) {
    redirect("/account?error=" + encodeURIComponent("That didn't match your email address."));
  }

  await deleteAccount(user.id);

  // The session outlives the row otherwise — JWT sessions aren't looked up in
  // the database, so without this they'd stay "signed in" as a ghost.
  await signOut({ redirectTo: "/login" });
}

/**
 * The person's @username. Empty clears it. Unique (case-insensitive, since it
 * is stored lowercase); a clash is reported plainly — a username is a handle
 * people give out, so "taken" reveals nothing private.
 */
export async function setUsername(formData: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    const username = normalizeUsername(String(formData.get("username") ?? ""));
    if (username === (user.username ?? "")) return;
    if (!(await rateLimit(`username:${user.id}`, 20, 3600)).ok) {
      throw new Error("Too many changes. Try again in an hour.");
    }
    if (username) {
      const problem = usernameProblem(username);
      if (problem) throw new Error(usernameMessage(problem));
    }
    try {
      await prisma.user.update({ where: { id: user.id }, data: { username: username || null } });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
        throw new Error("That username is taken. Try another one.");
      }
      throw e;
    }
    revalidatePath("/", "layout");
    return { notice: username ? "Your username is now @{username}." : "Username removed.", noticeVars: { username } };
  });
}

/**
 * Profile photo: a URL our Blob store just issued (uploaded from the browser,
 * like a task photo), or null to remove it. The old file is deleted once no
 * row points at it any more.
 */
export async function setAvatar(url: string | null) {
  const user = await requireUser();
  const next = url === null ? null : blobUrlSchema.parse(url);
  const previous = user.avatarUrl;
  await prisma.user.update({ where: { id: user.id }, data: { avatarUrl: next } });
  if (previous && previous !== next) await deleteBlobIfUnreferenced(previous);
  revalidatePath("/", "layout");
}

const EMAIL_CHANGE_TTL_MS = 60 * 60 * 1000;

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Step 1 of changing the sign-in address: a link goes to the NEW address.
 * Nothing changes until it is opened there — proof the person can read it,
 * the same proof a sign-in link gives.
 *
 * The answer is identical whether or not the address already belongs to
 * someone, so this form can't be used to test which addresses have accounts;
 * a taken address simply never receives a link.
 */
export async function requestEmailChange(formData: FormData): Promise<ActionResult> {
  return formResult(async () => {
    const user = await requireUser();
    const parsed = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
    if (!parsed.success) throw new Error("Enter a valid email address.");
    const email = parsed.data;
    if (email === user.email.toLowerCase()) throw new Error("That's already your address.");
    if (
      !(await rateLimit(`email-change:${user.id}`, 3, 86400)).ok ||
      !(await rateLimit(`email-change-to:${hashedKey(email)}`, 3, 86400)).ok
    ) {
      throw new Error("Too many tries today. Try again tomorrow.");
    }

    const taken = await prisma.user.findUnique({ where: { email }, select: { id: true } });
    if (!taken) {
      const token = randomBytes(24).toString("base64url");
      await prisma.$transaction([
        // One pending change at a time: a new request replaces the old link.
        prisma.emailChange.deleteMany({ where: { userId: user.id } }),
        prisma.emailChange.create({
          data: {
            userId: user.id,
            newEmail: email,
            tokenHash: tokenHash(token),
            expiresAt: new Date(Date.now() + EMAIL_CHANGE_TTL_MS),
          },
        }),
      ]);
      await sendEmailChangeConfirm({ to: email, url: `${appUrl()}/account/email?token=${token}` });
    }
    return { notice: "If that address can be used, a confirmation link is on its way to it. It works for 1 hour." };
  });
}

/**
 * Step 2, from the confirmation page (a button, not the page load, so a mail
 * scanner opening the link changes nothing). Must be the same signed-in
 * person who asked. The old address is told, so a takeover is never silent.
 */
export async function confirmEmailChange(token: string) {
  const user = await requireUser();
  const fail = (msg: string) => redirect("/account?error=" + encodeURIComponent(msg));
  if (!/^[A-Za-z0-9_-]{32}$/.test(token)) fail("That confirmation link doesn't work. Ask for a new one.");

  const change = await prisma.emailChange.findUnique({ where: { tokenHash: tokenHash(token) } });
  if (!change || change.userId !== user.id || change.expiresAt <= new Date()) {
    fail("That confirmation link doesn't work. Ask for a new one.");
  }
  const oldEmail = user.email;
  try {
    await prisma.$transaction([
      prisma.user.update({
        where: { id: user.id },
        data: { email: change!.newEmail, emailVerified: new Date() },
      }),
      prisma.emailChange.deleteMany({ where: { userId: user.id } }),
    ]);
  } catch (e) {
    // Someone took the address in the hour between request and confirm.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      fail("That address now belongs to another account.");
    }
    throw e;
  }
  // Sign-in links already sent to the old address must not work any more.
  await prisma.verificationToken.deleteMany({ where: { identifier: oldEmail } });
  try {
    await sendEmailChangedNotice({ to: oldEmail, newEmail: change!.newEmail, privacyUrl: `${appUrl()}/confidentialite` });
  } catch {
    // The change is done; a failed notice must not undo it or show an error.
  }
  revalidatePath("/", "layout");
  redirect("/account?changed=1");
}
