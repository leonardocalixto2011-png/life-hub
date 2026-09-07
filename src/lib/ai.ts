import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude client for the in-app assistant. Defaults to the most capable model;
 * set ANTHROPIC_MODEL (e.g. "claude-haiku-4-5" or "claude-sonnet-5") to trade
 * capability for cost.
 */
export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

/**
 * The cheap model, for high-volume work that does not need a capable one.
 *
 * Everything used to run on AI_MODEL, which defaults to the premium tier —
 * including mail classification, which is by far the most frequent call in
 * the app and by far the least demanding: sort one email into six buckets.
 * Paying premium rates to decide "bill or advertisement?" is the single
 * biggest avoidable cost here, and every polled message pays it.
 *
 * The split is by *task*, not by taste. Sorting and extracting structured
 * fields from text are things a small model does reliably; the weekly
 * briefing is prose a person reads, where the better model shows. So
 * classification and quick-add parsing use this, and the assistant keeps
 * AI_MODEL.
 */
export const AI_MODEL_FAST = process.env.ANTHROPIC_MODEL_FAST ?? "claude-haiku-4-5-20251001";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client: Anthropic | null = null;

export function ai(): Anthropic {
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return _client;
}
