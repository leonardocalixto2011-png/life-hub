-- Photos, links and map places on trip plans. Additive and nullable; TripItem
-- and Trip keep their existing RLS policies (new scalar columns change nothing).
ALTER TABLE "Trip" ADD COLUMN "coverImageUrl" TEXT;
ALTER TABLE "TripItem" ADD COLUMN "imageUrl" TEXT;
ALTER TABLE "TripItem" ADD COLUMN "url" TEXT;
ALTER TABLE "TripItem" ADD COLUMN "place" TEXT;
