// Generates a VAPID key pair for Web Push and prints .env-ready lines.
// Usage: npm run gen:vapid
import webpush from "web-push";

const { publicKey, privateKey } = webpush.generateVAPIDKeys();

console.log("\nAdd these to .env (and to the Vercel project for production):\n");
console.log(`NEXT_PUBLIC_VAPID_PUBLIC_KEY=${publicKey}`);
console.log(`VAPID_PRIVATE_KEY=${privateKey}`);
console.log(`VAPID_SUBJECT=mailto:you@example.com   # a real contact address\n`);
