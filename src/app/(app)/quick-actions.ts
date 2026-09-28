"use server";

import { z } from "zod";

import { withHub } from "@/lib/hub-context";
import { requireHub } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { overAiBudget, AI_BUDGET_MESSAGE } from "@/lib/ai-budget";
import { parseText, type Draft, type DraftKind, type ParseOutcome } from "@/lib/parse";
import { commitDraftsCore } from "@/lib/commit-drafts";
import { CommitSchema } from "@/lib/commit-schema";
import { revalidateContent } from "@/lib/revalidate";

export type { Draft, DraftKind };
export type ParseResult = ParseOutcome;

export async function parseQuickAdd(text: string): Promise<ParseResult> {
  const { user, hub } = await requireHub();

  // Each parse is a paid Anthropic call. Authentication alone is not a cost
  // control once signup is self-serve: one account can burn the whole budget.
  if (!(await rateLimit(`ai:${user.id}`, 60, 3600)).ok) {
    return { ok: false, error: "You have hit the hourly limit for AI parsing. Try again shortly." };
  }
  if (text.trim().length > 2000) {
    return { ok: false, error: "Keep it under 2000 characters." };
  }
  if (await overAiBudget(user.id)) return { ok: false, error: AI_BUDGET_MESSAGE };
  return withHub(user.id, (tx) => parseText(text, { tx, hubId: hub.id }, 25, user.id));
}

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

  revalidateContent();

  return result;
}
