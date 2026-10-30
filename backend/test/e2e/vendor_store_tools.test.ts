import { randomUUID } from 'crypto';
import { prisma, cleanTestOrders } from '../harness/db';
import { startTestServer, stopTestServer, TestServerInstance } from '../harness/app';
import { createWorld, purgeWorld, createApi, World, Api } from '../harness/journey';

describe('Owned store schedules, stock alerts and preparation reports', () => {
  let server: TestServerInstance, world: World, api: Api;
  beforeAll(async () => {
    server = await startTestServer();
    world = await createWorld('storetools', '8', { customers: 1, vendors: 2, riders: 1 });
    api = createApi(server.baseUrl);
  });
  afterAll(async () => { await cleanTestOrders(); await purgeWorld('storetools'); await stopTestServer(server); await prisma.$disconnect(); });
  test('only the approved owner may change weekly schedules; invalid hours are atomic', async () => {
    const [owner, other] = world.vendors, route = `/api/v1/partner/stores/${owner.vendorId}/preparation`;
    const body = { preparationMinutes: 12, maxPreparingOrders: 4, busyForMinutes: 0, operatingHours: [{ day: 1, opens: 480, closes: 1260 }] };
    expect((await api.raw('other', 'put', route, other.token, body)).status).toBe(404);
    expect((await api.raw('customer', 'put', route, world.customers[0].token, body)).status).toBe(403);
    expect((await api.raw('owner', 'put', route, owner.token, body)).status).toBe(200);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: owner.vendorId } })).operatingHours).toEqual(body.operatingHours);
    expect((await api.raw('owner', 'put', route, owner.token, { ...body, operatingHours: [body.operatingHours[0], body.operatingHours[0]] })).status).toBe(400);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: owner.vendorId } })).operatingHours).toEqual(body.operatingHours);
    expect((await api.raw('owner', 'put', route, owner.token, { ...body, operatingHours: null })).status).toBe(200);
    expect((await prisma.vendor.findUniqueOrThrow({ where: { id: owner.vendorId } })).operatingHours).toBeNull();
  });
  test('reports use persisted owned orders and low-stock alerts without another store data', async () => {
    const [owner, other] = world.vendors, customer = world.customers[0];
    const make = (vendorId: string, status: 'DELIVERED' | 'CANCELLED') => prisma.order.create({ data: { customerId: customer.id, vendorId, status, totalAmount: 100, dropoffHostel: 'Synthetic report fixture', acceptedAt: new Date(Date.now()-20*60000), readyForPickupAt: new Date(Date.now()-8*60000) } });
    await make(owner.vendorId, 'DELIVERED'); await make(owner.vendorId, 'CANCELLED'); await make(other.vendorId, 'DELIVERED');
    await prisma.menuItem.update({ where: { id: owner.items[0].id }, data: { stockQty: 2, lowStockThreshold: 5 } });
    await prisma.stockMovement.create({ data: { menuItemId: owner.items[0].id, kind: 'MISSING', delta: -1, reason: 'Synthetic counted shortage', actorId: owner.id, reference: randomUUID() } });
    const route = `/api/v1/partner/stores/${owner.vendorId}/performance`;
    expect((await api.raw('other', 'get', route, other.token)).status).toBe(404);
    expect((await api.raw('customer', 'get', route, customer.token)).status).toBe(403);
    expect((await api.raw('owner', 'get', route+'?days=900', owner.token)).status).toBe(400);
    const result = await api.raw('owner', 'get', route, owner.token);
    expect(result.status).toBe(200);
    expect(result.body.data).toMatchObject({ orders: 2, delivered: 1, cancelled: 1, stockEvents: [{ kind: 'MISSING', events: 1 }], lowStock: [{ id: owner.items[0].id, stockQty: 2 }] });
    expect(result.body.data.averagePackingMinutes).toBeCloseTo(12, 1);
    await prisma.vendor.update({ where: { id: owner.vendorId }, data: { approvalStatus: 'SUSPENDED' } });
    expect((await api.raw('suspended', 'get', route, owner.token)).status).toBe(403);
  });
});
