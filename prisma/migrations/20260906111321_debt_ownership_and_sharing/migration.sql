-- Debts become person-owned instead of hub-owned.
--
-- Until now a Debt belonged to a hub and every member of that hub could see
-- it (policy debt_hub_isolation). `ownerId` existed but was decorative — it
-- never appeared in a WHERE clause. Now `ownerId` is the access key, and
-- exposure into a hub is an explicit opt-in row in DebtShare.
--
-- Order matters: backfill ownerId BEFORE the NOT NULL, and create the
-- compatibility shares BEFORE swapping the policy, so nothing a member can
-- see today disappears mid-migration.

-- CreateEnum
CREATE TYPE "DebtType" AS ENUM ('CREDIT_CARD', 'LINE_OF_CREDIT', 'LOAN', 'CAR_LOAN', 'BNPL', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentFrequency" AS ENUM ('WEEKLY', 'BIWEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "ShareVisibility" AS ENUM ('SUMMARY', 'FULL');

-- AlterTable: new columns first, all defaulted or nullable so this is safe
ALTER TABLE "Debt" ADD COLUMN     "originalBalanceCents" INTEGER,
ADD COLUMN     "paymentFrequency" "PaymentFrequency" NOT NULL DEFAULT 'MONTHLY',
ADD COLUMN     "type" "DebtType" NOT NULL DEFAULT 'OTHER',
-- Marks rows whose owner this migration GUESSED (see the backfill below), so
-- the app can ask a human to confirm instead of silently asserting it.
ADD COLUMN     "ownerBackfilled" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "DebtShare" (
    "id" TEXT NOT NULL,
    "ownerId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "visibility" "ShareVisibility" NOT NULL DEFAULT 'SUMMARY',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DebtShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DebtShare_hubId_idx" ON "DebtShare"("hubId");

-- CreateIndex
CREATE UNIQUE INDEX "DebtShare_ownerId_hubId_key" ON "DebtShare"("ownerId", "hubId");

-- Backfill: an ownerless debt is attributed to its hub's active OWNER, falling
-- back to whoever created the hub if that membership is missing. This is a
-- best guess by definition — the app surfaces these rows so they can be
-- reassigned (see listDebtsNeedingOwnerReview in src/lib/data.ts).
UPDATE "Debt" d
SET "ownerId" = COALESCE(
  (
    SELECT m."userId" FROM "HubMembership" m
    WHERE m."hubId" = d."hubId" AND m."role" = 'OWNER' AND m."status" = 'ACTIVE'
    ORDER BY m."joinedAt" ASC NULLS LAST
    LIMIT 1
  ),
  (SELECT h."createdById" FROM "Hub" h WHERE h."id" = d."hubId")
),
"ownerBackfilled" = true
WHERE d."ownerId" IS NULL;

-- Anything still ownerless has no hub owner and no hub creator, which cannot
-- happen given Hub.createdById is NOT NULL — but fail loudly rather than let
-- the NOT NULL below abort with a less useful message.
DO $$
DECLARE orphans INT;
BEGIN
  SELECT COUNT(*) INTO orphans FROM "Debt" WHERE "ownerId" IS NULL;
  IF orphans > 0 THEN
    RAISE EXCEPTION 'Cannot make Debt.ownerId NOT NULL: % row(s) have no resolvable owner', orphans;
  END IF;
END $$;

-- Preserve today's visibility: every (owner, hub) pair that already had debts
-- gets a FULL share, so existing hub members keep seeing exactly what they saw
-- before. New debts share nothing by default.
INSERT INTO "DebtShare" ("id", "ownerId", "hubId", "visibility", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, x."ownerId", x."hubId", 'FULL', NOW(), NOW()
FROM (SELECT DISTINCT "ownerId", "hubId" FROM "Debt") x
ON CONFLICT ("ownerId", "hubId") DO NOTHING;

-- Now the column can be locked down.
ALTER TABLE "Debt" DROP CONSTRAINT "Debt_ownerId_fkey";
ALTER TABLE "Debt" ALTER COLUMN "ownerId" SET NOT NULL;

-- CreateIndex
CREATE INDEX "Debt_ownerId_status_idx" ON "Debt"("ownerId", "status");

-- AddForeignKey: Cascade, not SetNull — a debt is personal data, it goes when
-- its owner does.
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtShare" ADD CONSTRAINT "DebtShare_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DebtShare" ADD CONSTRAINT "DebtShare_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

-- Separate policies per command, deliberately.
--
-- A single policy would be wrong: DELETE is authorised by USING alone, so a
-- permissive USING that includes share viewers would let someone delete a
-- debt they were merely allowed to look at. Reading and writing therefore get
-- different conditions — SELECT admits FULL-share viewers, everything else is
-- owner-only.
--
-- SUMMARY appears nowhere below: it grants NO row access at all. Summary
-- totals come from a trusted aggregate (src/lib/debt-sharing.ts) that returns
-- scalars only, so a summary share cannot be peeled open into line items.
DROP POLICY IF EXISTS debt_hub_isolation ON "Debt";

CREATE POLICY debt_select ON "Debt"
FOR SELECT
USING (
  "ownerId" = current_setting('app.user_id', true)
  OR EXISTS (
    SELECT 1
    FROM "DebtShare" s
    JOIN "HubMembership" m ON m."hubId" = s."hubId"
    WHERE s."ownerId" = "Debt"."ownerId"
      AND s."visibility" = 'FULL'
      AND m."userId" = current_setting('app.user_id', true)
      AND m."status" = 'ACTIVE'
  )
);

CREATE POLICY debt_insert ON "Debt"
FOR INSERT
WITH CHECK ("ownerId" = current_setting('app.user_id', true));

CREATE POLICY debt_update ON "Debt"
FOR UPDATE
USING ("ownerId" = current_setting('app.user_id', true))
WITH CHECK ("ownerId" = current_setting('app.user_id', true));

CREATE POLICY debt_delete ON "Debt"
FOR DELETE
USING ("ownerId" = current_setting('app.user_id', true));

-- A member can see that a share exists into a hub they belong to (so the UI
-- can show "Chantelle shares a summary here"), but only the owner can create,
-- change or revoke one.
ALTER TABLE "DebtShare" ENABLE ROW LEVEL SECURITY;

CREATE POLICY debt_share_visible ON "DebtShare"
USING (
  "ownerId" = current_setting('app.user_id', true)
  OR "hubId" IN (
    SELECT m."hubId" FROM "HubMembership" m
    WHERE m."userId" = current_setting('app.user_id', true) AND m."status" = 'ACTIVE'
  )
)
WITH CHECK ("ownerId" = current_setting('app.user_id', true));
