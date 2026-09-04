import { PrismaClient } from "@prisma/client";

// Single client across hot-reloads in dev.
const globalForPrisma = globalThis as unknown as {
  prisma?: PrismaClient;
  appPrisma?: PrismaClient;
};

/**
 * Owner-role client (DATABASE_URL). Bypasses RLS by table-ownership — used
 * only by migrations, seed.ts, and prisma/backfill-hubs.ts. Not used by app
 * request-handling code once the multi-hub rework lands (see appPrisma).
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

/**
 * Low-privilege runtime client (APP_DATABASE_URL) — the role RLS policies
 * actually apply to. All request-handling queries go through this, wrapped in
 * withHub() (src/lib/hub-context.ts) so `app.user_id` is set per request.
 * Falls back to the owner connection when APP_DATABASE_URL isn't configured
 * yet (RLS is then a no-op, same as before this migration existed).
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
