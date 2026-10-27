import {Prisma} from '@prisma/client';
import {prisma} from '../db';
import {AuthenticatedRequest} from '../middleware/auth';
import {text} from './geography';
import {AppError} from '../utils/appError';
const TTL=3600000;
export type Assistance={id:string;vendorId:string;actorId:string;reason:string};
export async function openCatalogAssistance(actorId:string,input:Record<string,unknown>){
 const vendorId=text(input.vendorId,'vendorId',64),reason=text(input.reason,'reason',200);
 if(reason.length<8||input.confirmed!==true)throw new AppError(400,'ASSISTANCE_REASON_REQUIRED','Explain the exceptional support request and confirm it.','reason');
 if(!await prisma.vendor.findUnique({where:{id:vendorId},select:{id:true}}))throw new AppError(404,'NOT_FOUND','Store not found.');
 const row=await prisma.adminAuditLog.create({data:{action:'CATALOG_ASSISTANCE_OPENED',targetType:'VENDOR',targetId:vendorId,summary:JSON.stringify({actorId,vendorId,reason})}});
 return {id:row.id,vendorId,expiresAt:new Date(row.createdAt.getTime()+TTL).toISOString()};
}
export async function verifyCatalogAssistance(actorId:string,id:unknown):Promise<Assistance>{
 if(typeof id!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(id))throw new AppError(400,'INVALID_ASSISTANCE','Start a valid assistance request.');
 const row=await prisma.adminAuditLog.findUnique({where:{id}});
 let data:Omit<Assistance,'id'>|undefined;try{data=JSON.parse(row?.summary??'null');}catch{}
 if(!row||row.action!=='CATALOG_ASSISTANCE_OPENED'||row.createdAt.getTime()+TTL<=Date.now()||data?.actorId!==actorId||data?.vendorId!==row.targetId||typeof data?.reason!=='string')throw new AppError(403,'ASSISTANCE_UNAVAILABLE','This support session expired or belongs to another operator. Start a new request.');
 return {id,...data};
}
const contexts=new WeakMap<AuthenticatedRequest,Assistance>();
export async function bindCatalogAssistance(req:AuthenticatedRequest){
 if(['GET','HEAD'].includes(req.method)||req.body?.assistanceId===undefined)return;
 if(req.user?.role!=='ADMIN')throw new AppError(403,'FORBIDDEN','Only administrators can use exceptional catalog assistance.');
 contexts.set(req,await verifyCatalogAssistance(req.user.id,req.body.assistanceId));
}
export function checkAssistanceStore(req:AuthenticatedRequest,vendorId:string){const context=contexts.get(req);if(context&&context.vendorId!==vendorId)throw new AppError(403,'ASSISTANCE_STORE_MISMATCH','The assistance request belongs to another store.');}
export async function auditCatalogAssistance(tx:Prisma.TransactionClient,req:AuthenticatedRequest,targetId:string){const context=contexts.get(req);if(context)await tx.adminAuditLog.create({data:{action:'CATALOG_ASSISTANCE_APPLIED',targetType:'MENU_ITEM',targetId,summary:JSON.stringify({...context,operation:req.method+' '+req.route.path})}});}
