import { Router } from 'express';
import { requireAuth,requireRole,AuthenticatedRequest } from '../middleware/auth';
import { fail,validParams } from '../utils/http';
import { planSettlementPayout,settlementReadiness } from '../services/payoutReadiness';
export const payoutReadinessRouter=Router();
const wrap=(fn:(r:AuthenticatedRequest,s:any)=>Promise<any>)=>async(r:AuthenticatedRequest,s:any)=>{try{s.set('Cache-Control','no-store');await fn(r,s);}catch(e){fail(s,e,'payout readiness');}};
payoutReadinessRouter.get('/v1/admin/settlements/:id/readiness',requireAuth,requireRole('ADMIN'),validParams('id'),wrap(async(r,s)=>s.json({success:true,data:await settlementReadiness(r.params.id)})));
payoutReadinessRouter.post('/v1/admin/settlements/:id/payout-plan',requireAuth,requireRole('ADMIN'),validParams('id'),wrap(async(r,s)=>s.json({success:true,data:await planSettlementPayout(r.params.id,r.body?.requestKey,r.user!.id)})));
