import { Router, Response } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { validParams, fail, ID_RE } from '../utils/http';
import { AppError } from '../utils/appError';
import { publicVendorView } from '../utils/catalog';
import { searchLocations, routeBetween } from '../services/maps';
import { addressSnapshot, deliveryEligibility, geoError, indianPoint, ownedAddress, saveAddress, text, validateHours } from '../services/geography';

export const geographyRouter = Router();
const safe = (fn: (req: AuthenticatedRequest, res: Response) => Promise<any>) => async (req: AuthenticatedRequest, res: Response) => { try { await fn(req, res); } catch (e) {
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') return fail(res, new AppError(409, 'ALREADY_EXISTS', 'This record already exists.'), 'geography');
  if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') return fail(res, new AppError(404, 'NOT_FOUND', 'Record not found.'), 'geography');
  fail(res, e, 'geography');
} };
const ok = (res: Response, data: unknown, status = 200) => res.status(status).json({ success: true, data });
const bool = (v: unknown, field = 'active') => { if (typeof v !== 'boolean') throw geoError(field, 'Use true or false.'); return v; };
const number = (v: unknown, field: string, min: number, max: number, integer = false) => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < min || v > max || (integer && !Number.isInteger(v))) throw geoError(field, `${field} must be ${integer ? 'an integer' : 'a number'} between ${min} and ${max}.`);
  return v;
};
const page = (req: AuthenticatedRequest) => {
  const take = req.query.limit === undefined ? 50 : Number(req.query.limit);
  if (!Number.isInteger(take) || take < 1 || take > 100) throw geoError('limit', 'Choose a page size from 1 to 100.');
  const after = req.query.after;
  if (after !== undefined && (typeof after !== 'string' || !ID_RE.test(after))) throw geoError('after', 'Invalid page cursor.');
  return { take, ...(after ? { cursor: { id: after as string }, skip: 1 } : {}) };
};
const audit = (tx: Prisma.TransactionClient, req: AuthenticatedRequest, action: string, targetType: string, targetId: string) => tx.adminAuditLog.create({ data: { action, targetType, targetId, summary: `${action} by ${req.user!.id}` } });

geographyRouter.get('/v1/cities', safe(async (req, res) => {
  const p = page(req);
  const rows = await prisma.city.findMany({ ...p, where: { active: true }, orderBy: { id: 'asc' } });
  res.json({ success: true, data: rows, nextCursor: rows.length === p.take ? rows.at(-1)!.id : null });
}));
geographyRouter.get('/v1/maps/search', requireAuth, safe(async (req, res) => ok(res, await searchLocations(req.query.q))));
geographyRouter.get('/v1/orders/:id/route', requireAuth, validParams('id'), safe(async (req, res) => {
  const o = await prisma.order.findUnique({ where: { id: req.params.id }, select: { customerId: true, driverId: true, status:true, addressSnapshot: true, vendor: { select: { lat: true, lng: true } } } });
  if (!o || !(req.user!.role === 'ADMIN' || (req.user!.role === 'STUDENT' && o.customerId === req.user!.id) || (req.user!.role === 'DRIVER' && o.driverId === req.user!.id && !['DELIVERED','CANCELLED'].includes(o.status)))) throw new AppError(404, 'NOT_FOUND', 'Order not found.');
  const a = o.addressSnapshot as any;
  if (!a) throw new AppError(503, 'MAPS_UNAVAILABLE', 'No route is available for this historical address.');
  ok(res, await routeBetween(o.vendor, a));
}));
geographyRouter.get('/v1/addresses', requireAuth, requireRole('STUDENT'), safe(async (req, res) => {
  const p = page(req);
  const rows = await prisma.address.findMany({ ...p, where: { customerId: req.user!.id }, include: { city: true }, orderBy: { id: 'asc' } });
  res.json({ success: true, data: rows, nextCursor: rows.length === p.take ? rows.at(-1)!.id : null });
}));
geographyRouter.post('/v1/addresses', requireAuth, requireRole('STUDENT'), safe(async (req, res) => ok(res, await saveAddress(req.user!.id, req.body ?? {}), 201)));
geographyRouter.put('/v1/addresses/:id', requireAuth, requireRole('STUDENT'), validParams('id'), safe(async (req, res) => ok(res, await saveAddress(req.user!.id, req.body ?? {}, req.params.id))));
geographyRouter.delete('/v1/addresses/:id', requireAuth, requireRole('STUDENT'), validParams('id'), safe(async (req, res) => {
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id"=${req.user!.id} FOR UPDATE`;
    const row = await tx.address.findFirst({ where: { id: req.params.id, customerId: req.user!.id } });
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Address not found.');
    await tx.address.delete({ where: { id: row.id } });
    if (row.isDefault) {
      const next = await tx.address.findFirst({ where: { customerId: req.user!.id }, orderBy: { createdAt: 'asc' } });
      if (next) await tx.address.update({ where: { id: next.id }, data: { isDefault: true } });
    }
  });
  ok(res, { deleted: true });
}));

