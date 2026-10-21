CREATE TYPE "AdminAccessRole" AS ENUM ('OWNER', 'ADMIN');
CREATE TYPE "AdminAccessStatus" AS ENUM ('INVITED', 'ACTIVE', 'REVOKED');
CREATE TABLE "AdminAccess" (
  "id" TEXT NOT NULL,
  "email" TEXT,
  "userId" TEXT,
  "clerkUserId" TEXT,
  "displayName" TEXT,
  "role" "AdminAccessRole" NOT NULL DEFAULT 'ADMIN',
  "status" "AdminAccessStatus" NOT NULL DEFAULT 'INVITED',
  "invitedById" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "revokedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AdminAccess_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AdminAccess_email_key" ON "AdminAccess"("email");
CREATE UNIQUE INDEX "AdminAccess_userId_key" ON "AdminAccess"("userId");
CREATE UNIQUE INDEX "AdminAccess_clerkUserId_key" ON "AdminAccess"("clerkUserId");
CREATE INDEX "AdminAccess_status_role_idx" ON "AdminAccess"("status", "role");
ALTER TABLE "AdminAccess" ADD CONSTRAINT "AdminAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
