import { randomUUID } from 'crypto';
import { JobAborted } from '../jobs';
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
export type OutboxOptions = { signal?: AbortSignal; checkpoint?: () => Promise<void> };
const MAX_INTENT_ATTEMPTS = 8;
export async function flushNotificationIntents(now=new Date(), options:OutboxOptions={}) {
  const enabled=getPushProvider().enabled;
  let processed=0;
  // Claim each item just before delivery. Claiming a large batch for serial sends lets later items' leases expire.
  for(let i=0;i<100;i++) {
    if(options.signal?.aborted)throw new JobAborted();
    await options.checkpoint?.();
    const at=new Date(Math.max(now.getTime(),Date.now())),token=randomUUID();
    const row=await prisma.$transaction(async tx=>{
      const ids=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "NotificationIntent" WHERE "state"='PENDING' AND ("leaseUntil" IS NULL OR "leaseUntil"<${at} OR (${enabled} AND "errorCode"='PROVIDER_UNCONFIGURED')) ORDER BY "createdAt" LIMIT 1 FOR UPDATE SKIP LOCKED`;
      if(!ids.length)return null;
      return tx.notificationIntent.update({where:{id:ids[0].id},data:{leaseUntil:new Date(at.getTime()+120000),leaseToken:token,errorCode:null}});
    });
    if(!row)break;
    processed++;
    const finish=(data:Prisma.NotificationIntentUpdateManyMutationInput)=>prisma.notificationIntent.updateMany({where:{id:row.id,state:'PENDING',leaseToken:token},data:{...data,leaseToken:null}});
    const stale=!(PUSH_EVENTS as readonly string[]).includes(row.event)||at.getTime()-row.createdAt.getTime()>eventDef(row.event as PushEvent).usefulMinutes*60000;
    const offer=(row.options??{}) as PushOptions;
    const offerExpired=row.event==='NEW_DELIVERY'&&offer.offerExpiresAt&&Date.parse(offer.offerExpiresAt)<=at.getTime();
    if(stale||offerExpired) {await finish({state:'EXPIRED',leaseUntil:null,errorCode:'STALE_OR_UNKNOWN_EVENT'});continue;}
    if(!enabled){await finish({leaseUntil:new Date(at.getTime()+60000),errorCode:'PROVIDER_UNCONFIGURED'});continue;}
    if(row.attempts>=MAX_INTENT_ATTEMPTS){await finish({state:'DEAD',leaseUntil:null,errorCode:'MAX_ATTEMPTS'});continue;}
    try {
      if(options.signal?.aborted)throw new JobAborted();
      // PushLog contains its own durable recipient claim. Outbox completion is fenced to this lease owner.
      await notifyOrderEvent(row.orderId,row.event as PushEvent,offer,true);
      await finish({state:'DONE',attempts:{increment:1},leaseUntil:null,errorCode:null});
    } catch(error) {
      const attempts=row.attempts+1;
      await finish({attempts:{increment:1},state:attempts>=MAX_INTENT_ATTEMPTS?'DEAD':'PENDING',leaseUntil:attempts>=MAX_INTENT_ATTEMPTS?null:new Date(at.getTime()+Math.min(900000,30000*2**Math.min(5,attempts-1))),errorCode:'DISPATCH_ERROR'});
      if(options.signal?.aborted)throw error;
    }
  }
  return processed;
}
