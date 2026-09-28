import { timingSafeEqual } from "node:crypto";

/**
 * Constant-time check of an `Authorization: Bearer <secret>` header.
 *
 * The three scheduled endpoints (`/api/cron/digest`, `/api/cron/weekly`,
 * `/api/mail/poll`) each compared the header with `===`. JavaScript's string
 * comparison returns as soon as two characters differ, so how long it takes
 * leaks how many leading characters were right. `/api/inbound` already got
 * this right with `timingSafeEqual`; this is the same treatment for the rest,
 * in one place so a fourth endpoint inherits it.
 *
 * How much this matters in practice is debatable — remote timing measurement
 * across the internet is swamped by network jitter, and these secrets are
 * long random strings rather than guessable passwords. It is fixed because it
 * costs nothing, not because an attack was likely.
 *
 * Fails closed when the secret is unset: an endpoint with no configured
 * secret must reject everything, never accept `Bearer undefined`.
 */
export function bearerMatches(req: Request, secret: string | undefined): boolean {
  if (!secret) return false;

  const header = req.headers.get("authorization");
  if (!header) return false;

  return secretMatches(header, `Bearer ${secret}`);
}

/**
 * Constant-time string equality for a shared secret carried somewhere other
 * than `Authorization` (e.g. `/api/inbound`'s `x-inbound-secret` header).
 * Only compares — callers must reject an unset expected secret themselves.
 */
export function secretMatches(provided: string, expected: string): boolean {
  const e = Buffer.from(expected, "utf8");
  const a = Buffer.from(provided, "utf8");
  // timingSafeEqual throws on a length mismatch, so length is compared first
  // and does leak. That is unavoidable and uninteresting: the length of the
  // expected value is not the secret.
  return a.length === e.length && timingSafeEqual(a, e);
}
