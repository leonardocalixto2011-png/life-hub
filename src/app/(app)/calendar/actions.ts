"use server";

import { randomBytes } from "node:crypto";
import { redirect } from "next/navigation";
import { addDays, differenceInCalendarDays, eachDayOfInterval, startOfDay } from "date-fns";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput, fromDateTimeInput } from "@/lib/format";
import { revalidateContent } from "@/lib/revalidate";
import { rescopeActivity } from "@/lib/activity-rescope";
import { assertActiveMember, assertVentureInHub } from "@/lib/membership";
import { visibleTo } from "@/lib/visibility";
import { logActivity } from "@/lib/activity";

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

/**
 * Attendees are plain member ids with no FK into the hub, so RLS never looks
 * at them — every one is checked against this hub's ACTIVE members before it
 * is written (otherwise any user id in the app could be put on an event).
 */
async function readAttendees(fd: FormData, hubId: string): Promise<string[]> {
  const ids = [...new Set(fd.getAll("attendeeIds").map(String).filter(Boolean))];
  z.array(z.string().cuid()).max(50).parse(ids);
  for (const id of ids) await assertActiveMember(hubId, id);
  return ids;
}

/** Hub + privacy clause for writes by id — the app-level mirror of RLS. */
function scoped(hubId: string, userId: string) {
  return { hubId, ...visibleTo(userId) };
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
  await assertVentureInHub(hub.id, d.ventureId);
  const attendeeIds = await readAttendees(fd, hub.id);
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
    await withHub(user.id, async (tx) => {
      await tx.event.createMany({
        data: offsets.map((offset) => ({
          ...base,
          startAt: addDays(base.startAt, offset),
          endAt: addDays(base.endAt, offset),
          hubId: hub.id,
          createdById: user.id,
          recurrenceGroupId,
        })),
      });
      // One line for the whole series (createMany returns no ids to link to).
      await logActivity(tx, {
        hubId: hub.id,
        actorId: user.id,
        verb: "EVENT_ADDED",
        entityType: "event",
        summary: base.title,
        visibility: base.visibility,
      });
    });
  } else {
    await withHub(user.id, async (tx) => {
      const row = await tx.event.create({
        data: { ...base, hubId: hub.id, createdById: user.id },
        select: { id: true },
      });
      await logActivity(tx, {
        hubId: hub.id,
        actorId: user.id,
        verb: "EVENT_ADDED",
        entityType: "event",
        entityId: row.id,
        summary: base.title,
        visibility: base.visibility,
      });
    });
  }

  revalidateContent();
}

export async function updateEvent(fd: FormData) {
  const { user, hub } = await requireHub();
  const d = parse(updateSchema, fd);
  await assertVentureInHub(hub.id, d.ventureId);
  const attendeeIds = await readAttendees(fd, hub.id);
  const data = buildData(d, attendeeIds);
  await withHub(user.id, async (tx) => {
    const { count } = await tx.event.updateMany({ where: { id: d.id, ...scoped(hub.id, user.id) }, data });
    if (count === 0) throw new Error("Not found.");
  });
  await rescopeActivity(hub.id, "event", d.id, { visibility: d.visibility, title: d.title });
  revalidateContent();
  // In the edit sheet the form closes itself and stays on the list it opened over.
  if (!fd.get("inSheet")) redirect("/calendar");
}

export async function deleteEvent(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, async (tx) => {
    const { count } = await tx.event.deleteMany({ where: { id, ...scoped(hub.id, user.id) } });
    if (count === 0) throw new Error("Not found.");
  });
  revalidateContent();
  // In the edit sheet the form closes itself and stays on the list it opened over.
  if (!fd.get("inSheet")) redirect("/calendar");
}

/** Deletes exactly the events whose ids are checked — no series logic. */
export async function deleteEvents(ids: string[]) {
  const { user, hub } = await requireHub();
  const parsed = z.array(z.string().cuid()).min(1).max(100).parse(ids);
  await withHub(user.id, (tx) =>
    tx.event.deleteMany({ where: { id: { in: parsed }, ...scoped(hub.id, user.id) } }),
  );
  revalidateContent();
}

/**
 * Turns a calendar event — and its whole repeat series — into someone's work
 * schedule (`kind: SHIFT`). Same rows, so nothing is lost; they just stop
 * showing on the calendar and start showing on /schedule.
 */
export async function moveEventToSchedule(fd: FormData) {
  const { user, hub } = await requireHub();
  const { id, personId } = z
    .object({ id: z.string().cuid(), personId: z.string().cuid() })
    .parse({ id: fd.get("id"), personId: fd.get("personId") });

  await assertActiveMember(hub.id, personId);

  await withHub(user.id, async (tx) => {
    const ev = await tx.event.findFirst({
      where: { id, ...scoped(hub.id, user.id) },
      select: { recurrenceGroupId: true },
    });
    if (!ev) throw new Error("Event not found");
    await tx.event.updateMany({
      where: ev.recurrenceGroupId
        ? { recurrenceGroupId: ev.recurrenceGroupId, ...scoped(hub.id, user.id) }
        : { id, ...scoped(hub.id, user.id) },
      data: { kind: "SHIFT", personId, attendeeIds: [personId] },
    });
  });
  revalidateContent("/schedule");
  redirect("/schedule");
}

/** Deletes this occurrence and every later one in the same series. */
export async function deleteEventSeries(fd: FormData) {
  const { user, hub } = await requireHub();
  const schema = z.object({ recurrenceGroupId: z.string().min(1), fromDate: z.string().min(1) });
  const { recurrenceGroupId, fromDate } = schema.parse({
    recurrenceGroupId: fd.get("recurrenceGroupId"),
    fromDate: fd.get("fromDate"),
  });
  const startAt = fromDateTimeInput(fromDate);
  if (!startAt) throw new Error("Invalid date");

  await withHub(user.id, (tx) =>
    tx.event.deleteMany({
      where: { recurrenceGroupId, startAt: { gte: startAt }, ...scoped(hub.id, user.id) },
    }),
  );
  revalidateContent();
  // In the edit sheet the form closes itself and stays on the list it opened over.
  if (!fd.get("inSheet")) redirect("/calendar");
}
