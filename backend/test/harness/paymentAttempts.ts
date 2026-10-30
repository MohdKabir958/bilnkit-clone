import { prisma } from './db';
/** Historical expiry fixtures must age the provider attempt as well as the checkout.
 * New source protects the whole checkout/UPI confirmation window; aging only Order.createdAt is not an abandoned payment.
 * No real provider or live database is used by this guarded test helper. */
export async function ageCheckoutAttempt(id: string, minutes = 25) {
  if (process.env.NODE_ENV !== 'test' || !new URL(process.env.DATABASE_URL!).pathname.endsWith('_test')) throw Error('Disposable test database required.');
  const at = new Date(Date.now() - minutes * 60_000);
  await prisma.order.update({where:{id},data:{createdAt:at}});
  await prisma.payment.updateMany({where:{orderId:id,status:{in:['PENDING','FAILED']}},data:{createdAt:at}});
  await prisma.paymentCreation.updateMany({where:{orderId:id},data:{createdAt:at}});
}