geographyRouter.get('/v1/vendors/nearby', requireAuth, requireRole('STUDENT'), safe(async (req, res) => {
  const address = await ownedAddress(prisma, req.user!.id, req.query.addressId);
  const p = page(req);
  // The city/approval/open/location index bounds candidates; the exact configured circles are authoritative.
  const candidates = await prisma.vendor.findMany({ ...p, orderBy: { id: 'asc' }, include: { menuItems: { where: { approvalStatus: 'APPROVED', deletedAt: null }, orderBy: { id: 'asc' }, take: 50 } }, where: {
    cityId: address.cityId, approvalStatus: 'APPROVED', isAcceptingOrders: true,
    lat: { gte: address.lat - 0.46, lte: address.lat + 0.46 },
    lng: { gte: address.lng - 0.65, lte: address.lng + 0.65 },
  } });
  const stores = [];
  for (const vendor of candidates) {
    try {
      const eligibility = await deliveryEligibility(prisma, address, vendor.id);
      stores.push({ ...publicVendorView(vendor), cityId: vendor.cityId, hasMoreProducts: vendor.menuItems.length === 50, ...eligibility });
    } catch (e) { if (!(e instanceof AppError && ['STORE_UNAVAILABLE', 'AREA_UNSUPPORTED'].includes(e.code))) throw e; }
  }
  res.json({ success: true, data: stores, nextCursor: candidates.length === p.take ? candidates.at(-1)!.id : null });
}));
geographyRouter.post('/v1/serviceability', requireAuth, requireRole('STUDENT'), safe(async (req, res) => {
  const a = await ownedAddress(prisma, req.user!.id, req.body?.addressId);
  const vendorId = text(req.body?.vendorId, 'vendorId', 64);
  ok(res, { address: addressSnapshot(a), ...await deliveryEligibility(prisma, a, vendorId) });
}));

