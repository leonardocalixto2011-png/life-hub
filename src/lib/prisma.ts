import { PrismaClient } from "@prisma/client";

// Single client across hot-reloads in dev.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  appPrisma?: PrismaClient;
};

/**
 * Owner-role client (DATABASE_URL). Bypasses RLS by table-ownership.
 *
 * This comment used to claim the owner client was "not used by app
 * request-handling code". That is not true and hasn't been for a while:
 * auth.ts, session.ts, push, rate-limit, notify and the cron routes all query
 * through it. What remains true — and is the rule that matters — is that
 * anything **hub-scoped** must go through appPrisma inside withHub(), because
 * that is the only path RLS policies apply to.
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

/**
 * True when the runtime client is the low-privilege role RLS policies apply
 * to. When false the app is connecting as the table OWNER, which bypasses
 * every policy by ownership — so all isolation rests on the app-level filters
 * alone. Surfaced by /api/health so this is visible rather than assumed.
 */
export const rlsEnforced = Boolean(process.env.APP_DATABASE_URL);

if (!rlsEnforced) {
  // This used to fall back silently, which is the worst possible failure mode
  // for a security control: everything works, nothing warns, and RLS is inert.
  const msg =
    "APP_DATABASE_URL is not set — connecting as the table owner, so ALL RLS policies are bypassed. " +
    "Run prisma/create-app-role.sql and set APP_DATABASE_URL. See CLAUDE.md.";
  if (process.env.REQUIRE_APP_DB === "1") {
    // Opt-in fail-closed. Set this once APP_DATABASE_URL is confirmed working,
    // so a future deploy can never silently drop back to the owner role.
    throw new Error(msg);
  }
  console.error(`[security] ${msg}`);
}

/**
 * Low-privilege runtime client (APP_DATABASE_URL) — the role RLS policies
 * actually apply to. All request-handling queries go through this, wrapped in
 * withHub() (src/lib/hub-context.ts) so `app.user_id` is set per request.
 */
export const appPrisma =
  globalForPrisma.appPrisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    ...(process.env.APP_DATABASE_URL
      ? { datasources: { db: { url: process.env.APP_DATABASE_URL } } }
      : {}),
  });

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.appPrisma = appPrisma;
}
