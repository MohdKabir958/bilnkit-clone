#!/usr/bin/env python3
"""Generate additive SQL for an operator-selected staging DB; never connects to a DB."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
scenario = json.loads((ROOT / 'demo/scenario.json').read_text())
images = json.loads((ROOT / 'demo/product-images.json').read_text())
image_commit = '0d2b149887bad33e8db1a7e91898d72f6904b9e6'
image_urls = {row['id']: f"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/{image_commit}/{row['file']}" for row in images}
for product in scenario['products']:
    product['imageUrl'] = image_urls[product['id']]
    product['categorySlug'] = product['category'].lower().replace(' ', '-')
payload = json.dumps(scenario, ensure_ascii=True, separators=(',', ':'))
assert '$grozo_data$' not in payload
sql = r'''-- OPERATOR ACTION: run only in the Grozo demonstration/staging database.
-- Adds 2 clearly simulated Bengaluru stores and 24 products. No users, passwords,
-- roles, orders, payments, or existing stock are changed. Re-runs do not reset stock.
-- Product imagery: original unbranded AI demo illustrations; inventory/licences:
-- Docs/demo/product-image-licenses.md. Locations: demo/scenario.json provenance.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $grozo_seed$
DECLARE
  cfg jsonb := $grozo_data$__PAYLOAD__$grozo_data$::jsonb;
  ns text := 'gzhostdemo-blr';
  city_id text := 'gzhostdemo-blr-city';
  zone_id text := 'gzhostdemo-blr-zone';
  s jsonb; p jsonb; anchor jsonb;
  idx integer := 0;
  store_id text; cat_id text; item_id text;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('grozo-hosted-demo-catalog-v1', 81971));
  IF EXISTS (SELECT 1 FROM "City" WHERE id=city_id AND (code<>ns OR name<>'Bengaluru')) THEN
    RAISE EXCEPTION 'Demo namespace conflict; no changes committed';
  END IF;
  IF EXISTS (SELECT 1 FROM "DeliveryZone" WHERE id=zone_id AND "cityId"<>city_id) THEN
    RAISE EXCEPTION 'Demo zone conflict; no changes committed';
  END IF;
  INSERT INTO "City" (id,code,name,state,country,active)
  VALUES (city_id,ns,'Bengaluru','Karnataka','IN',true) ON CONFLICT (id) DO NOTHING;
  INSERT INTO "DeliveryZone" (id,"cityId",name,"centerLat","centerLng","radiusKm","baseFeePaise","perKmFeePaise",active)
  VALUES (zone_id,city_id,'Simulated central Bengaluru service circle',12.96393155,77.58425661,8,2500,100,true)
  ON CONFLICT (id) DO NOTHING;
  FOR p IN SELECT value FROM jsonb_array_elements(cfg->'products') LOOP
    cat_id := ns||'-cat-'||(p->>'categorySlug');
    IF EXISTS (SELECT 1 FROM "Category" WHERE id=cat_id AND slug<>cat_id) THEN
      RAISE EXCEPTION 'Demo category namespace conflict; no changes committed';
    END IF;
    INSERT INTO "Category" (id,name,slug,icon,"sortOrder","isActive","forRestaurants","forDishes","showOnHome","updatedAt")
    VALUES (cat_id,p->>'category',cat_id,'shopping_basket',10,true,true,true,true,CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING;
  END LOOP;
  FOR s IN SELECT value FROM jsonb_array_elements(cfg->'stores') LOOP
    idx := idx+1;
    store_id := ns||'-store-'||idx;
    anchor := (cfg->'points')->((s->>'point')::integer);
    IF EXISTS (SELECT 1 FROM "Vendor" WHERE id=store_id AND
      ("userId" IS NOT NULL OR "cityId" IS DISTINCT FROM city_id OR name IS DISTINCT FROM s->>'name')) THEN
      RAISE EXCEPTION 'Demo store namespace/ownership conflict; no changes committed';
    END IF;
    INSERT INTO "Vendor" (id,name,category,"bannerImage",address,"isAcceptingOrders",lat,lng,"cityId","pinCode",locality,
      "locationSource","locationSetAt","approvalStatus",eta,rating,"totalRatingsCount","commissionType","commissionValue","updatedAt")
    VALUES (store_id,s->>'name','Groceries',cfg->'products'->0->>'imageUrl',
      'Simulation only - public map anchor: '||(anchor->>'label')||', Bengaluru '||(s->>'pinCode'),true,
      (anchor->>'lat')::double precision,(anchor->>'lng')::double precision,city_id,s->>'pinCode',anchor->>'label',
      'ADMIN',CURRENT_TIMESTAMP,'APPROVED','',0,0,'FLAT',0,CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO NOTHING;
    INSERT INTO "VendorCoverage" ("vendorId","zoneId",active) VALUES (store_id,zone_id,true)
    ON CONFLICT ("vendorId","zoneId") DO NOTHING;
    FOR p IN SELECT value FROM jsonb_array_elements(cfg->'products') LOOP
      item_id := store_id||'-'||(p->>'id');
      cat_id := ns||'-cat-'||(p->>'categorySlug');
      IF EXISTS (SELECT 1 FROM "MenuItem" WHERE id=item_id AND
        ("vendorId"<>store_id OR "productKey" IS DISTINCT FROM p->>'id')) THEN
        RAISE EXCEPTION 'Demo product namespace conflict; no changes committed';
      END IF;
      WITH inserted AS (
        INSERT INTO "MenuItem" (id,"vendorId",name,price,"vendorPrice",category,"categoryId",description,"imageUrl","imageUrls",
          "isAvailable","isVeg",rating,"ratingCount","approvalStatus","createdBy",sku,"productKey","packSize",unit,"mrpPaise","stockQty",
          "commissionType","commissionValue")
        VALUES (item_id,store_id,p->>'name',(p->>'pricePaise')::integer/100.0,(p->>'pricePaise')::integer/100.0,
          p->>'category',cat_id,'Synthetic demo product. Original AI-generated unbranded illustration; simulation only.',
          p->>'imageUrl',ARRAY[p->>'imageUrl'],(p->>'stockQty')::integer>0,(p->>'id')<>'eggs',0,0,'APPROVED','ADMIN',
          'DEMO-'||idx||'-'||upper(p->>'id'),p->>'id',p->>'packSize',p->>'unit',(p->>'mrpPaise')::integer,(p->>'stockQty')::integer,'FLAT',0)
        ON CONFLICT (id) DO NOTHING RETURNING id,"stockQty"
      )
      INSERT INTO "StockMovement" (id,"menuItemId",delta,kind,reason,reference)
      SELECT 'init-'||id,id,"stockQty",'ADJUSTMENT','Initial synthetic demonstration stock',ns||':'||id FROM inserted WHERE "stockQty">0;
    END LOOP;
  END LOOP;
END
$grozo_seed$;
COMMIT;
SELECT v.name AS store, count(m.id) AS products FROM "Vendor" v
LEFT JOIN "MenuItem" m ON m."vendorId"=v.id
WHERE v.id IN ('gzhostdemo-blr-store-1','gzhostdemo-blr-store-2') GROUP BY v.id,v.name ORDER BY v.id;
'''.replace('__PAYLOAD__', payload)
target = ROOT / 'Docs/demo/seed-hosted-catalog.sql'
target.write_text(sql)
print(f'Generated {target.relative_to(ROOT)}; no database contacted.')
