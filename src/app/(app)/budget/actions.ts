"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import { revalidateContent } from "@/lib/revalidate";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const createSchema = z.object({
  type: z.enum(["INCOME", "EXPENSE"]),
  amount: z.string().min(1, "Amount is required"),
  currency: z.preprocess(
    (v) => (typeof v === "string" && v ? v.toUpperCase() : "CAD"),
    z.string().length(3),
  ),
  category: z.string().trim().min(1, "Category is required").max(60),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  description: z.preprocess(emptyToNull, z.string().trim().max(500).nullable()),
  date: z.preprocess(emptyToNull, z.string().nullable()),
  paidById: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  split: z.enum(["none", "50", "60", "40", "0"]).default("none"),
});

/**
 * `paidById` is a plain member id with no FK, so this is the only thing
 * stopping a crafted form from attributing an expense to someone outside the
 * hub. Membership of *another* user isn't readable through app_user (the
 * HubMembership policy is self-only), hence the trusted client.
 */
async function assertMember(hubId: string, userId: string) {
  const m = await prisma.hubMembership.findFirst({
    where: { hubId, userId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!m) throw new Error("That person isn't a member of this hub.");
}

async function sharing(hubId: string, viewerId: string, d: z.infer<typeof createSchema>) {
  const payerSharePct = d.type === "EXPENSE" && d.split !== "none" ? Number(d.split) : null;
  const paidById = d.paidById ?? (payerSharePct != null ? viewerId : null);
  if (paidById && paidById !== viewerId) await assertMember(hubId, paidById);
  return { paidById, payerSharePct };
}

function amountOf(raw: string): number {
  const cents = dollarsToCents(raw);
  if (cents == null || cents <= 0) throw new Error("Amount must be a positive number");
  return cents;
}

export async function createEntry(fd: FormData) {
  const { user, hub } = await requireHub();
  const res = createSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  const d = res.data;
  const amountCents = amountOf(d.amount);
  const share = await sharing(hub.id, user.id, d);

  await withHub(user.id, (tx) =>
    tx.budgetEntry.create({
      data: {
        type: d.type,
        amountCents,
        hubId: hub.id,
        currency: d.currency,
        category: d.category,
        ventureId: d.ventureId,
        description: d.description,
        date: fromDateInput(d.date) ?? new Date(),
        createdById: user.id,
        ...share,
      },
    }),
  );

  revalidateContent();
}

const updateSchema = createSchema.extend({ id: z.string().cuid() });

export async function updateEntry(fd: FormData) {
  const { user, hub } = await requireHub();
  const res = updateSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  const d = res.data;
  const amountCents = amountOf(d.amount);
  const share = await sharing(hub.id, user.id, d);

  await withHub(user.id, (tx) =>
    tx.budgetEntry.update({
      where: { id: d.id },
      data: {
        type: d.type,
        amountCents,
        currency: d.currency,
        category: d.category,
        ventureId: d.ventureId,
        description: d.description,
        date: fromDateInput(d.date) ?? new Date(),
        ...share,
      },
    }),
  );

  revalidateContent();
}

export async function deleteEntry(fd: FormData) {
  const { user } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) => tx.budgetEntry.delete({ where: { id } }));
  revalidateContent();
}

/**
 * Records "X paid Y back". Stored as an expense X paid entirely for the
 * others (payer share 0) and flagged `isSettlement`, so it moves the shared
 * balance and nothing else — in/out totals skip it.
 */
export async function settleUp(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = z
    .object({
      fromId: z.string().cuid(),
      toName: z.string().trim().max(80),
      amount: z.string().min(1),
    })
    .parse({ fromId: fd.get("fromId"), toName: fd.get("toName"), amount: fd.get("amount") });
  await assertMember(hub.id, d.fromId);
  const amountCents = amountOf(d.amount);

  await withHub(user.id, (tx) =>
    tx.budgetEntry.create({
      data: {
        hubId: hub.id,
        type: "EXPENSE",
        amountCents,
        currency: hub.currency,
        category: "Settle up",
        description: d.toName ? `Paid back ${d.toName}` : "Paid back",
        date: new Date(),
        createdById: user.id,
        paidById: d.fromId,
        payerSharePct: 0,
        isSettlement: true,
      },
    }),
  );
  revalidateContent();
}

export async function setBudgetTarget(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = z
    .object({
      category: z.string().trim().min(1, "Category is required").max(60),
      amount: z.string().min(1, "Amount is required"),
    })
    .parse({ category: fd.get("category"), amount: fd.get("amount") });
  const monthlyCents = amountOf(d.amount);

  await withHub(user.id, (tx) =>
    tx.budgetTarget.upsert({
      where: { hubId_category: { hubId: hub.id, category: d.category } },
      update: { monthlyCents },
      create: { hubId: hub.id, category: d.category, monthlyCents },
    }),
  );
  revalidateContent();
}

export async function deleteBudgetTarget(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) => tx.budgetTarget.deleteMany({ where: { id, hubId: hub.id } }));
  revalidateContent();
}
