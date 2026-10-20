-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "dispatchEscalatedAt" TIMESTAMP(3),
ADD COLUMN     "dispatchNextAttemptAt" TIMESTAMP(3),
ADD COLUMN     "dispatchNote" TEXT,
ADD COLUMN     "dispatchRound" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "otpExpiresAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DriverPartner" ADD COLUMN     "lastOfferedAt" TIMESTAMP(3),
ADD COLUMN     "serviceZoneId" TEXT;

-- CreateTable
CREATE TABLE "DispatchOffer" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "round" INTEGER NOT NULL DEFAULT 0,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "reason" TEXT,
    "manual" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DispatchOffer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportCase" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "orderId" TEXT,
    "subject" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "resolution" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportCase_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportNote" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportNote_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NotificationIntent" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "event" TEXT NOT NULL,
    "options" JSONB NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "leaseUntil" TIMESTAMP(3),
    "errorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotificationIntent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DispatchOffer_driverId_state_expiresAt_idx" ON "DispatchOffer"("driverId", "state", "expiresAt");

-- CreateIndex
CREATE INDEX "DispatchOffer_orderId_state_idx" ON "DispatchOffer"("orderId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "DispatchOffer_orderId_driverId_round_key" ON "DispatchOffer"("orderId", "driverId", "round");

-- CreateIndex
CREATE INDEX "SupportCase_customerId_createdAt_idx" ON "SupportCase"("customerId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportCase_status_createdAt_idx" ON "SupportCase"("status", "createdAt");

-- CreateIndex
CREATE INDEX "SupportNote_caseId_createdAt_idx" ON "SupportNote"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "NotificationIntent_state_leaseUntil_createdAt_idx" ON "NotificationIntent"("state", "leaseUntil", "createdAt");

-- CreateIndex
CREATE INDEX "DriverPartner_cityId_approvalStatus_dutyStatus_idx" ON "DriverPartner"("cityId", "approvalStatus", "dutyStatus");

-- AddForeignKey
ALTER TABLE "DriverPartner" ADD CONSTRAINT "DriverPartner_serviceZoneId_fkey" FOREIGN KEY ("serviceZoneId") REFERENCES "DeliveryZone"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOffer" ADD CONSTRAINT "DispatchOffer_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DispatchOffer" ADD CONSTRAINT "DispatchOffer_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "DriverPartner"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportNote" ADD CONSTRAINT "SupportNote_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NotificationIntent" ADD CONSTRAINT "NotificationIntent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;


ALTER TABLE "DispatchOffer" ADD CONSTRAINT "DispatchOffer_state" CHECK ("state" IN ('PENDING','ACCEPTED','DECLINED','EXPIRED','REVOKED'));
ALTER TABLE "SupportCase" ADD CONSTRAINT "SupportCase_status" CHECK ("status" IN ('OPEN','IN_PROGRESS','RESOLVED'));
ALTER TABLE "NotificationIntent" ADD CONSTRAINT "NotificationIntent_state" CHECK ("state" IN ('PENDING','DONE','EXPIRED'));
