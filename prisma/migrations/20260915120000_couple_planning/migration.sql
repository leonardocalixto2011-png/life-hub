-- Couple & household planning: hub-scoped debts need no schema change; this adds
-- occasions toggle, work shifts (Event.kind/personId), shared expenses on
-- BudgetEntry, SpecialDate, Trip, TripItem and BudgetTarget.

-- CreateEnum
CREATE TYPE "EventKind" AS ENUM ('EVENT', 'SHIFT');

-- CreateEnum
CREATE TYPE "SpecialDateKind" AS ENUM ('BIRTHDAY', 'ANNIVERSARY', 'OTHER');

-- CreateEnum
CREATE TYPE "TripItemKind" AS ENUM ('BOOK', 'TODO', 'PACK');

-- AlterTable
ALTER TABLE "BudgetEntry" ADD COLUMN     "isSettlement" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "paidById" TEXT,
ADD COLUMN     "payerSharePct" INTEGER;

-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "kind" "EventKind" NOT NULL DEFAULT 'EVENT',
ADD COLUMN     "personId" TEXT;

-- AlterTable
ALTER TABLE "Hub" ADD COLUMN     "showOccasions" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "SpecialDate" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'SHARED',
    "title" TEXT NOT NULL,
    "kind" "SpecialDateKind" NOT NULL DEFAULT 'OTHER',
    "month" INTEGER NOT NULL,
    "day" INTEGER NOT NULL,
    "year" INTEGER,
    "remindDaysBefore" INTEGER[] DEFAULT ARRAY[7, 1]::INTEGER[],
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SpecialDate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Trip" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "visibility" "Visibility" NOT NULL DEFAULT 'SHARED',
    "title" TEXT NOT NULL,
    "destination" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "budgetCents" INTEGER,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Trip_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TripItem" (
    "id" TEXT NOT NULL,
    "tripId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "kind" "TripItemKind" NOT NULL DEFAULT 'TODO',
    "title" TEXT NOT NULL,
    "costCents" INTEGER,
    "done" BOOLEAN NOT NULL DEFAULT false,
    "assignedToId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TripItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BudgetTarget" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "monthlyCents" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BudgetTarget_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "SpecialDate_hubId_month_day_idx" ON "SpecialDate"("hubId", "month", "day");

-- CreateIndex
CREATE INDEX "Trip_hubId_startDate_idx" ON "Trip"("hubId", "startDate");

-- CreateIndex
CREATE INDEX "TripItem_tripId_kind_idx" ON "TripItem"("tripId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "BudgetTarget_hubId_category_key" ON "BudgetTarget"("hubId", "category");

-- CreateIndex
CREATE INDEX "Event_hubId_kind_startAt_idx" ON "Event"("hubId", "kind", "startAt");

-- AddForeignKey
ALTER TABLE "SpecialDate" ADD CONSTRAINT "SpecialDate_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SpecialDate" ADD CONSTRAINT "SpecialDate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Trip" ADD CONSTRAINT "Trip_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_tripId_fkey" FOREIGN KEY ("tripId") REFERENCES "Trip"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TripItem" ADD CONSTRAINT "TripItem_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BudgetTarget" ADD CONSTRAINT "BudgetTarget_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Row-level security for the planning tables. SpecialDate and Trip use the
-- same hub + privacy policy body as Event/Deadline/Task; BudgetTarget is
-- hub-only like BudgetEntry. TripItem additionally requires its parent Trip to
-- be visible: the EXISTS runs under Trip's own policy, so a private trip's
-- checklist is exactly as private as the trip. New tables pick up app_user's
-- grants from the ALTER DEFAULT PRIVILEGES in prisma/create-app-role.sql.
-- ---------------------------------------------------------------------------

ALTER TABLE "SpecialDate" ENABLE ROW LEVEL SECURITY;
CREATE POLICY special_date_hub_and_privacy_isolation ON "SpecialDate"
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

ALTER TABLE "Trip" ENABLE ROW LEVEL SECURITY;
CREATE POLICY trip_hub_and_privacy_isolation ON "Trip"
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

ALTER TABLE "TripItem" ENABLE ROW LEVEL SECURITY;
CREATE POLICY trip_item_via_visible_trip ON "TripItem"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND EXISTS (
    SELECT 1 FROM "Trip" t WHERE t."id" = "TripItem"."tripId" AND t."hubId" = "TripItem"."hubId"
  )
)
WITH CHECK (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
  AND EXISTS (
    SELECT 1 FROM "Trip" t WHERE t."id" = "TripItem"."tripId" AND t."hubId" = "TripItem"."hubId"
  )
);

ALTER TABLE "BudgetTarget" ENABLE ROW LEVEL SECURITY;
CREATE POLICY budget_target_hub_isolation ON "BudgetTarget"
USING (
  "hubId" IN (
    SELECT "hubId" FROM "HubMembership"
    WHERE "userId" = current_setting('app.user_id', true) AND status = 'ACTIVE'
  )
);