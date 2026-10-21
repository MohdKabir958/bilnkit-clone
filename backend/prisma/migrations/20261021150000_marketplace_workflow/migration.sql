-- Additive rollout: historical orders remain version 1, online only.
ALTER TABLE "Vendor" ADD COLUMN "primaryCategoryId" TEXT, ADD COLUMN "publicPhone" TEXT, ADD COLUMN "description" TEXT;
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_primaryCategoryId_fkey" FOREIGN KEY ("primaryCategoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
CREATE INDEX "Vendor_primaryCategoryId_idx" ON "Vendor"("primaryCategoryId");
UPDATE "Vendor" v SET "primaryCategoryId" = c."categoryId" FROM (SELECT DISTINCT ON (t."vendorId") t."vendorId",t."categoryId" FROM "VendorCategory" t JOIN "Category" k ON k.id=t."categoryId" WHERE t.position=0 AND k."isActive" AND k."forRestaurants" ORDER BY t."vendorId",t."categoryId") c WHERE c."vendorId"=v.id;
UPDATE "Vendor" v SET "primaryCategoryId" = c.id FROM "Category" c WHERE v."primaryCategoryId" IS NULL AND lower(trim(v.category))=lower(trim(c.name)) AND c."isActive" AND c."forRestaurants" AND (SELECT count(*) FROM "Category" k WHERE lower(trim(k.name))=lower(trim(v.category)) AND k."isActive" AND k."forRestaurants")=1;
ALTER TABLE "City" ADD COLUMN "codEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "DriverPartner" ADD COLUMN "availabilityLat" DOUBLE PRECISION, ADD COLUMN "availabilityLng" DOUBLE PRECISION, ADD COLUMN "availabilityAt" TIMESTAMP(3);
ALTER TABLE "Order" ADD COLUMN "workflowVersion" INTEGER NOT NULL DEFAULT 1, ADD COLUMN "paymentMethod" TEXT NOT NULL DEFAULT 'ONLINE';
ALTER TABLE "Order" ADD CONSTRAINT "Order_paymentMethod_check" CHECK ("paymentMethod" IN ('ONLINE','COD') AND ("paymentMethod" <> 'COD' OR ("workflowVersion"=2 AND "groupId" IS NULL)));
CREATE TABLE "CashCollection" ("id" TEXT NOT NULL PRIMARY KEY, "orderId" TEXT NOT NULL UNIQUE, "driverUserId" TEXT NOT NULL, "amountPaise" INTEGER NOT NULL CHECK ("amountPaise">0), "collectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "remittedAt" TIMESTAMP(3), "remittanceReference" TEXT, "remittedById" TEXT, "refundedAt" TIMESTAMP(3), "refundReference" TEXT, "refundedById" TEXT, CONSTRAINT "CashCollection_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE);
CREATE INDEX "CashCollection_driverUserId_collectedAt_idx" ON "CashCollection"("driverUserId","collectedAt");
