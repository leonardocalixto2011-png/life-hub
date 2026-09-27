-- How much has been put aside for a trip, shown as a progress bar against
-- its budget on the trip page.
--
-- Additive with a default, so no backfill: existing trips start at 0.
-- No RLS change: it is an ordinary column on a Trip row, already covered by
-- trip_hub_and_privacy_isolation.
ALTER TABLE "Trip" ADD COLUMN "savedCents" INTEGER NOT NULL DEFAULT 0;
