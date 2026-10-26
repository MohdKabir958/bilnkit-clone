-- Distinguish a failed read before submission from an uncertain monetary provider request.
-- Existing submitted requests remain conservative: they must be observed, never submitted blindly again.
ALTER TABLE "PaymentRefund" ADD COLUMN "submitStartedAt" TIMESTAMP(3);
UPDATE "PaymentRefund" SET "submitStartedAt" = "updatedAt"
WHERE "attempts" > 0 OR "providerRefundId" IS NOT NULL;
