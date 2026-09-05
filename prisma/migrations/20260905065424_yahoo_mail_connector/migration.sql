-- AlterEnum
ALTER TYPE "MailProvider" ADD VALUE 'YAHOO';

-- AlterTable
ALTER TABLE "MailAccount" ADD COLUMN     "appPasswordEnc" TEXT,
ADD COLUMN     "imapLastUid" INTEGER,
ADD COLUMN     "imapUidValidity" INTEGER,
ALTER COLUMN "accessTokenEnc" DROP NOT NULL,
ALTER COLUMN "refreshTokenEnc" DROP NOT NULL,
ALTER COLUMN "tokenExpiresAt" DROP NOT NULL,
ALTER COLUMN "scope" DROP NOT NULL;

