-- Per-hub inbound email alias. Replaces the INBOUND_HUB_ID stopgap, which
-- routed every forwarded message into one configured hub regardless of who
-- sent it — workable for one household, wrong for anyone else.
--
-- Nullable: a hub only gets a token when someone asks for its address.
-- Unique: a forwarded mail must resolve to exactly one hub.
ALTER TABLE "Hub" ADD COLUMN     "inboundToken" TEXT;

CREATE UNIQUE INDEX "Hub_inboundToken_key" ON "Hub"("inboundToken");
