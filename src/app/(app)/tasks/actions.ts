"use server";

import { redirect } from "next/navigation";
import { addWeeks } from "date-fns";
import { z } from "zod";

import type { HubTx } from "@/lib/hub-context";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { dollarsToCents } from "@/lib/money";
import { notifyAssignment } from "@/lib/notify";
import { revalidateContent } from "@/lib/revalidate";
import { assertActiveMember, assertVentureInHub } from "@/lib/membership";
import { visibleTo } from "@/lib/visibility";
import { addMonthsOnDay, anchorOf } from "@/lib/recur";

/**
 * Every write below goes by a client-supplied id. RLS already limits that to
 * the viewer's hubs and visible rows, but — as everywhere in this app — the
 * same rule is mirrored in app code so a missing/misconfigured app role can't
 * turn a bare id into access to another hub's (or someone's private) task.
 */
function scoped(id: string, hubId: string, userId: string) {
  return { id, hubId, ...visibleTo(userId) };
}

async function findScopedTask(tx: HubTx, id: string, hubId: string, userId: string) {
  const task = await tx.task.findFirst({ where: scoped(id, hubId, userId) });
  if (!task) throw new Error("Not found.");
  return task;
}

/**
 * Marking a recurring task done spawns its next occurrence: same fields, due date
 * advanced by the recurrence interval (from the old due date, or today).
 */
async function completeTask(tx: HubTx, id: string, hubId: string, userId: string) {
  const task = await findScopedTask(tx, id, hubId, userId);

  await tx.task.update({
    where: { id },
    data: { status: "DONE", completedAt: new Date() },
  });

  if (task.isRecurring && task.recurrence) {
    const base = task.dueDate ?? new Date();
    const dueDay = task.recurrence === "weekly" ? null : anchorOf(base, task.dueDay);
    const nextDue = dueDay == null ? addWeeks(base, 1) : addMonthsOnDay(base, 1, dueDay);
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
        dueDay,
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
  amount: z.preprocess(emptyToNull, z.string().nullable()),
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
  if (data.assignedToId) await assertActiveMember(hub.id, data.assignedToId);
  await assertVentureInHub(hub.id, data.ventureId);

  const task = await withHub(user.id, (tx) =>
    tx.task.create({
      data: {
        title: data.title,
        notes: data.notes,
        hubId: hub.id,
        ventureId: data.ventureId,
        assignedToId: data.assignedToId,
        dueDate: fromDateInput(data.dueDate),
        dueDay: null,
        amountCents: dollarsToCents(data.amount),
        priority: data.priority,
        isRecurring: data.isRecurring,
        recurrence: data.isRecurring ? data.recurrence : null,
        createdById: user.id,
        visibility: data.visibility,
      },
    }),
  );

  if (data.assignedToId && data.assignedToId !== user.id) {
    await notifyAssignment(task.id, task.title, data.assignedToId, user.name ?? user.email);
  }

  revalidateContent();
}

export async function updateTask(formData: FormData) {
  const { user, hub } = await requireHub();
  const data = parse(updateSchema, formData);
  if (data.assignedToId) await assertActiveMember(hub.id, data.assignedToId);
  await assertVentureInHub(hub.id, data.ventureId);

  const [before, after] = await withHub(user.id, async (tx) => {
    const before = await findScopedTask(tx, data.id, hub.id, user.id);
    const after = await tx.task.update({
      where: { id: data.id },
      data: {
        title: data.title,
        notes: data.notes,
        ventureId: data.ventureId,
        assignedToId: data.assignedToId,
        dueDate: fromDateInput(data.dueDate),
        dueDay: null,
        amountCents: dollarsToCents(data.amount),
        priority: data.priority,
        isRecurring: data.isRecurring,
        recurrence: data.isRecurring ? data.recurrence : null,
        visibility: data.visibility,
      },
    });
    return [before, after];
  });

  if (
    data.assignedToId &&
    data.assignedToId !== user.id &&
    data.assignedToId !== before?.assignedToId
  ) {
    await notifyAssignment(after.id, after.title, data.assignedToId, user.name ?? user.email);
  }

  revalidateContent(`/tasks/${data.id}`);
  redirect("/tasks");
}

const toggleSchema = z.object({
  id: z.string().cuid(),
  done: z.preprocess((v) => v === "true" || v === true || v === "on", z.boolean()),
});

/** Done → spawn the next occurrence if recurring; not done → reopen. */
async function applyDone(tx: HubTx, id: string, done: boolean, hubId: string, userId: string) {
  if (done) {
    await completeTask(tx, id, hubId, userId);
    return;
  }
  const { count } = await tx.task.updateMany({
    where: scoped(id, hubId, userId),
    data: { status: "OPEN", completedAt: null },
  });
  if (count === 0) throw new Error("Not found.");
}

export async function toggleTask(formData: FormData) {
  const { user, hub } = await requireHub();
  const { id, done } = toggleSchema.parse({
    id: formData.get("id"),
    done: formData.get("done"),
  });

  await withHub(user.id, (tx) => applyDone(tx, id, done, hub.id, user.id));

  revalidateContent();
}

export async function deleteTask(formData: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(formData.get("id"));
  await withHub(user.id, async (tx) => {
    const { count } = await tx.task.deleteMany({ where: scoped(id, hub.id, user.id) });
    if (count === 0) throw new Error("Not found.");
  });

  revalidateContent();
  redirect("/tasks");
}

// --- Plain-arg actions for inline editing + swipe gestures -------------------

function refreshTaskPaths() {
  revalidateContent();
}

/** Toggle done from JS (no FormData). Returns nothing; undo = call with !done. */
export async function setTaskDone(id: string, done: boolean) {
  const { user, hub } = await requireHub();
  z.string().cuid().parse(id);
  await withHub(user.id, (tx) => applyDone(tx, id, done, hub.id, user.id));
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
  const { user, hub } = await requireHub();
  z.string().cuid().parse(id);
  const r = z.enum(["weekly", "monthly"]).parse(recurrence);
  await withHub(user.id, async (tx) => {
    const { count } = await tx.task.updateMany({
      where: scoped(id, hub.id, user.id),
      data: { isRecurring: true, recurrence: r },
    });
    if (count === 0) throw new Error("Not found.");
  });
  refreshTaskPaths();
}

export async function setTaskFields(input: z.infer<typeof patchSchema>) {
  const { user, hub } = await requireHub();
  const p = patchSchema.parse(input);
  if (p.assignedToId) await assertActiveMember(hub.id, p.assignedToId);
  await assertVentureInHub(hub.id, p.ventureId);

  const [before, after] = await withHub(user.id, async (tx) => {
    const before = await findScopedTask(tx, p.id, hub.id, user.id);
    const after = await tx.task.update({
      where: { id: p.id },
      data: {
        ...(p.dueDate !== undefined
          ? { dueDate: p.dueDate ? fromDateInput(p.dueDate) : null, dueDay: null }
          : {}),
        ...(p.ventureId !== undefined ? { ventureId: p.ventureId } : {}),
        ...(p.assignedToId !== undefined ? { assignedToId: p.assignedToId } : {}),
        ...(p.priority !== undefined ? { priority: p.priority } : {}),
      },
    });
    return [before, after];
  });

  if (
    p.assignedToId !== undefined &&
    p.assignedToId &&
    p.assignedToId !== user.id &&
    p.assignedToId !== before?.assignedToId
  ) {
    await notifyAssignment(after.id, after.title, p.assignedToId, user.name ?? user.email);
  }

  refreshTaskPaths();
}
