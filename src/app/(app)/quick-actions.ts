"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { parseText, type Draft, type DraftKind, type ParseOutcome } from "@/lib/parse";
import { commitDraftsCore } from "@/lib/commit-drafts";

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
  kind: z.enum(["task", "event", "deadline", "subscription", "budget", "needs_reply"]),
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
  suggestedReply: z.string().nullable().default(null),
});

export async function commitDrafts(
  raw: unknown,
): Promise<{ ok: boolean; created: string[]; error?: string }> {
  const { user, hub } = await requireHub();
  const list = z.array(CommitSchema).max(25).safeParse(raw);
  if (!list.success) return { ok: false, created: [], error: "Invalid draft data." };

  const result = await withHub(user.id, (tx) =>
    commitDraftsCore(tx, hub.id, user.id, list.data),
  );

  if (!result.ok) return result;

  revalidatePath("/today");
  revalidatePath("/tasks");
  revalidatePath("/agenda");
  revalidatePath("/deadlines");
  revalidatePath("/subscriptions");
  revalidatePath("/money");
  revalidatePath("/calendar");
  revalidatePath("/inbox");

  return result;
}
