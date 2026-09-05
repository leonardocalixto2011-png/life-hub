import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * AES-256-GCM at-rest encryption for mail-connector OAuth tokens
 * (MailAccount.accessTokenEnc/refreshTokenEnc) — these are real bearer
 * credentials for reading someone's inbox, so they never touch the database
 * in plaintext. Key from MAIL_TOKEN_ENCRYPTION_KEY (`npm run gen:mail-key`).
 *
 * Ciphertext format: base64(iv [12 bytes] || authTag [16 bytes] || ciphertext).
 */

function getKey(): Buffer {
  const b64 = process.env.MAIL_TOKEN_ENCRYPTION_KEY;
  if (!b64) throw new Error("MAIL_TOKEN_ENCRYPTION_KEY is not set — run `npm run gen:mail-key`.");
  const key = Buffer.from(b64, "base64");
  if (key.length !== 32) {
    throw new Error("MAIL_TOKEN_ENCRYPTION_KEY must decode to 32 bytes (AES-256).");
  }
  return key;
}

export function encrypt(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, ciphertext]).toString("base64");
}

export function decrypt(encoded: string): string {
  const raw = Buffer.from(encoded, "base64");
  const iv = raw.subarray(0, 12);
  const authTag = raw.subarray(12, 28);
  const ciphertext = raw.subarray(28);
  const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}