geographyRouter.use('/v1/admin', requireAuth, requireRole('ADMIN'));
geographyRouter.get('/v1/admin/geography', safe(async (_req, res) => {
  const [cities, zones, coverage] = await Promise.all([prisma.city.findMany({ orderBy: { name: 'asc' } }), prisma.deliveryZone.findMany({ orderBy: { name: 'asc' } }), prisma.vendorCoverage.findMany()]);
  ok(res, { cities, zones, coverage });
}));
geographyRouter.post('/v1/admin/cities', safe(async (req, res) => {
  const b = req.body ?? {}, code = text(b.code, 'code', 40).toLowerCase();
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(code)) throw geoError('code', 'Use a lower-case city code, for example bengaluru-ka.');
  const data = { code, name: text(b.name, 'name', 80), state: text(b.state, 'state', 80), active: b.active === undefined ? false : bool(b.active) };
  const city = await prisma.$transaction(async (tx) => { const c = await tx.city.create({ data }); await audit(tx, req, 'CITY_CREATED', 'CITY', c.id); return c; });
  ok(res, city, 201);
}));
geographyRouter.patch('/v1/admin/cities/:id', validParams('id'), safe(async (req, res) => {
  const active = bool(req.body?.active);
  ok(res, await prisma.$transaction(async (tx) => { const c = await tx.city.update({ where: { id: req.params.id }, data: { active } }); await audit(tx, req, 'CITY_AVAILABILITY_CHANGED', 'CITY', c.id); return c; }));
}));
geographyRouter.post('/v1/admin/zones', safe(async (req, res) => {
  const b = req.body ?? {};
  if (!indianPoint(b.centerLat, b.centerLng)) throw geoError('location', 'Enter valid Indian zone coordinates.');
  const data = { cityId: text(b.cityId, 'cityId', 64), name: text(b.name, 'name', 80), centerLat: b.centerLat as number, centerLng: b.centerLng as number,
    radiusKm: number(b.radiusKm, 'radiusKm', 0.1, 50), baseFeePaise: number(b.baseFeePaise, 'baseFeePaise', 0, 100000, true), perKmFeePaise: number(b.perKmFeePaise, 'perKmFeePaise', 0, 10000, true), active: b.active === undefined ? false : bool(b.active) };
  if (!await prisma.city.findUnique({ where: { id: data.cityId } })) throw geoError('cityId', 'City not found.');
  ok(res, await prisma.$transaction(async (tx) => { const z = await tx.deliveryZone.create({ data }); await audit(tx, req, 'ZONE_CREATED', 'ZONE', z.id); return z; }), 201);
}));
geographyRouter.patch('/v1/admin/zones/:id', validParams('id'), safe(async (req, res) => {
  const b = req.body ?? {};
  const data = { ...(b.active !== undefined ? { active: bool(b.active) } : {}), ...(b.radiusKm !== undefined ? { radiusKm: number(b.radiusKm, 'radiusKm', 0.1, 50) } : {}),
    ...(b.baseFeePaise !== undefined ? { baseFeePaise: number(b.baseFeePaise, 'baseFeePaise', 0, 100000, true) } : {}), ...(b.perKmFeePaise !== undefined ? { perKmFeePaise: number(b.perKmFeePaise, 'perKmFeePaise', 0, 10000, true) } : {}) };
  ok(res, await prisma.$transaction(async (tx) => { const z = await tx.deliveryZone.update({ where: { id: req.params.id }, data }); await audit(tx, req, 'ZONE_CHANGED', 'ZONE', z.id); return z; }));
}));
geographyRouter.put('/v1/admin/vendors/:id/location', validParams('id'), safe(async (req, res) => {
  const b = req.body ?? {};
  if (!indianPoint(b.lat, b.lng)) throw geoError('location', 'Enter valid Indian store coordinates.');
  const cityId = text(b.cityId, 'cityId', 64), pinCode = text(b.pinCode, 'pinCode', 6);
  if (!/^[1-9]\d{5}$/.test(pinCode)) throw geoError('pinCode', 'Enter a six-digit Indian PIN code.');
  if (!await prisma.city.findUnique({ where: { id: cityId } })) throw geoError('cityId', 'City not found.');
  const operatingHours = b.operatingHours === undefined ? undefined : validateHours(b.operatingHours);
  ok(res, await prisma.$transaction(async (tx) => {
    const v = await tx.vendor.update({ where: { id: req.params.id }, data: { cityId, pinCode, locality: text(b.locality, 'locality', 100), address: text(b.address, 'address', 200), lat: b.lat, lng: b.lng, locationSource: 'ADMIN', locationSetAt: new Date(), ...(operatingHours !== undefined ? { operatingHours: operatingHours === null ? Prisma.DbNull : operatingHours } : {}) } });
    // Moving a store invalidates old coverage; an operator must explicitly enable it again.
    await tx.vendorCoverage.updateMany({ where: { vendorId: v.id }, data: { active: false } });
    await audit(tx, req, 'STORE_LOCATION_CHANGED', 'VENDOR', v.id); return v;
  }));
}));
geographyRouter.put('/v1/admin/vendors/:id/coverage/:zoneId', validParams('id', 'zoneId'), safe(async (req, res) => {
  const active = bool(req.body?.active), radiusKm = req.body?.radiusKm == null ? null : number(req.body.radiusKm, 'radiusKm', 0.1, 50);
  ok(res, await prisma.$transaction(async (tx) => {
    const [v, z] = await Promise.all([tx.vendor.findUnique({ where: { id: req.params.id } }), tx.deliveryZone.findUnique({ where: { id: req.params.zoneId } })]);
    if (!v || !z || v.cityId !== z.cityId || !v.locationSource) throw geoError('zoneId', 'Store and delivery zone must belong to the same configured city, with a confirmed store location.');
    const c = await tx.vendorCoverage.upsert({ where: { vendorId_zoneId: { vendorId: v.id, zoneId: z.id } }, create: { vendorId: v.id, zoneId: z.id, active, radiusKm }, update: { active, radiusKm } });
    await audit(tx, req, 'STORE_COVERAGE_CHANGED', 'VENDOR', v.id); return c;
  }));
}));
