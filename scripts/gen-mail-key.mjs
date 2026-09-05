// Generates the AES-256-GCM key used to encrypt mail-connector OAuth tokens
// at rest (src/lib/mail/crypto.ts). Usage: npm run gen:mail-key
import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64");

console.log("\nAdd this to .env (and to the Vercel project for production):\n");
console.log(`MAIL_TOKEN_ENCRYPTION_KEY=${key}\n`);
console.log("Also generate MAIL_POLL_SECRET — any long random string works, e.g.:");
console.log(`MAIL_POLL_SECRET=${randomBytes(24).toString("hex")}\n`);
