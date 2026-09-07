-- The hub's shared cover photo.
--
-- Distinct from `User.backgroundImageUrl`, which is per-person and private:
-- this one is the same for everyone in the hub. It is what makes a hub read
-- as a place rather than a row, and it is the first thing an invited person
-- sees on the invite card.
--
-- Additive and nullable, so no backfill and no downtime. Existing hubs simply
-- have no cover until an owner sets one.
--
-- No RLS policy change is needed: `Hub`'s existing policy already scopes rows
-- to hubs the caller is an active member of, and these are ordinary columns on
-- that row. Write access is owner-only, enforced in setHubCover() via
-- requireHubOwner() — the same helper every other owner-gated action uses.
ALTER TABLE "Hub" ADD COLUMN     "coverById" TEXT,
ADD COLUMN     "coverImageUrl" TEXT;

-- SET NULL, not CASCADE: if the person who set the cover leaves or is deleted,
-- the hub keeps its photo and simply stops attributing it. Cascading here
-- would silently blank a shared image for everyone.
ALTER TABLE "Hub" ADD CONSTRAINT "Hub_coverById_fkey" FOREIGN KEY ("coverById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
