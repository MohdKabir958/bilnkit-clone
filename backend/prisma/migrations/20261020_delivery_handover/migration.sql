ALTER TABLE "Order" ADD COLUMN "pickupArrivalAt" TIMESTAMP(3);
ALTER TABLE "Vendor" ALTER COLUMN "rating" SET DEFAULT 0, ALTER COLUMN "totalRatingsCount" SET DEFAULT 0;
ALTER TABLE "MenuItem" ALTER COLUMN "rating" SET DEFAULT 0;
ALTER TABLE "DriverPartner" ALTER COLUMN "rating" SET DEFAULT 0, ALTER COLUMN "onTimeRatePercent" SET DEFAULT 0;
-- Remove only the exact inherited vendor placeholder; preserve explicitly customized historical ratings.
UPDATE "Vendor" SET "rating"=0,"totalRatingsCount"=0 WHERE "rating"=4.5 AND "totalRatingsCount"=50;
