import { Prisma } from '@prisma/client';
import { AppError } from '../utils/appError';
import { prisma } from '../db';
import { toPaise } from './pricing';

export const productSnapshot = (m: { sku: string | null; productKey: string | null; unit: string; packSize: string; mrpPaise: number | null; barcode: string | null; hsnCode: string | null; taxRateBps: number; price: number; vendorPrice: number }) => ({
  sku: m.sku, productKey: m.productKey, unit: m.unit, packSize: m.packSize, mrpPaise: m.mrpPaise,
  barcode: m.barcode, hsnCode: m.hsnCode, taxRateBps: m.taxRateBps,
  pricePaise: toPaise(m.price), vendorUnitPaise: toPaise(m.vendorPrice), taxIncluded: true,
});
export async function lockProducts(tx: Prisma.TransactionClient, ids: string[]) {
  if (ids.length) await tx.$queryRaw(Prisma.sql`SELECT "id" FROM "MenuItem" WHERE "id" IN (${Prisma.join([...new Set(ids)].sort())}) ORDER BY "id" FOR UPDATE`);
}
export type BatchAllocation = {
  batchId: string; quantity: number; expiresAt: string | null;
  packedQty: number; unusableQty: number; pendingInspectionQty: number; releasedQty: number;
};
type InventoryTx = Prisma.TransactionClient;
const expired = (value: string | Date | null | undefined, now: Date) => !!value && new Date(value).getTime() <= now.getTime();
const allocations = (raw: Prisma.JsonValue): BatchAllocation[] => Array.isArray(raw) ? raw.map((v) => ({ ...(v as unknown as BatchAllocation) })) : [];
const json = (value: unknown) => value as Prisma.InputJsonValue;
const sum = (rows: BatchAllocation[], key: 'quantity' | 'packedQty' | 'unusableQty' | 'pendingInspectionQty' | 'releasedQty') => rows.reduce((total, row) => total + row[key], 0);
const unpacked = (row: Pick<BatchAllocation, 'quantity' | 'packedQty' | 'unusableQty' | 'releasedQty'>) => row.quantity - row.packedQty - row.unusableQty - row.releasedQty;

/** Expires only physically available units; held units remain identified by their reservation. */
export async function expireProductBatches(tx: InventoryTx, itemId: string, now = new Date()) {
  const rows = await tx.stockBatch.findMany({ where: { menuItemId: itemId, expiresAt: { lte: now }, availableQty: { gt: 0 } }, orderBy: { id: 'asc' } });
  let total = 0;
  for (const row of rows) {
    total += row.availableQty;
    await tx.stockBatch.update({ where: { id: row.id }, data: { availableQty: 0 } });
    await tx.stockMovement.create({ data: { menuItemId: itemId, delta: -row.availableQty, kind: 'EXPIRED', reason: 'Batch expiry: unavailable for sale', reference: `expired:${row.id}:${row.updatedAt.getTime()}`, details: { batchId: row.id, lotCode: row.lotCode, expiresAt: row.expiresAt?.toISOString() } } });
  }
  if (total) {
    const changed = await tx.menuItem.updateMany({ where: { id: itemId, stockQty: { gte: total } }, data: { stockQty: { decrement: total }, stockVersion: { increment: 1 } } });
    if (!changed.count) throw new AppError(409, 'STOCK_RECONCILIATION_REQUIRED', 'Batch counts differ from available stock. Ask operations to reconcile the product.');
  }
  return total;
}

/** Bounded durable-job entry point. Every batch/product is rechecked under its product lock. */
export async function expireStockBatches(limit = 100, now = new Date()) {
  const ids = await prisma.stockBatch.findMany({ where: { expiresAt: { lte: now }, availableQty: { gt: 0 } }, take: Math.max(1, Math.min(limit, 500)), select: { menuItemId: true }, distinct: ['menuItemId'], orderBy: { menuItemId: 'asc' } });
  let expiredUnits = 0;
  for (const row of ids) expiredUnits += await prisma.$transaction(async (tx) => { await lockProducts(tx, [row.menuItemId]); return expireProductBatches(tx, row.menuItemId, now); });
  return { products: ids.length, expiredUnits };
}

