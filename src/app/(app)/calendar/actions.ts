"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { addDays, differenceInCalendarDays, eachDayOfInterval, startOfDay } from "date-fns";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput, fromDateTimeInput } from "@/lib/format";

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

/**
 * Real rows, not a live recurrence engine — every date matching the checked
 * weekdays between the anchor date and `until` (inclusive) becomes its own
 * Event, keeping the anchor's time-of-day and duration by shifting whole
 * days. Offset 0 is the anchor's own day, so it's naturally included only
 * when its weekday is itself checked.
 */
function occurrenceOffsets(anchorStart: Date, repeatDays: number[], until: Date): number[] {
  const days = eachDayOfInterval({ start: startOfDay(anchorStart), end: startOfDay(until) });
  return days
    .filter((d) => repeatDays.includes(d.getDay()))
    .map((d) => differenceInCalendarDays(d, anchorStart));
}

export async function createEvent(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = parse(createSchema, fd);
  const attendeeIds = fd.getAll("attendeeIds").map(String).filter(Boolean);
  const base = buildData(d, attendeeIds);

  const repeatDays = fd.getAll("repeatDays").map(Number).filter((n) => n >= 0 && n <= 6);
  const repeatUntilRaw = fd.get("repeatUntil");
  const repeatUntil = typeof repeatUntilRaw === "string" ? fromDateInput(repeatUntilRaw) : null;

  if (repeatDays.length > 0 || repeatUntil) {
    if (repeatDays.length === 0 || !repeatUntil) {
      throw new Error("Pick at least one weekday and a \"repeat until\" date to enable repeating.");
    }
    const offsets = occurrenceOffsets(base.startAt, repeatDays, repeatUntil);
    if (offsets.length === 0) {
      throw new Error("No matching days between the start date and \"repeat until\".");
    }
    const recurrenceGroupId = randomBytes(12).toString("hex");
    await withHub(user.id, (tx) =>
      tx.event.createMany({
        data: offsets.map((offset) => ({
          ...base,
          startAt: addDays(base.startAt, offset),
          endAt: addDays(base.endAt, offset),
          hubId: hub.id,
          createdById: user.id,
          recurrenceGroupId,
        })),
      }),
    );
  } else {
    await withHub(user.id, (tx) =>
      tx.event.create({
        data: { ...base, hubId: hub.id, createdById: user.id },
      }),
    );
  }

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

/** Deletes this occurrence and every later one in the same series. */
export async function deleteEventSeries(fd: FormData) {
  const { user } = await requireHub();
  const schema = z.object({ recurrenceGroupId: z.string().min(1), fromDate: z.string().min(1) });
  const { recurrenceGroupId, fromDate } = schema.parse({
    recurrenceGroupId: fd.get("recurrenceGroupId"),
    fromDate: fd.get("fromDate"),
  });
  const startAt = fromDateTimeInput(fromDate);
  if (!startAt) throw new Error("Invalid date");

  await withHub(user.id, (tx) =>
    tx.event.deleteMany({ where: { recurrenceGroupId, startAt: { gte: startAt } } }),
  );
  revalidatePath("/calendar");
  redirect("/calendar");
}
