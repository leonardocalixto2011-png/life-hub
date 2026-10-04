-- Review items with no hub were visible to EVERY signed-in user: the old
-- manual-forward path created them before inbound mail was routed per hub,
-- and the policy let a NULL hubId through so those rows stayed reachable.
-- Nothing creates hub-less rows any more (/api/inbound rejects unroutable
-- mail), and before public signup a row like that would show one person's
-- parsed email to strangers. The NULL arm goes from both clauses.
--
-- Existing hub-less rows are not deleted here; they simply become invisible
-- and the 90-day retention sweep (src/lib/retention.ts) removes them.

DROP POLICY IF EXISTS review_item_hub_isolation ON "ReviewItem";
CREATE POLICY review_item_hub_isolation ON "ReviewItem"
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
