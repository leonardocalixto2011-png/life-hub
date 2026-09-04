"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { fromDateInput, fromDateTimeInput } from "@/lib/format";
import { parseText, type Draft, type DraftKind, type ParseOutcome } from "@/lib/parse";

export type { Draft, DraftKind };
export type ParseResult = ParseOutcome;

export async function parseQuickAdd(text: string): Promise<ParseResult> {
  const { user, hub } = await requireHub();
  if (text.trim().length > 2000) {
    return { ok: false, error: "Keep it under 2000 characters." };
  }
  return withHub(user.id, (tx) => parseText(text, { tx, hubId: hub.id }));
}

const CommitSchema = z.object({
  kind: z.enum(["task", "event", "deadline", "subscription", "budget"]),
  title: z.string().trim().min(1).max(200),
  date: z.string().nullable(),
  time: z.string().nullable(),
  amount: z.string().nullable(),
  entryType: z.enum(["INCOME", "EXPENSE"]),
  billingCycle: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]),
  priority: z.enum(["LOW", "MED", "HIGH"]),
  ventureId: z.string().nullable(),
  note: z.string().nullable(),
  visibility: z.enum(["PRIVATE", "SHARED"]).default("SHARED"),
});

function toCents(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export async function commitDrafts(
  raw: unknown,
): Promise<{ ok: boolean; created: string[]; error?: string }> {
  const { user, hub } = await requireHub();
  const list = z.array(CommitSchema).max(10).safeParse(raw);
  if (!list.success) return { ok: false, created: [], error: "Invalid draft data." };

  const created: string[] = [];

  const result = await withHub(user.id, async (tx) => {
    for (const d of list.data) {
      if (d.kind === "task") {
        await tx.task.create({
          data: {
            title: d.title,
            notes: d.note,
            hubId: hub.id,
            dueDate: fromDateInput(d.date),
            priority: d.priority,
            ventureId: d.ventureId,
            createdById: user.id,
            visibility: d.visibility,
          },
        });
        created.push(`Task: ${d.title}`);
      } else if (d.kind === "deadline") {
        await tx.deadline.create({
          data: {
            title: d.title,
            notes: d.note,
            hubId: hub.id,
            dueDate: fromDateInput(d.date) ?? new Date(),
            ventureId: d.ventureId,
            createdById: user.id,
            visibility: d.visibility,
          },
        });
        created.push(`Deadline: ${d.title}`);
      } else if (d.kind === "event") {
        const startAt = fromDateTimeInput(d.time) ?? fromDateInput(d.date) ?? new Date();
        await tx.event.create({
          data: {
            title: d.title,
            notes: d.note,
            hubId: hub.id,
            startAt,
            endAt: new Date(startAt.getTime() + 3_600_000),
            ventureId: d.ventureId,
            createdById: user.id,
            visibility: d.visibility,
          },
        });
        created.push(`Event: ${d.title}`);
      } else if (d.kind === "subscription") {
        const existing = await tx.subscription.findFirst({
          where: { hubId: hub.id, status: "ACTIVE", name: { equals: d.title, mode: "insensitive" } },
        });
        const renewalDate = fromDateInput(d.date) ?? new Date();
        if (existing) {
          await tx.subscription.update({
            where: { id: existing.id },
            data: { renewalDate, billingCycle: d.billingCycle, costCents: toCents(d.amount) ?? existing.costCents },
          });
          created.push(`Updated subscription: ${existing.name}`);
        } else {
          await tx.subscription.create({
            data: {
              name: d.title,
              hubId: hub.id,
              costCents: toCents(d.amount) ?? 0,
              billingCycle: d.billingCycle,
              renewalDate,
              ventureId: d.ventureId,
              ownerId: user.id,
              notes: d.note,
            },
          });
          created.push(`Subscription: ${d.title}`);
        }
      } else if (d.kind === "budget") {
        const cents = toCents(d.amount);
        if (cents == null || cents <= 0) {
          return { ok: false, created, error: `"${d.title}" needs an amount.` };
        }
        await tx.budgetEntry.create({
          data: {
            type: d.entryType,
            amountCents: cents,
            hubId: hub.id,
            category: d.title,
            description: d.note,
            date: fromDateInput(d.date) ?? new Date(),
            ventureId: d.ventureId,
            createdById: user.id,
          },
        });
        created.push(`${d.entryType === "INCOME" ? "Income" : "Expense"}: ${d.title}`);
      }
    }
    return { ok: true, created };
  });

  if (!result.ok) return result;

  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath("/agenda");
  revalidatePath("/deadlines");
  revalidatePath("/subscriptions");
  revalidatePath("/money");
  revalidatePath("/calendar");

  return result;
}
