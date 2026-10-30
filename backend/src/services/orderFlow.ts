import { requireFulfillmentCapacity } from './capacity';
import { preparationTransitionData } from './preparation';
import { pendingCheckoutProtected, reconcileCheckoutsBeforeReplacement } from './checkoutRecovery';
import { requirePaymentMethod } from './paymentCapabilities';
import { isCashOrder, fulfillmentAuthorized, fulfillmentWhere, requireMarketplaceStore, requireRiderAt } from './marketplace';
import { stageNotificationIntents, drainNotificationIntents } from './push/intents';
import { ensureDispatchOffer, acceptDispatchOffer, riderServesOrders } from './dispatch';
import { lockProducts, reserveStock, settleStock, ensureOrderStockSafe } from './inventory';
import { errSummary } from '../utils/log';
import { Prisma } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual, randomUUID } from 'crypto';
import { prisma } from '../db';
import { MAX_ACTIVE_ORDERS_PER_RIDER, MAX_UNPAID_OPEN_ORDERS, OTP_MAX_ATTEMPTS, RECONCILE_MIN_AGE_MS, paymentWindowMin } from '../config/orderFlow';
import { ownedAddress, addressSnapshot, deliveryEligibility } from './geography';
import { ORDER_VIEW_INCLUDE, OrderWithRelations, ACTIVE_RIDER_STATUSES, isPoolEligible, isVendorVisible, payableAmount, groupAllAccepted } from './orderView';
import { lockGroupRows } from './groupLock';
import { publishOrderChange, getIo } from '../realtime';
import { executeRefund, refundExtraPayment, runInBackground, ExtraRefundInput } from './refundService';
import { writeAudit } from './audit';
import { getPaymentProvider, withProviderTimeout, toProviderError } from './paymentService';
import { queuePush } from './push/pushService';
import { pushEventsForChange, pushEventsForGroupChange } from './push/events';
import { validateAndCalculateOrder, normaliseCoupon, couponEligibilityProblem } from '../utils/validation';

/**
 * Every order state change lives here (Docs/16_order_flow_contract.md sections 1, 2 and 4; Docs/22 for multi-restaurant orders).
 *
 * Concurrency model: each change runs in a transaction that first takes a row lock on the order
 * (SELECT ... FOR UPDATE), re-reads it, decides, writes, commits. Two requests for the same order
 * (webhook + verify, two riders, job + late payment, double taps) therefore run one after the other
 * and the second one sees the first one's result. Side effects (sockets, push, refunds, audit) run
 * only after the commit and only for the caller that actually changed the row.
 *
 * Groups (Docs/22 section 3): an order that belongs to an OrderGroup is locked as rider -> GROUP row -> ALL children in ascending id
 * order (services/groupLock.ts), whatever single child the caller named. A transaction therefore always sees a consistent group and
 * can change any number of its children atomically (paid, cancel, claim, release, arrive, deliver). Single orders keep one row lock.
 */
export class OrderFlowError extends Error {
  constructor(public status: number, public code: string, message: string, public extra: Record<string, unknown> = {}) {
    super(message);
  }
}

export type Actor = { id: string; role: 'STUDENT' | 'VENDOR' | 'DRIVER' | 'ADMIN' | string };
export type CancelledBy = 'CUSTOMER' | 'VENDOR' | 'ADMIN' | 'SYSTEM';
export type Tx = Prisma.TransactionClient;

const POOL_STATUSES = ['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP'] as const;
const NEXT_STATUS: Record<string, string> = {
  PLACED: 'ACCEPTED',
  ACCEPTED: 'PREPARING',
  PREPARING: 'READY_FOR_PICKUP',
  READY_FOR_PICKUP: 'PICKED_UP',
  PICKED_UP: 'ARRIVED_AT_GATE',
  ARRIVED_AT_GATE: 'DELIVERED',
};
const VENDOR_TARGETS = new Set(['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP']);
const RIDER_TARGETS = new Set(['PICKED_UP', 'ARRIVED_AT_GATE']);
const ADMIN_TARGETS = new Set(['ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'ARRIVED_AT_GATE']);

export const notFound = () => new OrderFlowError(404, 'NOT_FOUND', 'Order not found.');

/**
 * Docs/22 review #7: authorisation BEFORE any lock. A user-facing change first does a plain unlocked read and refuses a caller who is not
 * the customer / restaurant owner / assigned rider of the order (the same 404 the locked code answers), so someone who merely guesses an
 * order id can never make a transaction queue on (or hold) the group and its children. The authoritative check is repeated under the lock.
 */
export const preAuthorize = async (orderId: string, allowed: (o: { customerId: string; driverId: string | null; vendorUserId: string | null }) => boolean): Promise<void> => {
  const o = await prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, driverId: true, vendor: { select: { userId: true } } } });
  if (!o || !allowed({ customerId: o.customerId, driverId: o.driverId, vendorUserId: o.vendor.userId })) throw notFound();
};
const isTerminal = (status: string) => status === 'DELIVERED' || status === 'CANCELLED';
export const secureOtp = () => randomInt(0, 10_000).toString().padStart(4, '0'); // CSPRNG, 0000-9999

export const loadOrder = (id: string) => prisma.order.findUnique({ where: { id }, include: ORDER_VIEW_INCLUDE });

/** Every child of a group, by groupIndex (0 = primary first), each loaded with the full view include. */
export const loadGroupChildren = (db: Tx | typeof prisma, groupId: string) =>
  db.order.findMany({ where: { groupId }, include: ORDER_VIEW_INCLUDE, orderBy: { groupIndex: 'asc' } });

export type LockedOrder = { order: OrderWithRelations; group: OrderWithRelations[] | null };

/**
 * Takes the locks of Docs/22 section 3 for `orderId` and re-reads it (and its group). 404 when it does not exist.
 * Single order: its row. Grouped order: the group row, then every child in ascending id order.
 */
