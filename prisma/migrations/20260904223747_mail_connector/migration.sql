-- CreateEnum
CREATE TYPE "ReviewCategory" AS ENUM ('BILL_PAYMENT', 'SUBSCRIPTION_RENEWAL', 'APPOINTMENT_EVENT', 'NEEDS_REPLY');

-- CreateEnum
CREATE TYPE "MailProvider" AS ENUM ('GOOGLE');

-- CreateEnum
CREATE TYPE "MailAccountStatus" AS ENUM ('ACTIVE', 'ERROR', 'REVOKED');

-- AlterTable
ALTER TABLE "ReviewItem" ADD COLUMN     "category" "ReviewCategory",
ADD COLUMN     "hubId" TEXT;

-- CreateTable
CREATE TABLE "MailAccount" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "provider" "MailProvider" NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "accessTokenEnc" TEXT NOT NULL,
    "refreshTokenEnc" TEXT NOT NULL,
    "tokenExpiresAt" TIMESTAMP(3) NOT NULL,
    "scope" TEXT NOT NULL,
    "status" "MailAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastSyncedAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MailAccount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TrustedSender" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "fromAddress" TEXT NOT NULL,
    "category" "ReviewCategory",
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TrustedSender_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MailAccount_status_idx" ON "MailAccount"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MailAccount_provider_emailAddress_key" ON "MailAccount"("provider", "emailAddress");

-- CreateIndex
CREATE UNIQUE INDEX "TrustedSender_hubId_fromAddress_category_key" ON "TrustedSender"("hubId", "fromAddress", "category");

-- CreateIndex
CREATE INDEX "ReviewItem_hubId_status_idx" ON "ReviewItem"("hubId", "status");

-- AddForeignKey
ALTER TABLE "ReviewItem" ADD CONSTRAINT "ReviewItem_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MailAccount" ADD CONSTRAINT "MailAccount_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TrustedSender" ADD CONSTRAINT "TrustedSender_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

