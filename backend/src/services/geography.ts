import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';

export type GeoDb = Prisma.TransactionClient | typeof prisma;
export const geoError = (field: string, message: string) => new AppError(400, 'BAD_ADDRESS', message, field);
export const indianPoint = (lat: unknown, lng: unknown): lat is number =>
  typeof lat === 'number' && typeof lng === 'number' && Number.isFinite(lat) && Number.isFinite(lng) && lat >= 6 && lat <= 38 && lng >= 68 && lng <= 98;
export const text = (raw: unknown, field: string, max: number, required = true): string => {
  if (raw == null && !required) return '';
  if (typeof raw !== 'string' || /[\x00-\x1f\x7f]/.test(raw) || raw.trim().length > max || (required && !raw.trim())) throw geoError(field, `Enter a valid ${field} (up to ${max} characters).`);
  return raw.trim();
};
export const kmBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
  const rad = Math.PI / 180;
  const dlat = (b.lat - a.lat) * rad, dlng = (b.lng - a.lng) * rad;
  const h = Math.sin(dlat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dlng / 2) ** 2;
  return 6371.0088 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(Math.max(0, 1 - h)));
};
export type Hours = { day: number; opens: number; closes: number }[];
export const validateHours = (raw: unknown): Hours | null => {
  if (raw == null) return null; // Manual open/close only.
  if (!Array.isArray(raw) || raw.length > 7) throw geoError('operatingHours', 'Use at most one opening interval for each day (0 Sunday to 6 Saturday).');
  const seen = new Set<number>();
  for (const h of raw) {
    if (!h || !Number.isInteger(h.day) || h.day < 0 || h.day > 6 || seen.has(h.day) || !Number.isInteger(h.opens) || !Number.isInteger(h.closes) || h.opens < 0 || h.opens > 1439 || h.closes < 0 || h.closes > 1440 || h.opens === h.closes) throw geoError('operatingHours', 'Opening/closing times must be minutes after midnight; duplicate days and empty intervals are invalid.');
    seen.add(h.day);
  }
  return raw.map((h) => ({ day: h.day, opens: h.opens, closes: h.closes }));
};
export const openByHours = (raw: unknown, now = new Date()): boolean => {
  if (raw == null) return true;
  let hours: Hours | null;
  try { hours = validateHours(raw); } catch { return false; }
  const local = new Date(now.getTime() + 330 * 60_000);
  const day = local.getUTCDay(), minute = local.getUTCHours() * 60 + local.getUTCMinutes();
  return !!hours?.some((h) => h.opens < h.closes
    ? h.day === day && minute >= h.opens && minute < h.closes
    : (h.day === day && minute >= h.opens) || ((h.day + 1) % 7 === day && minute < h.closes));
};

export async function ownedAddress(db: GeoDb, customerId: string, addressId?: unknown, lock = false) {
  if (addressId !== undefined && addressId !== null && (typeof addressId !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(addressId))) throw geoError('addressId', 'Choose a saved delivery address.');
  const address = await db.address.findFirst({ where: { customerId, ...(addressId ? { id: addressId as string } : { isDefault: true }) }, include: { city: true } });
  if (!address) throw new AppError(400, 'ADDRESS_REQUIRED', 'Select one of your saved delivery addresses.', 'addressId');
  if (lock) {
    await db.$queryRaw`SELECT "id" FROM "Address" WHERE "id"=${address.id} FOR SHARE`;
    await db.$queryRaw`SELECT "id" FROM "City" WHERE "id"=${address.cityId} FOR SHARE`;
    return ownedAddress(db, customerId, address.id, false);
  }
  if (!address.city.active || address.country !== 'IN') throw new AppError(409, 'AREA_UNSUPPORTED', 'Delivery is not enabled in this city. Select another address.');
  return address;
}
export type DeliveryAddress = Awaited<ReturnType<typeof ownedAddress>>;
export const addressSnapshot = (a: DeliveryAddress) => ({
  label: a.label, formatted: addressLabel(a), country: a.country, state: a.city.state, city: a.city.name, cityId: a.cityId,
  pinCode: a.pinCode, locality: a.locality, houseNumber: a.houseNumber, street: a.street,
  landmark: a.landmark, instructions: a.instructions, lat: a.lat, lng: a.lng,
});
export const addressLabel = (a: DeliveryAddress) => `${a.houseNumber}, ${a.street}, ${a.locality}, ${a.city.name} ${a.pinCode}`;

