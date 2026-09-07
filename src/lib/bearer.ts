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

  const expected = Buffer.from(`Bearer ${secret}`, "utf8");
  const actual = Buffer.from(header, "utf8");
  // timingSafeEqual throws on a length mismatch, so length is compared first
  // and does leak. That is unavoidable and uninteresting: the length of the
  // expected header is not the secret.
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