export const lockOrderInTx = async (tx: Tx, orderId: string): Promise<LockedOrder> => {
  const meta = await tx.$queryRaw<{ groupId: string | null }[]>`SELECT "groupId" FROM "Order" WHERE "id" = ${orderId}`;
  if (meta.length === 0) throw notFound();
  const groupId = meta[0].groupId;
  if (groupId) {
    await lockGroupRows(tx, groupId);
    const children = await loadGroupChildren(tx, groupId);
    const order = children.find((c) => c.id === orderId);
    if (!order) throw notFound();
    return { order, group: children };
  }
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "Order" WHERE "id" = ${orderId} FOR UPDATE`;
  if (rows.length === 0) throw notFound();
  return { order: await tx.order.findUniqueOrThrow({ where: { id: orderId }, include: ORDER_VIEW_INCLUDE }), group: null };
};

/** Run `fn` with the order (and its whole group, if any) locked. 404 when it does not exist. */
export const withOrderLock = <T>(
  orderId: string,
  fn: (tx: Tx, order: OrderWithRelations, group: OrderWithRelations[] | null) => Promise<T>,
  opts: { riderUserIdFirst?: string; assignedByAdmin?: boolean } = {},
): Promise<T> =>
  prisma.$transaction(
    async (tx) => {
      // Lock order is rider -> (group ->) order everywhere (claimOrder does the same), so a claim and an admin reassign cannot deadlock.
      if (opts.riderUserIdFirst) await tx.$queryRaw`SELECT "id" FROM "DriverPartner" WHERE "userId" = ${opts.riderUserIdFirst} FOR UPDATE`;
      const { order, group } = await lockOrderInTx(tx, orderId);
      const result=await fn(tx, order, group);
      const change=result as unknown as Partial<ChangeResult>;
      if(change?.changed && change.before && change.order) {
        await stageNotificationIntents(tx,change,opts.assignedByAdmin);
        const unavailable=(change.group?.after??[change.order]).filter((o)=>o.driverId||isTerminal(o.status)).map((o)=>o.id);
        if(unavailable.length) await tx.dispatchOffer.updateMany({where:{orderId:{in:unavailable},state:'PENDING'},data:{state:'REVOKED',reason:'Order is no longer available'}});
        const riderIds=[...new Set([change.before.driverId,change.order.driverId].filter((id):id is string=>!!id))];
        for(const id of riderIds) if(!await tx.order.count({where:{driverId:id,status:{in:[...ACTIVE_RIDER_STATUSES]}}})) await tx.driverLocation.deleteMany({where:{driverId:id}});
        if(change.before.status!==change.order.status||change.before.paymentStatus!==change.order.paymentStatus||change.before.driverId!==change.order.driverId) await tx.adminAuditLog.create({data:{action:'ORDER_STATE_CHANGED',targetType:'ORDER',targetId:change.order.id,summary:`${change.before.status}/${change.before.paymentStatus}/${change.before.driverId??'unassigned'} -> ${change.order.status}/${change.order.paymentStatus}/${change.order.driverId??'unassigned'}`}});
      }
      return result;
    },
    { maxWait: 15_000, timeout: 30_000 },
  );

const reload = (tx: Tx, id: string) => tx.order.findUniqueOrThrow({ where: { id }, include: ORDER_VIEW_INCLUDE });

/** What a group transaction changed: every child before and after (by groupIndex) and the ids that were written. */
export type GroupChangeInfo = { before: OrderWithRelations[]; after: OrderWithRelations[]; touched: string[] };

/** Result of a change: the order before and after, and which side effects the commit unlocked. */
export type ChangeResult = {
  order: OrderWithRelations;
  before: OrderWithRelations;
  changed: boolean;
  refundNeeded?: boolean;
  newOrderAlert?: boolean;
  message?: string;
  /** Docs/22: set when the change touched a group (then order/before are the child the caller named). */
  group?: GroupChangeInfo;
  /** The order that carries the refund (the primary child of a group); defaults to `order`. */
  refundOrderId?: string;
};

/** Builds the result of a group transaction: reloads every child AFTER all writes so each carries a consistent sibling snapshot. */
export const groupResult = async (tx: Tx, trigger: OrderWithRelations, before: OrderWithRelations[], touched: string[], extra: Partial<ChangeResult> = {}): Promise<ChangeResult> => {
  const after = await loadGroupChildren(tx, trigger.groupId!);
  return { order: after.find((c) => c.id === trigger.id)!, before: trigger, changed: true, group: { before, after, touched }, ...extra };
};

/**
 * After-commit side effects of a change. `awaitRefund` lets user-facing endpoints answer with the
 * final refund state; the webhook runs refunds in the background so Razorpay gets its 200 quickly.
 * `deferRefund` leaves the refund (refundStatus stays PENDING) to the caller: the maintenance job runs its refunds in its own
 * bounded, circuit-broken provider phase so a hung Razorpay can never stall the cancellations.
 */
export const finishChange = async (r: ChangeResult, opts: { awaitRefund?: boolean; deferRefund?: boolean; assignedByAdmin?: boolean } = { awaitRefund: true }): Promise<OrderWithRelations> => {
  if (!r.changed) return r.order;
  drainNotificationIntents();
  const dispatchPrimary=r.group?.after[0]??r.order;
  if(isPoolEligible(dispatchPrimary)) await ensureDispatchOffer(dispatchPrimary.id).catch(()=>console.error('Dispatch scheduling failed; maintenance will retry.'));
  const refundId = r.refundOrderId ?? r.order.id;
  if (r.group) {
    // Docs/22: sockets for every written child, the pool entry (the primary) when the group entered / left the pool, push without duplicates.
    const g = r.group;
    const touched = new Set(g.touched);
    const primaryBefore = g.before[0];
    const primaryAfter = g.after[0];
    const wasPool = isPoolEligible(primaryBefore);
    const nowPool = isPoolEligible(primaryAfter);
    // A restaurant's `group.allAccepted` changes when ANOTHER restaurant accepts: every restaurant is told, not only the one that moved.
    const acceptedFlipped = groupAllAccepted(g.before) !== groupAllAccepted(g.after);
    for (const after of g.after) {
      const isPrimary = after.id === primaryAfter.id;
      if (!touched.has(after.id) && !acceptedFlipped && !(isPrimary && wasPool !== nowPool)) continue;
      await publishOrderChange(after, { wasPoolEligible: isPrimary ? wasPool : false, newOrderAlert: r.newOrderAlert });
    }
    try {
      for (const spec of pushEventsForGroupChange(g.before, g.after, touched, r.order.id, { newOrderAlert: r.newOrderAlert, assignedByAdmin: opts.assignedByAdmin })) { if(spec.event!=='NEW_DELIVERY') queuePush(spec.orderId, spec.event, spec.opts); }
    } catch (err) {
      console.error('push scheduling failed:', errSummary(err));
    }
    const riders = new Set([...g.before, ...g.after].map((c) => c.driverId).filter((x): x is string => !!x));
    for (const riderId of riders) await refreshRiderDuty(riderId);
  } else {
    await publishOrderChange(r.order, { wasPoolEligible: isPoolEligible(r.before), newOrderAlert: r.newOrderAlert });
    // Push (FCM) is an addition to the sockets above: scheduled after the commit, never awaited, never able to throw (Docs/18).
    try {
      for (const spec of pushEventsForChange(r.before, r.order, { newOrderAlert: r.newOrderAlert, assignedByAdmin: opts.assignedByAdmin })) { if(spec.event!=='NEW_DELIVERY') queuePush(r.order.id, spec.event, spec.opts); }
    } catch (err) {
      console.error('push scheduling failed:', errSummary(err));
    }
    const riders = new Set([r.before.driverId, r.order.driverId].filter((x): x is string => !!x));
    for (const riderId of riders) await refreshRiderDuty(riderId);
  }
  if (r.refundNeeded && !opts.deferRefund) {
    if (opts.awaitRefund) {
      await executeRefund(refundId);
      return (await loadOrder(r.order.id)) ?? r.order;
    }
    runInBackground(executeRefund(refundId));
  }
  return r.order;
};

/** Keeps the dashboard's duty status honest: IN_TRANSIT while carrying an order, ONLINE again after. */
export const refreshRiderDuty = async (riderUserId: string) => {
  try {
    const active = await prisma.order.count({ where: { driverId: riderUserId, status: { in: [...ACTIVE_RIDER_STATUSES] } } });
    const res = active > 0
      ? await prisma.driverPartner.updateMany({ where: { userId: riderUserId, dutyStatus: 'ONLINE' }, data: { dutyStatus: 'IN_TRANSIT' } })
      : await prisma.driverPartner.updateMany({ where: { userId: riderUserId, dutyStatus: 'IN_TRANSIT' }, data: { dutyStatus: 'ONLINE' } });
    if (res.count > 0) {
      const d = await prisma.driverPartner.findUnique({ where: { userId: riderUserId }, select: { id: true, userId: true, dutyStatus: true } });
      if (d) getIo()?.to('admins').emit('driver_duty_update', d);
    }
  } catch (err) {
    console.error('refreshRiderDuty failed:', errSummary(err));
  }
};

// ----------------------------------------------------------------------------
// Customer: place an order
// ----------------------------------------------------------------------------
export type PlaceOrderInput = {
  workflowVersion?: 2;
  paymentMethod?: 'ONLINE' | 'COD';
  addressId?: string;
  vendorId: string;
  items: { itemId: string; quantity: number }[];
  dropoffHostel: string;
  dropoffNotes: string | null;
  couponCode?: string;
  clientRequestId: string | null;
};

/** Same items (by menu item id and quantity, repeated lines added up) as the stored order. */
export const sameItems = (o: { items: { id: string; menuItemId: string | null; quantity: number }[] }, items: unknown): boolean => {
  const want = new Map<string, number>();
  if (!Array.isArray(items)) return false;
  for (const i of items) {
    if (!i || typeof i.itemId !== 'string' || !Number.isInteger(i.quantity)) return false;
    want.set(i.itemId, (want.get(i.itemId) ?? 0) + i.quantity);
  }
  const have = new Map<string, number>();
  for (const i of o.items) have.set(i.menuItemId ?? `deleted:${i.id}`, (have.get(i.menuItemId ?? `deleted:${i.id}`) ?? 0) + i.quantity);
  if (want.size !== have.size) return false;
  for (const [id, q] of want) if (have.get(id) !== q) return false;
  return true;
};

/** Same checkout attempt = same request: vendor, items (by id and quantity), drop point, notes and coupon must all match. */
const sameRequest = (o: OrderWithRelations, input: PlaceOrderInput): boolean => {
  if (o.vendorId !== input.vendorId || o.paymentMethod !== (input.paymentMethod ?? 'ONLINE') || o.workflowVersion !== (input.workflowVersion ?? 1)) return false;
  if (input.addressId) {
    if ((o.addressSnapshot as any)?.id !== input.addressId && o.addressId !== input.addressId) return false;
  } else if (input.dropoffHostel && o.dropoffHostel !== input.dropoffHostel) return false;
  if ((o.dropoffNotes ?? '') !== (input.dropoffNotes ?? '')) return false;
  if ((o.couponCode ?? null) !== normaliseCoupon(input.couponCode)) return false;
  return sameItems(o, input.items);
};

export const mismatch = () => new OrderFlowError(409, 'CLIENT_REQUEST_MISMATCH', 'This checkout id was already used for a different order. Start a new checkout.');

export const REPLACED_REASON = 'Replaced by a newer order';

/**
 * An earlier checkout that was never paid and has no payment on its way: safe to cancel when the same customer starts a new
 * checkout at the same restaurant. NEVER true for a PAID order, for any payment row that is PAID / REFUNDED or has a captured
 * amount recorded (money may be at Razorpay), or for a Razorpay order opened less than RECONCILE_MIN_AGE_MS ago that has not
 * failed (the customer may be in the UPI / card screen right now). A late capture on a superseded order is refunded by markOrderPaid.
 */
const isAbandonedCheckout = (o: OrderWithRelations, now = Date.now()): boolean =>
  !isCashOrder(o) && o.status === 'PLACED' &&
  (o.paymentStatus === 'PENDING' || o.paymentStatus === 'FAILED') &&
  !o.paidAt &&
  o.payments.every((p) => p.status !== 'PAID' && p.status !== 'REFUNDED' && p.capturedAmountPaise == null) && !pendingCheckoutProtected(o, now);

/**
 * isAbandonedCheckout for an order that may belong to a group (Docs/22): a group is abandoned only as a whole, judged by its PRIMARY
 * child (the payment rows live there; a sibling has none and would always look abandoned) and every child must still be an unpaid PLACED order.
 */
export const isAbandonedOrder = (o: OrderWithRelations, group: OrderWithRelations[] | null, now = Date.now()): boolean =>
  group
    ? group.every((c) => c.status === 'PLACED' && (c.paymentStatus === 'PENDING' || c.paymentStatus === 'FAILED') && !c.paidAt) && isAbandonedCheckout(group[0], now)
    : isAbandonedCheckout(o, now);

/** How many open orders a customer has that are still unpaid; a combined order counts ONCE (Docs/22). */
export const countUnpaidOpen = async (tx: Tx, customerId: string): Promise<number> => {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT COUNT(DISTINCT COALESCE("groupId", "id"))::int AS n FROM "Order"
    WHERE "customerId" = ${customerId} AND "status"::text NOT IN ('DELIVERED', 'CANCELLED') AND "paymentStatus"::text IN ('PENDING', 'FAILED')`;
  return rows[0]?.n ?? 0;
};

/** Preserve coupon and global-limit errors while refusing a second payment on an overlapping checkout. */
export const blockPendingCheckout = async (tx: Tx, customerId: string, pendingOrderId: string, coupon?: string | null): Promise<never> => {
  if (coupon) {
    const problem = await couponEligibilityProblem(tx, customerId, coupon);
    if (problem) throw new OrderFlowError(400, 'COUPON_NOT_APPLICABLE', problem, { field: 'couponCode' });
  }
  if (await countUnpaidOpen(tx, customerId) >= MAX_UNPAID_OPEN_ORDERS) throw new OrderFlowError(429, 'TOO_MANY_UNPAID_ORDERS', 'Resolve an existing unpaid order before starting another.');
  throw new OrderFlowError(409, 'PAYMENT_IN_PROGRESS', 'Your earlier payment may still be processing. Resume that order or recheck its payment status.', { pendingOrderId, actions: ['RESUME', 'RECHECK', 'CONTACT_SUPPORT'] });
};

