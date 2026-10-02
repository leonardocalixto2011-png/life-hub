-- Activity feed: "who did what" in a hub. Additive only — one new enum, one
-- new table, no change to any existing table.

-- CreateEnum
CREATE TYPE "ActivityVerb" AS ENUM ('TASK_ADDED', 'TASK_DONE', 'TASK_ASSIGNED', 'EVENT_ADDED', 'DEADLINE_ADDED', 'DEADLINE_DONE', 'EXPENSE_ADDED', 'SETTLED_UP', 'TRIP_ADDED', 'TRIP_ITEM_DONE', 'MEMBER_JOINED');

-- CreateTable
CREATE TABLE "Activity" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "verb" "ActivityVerb" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT,
    "summary" TEXT NOT NULL,
    "amountCents" INTEGER,
    "targetId" TEXT,
    "visibility" "Visibility" NOT NULL DEFAULT 'SHARED',
    "thankedById" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Activity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Activity_hubId_createdAt_idx" ON "Activity"("hubId", "createdAt");

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Activity" ADD CONSTRAINT "Activity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level security.
--
-- READ mirrors Event/Task/Deadline exactly: an ACTIVE member of the hub, AND
-- (the line is SHARED, or the viewer is the one who did it). A PRIVATE item's
-- activity copies that item's visibility, so it is never shown to anyone else.
--
-- The policy is split per command, like Debt's, because the read condition is
-- deliberately looser than what a member may WRITE:
--   INSERT  only in your own name (actorId = you). One combined policy would
--           let any member plant "Chantelle did X".
--   UPDATE  any member, on a line they can see — this is the "merci" reaction
--           — but the app role holds UPDATE on the "thankedById" column ONLY
--           (see the grants below), so a line's text can't be rewritten.
--   DELETE  your own lines only (leaving a hub, undo). Retention and account
--           erasure run as the owner role.
-- ---------------------------------------------------------------------------

ALTER TABLE "Activity" ENABLE ROW LEVEL SECURITY;

CREATE POLICY activity_select ON "Activity" FOR SELECT
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND ("visibility" = 'SHARED' OR "actorId" = current_setting('app.user_id', true))
);

CREATE POLICY activity_insert ON "Activity" FOR INSERT
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND "actorId" = current_setting('app.user_id', true)
);

CREATE POLICY activity_update ON "Activity" FOR UPDATE
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND ("visibility" = 'SHARED' OR "actorId" = current_setting('app.user_id', true))
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);

CREATE POLICY activity_delete ON "Activity" FOR DELETE
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND "actorId" = current_setting('app.user_id', true)
);

-- app_user normally inherits table grants from the ALTER DEFAULT PRIVILEGES in
-- prisma/create-app-role.sql; granted explicitly too, guarded so a database
-- without the role (a fresh shadow DB) still migrates. UPDATE is narrowed to
-- the one column the reaction needs: a table-level UPDATE would let any member
-- edit another person's line through the permissive activity_update policy.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, DELETE ON "Activity" TO app_user;
    REVOKE UPDATE ON "Activity" FROM app_user;
    GRANT UPDATE ("thankedById") ON "Activity" TO app_user;
  END IF;
END
$$;
