/**
 * Historical labels and the retired campus API; current serviceability and active-only tracking (Docs/19_campus_maps_contract.md sections 1 and 2):
 * historical normalisation, explicit API retirement, owned-address checkout, general Indian pins,
 * the preserved historical data migration, administrative location bounds, rider locations, and who
 * gets to see a rider's position. Real PostgreSQL, real socket.io clients.
 */
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import supertest from 'supertest';
import { Socket } from 'socket.io-client';
import { Role } from '@prisma/client';
import { startTestServer, stopTestServer, TestServerInstance } from '../harness/app';
import { prisma, seedTestDatabase, cleanTestOrders, cleanTestUsers } from '../harness/db';
import { getStudentToken, getVendorToken, getDriverToken, getAdminToken, getAuthHeader } from '../harness/auth';
import { connectTestSocket, disconnectTestSocket } from '../harness/socket';
import {
  DROP_POINTS, CAMPUS_CENTER, normalizeDropPoint, dropPointCoords, isNearCampus, vendorHasLocation, distanceKm, checkVendorLocation,
} from '../../src/config/campus';

jest.setTimeout(30_000);

const STUDENT = { id: 'usr-1', phone: '+91 9876543210' };
const CAMPUS_STUDENT = { id: 'usr-campus-stu', phone: '+91 9999877001' };
const VENDOR = { id: 'usr-3', phone: '+91 9876543212' };
const RIDER = { id: 'usr-4', phone: '+91 9876543213' };
const ADMIN = { id: 'usr-5', phone: '+91 9876543214' };
const tStudent = getStudentToken(STUDENT.id, STUDENT.phone);
const tCampusStudent = getStudentToken(CAMPUS_STUDENT.id, CAMPUS_STUDENT.phone);
const tVendor = getVendorToken(VENDOR.id, VENDOR.phone);
const tRider = getDriverToken(RIDER.id, RIDER.phone);
const tAdmin = getAdminToken(ADMIN.id, ADMIN.phone);
const H = getAuthHeader;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CANON = ['BH1', 'BH2', 'BH3', 'BH4', 'BH5', 'Special Block', 'BH6', 'BH7', 'BH8', 'GH1', 'GH2'];

