import { Prisma } from '@prisma/client';
import { prisma, cleanTestOrders, seedTestDatabase } from '../harness/db';
import { assessFulfillmentCapacity } from '../../src/services/capacity';
import { ownedAddress } from '../../src/services/geography';

const riders = ['flow-capacity-rider-1', 'flow-capacity-rider-2'];
const otherStore = 'flow-capacity-other-store';

beforeEach(async () => {
  await cleanTestOrders();
  const fixtures = await seedTestDatabase();
  await prisma.vendor.update({ where: { id: fixtures.vendor.id }, data: {
    maxPreparingOrders: 1, busyUntil: null, operatingHours: Prisma.DbNull,
  } });
  await prisma.driverPartner.update({ where: { id: 'usr-4' }, data: { dutyStatus: 'OFFLINE' } });
  for (const [i, id] of riders.entries()) {
    await prisma.user.create({ data: { id, name: 'Synthetic capacity rider', role: 'DRIVER' } });
    await prisma.driverPartner.create({ data: {
      id, userId: id, name: 'Synthetic capacity rider', phone: `900000055${i}`,
      vehicleType: 'Cycle',
      runnerCode: `FLOW-CAP-${i}`, dutyStatus: 'ONLINE', approvalStatus: 'APPROVED',
      cityId: 'seed-city', serviceZoneId: 'seed-zone', availabilityAt: new Date(),
      availabilityLat: 23.0745, availabilityLng: 76.859,
    } });
  }
  await prisma.vendor.create({ data: { id: otherStore, userId: fixtures.vendorUser.id,
    name: 'Synthetic second store', category: 'Groceries', address: 'Synthetic pickup',
    bannerImage: '', cityId: 'seed-city' } });
});

afterEach(async () => {
  await cleanTestOrders();
  await prisma.driverPartner.deleteMany({ where: { id: { in: riders } } });
  await prisma.user.deleteMany({ where: { id: { in: riders } } });
  await prisma.vendor.deleteMany({ where: { id: otherStore } });
  await prisma.vendor.update({ where: { id: 'ven-1' }, data: { maxPreparingOrders: 10 } });
  await prisma.driverPartner.update({ where: { id: 'usr-4' }, data: { dutyStatus: 'ONLINE' } });
});
afterAll(() => prisma.$disconnect());

async function packingOrder(vendorId: string, driverId: string | null = null) {
  return prisma.order.create({ data: {
    vendorId, customerId: 'usr-1', driverId, workflowVersion: 2,
    status: 'PREPARING', paymentMethod: 'COD', paymentStatus: 'PENDING',
    subtotal: 75, vendorSubtotal: 75, totalAmount: 100, deliveryFee: 25,
    dropoffHostel: 'Synthetic saved address',
  } });
}
async function assess(excludeOrderId?: string) {
  const address = await ownedAddress(prisma, 'usr-1');
  return assessFulfillmentCapacity(prisma, 'ven-1', address, { excludeOrderId });
}

test('another store pending order does not consume this store packing limit', async () => {
  await packingOrder(otherStore);
  expect(await assess()).toMatchObject({ canCheckout: true, onlineAllowed: true, pendingOrders: 1 });
});
test('preparing orders assigned to a rider still fill the store packing limit', async () => {
  await packingOrder('ven-1', 'usr-4');
  expect(await assess()).toMatchObject({ canCheckout: false, reason: 'STORE_AT_CAPACITY', pendingOrders: 0 });
});
test('an unassigned order still fills the store limit', async () => {
  await packingOrder('ven-1');
  expect(await assess()).toMatchObject({ canCheckout: false, reason: 'STORE_AT_CAPACITY' });
});
test('rechecking an existing order excludes it from both demand and store workload', async () => {
  const existing = await packingOrder('ven-1');
  expect(await assess(existing.id)).toMatchObject({ canCheckout: true, onlineAllowed: true, pendingOrders: 0 });
});
