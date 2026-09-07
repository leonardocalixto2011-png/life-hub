-- Ledger of reminders actually delivered.
--
-- Deadline.remindDaysBefore has existed since Phase 1, defaults to [7,3,1],
-- is editable in the form, and /deadlines displays "reminds 7/3/1d before" —
-- but nothing ever read it. The app was stating a promise it did not keep.
--
-- A ledger is what makes a daily cron safe here: without it, an item sitting
-- 3 days out would re-send its reminder every single run. Keyed per user
-- rather than per item, because two members of a hub each need their own
-- reminder for a shared deadline and one delivery must not suppress the other.
CREATE TABLE "ReminderSent" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "daysBefore" INTEGER NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ReminderSent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ReminderSent_entityType_entityId_idx" ON "ReminderSent"("entityType", "entityId");

-- The dedupe key: one delivery per user, per item, per threshold.
CREATE UNIQUE INDEX "ReminderSent_userId_entityType_entityId_daysBefore_key" ON "ReminderSent"("userId", "entityType", "entityId", "daysBefore");

ALTER TABLE "ReminderSent" ADD CONSTRAINT "ReminderSent_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- No RLS: rows are written by the cron with no session, are per-user rather
-- than per-hub, and are never read into a user-facing surface.