export const placeOrder = async (customerId: string, input: PlaceOrderInput): Promise<{ order: OrderWithRelations; replay: boolean }> => {
  const findReplay = () =>
    input.clientRequestId
      ? prisma.order.findUnique({ where: { customerId_clientRequestId: { customerId, clientRequestId: input.clientRequestId } }, include: ORDER_VIEW_INCLUDE })
      : null;

  // Same checkout attempt again (double tap, retry after a lost response): the same order, never a second one.
  // The same id with a different cart / drop point / coupon is a client bug (or tampering): refuse, do not hand back the old order.
  const existing = await findReplay();
  if (existing) {
    if (!sameRequest(existing, input)) throw mismatch();
    return { order: existing, replay: true };
  }

  // The account must exist and not be deleted (a valid 30-day token of a removed user used to end in a 500).
  const customer = await prisma.user.findUnique({ where: { id: customerId }, select: { id: true, deletedAt: true } });
  if (!customer || customer.deletedAt) throw new OrderFlowError(401, 'ACCOUNT_UNAVAILABLE', 'This account is no longer available. Please sign in again.');

  const vendor = await prisma.vendor.findUnique({ where: { id: input.vendorId } });
  if (!vendor || vendor.approvalStatus !== 'APPROVED') throw new OrderFlowError(400, 'VENDOR_UNAVAILABLE', 'This store is not available right now.');
  if (!vendor.isAcceptingOrders) throw new OrderFlowError(400, 'VENDOR_CLOSED', 'This store is currently closed for new orders.');

  const selectedAddress = await ownedAddress(prisma, customerId, input.addressId);
  const delivery = await deliveryEligibility(prisma, selectedAddress, input.vendorId);
  let priced = await validateAndCalculateOrder(input.vendorId, input.items, input.couponCode, delivery.feePaise);
  if (!priced.isValid) throw new OrderFlowError(400, 'INVALID_ITEMS', priced.errorMessage || 'Some items are not available.', { field: 'items' });
  // A coupon that was sent but gives nothing is an error the customer must see, not a silently ignored field.
  if (priced.couponProblem) throw new OrderFlowError(400, 'COUPON_NOT_APPLICABLE', priced.couponProblem, { field: 'couponCode' });

  await reconcileCheckoutsBeforeReplacement(customerId, [input.vendorId]);
  const replaced: ChangeResult[] = [];
  try {
    const outcome = await prisma.$transaction(
      async (tx): Promise<{ order: OrderWithRelations; replay: boolean }> => {
        // One checkout at a time per customer, so the unpaid-orders limit and single-use coupons cannot be raced.
        const locked = await tx.$queryRaw<{ deletedAt: Date | null }[]>`SELECT "deletedAt" FROM "User" WHERE "id" = ${customerId} FOR UPDATE`;
        if (locked.length === 0 || locked[0].deletedAt) throw new OrderFlowError(401, 'ACCOUNT_UNAVAILABLE', 'This account is no longer available. Please sign in again.');

        // The same checkout again that overlapped the first request: that request has committed by now (we waited for the lock),
        // so answer with its order instead of failing the coupon / unpaid-limit checks below against our own twin.
        if (input.clientRequestId) {
          const twin = await tx.order.findUnique({ where: { customerId_clientRequestId: { customerId, clientRequestId: input.clientRequestId } }, include: ORDER_VIEW_INCLUDE });
          if (twin) {
            if (!sameRequest(twin, input)) throw mismatch();
            return { order: twin, replay: true };
          }
        }

        const address = await ownedAddress(tx, customerId, input.addressId, true);
        const eligible = await deliveryEligibility(tx, address, input.vendorId, true);
        let capacitySnapshot: Prisma.InputJsonValue | undefined;
        if (input.workflowVersion === 2) {
          const store = await requireMarketplaceStore(tx, input.vendorId, true);
          requirePaymentMethod(input.paymentMethod ?? 'ONLINE', !!store.city?.codEnabled);
          if (input.paymentMethod === 'COD' && !store.city?.codEnabled) throw new OrderFlowError(409,'COD_UNAVAILABLE','Cash on delivery is not enabled in this city. Choose online payment.');
        } else if (input.paymentMethod === 'COD') throw new OrderFlowError(400,'INVALID_PAYMENT_METHOD','Use marketplace checkout for cash on delivery.');


        // A new checkout replaces this customer's own abandoned, never-paid orders at the same restaurant, so their coupon and
        // the unpaid-orders limit are free again (they used to stay locked until the 15-minute expiry). Only this customer's orders
        // are looked at (customerId), each is re-checked under its row lock, and it goes through the normal cancel code.
        const stale = await tx.order.findMany({
          where: { customerId, vendorId: input.vendorId, status: 'PLACED', paymentStatus: { in: ['PENDING', 'FAILED'] }, paidAt: null },
          select: { id: true },
          orderBy: { createdAt: 'asc' },
          take: 10,
        });
        const staleLocks: LockedOrder[] = [];
        for (const { id } of stale) {
          const l = await lockOrderInTx(tx, id).catch((e) => (e instanceof OrderFlowError && e.status === 404 ? null : Promise.reject(e)));
          if (l && l.order.customerId === customerId && !staleLocks.some((held) => (held.order.groupId ?? held.order.id) === (l.order.groupId ?? l.order.id))) staleLocks.push(l);
        }
        // Lock all old/new SKUs together before releasing any old reservation. Two
        // customers replacing carts with opposite SKUs must acquire one common order.
        await lockProducts(tx, [...input.items.map((i) => i.itemId), ...staleLocks.flatMap((l) => (l.group ?? [l.order]).flatMap((o) => o.items.flatMap((i) => i.menuItemId ? [i.menuItemId] : [])))]);
        for (const l of staleLocks) {
          const creation = await tx.paymentCreation.findUnique({where:{orderId:l.order.id}});
          if (creation && ['CREATING','UNKNOWN'].includes(creation.state)) throw new OrderFlowError(409,'PAYMENT_START_PENDING','Payment setup is being checked. Resume the earlier order.',{pendingOrderId:l.order.id});
          if (pendingCheckoutProtected((l.group ?? [l.order])[0])) await blockPendingCheckout(tx, customerId, l.order.id, priced.appliedCoupon);
          const r = await cancelInTx(tx, l.order, { id: 'system', role: 'SYSTEM' }, 'SYSTEM', REPLACED_REASON, { guard: (o, g) => isAbandonedOrder(o, g) }, l.group);
          if (r.changed) replaced.push(r);
        }

        if(input.workflowVersion===2) capacitySnapshot=await requireFulfillmentCapacity(tx,input.vendorId,address,{lock:true,paymentMethod:input.paymentMethod??'ONLINE'}) as unknown as Prisma.InputJsonValue;
        priced = await validateAndCalculateOrder(input.vendorId, input.items, input.couponCode, eligible.feePaise, tx);
        if (!priced.isValid || priced.couponProblem) throw new OrderFlowError(409, 'CART_CHANGED', priced.errorMessage || priced.couponProblem || 'The cart changed. Refresh the quote.');

        if (priced.appliedCoupon) {
          const problem = await couponEligibilityProblem(tx, customerId, priced.appliedCoupon);
          if (problem) throw new OrderFlowError(400, 'COUPON_NOT_APPLICABLE', problem, { field: 'couponCode' });
        }
        const unpaid = await countUnpaidOpen(tx, customerId);
        if (unpaid >= MAX_UNPAID_OPEN_ORDERS) {
          throw new OrderFlowError(429, 'TOO_MANY_UNPAID_ORDERS', input.workflowVersion===2?'You have too many open orders. Wait for a delivery or cancel an unaccepted order.':`You already have ${unpaid} unpaid orders. Pay for one or cancel it before placing another.`);
        }
        const created = await tx.order.create({
          data: {
            customerId,
            capacitySnapshot,
            workflowVersion: input.workflowVersion ?? 1,
            paymentMethod: input.paymentMethod ?? 'ONLINE',
            vendorId: input.vendorId,
            clientRequestId: input.clientRequestId,
            subtotal: priced.calculatedSubtotal,
            deliveryFee: priced.calculatedDeliveryFee,
            taxAndPackaging: priced.calculatedTaxAndPackaging,
            // Docs/21: what the restaurant earns and what Grozo keeps, from the dish snapshots; the fee parts for the records.
            vendorSubtotal: priced.calculatedVendorSubtotal,
            commissionTotal: priced.calculatedCommissionTotal,
            feeBreakdown: (priced.feeBreakdown ?? undefined) as Prisma.InputJsonValue | undefined,
            discount: priced.calculatedDiscount,
            couponCode: priced.appliedCoupon ?? null,
            totalAmount: priced.calculatedTotalAmount,
            dropoffHostel: address.label,
            addressId: address.id,
            addressSnapshot: { id: address.id, ...addressSnapshot(address) },
            dropoffNotes: input.dropoffNotes,
            status: 'PLACED',
            paymentStatus: 'PENDING',
            items: { create: priced.verifiedItems.map((i) => ({ menuItemId: i.itemId, name: i.name, quantity: i.quantity, price: i.price, vendorUnitPrice: i.vendorUnitPrice, commissionUnit: i.commissionUnit, productSnapshot: i.productSnapshot })) },
          },
          include: ORDER_VIEW_INCLUDE,
        });
        await reserveStock(tx, created.id, input.items);
        await tx.notificationIntent.create({data:{orderId:created.id,event:'ORDER_PLACED',options:{}}});
        if (isCashOrder(created)) await tx.notificationIntent.create({data:{orderId:created.id,event:'NEW_ORDER',options:{}}});
        return { order: created, replay: false };
      },
      { maxWait: 15_000, timeout: 30_000 },
    );
    if (outcome.replay) return outcome;
    // The replaced orders are cancelled for good only now that the new order is committed (a failed checkout rolled them back).
    for (const r of replaced) {
      await auditCancel(r, 'SYSTEM', REPLACED_REASON);
      await finishChange(r, { awaitRefund: false });
    }
    // Unpaid: admins see it; the restaurant and riders do not (orderView filters them out anyway).
    drainNotificationIntents();
    await publishOrderChange(outcome.order, {newOrderAlert: isCashOrder(outcome.order)});
    return outcome;
  } catch (err: any) {
    if (err?.code === 'P2002') {
      // Two identical requests raced: the other one created the order.
      const again = await findReplay();
      if (again) {
        if (!sameRequest(again, input)) throw mismatch();
        return { order: again, replay: true };
      }
    }
    throw err;
  }
};

// ----------------------------------------------------------------------------
// Payments
// ----------------------------------------------------------------------------

