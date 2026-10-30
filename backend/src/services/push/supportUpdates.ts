import { createHash } from 'crypto';
import { NotificationIntent } from '@prisma/client';
import { prisma } from '../../db';
import { activeTokensFor, disableToken } from './deviceTokens';
import { classifyPushError, getPushProvider } from './provider';
import { PushApp } from './types';

/** Uses the existing outbox lease/retry machinery. Never include private support text in push copy. */
export async function sendSupportUpdate(intent: NotificationIntent): Promise<void> {
  const note = await prisma.supportNote.findUnique({where:{id:intent.supportNoteId!},include:{supportCase:{include:{customer:{select:{id:true,role:true,deletedAt:true,clerkUserId:true}}}}}});
  if(!note || note.internal || note.supportCase.customer.deletedAt) return;
  const user=note.supportCase.customer;
  if(user.clerkUserId) {
    const state=await prisma.clerkIdentityState.findUnique({where:{clerkUserId:user.clerkUserId}});
    if(state && (state.deleted || state.suspended || state.deleteRequested)) return;
  }
  const app=({STUDENT:'CUSTOMER',VENDOR:'VENDOR',DRIVER:'DRIVER'} as Record<string,PushApp>)[user.role];
  if(!app) return;
  const provider=getPushProvider();
  if(!provider.enabled) throw new Error('Support notification provider unavailable.');
  const devices=(await activeTokensFor(user.id,app)).slice(0,10);
  const options=(intent.options??{}) as Record<string,unknown>;
  const acknowledged=new Set(Array.isArray(options.supportAcks)?options.supportAcks.filter((v):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v)):[]);
  let retry=false;
  // Bounded fanout; each transport has a timeout, and outbox attempts remain finite.
  for(const device of devices) {
    const receipt=createHash('sha256').update(device.token).digest('hex');
    if(acknowledged.has(receipt))continue;
    let timer:ReturnType<typeof setTimeout>|undefined;
    try {
      await Promise.race([
        provider.send({token:device.token,title:'Support has replied',body:'Open Help and requests to read your private update.',channelId:'order_updates',priority:'normal',ttlSeconds:3600,collapseKey:`support:${note.id}`,data:{event:'SUPPORT_UPDATED',orderId:'',caseId:note.caseId,noteId:note.id,v:'1'}}),
        new Promise<never>((_,reject)=>{timer=setTimeout(()=>reject(Object.assign(new Error('Support push timeout'),{code:'TIMEOUT'})),10000);}),
      ]);
      acknowledged.add(receipt);
      const saved=await prisma.notificationIntent.updateMany({where:{id:intent.id,state:'PENDING',leaseToken:intent.leaseToken},data:{options:{supportAcks:[...acknowledged]}}});
      if(saved.count!==1)throw new Error('Support notification lease lost.');
    } catch(error) {
      const failure=classifyPushError(error);
      if(failure.deadToken) await disableToken(device.token,failure.code);
      retry ||= !failure.deadToken;
    } finally {if(timer)clearTimeout(timer);}
  }
  if(retry) throw new Error('Support notification transport must retry.');
}
