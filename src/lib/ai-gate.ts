import { rateLimit } from "@/lib/rate-limit";
import { overAiBudget, recordAiSpend, AI_BUDGET_MESSAGE } from "@/lib/ai-budget";
import { chargeAi, creditBlock, type TokenUsage } from "@/lib/credits";

/**
 * The one gate in front of every interactive AI call, and the one meter
 * behind it. Each entry point (quick-add, photo, assistant chat) used to
 * repeat the rate-limit + budget checks by hand and only some of them did
 * all of it; now they ask here.
 *
 *   hourly rate limit   how often (shared `ai:<user>` bucket, unchanged)
 *   token budget        runaway protection on the operator's account
 *   Claude credit       the person's own prepaid balance
 *
 * Returns null when the call may go ahead, otherwise an English message that
 * doubles as the i18n key.
 */
export async function aiGate(userId: string, opts: { countRequest?: boolean } = {}): Promise<string | null> {
  if (opts.countRequest !== false && !(await rateLimit(`ai:${userId}`, 60, 3600)).ok) {
    return "You have hit the hourly AI limit. Try again shortly.";
  }
  const blocked = await creditBlock(userId);
  if (blocked) return blocked;
  if (await overAiBudget(userId)) return AI_BUDGET_MESSAGE;
  return null;
}

/** After a call: count the tokens against the budget and charge the wallet. Never throws. */
export async function meterAi(
  userId: string,
  model: string,
  usage: TokenUsage | null | undefined,
  feature: string,
  hubId?: string | null,
): Promise<number> {
  await recordAiSpend(userId, {
    input_tokens:
      (usage?.input_tokens ?? 0) + (usage?.cache_creation_input_tokens ?? 0) + (usage?.cache_read_input_tokens ?? 0),
    output_tokens: usage?.output_tokens ?? 0,
  });
  return chargeAi(userId, model, usage, feature, hubId);
}
