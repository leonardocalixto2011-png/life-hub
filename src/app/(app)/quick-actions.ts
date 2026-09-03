"use server";

import { revalidatePath } from "next/cache";
import { format } from "date-fns";
import { z } from "zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";

import { ai, aiEnabled, AI_MODEL } from "@/lib/ai";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";
import { listMembers, listVentures } from "@/lib/data";
import { fromDateInput, fromDateTimeInput } from "@/lib/format";

export type DraftKind = "task" | "event" | "deadline" | "subscription" | "budget";

/** A parsed candidate the user reviews and edits before it is saved. */
export type Draft = {
  kind: DraftKind;
  title: string;
  date: string | null; // YYYY-MM-DD  (task due / deadline due / subscription renewal)
  time: string | null; // YYYY-MM-DDTHH:MM  (event start)
  amount: string | null; // dollars as typed, e.g. "180.00"
  entryType: "INCOME" | "EXPENSE";
  billingCycle: "WEEKLY" | "MONTHLY" | "QUARTERLY" | "YEARLY" | "CUSTOM";
  priority: "LOW" | "MED" | "HIGH";
  ventureId: string | null;
  note: string | null;
};

const AiSchema = z.object({
  items: z.array(
    z.object({
      kind: z.enum(["task", "event", "deadline", "subscription", "budget"]),
      title: z.string(),
      date: z.string().nullable(), // YYYY-MM-DD
      time: z.string().nullable(), // YYYY-MM-DDTHH:MM
      amount: z.number().nullable(), // dollars
      entryType: z.enum(["INCOME", "EXPENSE"]).nullable(),
      billingCycle: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "YEARLY", "CUSTOM"]).nullable(),
      priority: z.enum(["LOW", "MED", "HIGH"]).nullable(),
      ventureName: z.string().nullable(),
      note: z.string().nullable(),
    }),
  ),
});

export type ParseResult =
  | { ok: true; drafts: Draft[] }
  | { ok: false; error: string };

export async function parseQuickAdd(text: string): Promise<ParseResult> {
  await requireUser();
  const clean = text.trim();
  if (!clean) return { ok: false, error: "Type something first." };
  if (clean.length > 2000) return { ok: false, error: "Keep it under 2000 characters." };
  if (!aiEnabled()) {
    return { ok: false, error: "Natural-language add needs ANTHROPIC_API_KEY set on the server." };
  }

  const [ventures, members] = await Promise.all([listVentures(), listMembers()]);
  const today = new Date();

  const system = [
    "Convert a person's freeform note into structured items for a shared life/business admin app.",
    `Today is ${format(today, "EEEE, yyyy-MM-dd")}. Resolve relative dates against it.`,
    "Pick kind per line:",
    "- event: has a specific clock time (call at 3pm, meeting Tue 10:00).",
    "- subscription: a recurring paid service (Netflix, Adobe, gym) — set billingCycle and, if a date is given, put it in date as the next renewal.",
    "- budget: a concrete payment/income already made or a bill to pay with an amount — set entryType and amount (dollars).",
    "- deadline: a hard dated milestone with no clock time and no money (tax filing, permit, application).",
    "- task: everything else.",
    "date is YYYY-MM-DD or null. time is YYYY-MM-DDTHH:MM or null. amount is a number of dollars or null.",
    `Ventures (exact name or null): ${ventures.map((v) => v.name).join(", ") || "none"}.`,
    "Never invent items not in the text. Empty items array if nothing is actionable.",
  ].join("\n");

  let parsed: z.infer<typeof AiSchema> | null = null;
  try {
    const res = await ai().messages.parse({
      model: AI_MODEL,
      max_tokens: 1536,
      output_config: { effort: "low", format: zodOutputFormat(AiSchema) },
      system,
      messages: [{ role: "user", content: clean }],
    });
    parsed = res.parsed_output;
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "Assistant error." };
  }
  if (!parsed || parsed.items.length === 0) {
    return { ok: false, error: "Nothing actionable found — try adding a date or an amount." };
  }

  const vByName = new Map(ventures.map((v) => [v.name.toLowerCase(), v.id]));

  const drafts: Draft[] = parsed.items.slice(0, 10).map((it) => ({
    kind: it.kind,
    title: it.title.slice(0, 200),
    date: it.date,
    time: it.time,
    amount: it.amount != null ? it.amount.toFixed(2) : null,
    entryType: it.entryType ?? "EXPENSE",
    billingCycle: it.billingCycle ?? "MONTHLY",
    priority: it.priority ?? "MED",
    ventureId: it.ventureName ? (vByName.get(it.ventureName.toLowerCase()) ?? null) : null,
    note: it.note,
  }));

  return { ok: true, drafts };
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
});

function toCents(s: string | null): number | null {
  if (!s) return null;
  const n = Number(s.replace(/[^0-9.-]/g, ""));
  return Number.isFinite(n) ? Math.round(n * 100) : null;
}

export async function commitDrafts(
  raw: unknown,
): Promise<{ ok: boolean; created: string[]; error?: string }> {
  const user = await requireUser();
  const list = z.array(CommitSchema).max(10).safeParse(raw);
  if (!list.success) return { ok: false, created: [], error: "Invalid draft data." };

  const created: string[] = [];

  for (const d of list.data) {
    if (d.kind === "task") {
      await prisma.task.create({
        data: {
          title: d.title,
          notes: d.note,
          dueDate: fromDateInput(d.date),
          priority: d.priority,
          ventureId: d.ventureId,
          createdById: user.id,
        },
      });
      created.push(`Task: ${d.title}`);
    } else if (d.kind === "deadline") {
      await prisma.deadline.create({
        data: {
          title: d.title,
          notes: d.note,
          dueDate: fromDateInput(d.date) ?? new Date(),
          ventureId: d.ventureId,
          createdById: user.id,
        },
      });
      created.push(`Deadline: ${d.title}`);
    } else if (d.kind === "event") {
      const startAt = fromDateTimeInput(d.time) ?? fromDateInput(d.date) ?? new Date();
      await prisma.event.create({
        data: {
          title: d.title,
          notes: d.note,
          startAt,
          endAt: new Date(startAt.getTime() + 3_600_000),
          ventureId: d.ventureId,
          createdById: user.id,
        },
      });
      created.push(`Event: ${d.title}`);
    } else if (d.kind === "subscription") {
      const existing = await prisma.subscription.findFirst({
        where: { status: "ACTIVE", name: { equals: d.title, mode: "insensitive" } },
      });
      const renewalDate = fromDateInput(d.date) ?? new Date();
      if (existing) {
        await prisma.subscription.update({
          where: { id: existing.id },
          data: { renewalDate, billingCycle: d.billingCycle, costCents: toCents(d.amount) ?? existing.costCents },
        });
        created.push(`Updated subscription: ${existing.name}`);
      } else {
        await prisma.subscription.create({
          data: {
            name: d.title,
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
      await prisma.budgetEntry.create({
        data: {
          type: d.entryType,
          amountCents: cents,
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

  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath("/agenda");
  revalidatePath("/deadlines");
  revalidatePath("/subscriptions");
  revalidatePath("/money");
  revalidatePath("/calendar");

  return { ok: true, created };
}
