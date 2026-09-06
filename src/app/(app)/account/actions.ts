"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { signOut } from "@/auth";
import { requireUser } from "@/lib/session";
import { deleteAccount } from "@/lib/account";

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
