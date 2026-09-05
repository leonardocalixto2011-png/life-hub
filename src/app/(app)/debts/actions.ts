"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents, percentToBasisPoints } from "@/lib/money";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const fields = {
  name: z.string().trim().min(1, "Name is required").max(200),
  balance: z.string().min(1, "Balance is required"),
  apr: z.preprocess(emptyToNull, z.string().nullable()),
  minimumPayment: z.preprocess(emptyToNull, z.string().nullable()),
  actualPayment: z.preprocess(emptyToNull, z.string().nullable()),
  dueDate: z.preprocess(emptyToNull, z.string().nullable()),
  status: z.enum(["CURRENT", "DEFAULT", "PAID_OFF"]).default("CURRENT"),
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
    ventureId: d.ventureId,
    ownerId: d.ownerId,
    notes: d.notes,
  };
}

export async function createDebt(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = data(parse(createSchema, fd));
  await withHub(user.id, (tx) => tx.debt.create({ data: { ...d, hubId: hub.id } }));
  revalidatePath("/debts");
}

export async function updateDebt(fd: FormData) {
  const { user } = await requireHub();
  const d = parse(updateSchema, fd);
  await withHub(user.id, (tx) => tx.debt.update({ where: { id: d.id }, data: data(d) }));
  revalidatePath("/debts");
  revalidatePath(`/debts/${d.id}`);
  redirect("/debts");
}

export async function setDebtStatus(fd: FormData) {
  const { user } = await requireHub();
  const schema = z.object({
    id: z.string().cuid(),
    status: z.enum(["CURRENT", "DEFAULT", "PAID_OFF"]),
  });
  const { id, status } = schema.parse({ id: fd.get("id"), status: fd.get("status") });
  await withHub(user.id, (tx) => tx.debt.update({ where: { id }, data: { status } }));
  revalidatePath("/debts");
}

export async function deleteDebt(fd: FormData) {
  const { user } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) => tx.debt.delete({ where: { id } }));
  revalidatePath("/debts");
  redirect("/debts");
}
