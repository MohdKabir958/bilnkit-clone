-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "barcode" TEXT,
ADD COLUMN     "hsnCode" TEXT,
ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "lowStockThreshold" INTEGER NOT NULL DEFAULT 5,
ADD COLUMN     "mrpPaise" INTEGER,
ADD COLUMN     "packSize" TEXT NOT NULL DEFAULT '1',
ADD COLUMN     "productKey" TEXT,
ADD COLUMN     "sku" TEXT,
ADD COLUMN     "stockQty" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "stockVersion" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "taxRateBps" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'pcs';

-- AlterTable
ALTER TABLE "OrderItem" ADD COLUMN     "productSnapshot" JSONB;

-- CreateTable
CREATE TABLE "InventoryReservation" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "state" TEXT NOT NULL DEFAULT 'HELD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InventoryReservation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "menuItemId" TEXT NOT NULL,
    "delta" INTEGER NOT NULL,
    "kind" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "actorId" TEXT,
    "reference" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InventoryReservation_orderId_state_idx" ON "InventoryReservation"("orderId", "state");

-- CreateIndex
CREATE UNIQUE INDEX "InventoryReservation_orderId_menuItemId_key" ON "InventoryReservation"("orderId", "menuItemId");

-- CreateIndex
CREATE UNIQUE INDEX "StockMovement_reference_key" ON "StockMovement"("reference");

-- CreateIndex
CREATE INDEX "StockMovement_menuItemId_createdAt_idx" ON "StockMovement"("menuItemId", "createdAt");

-- CreateIndex
CREATE INDEX "MenuItem_vendorId_productKey_idx" ON "MenuItem"("vendorId", "productKey");

-- CreateIndex
CREATE INDEX "MenuItem_vendorId_stockQty_idx" ON "MenuItem"("vendorId", "stockQty");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_vendorId_sku_key" ON "MenuItem"("vendorId", "sku");

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- New sellable packs start with zero inventory. Operators must count legacy stock before selling it.
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_stock_nonnegative" CHECK ("stockQty" >= 0 AND "stockVersion" >= 0 AND "lowStockThreshold" >= 0);
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_pack_metadata" CHECK ("unit" IN ('g','kg','ml','l','pcs','pack') AND ("mrpPaise" IS NULL OR "mrpPaise" > 0) AND "taxRateBps" BETWEEN 0 AND 10000);
ALTER TABLE "InventoryReservation" ADD CONSTRAINT "InventoryReservation_state_quantity" CHECK ("quantity" > 0 AND "state" IN ('HELD','CONSUMED','RELEASED'));
