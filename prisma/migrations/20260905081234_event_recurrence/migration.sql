-- AlterTable
ALTER TABLE "Event" ADD COLUMN     "recurrenceGroupId" TEXT;

-- CreateIndex
CREATE INDEX "Event_hubId_recurrenceGroupId_idx" ON "Event"("hubId", "recurrenceGroupId");
