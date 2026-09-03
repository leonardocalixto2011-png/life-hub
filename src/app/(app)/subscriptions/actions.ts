"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const fields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  cost: z.string().min(1, "Cost is required"),
  currency: z.preprocess(
    (v) => (typeof v === "string" && v ? v.toUpperCase() : "CAD"),
    z.string().length(3),
  ),
  billingCycle: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  renewalDate: z.string().min(1, "Renewal date is required"),
  cancelByDate: z.preprocess(emptyToNull, z.string().nullable()),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  ownerId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, id: z.string().cuid() });

function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> {
  const res = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  return res.data;
}

function data(d: z.infer<typeof createSchema>) {
  const costCents = dollarsToCents(d.cost);
  if (costCents == null || costCents < 0) throw new Error("Cost must be a positive number");
  return {
    name: d.name,
    costCents,
    currency: d.currency,
    billingCycle: d.billingCycle,
    renewalDate: fromDateInput(d.renewalDate)!,
    cancelByDate: fromDateInput(d.cancelByDate),
    ventureId: d.ventureId,
    ownerId: d.ownerId,
    notes: d.notes,
  };
}

export async function createSubscription(fd: FormData) {
  await requireUser();
  await prisma.subscription.create({ data: data(parse(createSchema, fd)) });
  revalidatePath("/subscriptions");
}

export async function updateSubscription(fd: FormData) {
  await requireUser();
  const d = parse(updateSchema, fd);
  await prisma.subscription.update({ where: { id: d.id }, data: data(d) });
  revalidatePath("/subscriptions");
  revalidatePath(`/subscriptions/${d.id}`);
  redirect("/subscriptions");
}

export async function setSubscriptionStatus(fd: FormData) {
  await requireUser();
  const schema = z.object({
    id: z.string().cuid(),
    status: z.enum(["ACTIVE", "CANCELLED"]),
  });
  const { id, status } = schema.parse({ id: fd.get("id"), status: fd.get("status") });
  await prisma.subscription.update({ where: { id }, data: { status } });
  revalidatePath("/subscriptions");
}

export async function deleteSubscription(fd: FormData) {
  await requireUser();
  const id = z.string().cuid().parse(fd.get("id"));
  await prisma.subscription.delete({ where: { id } });
  revalidatePath("/subscriptions");
  redirect("/subscriptions");
}
