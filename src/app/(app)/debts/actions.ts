"use server";

import { redirect } from "next/navigation";
import { addMonths } from "date-fns";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { prisma } from "@/lib/prisma";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents, percentToBasisPoints } from "@/lib/money";
import { revalidateContent } from "@/lib/revalidate";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const fields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  balance: z.string().min(1, "Balance is required"),
  apr: z.preprocess(emptyToNull, z.string().nullable()),
  minimumPayment: z.preprocess(emptyToNull, z.string().nullable()),
  actualPayment: z.preprocess(emptyToNull, z.string().nullable()),
  dueDate: z.preprocess(emptyToNull, z.string().nullable()),
  status: z.enum(["CURRENT", "DEFAULT", "PAID_OFF"]).default("CURRENT"),
  type: z.enum(["CREDIT_CARD", "LINE_OF_CREDIT", "LOAN", "CAR_LOAN", "BNPL", "OTHER"]).default("OTHER"),
  originalBalance: z.preprocess(emptyToNull, z.string().nullable()),
  paymentFrequency: z.enum(["WEEKLY", "BIWEEKLY", "MONTHLY"]).default("MONTHLY"),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  // No ownerId field: a debt always belongs to whoever is creating it.
};

const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, id: z.string().cuid() });

function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> {
  const res = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  return res.data;
}

function data(d: z.infer<typeof createSchema>) {
  const balanceCents = dollarsToCents(d.balance);
  if (balanceCents == null || balanceCents < 0) throw new Error("Balance must be a positive number");
  return {
    name: d.name,
    balanceCents,
    aprBasisPoints: percentToBasisPoints(d.apr),
    minimumPaymentCents: dollarsToCents(d.minimumPayment),
    actualPaymentCents: dollarsToCents(d.actualPayment),
    dueDate: fromDateInput(d.dueDate),
    status: d.status,
    type: d.type,
    originalBalanceCents: dollarsToCents(d.originalBalance),
    paymentFrequency: d.paymentFrequency,
    ventureId: d.ventureId,
    notes: d.notes,
  };
}

/**
 * Every mutation below re-checks ownership in the app layer even though the
 * RLS policy's WITH CHECK already restricts writes to the owner — the same
 * defense-in-depth the rest of this codebase keeps, because the local dev
 * Postgres authenticates any credentials as superuser and so enforces no
 * policy at all (see the RLS gotcha in CLAUDE.md).
 */
async function assertOwns(tx: Parameters<Parameters<typeof withHub>[1]>[0], id: string, userId: string) {
  const row = await tx.debt.findUnique({ where: { id }, select: { ownerId: true } });
  if (!row || row.ownerId !== userId) throw new Error("That debt isn't yours to change.");
}

export async function createDebt(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = data(parse(createSchema, fd));
  await withHub(user.id, (tx) =>
    tx.debt.create({ data: { ...d, hubId: hub.id, ownerId: user.id } }),
  );
  revalidateContent();
}

export async function updateDebt(fd: FormData) {
  const { user } = await requireHub();
  const d = parse(updateSchema, fd);
  await withHub(user.id, async (tx) => {
    await assertOwns(tx, d.id, user.id);
    // Editing confirms the owner, so a backfilled guess stops being flagged.
    await tx.debt.update({ where: { id: d.id }, data: { ...data(d), ownerBackfilled: false } });
  });
  revalidateContent(`/debts/${d.id}`);
  redirect("/debts");
}

export async function setDebtStatus(fd: FormData) {
  const { user } = await requireHub();
  const schema = z.object({
    id: z.string().cuid(),
    status: z.enum(["CURRENT", "DEFAULT", "PAID_OFF"]),
  });
  const { id, status } = schema.parse({ id: fd.get("id"), status: fd.get("status") });
  await withHub(user.id, async (tx) => {
    await assertOwns(tx, id, user.id);
    await tx.debt.update({ where: { id }, data: { status } });
  });
  revalidateContent(`/debts/${id}`);
}

export async function deleteDebt(fd: FormData) {
  const { user } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, async (tx) => {
    await assertOwns(tx, id, user.id);
    await tx.debt.delete({ where: { id } });
  });
  revalidateContent();
  redirect("/debts");
}

/**
 * Records a payment against a debt: logs a matching Budget expense, drops
 * the balance, and rolls the due date forward a month. `amount` is dollars
 * (the client sends the row's actual-or-minimum payment as the default);
 * `date` defaults to today.
 */
export async function logDebtPayment(fd: FormData) {
  const { user, hub } = await requireHub();
  const schema = z.object({
    id: z.string().cuid(),
    amount: z.string().min(1, "Amount is required"),
    date: z.preprocess(emptyToNull, z.string().nullable()),
  });
  const { id, amount, date } = schema.parse({
    id: fd.get("id"),
    amount: fd.get("amount"),
    date: fd.get("date"),
  });

  const amountCents = dollarsToCents(amount);
  if (amountCents == null || amountCents <= 0) {
    throw new Error("Payment amount must be a positive number");
  }

  await withHub(user.id, async (tx) => {
    const debt = await tx.debt.findUnique({
      where: { id },
      select: { name: true, ventureId: true, dueDate: true, ownerId: true },
    });
    if (!debt) throw new Error("Debt not found");
    if (debt.ownerId !== user.id) throw new Error("That debt isn't yours to change.");

    await tx.budgetEntry.create({
      data: {
        type: "EXPENSE",
        amountCents,
        hubId: hub.id,
        currency: "CAD",
        category: debt.name,
        description: "Debt payment",
        date: fromDateInput(date) ?? new Date(),
        ventureId: debt.ventureId,
        createdById: user.id,
      },
    });

    await tx.debt.update({
      where: { id },
      data: {
        balanceCents: { decrement: amountCents },
        dueDate: debt.dueDate ? addMonths(debt.dueDate, 1) : null,
      },
    });
  });

  revalidateContent(`/debts/${id}`);
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------

/**
 * Opt this person's whole tracker into (or out of) one hub. `visibility: null`
 * revokes. Only ever writes a share owned by the acting user, so nobody can
 * publish someone else's tracker — or un-publish it.
 */
export async function setDebtShare(hubId: string, visibility: "SUMMARY" | "FULL" | null) {
  const { user } = await requireHub();
  const parsed = z
    .object({
      hubId: z.string().cuid(),
      visibility: z.enum(["SUMMARY", "FULL"]).nullable(),
    })
    .parse({ hubId, visibility });

  // You can only share into a hub you actually belong to.
  const member = await prisma.hubMembership.findFirst({
    where: { hubId: parsed.hubId, userId: user.id, status: "ACTIVE" },
    select: { id: true },
  });
  if (!member) throw new Error("You're not a member of that hub.");

  if (parsed.visibility === null) {
    await prisma.debtShare.deleteMany({ where: { ownerId: user.id, hubId: parsed.hubId } });
  } else {
    await prisma.debtShare.upsert({
      where: { ownerId_hubId: { ownerId: user.id, hubId: parsed.hubId } },
      update: { visibility: parsed.visibility },
      create: { ownerId: user.id, hubId: parsed.hubId, visibility: parsed.visibility },
    });
  }

  revalidateContent();
}

/** Accept the owner the ownership migration guessed, clearing the flag. */
export async function confirmDebtOwner(id: string) {
  const { user } = await requireHub();
  z.string().cuid().parse(id);
  await withHub(user.id, async (tx) => {
    await assertOwns(tx, id, user.id);
    await tx.debt.update({ where: { id }, data: { ownerBackfilled: false } });
  });
  revalidateContent(`/debts/${id}`);
}
