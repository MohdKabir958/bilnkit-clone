import { Prisma } from '@prisma/client';
import { prisma } from '../../db';
import { PUSH_EVENTS, PushEvent, PushOptions } from './types';
import { eventDef, pushEventsForChange, pushEventsForGroupChange } from './events';
import { notifyOrderEvent } from './pushService';
import { getPushProvider } from './provider';
import type { ChangeResult } from '../orderFlow';

export async function stageNotificationIntents(tx:Prisma.TransactionClient,r:Partial<ChangeResult>,assignedByAdmin=false) {
  if(!r.changed||!r.order||!r.before) return;
  const specs=r.group ? pushEventsForGroupChange(r.group.before,r.group.after,new Set(r.group.touched),r.order.id,{newOrderAlert:r.newOrderAlert,assignedByAdmin}) : pushEventsForChange(r.before,r.order,{newOrderAlert:r.newOrderAlert,assignedByAdmin}).map((s)=>({...s,orderId:r.order!.id}));
  const events=specs.filter((s)=>s.event!=='NEW_DELIVERY'); // offers have their own transactional, recipient-specific intent
  if(events.length) await tx.notificationIntent.createMany({data:events.map((s)=>({orderId:s.orderId,event:s.event,options:{...s.opts}}))});
}
let running:Promise<void>|null=null;
let requested=false;
export function drainNotificationIntents() {
  requested=true;
  if(running)return;
  running=(async()=>{while(requested){requested=false;await flushNotificationIntents();}})()
    .catch(()=>console.error('Notification outbox dispatch failed; maintenance will retry.'))
    .finally(()=>{running=null;if(requested)drainNotificationIntents();});
}
export async function waitForNotificationIntents() {while(running)await running;}
export async function flushNotificationIntents(now=new Date()) {
  const enabled=getPushProvider().enabled;
  const rows=await prisma.$transaction(async(tx)=>{
    const ids=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "NotificationIntent" WHERE "state"='PENDING' AND ("leaseUntil" IS NULL OR "leaseUntil"<${now} OR (${enabled} AND "errorCode"='PROVIDER_UNCONFIGURED')) ORDER BY "createdAt" LIMIT 100 FOR UPDATE SKIP LOCKED`;
    if(!ids.length) return [];
    await tx.notificationIntent.updateMany({where:{id:{in:ids.map((r)=>r.id)}},data:{leaseUntil:new Date(now.getTime()+120000),errorCode:null}});
    return tx.notificationIntent.findMany({where:{id:{in:ids.map((r)=>r.id)}}});
  });
  const expired=rows.filter((row)=>!(PUSH_EVENTS as readonly string[]).includes(row.event)||now.getTime()-row.createdAt.getTime()>eventDef(row.event as PushEvent).usefulMinutes*60000);
  if(expired.length) await prisma.notificationIntent.updateMany({where:{id:{in:expired.map((r)=>r.id)}},data:{state:'EXPIRED',leaseUntil:null,errorCode:'STALE_OR_UNKNOWN_EVENT'}});
  const expiredIds=new Set(expired.map((r)=>r.id));
  const pending=rows.filter((row)=>!expiredIds.has(row.id));
  if(!enabled) {
    // Defer the entire batch. Leaving the lease empty repeatedly rewrote the same
    // rows on every order change and could exhaust the connection pool.
    if(pending.length) await prisma.notificationIntent.updateMany({where:{id:{in:pending.map((r)=>r.id)}},data:{leaseUntil:new Date(now.getTime()+60000),errorCode:'PROVIDER_UNCONFIGURED'}});
    return rows.length;
  }
  for(const row of pending) {
    const event=row.event as PushEvent;
    try {
      // notifyOrderEvent persists recipient claims/retries in PushLog before sending.
      // PushLog deduplicates completed claims; crash recovery provides at-least-once delivery.
      await notifyOrderEvent(row.orderId,event,(row.options??{}) as PushOptions,true);
      await prisma.notificationIntent.update({where:{id:row.id},data:{state:'DONE',attempts:{increment:1},leaseUntil:null,errorCode:null}});
    } catch {
      await prisma.notificationIntent.update({where:{id:row.id},data:{attempts:{increment:1},leaseUntil:new Date(now.getTime()+60000),errorCode:'DISPATCH_ERROR'}});
    }
  }
  return rows.length;
}