/** Razorpay checkout params for the owner's unpaid order. One Razorpay order per Grozo order (reused on retry). */
export const createPaymentForOrder = async (orderId: string, actor: Actor) => {
  await preAuthorize(orderId, (o) => actor.role === 'STUDENT' && o.customerId === actor.id);
  const claimToken = randomUUID();
  const prepared = await withOrderLock(orderId, async (tx, order, group) => {
    if (actor.role !== 'STUDENT' || order.customerId !== actor.id) throw notFound();
    if (order.groupId && order.groupIndex !== 0) throw new OrderFlowError(409, 'PAY_VIA_GROUP', 'Pay with the first order of the combined order.', { payOrderId: group?.[0]?.id ?? null });
    if (isCashOrder(order)) throw new OrderFlowError(409, 'CASH_ORDER', 'Pay the assigned rider in cash at delivery.');
    if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') throw new OrderFlowError(409, 'ALREADY_PAID', 'This order is already paid.');
    if (order.status !== 'PLACED') throw new OrderFlowError(409, 'ORDER_CLOSED', 'This order can no longer be paid.');
    if (Date.now() - order.createdAt.getTime() >= paymentWindowMin() * 60_000) throw new OrderFlowError(409, 'PAYMENT_WINDOW_EXPIRED', 'The time to pay is over. Please refresh this order.');
    requirePaymentMethod('ONLINE');
    if(order.workflowVersion===2) {
      const address=await ownedAddress(tx,actor.id,order.addressId??undefined,true);
      await requireFulfillmentCapacity(tx,order.vendorId,address,{lock:true,paymentMethod:'ONLINE',excludeOrderId:order.id});
    }
    const payable = payableAmount(order), amountPaise = Math.round(payable * 100);
    if (!Number.isFinite(payable) || amountPaise < 100) throw new OrderFlowError(400, 'AMOUNT_TOO_SMALL', 'Payment amount must be at least ₹1.00.');
    const reusable = [...order.payments].reverse().find(p => ['PENDING', 'FAILED'].includes(p.status) && Math.round(p.amount * 100) === amountPaise);
    if (reusable) return { razorpayOrderId: reusable.razorpayOrderId, amountInPaise: amountPaise, reused: true };
    const intent = await tx.paymentCreation.findUnique({ where: { orderId } });
    if (intent && intent.state !== 'FAILED') return { intent, amountInPaise: amountPaise };
    await tx.paymentCreation.upsert({ where: { orderId }, create: { orderId, amountPaise, claimToken },
      update: { amountPaise, claimToken, state: 'CREATING', lastErrorCode: null } });
    return { claimToken, amountInPaise: amountPaise };
  });
  if ('razorpayOrderId' in prepared) return prepared;
  if ('intent' in prepared) {
    // A double tap waits without a database connection. It never starts a second provider order.
    for (let n = 0; n < 20; n++) {
      const intent = await prisma.paymentCreation.findUniqueOrThrow({ where: { orderId } });
      if (intent.providerOrderId && intent.state === 'CREATED') return { razorpayOrderId: intent.providerOrderId, amountInPaise: intent.amountPaise, reused: true };
      if (intent.state !== 'CREATING') break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new OrderFlowError(409, 'PAYMENT_START_PENDING', 'Payment setup is being checked. Reopen this order before starting another payment.', { pendingOrderId: orderId });
  }
  let providerOrderId: string;
  try {
    const result = await withProviderTimeout(getPaymentProvider().createOrder({ receipt: `rcpt_${orderId}`.slice(0, 40), amountPaise: prepared.amountInPaise, notes: { orderId, platform: 'Grozo' } }));
    providerOrderId = result.id;
  } catch (err) {
    const error = toProviderError(err);
    await prisma.paymentCreation.updateMany({ where: { orderId, claimToken, state: 'CREATING' }, data: { state: error.transient ? 'UNKNOWN' : 'FAILED', lastErrorCode: error.providerCode ?? 'PROVIDER_ERROR' } });
    throw new OrderFlowError(503, 'PROVIDER_UNAVAILABLE', 'Payment setup could not be confirmed. Check this order before retrying.');
  }
  // The provider call held no order lock or pooled database connection. Save even when cancellation won the race:
  // the payment is now traceable, and any later capture goes through the existing late-payment refund path.
  await prisma.$transaction(async tx => {
    await lockOrderInTx(tx, orderId);
    const saved = await tx.paymentCreation.updateMany({ where: { orderId, claimToken, state: 'CREATING' }, data: { state: 'CREATED', providerOrderId } });
    if (!saved.count) throw new OrderFlowError(409, 'PAYMENT_START_PENDING', 'Payment setup requires operator review.');
    await tx.payment.create({ data: { orderId, razorpayOrderId: providerOrderId, amount: prepared.amountInPaise / 100, status: 'PENDING', providerStatus: 'created' } });
  });
  return { razorpayOrderId: providerOrderId, amountInPaise: prepared.amountInPaise, reused: false };
};

export type PaidOutcome = 'PAID' | 'ALREADY_PAID' | 'LATE_PAYMENT_REFUND' | 'AMOUNT_MISMATCH' | 'DUPLICATE_PAYMENT' | 'UNKNOWN_PAYMENT' | 'ORDER_MISMATCH';

/**
 * THE only place an order becomes PAID. Called by POST /payments/verify-signature and the webhook.
 * Idempotent and race-safe: the order row lock serialises callers; only the caller that flips
 * PENDING/FAILED -> PAID does the side effects (new_order_alert, push, sockets).
 * - Amount in paise must equal Math.round(payableAmount(order) * 100) (the group total for a combined order); a mismatch is recorded, never marked paid.
 * - Docs/22: paying the primary child of a combined order flips the primary AND every sibling in the same transaction (group locked, children
 *   locked in id order); side effects (new_order_alert, push) run for every child, once, by the caller that flipped them.
 * - A payment for an order that is already CANCELLED is recorded and refunded; the order stays cancelled.
 * - A second, different captured payment for an already-paid (or already refunded) order is recorded, flagged, and refunded
 *   automatically by its own payment id (exactly once); the order and its original payment stay as they are.
 */
export const markOrderPaid = async (input: {
  razorpayOrderId?: string | null;
  razorpayPaymentId?: string | null;
  amountPaise?: number | null;
  orderIdHint?: string | null;
  source: 'VERIFY' | 'WEBHOOK' | 'RECONCILE';
  awaitRefund?: boolean;
}): Promise<{ outcome: PaidOutcome; order: OrderWithRelations | null }> => {
  const { razorpayOrderId, razorpayPaymentId, orderIdHint, source } = input;
  const payment = razorpayOrderId
    ? await prisma.payment.findUnique({ where: { razorpayOrderId } })
    : orderIdHint
      ? await prisma.payment.findFirst({ where: { orderId: orderIdHint }, orderBy: { createdAt: 'desc' } })
      : null;
  if (!payment) {
    await writeAudit('PAYMENT_UNKNOWN', 'PAYMENT', String(razorpayOrderId || orderIdHint || 'none').slice(0, 64), `${source}: captured payment ${razorpayPaymentId ?? '?'} does not match any Grozo payment`);
    return { outcome: 'UNKNOWN_PAYMENT', order: null };
  }
  if (orderIdHint && payment.orderId !== orderIdHint) {
    await writeAudit('PAYMENT_ORDER_MISMATCH', 'ORDER', payment.orderId, `${source}: payment ${razorpayPaymentId ?? '?'} names order ${String(orderIdHint).slice(0, 64)} but belongs to this order`);
    return { outcome: 'ORDER_MISMATCH', order: null };
  }

  const result = await withOrderLock(payment.orderId, async (tx, order, group): Promise<ChangeResult & { outcome: PaidOutcome; paidPaise: number; expectedPaise: number; extra?: ExtraRefundInput }> => {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    const expectedPaise = Math.round(payableAmount(order) * 100);
    const paidPaise = typeof input.amountPaise === 'number' && Number.isFinite(input.amountPaise) ? Math.round(input.amountPaise) : Math.round(p.amount * 100);
    const base = { order, before: order, changed: false, paidPaise, expectedPaise };
    const paymentId = razorpayPaymentId || p.razorpayPaymentId || null;

    if (p.status === 'PAID' || p.status === 'REFUNDED') {
      if (razorpayPaymentId && p.razorpayPaymentId && p.razorpayPaymentId !== razorpayPaymentId) {
        // Another payment id on a Razorpay order that is already paid: there is no row for it, refund it by its own id.
        const extra = typeof input.amountPaise === 'number' && Number.isFinite(input.amountPaise) ? { orderId: order.id, providerPaymentId: razorpayPaymentId, amountPaise: paidPaise, paymentRowId: null } : undefined;
        return { ...base, outcome: 'DUPLICATE_PAYMENT', extra };
      }
      return { ...base, outcome: 'ALREADY_PAID' };
    }
    if (paidPaise !== expectedPaise) {
      await tx.payment.update({ where: { id: p.id }, data: { capturedAmountPaise: paidPaise, razorpayPaymentId: paymentId } });
      return { ...base, outcome: 'AMOUNT_MISMATCH' };
    }
    if (order.paymentStatus === 'PAID' || order.paymentStatus === 'REFUNDED') {
      // Paid already through another Razorpay order: keep the evidence and refund this extra payment (below, after the commit).
      await tx.payment.update({ where: { id: p.id }, data: { capturedAmountPaise: paidPaise, razorpayPaymentId: paymentId } });
      const extra = paymentId ? { orderId: order.id, providerPaymentId: paymentId, amountPaise: paidPaise, paymentRowId: p.id } : undefined;
      return { ...base, outcome: 'DUPLICATE_PAYMENT', extra };
    }

    // A delayed capture must not revive checkout after its deadline, even when it wins
    // the lock before the maintenance worker. Cancellation and captured-money evidence
    // commit together; the existing refund worker then returns the payment exactly once.
    const expired = order.status === 'PLACED' && Date.now() - order.createdAt.getTime() >= paymentWindowMin() * 60_000;
    if (expired) await cancelInTx(tx, order, { id: 'system', role: 'SYSTEM' }, 'SYSTEM', 'Payment completed after checkout expired', {}, group);
    await tx.payment.update({ where: { id: p.id }, data: { status: 'PAID', razorpayPaymentId: paymentId, capturedAmountPaise: paidPaise } });
    if (group) {
      // Combined order: the whole group becomes paid (or, when it was cancelled before the money arrived, the whole group is marked paid
      // and ONLY the primary carries the refund: one payment, exactly one refund).
      const primary = group[0];
      const ids = group.map((c) => c.id);
      if (expired || group.some((c) => c.status === 'CANCELLED')) {
        await tx.order.updateMany({ where: { groupId: order.groupId!, paymentStatus: { in: ['PENDING', 'FAILED'] } }, data: { paymentStatus: 'PAID' } });
        await tx.order.update({ where: { id: primary.id }, data: { refundStatus: 'PENDING', refundError: null } });
        return { ...base, ...(await groupResult(tx, order, group, ids, { refundNeeded: true, refundOrderId: primary.id })), outcome: 'LATE_PAYMENT_REFUND' };
      }
      await tx.order.updateMany({ where: { groupId: order.groupId!, paymentStatus: { in: ['PENDING', 'FAILED'] } }, data: { paymentStatus: 'PAID', paidAt: new Date() } });
      return { ...base, ...(await groupResult(tx, order, group, ids, { newOrderAlert: true })), outcome: 'PAID' };
    }
    if (expired || order.status === 'CANCELLED') {
      // Customer gave up / order expired / restaurant rejected before the money arrived: refund it.
      // paidAt stays null so the restaurant never sees this order.
      await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', refundStatus: 'PENDING', refundError: null } });
      return { ...base, order: await reload(tx, order.id), changed: true, refundNeeded: true, outcome: 'LATE_PAYMENT_REFUND' };
    }
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'PAID', paidAt: new Date() } });
    return { ...base, order: await reload(tx, order.id), changed: true, newOrderAlert: true, outcome: 'PAID' };
  });

  const rupees = (paise: number) => `₹${(paise / 100).toFixed(2)}`;
  if (result.outcome === 'AMOUNT_MISMATCH') {
    await writeAudit('PAYMENT_AMOUNT_MISMATCH', 'ORDER', result.order.id, `${source}: payment ${razorpayPaymentId ?? '?'} captured ${rupees(result.paidPaise)} but the order total is ${rupees(result.expectedPaise)}. Not marked paid.`);
  } else if (result.outcome === 'DUPLICATE_PAYMENT') {
    await writeAudit('PAYMENT_DUPLICATE', 'ORDER', result.order.id, `${source}: second captured payment ${razorpayPaymentId ?? '?'} (${rupees(result.paidPaise)}) for an order that is already paid. ${result.extra ? 'Refunding it automatically.' : 'No payment id or amount to refund automatically: refund it in Razorpay.'}`);
  } else if (result.outcome === 'LATE_PAYMENT_REFUND') {
    await writeAudit('PAYMENT_AFTER_CANCEL', 'ORDER', result.order.id, `${source}: payment ${razorpayPaymentId ?? '?'} arrived after the order was cancelled; refunding automatically.`);
  }
  const order = await finishChange(result, { awaitRefund: input.awaitRefund ?? true });
  if (result.outcome === 'DUPLICATE_PAYMENT' && result.extra) {
    const extra = result.extra;
    if (input.awaitRefund ?? true) await refundExtraPayment(extra);
    else runInBackground(refundExtraPayment(extra));
  }
  return { outcome: result.outcome, order };
};

