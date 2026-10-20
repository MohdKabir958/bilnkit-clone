import { randomUUID } from 'crypto';
import supertest from 'supertest';
import { prisma } from '../harness/db';
import { createTestApp } from '../harness/app';
import { generateTestToken } from '../harness/auth';
import { runOrderMaintenance } from '../../src/services/orderMaintenance';
import { ensureFixtureGeography } from '../harness/geography';

describe('Grocery SKU inventory and independent store orders', () => {
  const tag = `grocery-${randomUUID().slice(0,8)}`, req = supertest(createTestApp().app);
  const users: string[] = [], vendors: string[] = [], tokens: string[] = [], products: any[][] = [[], []];
  let admin: string, customer: string, second: string, categoryId: string;
  const h = (t: string) => ({ Authorization: `Bearer ${t}` });
  const definition = (sku: string, extra: object = {}) => ({ name: `Milk ${sku}`, sku, productKey: 'fresh-milk', description: 'Sealed grocery pack', unit: 'ml', packSize: '500', pricePaise: 6545, mrpPaise: 7000, categoryId, isAvailable: true, imageUrls: [], taxRateBps: 500, ...extra });
  const addStock = (m: any, delta: number, token = tokens[0], extra: object = {}) => req.post(`/api/v1/products/${m.id}/stock`).set(h(token)).send({ delta, reason: 'Counted received stock', expectedVersion: m.stockVersion, clientRequestId: randomUUID(), ...extra });
  const order = (i: number, token = customer, extra: object = {}) => req.post('/api/v1/orders').set(h(token)).send({ vendorId: vendors[i], items: [{ itemId: products[i][0].id, quantity: 2 }], clientRequestId: randomUUID(), ...extra });
  beforeAll(async () => {
    for (const role of ['ADMIN','STUDENT','STUDENT'] as const) {
      const u = await prisma.user.create({ data: { name: 'Grocery Tester', role } }); users.push(u.id);
    }
    [admin, customer, second] = users.map((id, i) => generateTestToken({ id, role: i === 0 ? 'ADMIN' : 'STUDENT', phone: '' }));
    const c = await req.post('/api/admin/categories').set(h(admin)).send({ name: `Dairy ${tag}`, forDishes: true, forRestaurants: false });
    expect(c.status).toBe(201); categoryId = c.body.data.id;
    for (let i = 0; i < 2; i++) {
      const v = await req.post('/api/admin/partners').set(h(admin)).send({ role: 'VENDOR', name: `Grocery Owner ${i}`, phone: `9${String(Date.now()).slice(-7)}${i}7`, password: 'test-grocery-owner-password', restaurantName: `Grocery ${tag} ${i}`, category: 'Groceries', address: 'Main Road' });
      expect(v.status).toBe(201); vendors.push(v.body.profileId); users.push(v.body.user.id);
      const login = await req.post('/api/auth/partner-login').send({ phone: v.body.user.phone, password: 'test-grocery-owner-password', role: 'VENDOR' });
      expect(login.status).toBe(200); tokens.push(login.body.token);
    }
    await ensureFixtureGeography(tag, users.slice(1,3), vendors);
  });
  afterAll(async () => {
    await prisma.order.deleteMany({ where: { customerId: { in: users } } });
    await prisma.orderGroup.deleteMany({ where: { customerId: { in: users } } });
    await prisma.address.deleteMany({ where: { customerId: { in: users } } });
    await prisma.vendor.deleteMany({ where: { id: { in: vendors } } });
    await prisma.deliveryZone.deleteMany({ where: { cityId: `${tag}-city` } });
    await prisma.driverPartner.deleteMany({where:{userId:{in:users}}});
    await prisma.city.deleteMany({ where: { id: `${tag}-city` } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    if (categoryId) await prisma.category.delete({ where: { id: categoryId } });
    await prisma.$disconnect();
  });
  test('vendor A creates 50 persisted SKUs and vendor B creates 30 with no fixed catalog cap', async () => {
    for (const i of [0,1]) for (let n = 0; n < (i === 0 ? 50 : 30); n++) {
      const r = await req.post(`/api/v1/vendors/${vendors[i]}/products`).set(h(tokens[i])).send(definition(`PACK-${n}`, { productKey: n < 2 ? 'fresh-milk' : `grocery-${n}`, packSize: n === 1 ? '1000' : '500' }));
      expect(r.status).toBe(201); expect(r.body.data.approvalStatus).toBe('PENDING');
      const m = r.body.data; products[i].push(m);
      expect((await addStock(m, 20, tokens[i])).status).toBe(200);
      const approve = await req.post(`/api/admin/catalog/${m.id}/approve`).set(h(admin)).send({});
      expect(approve.status).toBe(200);
    }
    expect(await prisma.menuItem.count({ where: { vendorId: vendors[0] } })).toBe(50);
    expect(await prisma.menuItem.count({ where: { vendorId: vendors[1] } })).toBe(30);
  });
  test('customer pagination and search return all serviceable products with precise MRP/pack/prices', async () => {
    let after = '', ids: string[] = [];
    do {
      const r = await req.get(`/api/v1/vendors/${vendors[0]}/products?limit=17${after ? `&after=${after}` : ''}`).set(h(customer));
      expect(r.status).toBe(200); ids.push(...r.body.data.map((m: any) => m.id)); after = r.body.nextCursor;
      expect(r.body.data[0]).toMatchObject({ pricePaise: 6545, mrpPaise: 7000, discountPaise: 455, unit: 'ml' });
    } while (after);
    expect(new Set(ids).size).toBe(50);
    const search = await req.get(`/api/v1/vendors/${vendors[1]}/products?q=PACK-29&categoryId=${categoryId}`).set(h(customer));
    expect(search.body.data.map((m: any) => m.sku)).toEqual(['PACK-29']);
    const detail = await req.get(`/api/v1/products/${products[0][0].id}`).set(h(customer));
    expect(detail.body.data.variants.map((m: any) => m.packSize).sort()).toEqual(['1000','500']);
  });
  test('vendor ownership, customer writes and cross-store stock access are rejected', async () => {
    expect((await req.put(`/api/v1/products/${products[0][0].id}`).set(h(tokens[1])).send(definition('OTHER'))).status).toBe(404);
    expect((await addStock(products[0][0], 5, tokens[1])).status).toBe(404);
    expect((await req.get(`/api/v1/vendors/${vendors[0]}/products`).set(h(tokens[1]))).status).toBe(404);
    expect((await addStock(products[0][0], 5, customer)).status).toBe(403);
    expect((await req.get('/api/v1/admin/products').set(h(tokens[0]))).status).toBe(403);
  });
  test('both stores accept independent orders and server totals ignore injected prices', async () => {
    for (let i = 0; i < 2; i++) {
      const r = await order(i, customer, { price: 0.01, totalAmount: 0, items: [{ itemId: products[i][0].id, quantity: 2, price: 0.01 }] });
      expect(r.status).toBe(201); const o = r.body.data;
      expect(Math.round(o.subtotal * 100)).toBe(13090);
      expect(Math.round(o.totalAmount * 100)).toBe(15590);
      expect(o.items[0].productSnapshot).toMatchObject({ sku: 'PACK-0', unit: 'ml', packSize: '500', pricePaise: 6545, taxIncluded: true });
      expect(await prisma.inventoryReservation.count({ where: { orderId: o.id, state: 'HELD' } })).toBe(1);
      const pay = await req.post('/api/payments/create-order').set(h(customer)).send({ orderId: o.id });
      expect(pay.status).toBe(200);
      expect((await req.post('/api/payments/verify-signature').set(h(customer)).send({ razorpayOrderId: pay.body.razorpayOrderId, razorpayPaymentId: `pay_grocery_${o.id}`, razorpaySignature: 'test-simulator' })).status).toBe(200);
      expect((await req.patch(`/api/orders/${o.id}/status`).set(h(tokens[i])).send({ status: 'ACCEPTED' })).status).toBe(200);
    }
  });
  test('only one of two simultaneous customers can reserve the last pack', async () => {
    const m = await prisma.menuItem.update({ where: { id: products[0][1].id }, data: { stockQty: 1 } });
    const body = { items: [{ itemId: m.id, quantity: 1 }] };
    const rs = await Promise.all([order(0, customer, body), order(0, second, body)]);
    expect(rs.map((r) => r.status).sort()).toEqual([201,409]);
    expect(rs.find((r) => r.status === 409)!.body.code).toBe('OUT_OF_STOCK');
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: m.id } })).stockQty).toBe(0);
    expect(await prisma.inventoryReservation.count({ where: { menuItemId: m.id, state: 'HELD' } })).toBe(1);
    const winner = rs.find((r) => r.status === 201)!;
    const who = rs[0] === winner ? customer : second;
    expect((await req.post(`/api/orders/${winner.body.data.id}/cancel`).set(h(who)).send({ reason: 'Changed mind' })).status).toBe(200);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: m.id } })).stockQty).toBe(1);
    await req.post(`/api/orders/${winner.body.data.id}/cancel`).set(h(who)).send({ reason: 'Repeat' });
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: m.id } })).stockQty).toBe(1);
  });
  test('duplicate cart lines aggregate inventory and failed checkout rolls back all decrements', async () => {
    const id = products[0][2].id;
    await prisma.menuItem.update({ where: { id }, data: { stockQty: 1 } });
    const r = await order(0, customer, { items: [{ itemId: id, quantity: 1 }, { itemId: id, quantity: 1 }] });
    expect(r.status).toBe(409);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id } })).stockQty).toBe(1);
    const other = products[0][3].id;
    const before = (await prisma.menuItem.findUniqueOrThrow({ where: { id: other } })).stockQty;
    expect((await order(0, customer, { items: [{ itemId: other, quantity: 1 }, { itemId: id, quantity: 2 }] })).status).toBe(409);
    expect((await prisma.menuItem.findUniqueOrThrow({ where: { id: other } })).stockQty).toBe(before);
  });
  test('stock adjustments are versioned, idempotent, audited and cannot make stock negative', async () => {
    const m = await prisma.menuItem.findUniqueOrThrow({ where: { id: products[0][4].id } });
    const clientRequestId = randomUUID();
    expect((await addStock(m, 5, tokens[0], { clientRequestId })).status).toBe(200);
    expect((await addStock(m, 5, tokens[0], { clientRequestId })).status).toBe(200);
    expect((await addStock(m, 6, tokens[0], { clientRequestId })).status).toBe(409);
    expect((await addStock(m, 1)).body.code).toBe('STOCK_CHANGED');
    const fresh = await prisma.menuItem.findUniqueOrThrow({ where: { id: m.id } });
    expect(fresh.stockQty).toBe(25);
    expect((await addStock(fresh, -26)).status).toBe(400);
    const history = await req.get(`/api/v1/products/${m.id}/stock-movements`).set(h(tokens[0]));
    expect(history.body.data.filter((r: any) => r.reference.endsWith(clientRequestId))).toHaveLength(1);
    expect(await prisma.adminAuditLog.count({ where: { targetId: m.id, action: 'STOCK_ADJUSTED' } })).toBe(2);
  });
  test('price above MRP, invalid unit, fractional stock and duplicate SKUs are refused', async () => {
    for (const extra of [{ mrpPaise: 6000 }, { unit: 'bucket' }, { pricePaise: 12.5 }]) expect((await req.post(`/api/v1/vendors/${vendors[0]}/products`).set(h(tokens[0])).send(definition(`BAD-${randomUUID()}`, extra))).status).toBe(400);
    expect((await req.post(`/api/v1/vendors/${vendors[0]}/products`).set(h(tokens[0])).send(definition('PACK-0'))).status).toBe(409);
    const m = await prisma.menuItem.findUniqueOrThrow({ where: { id: products[0][4].id } }); expect((await addStock(m, 0.5)).status).toBe(400);
  });
  test('stock quote reports shortage before checkout and idempotent replay never reserves twice', async () => {
    const itemId = products[1][8].id;
    await prisma.menuItem.update({where:{id:itemId},data:{stockQty:1}});
    const quote = await req.post('/api/v1/orders/quote').set(h(second)).send({restaurants:[{vendorId:vendors[1],items:[{itemId,quantity:2}]}]});
    expect([quote.status,quote.body.code]).toEqual([409,'OUT_OF_STOCK']);
    const clientRequestId = randomUUID(), body = {items:[{itemId,quantity:1}],clientRequestId};
    const r = await order(1,second,body); expect(r.status).toBe(201);
    const replay = await order(1,second,body); expect(replay.status).toBe(200); expect(replay.body.data.id).toBe(r.body.data.id);
    expect((await prisma.menuItem.findUniqueOrThrow({where:{id:itemId}})).stockQty).toBe(0);
    expect(await prisma.stockMovement.count({where:{menuItemId:itemId,kind:'RESERVE'}})).toBe(1);
    expect(JSON.stringify(r.body.data.items)).not.toContain('vendorUnitPaise');
  });
  test('expiry maintenance releases an unpaid reservation exactly once', async () => {
    const itemId=products[1][9].id;
    const r=await order(1,second,{items:[{itemId,quantity:3}]});expect(r.status).toBe(201);
    const payment=await req.post('/api/payments/create-order').set(h(second)).send({orderId:r.body.data.id});expect(payment.status).toBe(200);
    await prisma.order.update({where:{id:r.body.data.id},data:{createdAt:new Date(Date.now()-20*60000)}});
    await runOrderMaintenance();await runOrderMaintenance();
    expect((await prisma.order.findUniqueOrThrow({where:{id:r.body.data.id}})).status).toBe('CANCELLED');
    expect((await prisma.menuItem.findUniqueOrThrow({where:{id:itemId}})).stockQty).toBe(20);
    expect(await prisma.stockMovement.count({where:{menuItemId:itemId,kind:'RELEASE'}})).toBe(1);
  });
  test('a failed split checkout rolls back the other store’s reservation', async () => {
    const a=products[0][10].id,b=products[1][10].id;
    await prisma.menuItem.update({where:{id:b},data:{stockQty:0}});
    const r=await req.post('/api/v1/order-groups').set(h(second)).send({restaurants:[{vendorId:vendors[0],items:[{itemId:a,quantity:1}]},{vendorId:vendors[1],items:[{itemId:b,quantity:1}]}],clientRequestId:randomUUID()});
    expect([r.status,r.body.code]).toEqual([409,'OUT_OF_STOCK']);
    expect((await prisma.menuItem.findUniqueOrThrow({where:{id:a}})).stockQty).toBe(20);
    expect(await prisma.inventoryReservation.count({where:{menuItemId:{in:[a,b]}}})).toBe(0);
  });
  test('delivery consumes reserved packs; an admin cancellation after pickup records loss without restocking', async () => {
    const rider=await prisma.user.create({data:{name:'Grocery Rider',role:'DRIVER'}});users.push(rider.id);
    await prisma.driverPartner.create({data:{userId:rider.id,name:'Grocery Rider',phone:'9000000059',runnerCode:tag,vehicleType:'Bike',dutyStatus:'ONLINE',cityId:`${tag}-city`}});
    const riderToken=generateTestToken({id:rider.id,role:'DRIVER',phone:'9000000059'});
    for(const delivered of [true,false]) {
      const itemId=products[1][delivered?11:12].id;
      const r=await order(1,second,{items:[{itemId,quantity:2}]});expect(r.status).toBe(201);const id=r.body.data.id;
      const pay=await req.post('/api/payments/create-order').set(h(second)).send({orderId:id});
      expect((await req.post('/api/payments/verify-signature').set(h(second)).send({razorpayOrderId:pay.body.razorpayOrderId,razorpayPaymentId:`pay_inventory_${id}`,razorpaySignature:'test-only'})).status).toBe(200);
      for(const status of ['ACCEPTED','PREPARING','READY_FOR_PICKUP']) expect((await req.patch(`/api/orders/${id}/status`).set(h(tokens[1])).send({status})).status).toBe(200);
      expect((await req.post(`/api/orders/${id}/accept-driver`).set(h(riderToken)).send({})).status).toBe(200);
      expect((await req.patch(`/api/orders/${id}/status`).set(h(riderToken)).send({status:'PICKED_UP'})).status).toBe(200);
      if(delivered) {
        expect((await req.patch(`/api/orders/${id}/status`).set(h(riderToken)).send({status:'ARRIVED_AT_GATE'})).status).toBe(200);
        const view=await req.get(`/api/orders/${id}`).set(h(second));
        expect((await req.post(`/api/orders/${id}/verify-gate-otp`).set(h(riderToken)).send({otpCode:view.body.data.otpCode})).status).toBe(200);
      } else expect((await req.post(`/api/admin/orders/${id}/cancel`).set(h(admin)).send({reason:'Delivery damaged after pickup'})).status).toBe(200);
      expect((await prisma.menuItem.findUniqueOrThrow({where:{id:itemId}})).stockQty).toBe(18);
      expect((await prisma.inventoryReservation.findFirstOrThrow({where:{orderId:id}})).state).toBe('CONSUMED');
      expect(await prisma.stockMovement.count({where:{menuItemId:itemId,kind:delivered?'SOLD':'LOSS'}})).toBe(1);
    }
  });
  test('concurrent stock counts with the same version cannot silently overwrite each other', async () => {
    const m=await prisma.menuItem.findUniqueOrThrow({where:{id:products[0][13].id}});
    const rs=await Promise.all([addStock(m,3),addStock(m,7)]);
    expect(rs.map((r)=>r.status).sort()).toEqual([200,409]);
    expect([23,27]).toContain((await prisma.menuItem.findUniqueOrThrow({where:{id:m.id}})).stockQty);
  });
  test('split quotes and charges add actual store-zone fees, including different zone prices', async () => {
    const zone = await req.post('/api/v1/admin/zones').set(h(admin)).send({cityId:`${tag}-city`,name:'Second store coverage',centerLat:23.0745,centerLng:76.859,radiusKm:10,baseFeePaise:1900,perKmFeePaise:0,active:true});
    expect(zone.status).toBe(201);
    expect((await req.put(`/api/v1/admin/vendors/${vendors[1]}/coverage/${tag}-zone`).set(h(admin)).send({active:false})).status).toBe(200);
    expect((await req.put(`/api/v1/admin/vendors/${vendors[1]}/coverage/${zone.body.data.id}`).set(h(admin)).send({active:true})).status).toBe(200);
    const restaurants = vendors.map((vendorId,i)=>({vendorId,items:[{itemId:products[i][20].id,quantity:1}]}));
    const quote = await req.post('/api/v1/orders/quote').set(h(second)).send({restaurants});
    expect(quote.status).toBe(200);expect(quote.body.data.fees).toMatchObject({total:44,base:25,extraRestaurantFee:19,extraTotal:19});
    const placed = await req.post('/api/v1/order-groups').set(h(second)).send({restaurants,clientRequestId:randomUUID()});
    expect(placed.status).toBe(201);expect(placed.body.data.total).toBe(quote.body.data.total);
    expect(placed.body.data.orders.map((o:any)=>o.deliveryFee)).toEqual([25,19]);
    expect(Math.round(placed.body.data.orders.reduce((sum:number,o:any)=>sum+o.totalAmount,0)*100)).toBe(Math.round(quote.body.data.total*100));
  });
  test('the database MRP guard protects inherited admin repricing without changing the selling price', async () => {
    const id=products[0][25].id;
    const change=await req.patch(`/api/admin/catalog/${id}`).set(h(admin)).send({vendorPrice:100});
    expect([change.status,change.body.code]).toEqual([400,'PRICE_EXCEEDS_MRP']);
    expect((await prisma.menuItem.findUniqueOrThrow({where:{id}})).price).toBe(65.45);
    await expect(prisma.menuItem.update({where:{id},data:{price:71}})).rejects.toThrow(/MenuItem_price_mrp/);
  });
  test('vendor metadata edits require moderation and keep existing order snapshots unchanged', async () => {
    const m = products[0][0];
    const r = await req.put(`/api/v1/products/${m.id}`).set(h(tokens[0])).send(definition('PACK-0', { packSize: '750', pricePaise: 6800 }));
    expect(r.status).toBe(200); expect(r.body.data.approvalStatus).toBe('PENDING');
    expect((await req.get(`/api/v1/products/${m.id}`).set(h(customer))).status).toBe(404);
    const old = await prisma.orderItem.findFirstOrThrow({ where: { menuItemId: m.id } });
    expect(old.productSnapshot).toMatchObject({ packSize: '500', pricePaise: 6545 });
  });
});
