-- RLS for the mail-connector tables, matching the pattern established in
-- 20260904130000_multihub_rls (see that file for the fuller explanation of
-- why this only actually restricts anything once the app connects as the
-- non-owning app_user role).
--
-- ReviewItem's hubId is nullable (the old manual-forward path has no session
-- to resolve a hub from) — a NULL hubId row stays visible to every hub
-- member, matching today's pre-RLS behavior for that path; only rows with a
-- real hubId (everything the mail connector creates) get isolated to that
-- hub's members.

ALTER TABLE "ReviewItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY review_item_hub_isolation ON "ReviewItem"
USING (
  "hubId" IS NULL OR "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
)
WITH CHECK (
  "hubId" IS NULL OR "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);

-- Any active hub member can SEE which mailboxes are connected to their hub
-- (USING), but INSERT/UPDATE additionally requires userId = the acting user
-- (WITH CHECK) — you can connect/reconfigure your own mailbox, not someone
-- else's. DELETE only checks USING, same hub-membership-trust model as every
-- other table here (any hub member can already delete a shared Task/Event/
-- etc.); tightening that further wasn't part of this phase's plan.
ALTER TABLE "MailAccount" ENABLE ROW LEVEL SECURITY;
CREATE POLICY mail_account_hub_isolation ON "MailAccount"
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
  AND "userId" = current_setting('app.user_id', true)
);

ALTER TABLE "TrustedSender" ENABLE ROW LEVEL SECURITY;
CREATE POLICY trusted_sender_hub_isolation ON "TrustedSender"
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