// ---------------------------------------------------------------------------------------------------------------
describe('campus.ts (pure)', () => {
  test('the drop point list is exactly the contract table, in order', () => {
    expect(DROP_POINTS.map((p) => p.name)).toEqual(CANON);
    expect(DROP_POINTS.every((p) => p.id === p.name)).toBe(true);
    expect(DROP_POINTS.filter((p) => p.group === 'girls').map((p) => p.name)).toEqual(['GH1', 'GH2']);
    expect(DROP_POINTS.filter((p) => p.group === 'boys')).toHaveLength(9);
    expect(dropPointCoords('BH1')).toEqual({ lat: 23.074861, lng: 76.859889 });
    expect(dropPointCoords('BH4')).toEqual(dropPointCoords('Special Block'));
    expect(dropPointCoords('GH2')).toEqual({ lat: 23.074917, lng: 76.853194 });
    expect(dropPointCoords('VIT Main Gate')).toBeNull();
  });

  test('campus centre is the mean of the 7 distinct pins', () => {
    const pins = [[23.074861, 76.859889], [23.073556, 76.859861], [23.073361, 76.858389], [23.07275, 76.86], [23.072889, 76.859222], [23.074778, 76.851972], [23.074917, 76.853194]];
    expect(CAMPUS_CENTER.lat).toBeCloseTo(pins.reduce((s, p) => s + p[0], 0) / 7, 9);
    expect(CAMPUS_CENTER.lng).toBeCloseTo(pins.reduce((s, p) => s + p[1], 0) / 7, 9);
  });

  const accepted: [unknown, string][] = [
    // canonical
    ...CANON.map((n) => [n, n] as [unknown, string]),
    ['bh2', 'BH2'], ['Bh8', 'BH8'], ['gh1', 'GH1'], ['special block', 'Special Block'], ['SPECIAL   BLOCK', 'Special Block'], ['  BH5  ', 'BH5'],
    // legacy short
    ['Block 1', 'BH1'], ['Block 2', 'BH2'], ['Block 3', 'BH3'], ['Block 4', 'BH4'], ['Block 5', 'BH5'], ['Block 6', 'BH6'],
    ['block 3', 'BH3'], ['BLOCK 3', 'BH3'], ['  Block   3 ', 'BH3'], ['Block\t3', 'BH3'],
    // legacy long
    ['Boys Hostel Block 1', 'BH1'], ['Boys Hostel Block 6', 'BH6'], ['boys hostel block 4', 'BH4'], ['  Boys   Hostel  Block  2 ', 'BH2'],
    // girls
    ['Girls Gate 1', 'GH1'], ['Girls Gate 2', 'GH2'], ['girls gate 2', 'GH2'], ['GIRLS GATE 1', 'GH1'],
    ['Girls Hostel Gate 1', 'GH1'], ['Girls Hostel Gate 2', 'GH2'], ['girls   hostel gate 2', 'GH2'],
  ];
  test.each(accepted)('accepts %j -> %j', (raw, canonical) => {
    expect(normalizeDropPoint(raw)).toBe(canonical);
    expect(normalizeDropPoint(canonical)).toBe(canonical); // idempotent
  });

  const rejected: unknown[] = [
    'VIT Main Gate', 'vit main gate', 'Block 0', 'Block 7', 'Block 12', 'Boys Hostel Block 7', 'Girls Gate 0', 'Girls Gate 3', 'Girls Hostel Gate 3',
    'BH0', 'BH9', 'BH10', 'GH0', 'GH3', 'BH 2', 'Block', 'Block2', 'Special', 'Main Gate', '', '   ', 'Library', 'Block 1; DROP TABLE', 'Block 1\nBlock 2',
    'x'.repeat(500), null, undefined, 2, true, {}, ['BH1'],
  ];
  test.each(rejected.map((r) => [typeof r === 'string' ? r.slice(0, 30) : r, r]))('rejects %j', (_label, raw) => {
    expect(normalizeDropPoint(raw)).toBeNull();
    expect(dropPointCoords(raw)).toBeNull();
  });

  test('historical campus geometry remains available only for legacy data', () => {
    expect(isNearCampus(23.0745, 76.859)).toBe(true);
    expect(isNearCampus(CAMPUS_CENTER.lat, CAMPUS_CENTER.lng)).toBe(true);
    for (const p of DROP_POINTS) expect(isNearCampus(p.lat, p.lng)).toBe(true);
    expect(isNearCampus(23.0768, 76.8524)).toBe(true); // the old placeholder pin is on campus (it is just not "real")
    expect(isNearCampus(23.2599, 77.4126)).toBe(false); // Bhopal city
    expect(isNearCampus(28.6139, 77.209)).toBe(false); // Delhi
    expect(isNearCampus(0, 0)).toBe(false);
    // ~2.9 km north is in, ~3.1 km north is out (1 deg lat ~ 111.19 km)
    expect(isNearCampus(CAMPUS_CENTER.lat + 2.9 / 111.19, CAMPUS_CENTER.lng)).toBe(true);
    expect(isNearCampus(CAMPUS_CENTER.lat + 3.1 / 111.19, CAMPUS_CENTER.lng)).toBe(false);
    expect(distanceKm(CAMPUS_CENTER, { lat: CAMPUS_CENTER.lat + 1 / 111.19, lng: CAMPUS_CENTER.lng })).toBeCloseTo(1, 1);
    for (const bad of [NaN, Infinity, '23.07', null, undefined, 91, -91]) expect(isNearCampus(bad, 76.859)).toBe(false);
    expect(isNearCampus(23.07, 181)).toBe(false);
  });

  test('vendorHasLocation: the schema placeholder and non-numbers are not a real pin', () => {
    expect(vendorHasLocation(23.0768, 76.8524)).toBe(false);
    expect(vendorHasLocation(0, 0)).toBe(false);
    expect(vendorHasLocation(NaN, 76.85)).toBe(false);
    expect(vendorHasLocation(null, null)).toBe(false);
    expect(vendorHasLocation(23.0785, 76.855)).toBe(true);
    expect(vendorHasLocation(23.0768, 76.8525)).toBe(true);
  });

  test('checkVendorLocation reports the failing field', () => {
    expect(checkVendorLocation(23.0745, 76.859)).toEqual({ ok: true, lat: 23.0745, lng: 76.859 });
    expect(checkVendorLocation('23.07', 76.85)).toMatchObject({ ok: false, field: 'lat' });
    expect(checkVendorLocation(91, 76.85)).toMatchObject({ ok: false, field: 'lat' });
    expect(checkVendorLocation(23.07, 'x')).toMatchObject({ ok: false, field: 'lng' });
    expect(checkVendorLocation(23.07, 181)).toMatchObject({ ok: false, field: 'lng' });
    expect(checkVendorLocation(28.61, 77.2)).toMatchObject({ok:true});
    expect(checkVendorLocation(48.85,2.35)).toMatchObject({ok:false,field:'location'});
    expect(checkVendorLocation(undefined, undefined)).toMatchObject({ ok: false, field: 'lat' });
  });
});

