"use server";

import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { revalidateContent } from "@/lib/revalidate";

const emptyToNull = (v: unknown) => (v === "" || v === undefined ? null : v);

const schema = z.object({
  title: z.string().trim().min(1, "Give it a name").max(120),
  kind: z.enum(["BIRTHDAY", "ANNIVERSARY", "OTHER"]).default("OTHER"),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date"),
  yearUnknown: z.preprocess((v) => v === "on", z.boolean()),
  remindDaysBefore: z.preprocess(emptyToNull, z.string().nullable()),
  notes: z.preprocess(emptyToNull, z.string().trim().max(1000).nullable()),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("SHARED"),
});

/** "7, 1" → [7, 1]. Bounded so a typo can't schedule a reminder a year out. */
function parseRemind(value: string | null): number[] {
  if (!value) return [7, 1];
  const nums = value
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n >= 0 && n <= 60);
  return [...new Set(nums)].sort((a, b) => b - a).slice(0, 5);
}

export async function createSpecialDate(fd: FormData) {
  const { user, hub } = await requireHub();
  const parsed = schema.safeParse(Object.fromEntries(fd.entries()));
  if (!parsed.success) throw new Error(parsed.error.issues[0]?.message ?? "Invalid input");
  const d = parsed.data;

  const [year, month, day] = d.date.split("-").map(Number);
  if (!month || month < 1 || month > 12 || !day || day < 1 || day > 31) {
    throw new Error("Invalid date");
  }

  await withHub(user.id, (tx) =>
    tx.specialDate.create({
      data: {
        hubId: hub.id,
        createdById: user.id,
        title: d.title,
        kind: d.kind,
        month,
        day,
        year: d.yearUnknown ? null : year,
        remindDaysBefore: parseRemind(d.remindDaysBefore),
        notes: d.notes,
        visibility: d.visibility,
      },
    }),
  );
  revalidateContent("/calendar/dates");
}

export async function deleteSpecialDate(fd: FormData) {
  const { user, hub } = await requireHub();
  const id = z.string().cuid().parse(fd.get("id"));
  await withHub(user.id, (tx) =>
    tx.specialDate.deleteMany({
      // App-level mirror of the policy: hub + (shared or yours).
      where: { id, hubId: hub.id, OR: [{ visibility: "SHARED" }, { createdById: user.id }] },
    }),
  );
  revalidateContent("/calendar/dates");
}
