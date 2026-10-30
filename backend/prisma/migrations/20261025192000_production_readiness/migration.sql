-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "busyUntil" TIMESTAMP(3),
ADD COLUMN     "maxPreparingOrders" INTEGER NOT NULL DEFAULT 10,
ADD COLUMN     "preparationMinutes" INTEGER NOT NULL DEFAULT 10;

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "batchTracking" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "capacitySnapshot" JSONB,
ADD COLUMN     "dispatchOverrideUntil" TIMESTAMP(3),
ADD COLUMN     "dispatchSearchStartedAt" TIMESTAMP(3),
ADD COLUMN     "estimatedReadyAt" TIMESTAMP(3),
ADD COLUMN     "packingStartedAt" TIMESTAMP(3),
ADD COLUMN     "preparationMinutes" INTEGER,
ADD COLUMN     "readyForPickupAt" TIMESTAMP(3),
ADD COLUMN     "riderArrivedPickupAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "lastProviderCheckedAt" TIMESTAMP(3),
ADD COLUMN     "providerFailureCode" TEXT,
ADD COLUMN     "providerStatus" TEXT,
ADD COLUMN     "verificationRequestedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DriverPartner" ADD COLUMN     "availabilityAccuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "availabilityMeasuredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "DriverLocation" ADD COLUMN     "accuracyMeters" DOUBLE PRECISION,
ADD COLUMN     "measuredAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "PushLog" ADD COLUMN     "deliveryOfferExpiresAt" TIMESTAMP(3),
ADD COLUMN     "deliveryOfferId" TEXT;

-- AlterTable
ALTER TABLE "InventoryReservation" ADD COLUMN     "batchAllocations" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "packedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pendingInspectionQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "releasedQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unusableQty" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "StockMovement" ADD COLUMN     "details" JSONB;

-- AlterTable
ALTER TABLE "SupportCase" ADD COLUMN     "assignedToId" TEXT,
ADD COLUMN     "category" TEXT NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "dueAt" TIMESTAMP(3),
ADD COLUMN     "escalatedAt" TIMESTAMP(3),
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL',
ADD COLUMN     "refundReference" TEXT,
ADD COLUMN     "reopenedAt" TIMESTAMP(3),
ADD COLUMN     "replacementReference" TEXT,
ADD COLUMN     "resolvedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "SupportNote" ADD COLUMN     "internal" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "NotificationIntent" ADD COLUMN     "leaseToken" TEXT;

-- CreateTable
CREATE TABLE "BackgroundJob" (
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'READY',
    "intervalMs" INTEGER NOT NULL,
    "maxAttempts" INTEGER NOT NULL DEFAULT 8,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextRunAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leaseToken" TEXT,
    "leaseOwner" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "lastStartedAt" TIMESTAMP(3),
    "lastFinishedAt" TIMESTAMP(3),
    "lastSuccessAt" TIMESTAMP(3),
    "lastErrorCode" TEXT,
    "recoveryCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BackgroundJob_pkey" PRIMARY KEY ("name")
);

