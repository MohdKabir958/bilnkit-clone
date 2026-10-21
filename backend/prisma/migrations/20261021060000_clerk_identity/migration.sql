-- Additive only: no UUIDs, foreign keys, business roles or existing records are rewritten.
ALTER TABLE "User" ADD COLUMN "clerkUserId" TEXT;
CREATE UNIQUE INDEX "User_clerkUserId_key" ON "User"("clerkUserId");
CREATE TABLE "ClerkIdentityState" (
  "clerkUserId" TEXT PRIMARY KEY,
  "lastEventAt" BIGINT NOT NULL DEFAULT 0,
  "deleted" BOOLEAN NOT NULL DEFAULT false,
  "suspended" BOOLEAN NOT NULL DEFAULT false,
  "deleteRequested" BOOLEAN NOT NULL DEFAULT false,
  "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "ClerkWebhookDelivery" (
  "id" TEXT PRIMARY KEY,
  "clerkUserId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "eventTimestamp" BIGINT NOT NULL,
  "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "ClerkWebhookDelivery_processedAt_idx" ON "ClerkWebhookDelivery"("processedAt");
