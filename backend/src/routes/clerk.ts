import { Router } from 'express';
import { verifyWebhook } from '@clerk/express/webhooks';
import { prisma } from '../db';
import { clerkOnly } from '../config/authMode';
import { lockClerkSubject } from '../services/clerkIdentity';
import { disableUserTokens } from '../services/push/deviceTokens';

export const clerkWebhookRouter = Router();
clerkWebhookRouter.post('/webhooks/clerk', clerkOnly, async (req,res) => {
  let event;
  const original = req.body;
  try {
    if (!process.env.CLERK_WEBHOOK_SIGNING_SECRET || !Buffer.isBuffer((req as any).rawBody)) return void res.status(400).json({success:false,message:'Webhook verification unavailable.'});
    req.body = (req as any).rawBody;
    event = await verifyWebhook(req,{signingSecret:process.env.CLERK_WEBHOOK_SIGNING_SECRET});
  } catch { return void res.status(400).json({success:false,message:'Invalid webhook signature.'}); }
  finally { req.body = original; }
  if (!['user.created','user.updated','user.deleted'].includes(event.type)) return void res.json({success:true,ignored:true});
  const data = event.data as any;
  const subject = data.id;
  const deliveryId = req.get('svix-id');
  const timestamp = data.updated_at ?? (event as any).timestamp;
  if (typeof subject !== 'string' || !/^user_[A-Za-z0-9]+$/.test(subject) || !deliveryId || !Number.isSafeInteger(timestamp) || timestamp < 0) return void res.status(400).json({success:false,message:'Invalid identity event.'});
  try {
    const result = await prisma.$transaction(async tx => {
      await lockClerkSubject(tx,subject);
      if (await tx.clerkWebhookDelivery.findUnique({where:{id:deliveryId}})) return {duplicate:true,userId:null};
      await tx.clerkWebhookDelivery.create({data:{id:deliveryId,clerkUserId:subject,type:event.type,eventTimestamp:BigInt(timestamp)}});
      const state = await tx.clerkIdentityState.upsert({where:{clerkUserId:subject},create:{clerkUserId:subject},update:{}});
      const deleted = event.type === 'user.deleted';
      // A provider subject is never reused: deletion is terminal, including a late deletion event.
      if (state.deleted || (!deleted && BigInt(timestamp) <= state.lastEventAt)) return {duplicate:false,stale:true,userId:null};
      const suspended = !deleted && data.banned === true;
      await tx.clerkIdentityState.update({where:{clerkUserId:subject},data:{lastEventAt:BigInt(timestamp)>state.lastEventAt?BigInt(timestamp):state.lastEventAt,deleted,suspended, ...(deleted?{deleteRequested:false}:{})}});
      const user = await tx.user.findUnique({where:{clerkUserId:subject}});
      if (!user) return {duplicate:false,userId:null};
      if (deleted || suspended) {
        await tx.driverPartner.updateMany({where:{userId:user.id},data:{dutyStatus:'OFFLINE'}});
        await tx.vendor.updateMany({where:{userId:user.id},data:{isAcceptingOrders:false}});
      }
      if (deleted) {
        // Match in-app privacy cleanup while retaining order/payment foreign keys.
        await tx.address.deleteMany({where:{customerId:user.id}});
        const cases=await tx.supportCase.findMany({where:{customerId:user.id},select:{id:true}});
        await tx.supportNote.updateMany({where:{caseId:{in:cases.map(c=>c.id)}},data:{message:'[Removed after account deletion]'}});
        await tx.supportCase.updateMany({where:{customerId:user.id},data:{subject:'Deleted account',description:'[Removed after account deletion]',resolution:'Account deleted',status:'RESOLVED'}});
        await tx.user.update({where:{id:user.id},data:{deletedAt:user.deletedAt??new Date(),name:'Deleted user',phone:null,email:null,googleSub:null,passwordHash:null,avatarId:null,isStudent:null,hostelBlock:null,fcmToken:null,upiId:null,kraveoCoins:0,tokenVersion:{increment:1}}});
      }
      // Provider names are informational; roles, business contact and approvals never come from metadata.
      return {duplicate:false,userId:(deleted||suspended)?user.id:null};
    });
    if (result.userId) {
      await disableUserTokens(result.userId,'CLERK_IDENTITY_DISABLED');
      req.app.get('io')?.in(`user_${result.userId}`).disconnectSockets(true);
    }
    res.json({success:true,duplicate:result.duplicate});
  } catch { res.status(503).json({success:false,message:'Identity synchronization temporarily unavailable. Retry delivery.'}); }
});
