-- AlterEnum
ALTER TYPE "MailProvider" ADD VALUE 'MICROSOFT';

-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN     "graphDeltaLink" TEXT;
