import { prisma } from '../../src/db';

// Real persisted serviceability for the inherited lifecycle suites, not a feature bypass.
// Their customer/store labels remain fixture names; new two-city tests exercise nationwide coverage separately.
export async function ensureFixtureGeography(namespace: string, customerIds: string[], vendorIds: string[], riderUserIds: string[] = []) {
  const cityId = `${namespace}-city`, zoneId = `${namespace}-zone`;
  await prisma.city.upsert({ where: { id: cityId }, create: { id: cityId, code: cityId, name: 'Bhopal', state: 'Madhya Pradesh', active: true }, update: { active: true } });
  await prisma.deliveryZone.upsert({ where: { id: zoneId }, create: { id: zoneId, cityId, name: 'Fixture service area', centerLat: 23.0745, centerLng: 76.859, radiusKm: 10, baseFeePaise: 2500, active: true }, update: { active: true, baseFeePaise: 2500, perKmFeePaise: 0 } });
  for (const customerId of customerIds) {
    await prisma.address.updateMany({where:{customerId},data:{cityId}});
    if (await prisma.address.count({ where: { customerId } }) === 0) await prisma.address.create({ data: { customerId, cityId, label: 'BH2', pinCode: '466114', locality: 'Kothri', houseNumber: 'House 2', street: 'Main Road', lat: 23.0746, lng: 76.859, isDefault: true } });
  }
  if(riderUserIds.length) await prisma.driverPartner.updateMany({where:{userId:{in:riderUserIds}},data:{cityId,serviceZoneId:zoneId}});
  for (const vendorId of vendorIds) {
    await prisma.vendor.update({ where: { id: vendorId }, data: { cityId, lat: 23.0745, lng: 76.859, locationSource: 'ADMIN', locationSetAt: new Date() } });
    await prisma.vendorCoverage.upsert({ where: { vendorId_zoneId: { vendorId, zoneId } }, create: { vendorId, zoneId, active: true }, update: { active: true } });
  }
}
