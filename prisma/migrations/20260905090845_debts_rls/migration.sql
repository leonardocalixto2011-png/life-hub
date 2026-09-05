ALTER TABLE "Debt" ENABLE ROW LEVEL SECURITY;
CREATE POLICY debt_hub_isolation ON "Debt"
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
