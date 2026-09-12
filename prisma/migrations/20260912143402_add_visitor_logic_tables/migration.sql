-- CreateEnum
CREATE TYPE "VisitorInvitationStatus" AS ENUM ('PENDING', 'ACTIVE', 'CANCELLED', 'COMPLETED', 'EXPIRED');

-- CreateEnum
CREATE TYPE "AccessPassStatus" AS ENUM ('ACTIVE', 'REVOKED', 'USED');

-- CreateEnum
CREATE TYPE "AccessEventType" AS ENUM ('CHECK_IN', 'CHECK_OUT', 'DENIED');

-- CreateTable
CREATE TABLE "VisitorInvitation" (
    "id" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "hostResidencyId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "visitorFirstName" TEXT NOT NULL,
    "visitorLastName" TEXT NOT NULL,
    "visitorPhone" TEXT,
    "visitorEmail" TEXT,
    "purpose" TEXT,
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "status" "VisitorInvitationStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VisitorInvitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessPass" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "status" "AccessPassStatus" NOT NULL DEFAULT 'ACTIVE',
    "validFrom" TIMESTAMP(3) NOT NULL,
    "validUntil" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AccessPass_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccessEvent" (
    "id" TEXT NOT NULL,
    "passId" TEXT NOT NULL,
    "gateId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "estateId" TEXT NOT NULL,
    "type" "AccessEventType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccessEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VisitorInvitation_estateId_idx" ON "VisitorInvitation"("estateId");

-- CreateIndex
CREATE INDEX "VisitorInvitation_hostResidencyId_idx" ON "VisitorInvitation"("hostResidencyId");

-- CreateIndex
CREATE INDEX "VisitorInvitation_createdByUserId_idx" ON "VisitorInvitation"("createdByUserId");

-- CreateIndex
CREATE INDEX "VisitorInvitation_status_idx" ON "VisitorInvitation"("status");

-- CreateIndex
CREATE UNIQUE INDEX "AccessPass_invitationId_key" ON "AccessPass"("invitationId");

-- CreateIndex
CREATE UNIQUE INDEX "AccessPass_code_key" ON "AccessPass"("code");

-- CreateIndex
CREATE INDEX "AccessPass_status_idx" ON "AccessPass"("status");

-- CreateIndex
CREATE INDEX "AccessEvent_estateId_createdAt_idx" ON "AccessEvent"("estateId", "createdAt");

-- CreateIndex
CREATE INDEX "AccessEvent_passId_idx" ON "AccessEvent"("passId");

-- CreateIndex
CREATE INDEX "AccessEvent_gateId_idx" ON "AccessEvent"("gateId");

-- CreateIndex
CREATE INDEX "AccessEvent_actorId_idx" ON "AccessEvent"("actorId");

-- CreateIndex
CREATE INDEX "AccessEvent_createdAt_idx" ON "AccessEvent"("createdAt");

-- AddForeignKey
ALTER TABLE "VisitorInvitation" ADD CONSTRAINT "VisitorInvitation_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorInvitation" ADD CONSTRAINT "VisitorInvitation_hostResidencyId_fkey" FOREIGN KEY ("hostResidencyId") REFERENCES "Residency"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VisitorInvitation" ADD CONSTRAINT "VisitorInvitation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessPass" ADD CONSTRAINT "AccessPass_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "VisitorInvitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_passId_fkey" FOREIGN KEY ("passId") REFERENCES "AccessPass"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_gateId_fkey" FOREIGN KEY ("gateId") REFERENCES "Gate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccessEvent" ADD CONSTRAINT "AccessEvent_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