-- CreateTable
CREATE TABLE "BackgroundJobRun" (
    "id" TEXT NOT NULL,
    "jobName" TEXT NOT NULL,
    "workerId" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "finishedAt" TIMESTAMP(3),
    "leaseUntil" TIMESTAMP(3) NOT NULL,
    "errorCode" TEXT,
    "recovered" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "BackgroundJobRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockBatch" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "lotCode" TEXT NOT NULL,
    "availableQty" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockBatch_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SupportEvidence" (
    "id" TEXT NOT NULL,
    "caseId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "storageKey" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "bytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "caption" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SupportEvidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OperationalResolution" (
    "id" TEXT NOT NULL,
    "exceptionKey" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'OPEN',
    "ownerId" TEXT,
    "reason" TEXT NOT NULL,
    "evidenceReference" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "actorId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OperationalResolution_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashLedgerEvent" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT,
    "driverUserId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "reference" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "supervisorId" TEXT,
    "businessDate" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CashLedgerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CashDailyClose" (
    "id" TEXT NOT NULL,
    "driverUserId" TEXT NOT NULL,
    "businessDate" TEXT NOT NULL,
    "expectedPaise" INTEGER NOT NULL,
    "receivedPaise" INTEGER NOT NULL,
    "outstandingPaise" INTEGER NOT NULL,
    "shortagePaise" INTEGER NOT NULL,
    "overagePaise" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'REVIEW_REQUIRED',
    "reason" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "countedPaise" INTEGER NOT NULL,
    "evidenceReference" TEXT NOT NULL,

    CONSTRAINT "CashDailyClose_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrderAdjustment" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "requestKey" TEXT NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PROPOSED',
    "version" INTEGER NOT NULL DEFAULT 1,
    "reason" TEXT NOT NULL,
    "originalSnapshot" JSONB NOT NULL,
    "proposedItems" JSONB NOT NULL,
    "originalTotalPaise" INTEGER NOT NULL,
    "proposedTotalPaise" INTEGER NOT NULL,
    "refundDuePaise" INTEGER NOT NULL DEFAULT 0,
    "decisionKey" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "decidedAt" TIMESTAMP(3),
    "appliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrderAdjustment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentRefund" (
    "id" TEXT NOT NULL,
    "paymentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "adjustmentId" TEXT,
    "amountPaise" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "reason" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "leaseToken" TEXT,
    "leaseUntil" TIMESTAMP(3),
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "nextAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processedAt" TIMESTAMP(3),

    CONSTRAINT "PaymentRefund_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GpsException" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "scope" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "evidenceReference" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "approvedById" TEXT,
    "state" TEXT NOT NULL DEFAULT 'PENDING',
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "approvedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "GpsException_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SellerCompliance" (
    "id" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "businessName" TEXT,
    "businessAddress" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "gstApplicable" BOOLEAN,
    "gstNumber" TEXT,
    "fssaiApplicable" BOOLEAN,
    "fssaiNumber" TEXT,
    "fssaiExpiresAt" TIMESTAMP(3),
    "authorizedSellerName" TEXT,
    "documentReferences" JSONB NOT NULL DEFAULT '[]',
    "requiredDocuments" JSONB NOT NULL DEFAULT '[]',
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "revision" INTEGER NOT NULL DEFAULT 1,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewReason" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SellerCompliance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentCreation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "amountPaise" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'CREATING',
    "claimToken" TEXT NOT NULL,
    "providerOrderId" TEXT,
    "lastErrorCode" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentCreation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "BackgroundJob_state_nextRunAt_idx" ON "BackgroundJob"("state", "nextRunAt");

-- CreateIndex
CREATE INDEX "BackgroundJob_leaseUntil_idx" ON "BackgroundJob"("leaseUntil");

-- CreateIndex
CREATE INDEX "BackgroundJobRun_jobName_startedAt_idx" ON "BackgroundJobRun"("jobName", "startedAt");

-- CreateIndex
CREATE INDEX "BackgroundJobRun_state_leaseUntil_idx" ON "BackgroundJobRun"("state", "leaseUntil");

-- CreateIndex
CREATE INDEX "StockBatch_menuItemId_expiresAt_idx" ON "StockBatch"("menuItemId", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "StockBatch_menuItemId_lotCode_key" ON "StockBatch"("menuItemId", "lotCode");

-- CreateIndex
CREATE UNIQUE INDEX "SupportEvidence_storageKey_key" ON "SupportEvidence"("storageKey");

-- CreateIndex
CREATE INDEX "SupportEvidence_caseId_createdAt_idx" ON "SupportEvidence"("caseId", "createdAt");

-- CreateIndex
CREATE INDEX "SupportEvidence_expiresAt_idx" ON "SupportEvidence"("expiresAt");

-- CreateIndex
CREATE INDEX "OperationalResolution_state_updatedAt_idx" ON "OperationalResolution"("state", "updatedAt");

-- CreateIndex
CREATE UNIQUE INDEX "OperationalResolution_exceptionKey_referenceType_referenceI_key" ON "OperationalResolution"("exceptionKey", "referenceType", "referenceId");

-- CreateIndex
CREATE UNIQUE INDEX "CashLedgerEvent_idempotencyKey_key" ON "CashLedgerEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "CashLedgerEvent_driverUserId_businessDate_createdAt_idx" ON "CashLedgerEvent"("driverUserId", "businessDate", "createdAt");

-- CreateIndex
CREATE INDEX "CashLedgerEvent_collectionId_kind_idx" ON "CashLedgerEvent"("collectionId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CashDailyClose_driverUserId_businessDate_key" ON "CashDailyClose"("driverUserId", "businessDate");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAdjustment_decisionKey_key" ON "OrderAdjustment"("decisionKey");

-- CreateIndex
CREATE INDEX "OrderAdjustment_state_expiresAt_idx" ON "OrderAdjustment"("state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "OrderAdjustment_orderId_requestKey_key" ON "OrderAdjustment"("orderId", "requestKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_idempotencyKey_key" ON "PaymentRefund"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentRefund_providerRefundId_key" ON "PaymentRefund"("providerRefundId");

-- CreateIndex
CREATE INDEX "PaymentRefund_state_nextAttemptAt_leaseUntil_idx" ON "PaymentRefund"("state", "nextAttemptAt", "leaseUntil");

-- CreateIndex
CREATE INDEX "PaymentRefund_paymentId_state_idx" ON "PaymentRefund"("paymentId", "state");

-- CreateIndex
CREATE INDEX "GpsException_orderId_scope_state_expiresAt_idx" ON "GpsException"("orderId", "scope", "state", "expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "SellerCompliance_vendorId_key" ON "SellerCompliance"("vendorId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCreation_orderId_key" ON "PaymentCreation"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PaymentCreation_providerOrderId_key" ON "PaymentCreation"("providerOrderId");

-- CreateIndex
CREATE INDEX "SupportCase_status_dueAt_idx" ON "SupportCase"("status", "dueAt");

-- CreateIndex
CREATE INDEX "SupportCase_assignedToId_status_idx" ON "SupportCase"("assignedToId", "status");

-- AddForeignKey
ALTER TABLE "BackgroundJobRun" ADD CONSTRAINT "BackgroundJobRun_jobName_fkey" FOREIGN KEY ("jobName") REFERENCES "BackgroundJob"("name") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SupportEvidence" ADD CONSTRAINT "SupportEvidence_caseId_fkey" FOREIGN KEY ("caseId") REFERENCES "SupportCase"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CashLedgerEvent" ADD CONSTRAINT "CashLedgerEvent_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "CashCollection"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_adjustmentId_fkey" FOREIGN KEY ("adjustmentId") REFERENCES "OrderAdjustment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SellerCompliance" ADD CONSTRAINT "SellerCompliance_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Immutable evidence: corrections append a new event; operational close rows only receive independent review metadata.
CREATE FUNCTION "reject_cash_event_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Cash ledger events are append-only'; END; $$;
CREATE TRIGGER "CashLedgerEvent_append_only" BEFORE UPDATE OR DELETE ON "CashLedgerEvent" FOR EACH ROW EXECUTE FUNCTION "reject_cash_event_mutation"();

ALTER TABLE "CashLedgerEvent" ADD CONSTRAINT "CashLedgerEvent_nonnegative" CHECK ("amountPaise">=0);
ALTER TABLE "CashDailyClose" ADD CONSTRAINT "CashDailyClose_nonnegative" CHECK ("expectedPaise">=0 AND "receivedPaise">=0 AND "outstandingPaise">=0 AND "countedPaise">=0 AND "shortagePaise">=0 AND "overagePaise">=0);
ALTER TABLE "SupportEvidence" ADD CONSTRAINT "SupportEvidence_size_check" CHECK ("bytes">0 AND "bytes"<=2097152);
ALTER TABLE "PaymentRefund" ADD CONSTRAINT "PaymentRefund_amount_positive" CHECK ("amountPaise">0);
ALTER TABLE "OrderAdjustment" ADD CONSTRAINT "OrderAdjustment_money_nonnegative" CHECK ("originalTotalPaise">=0 AND "proposedTotalPaise">=0 AND "refundDuePaise">=0);

ALTER TABLE "InventoryReservation" DROP CONSTRAINT IF EXISTS "InventoryReservation_state_quantity";
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_state_quantity" CHECK ("quantity">=0 AND "state" IN ('HELD','CONSUMED','RELEASED','AWAITING_INSPECTION','RECONCILED','ADJUSTED') AND ("quantity">0 OR "state"='ADJUSTED'));
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_disposition_check" CHECK ("packedQty">=0 AND "unusableQty">=0 AND "pendingInspectionQty">=0 AND "releasedQty">=0 AND "packedQty"+"unusableQty"+"releasedQty"<="quantity" AND "pendingInspectionQty"<="packedQty");
ALTER TABLE "StockBatch" ADD CONSTRAINT "StockBatch_availableQty_check" CHECK ("availableQty">=0);
