"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { addCredit, getWallet } from "@/lib/credits";
import { dollarsToCents } from "@/lib/money";
import { formResult } from "@/lib/action-result";
import { normalizeUsername } from "@/lib/username";

/**
 * A monthly ceiling the person sets on their own spending. Empty clears it.
 * It caps usage charged this calendar month, whatever the balance holds.
 */
export async function setMonthlyLimit(formData: FormData) {
  return formResult(async () => {
    const user = await requireUser();
    const raw = String(formData.get("limit") ?? "").trim();
    const cents = raw ? dollarsToCents(raw) : null;
    if (raw && (cents === null || cents < 0 || cents > 100_000)) throw new Error("Enter an amount between 0 and 1000.");
    await getWallet(user.id);
    await prisma.creditWallet.update({ where: { userId: user.id }, data: { monthlyLimitCents: cents } });
    revalidatePath("/credits");
    return { notice: "Saved." };
  });
}

/**
 * Admin-only: add (or, with a negative amount, remove) credit for someone,
 * found by email or @username. Until billing lands this is how a wallet gets
 * topped up; every entry records who made it.
 */
export async function adminAdjustCredit(formData: FormData) {
  return formResult(async () => {
    const admin = await requireUser();
    if (admin.role !== "ADMIN") throw new Error("Only an administrator can do this.");
    const who = z.string().trim().min(1).max(200).parse(formData.get("who") ?? "");
    const note = z.string().trim().max(200).parse(formData.get("note") ?? "");
    const amountRaw = String(formData.get("amount") ?? "").trim();
    const negative = amountRaw.startsWith("-");
    const cents = dollarsToCents(amountRaw.replace(/^-/, ""));
    if (!cents || cents > 100_000) throw new Error("Enter an amount between 0 and 1000.");

    const target = who.includes("@") && !who.startsWith("@")
      ? await prisma.user.findUnique({ where: { email: who.toLowerCase() }, select: { id: true } })
      : await prisma.user.findUnique({ where: { username: normalizeUsername(who) }, select: { id: true } });
    if (!target) throw new Error("No account matches that address or username.");

    await addCredit({
      userId: target.id,
      cents: negative ? -cents : cents,
      kind: negative ? "ADJUST" : "GRANT",
      note: note || null,
      createdById: admin.id,
    });
    revalidatePath("/credits");
    return { notice: "Credit updated." };
  });
}