/** Webhook payment.failed: PENDING -> FAILED (the customer may retry; a later success still flips to PAID). */
export const markPaymentFailed = async (razorpayOrderId: string) => {
  const payment = await prisma.payment.findUnique({ where: { razorpayOrderId } });
  if (!payment) return false;
  const result = await withOrderLock(payment.orderId, async (tx, order): Promise<ChangeResult> => {
    const p = await tx.payment.findUniqueOrThrow({ where: { id: payment.id } });
    if (p.status === 'PENDING') await tx.payment.update({ where: { id: p.id }, data: { status: 'FAILED' } });
    if (order.paymentStatus !== 'PENDING') return { order, before: order, changed: false };
    await tx.order.update({ where: { id: order.id }, data: { paymentStatus: 'FAILED' } });
    return { order: await reload(tx, order.id), before: order, changed: true };
  });
  await finishChange(result);
  return result.changed;
};

// ----------------------------------------------------------------------------
// Status changes (vendor kitchen states, rider pickup/arrival, admin)
// ----------------------------------------------------------------------------
/**
 * Docs/22 for a child of a combined order:
 *  - a restaurant (or the admin acting for it) may start cooking (ACCEPTED -> PREPARING) only when EVERY restaurant of the group has accepted
 *    its part and none is cancelled (409 GROUP_WAITING), so nobody cooks while another restaurant may still reject;
 *  - PICKED_UP is per child as always;
 *  - ARRIVED_AT_GATE is a GROUP action: only when EVERY child is PICKED_UP (409 GROUP_NOT_PICKED_UP); it moves all children and writes ONE
 *    new OTP, identical on all of them. Nobody can move one child to ARRIVED_AT_GATE or DELIVERED on its own.
 */
export const GROUP_WAITING_MESSAGE = 'Waiting for the other store(s) in this combined order to accept.';

export const advanceStatus = async (orderId: string, actor: Actor, target: string, preparationEstimate?: unknown): Promise<{ order: OrderWithRelations; idempotent: boolean }> => {
  // Nothing below needs a lock to be refused: ownership first (404), then the role / target rules (403 / 400).
  if (actor.role === 'VENDOR') await preAuthorize(orderId, (o) => o.vendorUserId === actor.id);
  else if (actor.role === 'DRIVER') await preAuthorize(orderId, (o) => o.driverId === actor.id);
  const result = await withOrderLock(orderId, async (tx, order, group): Promise<ChangeResult> => {
    if (actor.role === 'VENDOR') {
      if (order.vendor.userId !== actor.id || !isVendorVisible(order)) throw notFound();
      if (!VENDOR_TARGETS.has(target)) throw new OrderFlowError(403, 'ROLE_NOT_ALLOWED', 'Stores can only move an order to ACCEPTED, PREPARING or READY_FOR_PICKUP.');
    } else if (actor.role === 'DRIVER') {
      if (order.driverId !== actor.id) throw notFound();
      if (!RIDER_TARGETS.has(target)) throw new OrderFlowError(403, 'ROLE_NOT_ALLOWED', 'Riders can only mark an order PICKED_UP or ARRIVED_AT_GATE (delivery needs the customer code).');
    } else if (actor.role === 'ADMIN') {
      if (!ADMIN_TARGETS.has(target)) throw new OrderFlowError(400, 'INVALID_STATUS', 'Use the cancel or delivery verification code endpoints for that.');
    } else {
      throw new OrderFlowError(403, 'ROLE_NOT_ALLOWED', 'You cannot change this order.');
    }

    if (order.status === target) return { order, before: order, changed: false }; // repeat = idempotent success
    if (isTerminal(order.status)) throw new OrderFlowError(409, 'ORDER_CLOSED', `This order is already ${order.status}.`);
    if (NEXT_STATUS[order.status] !== target) {
      throw new OrderFlowError(409, 'INVALID_TRANSITION', `Invalid order state transition from '${order.status}' to '${target}'. Allowed next state: ${NEXT_STATUS[order.status]}.`);
    }
    if (!fulfillmentAuthorized(order)) throw new OrderFlowError(409, 'PAYMENT_NOT_CONFIRMED', 'This order is not paid yet.');
    if((actor.role==='DRIVER'||order.workflowVersion===2) && (target==='PICKED_UP'||target==='ARRIVED_AT_GATE')) {
      const address=order.addressSnapshot as any;
      await requireRiderAt(tx,order,target==='PICKED_UP'?order.vendor:(address&&typeof address.lat==='number'&&typeof address.lng==='number'?address:null));
    }
    if (['READY_FOR_PICKUP','PICKED_UP'].includes(target) && await tx.orderAdjustment.count({where:{orderId:order.id,state:'PROPOSED'}})) throw new OrderFlowError(409,'CUSTOMER_DECISION_PENDING','Wait for the customer to review the proposed item changes before marking the order ready.');
    if (['READY_FOR_PICKUP','PICKED_UP','ARRIVED_AT_GATE'].includes(target)) await ensureOrderStockSafe(tx,(group??[order]).map(o=>o.id));
    if (target === 'PICKED_UP' && !order.driverId) throw new OrderFlowError(409, 'NO_RIDER', 'Assign a rider before marking the order picked up.');

    if (group) {
      if (target === 'PREPARING' && !groupAllAccepted(group)) {
        throw new OrderFlowError(409, 'GROUP_WAITING', GROUP_WAITING_MESSAGE);
      }
      if (target === 'ARRIVED_AT_GATE') {
        if (!group.every((c) => c.status === 'PICKED_UP')) {
          throw new OrderFlowError(409, 'GROUP_NOT_PICKED_UP', 'Pick up the products from every store of this combined order before arriving at the doorstep.');
        }
        if (!group.every((c) => c.paymentStatus === 'PAID')) throw new OrderFlowError(409, 'PAYMENT_NOT_CONFIRMED', 'This order is not paid yet.');
        // ONE code for the whole group, the same on every child.
        await tx.order.updateMany({ where: { groupId: order.groupId! }, data: { status: 'ARRIVED_AT_GATE', otpCode: secureOtp(), otpExpiresAt:new Date(Date.now()+10*60000), otpAttempts: 0, otpLocked: false } });
        return groupResult(tx, order, group, group.map((c) => c.id));
      }
      const gnow = new Date();
      await tx.order.update({ where: { id: order.id }, data: { status: target as any, ...preparationTransitionData(order,target,gnow,preparationEstimate), ...(target === 'ACCEPTED' ? { acceptedAt: gnow } : {}), ...(target === 'PICKED_UP' ? { pickedUpAt: gnow } : {}) } });
      return groupResult(tx, order, group, [order.id]);
    }

    const now = new Date();
    const data: Prisma.OrderUpdateInput = { status: target as any, ...preparationTransitionData(order,target,new Date(),preparationEstimate) };
    if (target === 'ACCEPTED') data.acceptedAt = now;
    if (target === 'PICKED_UP') data.pickedUpAt = now;
    if (target === 'ARRIVED_AT_GATE') Object.assign(data, { otpCode: secureOtp(), otpExpiresAt:new Date(Date.now()+10*60000), otpAttempts: 0, otpLocked: false });
    await tx.order.update({ where: { id: order.id }, data });
    return { order: await reload(tx, order.id), before: order, changed: true };
  });

  // Legacy log line (event name + order id only, no data): test/e2e/hardening.test.ts still asserts it. The customer push itself
  // is RIDER_AT_GATE (push/events.ts) and never carries the code.
  if (result.changed && target === 'ARRIVED_AT_GATE') console.log(`🔔 [push] RUNNER_ARRIVED for order ${result.order.id}`);
  return { order: await finishChange(result), idempotent: !result.changed };
};

// ----------------------------------------------------------------------------
// Cancellation (customer, restaurant reject, admin, system job)
// ----------------------------------------------------------------------------
/**
 * What a cascaded sibling of a cancelled combined order says as its cancel reason. FIXED text: the reason typed by the rejecting
 * restaurant or the admin stays on the triggering child only (other restaurants and their staff must not read it); the customer reads
 * the real reason on the triggering child, in the group view (`cancelReason`) and in the cancel push.
 */
export const GROUP_CANCEL_REASON_PREFIX = 'Another restaurant in your order could not take it';
export const groupSiblingReason = (_reason?: string) => GROUP_CANCEL_REASON_PREFIX;

type CancelGuard = (o: OrderWithRelations, group: OrderWithRelations[] | null) => boolean;

/**
 * The cancel decision and write, for an order whose row (and whole group, if any) is already locked (shared by cancelOrder and the
 * checkout "replace" steps).
 *
 * Docs/22 section 4.4: a cancel of ANY child of a combined order cancels the WHOLE group in this one transaction (every child that is not
 * terminal yet). The child that triggered it keeps the real `cancelledBy` and reason; the siblings get cancelledBy SYSTEM and
 * `Another restaurant in your order could not take it: <reason>`. A refund is needed iff the group is paid, and only the PRIMARY child gets
 * refundStatus PENDING (one payment, one refund, siblings never carry it). Rules per actor are the single-order rules applied to the group;
 * a customer may cancel only while EVERY child is PLACED. Repeating a cancel of a cancelled group is a no-op success.
 */
