-- Trips become a full itinerary: where you sleep each night (STOP), what to do
-- each day (ACTIVITY), and a savings schedule (SAVE), next to the existing
-- BOOK / TODO / PACK checklists. Everything stays a TripItem row so the
-- trip_item_via_visible_trip policy covers it unchanged: no new table, no new
-- RLS policy, and a private trip's itinerary is exactly as private as the trip.
--
-- Additive: new enum values and nullable columns, no backfill.
ALTER TYPE "TripItemKind" ADD VALUE 'ACTIVITY';
ALTER TYPE "TripItemKind" ADD VALUE 'SAVE';
ALTER TYPE "TripItemKind" ADD VALUE 'STOP';

ALTER TABLE "TripItem" ADD COLUMN "date" TIMESTAMP(3),
ADD COLUMN "endDate" TIMESTAMP(3),
ADD COLUMN "note" TEXT;
