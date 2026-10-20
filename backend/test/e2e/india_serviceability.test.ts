import { randomUUID } from 'crypto';
import supertest from 'supertest';
import { prisma } from '../harness/db';
import { createTestApp } from '../harness/app';
import { generateTestToken } from '../harness/auth';
import { openByHours, kmBetween } from '../../src/services/geography';

describe('India-wide addresses, discovery and checkout', () => {
  const tag = randomUUID().slice(0, 8);
  const request = supertest(createTestApp().app);
  const ids: string[] = [], cities: string[] = [], vendors: string[] = [], items: string[] = [], zones: string[] = [];
  let admin: string, customer: string, other: string, customerId: string;
  let addressA: string, addressB: string;
  const ownerTokens: string[] = [];
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const address = (cityId: string, lat: number, lng: number, pinCode: string, overrides: object = {}) => ({ cityId, lat, lng, pinCode, label: 'Home', locality: 'Central market', houseNumber: 'Flat 14', street: 'Main Road', isDefault: true, ...overrides });
  const cart = (i: number, extra: object = {}) => ({ addressId: i === 0 ? addressA : addressB, vendorId: vendors[i], items: [{ itemId: items[i], quantity: 1 }], clientRequestId: randomUUID(), ...extra });
  const postOrder = (b: object) => request.post('/api/v1/orders').set(auth(customer)).send(b);

  beforeAll(async () => {
    for (const role of ['ADMIN', 'STUDENT', 'STUDENT'] as const) {
      const u = await prisma.user.create({ data: { name: `Geography ${role}`, role } });
      ids.push(u.id);
    }
    admin = generateTestToken({ id: ids[0], role: 'ADMIN', phone: '' });
    customerId = ids[1];
    customer = generateTestToken({ id: customerId, role: 'STUDENT', phone: '' });
    other = generateTestToken({ id: ids[2], role: 'STUDENT', phone: '' });
    const definitions = [
      { code: `bengaluru-${tag}`, name: 'Bengaluru', state: 'Karnataka', lat: 12.9716, lng: 77.5946, pin: '560001' },
      { code: `delhi-${tag}`, name: 'New Delhi', state: 'Delhi', lat: 28.6139, lng: 77.2090, pin: '110001' },
    ];
    for (const [i, d] of definitions.entries()) {
      const city = await request.post('/api/v1/admin/cities').set(auth(admin)).send({ ...d, active: true });
      expect(city.status).toBe(201); cities.push(city.body.data.id);
      const zone = await request.post('/api/v1/admin/zones').set(auth(admin)).send({ cityId: cities[i], name: 'Central zone', centerLat: d.lat, centerLng: d.lng, radiusKm: 4, baseFeePaise: 2000, perKmFeePaise: 100, active: true });
      expect(zone.status).toBe(201); zones.push(zone.body.data.id);
      const partner = await request.post('/api/admin/partners').set(auth(admin)).send({ role: 'VENDOR', name: `Store Owner ${i === 0 ? 'One' : 'Two'}`, phone: `9${String(Date.now()).slice(-7)}${i}1`, password: 'test-only-owner-password', restaurantName: `Market ${tag} ${i}`, category: 'Grocery', address: 'Central market, Main Road', lat: d.lat, lng: d.lng });
      expect(partner.status).toBe(201); vendors.push(partner.body.profileId); ids.push(partner.body.user.id);
      const login = await request.post('/api/auth/partner-login').send({ phone: partner.body.user.phone, password: 'test-only-owner-password', role: 'VENDOR' });
      expect(login.status).toBe(200); ownerTokens.push(login.body.token);
      expect((await request.put(`/api/v1/admin/vendors/${vendors[i]}/location`).set(auth(admin)).send({ cityId: cities[i], pinCode: d.pin, locality: 'Central market', address: 'Main Road store', lat: d.lat, lng: d.lng })).status).toBe(200);
      expect((await request.put(`/api/v1/admin/vendors/${vendors[i]}/coverage/${zones[i]}`).set(auth(admin)).send({ active: true })).status).toBe(200);
      const item = await prisma.menuItem.create({ data: { vendorId: vendors[i], stockQty: 1000, name: 'Milk 1 litre', category: 'Dairy', price: 65, vendorPrice: 60, description: 'Fresh milk', imageUrl: '', isAvailable: true, approvalStatus: 'APPROVED' } });
      items.push(item.id);
      const a = await request.post('/api/v1/addresses').set(auth(customer)).send(address(cities[i], d.lat + 0.001, d.lng, d.pin, { isDefault: i === 0 }));
      expect(a.status).toBe(201);
      if (i === 0) addressA = a.body.data.id; else addressB = a.body.data.id;
    }
  });
  afterAll(async () => {
    const orders = await prisma.order.findMany({ where: { customerId: { in: ids } }, select: { id: true } });
    await prisma.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
    await prisma.address.deleteMany({ where: { customerId: { in: ids } } });
    await prisma.vendor.deleteMany({ where: { id: { in: vendors } } });
    await prisma.deliveryZone.deleteMany({ where: { id: { in: zones } } });
    await prisma.driverPartner.deleteMany({ where: { userId: { in: ids } } });
    await prisma.city.deleteMany({ where: { id: { in: cities } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await prisma.$disconnect();
  });

  test('Bengaluru and Delhi discovery returns only the serviceable store for the selected address', async () => {
    for (const [i, id] of [addressA, addressB].entries()) {
      const r = await request.get(`/api/v1/vendors/nearby?addressId=${id}`).set(auth(customer));
      expect(r.status).toBe(200);
      expect(r.body.data.map((s: any) => s.id)).toEqual([vendors[i]]);
      expect(r.body.data[0].distanceKm).toBeGreaterThan(0);
      expect(r.body.data[0].feePaise).toBeGreaterThan(2000);
      expect(JSON.stringify(r.body)).not.toContain('Flat 14');
    }
  });
  test('six-digit PIN alone cannot make unsupported coordinates serviceable', async () => {
    const a = await request.post('/api/v1/addresses').set(auth(customer)).send(address(cities[0], 13.2, 77.6, '560001', { isDefault: false }));
    expect(a.status).toBe(201);
    const r = await postOrder(cart(0, { addressId: a.body.data.id }));
    expect([r.status, r.body.code]).toEqual([409, 'AREA_UNSUPPORTED']);
  });
  test('the same city label cannot permit a cross-country store order', async () => {
    expect((await postOrder(cart(1, { addressId: addressA }))).body.code).toBe('AREA_UNSUPPORTED');
  });
  test('a customer cannot read, edit, delete, select or quote another customer’s saved address', async () => {
    expect((await request.get('/api/v1/addresses').set(auth(other))).body.data).toEqual([]);
    expect((await request.put(`/api/v1/addresses/${addressA}`).set(auth(other)).send(address(cities[0], 12.97, 77.59, '560001'))).status).toBe(404);
    expect((await request.delete(`/api/v1/addresses/${addressA}`).set(auth(other))).status).toBe(404);
    expect((await request.get(`/api/v1/vendors/nearby?addressId=${addressA}`).set(auth(other))).body.code).toBe('ADDRESS_REQUIRED');
  });
  test('zone prices match the quote and persisted order; client fees and coordinates are ignored', async () => {
    const body = cart(0);
    const quoted = await request.post('/api/v1/orders/quote').set(auth(customer)).send({ addressId: addressA, restaurants: [{ vendorId: vendors[0], items: body.items }] });
    expect(quoted.status).toBe(200);
    const r = await postOrder({ ...body, deliveryFee: 0, totalAmount: 1, lat: 0, lng: 0 });
    expect(r.status).toBe(201);
    expect(r.body.data.totalAmount).toBe(quoted.body.data.total);
    const o = await prisma.order.findUniqueOrThrow({ where: { id: r.body.data.id } });
    expect(o.deliveryFee).toBeGreaterThan(20);
    expect(o.addressId).toBe(addressA);
    expect(o.addressSnapshot).toMatchObject({ city: 'Bengaluru', pinCode: '560001', houseNumber: 'Flat 14' });
    expect(r.body.data.dropoff.lat).toBeCloseTo(12.9726);
    const replay = await postOrder(body);
    expect(replay.status).toBe(200);
    expect(replay.body.data.id).toBe(o.id);
    expect((await postOrder({ ...body, addressId: addressB })).status).toBe(409);
  });
  test('new orders require an owned saved address, including the legacy route', async () => {
    const noAddress = await request.post('/api/orders').set(auth(other)).send(cart(0, { addressId: undefined, dropoffHostel: 'BH1' }));
    expect(noAddress.body.code).toBe('ADDRESS_REQUIRED');
  });
  test('disabling a zone or city blocks checkout after a previously successful discovery', async () => {
    expect((await request.patch(`/api/v1/admin/zones/${zones[0]}`).set(auth(admin)).send({ active: false })).status).toBe(200);
    expect((await postOrder(cart(0))).body.code).toBe('AREA_UNSUPPORTED');
    await request.patch(`/api/v1/admin/zones/${zones[0]}`).set(auth(admin)).send({ active: true });
    await request.patch(`/api/v1/admin/cities/${cities[0]}`).set(auth(admin)).send({ active: false });
    expect((await postOrder(cart(0))).body.code).toBe('AREA_UNSUPPORTED');
    await request.patch(`/api/v1/admin/cities/${cities[0]}`).set(auth(admin)).send({ active: true });
  });
  test('non-admins cannot configure cities, zones or store coverage', async () => {
    for (const token of [customer, other]) {
      expect((await request.post('/api/v1/admin/cities').set(auth(token)).send({})).status).toBe(403);
      expect((await request.put(`/api/v1/admin/vendors/${vendors[0]}/coverage/${zones[0]}`).set(auth(token)).send({ active: true })).status).toBe(403);
    }
    expect((await request.get('/api/v1/admin/geography')).status).toBe(401);
  });
  test.each(['000000', '56000', '5600012', 'ABCDEF'])('invalid Indian PIN %s is rejected', async (pinCode) => {
    expect((await request.post('/api/v1/addresses').set(auth(customer)).send(address(cities[0], 12.97, 77.59, pinCode))).status).toBe(400);
  });
  test('concurrent default-address changes leave exactly one default', async () => {
    const a = await Promise.all([0, 1].map((i) => request.post('/api/v1/addresses').set(auth(customer)).send(address(cities[0], 12.972, 77.595, '560001', { label: `Default ${i}` }))));
    expect(a.map((r) => r.status)).toEqual([201, 201]);
    expect(await prisma.address.count({ where: { customerId, isDefault: true } })).toBe(1);
  });
  test('changing a saved address does not change an existing order’s delivery snapshot', async () => {
    const placed = await postOrder(cart(1));
    expect(placed.status).toBe(201);
    await request.put(`/api/v1/addresses/${addressB}`).set(auth(customer)).send(address(cities[1], 28.615, 77.21, '110001', { houseNumber: 'Flat 99', isDefault: false }));
    const o = await prisma.order.findUniqueOrThrow({ where: { id: placed.body.data.id } });
    expect(o.addressSnapshot).toMatchObject({ houseNumber: 'Flat 14' });
  });
  test('operating hours use India time, including overnight windows', () => {
    const fridayLate = new Date('2026-10-16T18:00:00Z'); // Fri 23:30 IST.
    expect(openByHours([{ day: 5, opens: 1320, closes: 120 }], fridayLate)).toBe(true);
    expect(openByHours([{ day: 5, opens: 1320, closes: 120 }], new Date('2026-10-16T20:00:00Z'))).toBe(true);
    expect(openByHours([{ day: 5, opens: 1320, closes: 120 }], new Date('2026-10-16T22:00:00Z'))).toBe(false);
    expect(openByHours([])).toBe(false);
    expect(kmBetween({ lat: 12.97, lng: 77.59 }, { lat: 28.61, lng: 77.20 })).toBeGreaterThan(1700);
  });
  test('a serviceable doorstep order completes the actual payment, vendor, rider and OTP lifecycle', async () => {
    const r = await postOrder(cart(0));
    expect(r.status).toBe(201);
    const id = r.body.data.id;
    const payment = await request.post('/api/payments/create-order').set(auth(customer)).send({ orderId: id });
    expect(payment.status).toBe(200);
    expect((await request.post('/api/payments/verify-signature').set(auth(customer)).send({ razorpayOrderId: payment.body.razorpayOrderId, razorpayPaymentId: `pay_geo_${tag}`, razorpaySignature: 'test-simulator-only' })).status).toBe(200);
    for (const status of ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']) {
      const update = await request.patch(`/api/orders/${id}/status`).set(auth(ownerTokens[0])).send({ status });
      expect(update.status).toBe(200);
      expect(JSON.stringify(update.body)).not.toContain('Flat 14');
      expect(update.body.data.dropoff).toBeNull();
    }
    const driver = await prisma.user.create({ data: { role: 'DRIVER', name: 'Delivery One' } });
    ids.push(driver.id);
    await prisma.driverPartner.create({ data: { userId: driver.id, name: 'Delivery One', phone: '9000000011', runnerCode: `GEO-${tag}`, vehicleType: 'Cycle', dutyStatus: 'ONLINE', cityId: cities[0] } });
    const driverToken = generateTestToken({ id: driver.id, role: 'DRIVER', phone: '9000000011' });
    expect((await request.post(`/api/orders/${id}/accept-driver`).set(auth(driverToken)).send({})).status).toBe(200);
    for (const status of ['PICKED_UP', 'ARRIVED_AT_GATE']) expect((await request.patch(`/api/orders/${id}/status`).set(auth(driverToken)).send({ status })).status).toBe(200);
    const customerView = await request.get(`/api/orders/${id}`).set(auth(customer));
    expect(customerView.body.data.deliveryAddress).toMatchObject({ city: 'Bengaluru', houseNumber: 'Flat 14' });
    expect((await request.post(`/api/orders/${id}/verify-gate-otp`).set(auth(driverToken)).send({ otpCode: customerView.body.data.otpCode })).status).toBe(200);
    const final = await request.get(`/api/orders/${id}`).set(auth(admin));
    expect(final.body.data.status).toBe('DELIVERED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id } })).deliveredAt).not.toBeNull();
  });
});
