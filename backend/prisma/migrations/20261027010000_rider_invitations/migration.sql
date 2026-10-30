CREATE TABLE "RiderInvitation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "email" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "state" TEXT NOT NULL DEFAULT 'PENDING',
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdById" TEXT NOT NULL,
  "acceptedBySubject" TEXT,
  "redeemedAt" TIMESTAMP(3),
  "completedAt" TIMESTAMP(3),
  "completedDriverId" TEXT,
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "RiderInvitation_state_check" CHECK ("state" IN ('PENDING','VERIFIED','COMPLETED','REVOKED'))
);
CREATE UNIQUE INDEX "RiderInvitation_tokenHash_key" ON "RiderInvitation"("tokenHash");
CREATE INDEX "RiderInvitation_email_state_expiresAt_idx" ON "RiderInvitation"("email","state","expiresAt");
CREATE INDEX "RiderInvitation_state_createdAt_idx" ON "RiderInvitation"("state","createdAt");
