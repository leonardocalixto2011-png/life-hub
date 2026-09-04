-- CreateEnum
CREATE TYPE "HubRole" AS ENUM ('OWNER', 'MEMBER');

-- CreateEnum
CREATE TYPE "MembershipStatus" AS ENUM ('INVITED', 'ACTIVE');

-- CreateEnum
CREATE TYPE "Visibility" AS ENUM ('PRIVATE', 'SHARED');

-- DropIndex
DROP INDEX "Venture_slug_key";

-- DropIndex
DROP INDEX "Task_status_dueDate_idx";

-- DropIndex
DROP INDEX "Deadline_dueDate_idx";

-- DropIndex
DROP INDEX "Subscription_status_renewalDate_idx";

-- DropIndex
DROP INDEX "BudgetEntry_date_idx";

-- DropIndex
DROP INDEX "BudgetEntry_type_date_idx";

-- DropIndex
DROP INDEX "Event_startAt_idx";

-- AlterTable
ALTER TABLE "Venture" ADD COLUMN     "hubId" TEXT;

-- AlterTable
ALTER TABLE "Task" ADD COLUMN     "hubId" TEXT,
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'SHARED';

-- AlterTable
ALTER TABLE "Deadline" ADD COLUMN     "hubId" TEXT,
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'SHARED';

-- AlterTable
ALTER TABLE "Subscription" ADD COLUMN     "hubId" TEXT;

-- AlterTable
ALTER TABLE "BudgetEntry" ADD COLUMN     "hubId" TEXT;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "hubId" TEXT,
ADD COLUMN     "visibility" "Visibility" NOT NULL DEFAULT 'SHARED';

-- CreateTable
CREATE TABLE "Hub" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT NOT NULL DEFAULT '#6366f1',
    "plan" TEXT NOT NULL DEFAULT 'free',
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Hub_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HubMembership" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "HubRole" NOT NULL DEFAULT 'MEMBER',
    "status" "MembershipStatus" NOT NULL DEFAULT 'INVITED',
    "joinedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HubMembership_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "HubMembership_userId_status_idx" ON "HubMembership"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "HubMembership_hubId_userId_key" ON "HubMembership"("hubId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Venture_hubId_slug_key" ON "Venture"("hubId", "slug");

-- CreateIndex
CREATE INDEX "Task_hubId_status_dueDate_idx" ON "Task"("hubId", "status", "dueDate");

-- CreateIndex
CREATE INDEX "Deadline_hubId_dueDate_idx" ON "Deadline"("hubId", "dueDate");

-- CreateIndex
CREATE INDEX "Subscription_hubId_status_renewalDate_idx" ON "Subscription"("hubId", "status", "renewalDate");

-- CreateIndex
CREATE INDEX "BudgetEntry_hubId_date_idx" ON "BudgetEntry"("hubId", "date");

-- CreateIndex
CREATE INDEX "BudgetEntry_hubId_type_date_idx" ON "BudgetEntry"("hubId", "type", "date");

-- CreateIndex
CREATE INDEX "Event_hubId_startAt_idx" ON "Event"("hubId", "startAt");

-- AddForeignKey
ALTER TABLE "Hub" ADD CONSTRAINT "Hub_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMembership" ADD CONSTRAINT "HubMembership_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "HubMembership" ADD CONSTRAINT "HubMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venture" ADD CONSTRAINT "Venture_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Task" ADD CONSTRAINT "Task_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Deadline" ADD CONSTRAINT "Deadline_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Subscription" ADD CONSTRAINT "Subscription_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetEntry" ADD CONSTRAINT "BudgetEntry_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

