import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

import { prisma } from "@/lib/prisma";

/**
 * Optional passwords. The emailed link still works for everyone and is still
 * how an address is proven; a password is a faster way back in for someone
 * who already has an account (and who doesn't want to wait on an inbox).
 *
 * scrypt from Node's own crypto, no dependency. The stored string carries its
 * parameters (scrypt$N$r$p$salt$hash) so they can be raised later without
 * breaking existing hashes: verify reads them back from the string.
 */

const scrypt = promisify(scryptCb) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>;

const N = 16384;
const R = 8;
const P = 1;
const KEYLEN = 64;
const MAXMEM = 64 * 1024 * 1024;

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64url")}$${key.toString("base64url")}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, keyB64] = parts;
  const expected = Buffer.from(keyB64, "base64url");
  const key = await scrypt(password.normalize("NFKC"), Buffer.from(saltB64, "base64url"), expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: MAXMEM,
  });
  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Burns the same time as a real check, so a missing account or a missing
 *  password can't be told apart from a wrong one by how fast the answer comes. */
let dummy: string | null = null;
export async function verifyAgainstNothing(password: string): Promise<false> {
  dummy ??= await hashPassword("not-a-real-password");
  await verifyPassword(password, dummy);
  return false;
}

/**
 * Length is the only rule (NIST 800-63B): composition rules make passwords
 * harder to remember without making them stronger. Also refuses the address
 * itself and the handful of passwords every list starts with.
 */
const TOO_COMMON = new Set([
  "password", "motdepasse", "12345678", "123456789", "1234567890", "qwertyui", "azertyui",
  "11111111", "00000000", "iloveyou", "password1", "lifehub1", "lifehub123",
]);

export function passwordProblem(password: string, email?: string | null): string | null {
  if (password.length < PASSWORD_MIN) return "Use at least 8 characters.";
  if (password.length > PASSWORD_MAX) return "Keep it under 128 characters.";
  const lower = password.toLowerCase();
  if (TOO_COMMON.has(lower)) return "That password is too common. Pick another.";
  if (email && (lower === email.toLowerCase() || lower === email.split("@")[0].toLowerCase())) {
    return "Don't use your email address as your password.";
  }
  return null;
}

export async function hasPassword(userId: string): Promise<boolean> {
  return (await prisma.userPassword.count({ where: { userId } })) > 0;
}

export async function setPasswordFor(userId: string, password: string): Promise<void> {
  const hash = await hashPassword(password);
  await prisma.userPassword.upsert({ where: { userId }, update: { hash }, create: { userId, hash } });
}
