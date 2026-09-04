"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";

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
});

export async function createEntry(fd: FormData) {
  const { user, hub } = await requireHub();
  const res = createSchema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  const d = res.data;

  const amountCents = dollarsToCents(d.amount);
  if (amountCents == null || amountCents <= 0) throw new Error("Amount must be a positive number");

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
      },
    }),
  );

  revalidatePath("/money");
}

export async function deleteEntry(fd: FormData) {
  const { user } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) => tx.budgetEntry.delete({ where: { id } }));
  revalidatePath("/money");
}
