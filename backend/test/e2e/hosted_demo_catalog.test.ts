import { readFileSync } from 'fs';
import path from 'path';
import supertest from 'supertest';
import { prisma } from '../harness/db';
import { createTestApp } from '../harness/app';
import { generateTestToken } from '../harness/auth';

jest.setTimeout(60000);

describe('Operator demo SQL through the current customer marketplace API', () => {
  const namespace = 'gzhostdemo-blr';
  const customerId = 'hosted-seed-test-customer';
  const realOwnerId = 'hosted-seed-test-existing-owner';
  const otherCityId = 'hosted-seed-test-other-city';
  const cityId = `${namespace}-city`;
  const categoryId = `${namespace}-cat-grocery-stores`;
  const storeIds = [`${namespace}-store-1`, `${namespace}-store-2`];
  const application = createTestApp();
  const request = supertest(application.app);
  const source = readFileSync(path.resolve(__dirname, '../../../Docs/demo/seed-hosted-catalog.sql'), 'utf8');
  const sql = source.match(/DO \$grozo_seed\$[\s\S]*?\$grozo_seed\$;/)![0];
  const seed = () => prisma.$executeRawUnsafe(sql);
  const auth = (id = customerId, role: 'STUDENT' | 'VENDOR' = 'STUDENT') => ({
    Authorization: `Bearer ${generateTestToken({ id, role, phone: '', tv: id === customerId ? 7 : 0 })}`,
  });
  const addressBody = (chosenCity = cityId) => ({
    cityId: chosenCity, country: 'IN', label: 'Demo · Simulated',
    houseNumber: 'DEMO Unit C01 (simulated)', street: 'Town Hall', locality: 'Town Hall',
    pinCode: '560002', lat: 12.96393155, lng: 77.58425661, isDefault: true,
    instructions: 'Simulation only. No real delivery.',
  });
  const nearby = (addressId: string) => request
    .get('/api/v1/vendors/nearby')
    .query({ addressId, marketplace: '1', limit: '50' }).set(auth());
  async function saveAddress(chosenCity = cityId) {
    const response = await request.post('/api/v1/addresses').set(auth()).send(addressBody(chosenCity));
    expect(response.status).toBe(201);
    return response.body.data.id as string;
  }
  async function clean() {
    // Jest setup also refuses any DATABASE_URL not ending in _test.
    if (process.env.NODE_ENV !== 'test' || !new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) {
      throw new Error('A dedicated disposable test database is required.');
    }
    await prisma.address.deleteMany({ where: { customerId } });
    await prisma.menuItem.deleteMany({ where: { vendorId: { in: storeIds } } });
    await prisma.vendor.deleteMany({ where: { id: { in: storeIds } } });
    await prisma.user.deleteMany({ where: { id: { in: [customerId, realOwnerId, `${namespace}-vendor-1`, `${namespace}-vendor-2`] } } });
    await prisma.deliveryZone.deleteMany({ where: { id: `${namespace}-zone` } });
    await prisma.city.deleteMany({ where: { id: { in: [cityId, otherCityId] } } });
    await prisma.category.deleteMany({ where: { id: { startsWith: `${namespace}-cat-` } } });
  }
  beforeEach(async () => {
    await clean();
    await prisma.user.create({ data: {
      id: customerId, name: 'Synthetic existing customer', role: 'STUDENT',
      clerkUserId: 'user_SyntheticHostedSeedCustomer', kraveoCoins: 123, tokenVersion: 7,
    } });
    await seed();
  });
  afterAll(async () => {
    await clean();
    application.io.close();
    await prisma.$disconnect();
  });

  test('the exact app discovery request returns two owned/category-linked stores and 24 photographed products', async () => {
    const customerBefore = await prisma.user.findUniqueOrThrow({ where: { id: customerId } });
    const addressId = await saveAddress();
    const result = await nearby(addressId);
    expect(result.status).toBe(200);
    expect(result.body.data.map((row: any) => row.id).sort()).toEqual(storeIds);
    for (const store of result.body.data) {
      expect(store.primaryCategoryId).toBe(categoryId);
      expect(store.menuItems).toHaveLength(12);
      expect(store.menuItems.every((item: any) => item.imageUrl.startsWith('https://raw.githubusercontent.com/'))).toBe(true);
      expect(store.name).toContain('Simulated');
    }
    expect(await prisma.stockMovement.count({ where: { item: { vendorId: { in: storeIds } } } })).toBe(22);
    expect(await prisma.user.findUnique({ where: { id: customerId } })).toEqual(customerBefore);
    const owners = await prisma.user.findMany({ where: { id: { in: [`${namespace}-vendor-1`, `${namespace}-vendor-2`] } } });
    expect(owners).toHaveLength(2);
    for (const owner of owners) {
      expect(owner).toMatchObject({ role: 'VENDOR', clerkUserId: null, email: null, phone: null, googleSub: null, passwordHash: null });
    }
  });

  test('rerunning upgrades the old unowned seed but preserves edits, stock and suspended/open status', async () => {
    const itemId = `${storeIds[0]}-milk`;
    await prisma.vendor.updateMany({ where: { id: { in: storeIds } }, data: { userId: null, primaryCategoryId: null } });
    await prisma.vendor.update({ where: { id: storeIds[0] }, data: { approvalStatus: 'SUSPENDED', isAcceptingOrders: false } });
    await prisma.menuItem.update({ where: { id: itemId }, data: { stockQty: 7, name: 'Edited synthetic milk pack', stockVersion: 1 } });
    await seed();
    expect(await prisma.menuItem.findUnique({ where: { id: itemId } })).toMatchObject({ stockQty: 7, stockVersion: 1, name: 'Edited synthetic milk pack' });
    expect(await prisma.vendor.findUnique({ where: { id: storeIds[0] } })).toMatchObject({
      approvalStatus: 'SUSPENDED', isAcceptingOrders: false, userId: `${namespace}-vendor-1`, primaryCategoryId: categoryId,
    });
    expect(await prisma.menuItem.count({ where: { vendorId: { in: storeIds } } })).toBe(24);
    expect(await prisma.stockMovement.count({ where: { item: { vendorId: { in: storeIds } } } })).toBe(22);
    const visible = await nearby(await saveAddress());
    expect(visible.status).toBe(200);
    expect(visible.body.data.map((row: any) => row.id)).toEqual([storeIds[1]]);
  });

  test('a real store owner association is never overwritten by reseeding', async () => {
    const owner = await prisma.user.create({ data: { id: realOwnerId, name: 'Synthetic separately provisioned owner', role: 'VENDOR', clerkUserId: 'user_SyntheticExistingStoreOwner' } });
    await prisma.vendor.update({ where: { id: storeIds[0] }, data: { userId: owner.id } });
    await expect(seed()).rejects.toThrow();
    expect(await prisma.vendor.findUnique({ where: { id: storeIds[0] } })).toMatchObject({ userId: owner.id });
    expect(await prisma.user.findUnique({ where: { id: owner.id } })).toEqual(owner);
  });

  test('a linked Clerk identity on an inert owner causes a conflict rather than account reuse', async () => {
    const id = `${namespace}-vendor-1`;
    await prisma.user.update({ where: { id }, data: { clerkUserId: 'user_SyntheticOwnerConflict' } });
    await expect(seed()).rejects.toThrow();
    expect(await prisma.user.findUnique({ where: { id } })).toMatchObject({ clerkUserId: 'user_SyntheticOwnerConflict' });
  });

  test('discovery still rejects missing authentication and non-customer roles', async () => {
    expect((await request.get('/api/v1/vendors/nearby?marketplace=1')).status).toBe(401);
    expect((await request.get('/api/v1/vendors/nearby?marketplace=1').set(auth(`${namespace}-vendor-1`, 'VENDOR'))).status).toBe(403);
  });

  test('inactive categories and deleted owners are still excluded by the real marketplace filter', async () => {
    const addressId = await saveAddress();
    await prisma.user.update({ where: { id: `${namespace}-vendor-1` }, data: { deletedAt: new Date() } });
    expect((await nearby(addressId)).body.data.map((row: any) => row.id)).toEqual([storeIds[1]]);
    await prisma.category.update({ where: { id: categoryId }, data: { isActive: false } });
    const result = await nearby(addressId);
    expect(result.status).toBe(200);
    expect(result.body.data).toEqual([]);
  });

  test('same-named operational city is not silently rewritten; choosing the explicit demo city makes stores visible', async () => {
    await prisma.city.create({ data: { id: otherCityId, code: otherCityId, name: 'Bengaluru', state: 'Karnataka', active: true } });
    const addressId = await saveAddress(otherCityId);
    await seed();
    expect((await nearby(addressId)).body.data).toEqual([]);
    expect(await prisma.address.findUnique({ where: { id: addressId } })).toMatchObject({ cityId: otherCityId });
    expect(await prisma.city.findUnique({ where: { id: cityId } })).toMatchObject({ name: 'Bengaluru · Demo (simulated)' });
    const edited = await request.put(`/api/v1/addresses/${addressId}`).set(auth()).send(addressBody());
    expect(edited.status).toBe(200);
    const result = await nearby(addressId);
    expect(result.status).toBe(200);
    expect(result.body.data.map((row: any) => row.id).sort()).toEqual(storeIds);
  });
});
