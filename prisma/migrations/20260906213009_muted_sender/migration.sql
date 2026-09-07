-- Per-hub sender mute: never spend a classification call on mail from this
-- address. The inverse of TrustedSender.
--
-- The header prefilter already skips obvious bulk, but it deliberately
-- classifies anything mentioning money or a date so a real bill is never
-- missed. That leaves a gap: a sender who is never actionable still costs a
-- call whenever they quote a price — a job board listing a salary, a delivery
-- app advertising a discount. Muting is exact where the heuristic can't be.
CREATE TABLE "MutedSender" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MutedSender_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "MutedSender_hubId_idx" ON "MutedSender"("hubId");

CREATE UNIQUE INDEX "MutedSender_hubId_fromAddress_key" ON "MutedSender"("hubId", "fromAddress");

ALTER TABLE "MutedSender" ADD CONSTRAINT "MutedSender_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS, matching the pattern every other hub-scoped table uses.
ALTER TABLE "MutedSender" ENABLE ROW LEVEL SECURITY;

CREATE POLICY muted_sender_hub_isolation ON "MutedSender"
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
