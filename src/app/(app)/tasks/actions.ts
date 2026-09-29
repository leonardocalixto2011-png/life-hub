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
import { addMonthsOnDay, anchorOf, sameDay } from "@/lib/recur";
import { blobUrlSchema } from "@/lib/blob-url";
import { deleteBlobIfUnreferenced } from "@/lib/blob-delete";
import { attachmentPrefix } from "@/lib/attachments";

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

/** A new due date, resetting the monthly anchor only if the day really changed. */
function dueFields(before: Date | null, dueDate: Date | null) {
  return sameDay(before, dueDate) ? { dueDate } : { dueDate, dueDay: null };
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

// A photo is only set at creation here (quick-add "Attach a photo"); the
// detail page changes it with setTaskImage, so the edit form can't clear it.
const createSchema = z.object({
  ...baseFields,
  imageUrl: z.preprocess(emptyToNull, blobUrlSchema.nullable()).optional(),
});
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
        imageUrl: data.imageUrl ?? null,
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
        // A changed date becomes the new anchor (re-derived on the next roll);
        // re-saving the form with the same date keeps the old one.
        ...dueFields(before.dueDate, fromDateInput(data.dueDate)),
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
  const imageUrl = await withHub(user.id, async (tx) => {
    const task = await findScopedTask(tx, id, hub.id, user.id);
    await tx.task.delete({ where: { id: task.id } });
    return task.imageUrl;
  });
  // After the row is gone, and only if no other row still points at it.
  await deleteBlobIfUnreferenced(imageUrl);

  revalidateContent();
  redirect("/tasks");
}

/**
 * Pin, replace or remove a task's photo. Row first, blob cleanup second —
 * the same order as the background photo, for the same reason: the old URL
 * came from a client and might still be someone else's file.
 */
export async function setTaskImage(id: string, url: string | null) {
  const { user, hub } = await requireHub();
  z.string().cuid().parse(id);
  const next = url == null ? null : blobUrlSchema.parse(url);
  const before = await withHub(user.id, async (tx) => {
    const task = await findScopedTask(tx, id, hub.id, user.id);
    await tx.task.update({ where: { id }, data: { imageUrl: next } });
    return task.imageUrl;
  });
  if (before && before !== next) await deleteBlobIfUnreferenced(before);
  revalidateContent(`/tasks/${id}`);
}

/**
 * Cleans up photos uploaded during a quick-add / share review. A photo is
 * uploaded while it is being read, before anyone knows whether it will end up
 * pinned to a task (a receipt becomes a budget entry; a draft gets discarded).
 * When the review ends the client hands back every URL it uploaded, and each
 * one not referenced by any row is deleted.
 *
 * Only the caller's own attachment folder: a URL is a client value, and this
 * must not become a way to delete someone else's file — deleteBlobIfUnreferenced
 * already refuses anything still in use, the prefix check covers the rest.
 */
export async function discardAttachments(urls: string[]) {
  const { user } = await requireHub();
  const list = z.array(z.string()).max(10).parse(urls);
  const prefix = '/' + attachmentPrefix(user.id);
  for (const raw of list) {
    const ok = blobUrlSchema.safeParse(raw);
    if (!ok.success) continue;
    let path: string;
    try {
      path = new URL(ok.data).pathname;
    } catch {
      continue;
    }
    if (!path.startsWith(prefix)) continue;
    await deleteBlobIfUnreferenced(ok.data);
  }
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
        ...(p.dueDate !== undefined ? dueFields(before.dueDate, p.dueDate ? fromDateInput(p.dueDate) : null) : {}),
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
