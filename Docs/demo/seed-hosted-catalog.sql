-- OPERATOR ACTION: run only in the Grozo demonstration/staging database.
-- Adds 2 clearly simulated Bengaluru stores and 24 products. No users, passwords,
-- roles, orders, payments, or existing stock are changed. Re-runs do not reset stock.
-- Product imagery: original unbranded AI demo illustrations; inventory/licences:
-- Docs/demo/product-image-licenses.md. Locations: demo/scenario.json provenance.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $grozo_seed$
DECLARE
  cfg jsonb := $grozo_data${"version":1,"simulationOnly":true,"namespace":"gzdemo-bengaluru","city":{"name":"Bengaluru","state":"Karnataka"},"zone":{"name":"Simulated central Bengaluru service circle","centerLat":12.96393155,"centerLng":77.58425661,"radiusKm":8,"baseFeePaise":2500,"perKmFeePaise":100},"points":[{"label":"Krishnarajendra Market","lat":12.96161187,"lng":77.57527904,"source":"https://github.com/geohacker/bmtc/blob/e9abee5075a214b9ea9706a2860a1af843320c95/data/busstops.geojson","sourceRecordName":"Krishnarajendra Market","kind":"published public-transport map anchor; simulation only; not a merchant premises or verified loading entrance","mapURL":"https://www.openstreetmap.org/?mlat=12.96161187&mlon=77.57527904#map=18/12.96161187/77.57527904"},{"label":"Shivajinagar Bus Station","lat":12.98368012,"lng":77.6035693,"source":"https://github.com/geohacker/bmtc/blob/e9abee5075a214b9ea9706a2860a1af843320c95/data/busstops.geojson","sourceRecordName":"Shivajinagar Bus Station","kind":"published public-transport map anchor; simulation only; not a merchant premises or verified loading entrance","mapURL":"https://www.openstreetmap.org/?mlat=12.98368012&mlon=77.6035693#map=18/12.98368012/77.6035693"},{"label":"Town Hall","lat":12.96393155,"lng":77.58425661,"source":"https://github.com/geohacker/bmtc/blob/e9abee5075a214b9ea9706a2860a1af843320c95/data/busstops.geojson","sourceRecordName":"Town Hall","kind":"published public-transport map anchor; simulation only; not a merchant premises or verified loading entrance","mapURL":"https://www.openstreetmap.org/?mlat=12.96393155&mlon=77.58425661#map=18/12.96393155/77.58425661"}],"stores":[{"name":"Grozo Demo Market One \u00b7 Simulated","point":0,"pinCode":"560002"},{"name":"Grozo Demo Market Two \u00b7 Simulated","point":1,"pinCode":"560051"}],"addresses":[{"point":2,"pinCode":"560002","houseNumber":"DEMO Unit C01 (simulated)"},{"point":1,"pinCode":"560051","houseNumber":"DEMO Unit C02 (simulated)"}],"products":[{"id":"milk","name":"Toned milk","category":"Dairy","packSize":"500","unit":"ml","pricePaise":3200,"mrpPaise":4000,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/milk.webp","categorySlug":"dairy"},{"id":"bananas","name":"Bananas","category":"Fruit and vegetables","packSize":"500","unit":"g","pricePaise":4500,"mrpPaise":5000,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/bananas.webp","categorySlug":"fruit-and-vegetables"},{"id":"flour","name":"Whole wheat flour","category":"Staples","packSize":"1","unit":"kg","pricePaise":6200,"mrpPaise":7000,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/flour.webp","categorySlug":"staples"},{"id":"eggs","name":"Farm eggs","category":"Dairy","packSize":"6","unit":"pcs","pricePaise":5500,"mrpPaise":6000,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/eggs.webp","categorySlug":"dairy"},{"id":"rice","name":"Long grain rice","category":"Staples","packSize":"1","unit":"kg","pricePaise":8500,"mrpPaise":9500,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/rice.webp","categorySlug":"staples"},{"id":"bread","name":"Sandwich bread","category":"Bakery","packSize":"400","unit":"g","pricePaise":4500,"mrpPaise":5000,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/bread.webp","categorySlug":"bakery"},{"id":"oil","name":"Cooking oil","category":"Cooking essentials","packSize":"1","unit":"l","pricePaise":14500,"mrpPaise":16000,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/oil.webp","categorySlug":"cooking-essentials"},{"id":"biscuits","name":"Plain biscuits","category":"Snacks","packSize":"200","unit":"g","pricePaise":4000,"mrpPaise":4500,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/biscuits.webp","categorySlug":"snacks"},{"id":"tea","name":"Black tea leaves","category":"Beverages","packSize":"250","unit":"g","pricePaise":12000,"mrpPaise":13500,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/tea.webp","categorySlug":"beverages"},{"id":"oranges","name":"Oranges","category":"Fruit and vegetables","packSize":"500","unit":"g","pricePaise":6000,"mrpPaise":7000,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/oranges.webp","categorySlug":"fruit-and-vegetables"},{"id":"cleaner","name":"Household cleaning spray","category":"Household essentials","packSize":"500","unit":"ml","pricePaise":10000,"mrpPaise":12000,"stockQty":24,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/cleaner.webp","categorySlug":"household-essentials"},{"id":"tomatoes","name":"Tomatoes","category":"Fruit and vegetables","packSize":"500","unit":"g","pricePaise":2800,"mrpPaise":3500,"stockQty":0,"imageUrl":"https://raw.githubusercontent.com/MohdKabir958/bilnkit-clone/0d2b149887bad33e8db1a7e91898d72f6904b9e6/demo/assets/products/tomatoes.webp","categorySlug":"fruit-and-vegetables"}]}$grozo_data$::jsonb;
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