// ---------------------------------------------------------------------------------------------------------------
describe('Retired campus contract and current location authorization',()=>{
  let server:TestServerInstance,request:ReturnType<typeof supertest>;
  beforeAll(async()=>{await cleanTestOrders();await cleanTestUsers();await seedTestDatabase();server=await startTestServer();request=supertest(server.app);});
  afterEach(async()=>{await cleanTestOrders();await seedTestDatabase();});
  afterAll(async()=>{await cleanTestOrders();await stopTestServer(server);await prisma.$disconnect();});
  test.each([['customer',tStudent],['vendor',tVendor],['rider',tRider],['admin',tAdmin]])('%s receives explicit retirement, never a public campus location table',async(_role,token)=>{
    const response=await request.get('/api/campus').set(H(token));expect(response.status).toBe(410);expect(response.body.code).toBe('LEGACY_LOCATION_API');expect(response.body.data).toBeUndefined();
  });
  test('anonymous campus discovery remains authenticated',async()=>{expect((await request.get('/api/campus')).status).toBe(401);});
  test('legacy checkout labels and raw client coordinates cannot replace an owned saved address',async()=>{
    const response=await request.post('/api/orders').set(H(tStudent)).send({vendorId:'ven-1',items:[{itemId:'item-1',quantity:1}],clientRequestId:randomUUID(),dropoffHostel:'Mars',dropoff:{lat:48.85,lng:2.35}});
    expect(response.status).toBe(201);expect(response.body.data.deliveryAddress).toMatchObject({country:'IN',city:'Bhopal',houseNumber:'House 2'});expect(response.body.data.dropoff.lat).toBeCloseTo(23.0746);expect(JSON.stringify(response.body.data.deliveryAddress)).not.toContain('Mars');
  });
  test('a campus profile label by itself no longer authorizes a checkout',async()=>{
    await prisma.address.deleteMany({where:{customerId:STUDENT.id}});
    const response=await request.post('/api/orders').set(H(tStudent)).send({vendorId:'ven-1',items:[{itemId:'item-1',quantity:1}],clientRequestId:randomUUID(),dropoffHostel:'BH2'});
    expect(response.status).toBe(400);expect(response.body.code).toBe('ADDRESS_REQUIRED');expect(await prisma.order.count()).toBe(0);
  });
  test.each([[28.6139,77.209],[23.2599,77.4126],[12.9716,77.5946]])('admin may confirm an Indian store pin at %s,%s',async(lat,lng)=>{
    const response=await request.patch('/api/admin/vendors/ven-1/location').set(H(tAdmin)).send({lat,lng});expect(response.status).toBe(200);const saved=await prisma.vendor.findUniqueOrThrow({where:{id:'ven-1'}});expect([saved.lat,saved.lng,saved.locationSource]).toEqual([lat,lng,'ADMIN']);
  });
  test.each([[48.85,2.35],[0,0],[91,77],[23,181]])('coordinates outside India or invalid ranges are rejected (%s,%s)',async(lat,lng)=>{
    expect((await request.patch('/api/admin/vendors/ven-1/location').set(H(tAdmin)).send({lat,lng})).status).toBe(400);
  });
  test('only an admin may set another store location',async()=>{
    for(const token of [tStudent,tVendor,tRider])expect((await request.patch('/api/admin/vendors/ven-1/location').set(H(token)).send({lat:28.6139,lng:77.209})).status).toBe(403);
  });
  test('idle GPS is rejected for riders and cannot be spoofed by admins',async()=>{
    const result=await request.post('/api/drivers/location').set(H(tRider)).send({lat:23.0745,lng:76.859});expect(result.status).toBe(409);expect(result.body.code).toBe('NO_ACTIVE_DELIVERY');
    expect((await request.post('/api/drivers/location').set(H(tAdmin)).send({driverId:RIDER.id,lat:23.0745,lng:76.859})).status).toBe(403);expect(await prisma.driverLocation.count({where:{driverId:RIDER.id}})).toBe(0);
  });
  test('the location list excludes idle fixes and is unavailable to customers/stores',async()=>{
    await prisma.driverLocation.upsert({where:{driverId:RIDER.id},create:{driverId:RIDER.id,driverName:'Rider fixture',lat:23.0745,lng:76.859},update:{lat:23.0745,lng:76.859}});
    expect((await request.get('/api/drivers/locations').set(H(tAdmin))).body.data).toEqual([]);expect((await request.get('/api/drivers/locations').set(H(tRider))).body.data).toEqual([]);
    for(const token of [tStudent,tVendor])expect((await request.get('/api/drivers/locations').set(H(token))).status).toBe(403);
    await prisma.driverLocation.deleteMany({where:{driverId:RIDER.id}});
  });
  describe('migration 20261006_campus_dropoints', () => {
    const file = path.resolve(__dirname, '../../prisma/migrations/20261006_campus_dropoints/migration.sql');
    const sql = fs.readFileSync(file, 'utf8');
    const statements = sql.split('\n').filter((l) => !l.trim().startsWith('--')).join('\n').split(';').map((s) => s.trim()).filter(Boolean);

    test('is data-only, short and uses a lock timeout', () => {
      expect(statements[0]).toBe('BEGIN');
      expect(statements[statements.length - 1]).toBe('COMMIT');
      expect(sql).toMatch(/SET LOCAL lock_timeout/);
      expect(statements.join(";")).not.toMatch(/\b(ALTER|DROP|CREATE|TRUNCATE|DELETE|INSERT)\b/i);
      expect(statements.filter((s) => s.startsWith('UPDATE'))).toHaveLength(2);
    });

    test('rewrites legacy rows, leaves everything else (and updatedAt) alone, and can run twice', async () => {
      const marker = 'campus-mig-';
      const legacyUsers: [string, string | null, string | null][] = [
        ['a1', 'Block 3', 'BH3'], ['a2', 'Boys Hostel Block 1', 'BH1'], ['a3', 'Girls Gate 2', 'GH2'], ['a4', 'Girls Hostel Gate 1', 'GH1'],
        ['a5', 'VIT Main Gate', 'VIT Main Gate'], ['a6', 'BH5', 'BH5'], ['a7', '  boys   HOSTEL block  6 ', 'BH6'], ['a8', 'Block 7', 'Block 7'],
        ['a9', null, null], ['b1', 'Special Block', 'Special Block'], ['b2', 'Girls Gate 3', 'Girls Gate 3'], ['b3', 'GIRLS gate 1', 'GH1'],
        ['b4', 'Block 12', 'Block 12'], ['b5', 'block 2', 'BH2'], ['b6', 'Unknown', 'Unknown'],
      ];
      const old = new Date('2026-01-01T00:00:00Z');
      await prisma.user.createMany({ data: legacyUsers.map(([k, hb], i) => ({ id: marker + k, name: `Mig ${k}`, phone: `+91 99998${String(80000 + i)}`, role: Role.STUDENT, hostelBlock: hb })) });
      const orderRows = legacyUsers.filter(([, hb]) => hb !== null);
      await prisma.order.createMany({
        data: orderRows.map(([k, hb]) => ({ id: marker + 'o-' + k, customerId: STUDENT.id, vendorId: 'ven-1', dropoffHostel: hb as string, totalAmount: 100, status: 'CANCELLED' as const, createdAt: old, updatedAt: old })),
      });
      try {
        const run = () => prisma.$transaction(statements.filter((s) => s.startsWith('UPDATE')).map((s) => prisma.$executeRawUnsafe(s)));
        const [u1, o1] = await run();
        expect(u1).toBeGreaterThanOrEqual(legacyUsers.filter(([,before,after])=>before!==after).length);
        expect(o1).toBeGreaterThanOrEqual(legacyUsers.filter(([,before,after])=>before!==after).length);
        for (const [k, , want] of legacyUsers) {
          const u = await prisma.user.findUniqueOrThrow({ where: { id: marker + k } });
          expect([k, u.hostelBlock]).toEqual([k, want]);
        }
        for (const [k, , want] of orderRows) {
          const o = await prisma.order.findUniqueOrThrow({ where: { id: marker + 'o-' + k } });
          expect([k, o.dropoffHostel]).toEqual([k, want]);
          expect(o.updatedAt.toISOString()).toBe(old.toISOString());
        }
        const [u2, o2] = await run();
        expect([u2, o2]).toEqual([0, 0]); // second run changes nothing
      } finally {
        await prisma.order.deleteMany({ where: { id: { startsWith: marker } } });
        await prisma.user.deleteMany({ where: { id: { startsWith: marker } } });
      }
    });
  });


});
