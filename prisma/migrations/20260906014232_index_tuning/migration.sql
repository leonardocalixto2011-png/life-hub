-- DropIndex
DROP INDEX "Deadline_hubId_dueDate_idx";

-- CreateIndex
CREATE INDEX "Deadline_hubId_doneAt_dueDate_idx" ON "Deadline"("hubId", "doneAt", "dueDate");

-- CreateIndex
CREATE INDEX "MailAccount_hubId_idx" ON "MailAccount"("hubId");

-- CreateIndex
CREATE INDEX "Subscription_hubId_status_cancelByDate_idx" ON "Subscription"("hubId", "status", "cancelByDate");
