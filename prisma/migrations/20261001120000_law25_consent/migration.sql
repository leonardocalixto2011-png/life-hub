-- Québec Law 25: consent ledger, first-use AI notice flag, member emails
-- hidden by default. Additive only.

-- CreateEnum
CREATE TYPE "ConsentKind" AS ENUM ('DEBTS_SENSITIVE', 'DEBT_SHARE', 'MAIL_AI', 'AGE_14', 'AGE_18');

-- AlterTable
ALTER TABLE "User" ADD COLUMN "aiNoticeAt" TIMESTAMP(3);

-- AlterTable: other members see a person's name only, unless they opt in per hub.
ALTER TABLE "HubMembership" ADD COLUMN "showEmail" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "Consent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kind" "ConsentKind" NOT NULL,
    "hubId" TEXT,
    "grantedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "policyVersion" TEXT NOT NULL,

    CONSTRAINT "Consent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Consent_userId_kind_hubId_idx" ON "Consent"("userId", "kind", "hubId");

-- AddForeignKey
ALTER TABLE "Consent" ADD CONSTRAINT "Consent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level security. A consent row is about one person and nobody else: they
-- alone read it, give it and revoke it. Same shape as
-- hub_membership_visible_to_self — USING and WITH CHECK are the identical
-- self-only condition, so no command can be authorised by a looser read rule
-- (the reason Debt's policy had to be split per command does not arise).
--
-- Background jobs that must know whether SOMEONE ELSE consented (the mail
-- poller, /api/inbound) run on the owner-role client, like every other
-- session-less path; they read a yes/no and nothing more.
-- ---------------------------------------------------------------------------

ALTER TABLE "Consent" ENABLE ROW LEVEL SECURITY;
CREATE POLICY consent_self_only ON "Consent"
USING ("userId" = current_setting('app.user_id', true))
WITH CHECK ("userId" = current_setting('app.user_id', true));

-- app_user normally inherits this from the ALTER DEFAULT PRIVILEGES in
-- prisma/create-app-role.sql; granted explicitly too, guarded so a database
-- without the role (a fresh shadow DB) still migrates. No DELETE: the ledger
-- is append-and-revoke. Erasure on account deletion runs as the owner role
-- (ON DELETE CASCADE from "User").
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    GRANT SELECT, INSERT, UPDATE ON "Consent" TO app_user;
    REVOKE DELETE ON "Consent" FROM app_user;
  END IF;
END
$$;

-- ---------------------------------------------------------------------------
-- Grandfathering. Everyone who finished the welcome before this migration was
-- admitted by hand into an invite-only app; they are recorded as 14+ so they
-- are not sent back through /welcome. Accounts that have not onboarded yet
-- attest for themselves there.
--
-- Deliberately NOT backfilled: DEBTS_SENSITIVE, DEBT_SHARE, MAIL_AI, AGE_18.
-- Those are express consents for sensitive information — existing debt owners
-- are asked on their next visit to /debts, existing shares keep working until
-- changed, and connected mailboxes stop being analysed until their owner
-- ticks the box on /mail.
-- ---------------------------------------------------------------------------
INSERT INTO "Consent" ("id", "userId", "kind", "grantedAt", "policyVersion")
SELECT 'gf14_' || u."id", u."id", 'AGE_14', now(), 'grandfathered-2026-10'
FROM "User" u
WHERE u."onboardedAt" IS NOT NULL
  AND u."email" IS NOT NULL;
