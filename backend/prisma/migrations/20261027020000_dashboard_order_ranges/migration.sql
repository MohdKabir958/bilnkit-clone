CREATE INDEX "Order_createdAt_idx" ON "Order"("createdAt");
CREATE INDEX "Order_vendorId_createdAt_idx" ON "Order"("vendorId","createdAt");
