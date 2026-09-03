import Anthropic from "@anthropic-ai/sdk";

/**
 * Claude client for the in-app assistant. Defaults to the most capable model;
 * set ANTHROPIC_MODEL (e.g. "claude-haiku-4-5" or "claude-sonnet-5") to trade
 * capability for cost.
 */
export const AI_MODEL = process.env.ANTHROPIC_MODEL ?? "claude-opus-5";

export function aiEnabled(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

let _client: Anthropic | null = null;

export function ai(): Anthropic {
  if (!_client) _client = new Anthropic(); // reads ANTHROPIC_API_KEY from env
  return _client;
}
