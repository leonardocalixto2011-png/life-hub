-- What a trip item really cost, next to the plan's estimate. Additive and
-- nullable; TripItem's RLS policy covers the new column unchanged.
ALTER TABLE "TripItem" ADD COLUMN "paidCents" INTEGER;
