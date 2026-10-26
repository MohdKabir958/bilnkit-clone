import { randomUUID } from 'crypto';
import { prisma, cleanTestOrders, seedTestDatabase } from '../harness/db';
import { paymentCapabilities, requirePaymentMethod } from '../../src/services/paymentCapabilities';
import { placeOrder, createPaymentForOrder, cancelOrder, loadOrder } from '../../src/services/orderFlow';
import { pendingCheckoutProtected, canExpireUnpaidOrder } from '../../src/services/checkoutRecovery';
import { createSimulatedProvider, setPaymentProvider } from '../../src/services/paymentService';
import { runRefund } from '../../src/services/refundService';
import { proposeOrderAdjustment, decideOrderAdjustment, expireOrderAdjustments } from '../../src/services/orderAdjustments';
import { runPartialRefund } from '../../src/services/partialRefunds';
import { lockProducts, reserveStock, ensureOrderStockSafe } from '../../src/services/inventory';

describe('Truthful checkout, protected payment attempts and customer-approved shortages', () => {
  let fixtures: Awaited<ReturnType<typeof seedTestDatabase>>;
  const customer={id:'usr-1',role:'STUDENT'}, vendor={id:'usr-3',role:'VENDOR'};
  const env={...process.env};
  beforeEach(async()=>{await cleanTestOrders();fixtures=await seedTestDatabase();setPaymentProvider(null);process.env.PAYMENT_PROVIDER='razorpay';});
  afterEach(()=>{setPaymentProvider(null);process.env.PAYMENT_PROVIDER=env.PAYMENT_PROVIDER;delete process.env.PROVIDER_TIMEOUT_MS;});
  afterAll(async()=>{await cleanTestOrders();await prisma.$disconnect();});
  const checkout=()=>placeOrder(customer.id,{vendorId:'ven-1',items:[{itemId:'item-1',quantity:1}],dropoffHostel:'',dropoffNotes:null,clientRequestId:randomUUID()});
  const packingOrder=async(cash=false)=>{
    const order=await prisma.order.create({data:{customerId:customer.id,vendorId:'ven-1',workflowVersion:2,paymentMethod:cash?'COD':'ONLINE',status:'PREPARING',paymentStatus:cash?'PENDING':'PAID',paidAt:cash?null:new Date(),dropoffHostel:'Synthetic saved address',subtotal:360,vendorSubtotal:360,totalAmount:385,deliveryFee:25,items:{create:{menuItemId:'item-1',name:'Original grocery pack',quantity:2,price:180,vendorUnitPrice:180}}}});
    await prisma.$transaction(async tx=>{await lockProducts(tx,['item-1']);await reserveStock(tx,order.id,[{itemId:'item-1',quantity:2}]);});
    return order;
  };
  test('disabled or incomplete gateway is never advertised; COD is independently city controlled',()=>{
    process.env.PAYMENT_PROVIDER='disabled';expect(paymentCapabilities(false).paymentMethods).toEqual([]);expect(paymentCapabilities(true).paymentMethods).toEqual(['COD']);expect(()=>requirePaymentMethod('ONLINE',true)).toThrow();
    process.env.PAYMENT_PROVIDER='razorpay';const secret=process.env.RAZORPAY_KEY_SECRET;delete process.env.RAZORPAY_KEY_SECRET;expect(paymentCapabilities(false).online.available).toBe(false);process.env.RAZORPAY_KEY_SECRET=secret;
    expect(paymentCapabilities(false)).toMatchObject({paymentMethods:['ONLINE'],online:{mode:'TEST'}});
  });
  test('concurrent payment starts share one provider order without holding a transaction across the network',async()=>{
    const o=await checkout(),sim=createSimulatedProvider();let calls=0;
    setPaymentProvider({...sim,createOrder:async input=>{calls++;expect(await prisma.order.count()).toBeGreaterThan(0);await new Promise(r=>setTimeout(r,75));return sim.createOrder(input);}});
    const results=await Promise.all([createPaymentForOrder(o.order.id,customer),createPaymentForOrder(o.order.id,customer)]);
    expect(calls).toBe(1);expect(results[0].razorpayOrderId).toBe(results[1].razorpayOrderId);expect(await prisma.payment.count()).toBe(1);
  });
  test('unknown provider creation is durable and retry never starts a duplicate gateway order',async()=>{
    const o=await checkout();let calls=0;process.env.PROVIDER_TIMEOUT_MS='20';
    setPaymentProvider({...createSimulatedProvider(),createOrder:async()=>{calls++;await new Promise(()=>undefined);throw Error('unreachable');}});
    await expect(createPaymentForOrder(o.order.id,customer)).rejects.toMatchObject({code:'PROVIDER_UNAVAILABLE'});
    await expect(createPaymentForOrder(o.order.id,customer)).rejects.toMatchObject({code:'PAYMENT_START_PENDING'});
    expect(calls).toBe(1);expect((await prisma.paymentCreation.findUniqueOrThrow({where:{orderId:o.order.id}})).state).toBe('UNKNOWN');
  });
  test('a recent provider attempt blocks replacement and expiry; aged authoritative no-capture may expire',async()=>{
    const o=await checkout();await createPaymentForOrder(o.order.id,customer);
    await expect(checkout()).rejects.toMatchObject({code:'PAYMENT_IN_PROGRESS'});
    expect(pendingCheckoutProtected((await loadOrder(o.order.id))!)).toBe(true);
    expect(await canExpireUnpaidOrder(o.order.id,new Date())).toBe(false);
    const aged=new Date(Date.now()-25*60_000);await prisma.order.update({where:{id:o.order.id},data:{createdAt:aged}});await prisma.payment.updateMany({where:{orderId:o.order.id},data:{createdAt:aged}});
    expect(await canExpireUnpaidOrder(o.order.id,new Date())).toBe(true);
  });
  test('provider-pending full refund stays pending until authoritative processing and is not submitted twice',async()=>{
    const o=await packingOrder(),sim=createSimulatedProvider();sim.addPayment({id:'pending-capture',orderId:'pending-rzp',amountPaise:38500});
    await prisma.payment.create({data:{orderId:o.id,razorpayOrderId:'pending-rzp',razorpayPaymentId:'pending-capture',amount:385,capturedAmountPaise:38500,status:'PAID'}});
    let calls=0;setPaymentProvider({...sim,refundPayment:async input=>{calls++;const r=await sim.refundPayment(input);r.status='pending';sim.refunds.set(input.paymentId,[r]);return r;}});
    await cancelOrder(o.id,{id:'usr-5',role:'ADMIN'},'ADMIN','Unable to supply packs');
    expect((await loadOrder(o.id))!).toMatchObject({paymentStatus:'PAID',refundStatus:'PENDING'});
    await runRefund(o.id,new Date(Date.now()+60_000));expect(calls).toBe(1);
    sim.refunds.get('pending-capture')![0].status='processed';expect((await runRefund(o.id,new Date(Date.now()+180_000))).outcome).toBe('DONE');
  });
  test('only the owning customer can approve reduced quantities; cash due and stock change exactly once',async()=>{
    const o=await packingOrder(true),p=await proposeOrderAdjustment(o.id,vendor,{requestKey:randomUUID(),reason:'One sealed pack was unavailable',items:[{itemId:'item-1',quantity:1}]});
    const physicalStockBefore=fixtures.menuItem1.stockQty-2;
    expect((await loadOrder(o.id))!.updatedAt.getTime()).toBeGreaterThan(o.updatedAt.getTime());
    await expect(decideOrderAdjustment(p.id,{id:'usr-5',role:'ADMIN'},{requestKey:randomUUID(),version:1,decision:'ACCEPT'})).rejects.toMatchObject({status:404});
    const requestKey=randomUUID();await decideOrderAdjustment(p.id,customer,{requestKey,version:1,decision:'ACCEPT'});await decideOrderAdjustment(p.id,customer,{requestKey,version:1,decision:'ACCEPT'});
    expect((await loadOrder(o.id))!).toMatchObject({totalAmount:205,subtotal:180,paymentMethod:'COD'});expect(await prisma.paymentRefund.count()).toBe(0);
    expect((await prisma.menuItem.findUniqueOrThrow({where:{id:'item-1'}})).stockQty).toBe(physicalStockBefore);
    const stockReservation=await prisma.inventoryReservation.findUniqueOrThrow({where:{orderId_menuItemId:{orderId:o.id,menuItemId:'item-1'}}});
    expect(await prisma.stockMovement.count({where:{menuItemId:'item-1',kind:'MISSING',reference:{startsWith:`disposition:${stockReservation.id}:`}}})).toBe(1);
    expect(await prisma.inventoryReservation.findUniqueOrThrow({where:{orderId_menuItemId:{orderId:o.id,menuItemId:'item-1'}}})).toMatchObject({quantity:1});
  });
  test('more expensive and foreign-store alternatives are refused; rejecting preserves original items and totals',async()=>{
    const o=await packingOrder(true);
    await expect(proposeOrderAdjustment(o.id,vendor,{requestKey:randomUUID(),reason:'More packs requested by store',items:[{itemId:'item-1',quantity:3}]})).rejects.toMatchObject({code:'ADDITIONAL_PAYMENT_UNSUPPORTED'});
    const p=await proposeOrderAdjustment(o.id,vendor,{requestKey:randomUUID(),reason:'One pack unavailable from shelf',items:[{itemId:'item-1',quantity:1}]});
    await decideOrderAdjustment(p.id,customer,{requestKey:randomUUID(),version:1,decision:'REJECT'});expect((await loadOrder(o.id))!).toMatchObject({totalAmount:385,subtotal:360});
    await expect(prisma.$transaction(tx=>ensureOrderStockSafe(tx,[o.id]))).rejects.toMatchObject({code:'PACKING_REVIEW_REQUIRED'});
  });
  test('partial refund and later full cancellation reconcile to the original captured amount',async()=>{
    const o=await packingOrder(),sim=createSimulatedProvider();sim.addPayment({id:'partial-capture',orderId:'partial-rzp',amountPaise:38500});setPaymentProvider(sim);
    const payment=await prisma.payment.create({data:{orderId:o.id,razorpayOrderId:'partial-rzp',razorpayPaymentId:'partial-capture',amount:385,capturedAmountPaise:38500,status:'PAID'}});
    const p=await proposeOrderAdjustment(o.id,vendor,{requestKey:randomUUID(),reason:'One grocery pack cannot be supplied',items:[{itemId:'item-1',quantity:1}]});
    await decideOrderAdjustment(p.id,customer,{requestKey:randomUUID(),version:1,decision:'ACCEPT'});
    const request=await prisma.paymentRefund.findFirstOrThrow({where:{orderId:o.id}});expect(await runPartialRefund(request.id)).toBe('PROCESSED');expect(await runPartialRefund(request.id)).toBe('SKIPPED');
    expect((await prisma.payment.findUniqueOrThrow({where:{id:payment.id}})).amount).toBe(385);
    await cancelOrder(o.id,{id:'usr-5',role:'ADMIN'},'ADMIN','Customer requested cancellation');
    expect(sim.refunds.get('partial-capture')!.reduce((n,r)=>n+r.amountPaise,0)).toBe(38500);expect((await loadOrder(o.id))!.paymentStatus).toBe('REFUNDED');
  });
  test('proposal expiry races customer approval under the same order lock and does not restore missing packs',async()=>{
    const o=await packingOrder(true),p=await proposeOrderAdjustment(o.id,vendor,{requestKey:randomUUID(),reason:'One missing pack requires customer decision',items:[{itemId:'item-1',quantity:1}]});
    const before=(await loadOrder(o.id))!;
    await Promise.allSettled([expireOrderAdjustments(100,new Date(p.expiresAt.getTime()+1)),decideOrderAdjustment(p.id,customer,{requestKey:randomUUID(),version:1,decision:'ACCEPT'})]);
    const result=await prisma.orderAdjustment.findUniqueOrThrow({where:{id:p.id}}),after=(await loadOrder(o.id))!;
    expect(['APPLIED','EXPIRED']).toContain(result.state);
    expect(after.totalAmount).toBe(result.state==='APPLIED'?205:385);
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
    expect((await prisma.menuItem.findUniqueOrThrow({where:{id:'item-1'}})).stockQty).toBe(fixtures.menuItem1.stockQty-2);
    if(result.state==='EXPIRED')await expect(prisma.$transaction(tx=>ensureOrderStockSafe(tx,[o.id]))).rejects.toMatchObject({code:'PACKING_REVIEW_REQUIRED'});
  });
  test.each([1,4])('a customer explicitly approves a valid alternative SKU with quantity %i, without an extra charge',async(quantity)=>{
    const o=await packingOrder(true),p=await proposeOrderAdjustment(o.id,vendor,{requestKey:randomUUID(),reason:'Original product missing; offer an available grocery alternative',items:[{itemId:'item-2',quantity}]});
    expect((await loadOrder(o.id))!.items[0].menuItemId).toBe('item-1');
    await decideOrderAdjustment(p.id,customer,{requestKey:randomUUID(),version:1,decision:'ACCEPT'});
    const after=(await loadOrder(o.id))!;
    expect(after.totalAmount).toBe(90*quantity+25);expect(after.items).toHaveLength(1);expect(after.items[0]).toMatchObject({menuItemId:'item-2',quantity});
    expect((await prisma.menuItem.findUniqueOrThrow({where:{id:'item-1'}})).stockQty).toBe(fixtures.menuItem1.stockQty-2);
    expect((await prisma.menuItem.findUniqueOrThrow({where:{id:'item-2'}})).stockQty).toBe(fixtures.menuItem2.stockQty-quantity);
  });
  test('expired alternative batches are refused before an offer can mislead the customer',async()=>{
    const o=await packingOrder(true);
    await prisma.menuItem.update({where:{id:'item-2'},data:{batchTracking:true,stockQty:10}});
    await prisma.stockBatch.create({data:{menuItemId:'item-2',lotCode:randomUUID(),availableQty:10,expiresAt:new Date(Date.now()-1000)}});
    await expect(proposeOrderAdjustment(o.id,vendor,{requestKey:randomUUID(),reason:'Replace a missing pack with another grocery product',items:[{itemId:'item-2',quantity:1}]})).rejects.toMatchObject({code:'OUT_OF_STOCK'});
    expect(await prisma.orderAdjustment.count({where:{orderId:o.id}})).toBe(0);
    await prisma.menuItem.update({where:{id:'item-2'},data:{batchTracking:false}});
  });
  test.each(['BEFORE_SUBMISSION','LOST_SUBMISSION_ANSWER'])('partial refund recovers %s without withholding or duplicating money',async(failure)=>{
    const o=await packingOrder(),sim=createSimulatedProvider();sim.addPayment({id:'recovery-capture',orderId:'recovery-rzp',amountPaise:38500});
    await prisma.payment.create({data:{orderId:o.id,razorpayOrderId:'recovery-rzp',razorpayPaymentId:'recovery-capture',amount:385,capturedAmountPaise:38500,status:'PAID'}});
    const p=await proposeOrderAdjustment(o.id,vendor,{requestKey:randomUUID(),reason:'One grocery pack cannot be supplied',items:[{itemId:'item-1',quantity:1}]});
    await decideOrderAdjustment(p.id,customer,{requestKey:randomUUID(),version:1,decision:'ACCEPT'});
    const request=await prisma.paymentRefund.findFirstOrThrow({where:{orderId:o.id}});let listCalls=0,submitCalls=0;
    setPaymentProvider({...sim,listRefunds:async id=>{if(++listCalls===1&&failure==='BEFORE_SUBMISSION')throw Error('socket hang up');return sim.listRefunds(id);},refundPayment:async input=>{submitCalls++;const result=await sim.refundPayment(input);if(failure==='LOST_SUBMISSION_ANSWER')throw Error('socket hang up');return result;}});
    expect(await runPartialRefund(request.id)).toBe(failure==='BEFORE_SUBMISSION'?'PENDING':'UNKNOWN');
    const waiting=await prisma.paymentRefund.findUniqueOrThrow({where:{id:request.id}});
    expect(waiting.submitStartedAt===null).toBe(failure==='BEFORE_SUBMISSION');
    expect(submitCalls).toBe(failure==='BEFORE_SUBMISSION'?0:1);
    await prisma.paymentRefund.update({where:{id:request.id},data:{nextAttemptAt:new Date(0)}});
    expect(await runPartialRefund(request.id)).toBe('PROCESSED');
    expect(submitCalls).toBe(1);expect(sim.refunds.get('recovery-capture')!.reduce((sum,r)=>sum+r.amountPaise,0)).toBe(18000);
    expect((await loadOrder(o.id))!.paymentStatus).toBe('PAID');
  });
});
