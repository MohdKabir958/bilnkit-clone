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
export async function reserveStock(tx: Prisma.TransactionClient, orderId: string, lines: { itemId: string; quantity: number }[]) {
  const quantities = new Map<string, number>();
  for (const l of lines) quantities.set(l.itemId, (quantities.get(l.itemId) ?? 0) + l.quantity);
  for (const [id, quantity] of [...quantities].sort(([a], [b]) => a.localeCompare(b))) {
    const changed = await tx.menuItem.updateMany({ where: { id, stockQty: { gte: quantity }, isAvailable: true, deletedAt: null, approvalStatus: 'APPROVED' }, data: { stockQty: { decrement: quantity }, stockVersion: { increment: 1 } } });
    if (!changed.count) throw new AppError(409, 'OUT_OF_STOCK', 'An item no longer has enough stock. Refresh your cart before paying.');
    await tx.inventoryReservation.create({ data: { orderId, menuItemId: id, quantity } });
    await tx.stockMovement.create({ data: { menuItemId: id, delta: -quantity, kind: 'RESERVE', reason: 'Checkout reservation', reference: `reserve:${orderId}:${id}` } });
  }
}
// Called inside the existing order/group lock, never after commit. Available stock was
// already deducted at checkout. Only a cancellation before pickup returns physical units.
export async function settleStock(tx: Prisma.TransactionClient, orders: { id: string; status: string }[], mode: 'CANCEL' | 'DELIVER') {
  const rows = await tx.inventoryReservation.findMany({ where: { orderId: { in: orders.map((o) => o.id) }, state: 'HELD' }, orderBy: { menuItemId: 'asc' } });
  await lockProducts(tx, rows.map((r) => r.menuItemId));
  for (const r of rows) {
    const o = orders.find((o) => o.id === r.orderId)!;
    const release = mode === 'CANCEL' && !['PICKED_UP', 'ARRIVED_AT_GATE', 'DELIVERED'].includes(o.status);
    const changed = await tx.inventoryReservation.updateMany({ where: { id: r.id, state: 'HELD' }, data: { state: release ? 'RELEASED' : 'CONSUMED' } });
    if (!changed.count) continue;
    if (release) await tx.menuItem.update({ where: { id: r.menuItemId }, data: { stockQty: { increment: r.quantity }, stockVersion: { increment: 1 } } });
    await tx.stockMovement.create({ data: { menuItemId: r.menuItemId, delta: release ? r.quantity : 0, kind: release ? 'RELEASE' : mode === 'CANCEL' ? 'LOSS' : 'SOLD', reason: release ? 'Cancelled before pickup' : mode === 'CANCEL' ? 'Cancelled after pickup; inventory not restocked' : 'Delivery completed', reference: `settle:${r.orderId}:${r.menuItemId}` } });
  }
}

export async function ensureStockAvailable(lines: {itemId:string;quantity:number}[]) {
  const quantities = new Map<string,number>();
  for (const l of lines) quantities.set(l.itemId,(quantities.get(l.itemId)??0)+l.quantity);
  const rows = await prisma.menuItem.findMany({where:{id:{in:[...quantities.keys()]}},select:{id:true,stockQty:true}});
  if (rows.length !== quantities.size || rows.some((r)=>r.stockQty < quantities.get(r.id)!)) throw new AppError(409,'OUT_OF_STOCK','Some packs no longer have enough stock. Refresh your cart.');
}