export const cancelInTx = async (
  tx: Tx,
  order: OrderWithRelations,
  actor: Actor,
  by: CancelledBy,
  reason: string,
  opts: { guard?: CancelGuard },
  group: OrderWithRelations[] | null = null,
): Promise<ChangeResult & { skipped?: boolean }> => {
  // A group is only "already cancelled" when EVERY child is terminal. If the named child is cancelled but others are still active (a partial
  // group, e.g. after a manual database edit), the cancel finishes the job: it cancels the rest and starts the refund if one is missing.
  const alreadyCancelled = order.status === 'CANCELLED' && (!group || group.every((c) => isTerminal(c.status)));
  const repair = order.status === 'CANCELLED' && !alreadyCancelled;
  if (by === 'CUSTOMER') {
    if (actor.role !== 'STUDENT' || order.customerId !== actor.id) throw notFound();
    if (alreadyCancelled) return { order, before: order, changed: false };
    if (!repair && (order.status !== 'PLACED' || (group && group.some((c) => c.status !== 'PLACED' && c.status !== 'CANCELLED')))) {
      throw new OrderFlowError(409, 'CANNOT_CANCEL', 'The store has already accepted this order, so it can no longer be cancelled in the app. Please contact Grozo support.');
    }
  } else if (by === 'VENDOR') {
    if (order.vendor.userId !== actor.id || !isVendorVisible(order)) throw notFound();
    if (alreadyCancelled) return { order, before: order, changed: false };
    if (!repair) {
      if (order.status !== 'PLACED') throw new OrderFlowError(409, 'CANNOT_REJECT', 'An accepted order cannot be rejected. Ask Grozo support to cancel it.');
      if (!fulfillmentAuthorized(order)) throw new OrderFlowError(409, 'PAYMENT_NOT_CONFIRMED', 'This order is not paid yet.');
    }
  } else if (by === 'ADMIN') {
    if (alreadyCancelled) return { order, before: order, changed: false };
    if (!repair && (order.status === 'DELIVERED' || (group && group.some((c) => c.status === 'DELIVERED')))) throw new OrderFlowError(409, 'ORDER_CLOSED', 'A delivered order cannot be cancelled.');
  } else {
    // SYSTEM (maintenance job, checkout replacing an abandoned order): re-check the condition under the lock; anything else changed it first.
    if (isTerminal(order.status) || (opts.guard && !opts.guard(order, group))) {
      return { order, before: order, changed: false, skipped: true };
    }
  }

  await settleStock(tx, group ?? [order], 'CANCEL');

  if (group) {
    const primary = group[0];
    const paid = primary.paymentStatus === 'PAID';
    const now = new Date();
    const touched: string[] = [];
    for (const c of group) {
      if (isTerminal(c.status)) continue;
      const mine = c.id === order.id;
      await tx.order.update({
        where: { id: c.id },
        data: {
          status: 'CANCELLED',
          cancelledAt: now,
          cancelledBy: mine ? by : 'SYSTEM',
          cancelReason: mine ? reason.slice(0, 200) : groupSiblingReason(reason),
          otpCode: null,
          ...(paid && c.id === primary.id ? { refundStatus: 'PENDING', refundError: null } : {}),
        },
      });
      touched.push(c.id);
    }
    // A partial group whose primary was cancelled earlier without a refund (paid, nothing booked): start the refund now, once.
    if (paid && primary.status === 'CANCELLED' && !primary.refundStatus) {
      await tx.order.update({ where: { id: primary.id }, data: { refundStatus: 'PENDING', refundError: null } });
      touched.push(primary.id);
    }
    return groupResult(tx, order, group, touched, { refundNeeded: paid && touched.includes(primary.id), refundOrderId: primary.id });
  }

  const paid = order.paymentStatus === 'PAID';
  await tx.order.update({
    where: { id: order.id },
    data: {
      status: 'CANCELLED',
      cancelledAt: new Date(),
      cancelledBy: by,
      cancelReason: reason.slice(0, 200),
      otpCode: null,
      ...(paid ? { refundStatus: 'PENDING', refundError: null } : {}),
    },
  });
  return { order: await reload(tx, order.id), before: order, changed: true, refundNeeded: paid };
};

/** Audit rows of a cancel that changed something (after the commit): the per-order row as always, plus one ORDER_GROUP_CANCELLED for a combined order. */
export const auditCancel = async (r: ChangeResult, by: CancelledBy, reason: string) => {
  const line = (before: OrderWithRelations) => `${by} cancelled the order (${before.status}, payment ${before.paymentStatus})${reason ? `: ${reason}` : ''}`;
  if (!r.group) {
    if (by !== 'CUSTOMER') await writeAudit('ORDER_CANCELLED', 'ORDER', r.order.id, line(r.before));
    return;
  }
  const g = r.group;
  const groupId = r.order.groupId!;
  await writeAudit('ORDER_GROUP_CANCELLED', 'ORDER_GROUP', groupId, `${by} cancelled the combined order: ${g.touched.length} of ${g.after.length} orders cancelled (payment ${g.before[0].paymentStatus})${reason ? `: ${reason}` : ''}`);
  if (by !== 'CUSTOMER') {
    for (const id of g.touched) {
      const b = g.before.find((c) => c.id === id)!;
      await writeAudit('ORDER_CANCELLED', 'ORDER', id, id === r.order.id ? line(b) : `${by} cancelled the combined order, so this order (${b.status}, payment ${b.paymentStatus}) was cancelled with it${reason ? `: ${reason}` : ''}`);
    }
  }
};

export const cancelOrder = async (
  orderId: string,
  actor: Actor,
  by: CancelledBy,
  reason: string,
  opts: { guard?: CancelGuard; awaitRefund?: boolean; deferRefund?: boolean } = {},
): Promise<{ order: OrderWithRelations; idempotent: boolean; /** Orders cancelled by this call (1 for a single order, the whole group for a combined one). */ cancelledOrders: number; /** Set when a refund is needed: the order that carries it (the primary child of a group). */ refundOrderId: string | null } | null> => {
  if (by === 'CUSTOMER') await preAuthorize(orderId, (o) => actor.role === 'STUDENT' && o.customerId === actor.id);
  else if (by === 'VENDOR') await preAuthorize(orderId, (o) => o.vendorUserId === actor.id);
  const result = await withOrderLock(orderId, (tx, order, group) => cancelInTx(tx, order, actor, by, reason, opts, group));
  if (result.skipped) return null;

  if (result.changed) await auditCancel(result, by, reason);
  const order = await finishChange(result, { awaitRefund: opts.awaitRefund ?? true, deferRefund: opts.deferRefund });
  return {
    order,
    idempotent: !result.changed,
    cancelledOrders: result.changed ? (result.group ? result.group.touched.length : 1) : 0,
    refundOrderId: result.refundNeeded ? result.refundOrderId ?? result.order.id : null,
  };
};

// ----------------------------------------------------------------------------
// Riders: claim from the pool, give back before pickup
// ----------------------------------------------------------------------------
/**
 * Deliveries the rider is carrying: a combined order counts as ONE (Docs/22: DISTINCT COALESCE(groupId, id)).
 * `exceptKey` leaves one delivery out (the group an admin is moving to this rider).
 */
export const countActiveDeliveries = async (tx: Tx, riderUserId: string, exceptKey?: string): Promise<number> => {
  const rows = await tx.$queryRaw<{ n: number }[]>`
    SELECT COUNT(DISTINCT COALESCE("groupId", "id"))::int AS n FROM "Order"
    WHERE "driverId" = ${riderUserId} AND "status"::text IN ('ACCEPTED', 'PREPARING', 'READY_FOR_PICKUP', 'PICKED_UP', 'ARRIVED_AT_GATE')
    ${exceptKey ? Prisma.sql`AND COALESCE("groupId", "id") <> ${exceptKey}` : Prisma.empty}`;
  return rows[0]?.n ?? 0;
};

/**
 * Atomic claim. Docs/22: naming ANY child of a combined order claims ALL its children, all or nothing (group locked, then every child),
 * and the combined order counts as one active delivery for MAX_ACTIVE_ORDERS_PER_RIDER.
 */
