import { randomInt } from "node:crypto";

/**
 * Hub join codes — what a person types (or the link they open) to ASK to join
 * a hub. Hubs are never listed or searchable: the only way to find one is to
 * be given its code by someone inside, and even then the code only files a
 * request that an owner approves or declines.
 *
 * Eight characters of Crockford's base32 (no I, L, O or U, so nothing reads
 * as another letter or a digit), shown as ABCD-EFGH. 32^8 ≈ 1.1 × 10^12
 * codes, and lookups are rate-limited per person, so guessing one is not a
 * way in — and a guessed code still only produces a request.
 */

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const JOIN_CODE_LENGTH = 8;

export function newJoinCode(): string {
  let code = "";
  for (let i = 0; i < JOIN_CODE_LENGTH; i++) code += ALPHABET[randomInt(ALPHABET.length)];
  return code;
}

/**
 * What someone typed → the stored form, or null if it can't be a code.
 * Forgiving the way Crockford intends: case, dashes and spaces don't matter,
 * and O/I/L are read as the digits they look like.
 */
export function normalizeJoinCode(input: string): string | null {
  const s = input
    .toUpperCase()
    .replace(/[\s-]/g, "")
    .replace(/O/g, "0")
    .replace(/[IL]/g, "1");
  if (s.length !== JOIN_CODE_LENGTH) return null;
  for (const ch of s) if (!ALPHABET.includes(ch)) return null;
  return s;
}

/** "ABCD-EFGH" */
export function formatJoinCode(code: string): string {
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}