export async function deliveryEligibility(db: GeoDb, a: DeliveryAddress, vendorId: string, lock = false, now = new Date()) {
  if (lock) {
    // These shared row locks prevent a concurrent disable or coordinate edit from invalidating checkout before commit.
    await db.$queryRaw`SELECT "id" FROM "Vendor" WHERE "id"=${vendorId} FOR SHARE`;
    await db.$queryRaw`SELECT z."id" FROM "DeliveryZone" z JOIN "VendorCoverage" c ON c."zoneId"=z."id" WHERE c."vendorId"=${vendorId} ORDER BY z."id" FOR SHARE OF z, c`;
  }
  const vendor = await db.vendor.findUnique({ where: { id: vendorId }, include: { coverage: { include: { zone: { include: { city: true } } } } } });
  if (!vendor || vendor.approvalStatus !== 'APPROVED' || !vendor.isAcceptingOrders || !openByHours(vendor.operatingHours, now)) throw new AppError(409, 'STORE_UNAVAILABLE', 'This store is closed or unavailable.');
  if (vendor.cityId !== a.cityId || !indianPoint(vendor.lat, vendor.lng) || !vendor.locationSource) throw new AppError(409, 'AREA_UNSUPPORTED', 'This store does not deliver to the selected address.');
  const distanceKm = kmBetween(vendor, a);
  const matches = vendor.coverage.filter((c) => c.active && c.zone.active && c.zone.city.active && c.zone.cityId === a.cityId && kmBetween(a, { lat: c.zone.centerLat, lng: c.zone.centerLng }) <= c.zone.radiusKm && distanceKm <= (c.radiusKm ?? c.zone.radiusKm));
  if (!matches.length) throw new AppError(409, 'AREA_UNSUPPORTED', 'This address is outside the store’s enabled delivery areas.');
  const choices = matches.map((c) => ({ zoneId: c.zoneId, distanceKm: Math.round(distanceKm * 1000) / 1000, feePaise: c.zone.baseFeePaise + Math.ceil(Math.ceil(distanceKm * 1000) * c.zone.perKmFeePaise / 1000) }));
  choices.sort((x, y) => x.feePaise - y.feePaise || x.zoneId.localeCompare(y.zoneId));
  return choices[0];
}

export async function saveAddress(customerId: string, body: any, id?: string) {
  if (body.country !== undefined && body.country !== 'IN') throw geoError('country', 'Only Indian delivery addresses are supported.');
  if (!indianPoint(body.lat, body.lng)) throw geoError('location', 'Choose a valid location in an enabled Indian service area.');
  const pinCode = text(body.pinCode, 'pinCode', 6);
  if (!/^[1-9]\d{5}$/.test(pinCode)) throw geoError('pinCode', 'Enter a six-digit Indian PIN code.');
  if (body.isDefault !== undefined && typeof body.isDefault !== 'boolean') throw geoError('isDefault', 'Use true or false.');
  const cityId = text(body.cityId, 'cityId', 64);
  const city = await prisma.city.findUnique({ where: { id: cityId } });
  if (!city || !city.active) throw geoError('cityId', 'Select an enabled delivery city.');
  const data = {
    cityId, label: text(body.label, 'label', 40), country: 'IN', pinCode,
    locality: text(body.locality, 'locality', 100), houseNumber: text(body.houseNumber, 'houseNumber', 80), street: text(body.street, 'street', 140),
    landmark: text(body.landmark, 'landmark', 140, false) || null, instructions: text(body.instructions, 'instructions', 300, false) || null,
    lat: body.lat as number, lng: body.lng as number,
  };
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${customerId} FOR UPDATE`;
    if (id && !(await tx.address.findFirst({ where: { id, customerId } }))) throw new AppError(404, 'NOT_FOUND', 'Address not found.');
    const first = await tx.address.count({ where: { customerId } }) === 0;
    const isDefault = body.isDefault ?? (id ? (await tx.address.findUniqueOrThrow({ where: { id } })).isDefault : first);
    if (isDefault) await tx.address.updateMany({ where: { customerId, isDefault: true }, data: { isDefault: false } });
    return id ? tx.address.update({ where: { id }, data: { ...data, isDefault }, include: { city: true } }) : tx.address.create({ data: { ...data, customerId, isDefault }, include: { city: true } });
  });
}
