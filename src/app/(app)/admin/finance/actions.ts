"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { requireUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { formResult, type ActionResult } from "@/lib/action-result";

/**
 * Admin-only: give Plus for free (COMP). Used for the beta households and the
 * founders' offer, and never touches a paid Stripe subscription: someone who
 * pays keeps their paid plan.
 */

async function requireAdmin() {
  const user = await requireUser();
  if (user.role !== "ADMIN") throw new Error("Only the app admin can do this.");
  return user;
}

const untilSchema = z
  .string()
  .optional()
  .transform((v) => (v ? new Date(`${v}T23:59:59`) : null))
  .refine((d) => d === null || !Number.isNaN(d.getTime()), "Pick a valid date.");

async function comp(userId: string, until: Date | null, note: string | null) {
  const row = await prisma.planAccount.findUnique({ where: { userId } });
  if (row?.stripeSubscriptionId && (row.status === "ACTIVE" || row.status === "PAST_DUE")) return false;
  await prisma.planAccount.upsert({
    where: { userId },
    update: { status: "COMP", compUntil: until, compNote: note },
    create: { userId, status: "COMP", compUntil: until, compNote: note },
  });
  return true;
}

export async function grantComp(fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    await requireAdmin();
    const email = z.string().email().safeParse(String(fd.get("email") ?? "").trim().toLowerCase());
    if (!email.success) throw new Error("Enter a valid email address.");
    const until = untilSchema.safeParse(String(fd.get("until") ?? "") || undefined);
    if (!until.success) throw new Error("Pick a valid date.");
    const target = await prisma.user.findUnique({ where: { email: email.data }, select: { id: true } });
    if (!target) throw new Error("No account uses that address.");
    const ok = await comp(target.id, until.data, String(fd.get("note") ?? "").slice(0, 120) || null);
    if (!ok) throw new Error("That person already pays for Plus.");
    revalidatePath("/admin/finance");
    return { notice: "Plus offered." };
  });
}

/** Every person who owns a hub today gets Plus until the date: the beta thank-you. */
export async function compAllOwners(fd: FormData): Promise<ActionResult> {
  return formResult(async () => {
    await requireAdmin();
    const until = untilSchema.safeParse(String(fd.get("until") ?? "") || undefined);
    if (!until.success || !until.data) throw new Error("Pick a valid date.");
    const owners = await prisma.hubMembership.findMany({
      where: { role: "OWNER", status: "ACTIVE" },
      select: { userId: true },
      distinct: ["userId"],
    });
    let n = 0;
    for (const o of owners) if (await comp(o.userId, until.data, "beta")) n++;
    revalidatePath("/admin/finance");
    return { notice: "Plus offered to {n} people.", noticeVars: { n } };
  });
}
