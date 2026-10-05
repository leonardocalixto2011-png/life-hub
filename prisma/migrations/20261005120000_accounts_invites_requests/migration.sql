-- Accounts: app-level invitations, usernames, profile photos, join requests,
-- email changes. Additive only.
--
-- Note on the enum: Postgres allows ADD VALUE inside the migration's
-- transaction, but the new value can't be used in that same transaction —
-- nothing below uses it.

-- AlterEnum
ALTER TYPE "MembershipStatus" ADD VALUE 'REQUESTED';

-- AlterTable
ALTER TABLE "Hub" ADD COLUMN     "joinCode" TEXT;

-- AlterTable
ALTER TABLE "HubMembership" ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "requestNote" TEXT;

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "avatarUrl" TEXT,
ADD COLUMN     "invitedById" TEXT,
ADD COLUMN     "username" TEXT;

-- CreateTable
CREATE TABLE "AppInvite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "email" TEXT,
    "claimedEmail" TEXT,
    "hubId" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "usedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppInvite_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailChange" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "newEmail" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailChange_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AppInvite_tokenHash_key" ON "AppInvite"("tokenHash");

-- CreateIndex
CREATE INDEX "AppInvite_createdById_createdAt_idx" ON "AppInvite"("createdById", "createdAt");

-- CreateIndex
CREATE INDEX "AppInvite_email_idx" ON "AppInvite"("email");

-- CreateIndex
CREATE INDEX "AppInvite_claimedEmail_idx" ON "AppInvite"("claimedEmail");

-- CreateIndex
CREATE UNIQUE INDEX "EmailChange_tokenHash_key" ON "EmailChange"("tokenHash");

-- CreateIndex
CREATE INDEX "EmailChange_userId_idx" ON "EmailChange"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Hub_joinCode_key" ON "Hub"("joinCode");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInvite" ADD CONSTRAINT "AppInvite_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInvite" ADD CONSTRAINT "AppInvite_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AppInvite" ADD CONSTRAINT "AppInvite_usedById_fkey" FOREIGN KEY ("usedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailChange" ADD CONSTRAINT "EmailChange_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMembership" ADD CONSTRAINT "HubMembership_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Row-level security. AppInvite and EmailChange hold email addresses of
-- people who may not have an account, and token hashes. Every read and write
-- of them is done by server code on the owner-role client after its own
-- checks (lib/app-invites.ts, (app)/account/email). The app role has no
-- reason to touch them at all, so it gets no privileges, and RLS is enabled
-- with no policy as a second wall: even a grant added by accident (re-running
-- create-app-role.sql) reads nothing.
-- ---------------------------------------------------------------------------
ALTER TABLE "AppInvite" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "EmailChange" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "AppInvite" FROM app_user;
    REVOKE ALL ON "EmailChange" FROM app_user;
  END IF;
END
$$;

-- HubMembership keeps hub_membership_visible_to_self unchanged: a REQUESTED
-- row is the requester's own row, readable and deletable (cancel) by them
-- alone. Approving one is an owner writing someone else's row, which already
-- runs on the owner-role client after requireHubOwner(), like inviting.
