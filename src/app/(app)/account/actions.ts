"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { deleteAccount } from "@/lib/account";
import { prisma } from "@/lib/prisma";

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
