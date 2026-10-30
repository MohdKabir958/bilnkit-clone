import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';

export const COMPLIANCE_DOCUMENTS = ['FSSAI', 'GST', 'SELLER_AUTHORIZATION', 'BUSINESS_ADDRESS'] as const;
export const SELLER_COMPLIANCE_SELECT = { id:true, vendorId:true, businessName:true, businessAddress:true, contactEmail:true, contactPhone:true, gstApplicable:true, gstNumber:true, fssaiApplicable:true, fssaiNumber:true, fssaiExpiresAt:true, authorizedSellerName:true, documentReferences:true, requiredDocuments:true, status:true, revision:true, reviewedById:true, reviewedAt:true, reviewReason:true, createdAt:true, updatedAt:true } as const;
const reject=(message:string)=>{throw new AppError(400,'INVALID_COMPLIANCE',message);};
const text=(v:unknown,max:number)=> v===null||v===''?null:typeof v==='string'&&v.trim().length<=max?v.trim():reject('Enter valid business details.');
const date=(v:unknown)=>{if(v===null||v==='')return null;if(typeof v!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(v))return reject('Use an expiry date in YYYY-MM-DD format.');const d=new Date(v+'T23:59:59.999Z');if(!Number.isFinite(d.getTime())||d.toISOString().slice(0,10)!==v)return reject('Enter a valid expiry date.');return d;};
export const compliancePatch=(raw:any,admin:boolean):Prisma.SellerComplianceUncheckedUpdateInput=>{
 if(!raw||typeof raw!=='object'||Array.isArray(raw))return reject('Enter business details.');
 const allowed=['businessName','businessAddress','contactEmail','contactPhone','gstApplicable','gstNumber','fssaiApplicable','fssaiNumber','fssaiExpiresAt','authorizedSellerName','documentReferences','revision',...(admin?['requiredDocuments']:[])];
 if(Object.keys(raw).some(k=>!allowed.includes(k)))return reject('Unknown or operator-controlled compliance field.');
 const out:any={status:'DRAFT',reviewedById:null,reviewedAt:null,reviewReason:null,revision:{increment:1}};
 for(const [k,max] of Object.entries({businessName:160,businessAddress:500,contactEmail:200,contactPhone:20,gstNumber:15,fssaiNumber:14,authorizedSellerName:160}))if(k in raw)out[k]=text(raw[k],max);
 if(out.contactEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(out.contactEmail))return reject('Enter a valid business contact email.');
 if(out.contactPhone&&!/^\+?[0-9 ()-]{8,20}$/.test(out.contactPhone))return reject('Enter a valid business contact number.');
 if(out.gstNumber){out.gstNumber=out.gstNumber.toUpperCase();if(!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(out.gstNumber))return reject('Enter a GSTIN in the prescribed format. Format validation does not verify registration.');}
 if(out.fssaiNumber&&!/^\d{14}$/.test(out.fssaiNumber))return reject('FSSAI registration/licence must contain 14 digits.');
 for(const k of ['gstApplicable','fssaiApplicable'])if(k in raw){if(typeof raw[k]!=='boolean'&&raw[k]!==null)return reject('Applicability must be yes, no or not reviewed.');out[k]=raw[k];}
 if('fssaiExpiresAt'in raw)out.fssaiExpiresAt=date(raw.fssaiExpiresAt);
 if('requiredDocuments'in raw){if(!Array.isArray(raw.requiredDocuments)||raw.requiredDocuments.some((x:any)=>!COMPLIANCE_DOCUMENTS.includes(x))||new Set(raw.requiredDocuments).size!==raw.requiredDocuments.length)return reject('Choose valid required documents.');out.requiredDocuments=raw.requiredDocuments;}
 if('documentReferences'in raw){
  if(!Array.isArray(raw.documentReferences)||raw.documentReferences.length>12)return reject('Use at most 12 private document references.');
  out.documentReferences=raw.documentReferences.map((d:any)=>{
   if(!d||!COMPLIANCE_DOCUMENTS.includes(d.kind)||typeof d.reference!=='string'||!/^[A-Za-z0-9][A-Za-z0-9_./:-]{2,159}$/.test(d.reference)||d.reference.includes('://')||d.reference.includes('..'))return reject('Use a private document registry reference; public URLs are not accepted.');
   return {kind:d.kind,reference:d.reference,...(d.expiresAt?{expiresAt:date(d.expiresAt)!.toISOString()}: {})};
  });
 }
 return out;
};
export const complianceIssues=(p:any,now=new Date()):string[]=>{
 const issues:string[]=[];
 if(!p?.businessName||!p?.businessAddress||!p?.authorizedSellerName||(!p?.contactEmail&&!p?.contactPhone))issues.push('BUSINESS_DETAILS_REQUIRED');
 if(p?.gstApplicable===null||p?.fssaiApplicable===null)issues.push('APPLICABILITY_REVIEW_REQUIRED');
 if(p?.gstApplicable&&!p?.gstNumber)issues.push('GSTIN_REQUIRED');
 if(p?.fssaiApplicable&&(!p?.fssaiNumber||!p?.fssaiExpiresAt))issues.push('FSSAI_DETAILS_REQUIRED');
 if(p?.fssaiApplicable&&p?.fssaiExpiresAt&&new Date(p.fssaiExpiresAt)<=now)issues.push('FSSAI_EXPIRED');
 const refs=Array.isArray(p?.documentReferences)?p.documentReferences:[];
 for(const kind of Array.isArray(p?.requiredDocuments)?p.requiredDocuments:[])if(!refs.some((r:any)=>r.kind===kind&&(!r.expiresAt||new Date(r.expiresAt)>now)))issues.push(`DOCUMENT_REQUIRED_${kind}`);
 return issues;
};
const lockVendor=async(tx:Prisma.TransactionClient,vendorId:string,actor:{id:string;role:string})=>{
 const rows=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "Vendor" WHERE "id"=${vendorId} FOR UPDATE`;
 const v=rows.length?await tx.vendor.findUnique({where:{id:vendorId}}):null;
 if(!v||actor.role!=='ADMIN'&&(v.userId!==actor.id||v.approvalStatus!=='APPROVED'))throw new AppError(404,'NOT_FOUND','Store not found.');
 return v;
};
export const saveSellerCompliance=async(vendorId:string,raw:any,actor:{id:string;role:string})=>prisma.$transaction(async tx=>{
 await lockVendor(tx,vendorId,actor);
 const old=await tx.sellerCompliance.findUnique({where:{vendorId}});
 if(!Number.isInteger(raw?.revision)||raw.revision!==(old?.revision??0))throw new AppError(409,'COMPLIANCE_CHANGED','Business details changed. Refresh before saving.');
 const patch=compliancePatch(raw,actor.role==='ADMIN');
 const row=old?await tx.sellerCompliance.update({where:{vendorId},data:patch}):await tx.sellerCompliance.create({data:{...patch,revision:1,vendorId} as Prisma.SellerComplianceUncheckedCreateInput});
 await tx.adminAuditLog.create({data:{action:'SELLER_COMPLIANCE_UPDATED',targetType:'VENDOR',targetId:vendorId,summary:`Actor ${actor.id} saved revision ${row.revision}; prior verification cleared.`}});
 return row;
});
export const reviewSellerCompliance=async(vendorId:string,raw:any,actorId:string)=>prisma.$transaction(async tx=>{
 await lockVendor(tx,vendorId,{id:actorId,role:'ADMIN'});
 const row=await tx.sellerCompliance.findUnique({where:{vendorId}});
 if(!row)throw new AppError(409,'COMPLIANCE_REQUIRED','Save the seller business details before review.');
 if(raw?.revision!==row.revision)throw new AppError(409,'COMPLIANCE_CHANGED','Refresh the seller details before reviewing.');
 if(!['VERIFIED','REJECTED','NEEDS_REVIEW'].includes(raw?.decision)||typeof raw?.reason!=='string'||raw.reason.trim().length<8||raw.reason.length>500)throw new AppError(400,'REVIEW_REQUIRED','Choose a decision and record an 8–500 character verification reason.');
 if(raw.decision==='VERIFIED'&&complianceIssues(row).length)throw new AppError(409,'COMPLIANCE_INCOMPLETE',`Resolve: ${complianceIssues(row).join(', ')}.`);
 const updated=await tx.sellerCompliance.update({where:{vendorId},data:{status:raw.decision,reviewedById:actorId,reviewedAt:new Date(),reviewReason:raw.reason.trim(),revision:{increment:1}}});
 await tx.adminAuditLog.create({data:{action:'SELLER_COMPLIANCE_REVIEWED',targetType:'VENDOR',targetId:vendorId,summary:`Admin ${actorId}: ${updated.status}, revision ${updated.revision}. ${updated.reviewReason}`}});
 return updated;
});
