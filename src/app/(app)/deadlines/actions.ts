"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { fromDateInput } from "@/lib/format";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const remindDays = z.preprocess((v) => {
  if (typeof v !== "string") return [7, 3, 1];
  const nums = v
    .split(/[,\s]+/)
    .map((s) => Number(s))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 365);
  return nums.length ? Array.from(new Set(nums)).sort((a, b) => b - a) : [];
}, z.array(z.number().int()));

const fields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  dueDate: z.string().min(1, "Due date is required"),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  remindDaysBefore: remindDays,
};

const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, id: z.string().cuid() });

function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> {
  const res = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  return res.data;
}

export async function createDeadline(fd: FormData) {
  const user = await requireUser();
  const d = parse(createSchema, fd);
  await prisma.deadline.create({
    data: {
      title: d.title,
      notes: d.notes,
      dueDate: fromDateInput(d.dueDate)!,
      ventureId: d.ventureId,
      remindDaysBefore: d.remindDaysBefore,
      createdById: user.id,
    },
  });
  revalidatePath("/deadlines");
  revalidatePath("/today");
}

export async function updateDeadline(fd: FormData) {
  await requireUser();
  const d = parse(updateSchema, fd);
  await prisma.deadline.update({
    where: { id: d.id },
    data: {
      title: d.title,
      notes: d.notes,
      dueDate: fromDateInput(d.dueDate)!,
      ventureId: d.ventureId,
      remindDaysBefore: d.remindDaysBefore,
    },
  });
  revalidatePath("/deadlines");
  revalidatePath(`/deadlines/${d.id}`);
  redirect("/deadlines");
}

export async function toggleDeadlineDone(fd: FormData) {
  await requireUser();
  const schema = z.object({
    id: z.string().cuid(),
    done: z.preprocess((v) => v === "true" || v === true, z.boolean()),
  });
  const { id, done } = schema.parse({ id: fd.get("id"), done: fd.get("done") });
  await prisma.deadline.update({
    where: { id },
    data: { doneAt: done ? new Date() : null },
  });
  revalidatePath("/deadlines");
  revalidatePath("/today");
}

export async function deleteDeadline(fd: FormData) {
  await requireUser();
  const id = z.string().cuid().parse(fd.get("id"));
  await prisma.deadline.delete({ where: { id } });
  revalidatePath("/deadlines");
  redirect("/deadlines");
}
