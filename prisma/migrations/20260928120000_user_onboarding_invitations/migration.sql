CREATE TYPE "UserInvitationType" AS ENUM ('RESIDENT', 'STAFF');
CREATE TYPE "UserInvitationStatus" AS ENUM ('PENDING', 'ACCEPTED', 'REVOKED');

CREATE TABLE "UserInvitation" (
  "id" TEXT NOT NULL,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "estateId" TEXT NOT NULL,
  "type" "UserInvitationType" NOT NULL,
  "intendedRole" "StaffRole",
  "unitId" TEXT,
  "residencyType" "ResidencyType",
  "invitedByUserId" TEXT NOT NULL,
  "status" "UserInvitationStatus" NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "UserInvitation_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "UserInvitation_relationship_shape_check" CHECK (
    ("type" = 'RESIDENT' AND "unitId" IS NOT NULL AND "residencyType" IS NOT NULL AND "intendedRole" IS NULL)
    OR ("type" = 'STAFF' AND "unitId" IS NULL AND "residencyType" IS NULL AND "intendedRole" IS NOT NULL)
  )
);

CREATE UNIQUE INDEX "UserInvitation_tokenHash_key" ON "UserInvitation"("tokenHash");
CREATE INDEX "UserInvitation_estateId_status_createdAt_idx" ON "UserInvitation"("estateId", "status", "createdAt");
CREATE INDEX "UserInvitation_email_status_idx" ON "UserInvitation"("email", "status");
CREATE UNIQUE INDEX "UserInvitation_pending_resident_key" ON "UserInvitation"("email", "unitId", "residencyType") WHERE "status" = 'PENDING' AND "type" = 'RESIDENT';
CREATE UNIQUE INDEX "UserInvitation_pending_staff_key" ON "UserInvitation"("email", "estateId", "intendedRole") WHERE "status" = 'PENDING' AND "type" = 'STAFF';

ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_estateId_fkey" FOREIGN KEY ("estateId") REFERENCES "Estate"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "Unit"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "UserInvitation" ADD CONSTRAINT "UserInvitation_invitedByUserId_fkey" FOREIGN KEY ("invitedByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