export const claimOrder = async (orderId: string, riderUserId: string): Promise<{ order: OrderWithRelations; idempotent: boolean }> => {
  const outcome = await prisma.$transaction(
    async (tx): Promise<{ changed: boolean; groupId?: string | null; before?: OrderWithRelations[] }> => {
      // Lock the rider first: their claims run one at a time, so MAX_ACTIVE_ORDERS_PER_RIDER holds.
      const riders = await tx.$queryRaw<{ dutyStatus: string; approvalStatus: string }[]>`
        SELECT "dutyStatus"::text AS "dutyStatus", "approvalStatus"::text AS "approvalStatus" FROM "DriverPartner" WHERE "userId" = ${riderUserId} FOR UPDATE`;
      const rider = riders[0];
      if (!rider) throw new OrderFlowError(403, 'RIDER_PROFILE_MISSING', 'No rider profile is linked to this account.');
      if (rider.approvalStatus !== 'APPROVED') throw new OrderFlowError(403, 'PARTNER_NOT_APPROVED', 'Your account is not active.', { approvalStatus: rider.approvalStatus });

      let current = await tx.order.findUnique({ where: { id: orderId }, select: { driverId: true, status: true, paymentStatus: true, paymentMethod: true, workflowVersion: true, groupId: true } });
      if (!current) throw notFound();

      if (current.groupId) {
        // rider -> group -> children (ascending): the same order as every other group transaction.
        await lockGroupRows(tx, current.groupId);
        const children = await loadGroupChildren(tx, current.groupId);
        if (children.some((c) => isTerminal(c.status))) throw new OrderFlowError(409, 'ORDER_NOT_AVAILABLE', 'This order is not available for pickup.');
        if (children.every((c) => c.driverId === riderUserId)) return { changed: false, groupId: current.groupId };
        if (rider.dutyStatus === 'OFFLINE') throw new OrderFlowError(409, 'RIDER_OFFLINE', 'Go on duty to accept orders.');
        const active = await countActiveDeliveries(tx, riderUserId);
        if (active >= MAX_ACTIVE_ORDERS_PER_RIDER) throw new OrderFlowError(409, 'RIDER_BUSY', 'Finish your current delivery before accepting another order.');
        if (children.some((c) => c.driverId && c.driverId !== riderUserId)) throw new OrderFlowError(409, 'ALREADY_TAKEN', 'Another rider has already taken this order.');
        if (!children.every((c) => c.paymentStatus === 'PAID' && (POOL_STATUSES as readonly string[]).includes(c.status))) {
          throw new OrderFlowError(409, 'ORDER_NOT_AVAILABLE', 'This order is not available for pickup.');
        }
        await acceptDispatchOffer(tx, children, riderUserId);
        // All-or-nothing: every child is claimable and we hold every lock, so this updates exactly the children; anything else rolls back.
        const claimed = await tx.order.updateMany({ where: { groupId: current.groupId, driverId: null, paymentStatus: 'PAID', status: { in: [...POOL_STATUSES] } }, data: { pickupArrivalAt:null, driverId: riderUserId } });
        if (claimed.count !== children.length) throw new OrderFlowError(409, 'ORDER_NOT_AVAILABLE', 'This order is not available for pickup.');
        const after=await loadGroupChildren(tx,current.groupId);
        await stageNotificationIntents(tx,{changed:true,before:children[0],order:after[0],group:{before:children,after,touched:after.map((c)=>c.id)}});
        return { changed: true, groupId: current.groupId, before: children };
      }

      // Match maintenance lock order: rider -> order -> offer. Locking the offer
      // first deadlocked against expiry, which already held the order row.
      await tx.$queryRaw`SELECT "id" FROM "Order" WHERE "id"=${orderId} FOR UPDATE`;
      current = await tx.order.findUniqueOrThrow({where:{id:orderId},select:{driverId:true,status:true,paymentStatus:true,paymentMethod:true,workflowVersion:true,groupId:true}});
      // A cancelled / delivered order is not in the pool, whoever used to carry it (it keeps its driverId for the record).
      if (isTerminal(current.status)) throw new OrderFlowError(409, 'ORDER_NOT_AVAILABLE', 'This order is not available for pickup.');
      if (current.driverId === riderUserId) return { changed: false };
      if (current.driverId) throw new OrderFlowError(409,'ALREADY_TAKEN','Another rider has already taken this order.');
      if (rider.dutyStatus === 'OFFLINE') throw new OrderFlowError(409, 'RIDER_OFFLINE', 'Go on duty to accept orders.');

      const active = await countActiveDeliveries(tx, riderUserId);
      if (active >= MAX_ACTIVE_ORDERS_PER_RIDER) throw new OrderFlowError(409, 'RIDER_BUSY', 'Finish your current delivery before accepting another order.');

      if(!fulfillmentAuthorized(current)||!(POOL_STATUSES as readonly string[]).includes(current.status)) throw new OrderFlowError(409,'ORDER_NOT_AVAILABLE','This order is not available for pickup.');
      await acceptDispatchOffer(tx, [await tx.order.findUniqueOrThrow({where:{id:orderId},include:ORDER_VIEW_INCLUDE})], riderUserId);
      // The atomic claim: only succeeds while the order is still unassigned, paid and in a pool state.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, driverId: null, AND: [fulfillmentWhere], status: { in: [...POOL_STATUSES] } },
        data: { pickupArrivalAt:null, driverId: riderUserId },
      });
      if (claimed.count === 1) {const after=await tx.order.findUniqueOrThrow({where:{id:orderId},include:ORDER_VIEW_INCLUDE});await stageNotificationIntents(tx,{changed:true,before:{...after,driverId:null,driver:null},order:after});return {changed:true};}
      const now = await tx.order.findUnique({ where: { id: orderId }, select: { driverId: true, status: true } });
      if (now && isTerminal(now.status)) throw new OrderFlowError(409, 'ORDER_NOT_AVAILABLE', 'This order is not available for pickup.');
      if (now?.driverId && now.driverId !== riderUserId) throw new OrderFlowError(409, 'ALREADY_TAKEN', 'Another rider has already taken this order.');
      // Unpaid, cancelled, not accepted yet, already delivered: one code for "not in the pool".
      throw new OrderFlowError(409, 'ORDER_NOT_AVAILABLE', 'This order is not available for pickup.');
    },
    { maxWait: 15_000, timeout: 30_000 },
  );

  const order = (await loadOrder(orderId))!;
  if (!outcome.changed) return { order, idempotent: true };
  if (outcome.groupId && outcome.before) {
    const after = await loadGroupChildren(prisma, outcome.groupId);
    const trigger = after.find((c) => c.id === orderId)!;
    const before = outcome.before.find((c) => c.id === orderId)!;
    return { order: await finishChange({ order: trigger, before, changed: true, group: { before: outcome.before, after, touched: after.map((c) => c.id) } }), idempotent: false };
  }
  const before = { ...order, driverId: null, driver: null } as OrderWithRelations;
  return { order: await finishChange({ order, before, changed: true }), idempotent: false };
};

export const releaseOrder = async (orderId: string, riderUserId: string) => {
  await preAuthorize(orderId, (o) => o.driverId === riderUserId);
  const result = await withOrderLock(orderId, async (tx, order, group): Promise<ChangeResult> => {
    if (order.driverId !== riderUserId) throw notFound();
    // Docs/22: a combined order is released as a whole, and only while NO child has been picked up.
    if (!(group ?? [order]).every((c) => (POOL_STATUSES as readonly string[]).includes(c.status))) {
      throw new OrderFlowError(409, 'CANNOT_RELEASE', 'You can only give an order back before pickup. Contact Grozo support.');
    }
    if (group) {
      await tx.order.updateMany({ where: { groupId: order.groupId! }, data: { pickupArrivalAt:null, driverId: null } });
      return groupResult(tx, order, group, group.map((c) => c.id));
    }
    await tx.order.update({ where: { id: order.id }, data: { pickupArrivalAt:null, driverId: null,...(order.workflowVersion===2?{dispatchRound:(Math.floor(order.dispatchRound/3)+1)*3,dispatchNextAttemptAt:null,dispatchEscalatedAt:null,dispatchNote:null}:{}) } });
    return { order: await reload(tx, order.id), before: order, changed: true };
  });
  await writeAudit('ORDER_RELEASED', 'ORDER', result.group ? result.group.after[0].id : orderId, `Rider ${result.before.driver?.name ?? riderUserId} gave the ${result.group ? `combined order (${result.group.after.length} stores)` : 'order'} back to the pool (${result.before.status}).`);
  return finishChange(result);
};

/**
 * Admin assigns, moves or removes the rider (PATCH /orders/:id/reassign).
 * - a rider never gets a second active delivery (409 RIDER_BUSY, no override); a combined order is ONE delivery and the group being
 *   moved is not counted against the target rider;
 * - an OFFLINE rider is refused (409 RIDER_OFFLINE) unless the admin sends `force: true`;
 * - once the food is picked up (PICKED_UP, ARRIVED_AT_GATE) the order cannot be left without a rider (409 CANNOT_UNASSIGN; for a combined order: once ANY child is picked up).
 * Docs/22: the whole group moves together.
 */
export const reassignOrder = async (orderId: string, driverIdOrProfileId: string | null, opts: { force?: boolean } = {}) => {
  let resolved: string | null = null;
  if (driverIdOrProfileId) {
    const driver = await prisma.driverPartner.findFirst({ where: { OR: [{ id: driverIdOrProfileId }, { userId: driverIdOrProfileId }] } });
    if (!driver?.userId) throw new OrderFlowError(400, 'RIDER_NOT_FOUND', 'Selected delivery partner is not linked to an active user account.');
    if (driver.approvalStatus !== 'APPROVED') throw new OrderFlowError(400, 'RIDER_NOT_APPROVED', 'Only an approved rider can be assigned to an order.');
    resolved = driver.userId;
  }
  const result = await withOrderLock(orderId, async (tx, order, group): Promise<ChangeResult> => {
    const all = group ?? [order];
    if (isTerminal(order.status)) throw new OrderFlowError(409, 'ORDER_CLOSED', 'Completed or cancelled orders cannot be reassigned.');
    if (resolved && all.some((c) => !fulfillmentAuthorized(c))) throw new OrderFlowError(409, 'PAYMENT_NOT_CONFIRMED', 'An unpaid order cannot be given to a rider.');
    if (all.every((c) => c.driverId === resolved)) return { order, before: order, changed: false };
    if (!resolved && all.some((c) => c.status === 'PICKED_UP' || c.status === 'ARRIVED_AT_GATE')) {
      throw new OrderFlowError(409, 'CANNOT_UNASSIGN', 'The order is already with the rider. Assign another rider or cancel the order instead of removing the rider.');
    }
    if (resolved) {
      const rider = await tx.driverPartner.findUnique({ where: { userId: resolved }, include: {serviceZone:{include:{city:true}}} });
      if (!rider || rider.approvalStatus !== 'APPROVED') throw new OrderFlowError(400, 'RIDER_NOT_APPROVED', 'Only an approved rider can be assigned to an order.');
      if(!riderServesOrders(rider,all)) throw new OrderFlowError(409,'SERVICE_AREA_REQUIRED','Choose a rider whose configured area covers every pickup and the delivery address.');
      const active = await countActiveDeliveries(tx, resolved, order.groupId ?? order.id);
      if (active >= MAX_ACTIVE_ORDERS_PER_RIDER) throw new OrderFlowError(409, 'RIDER_BUSY', 'That rider already has an active order. Finish or move it first.');
      if (rider.dutyStatus === 'OFFLINE' && opts.force !== true) {
        throw new OrderFlowError(409, 'RIDER_OFFLINE', 'That rider is offline. Send force: true to assign them anyway.');
      }
    }
    await tx.dispatchOffer.updateMany({where:{orderId:all[0].id,state:'PENDING'},data:{state:'REVOKED',reason:'Admin reassignment'}});
    if(resolved) {
      const rider=await tx.driverPartner.findUniqueOrThrow({where:{userId:resolved}});
      await tx.dispatchOffer.updateMany({where:{driverId:rider.id,state:'PENDING'},data:{state:'REVOKED',reason:'Admin assigned another delivery'}});
      const primary=await tx.order.update({where:{id:all[0].id},data:{dispatchRound:{increment:1},dispatchNote:null,dispatchEscalatedAt:null,dispatchNextAttemptAt:null}});
      await tx.dispatchOffer.create({data:{orderId:primary.id,driverId:rider.id,round:primary.dispatchRound,state:'ACCEPTED',manual:true,expiresAt:new Date(),reason:'Assigned by admin'}});
    }

    if (group) {
      await tx.order.updateMany({ where: { groupId: order.groupId!, status: { notIn: ['DELIVERED', 'CANCELLED'] } }, data: { pickupArrivalAt:null, driverId: resolved } });
      return groupResult(tx, order, group, group.filter((c) => !isTerminal(c.status)).map((c) => c.id));
    }
    await tx.order.update({ where: { id: order.id }, data: { pickupArrivalAt:null, driverId: resolved,...(!resolved&&order.workflowVersion===2?{dispatchRound:(Math.floor(order.dispatchRound/3)+1)*3,dispatchNextAttemptAt:null,dispatchEscalatedAt:null,dispatchNote:null}:{}) } });
    return { order: await reload(tx, order.id), before: order, changed: true };
  }, resolved ? { riderUserIdFirst: resolved, assignedByAdmin:true } : {assignedByAdmin:true});
  if (result.changed) {
    await writeAudit('ORDER_REASSIGNED', 'ORDER', orderId, `Rider changed from ${result.before.driver?.name ?? 'none'} to ${result.order.driver?.name ?? 'none'} (${result.order.status}).${opts.force && result.order.driverId ? ' Forced by admin.' : ''}${result.group ? ` Whole combined order (${result.group.after.length} stores) moved.${result.order.driverId ? ' Warning: the rider needs the latest app.' : ''}` : ''}`);
  }
  return finishChange(result, { awaitRefund: true, assignedByAdmin: true });
};

