-- First-run onboarding (/welcome). Additive; columns on "User", which has no
-- RLS policy of its own, so no policy change.
ALTER TABLE "User" ADD COLUMN "onboardedAt" TIMESTAMP(3);
ALTER TABLE "User" ADD COLUMN "interests" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- Everyone who exists before this migration is already using the app and must
-- not be walked through a welcome they don't need. Only accounts created after
-- it start with NULL and see /welcome once.
UPDATE "User" SET "onboardedAt" = now() WHERE "onboardedAt" IS NULL;
