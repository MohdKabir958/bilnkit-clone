import { OrderWithRelations } from './orderView';
import { prisma } from '../db';
import { paymentWindowMin } from '../config/orderFlow';
import { getPaymentProvider, withProviderTimeout } from './paymentService';
import { AppError } from '../utils/appError';

/** Protect the complete checkout window plus bank/UPI confirmation grace, not merely the polling interval. */
export const checkoutProtectionMs = () => (Math.max(5, Math.min(60, paymentWindowMin())) + 5) * 60_000;
export const pendingCheckoutProtected = (o: Pick<OrderWithRelations, 'createdAt' | 'payments'>, now = Date.now()) =>
  o.payments.some(p => p.status === 'PENDING' && (
    now < Math.max(o.createdAt.getTime(), p.createdAt.getTime()) + checkoutProtectionMs()
    || !p.lastProviderCheckedAt || now - p.lastProviderCheckedAt.getTime() > 30_000
    || !['NO_CAPTURE', 'failed'].includes(p.providerStatus ?? '')
  ));

/** Provider I/O happens before order/customer locks. A fresh observation is rechecked under the transaction lock. */
const observe = async (orderId: string, now: Date) => {
  const rows = await prisma.payment.findMany({ where: { orderId, status: 'PENDING', capturedAmountPaise: null }, take: 10 });
  for (const row of rows) {
    if (now.getTime() < row.createdAt.getTime() + checkoutProtectionMs()) continue;
    try {
      const provider = getPaymentProvider();
      if (!provider.fetchOrderPayments) return false;
      const payments = await withProviderTimeout(provider.fetchOrderPayments(row.razorpayOrderId));
      if (payments.some(p => p.orderId !== row.razorpayOrderId || !Number.isSafeInteger(p.amountPaise))) return false;
      const captured = payments.find(p => ['captured', 'authorized', 'refunded'].includes(p.status));
      await prisma.payment.updateMany({ where: { id: row.id, status: 'PENDING' }, data: {
        lastProviderCheckedAt: now, providerStatus: captured?.status ?? (payments.some(p => !['failed'].includes(p.status)) ? 'PROCESSING' : 'NO_CAPTURE'),
      } });
      if (captured) {
        const { confirmAndMarkPaid } = await import('./paymentReconcile');
        await confirmAndMarkPaid({ razorpayOrderId: row.razorpayOrderId, razorpayPaymentId: captured.id });
        return false;
      }
    } catch { return false; }
  }
  return true;
};

export const reconcileCheckoutsBeforeReplacement = async (customerId: string, vendorIds: string[]) => {
  const rows = await prisma.order.findMany({ where: { customerId, vendorId: { in: vendorIds }, status: 'PLACED',
    paymentStatus: { in: ['PENDING', 'FAILED'] }, paymentMethod: 'ONLINE', payments: { some: { status: 'PENDING' } } },
    select: { id: true }, take: 10 });
  for (const o of rows) {
    if (!await observe(o.id, new Date())) throw new AppError(409, 'PAYMENT_STATUS_UNKNOWN',
      'Your earlier payment is being checked. Open that order before starting another payment.', undefined, { pendingOrderId: o.id, actions: ['RESUME', 'RECHECK', 'CONTACT_SUPPORT'] });
  }
};

export const canExpireUnpaidOrder = async (orderId: string, now: Date, options: {observeProvider?:boolean}={observeProvider:true}) => {
  const meta=await prisma.order.findUnique({where:{id:orderId},select:{id:true,groupId:true}});
  if(!meta)return false;
  const primary=meta.groupId?await prisma.order.findFirst({where:{groupId:meta.groupId,groupIndex:0},select:{id:true}}):meta;
  if(!primary)return false;
  if (options.observeProvider && !await observe(primary.id, now)) return false;
  const order = await prisma.order.findUnique({ where: { id: primary.id }, include: { payments: true } });
  return !!order && ['PENDING', 'FAILED'].includes(order.paymentStatus) && !pendingCheckoutProtected(order as OrderWithRelations, now.getTime());
};
