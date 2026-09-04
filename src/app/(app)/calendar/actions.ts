"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateTimeInput } from "@/lib/format";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const fields = {
  title: z.string().trim().min(1, "Title is required").max(200),
  notes: z.preprocess(emptyToNull, z.string().trim().max(2000).nullable()),
  location: z.preprocess(emptyToNull, z.string().trim().max(200).nullable()),
  startAt: z.string().min(1, "Start time is required"),
  endAt: z.preprocess(emptyToNull, z.string().nullable()),
  ventureId: z.preprocess(emptyToNull, z.string().cuid().nullable()),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("SHARED"),
};

const createSchema = z.object(fields);
const updateSchema = z.object({ ...fields, id: z.string().cuid() });

function parse<T extends z.ZodTypeAny>(schema: T, fd: FormData) {
  const raw = Object.fromEntries(fd.entries());
  const res = schema.safeParse(raw);
  if (!res.success) throw new Error(res.error.issues[0]?.message ?? "Invalid input");
  return res.data as z.infer<T>;
}

function buildData(d: z.infer<typeof createSchema>, attendeeIds: string[]) {
  const startAt = fromDateTimeInput(d.startAt);
  if (!startAt) throw new Error("Invalid start time");
  let endAt = fromDateTimeInput(d.endAt);
  if (!endAt || endAt <= startAt) endAt = new Date(startAt.getTime() + 60 * 60 * 1000);
  return {
    title: d.title,
    notes: d.notes,
    location: d.location,
    startAt,
    endAt,
    ventureId: d.ventureId,
    attendeeIds,
    visibility: d.visibility,
  };
}

export async function createEvent(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = parse(createSchema, fd);
  const attendeeIds = fd.getAll("attendeeIds").map(String).filter(Boolean);
  await withHub(user.id, (tx) =>
    tx.event.create({
      data: { ...buildData(d, attendeeIds), hubId: hub.id, createdById: user.id },
    }),
  );
  revalidatePath("/calendar");
  revalidatePath("/today");
}

export async function updateEvent(fd: FormData) {
  const { user } = await requireHub();
  const d = parse(updateSchema, fd);
  const attendeeIds = fd.getAll("attendeeIds").map(String).filter(Boolean);
  await withHub(user.id, (tx) =>
    tx.event.update({ where: { id: d.id }, data: buildData(d, attendeeIds) }),
  );
  revalidatePath("/calendar");
  revalidatePath("/today");
  redirect("/calendar");
}

export async function deleteEvent(fd: FormData) {
  const { user } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) => tx.event.delete({ where: { id } }));
  revalidatePath("/calendar");
  redirect("/calendar");
}
