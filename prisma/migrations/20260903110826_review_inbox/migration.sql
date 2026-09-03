-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DISCARDED');
-- CreateTable
CREATE TABLE "ReviewItem" (
    "id" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PENDING',
    "source" TEXT NOT NULL,
    "sourceRef" TEXT,
    "sourceSnippet" TEXT,
    "fromAddress" TEXT,
    "draft" JSONB NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "ReviewItem_pkey" PRIMARY KEY ("id")
);
-- CreateIndex
CREATE INDEX "ReviewItem_status_createdAt_idx" ON "ReviewItem"("status", "createdAt");
