-- Favourites: one-tap repeat entries under quick-add. Additive.
-- CreateEnum
CREATE TYPE "FavoriteKind" AS ENUM ('TASK', 'BUDGET', 'EVENT');

-- CreateTable
CREATE TABLE "QuickFavorite" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "kind" "FavoriteKind" NOT NULL DEFAULT 'BUDGET',
    "amountCents" INTEGER,
    "category" TEXT,
    "ventureId" TEXT,
    "entryType" "EntryType" NOT NULL DEFAULT 'EXPENSE',
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "QuickFavorite_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "QuickFavorite_hubId_createdById_sortOrder_idx" ON "QuickFavorite"("hubId", "createdById", "sortOrder");

-- AddForeignKey
ALTER TABLE "QuickFavorite" ADD CONSTRAINT "QuickFavorite_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickFavorite" ADD CONSTRAINT "QuickFavorite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QuickFavorite" ADD CONSTRAINT "QuickFavorite_ventureId_fkey" FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Row-level security. Favourites are personal: the creator alone reads,
-- inserts, edits or deletes them, and only inside a hub they are an ACTIVE
-- member of — the Task/Event hub clause with the privacy half narrowed from
-- "SHARED or mine" to just "mine". One policy is enough here (unlike Debt's
-- per-command split): USING and WITH CHECK are the same owner-only condition,
-- so no command can be authorised by a looser read rule.
-- ---------------------------------------------------------------------------

ALTER TABLE "QuickFavorite" ENABLE ROW LEVEL SECURITY;
CREATE POLICY quick_favorite_own ON "QuickFavorite"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND "createdById" = current_setting('app.user_id', true)
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND "createdById" = current_setting('app.user_id', true)
);

-- app_user normally inherits this from the ALTER DEFAULT PRIVILEGES in
-- prisma/create-app-role.sql; granted explicitly too, guarded so a database
-- without the role (a fresh shadow DB) still migrates.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON "QuickFavorite" TO app_user;
  END IF;
END
$$;
