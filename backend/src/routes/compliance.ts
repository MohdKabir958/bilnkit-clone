import { Router } from 'express';
import { prisma } from '../db';
import { requireAuth,requireRole,AuthenticatedRequest } from '../middleware/auth';
import { fail,validParams } from '../utils/http';
import { AppError } from '../utils/appError';
import { complianceIssues,reviewSellerCompliance,saveSellerCompliance } from '../services/sellerCompliance';
import { orderReceipt,receiptHtml } from '../services/orderReceipt';
export const complianceRouter=Router();
const wrap=(fn:(r:AuthenticatedRequest,s:any)=>Promise<any>)=>async(r:AuthenticatedRequest,s:any)=>{try{s.set('Cache-Control','no-store');await fn(r,s);}catch(e){fail(s,e,'seller compliance');}};
complianceRouter.get('/v1/vendors/:id/compliance',requireAuth,requireRole('VENDOR','ADMIN'),validParams('id'),wrap(async(r,s)=>{
 const v=await prisma.vendor.findUnique({where:{id:r.params.id},select:{userId:true,approvalStatus:true}});
 if(!v||r.user!.role!=='ADMIN'&&(v.userId!==r.user!.id||v.approvalStatus!=='APPROVED'))throw new AppError(404,'NOT_FOUND','Store not found.');
 const p=await prisma.sellerCompliance.findUnique({where:{vendorId:r.params.id}});s.json({success:true,data:p,issues:complianceIssues(p)});
}));
complianceRouter.put('/v1/vendors/:id/compliance',requireAuth,requireRole('VENDOR','ADMIN'),validParams('id'),wrap(async(r,s)=>s.json({success:true,data:await saveSellerCompliance(r.params.id,r.body,{id:r.user!.id,role:r.user!.role})})));
complianceRouter.post('/v1/admin/vendors/:id/compliance/review',requireAuth,requireRole('ADMIN'),validParams('id'),wrap(async(r,s)=>s.json({success:true,data:await reviewSellerCompliance(r.params.id,r.body,r.user!.id)})));
complianceRouter.get('/v1/admin/compliance/expiry',requireAuth,requireRole('ADMIN'),wrap(async(_r,s)=>{
 const until=new Date(Date.now()+30*86400000);const rows=await prisma.sellerCompliance.findMany({where:{fssaiApplicable:true,fssaiExpiresAt:{lte:until}},select:{vendorId:true,businessName:true,fssaiExpiresAt:true,status:true},orderBy:{fssaiExpiresAt:'asc'},take:200});s.json({success:true,data:rows,windowDays:30});
}));
complianceRouter.get('/v1/orders/:id/receipt',requireAuth,requireRole('STUDENT','VENDOR','ADMIN'),validParams('id'),wrap(async(r,s)=>{
 const receipt=await orderReceipt(r.params.id,{id:r.user!.id,role:r.user!.role});
 if(r.query.format==='html'){s.set('Content-Type','text/html; charset=utf-8');s.set('Content-Disposition',`attachment; filename="grozo-receipt-${r.params.id}.html"`);return s.send(receiptHtml(receipt));}s.json({success:true,data:receipt});
}));
