-- Fixed-window rate-limit counters (src/lib/rate-limit.ts).
--
-- Deliberately NOT under RLS and not hub-scoped: rows are written by the
-- server before a user is authenticated at all (magic-link requests), so
-- there is no app.user_id to police them by. Written via the owner client and
-- never read back into a user-facing surface.
CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "windowStart" TIMESTAMP(3) NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "RateLimit_expiresAt_idx" ON "RateLimit"("expiresAt");

-- The upsert target: one row per (key, window).
CREATE UNIQUE INDEX "RateLimit_key_windowStart_key" ON "RateLimit"("key", "windowStart");
