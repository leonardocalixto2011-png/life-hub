-- CreateEnum
CREATE TYPE "DebtStatus" AS ENUM ('CURRENT', 'DEFAULT', 'PAID_OFF');

-- CreateTable
CREATE TABLE "Debt" (
    "id" TEXT NOT NULL,
    "hubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "balanceCents" INTEGER NOT NULL,
    "aprBasisPoints" INTEGER,
    "minimumPaymentCents" INTEGER,
    "actualPaymentCents" INTEGER,
    "dueDate" TIMESTAMP(3),
    "status" "DebtStatus" NOT NULL DEFAULT 'CURRENT',
    "notes" TEXT,
    "ventureId" TEXT,
    "ownerId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Debt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Debt_hubId_status_idx" ON "Debt"("hubId", "status");

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_hubId_fkey" FOREIGN KEY ("hubId") REFERENCES "Hub"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_ventureId_fkey" FOREIGN KEY ("ventureId") REFERENCES "Venture"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Debt" ADD CONSTRAINT "Debt_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
