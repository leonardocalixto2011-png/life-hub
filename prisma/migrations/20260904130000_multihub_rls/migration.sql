-- Row-Level Security: structural hub isolation + private-item isolation.
--
-- IMPORTANT: Postgres RLS does not apply to a table's OWNER by default. This
-- project's migrations run as the Neon "owner" role (neondb_owner), which
-- means these policies only actually protect anything once the application's
-- RUNTIME queries run as a *different*, non-owning role. See
-- prisma/create-app-role.sql for that role + its grants, and
-- src/lib/hub-context.ts for how the app sets `app.user_id` per request.
-- Migrations/seed/backfill scripts keep using the owner role (which bypasses
-- RLS, exactly as needed for admin operations) via DATABASE_URL/DIRECT_URL;
-- the app's Prisma client at runtime uses APP_DATABASE_URL (the new role).
--
-- A policy's USING clause querying "HubMembership" from another table's
-- policy (e.g. Task's) is the standard, safe pattern — it is a different
-- table, no recursion. HubMembership's own policy is scoped by userId only
-- (see below) so it never has to query itself for a wider set. One consequence:
-- creating a HubMembership row for someone ELSE (inviting them) can't go
-- through the app_user/withHub path — that write has to use the owner-role
-- client, same as hub/venture creation. Noted for the invite flow (Step C).
--
-- USING governs which existing rows a query can see/affect (SELECT/UPDATE/
-- DELETE); WITH CHECK governs what a write is allowed to leave behind
-- (INSERT/UPDATE) — without it, RLS only guards reads and a write could still
-- create a row outside the hub the connection is scoped to.

ALTER TABLE "HubMembership" ENABLE ROW LEVEL SECURITY;
CREATE POLICY hub_membership_visible_to_self ON "HubMembership"
USING ("userId" = current_setting('app.user_id', true))
WITH CHECK ("userId" = current_setting('app.user_id', true));

ALTER TABLE "Venture" ENABLE ROW LEVEL SECURITY;
CREATE POLICY venture_hub_isolation ON "Venture"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);

ALTER TABLE "Subscription" ENABLE ROW LEVEL SECURITY;
CREATE POLICY subscription_hub_isolation ON "Subscription"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);

ALTER TABLE "BudgetEntry" ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_entry_hub_isolation ON "BudgetEntry"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);

ALTER TABLE "Task" ENABLE ROW LEVEL SECURITY;
CREATE POLICY task_hub_and_privacy_isolation ON "Task"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND ("visibility" = 'SHARED' OR "createdById" = current_setting('app.user_id', true))
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);

ALTER TABLE "Deadline" ENABLE ROW LEVEL SECURITY;
CREATE POLICY deadline_hub_and_privacy_isolation ON "Deadline"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND ("visibility" = 'SHARED' OR "createdById" = current_setting('app.user_id', true))
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);

ALTER TABLE "Event" ENABLE ROW LEVEL SECURITY;
CREATE POLICY event_hub_and_privacy_isolation ON "Event"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND ("visibility" = 'SHARED' OR "createdById" = current_setting('app.user_id', true))
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);