// ----------------------------------------------------------------------------
// Delivery verification code (section 4)
// ----------------------------------------------------------------------------
/** Normalises what the app sent: "0421", 421 (number) -> "0421"; anything else -> null. */
export const normaliseOtp = (raw: unknown): string | null => {
  if (typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 && raw <= 9999) return String(raw).padStart(4, '0');
  if (typeof raw === 'string' && /^\d{4}$/.test(raw.trim())) return raw.trim();
  return null;
};

const sameOtp = (given: string, stored: string | null) => {
  if (!stored || !/^\d{4}$/.test(stored)) return false;
  return timingSafeEqual(Buffer.from(given, 'utf8'), Buffer.from(stored, 'utf8'));
};

// Delivered orders keep only an HMAC of (order id, code): enough to recognise the rider's retry of the SAME code,
// useless for anything else. The plain code is gone (otpCode = 'USED').
const proofKey = () => {
  if (process.env.DELIVERY_PROOF_SECRET) return process.env.DELIVERY_PROOF_SECRET;
  // Preserve legacy delivery receipts during transition. Clerk mode requires an independent key.
  if (process.env.AUTH_MODE && process.env.AUTH_MODE !== 'legacy') throw new Error('DELIVERY_PROOF_SECRET is required in Clerk mode.');
  return process.env.JWT_SECRET || (process.env.NODE_ENV === 'test' ? 'kraveo_vit_bhopal_super_secret_jwt_key_2026' : 'kraveo-otp-proof');
};
const otpProof = (orderId: string, otp: string) => createHmac('sha256', proofKey()).update(`${orderId}:${otp}`).digest('hex');
const proofMatches = (orderId: string, otp: string, stored: string | null) => {
  if (!stored) return false;
  const a = Buffer.from(otpProof(orderId, otp));
  const b = Buffer.from(stored);
  return a.length === b.length && timingSafeEqual(a, b);
};

/**
 * Delivery verification code. Docs/22: for a combined order ONE code covers the group: a correct code delivers ALL children atomically (each gets
 * deliveredAt, otpCode 'USED' and its own otpProof), wrong attempts and the 5-attempt lock are counted for the whole group (counter and
 * lock written on every child, so resetting the lock on any child resets the group). The retry of the same correct code after delivery
 * is an idempotent success on any child.
 */
export const verifyGateOtp = async (orderId: string, actor: Actor, rawOtp: unknown, cashCollected = false): Promise<{ order: OrderWithRelations; alreadyDelivered: boolean }> => {
  type Outcome = ChangeResult & { kind: 'DELIVERED' | 'ALREADY' | 'WRONG'; attempts?: number; locked?: boolean };
  if (actor.role === 'DRIVER') await preAuthorize(orderId, (o) => o.driverId === actor.id);
  else if (actor.role !== 'ADMIN') throw notFound();
  const result = await withOrderLock(orderId, async (tx, order, group): Promise<Outcome> => {
    if (actor.role === 'DRIVER' && order.driverId !== actor.id) throw notFound();
    if (actor.role !== 'DRIVER' && actor.role !== 'ADMIN') throw notFound();
    if (order.status === 'DELIVERED') {
      // Idempotent only for the retry of the SAME correct code (lost response) or for an admin. A wrong or missing
      // code on a delivered order is never answered with a success; it does not count as an attempt either.
      if (actor.role === 'ADMIN') return { order, before: order, changed: false, kind: 'ALREADY' };
      const given = normaliseOtp(rawOtp);
      if (given && proofMatches(order.id, given, order.otpProof)) return { order, before: order, changed: false, kind: 'ALREADY' };
      throw new OrderFlowError(409, 'ALREADY_DELIVERED', 'This order has already been delivered.');
    }
    if(order.otpExpiresAt && order.otpExpiresAt<=new Date()) throw new OrderFlowError(410,'OTP_EXPIRED','This delivery code expired. Ask operations to issue a new code.');
    if (order.otpLocked) throw new OrderFlowError(423, 'OTP_LOCKED', 'Too many wrong codes. Grozo support has to unlock this delivery.');
    if (order.status !== 'ARRIVED_AT_GATE' || (group && !group.every((c) => c.status === 'ARRIVED_AT_GATE'))) {
      throw new OrderFlowError(409, 'NOT_AT_GATE', 'Delivery code can only be verified after the delivery partner arrives at the doorstep.');
    }
    if (!fulfillmentAuthorized(order) || (group && group.some((c) => c.paymentStatus !== 'PAID'))) throw new OrderFlowError(409, 'PAYMENT_NOT_CONFIRMED', 'This order is not paid.');

    if(actor.role==='DRIVER') {const address=order.addressSnapshot as any;await requireRiderAt(tx,order,address&&typeof address.lat==='number'&&typeof address.lng==='number'?address:null);}
    const otp = normaliseOtp(rawOtp);
    if (!otp) {
      // A missing or malformed code is a client mistake, not a guess: it does not count as an attempt.
      throw new OrderFlowError(400, 'OTP_INVALID', 'Enter the valid 4-digit delivery code.', { error: 'Invalid Gate OTP', attemptsLeft: OTP_MAX_ATTEMPTS - order.otpAttempts });
    }
    if (!sameOtp(otp, order.otpCode)) {
      const attempts = order.otpAttempts + 1;
      const locked = attempts >= OTP_MAX_ATTEMPTS;
      if (group) {
        // Committed (the attempt counts even though the caller gets an error); counter and lock are mirrored on every child.
        await tx.order.updateMany({ where: { groupId: order.groupId! }, data: { otpAttempts: attempts, otpLocked: locked } });
        return { ...(await groupResult(tx, order, group, group.map((c) => c.id))), changed: locked, kind: 'WRONG', attempts, locked };
      }
      await tx.order.update({ where: { id: order.id }, data: { otpAttempts: attempts, otpLocked: locked } });
      // Committed (the attempt counts even though the caller gets an error).
      return { order: await reload(tx, order.id), before: order, changed: locked, kind: 'WRONG', attempts, locked };
    }
    if (isCashOrder(order)) {
      if (actor.role !== 'DRIVER' || order.driverId !== actor.id || cashCollected !== true) throw new OrderFlowError(409,'CASH_CONFIRMATION_REQUIRED','Collect the exact order total in cash and confirm collection before completing delivery.');
      await tx.cashCollection.create({data:{orderId:order.id,driverUserId:actor.id,amountPaise:Math.round(order.totalAmount*100)}});
      await tx.order.update({where:{id:order.id},data:{paymentStatus:'PAID',paidAt:new Date()}});
      await tx.adminAuditLog.create({data:{action:'CASH_COLLECTED',targetType:'ORDER',targetId:order.id,summary:`Assigned rider ${actor.id} confirmed cash collection with a valid delivery code.`}});
    }
    await settleStock(tx, group ?? [order], 'DELIVER');
    if (group) {
      const deliveredAt = new Date(); // one instant for the whole delivery (finance counts a delivery on one day)
      for (const c of group) await tx.order.update({ where: { id: c.id }, data: { status: 'DELIVERED', deliveredAt, otpCode: 'USED', otpProof: otpProof(c.id, otp) } });
      return { ...(await groupResult(tx, order, group, group.map((c) => c.id))), kind: 'DELIVERED' };
    }
    await tx.order.update({ where: { id: order.id }, data: { status: 'DELIVERED', deliveredAt: new Date(), otpCode: 'USED', otpProof: otpProof(order.id, otp) } });
    return { order: await reload(tx, order.id), before: order, changed: true, kind: 'DELIVERED' };
  });

  if (result.kind === 'WRONG') {
    if (result.locked) {
      await writeAudit('OTP_LOCKED', 'ORDER', orderId, `Delivery code locked after ${result.attempts} wrong attempts (last by ${actor.role} ${actor.id}).${result.group ? ` Combined order of ${result.group.after.length} stores.` : ''}`);
      await finishChange(result); // admins see otpLocked at once
      throw new OrderFlowError(423, 'OTP_LOCKED', 'Too many wrong codes. Grozo support has to unlock this delivery.');
    }
    throw new OrderFlowError(400, 'OTP_INVALID', 'Enter the valid 4-digit delivery code.', {
      error: 'Invalid Gate OTP',
      attemptsLeft: OTP_MAX_ATTEMPTS - (result.attempts ?? 0),
    });
  }
  return { order: await finishChange(result), alreadyDelivered: result.kind === 'ALREADY' };
};

/** Admin: unlock after 5 wrong codes. A fresh code is issued (the old one may be partly guessed). For a combined order: one new code on every child. */
export const resetOtpLock = async (orderId: string) => {
  const result = await withOrderLock(orderId, async (tx, order, group): Promise<ChangeResult> => {
    if (order.status !== 'ARRIVED_AT_GATE') throw new OrderFlowError(409, 'NOT_AT_GATE', 'Only an order waiting at the doorstep has a delivery code.');
    if (group) {
      await tx.order.updateMany({ where: { groupId: order.groupId!, status: 'ARRIVED_AT_GATE' }, data: { otpLocked: false, otpAttempts: 0, otpCode: secureOtp(), otpExpiresAt:new Date(Date.now()+10*60000) } });
      return groupResult(tx, order, group, group.filter((c) => c.status === 'ARRIVED_AT_GATE').map((c) => c.id));
    }
    await tx.order.update({ where: { id: order.id }, data: { otpLocked: false, otpAttempts: 0, otpCode: secureOtp(), otpExpiresAt:new Date(Date.now()+10*60000) } });
    return { order: await reload(tx, order.id), before: order, changed: true };
  });
  await writeAudit('OTP_UNLOCKED', 'ORDER', orderId, `Admin unlocked the delivery verification code (was ${result.before.otpLocked ? 'locked' : 'not locked'}, ${result.before.otpAttempts} wrong attempts). The customer sees the new code in the app.`);
  return finishChange(result);
};