async function takeStock(tx: InventoryTx, itemId: string, quantity: number, now: Date): Promise<BatchAllocation[]> {
  const item = await tx.menuItem.findUniqueOrThrow({ where: { id: itemId } });
  let out: BatchAllocation[] = [];
  if (item.batchTracking) {
    await expireProductBatches(tx, itemId, now);
    const batches = await tx.stockBatch.findMany({ where: { menuItemId: itemId, availableQty: { gt: 0 }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, orderBy: [{ expiresAt: { sort: 'asc', nulls: 'last' } }, { receivedAt: 'asc' }, { id: 'asc' }] });
    let remaining = quantity;
    for (const batch of batches) {
      if (!remaining) break;
      const take = Math.min(remaining, batch.availableQty);
      await tx.stockBatch.update({ where: { id: batch.id }, data: { availableQty: { decrement: take } } });
      out.push({ batchId: batch.id, quantity: take, expiresAt: batch.expiresAt?.toISOString() ?? null, packedQty: 0, unusableQty: 0, pendingInspectionQty: 0, releasedQty: 0 });
      remaining -= take;
    }
    if (remaining) throw new AppError(409, 'OUT_OF_STOCK', 'Not enough unexpired packs remain. Refresh your cart.');
  }
  const changed = await tx.menuItem.updateMany({ where: { id: itemId, stockQty: { gte: quantity }, isAvailable: true, deletedAt: null, approvalStatus: 'APPROVED' }, data: { stockQty: { decrement: quantity }, stockVersion: { increment: 1 } } });
  if (!changed.count) throw new AppError(409, 'OUT_OF_STOCK', 'An item no longer has enough usable stock. Refresh your cart before paying.');
  return out;
}

export async function reserveStock(tx: InventoryTx, orderId: string, lines: { itemId: string; quantity: number }[]) {
  const quantities = new Map<string, number>();
  for (const line of lines) quantities.set(line.itemId, (quantities.get(line.itemId) ?? 0) + line.quantity);
  for (const [id, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
    const batchAllocations = await takeStock(tx, id, quantity, new Date());
    await tx.inventoryReservation.create({ data: { orderId, menuItemId: id, quantity, batchAllocations: json(batchAllocations) } });
    await tx.stockMovement.create({ data: { menuItemId: id, delta: -quantity, kind: 'RESERVE', reason: 'Checkout reservation', reference: `reserve:${orderId}:${id}` } });
  }
}

/** Apply before READY/pickup/delivery. A vendor cannot fulfill recorded missing, damaged or expired units. */
export async function ensureOrderStockSafe(tx: InventoryTx, orderIds: string[], now = new Date()) {
  const rows = await tx.inventoryReservation.findMany({ where: { orderId: { in: orderIds }, state: 'HELD' } });
  if (rows.some((row) => row.unusableQty > 0 || allocations(row.batchAllocations).some((a) => expired(a.expiresAt, now) && a.quantity > a.unusableQty + a.releasedQty))) {
    throw new AppError(409, 'PACKING_REVIEW_REQUIRED', 'Resolve missing, damaged or expired packs with the customer before marking this order ready or delivering it.');
  }
}

// Called under the existing order/group lock. Only unpacked, usable packs can return automatically.
export async function settleStock(tx: InventoryTx, orders: { id: string; status: string }[], mode: 'CANCEL' | 'DELIVER') {
  if (mode === 'DELIVER') await ensureOrderStockSafe(tx, orders.map((o) => o.id));
  const rows = await tx.inventoryReservation.findMany({ where: { orderId: { in: orders.map((o) => o.id) }, state: 'HELD' }, orderBy: { menuItemId: 'asc' } });
  await lockProducts(tx, rows.map((row) => row.menuItemId));
  for (const row of rows) {
    const order = orders.find((o) => o.id === row.orderId)!;
    const beforePickup = mode === 'CANCEL' && !['PICKED_UP', 'ARRIVED_AT_GATE', 'DELIVERED'].includes(order.status);
    const batchRows = allocations(row.batchAllocations);
    let releasedQty = row.releasedQty, unusableQty = row.unusableQty, packedQty = row.packedQty, pendingInspectionQty = 0;
    if (beforePickup) {
      if (batchRows.length) {
        for (const batch of batchRows) {
          const quantity = unpacked(batch);
          if (expired(batch.expiresAt, new Date())) batch.unusableQty += quantity;
          else {
            batch.releasedQty += quantity;
            if (quantity) await tx.stockBatch.update({ where: { id: batch.batchId }, data: { availableQty: { increment: quantity } } });
          }
          batch.pendingInspectionQty = batch.packedQty;
        }
        releasedQty = sum(batchRows, 'releasedQty'); unusableQty = sum(batchRows, 'unusableQty'); packedQty = sum(batchRows, 'packedQty'); pendingInspectionQty = sum(batchRows, 'pendingInspectionQty');
      } else {
        releasedQty += row.quantity - row.packedQty - row.unusableQty - row.releasedQty;
        pendingInspectionQty = row.packedQty;
      }
    } else if (mode === 'CANCEL') {
      unusableQty = row.quantity - releasedQty; packedQty = 0;
      for (const batch of batchRows) { batch.unusableQty = batch.quantity - batch.releasedQty; batch.packedQty = 0; batch.pendingInspectionQty = 0; }
    }
    const returnedNow = releasedQty - row.releasedQty;
    const state = pendingInspectionQty ? 'AWAITING_INSPECTION' : beforePickup && releasedQty === row.quantity ? 'RELEASED' : 'CONSUMED';
    const changed = await tx.inventoryReservation.updateMany({ where: { id: row.id, state: 'HELD' }, data: { state, releasedQty, unusableQty, packedQty, pendingInspectionQty, batchAllocations: json(batchRows) } });
    if (!changed.count) continue;
    if (returnedNow) await tx.menuItem.update({ where: { id: row.menuItemId }, data: { stockQty: { increment: returnedNow }, stockVersion: { increment: 1 } } });
    await tx.stockMovement.create({ data: { menuItemId: row.menuItemId, delta: returnedNow, kind: returnedNow ? 'RELEASE' : mode === 'CANCEL' ? pendingInspectionQty ? 'INSPECTION' : 'LOSS' : 'SOLD', reason: mode === 'DELIVER' ? 'Delivery completed' : pendingInspectionQty ? 'Cancelled: packed units require physical inspection' : beforePickup ? 'Cancelled: only unpacked usable units returned' : 'Cancelled after pickup; inventory not restocked', reference: `settle:${row.orderId}:${row.menuItemId}`, details: { reservationId: row.id, pendingInspectionQty, unusableQty, returnedQty: returnedNow } } });
  }
}

/** Client-adjustment application helper. Caller owns order and sorted SKU locks, with a stable adjustment ID. */
export async function adjustOrderReservation(tx: InventoryTx, orderId: string, itemId: string, desiredQty: number, operationId: string) {
  if (!Number.isSafeInteger(desiredQty) || desiredQty < 0 || desiredQty > 1000000 || !operationId) throw new AppError(400, 'BAD_RESERVATION', 'A valid pack quantity and adjustment reference are required.');
  const reference = `order-adjust:${operationId}:${itemId}`;
  const replay = await tx.stockMovement.findUnique({ where: { reference } });
  if (replay) {
    if ((replay.details as any)?.desiredQty !== desiredQty || (replay.details as any)?.orderId !== orderId) throw new AppError(409, 'IDEMPOTENCY_MISMATCH', 'This adjustment reference was already used for a different quantity.');
    return tx.inventoryReservation.findUnique({ where: { orderId_menuItemId: { orderId, menuItemId: itemId } } });
  }
  let row = await tx.inventoryReservation.findUnique({ where: { orderId_menuItemId: { orderId, menuItemId: itemId } } });
  if (!row) {
    if (!desiredQty) return null;
    const batchRows = await takeStock(tx, itemId, desiredQty, new Date());
    row = await tx.inventoryReservation.create({ data: { orderId, menuItemId: itemId, quantity: desiredQty, batchAllocations: json(batchRows) } });
    await tx.stockMovement.create({ data: { menuItemId: itemId, delta: -desiredQty, kind: 'ADJUST_RESERVE', reason: 'Customer-approved order adjustment', reference, details: { orderId, desiredQty, previousQty: 0 } } });
    return row;
  }
  if (row.state !== 'HELD' && !(row.state === 'ADJUSTED' && row.quantity === 0)) throw new AppError(409, 'RESERVATION_SETTLED', 'This order stock is already settled.');
  const previousQty = row.quantity, batchRows = allocations(row.batchAllocations);
  let delta = 0, packedQty = row.packedQty, unusableQty = row.unusableQty;
  if (desiredQty > previousQty) {
    const added = await takeStock(tx, itemId, desiredQty - previousQty, new Date()); delta = previousQty - desiredQty;
    for (const allocation of added) { const existing = batchRows.find((v) => v.batchId === allocation.batchId); if (existing) existing.quantity += allocation.quantity; else batchRows.push(allocation); }
  } else if (desiredQty < previousQty) {
    let remaining = previousQty - desiredQty;
    const parts = batchRows.length ? batchRows : [{ batchId: '', quantity: row.quantity, packedQty, unusableQty, pendingInspectionQty: 0, releasedQty: 0, expiresAt: null }];
    if (remaining > parts.reduce((n, p) => n + p.unusableQty + unpacked(p), 0)) throw new AppError(409, 'PACKED_STOCK_REVIEW_REQUIRED', 'Explicitly unpack and inspect these packs before changing their order quantity.');
    for (const part of parts) {
      const remove = Math.min(remaining, part.unusableQty);part.unusableQty -= remove;part.quantity -= remove;remaining -= remove;
    }
    for (const part of parts) {
      if (!remaining) break;
      const remove = Math.min(remaining, unpacked(part));part.quantity -= remove;remaining -= remove;
      if (!expired(part.expiresAt, new Date())) {
        delta += remove;
        if (part.batchId && remove) await tx.stockBatch.update({ where: { id: part.batchId }, data: { availableQty: { increment: remove } } });
      }
    }
    packedQty = sum(parts, 'packedQty');unusableQty = sum(parts, 'unusableQty');
    if (delta) await tx.menuItem.update({ where: { id: itemId }, data: { stockQty: { increment: delta }, stockVersion: { increment: 1 } } });
  }
  const result = await tx.inventoryReservation.update({ where: { id: row.id }, data: { quantity: desiredQty, packedQty, unusableQty, state: desiredQty ? 'HELD' : 'ADJUSTED', batchAllocations: json(batchRows.filter((a) => a.quantity > 0)) } });
  await tx.stockMovement.create({ data: { menuItemId: itemId, delta, kind: 'ORDER_ADJUST', reason: 'Customer-approved order adjustment', reference, details: { orderId, desiredQty, previousQty, unusableQty } } });
  return result;
}

export const dispositionActions = ['PACK', 'UNPACK', 'MISSING', 'DAMAGED', 'EXPIRED', 'RETURN', 'WRITE_OFF'] as const;
export type DispositionAction = typeof dispositionActions[number];
export async function recordStockDisposition(tx: InventoryTx, reservationId: string, input: { action: DispositionAction; quantity: number; reason: string; actorId: string; clientRequestId: string; batchId?: string }) {
  if (!dispositionActions.includes(input.action) || !Number.isSafeInteger(input.quantity) || input.quantity < 1 || input.quantity > 1000000 || input.reason.trim().length < 5 || !/^[A-Za-z0-9_-]{1,64}$/.test(input.clientRequestId)) throw new AppError(400, 'BAD_DISPOSITION', 'Choose a valid action, whole pack count, useful reason and unique request ID.');
  const reference = `disposition:${reservationId}:${input.clientRequestId}`;
  const replay = await tx.stockMovement.findUnique({ where: { reference } });
  if (replay) {
    const details = replay.details as any;
    if (replay.actorId !== input.actorId || replay.reason !== input.reason || details?.action !== input.action || details?.quantity !== input.quantity || details?.batchId !== (input.batchId ?? null)) throw new AppError(409, 'IDEMPOTENCY_MISMATCH', 'This request ID belongs to a different inventory decision.');
    return tx.inventoryReservation.findUniqueOrThrow({ where: { id: reservationId } });
  }
  const row = await tx.inventoryReservation.findUniqueOrThrow({ where: { id: reservationId } });
  const held = row.state === 'HELD', inspection = row.state === 'AWAITING_INSPECTION';
  if (!held && !inspection) throw new AppError(409, 'RESERVATION_SETTLED', 'This stock has already been reconciled.');
  if (held && input.action === 'RETURN' || inspection && ['PACK', 'UNPACK'].includes(input.action)) throw new AppError(409, 'BAD_DISPOSITION', 'Choose an inventory action appropriate to the current packing or return stage.');
  const batchRows = allocations(row.batchAllocations);
  if (input.batchId && !batchRows.some((a) => a.batchId === input.batchId)) throw new AppError(400, 'BAD_BATCH', 'Choose a batch allocated to this order.');
  const parts = batchRows.length ? batchRows : [{ batchId: '', quantity: row.quantity, packedQty: row.packedQty, unusableQty: row.unusableQty, pendingInspectionQty: row.pendingInspectionQty, releasedQty: row.releasedQty, expiresAt: null }];
  let remaining = input.quantity, returned = 0;
  for (const part of parts) {
    if (!remaining || input.batchId && part.batchId !== input.batchId) continue;
    const capacity = inspection ? part.pendingInspectionQty : input.action === 'PACK' ? unpacked(part) : input.action === 'UNPACK' ? part.packedQty : unpacked(part) + part.packedQty;
    const quantity = Math.min(remaining, capacity);
    if (!quantity) continue;
    if (input.action === 'PACK') {
      if (expired(part.expiresAt, new Date())) throw new AppError(409, 'EXPIRED_STOCK', 'Expired packs cannot be packed for delivery. Mark them expired and resolve the shortage.');
      part.packedQty += quantity;
    } else if (input.action === 'UNPACK') part.packedQty -= quantity;
    else if (inspection) {
      if (input.action === 'RETURN') {
        if (expired(part.expiresAt, new Date())) throw new AppError(409, 'EXPIRED_STOCK', 'Expired packs cannot return to sale. Record a write-off.');
        part.releasedQty += quantity; returned += quantity;
        if (part.batchId) await tx.stockBatch.update({ where: { id: part.batchId }, data: { availableQty: { increment: quantity } } });
      } else part.unusableQty += quantity;
      part.pendingInspectionQty -= quantity;part.packedQty -= quantity;
    } else {
      const fromPacked = Math.max(0, quantity - unpacked(part));part.packedQty -= fromPacked;part.unusableQty += quantity;
    }
    remaining -= quantity;
  }
  if (remaining) throw new AppError(409, 'DISPOSITION_QUANTITY_CHANGED', 'Not enough packs remain for this action. Refresh the packing details.');
  const packedQty = sum(parts, 'packedQty'), unusableQty = sum(parts, 'unusableQty'), releasedQty = sum(parts, 'releasedQty'), pendingInspectionQty = sum(parts, 'pendingInspectionQty');
  const state = held ? 'HELD' : pendingInspectionQty ? 'AWAITING_INSPECTION' : releasedQty === row.quantity ? 'RELEASED' : 'RECONCILED';
  const result = await tx.inventoryReservation.update({ where: { id: row.id }, data: { packedQty, unusableQty, releasedQty, pendingInspectionQty, state, batchAllocations: json(batchRows) } });
  if (returned) await tx.menuItem.update({ where: { id: row.menuItemId }, data: { stockQty: { increment: returned }, stockVersion: { increment: 1 } } });
  await tx.stockMovement.create({ data: { menuItemId: row.menuItemId, delta: returned, kind: input.action, reason: input.reason, actorId: input.actorId, reference, details: { reservationId, action: input.action, quantity: input.quantity, batchId: input.batchId ?? null, returned, packedQty, unusableQty, pendingInspectionQty } } });
  await tx.adminAuditLog.create({ data: { action: 'STOCK_DISPOSITION', targetType: 'ORDER', targetId: row.orderId, summary: `${input.actorId}: ${input.action} ${input.quantity} packs; ${input.reason}` } });
  return result;
}

/** Batched availability projection for customer/admin lists, without mutating stock on a GET. */
export async function batchAvailability(itemIds: string[], now = new Date()) {
  const rows = itemIds.length ? await prisma.stockBatch.findMany({ where: { menuItemId: { in: itemIds }, availableQty: { gt: 0 } }, select: { menuItemId: true, availableQty: true, expiresAt: true } }) : [];
  const result = new Map<string, { availableQty: number; expiredQty: number; expiringQty: number; nextExpiry: string | null }>();
  for (const row of rows) {
    const value = result.get(row.menuItemId) ?? { availableQty: 0, expiredQty: 0, expiringQty: 0, nextExpiry: null };
    if (expired(row.expiresAt, now)) value.expiredQty += row.availableQty;
    else {
      value.availableQty += row.availableQty;
      if (row.expiresAt && row.expiresAt.getTime() <= now.getTime() + 7 * 86400000) value.expiringQty += row.availableQty;
      if (row.expiresAt && (!value.nextExpiry || row.expiresAt.getTime() < new Date(value.nextExpiry).getTime())) value.nextExpiry = row.expiresAt.toISOString();
    }
    result.set(row.menuItemId, value);
  }
  return result;
}

export async function ensureStockAvailable(lines: { itemId: string; quantity: number }[]) {
  const quantities = new Map<string, number>();
  for (const line of lines) quantities.set(line.itemId, (quantities.get(line.itemId) ?? 0) + line.quantity);
  const rows = await prisma.menuItem.findMany({ where: { id: { in: [...quantities.keys()] } }, select: { id: true, stockQty: true, batchTracking: true } });
  const batches = await batchAvailability(rows.filter((row) => row.batchTracking).map((row) => row.id));
  if (rows.length !== quantities.size || rows.some((row) => (row.batchTracking ? batches.get(row.id)?.availableQty ?? 0 : row.stockQty) < quantities.get(row.id)!)) throw new AppError(409, 'OUT_OF_STOCK', 'Some packs no longer have enough unexpired stock. Refresh your cart.');
}
