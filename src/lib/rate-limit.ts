import { prisma } from "@/lib/prisma";

/**
 * Fixed-window rate limiting, backed by Postgres.
 *
 * Not in-memory: Vercel runs many short-lived instances, so a per-process
 * counter resets constantly and limits nothing. Not Redis either — that's an
 * extra service and account, and at this app's volume a single indexed upsert
 * per attempt is cheap. Swap in Upstash if request volume ever makes the write
 * traffic matter; the call sites won't change.
 *
 * Fixed-window (not sliding) is deliberate: it can allow up to 2x the limit
 * across a window boundary, which is fine for the abuse this guards against
 * (email/API-cost flooding) and keeps it to one round trip.
 */

export type RateLimitResult = { ok: boolean; retryAfterSeconds: number };

/**
 * @param key    what's being limited — caller namespaces it, e.g.
 *               `magic-link:someone@example.com` or `ai:<userId>`.
 * @param limit  attempts allowed per window.
 * @param windowSeconds  window length.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(Math.floor(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000);
  const expiresAt = new Date(windowStart.getTime() + windowSeconds * 1000);

  try {
    const row = await prisma.rateLimit.upsert({
      where: { key_windowStart: { key, windowStart } },
      update: { count: { increment: 1 } },
      create: { key, windowStart, expiresAt, count: 1 },
      select: { count: true },
    });

    if (row.count > limit) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((expiresAt.getTime() - now.getTime()) / 1000)),
      };
    }
    return { ok: true, retryAfterSeconds: 0 };
  } catch {
    // Fail OPEN, deliberately. This limiter protects against cost and spam,
    // not against unauthorised access — every call site is already behind its
    // own auth check. Failing closed would turn a database blip into a
    // total login outage, which is the worse failure.
    return { ok: true, retryAfterSeconds: 0 };
  }
}

/** Deletes expired windows. Called from the daily cron; nothing depends on it running promptly. */
export async function pruneRateLimits(): Promise<number> {
  const { count } = await prisma.rateLimit.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return count;
}
