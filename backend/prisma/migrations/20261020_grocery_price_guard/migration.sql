-- Protect all price writers, including inherited bulk import and commission recalculation.
-- Legacy rows without MRP remain unchanged. Pricing still uses the compatible rupee columns.
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_price_mrp"
  CHECK ("mrpPaise" IS NULL OR ROUND(("price" * 100)::numeric) <= "mrpPaise");
