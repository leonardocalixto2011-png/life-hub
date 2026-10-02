-- Links a deadline to the trip whose imported plan created it, so deleting the
-- trip can remove its reminders instead of leaving them to fire for a trip
-- that no longer exists.
--
-- Additive and nullable: existing deadlines keep tripId NULL (deleteTrip
-- matches those conservatively by title + day against the built-in plans).
--
-- No RLS change. deadline_hub_and_privacy_isolation is written on hubId /
-- visibility / createdById and does not look at this column; the foreign-key
-- check and its ON DELETE SET NULL run as referential-integrity triggers,
-- which Postgres executes outside row security.
ALTER TABLE "Deadline" ADD COLUMN "tripId" TEXT;

CREATE INDEX "Deadline_tripId_idx" ON "Deadline"("tripId");

ALTER TABLE "Deadline"
  ADD CONSTRAINT "Deadline_tripId_fkey"
  FOREIGN KEY ("tripId") REFERENCES "Trip"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
