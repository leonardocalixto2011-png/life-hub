"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { fromDateInput } from "@/lib/format";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const baseFields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  assignedToId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  dueDate: z.preprocess(emptyToNull, z.string().nullable()),
  priority: z.enum(["LOW", "MED", "HIGH"]).default("MED"),
  isRecurring: z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean()),
  recurrence: z.preprocess(emptyToNull, z.enum(["weekly", "monthly"]).nullable()),
};

const createSchema = z.object(baseFields);
const updateSchema = z.object({ ...baseFields, id: z.string().cuid() });

function parse<T extends z.ZodTypeAny>(schema: T, formData: FormData): z.infer<T> {
  const raw = Object.fromEntries(formData.entries());
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(result.error.issues[0]?.message ?? "Invalid input");
  }
  return result.data;
}

export async function createTask(formData: FormData) {
  const user = await requireUser();
  const data = parse(createSchema, formData);

  await prisma.task.create({
    data: {
      title: data.title,
      notes: data.notes,
      ventureId: data.ventureId,
      assignedToId: data.assignedToId,
      dueDate: fromDateInput(data.dueDate),
      priority: data.priority,
      isRecurring: data.isRecurring,
      recurrence: data.isRecurring ? data.recurrence : null,
      createdById: user.id,
    },
  });

  revalidatePath("/today");
  revalidatePath("/tasks");
}

export async function updateTask(formData: FormData) {
  await requireUser();
  const data = parse(updateSchema, formData);

  await prisma.task.update({
    where: { id: data.id },
    data: {
      title: data.title,
      notes: data.notes,
      ventureId: data.ventureId,
      assignedToId: data.assignedToId,
      dueDate: fromDateInput(data.dueDate),
      priority: data.priority,
      isRecurring: data.isRecurring,
      recurrence: data.isRecurring ? data.recurrence : null,
    },
  });

  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath(`/tasks/${data.id}`);
  redirect("/tasks");
}

const toggleSchema = z.object({
  id: z.string().cuid(),
  done: z.preprocess((v) => v === "true" || v === true || v === "on", z.boolean()),
});

export async function toggleTask(formData: FormData) {
  await requireUser();
  const { id, done } = toggleSchema.parse({
    id: formData.get("id"),
    done: formData.get("done"),
  });

  await prisma.task.update({
    where: { id },
    data: done
      ? { status: "DONE", completedAt: new Date() }
      : { status: "OPEN", completedAt: null },
  });

  revalidatePath("/today");
  revalidatePath("/tasks");
}

export async function deleteTask(formData: FormData) {
  await requireUser();
  const id = z.string().cuid().parse(formData.get("id"));
  await prisma.task.delete({ where: { id } });

  revalidatePath("/today");
  revalidatePath("/tasks");
  redirect("/tasks");
}

// --- Plain-arg actions for inline editing + swipe gestures -------------------

function refreshTaskPaths() {
  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath("/agenda");
}

/** Toggle done from JS (no FormData). Returns nothing; undo = call with !done. */
export async function setTaskDone(id: string, done: boolean) {
  await requireUser();
  z.string().cuid().parse(id);
  await prisma.task.update({
    where: { id },
    data: done
      ? { status: "DONE", completedAt: new Date() }
      : { status: "OPEN", completedAt: null },
  });
  refreshTaskPaths();
}

const patchSchema = z.object({
  id: z.string().cuid(),
  // undefined = leave alone, null = clear, string = set
  dueDate: z.union([z.string(), z.null()]).optional(),
  ventureId: z.union([z.string().cuid(), z.null()]).optional(),
  assignedToId: z.union([z.string().cuid(), z.null()]).optional(),
  priority: z.enum(["LOW", "MED", "HIGH"]).optional(),
});

export async function setTaskFields(input: z.infer<typeof patchSchema>) {
  await requireUser();
  const p = patchSchema.parse(input);
  await prisma.task.update({
    where: { id: p.id },
    data: {
      ...(p.dueDate !== undefined
        ? { dueDate: p.dueDate ? fromDateInput(p.dueDate) : null }
        : {}),
      ...(p.ventureId !== undefined ? { ventureId: p.ventureId } : {}),
      ...(p.assignedToId !== undefined ? { assignedToId: p.assignedToId } : {}),
      ...(p.priority !== undefined ? { priority: p.priority } : {}),
    },
  });
  refreshTaskPaths();
}
