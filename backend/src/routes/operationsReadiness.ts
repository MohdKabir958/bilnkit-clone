import express, { Router, Response } from 'express';
import { prisma } from '../db';
import { requireAuth, requireRole, AuthenticatedRequest } from '../middleware/auth';
import { fail, validParams } from '../utils/http';
import { text } from '../services/geography';
import { cashCollectionLedger, createCashDailyClose, recordCashEvidence, reviewCashDailyClose, riderCashBalance } from '../services/cashReconciliation';
import { operationalExceptions, recordOperationalResolution } from '../services/operationsReadiness';
import { AppError } from '../utils/appError';
import { SlidingWindow } from '../middleware/rateLimit';
import { usesClerk } from '../config/authMode';
import { EVIDENCE_TYPES, MAX_EVIDENCE_BYTES, readSupportEvidence, storeSupportEvidence } from '../services/supportEvidence';

export const operationsReadinessRouter=Router();
const writes=new SlidingWindow();
const admin=[requireAuth,requireRole('ADMIN'),(r:AuthenticatedRequest,s:Response,next:()=>void)=>{if(r.method==='GET'||process.env.NODE_ENV==='test')return next();const limit=writes.hit(r.user!.id,30,10*60000);if(!limit.ok)return s.status(429).set('Retry-After',String(limit.retryAfterSeconds)).json({success:false,code:'RATE_LIMITED',message:'Too many operational changes. Please wait.'});next();}] as const;
const readers=[requireAuth,requireRole('ADMIN','STUDENT','VENDOR','DRIVER')] as const;
const wrap=(fn:(r:AuthenticatedRequest,s:Response)=>Promise<unknown>)=>async(r:AuthenticatedRequest,s:Response)=>{try{await fn(r,s);}catch(e){fail(s,e,'operations readiness');}};
const ok=(s:Response,data:unknown,status=200)=>s.status(status).json({success:true,data});
operationsReadinessRouter.get('/v1/admin/support-owners',...admin,wrap(async(_r,s)=>{ok(s,await prisma.user.findMany({where:{role:'ADMIN',deletedAt:null,...(usesClerk()?{adminAccess:{status:'ACTIVE'}}:{})},select:{id:true,name:true,email:true},orderBy:{name:'asc'},take:200}));}));
operationsReadinessRouter.get('/v1/admin/operations/exceptions',...admin,wrap(async(r,s)=>{ok(s,await operationalExceptions(r.query.cityId===undefined?undefined:text(r.query.cityId,'cityId',64)));}));
operationsReadinessRouter.post('/v1/admin/operations/resolutions',...admin,wrap(async(r,s)=>{ok(s,await recordOperationalResolution(r.user!.id,r.body));}));
operationsReadinessRouter.get('/v1/admin/cash/:id/ledger',...admin,validParams('id'),wrap(async(r,s)=>{const data=await prisma.$transaction(async tx=>{const row=await tx.cashCollection.findUnique({where:{id:r.params.id}});if(!row)throw new AppError(404,'NOT_FOUND','Cash collection not found.');return cashCollectionLedger(tx,row);});ok(s,data);}));
operationsReadinessRouter.post('/v1/admin/cash/:id/evidence',...admin,validParams('id'),wrap(async(r,s)=>{ok(s,await recordCashEvidence(r.params.id,r.user!.id,r.body));}));
operationsReadinessRouter.get('/v1/admin/riders/:id/cash-balance',...admin,validParams('id'),wrap(async(r,s)=>{ok(s,await riderCashBalance(r.params.id));}));
operationsReadinessRouter.get('/v1/drivers/cash-balance',requireAuth,requireRole('DRIVER'),wrap(async(r,s)=>{ok(s,await riderCashBalance(r.user!.id));}));
operationsReadinessRouter.get('/v1/admin/cash-closes',...admin,wrap(async(r,s)=>{const driverUserId=r.query.driverUserId===undefined?undefined:text(r.query.driverUserId,'driverUserId',64);ok(s,await prisma.cashDailyClose.findMany({where:{...(driverUserId?{driverUserId}:{})},orderBy:{createdAt:'desc'},take:100}));}));
operationsReadinessRouter.post('/v1/admin/riders/:id/cash-close',...admin,validParams('id'),wrap(async(r,s)=>{ok(s,await createCashDailyClose(r.params.id,r.user!.id,r.body),201);}));
operationsReadinessRouter.post('/v1/admin/cash-closes/:id/review',...admin,validParams('id'),wrap(async(r,s)=>{ok(s,await reviewCashDailyClose(r.params.id,r.user!.id,r.body));}));
operationsReadinessRouter.post('/v1/support-cases/:id/evidence',...readers,validParams('id'),express.raw({type:EVIDENCE_TYPES,limit:MAX_EVIDENCE_BYTES}),wrap(async(r,s)=>{
  ok(s,await storeSupportEvidence(r.user!,r.params.id,String(r.headers['content-type']??'').split(';')[0].trim().toLowerCase(),r.body,r.query.caption),201);
}));
operationsReadinessRouter.get('/v1/support-cases/:id/evidence/:evidenceId',...readers,validParams('id','evidenceId'),wrap(async(r,s)=>{
  const file=await readSupportEvidence(r.user!,r.params.id,r.params.evidenceId);
  s.set({'Content-Type':file.mime,'Content-Length':String(file.bytes.length),'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Disposition':'inline; filename="support-evidence"','Cross-Origin-Resource-Policy':'same-site'}).send(file.bytes);
}));
