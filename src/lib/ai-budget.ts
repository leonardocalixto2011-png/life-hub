import { prisma } from "@/lib/prisma";
import { logWarn } from "@/lib/observability";

/**
 * A real spend ceiling, not just a request count.
 *
 * The rate limits already in place cap *how often* someone can call Claude —
 * 60 times an hour. They say nothing about how much each call costs, and the
 * calls are not the same size: a quick-add parse is a sentence, a weekly
 * briefing sends the entire dashboard. 60 briefings an hour, every hour, is a
 * bill nobody notices until it arrives.
 *
 * So this counts tokens. It reuses the RateLimit table rather than adding a
 * model: that table is already a keyed counter over a time window with a
 * prune job attached, which is exactly what a monthly token budget is. The
 * only difference is the increment — tokens rather than one.
 *
 * Two deliberate properties:
 *
 *   The check happens *before* a call and the record *after*, because the cost
 *   is unknown until the response comes back. A single call can therefore
 *   overshoot the budget; the next one is refused. Over a month that is
 *   noise, and the alternative — estimating cost up front — is a guess that
 *   would be wrong in both directions.
 *
 *   It fails OPEN on a database error, like the rate limiter, and for the
 *   same reason: this guards spend, not access. A Postgres blip should not
 *   take the assistant offline.
 */

/** One window per calendar-ish month. Fixed-window, same as the rate limiter. */
const WINDOW_SECONDS = 60 * 60 * 24 * 30;

/**
 * Tokens per subject per 30 days.
 *
 * This was 2_000_000, described in an earlier version of this comment as "a
 * few dollars". That was wrong and worth recording: AI_MODEL defaults to
 * claude-opus-5, the premium tier, where 2M tokens is on the order of $50-60
 * — so the "hard stop" would have let a real bill through.
 *
 * 400k is roughly 2-4x realistic personal use (a quick-add parse costs ~1-2k
 * tokens, a weekly briefing ~3-5k, an email classification ~1-2k), which is
 * what a runaway-protection ceiling should be: comfortably above normal, well
 * below painful. Raise it with AI_TOKEN_BUDGET once real usage data exists —
 * the number to check is the Anthropic console, not this comment.
 */
const DEFAULT_BUDGET = 400_000;

function budget(): number {
  const raw = Number(process.env.AI_TOKEN_BUDGET);
  return Number.isFinite(raw) && raw > 0 ? raw : DEFAULT_BUDGET;
}

function windowFor(now = new Date()) {
  const ms = WINDOW_SECONDS * 1000;
  const windowStart = new Date(Math.floor(now.getTime() / ms) * ms);
  return { windowStart, expiresAt: new Date(windowStart.getTime() + ms) };
}

/**
 * True when this subject has already spent its allowance.
 *
 * `subject` is whatever should share one budget — a user id for the
 * interactive paths, a hub id for mail classification, which runs from cron
 * with no user attached.
 */
export async function overAiBudget(subject: string): Promise<boolean> {
  const { windowStart } = windowFor();
  try {
    const row = await prisma.rateLimit.findUnique({
      where: { key_windowStart: { key: `ai-tokens:${subject}`, windowStart } },
      select: { count: true },
    });
    return (row?.count ?? 0) >= budget();
  } catch {
    return false; // fail open — see the header comment
  }
}

/** Records what a completed call actually cost. Never throws. */
export async function recordAiSpend(
  subject: string,
  usage: { input_tokens?: number; output_tokens?: number } | null | undefined,
): Promise<void> {
  const tokens = (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0);
  if (tokens <= 0) return;

  const key = `ai-tokens:${subject}`;
  const { windowStart, expiresAt } = windowFor();
  try {
    const row = await prisma.rateLimit.upsert({
      where: { key_windowStart: { key, windowStart } },
      update: { count: { increment: tokens } },
      create: { key, windowStart, expiresAt, count: tokens },
      select: { count: true },
    });

    // Worth knowing about before the refusals start, not after.
    const limit = budget();
    if (row.count >= limit * 0.8 && row.count - tokens < limit * 0.8) {
      logWarn("ai.budget_80_percent", { subject, used: row.count, limit });
    }
  } catch {
    // Losing one call's accounting is not worth failing the user's request.
  }
}

/** What a caller shows when the budget is gone. */
export const AI_BUDGET_MESSAGE =
  "You've used this month's AI allowance. It resets automatically — everything else in the app works as normal.";
