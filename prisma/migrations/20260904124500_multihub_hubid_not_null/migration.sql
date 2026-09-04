-- Run only after prisma/backfill-hubs.ts has populated hubId on every existing
-- row. Makes hub membership mandatory for all content going forward.

ALTER TABLE "Venture" ALTER COLUMN "hubId" SET NOT NULL;
ALTER TABLE "Task" ALTER COLUMN "hubId" SET NOT NULL;
ALTER TABLE "Deadline" ALTER COLUMN "hubId" SET NOT NULL;
ALTER TABLE "Subscription" ALTER COLUMN "hubId" SET NOT NULL;
ALTER TABLE "BudgetEntry" ALTER COLUMN "hubId" SET NOT NULL;
ALTER TABLE "Event" ALTER COLUMN "hubId" SET NOT NULL;
