-- AlterTable
ALTER TABLE "Vendor" ADD COLUMN     "cityId" TEXT,
ADD COLUMN     "locality" TEXT,
ADD COLUMN     "operatingHours" JSONB,
ADD COLUMN     "pinCode" TEXT,
ALTER COLUMN "lat" SET DEFAULT 0,
ALTER COLUMN "lng" SET DEFAULT 0;

-- AlterTable
ALTER TABLE "Order" ADD COLUMN     "addressId" TEXT,
ADD COLUMN     "addressSnapshot" JSONB;

-- AlterTable
ALTER TABLE "DriverPartner" ADD COLUMN     "cityId" TEXT;

-- CreateTable
CREATE TABLE "City" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "City_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DeliveryZone" (
    "id" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "centerLat" DOUBLE PRECISION NOT NULL,
    "centerLng" DOUBLE PRECISION NOT NULL,
    "radiusKm" DOUBLE PRECISION NOT NULL,
    "baseFeePaise" INTEGER NOT NULL DEFAULT 0,
    "perKmFeePaise" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DeliveryZone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VendorCoverage" (
    "vendorId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "radiusKm" DOUBLE PRECISION,

    CONSTRAINT "VendorCoverage_pkey" PRIMARY KEY ("vendorId","zoneId")
);

-- CreateTable
CREATE TABLE "Address" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "cityId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'IN',
    "pinCode" TEXT NOT NULL,
    "locality" TEXT NOT NULL,
    "houseNumber" TEXT NOT NULL,
    "street" TEXT NOT NULL,
    "landmark" TEXT,
    "instructions" TEXT,
    "lat" DOUBLE PRECISION NOT NULL,
    "lng" DOUBLE PRECISION NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Address_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "City_code_key" ON "City"("code");

-- CreateIndex
CREATE INDEX "DeliveryZone_cityId_active_idx" ON "DeliveryZone"("cityId", "active");

-- CreateIndex
CREATE INDEX "VendorCoverage_zoneId_active_idx" ON "VendorCoverage"("zoneId", "active");

-- CreateIndex
CREATE INDEX "Address_customerId_createdAt_id_idx" ON "Address"("customerId", "createdAt", "id");

-- CreateIndex
CREATE INDEX "Address_cityId_lat_lng_idx" ON "Address"("cityId", "lat", "lng");

-- CreateIndex
CREATE INDEX "Vendor_cityId_approvalStatus_isAcceptingOrders_lat_lng_idx" ON "Vendor"("cityId", "approvalStatus", "isAcceptingOrders", "lat", "lng");

-- AddForeignKey
ALTER TABLE "Vendor" ADD CONSTRAINT "Vendor_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_addressId_fkey" FOREIGN KEY ("addressId") REFERENCES "Address"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverPartner" ADD CONSTRAINT "DriverPartner_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCoverage" ADD CONSTRAINT "VendorCoverage_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VendorCoverage" ADD CONSTRAINT "VendorCoverage_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "DeliveryZone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Address" ADD CONSTRAINT "Address_cityId_fkey" FOREIGN KEY ("cityId") REFERENCES "City"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Database-level invariants in addition to API validation.
ALTER TABLE "City" ADD CONSTRAINT "City_country_india" CHECK ("country" = 'IN');
ALTER TABLE "Address" ADD CONSTRAINT "Address_india_location" CHECK ("country" = 'IN' AND "pinCode" ~ '^[1-9][0-9]{5}$' AND "lat" BETWEEN 6 AND 38 AND "lng" BETWEEN 68 AND 98);
ALTER TABLE "DeliveryZone" ADD CONSTRAINT "DeliveryZone_bounds_fees" CHECK ("centerLat" BETWEEN 6 AND 38 AND "centerLng" BETWEEN 68 AND 98 AND "radiusKm" BETWEEN 0.1 AND 50 AND "baseFeePaise" >= 0 AND "perKmFeePaise" >= 0);
ALTER TABLE "VendorCoverage" ADD CONSTRAINT "VendorCoverage_radius" CHECK ("radiusKm" IS NULL OR "radiusKm" BETWEEN 0.1 AND 50);
CREATE UNIQUE INDEX "Address_one_default_per_customer" ON "Address" ("customerId") WHERE "isDefault" = true;
