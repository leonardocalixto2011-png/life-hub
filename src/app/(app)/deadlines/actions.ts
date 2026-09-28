"use server";

import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { revalidateContent } from "@/lib/revalidate";
import { visibleTo } from "@/lib/visibility";

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
  visibility: z.enum(["PRIVATE", "SHARED"]).default("SHARED"),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, id: z.string().cuid() });

/** Hub + privacy clause for writes by id — app-level mirror of the RLS policy. */
function scoped(id: string, hubId: string, userId: string) {
  return { id, hubId, ...visibleTo(userId) };
}

function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData): z.infer<T> {
  const res = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  return res.data;
}

export async function createDeadline(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = parse(createSchema, fd);
  await withHub(user.id, (tx) =>
    tx.deadline.create({
      data: {
        title: d.title,
        notes: d.notes,
        hubId: hub.id,
        dueDate: fromDateInput(d.dueDate)!,
        ventureId: d.ventureId,
        remindDaysBefore: d.remindDaysBefore,
        createdById: user.id,
        visibility: d.visibility,
      },
    }),
  );
  revalidateContent();
}

export async function updateDeadline(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = parse(updateSchema, fd);
  await withHub(user.id, async (tx) => {
    const { count } = await tx.deadline.updateMany({
      where: scoped(d.id, hub.id, user.id),
      data: {
        title: d.title,
        notes: d.notes,
        dueDate: fromDateInput(d.dueDate)!,
        ventureId: d.ventureId,
        remindDaysBefore: d.remindDaysBefore,
        visibility: d.visibility,
      },
    });
    if (count === 0) throw new Error("Not found.");
  });
  revalidateContent(`/deadlines/${d.id}`);
  redirect("/deadlines");
}

export async function toggleDeadlineDone(fd: FormData) {
  const { user, hub } = await requireHub();
  const schema = z.object({
    id: z.string().cuid(),
    done: z.preprocess((v) => v === "true" || v === true, z.boolean()),
  });
  const { id, done } = schema.parse({ id: fd.get("id"), done: fd.get("done") });
  await withHub(user.id, async (tx) => {
    const { count } = await tx.deadline.updateMany({
      where: scoped(id, hub.id, user.id),
      data: { doneAt: done ? new Date() : null },
    });
    if (count === 0) throw new Error("Not found.");
  });
  revalidateContent();
}

export async function deleteDeadline(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, async (tx) => {
    const { count } = await tx.deadline.deleteMany({ where: scoped(id, hub.id, user.id) });
    if (count === 0) throw new Error("Not found.");
  });
  revalidateContent();
  redirect("/deadlines");
}
