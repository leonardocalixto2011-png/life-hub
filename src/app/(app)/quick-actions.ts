"use server";

import { z } from "zod";

import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/session";

import { withHub } from "@/lib/hub-context";
import { hubChrome } from "@/lib/data";
import { requireHub } from "@/lib/session";
import { rateLimit } from "@/lib/rate-limit";
import { overAiBudget, AI_BUDGET_MESSAGE } from "@/lib/ai-budget";
import {
  parseText,
  parseImage as parseImageCore,
  IMAGE_MEDIA_TYPES,
  type Draft,
  type DraftKind,
  type ImageMediaType,
  type ParseOutcome,
} from "@/lib/parse";
import { commitDraftsCore, draftSharing } from "@/lib/commit-drafts";
import { balanceMessage } from "@/lib/balance-message";
import { CommitSchema } from "@/lib/commit-schema";
import { revalidateContent } from "@/lib/revalidate";
import { langOf } from "@/lib/i18n";

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
  const { ventures } = await hubChrome(user.id, hub.id);
  return parseText(text, ventures, 25, user.id);
}

/**
 * Largest base64 payload accepted from quick-add "Snap". The client downscales
 * to ~1600px JPEG before sending (typically well under 1MB encoded), so this
 * only turns away something that skipped that step. bodySizeLimit in
 * next.config.ts sits just above it.
 */
const MAX_IMAGE_BASE64 = 3_500_000;

/**
 * Photo → drafts. Same gates as parseQuickAdd, in the same order, and the same
 * `ai:<user>` bucket: a photo is one more way to spend the same budget, not a
 * separate allowance. The image goes to Claude and nowhere else — it is not
 * stored and never logged.
 */
export async function parseImage(input: {
  data: string;
  mediaType: string;
}): Promise<ParseResult> {
  const { user, hub } = await requireHub();

  if (!(await rateLimit(`ai:${user.id}`, 60, 3600)).ok) {
    return { ok: false, error: "You have hit the hourly limit for AI parsing. Try again shortly." };
  }
  const mediaType = input?.mediaType;
  if (!(IMAGE_MEDIA_TYPES as readonly string[]).includes(mediaType)) {
    return { ok: false, error: "That photo format isn't supported." };
  }
  const data = typeof input.data === "string" ? input.data : "";
  if (data.length > MAX_IMAGE_BASE64) {
    return { ok: false, error: "That photo is too large." };
  }
  if (!data || !/^[A-Za-z0-9+/]+={0,2}$/.test(data)) {
    return { ok: false, error: "That photo couldn't be read." };
  }
  if (await overAiBudget(user.id)) return { ok: false, error: AI_BUDGET_MESSAGE };
  const { ventures } = await hubChrome(user.id, hub.id);
  return parseImageCore(
    { data, mediaType: mediaType as ImageMediaType },
    ventures,
    user.id,
    10,
    langOf(user.locale),
  );
}

/**
 * Records that the person has seen (and dismissed) the one-time notice about
 * who processes AI input — see components/AiNotice.tsx. Only ever sets the
 * flag; the first date stands.
 */
export async function dismissAiNotice(): Promise<void> {
  const user = await requireUser();
  if (user.aiNoticeAt) return;
  await prisma.user.updateMany({
    where: { id: user.id, aiNoticeAt: null },
    data: { aiNoticeAt: new Date() },
  });
}

export async function commitDrafts(
  raw: unknown,
): Promise<{ ok: boolean; created: string[]; error?: string; balance?: string }> {
  const { user, hub } = await requireHub();
  const list = z.array(CommitSchema).max(25).safeParse(raw);
  if (!list.success) return { ok: false, created: [], error: "Invalid draft data." };

  const result = await withHub(user.id, (tx) =>
    commitDraftsCore(tx, hub.id, user.id, list.data, langOf(user.locale), { activity: true }),
  );

  if (!result.ok) return result;

  revalidateContent();

  // A split expense moved who-owes-whom: say where that leaves things, in the
  // same words the Budget page uses. Read after the commit, in its own
  // transaction, and never allowed to turn a saved entry into an error.
  let balance: string | undefined;
  if (list.data.some((d) => draftSharing(d, user.id).payerSharePct != null)) {
    try {
      balance = (await balanceMessage(user, hub)) ?? undefined;
    } catch {
      balance = undefined;
    }
  }

  return { ...result, balance };
}
