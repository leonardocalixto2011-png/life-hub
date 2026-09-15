"use server";

import { randomBytes } from "node:crypto";
import { addDays, eachDayOfInterval, startOfDay } from "date-fns";
import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput } from "@/lib/format";
import { revalidateContent } from "@/lib/revalidate";

const MAX_DAYS = 120;
const MAX_SHIFTS = 200;

const time = z.string().regex(/^\d{2}:\d{2}$/, "Pick a start and end time");

const schema = z.object({
  personId: z.string().cuid("Pick whose schedule this is"),
  label: z.preprocess((v) => (v === "" ? undefined : v), z.string().trim().max(60).optional()),
  startTime: time,
  endTime: time,
  fromDate: z.string().min(1, "Pick a start date"),
  untilDate: z.preprocess((v) => (v === "" ? undefined : v), z.string().optional()),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("SHARED"),
});

function at(day: Date, hhmm: string): Date {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m, 0, 0);
}

/**
 * Work shifts are Events with `kind: SHIFT` — real rows, generated up front the
 * same way the calendar's "repeat on these weekdays" works, so every existing
 * read path (and RLS policy) already understands them. An end time at or
 * before the start time is an overnight shift ending the next morning.
 */
export async function createShifts(fd: FormData) {
  const { user, hub } = await requireHub();
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const d = parsed.data;

  // Membership of *someone else* can't be read through app_user (the
  // HubMembership policy is self-only), so this check uses the trusted client.
  const member = await prisma.hubMembership.findFirst({
    where: { hubId: hub.id, userId: d.personId, status: "ACTIVE" },
    select: { user: { select: { name: true, email: true } } },
  });
  if (!member) throw new Error("That person isn't a member of this hub.");

  const first = fromDateInput(d.fromDate);
  if (!first) throw new Error("Invalid start date");
  const last = d.untilDate ? fromDateInput(d.untilDate) : first;
  if (!last || last < first) throw new Error("\"Until\" must be on or after the start date.");
  if ((last.getTime() - first.getTime()) / 864e5 > MAX_DAYS) {
    throw new Error(`Schedules can be added up to ${MAX_DAYS} days at a time.`);
  }

  const weekdays = fd.getAll("days").map(Number).filter((n) => n >= 0 && n <= 6);
  const days = eachDayOfInterval({ start: startOfDay(first), end: startOfDay(last) }).filter(
    (day) => weekdays.length === 0 || weekdays.includes(day.getDay()),
  );
  if (days.length === 0) throw new Error("No matching days in that range.");
  if (days.length > MAX_SHIFTS) throw new Error("That's too many shifts at once.");

  const firstName = (member.user.name ?? member.user.email ?? "").split(/[\s@]/)[0];
  const title = d.label ?? (firstName ? `Work — ${firstName}` : "Work");
  const recurrenceGroupId = days.length > 1 ? randomBytes(12).toString("hex") : null;

  const rows = days.map((day) => {
    const startAt = at(day, d.startTime);
    let endAt = at(day, d.endTime);
    if (endAt <= startAt) endAt = addDays(endAt, 1);
    return {
      hubId: hub.id,
      createdById: user.id,
      kind: "SHIFT" as const,
      personId: d.personId,
      attendeeIds: [d.personId],
      title,
      startAt,
      endAt,
      visibility: d.visibility,
      recurrenceGroupId,
    };
  });

  await withHub(user.id, (tx) => tx.event.createMany({ data: rows }));
  revalidateContent("/schedule");
}

export async function deleteShift(fd: FormData) {
  const { user } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) => tx.event.deleteMany({ where: { id, kind: "SHIFT" } }));
  revalidateContent("/schedule");
}

/** This shift and every later one generated with it. */
export async function deleteShiftSeries(fd: FormData) {
  const { user } = await requireHub();
  const { groupId, id } = z
    .object({ groupId: z.string().min(1), id: z.string().cuid() })
    .parse({ groupId: fd.get("groupId"), id: fd.get("id") });

  await withHub(user.id, async (tx) => {
    const anchor = await tx.event.findFirst({
      where: { id, kind: "SHIFT", recurrenceGroupId: groupId },
      select: { startAt: true },
    });
    if (!anchor) return;
    await tx.event.deleteMany({
      where: { kind: "SHIFT", recurrenceGroupId: groupId, startAt: { gte: anchor.startAt } },
    });
  });
  revalidateContent("/schedule");
}
