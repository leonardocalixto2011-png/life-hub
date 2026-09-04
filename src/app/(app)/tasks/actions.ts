"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addMonths, addWeeks } from "date-fns";
import { z } from "zod";

import type { HubTx } from "@/lib/hub-context";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";

/**
 * Marking a recurring task done spawns its next occurrence: same fields, due date
 * advanced by the recurrence interval (from the old due date, or today).
 */
async function completeTask(tx: HubTx, id: string) {
  const task = await tx.task.findUnique({ where: { id } });
  if (!task) return;

  await tx.task.update({
    where: { id },
    data: { status: "DONE", completedAt: new Date() },
  });

  if (task.isRecurring && task.recurrence) {
    const base = task.dueDate ?? new Date();
    const nextDue =
      task.recurrence === "weekly" ? addWeeks(base, 1) : addMonths(base, 1);
    await tx.task.create({
      data: {
        title: task.title,
        notes: task.notes,
        hubId: task.hubId,
        ventureId: task.ventureId,
        assignedToId: task.assignedToId,
        priority: task.priority,
        isRecurring: true,
        recurrence: task.recurrence,
        dueDate: nextDue,
        createdById: task.createdById,
        visibility: task.visibility,
      },
    });
  }
}

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
  visibility: z.enum(["PRIVATE", "SHARED"]).default("SHARED"),
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
  const { user, hub } = await requireHub();
  const data = parse(createSchema, formData);

  await withHub(user.id, (tx) =>
    tx.task.create({
      data: {
        title: data.title,
        notes: data.notes,
        hubId: hub.id,
        ventureId: data.ventureId,
        assignedToId: data.assignedToId,
        dueDate: fromDateInput(data.dueDate),
        priority: data.priority,
        isRecurring: data.isRecurring,
        recurrence: data.isRecurring ? data.recurrence : null,
        createdById: user.id,
        visibility: data.visibility,
      },
    }),
  );

  revalidatePath("/today");
  revalidatePath("/tasks");
}

export async function updateTask(formData: FormData) {
  const { user } = await requireHub();
  const data = parse(updateSchema, formData);

  await withHub(user.id, (tx) =>
    tx.task.update({
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
        visibility: data.visibility,
      },
    }),
  );

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
  const { user } = await requireHub();
  const { id, done } = toggleSchema.parse({
    id: formData.get("id"),
    done: formData.get("done"),
  });

  await withHub(user.id, async (tx) => {
    if (done) {
      await completeTask(tx, id);
    } else {
      await tx.task.update({ where: { id }, data: { status: "OPEN", completedAt: null } });
    }
  });

  revalidatePath("/today");
  revalidatePath("/tasks");
}

export async function deleteTask(formData: FormData) {
  const { user } = await requireHub();
  const id = z.string().cuid().parse(formData.get("id"));
  await withHub(user.id, (tx) => tx.task.delete({ where: { id } }));

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
  const { user } = await requireHub();
  z.string().cuid().parse(id);
  await withHub(user.id, async (tx) => {
    if (done) {
      await completeTask(tx, id);
    } else {
      await tx.task.update({ where: { id }, data: { status: "OPEN", completedAt: null } });
    }
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

export async function makeRecurring(id: string, recurrence: "weekly" | "monthly") {
  const { user } = await requireHub();
  z.string().cuid().parse(id);
  await withHub(user.id, (tx) =>
    tx.task.update({ where: { id }, data: { isRecurring: true, recurrence } }),
  );
  refreshTaskPaths();
}

export async function setTaskFields(input: z.infer<typeof patchSchema>) {
  const { user } = await requireHub();
  const p = patchSchema.parse(input);
  await withHub(user.id, (tx) =>
    tx.task.update({
      where: { id: p.id },
      data: {
        ...(p.dueDate !== undefined
          ? { dueDate: p.dueDate ? fromDateInput(p.dueDate) : null }
          : {}),
        ...(p.ventureId !== undefined ? { ventureId: p.ventureId } : {}),
        ...(p.assignedToId !== undefined ? { assignedToId: p.assignedToId } : {}),
        ...(p.priority !== undefined ? { priority: p.priority } : {}),
      },
    }),
  );
  refreshTaskPaths();
}
