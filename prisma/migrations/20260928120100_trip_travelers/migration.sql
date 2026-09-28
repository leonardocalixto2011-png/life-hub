-- Who's going on a trip (plain member ids). Empty = the whole hub, which is
-- what every existing trip meant. Additive; Trip's RLS policy is unaffected.
ALTER TABLE "Trip" ADD COLUMN "travelerIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
