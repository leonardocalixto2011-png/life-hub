-- Trip budget breakdown lines and "good to know" tips. Both are TripItem
-- rows like every other kind, so trip_item_via_visible_trip already covers
-- them: no RLS change.
ALTER TYPE "TripItemKind" ADD VALUE 'BUDGET';
ALTER TYPE "TripItemKind" ADD VALUE 'TIP';
