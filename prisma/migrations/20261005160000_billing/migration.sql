-- AlterEnum
ALTER TYPE "ConsentKind" ADD VALUE 'PAID_TERMS';

-- CreateEnum
CREATE TYPE "PlanStatus" AS ENUM ('TRIALING', 'ACTIVE', 'PAST_DUE', 'CANCELED', 'COMP');

-- CreateEnum
CREATE TYPE "BillingInterval" AS ENUM ('MONTH', 'YEAR');

-- CreateTable
CREATE TABLE "PlanAccount" (
    "userId" TEXT NOT NULL,
    "status" "PlanStatus" NOT NULL,
    "interval" "BillingInterval",
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "currentPeriodEnd" TIMESTAMP(3),
    "cancelAtPeriodEnd" BOOLEAN NOT NULL DEFAULT false,
    "trialEndsAt" TIMESTAMP(3),
    "trialUsedAt" TIMESTAMP(3),
    "trialNoticeSentAt" TIMESTAMP(3),
    "compUntil" TIMESTAMP(3),
    "compNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PlanAccount_pkey" PRIMARY KEY ("userId")
);

-- CreateTable
CREATE TABLE "BillingEvent" (
    "id" TEXT NOT NULL,
    "stripeEventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "userId" TEXT,
    "amountCents" INTEGER NOT NULL DEFAULT 0,
    "feeCents" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'cad',
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BillingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PlanAccount_stripeCustomerId_key" ON "PlanAccount"("stripeCustomerId");
CREATE UNIQUE INDEX "PlanAccount_stripeSubscriptionId_key" ON "PlanAccount"("stripeSubscriptionId");
CREATE INDEX "PlanAccount_status_idx" ON "PlanAccount"("status");
CREATE UNIQUE INDEX "BillingEvent_stripeEventId_key" ON "BillingEvent"("stripeEventId");
CREATE INDEX "BillingEvent_occurredAt_idx" ON "BillingEvent"("occurredAt");
CREATE INDEX "BillingEvent_userId_idx" ON "BillingEvent"("userId");

-- AddForeignKey
ALTER TABLE "PlanAccount" ADD CONSTRAINT "PlanAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Server-only, like UserPassword and AppInvite: plan checks, the Stripe
-- webhook and the admin finance page run on the owner-role client after their
-- own checks. The app role gets nothing, and RLS with no policy is the second
-- wall. (Re-running prisma/create-app-role.sql re-grants these; re-run this
-- REVOKE afterwards — see CLAUDE.md.)
ALTER TABLE "PlanAccount" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "BillingEvent" ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_user') THEN
    REVOKE ALL ON "PlanAccount" FROM app_user;
    REVOKE ALL ON "BillingEvent" FROM app_user;
  END IF;
END
$$;
