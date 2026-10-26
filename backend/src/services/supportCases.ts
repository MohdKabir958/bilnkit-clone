import { Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { usesClerk } from '../config/authMode';

export const SUPPORT_CATEGORIES = ['MISSING_ITEM','WRONG_ITEM','DAMAGED_ITEM','EXPIRED_ITEM','DELAYED_DELIVERY','RIDER_PROBLEM','PAYMENT_CHARGED','REFUND_NOT_RECEIVED','DELIVERY_FAILED','ACCOUNT_HELP','OTHER'] as const;
export const SUPPORT_PRIORITIES = ['LOW','NORMAL','HIGH','URGENT'] as const;
export const SUPPORT_STATUSES = ['OPEN','IN_PROGRESS','RESOLVED'] as const;
export type SupportActor = {id:string;role:string};
const invalid = (message:string, field?:string) => new AppError(400,'BAD_SUPPORT_REQUEST',message,field);
export function supportMessage(value:unknown):string {
  if(typeof value !== 'string' || !value.trim() || value.length>2000 || /[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(value)) throw invalid('Enter a message of 1–2000 characters.','message');
  return value.trim();
}
export function supportCategory(value:unknown):string {
  if(value===undefined) return 'OTHER';
  if(typeof value!=='string' || !(SUPPORT_CATEGORIES as readonly string[]).includes(value)) throw invalid('Choose a valid support category.','category');
  return value;
}
export function supportPriority(value:unknown):string {
  if(typeof value!=='string'||!(SUPPORT_PRIORITIES as readonly string[]).includes(value)) throw invalid('Choose a valid support priority.','priority');
  return value;
}
export const supportDueAt = (priority:string, now=new Date()) => new Date(now.getTime()+({URGENT:1,HIGH:4,NORMAL:24,LOW:72}[priority]??24)*3600000);
export async function activeSupportAdmin(tx:Prisma.TransactionClient,id:string) {
  const user=await tx.user.findFirst({where:{id,role:'ADMIN',deletedAt:null}});
  if(!user) throw invalid('Choose an active administrator as the support owner.','assignedToId');
  if(usesClerk()&&!await tx.adminAccess.findFirst({where:{userId:id,status:'ACTIVE'}})) throw invalid('Choose an approved active administrator.','assignedToId');
  return user;
}
export const publicSupportNote=(note:any,customerId:string)=>({id:note.id,message:note.message,createdAt:note.createdAt,fromSupport:note.actorId!==customerId});
export function requesterSupportCase(c:any) {
  const {assignedToId,refundReference,replacementReference,notes,evidence,...rest}=c;
  return {...rest,assigned:!!assignedToId,refundLinked:!!refundReference,replacementLinked:!!replacementReference,
    ...(notes?{notes:notes.filter((n:any)=>!n.internal).map((n:any)=>publicSupportNote(n,c.customerId))}:{}),
    ...(evidence?{evidence:evidence.map((e:any)=>({id:e.id,mime:e.mime,bytes:e.bytes,caption:e.caption,createdAt:e.createdAt,expiresAt:e.expiresAt}))}:{})};
}
export async function createSupportCase(actor:SupportActor,input:any) {
  if(!['STUDENT','VENDOR','DRIVER'].includes(actor.role))throw new AppError(403,'FORBIDDEN','Use the support administration tools.');
  if(!input||typeof input!=='object'||Array.isArray(input)) throw invalid('Enter the support request details.');
  const allowed=new Set(['subject','description','orderId','category']);
  if(Object.keys(input).some(key=>!allowed.has(key))) throw invalid('Support ownership and priority are managed by Grozo support.');
  const subject=typeof input.subject==='string'?input.subject.trim():'';
  if(!subject||subject.length>100||/[\x00-\x1f\x7f]/.test(subject))throw invalid('Enter a subject of 1–100 characters.','subject');
  const description=supportMessage(input.description),category=supportCategory(input.category),orderId=input.orderId==null?null:String(input.orderId);
  if(orderId&&(!/^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,63}$/.test(orderId)))throw invalid('Choose a valid order reference.','orderId');
  const priority=['PAYMENT_CHARGED','EXPIRED_ITEM','DELIVERY_FAILED'].includes(category)?'HIGH':'NORMAL';
  return prisma.$transaction(async tx=>{
    const users=await tx.$queryRaw<{id:string;deletedAt:Date|null}[]>`SELECT "id","deletedAt" FROM "User" WHERE "id"=${actor.id} FOR UPDATE`;
    if(!users.length||users[0].deletedAt)throw new AppError(401,'ACCOUNT_UNAVAILABLE','Please sign in again.');
    if(orderId&&!await tx.order.findFirst({where:{id:orderId,...(actor.role==='STUDENT'?{customerId:actor.id}:actor.role==='VENDOR'?{vendor:{userId:actor.id}}:{driverId:actor.id})}}))throw new AppError(404,'NOT_FOUND','Order not found.');
    const created=await tx.supportCase.create({data:{customerId:actor.id,subject,description,orderId,category,priority,dueAt:supportDueAt(priority)}});
    await tx.adminAuditLog.create({data:{action:'SUPPORT_CASE_CREATED',targetType:'SUPPORT_CASE',targetId:created.id,summary:`Account ${actor.id} created ${category} request; priority ${priority}.`}});
    return requesterSupportCase(created);
  });
}
export async function replyToSupportCase(actor:SupportActor,id:string,message:unknown) {
  const clean=supportMessage(message);
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT "id" FROM "SupportCase" WHERE "id"=${id} FOR UPDATE`;
    const c=await tx.supportCase.findFirst({where:{id,customerId:actor.id}});if(!c)throw new AppError(404,'NOT_FOUND','Request not found.');
    await tx.supportNote.create({data:{caseId:c.id,actorId:actor.id,message:clean,internal:false}});
    const reopened=c.status==='RESOLVED';
    await tx.supportCase.update({where:{id:c.id},data:{status:reopened?'OPEN':c.status,resolution:null,...(reopened?{resolvedAt:null,reopenedAt:new Date(),dueAt:supportDueAt(c.priority)}:{})}});
    await tx.adminAuditLog.create({data:{action:reopened?'SUPPORT_CASE_REOPENED':'SUPPORT_REQUESTER_REPLIED',targetType:'SUPPORT_CASE',targetId:c.id,summary:`Requester ${actor.id} ${reopened?'reopened the resolved case':'added a reply'}.`}});
  });
}
export async function updateSupportCase(actor:SupportActor,id:string,input:any) {
  if(actor.role!=='ADMIN')throw new AppError(403,'FORBIDDEN','Support administration requires an approved administrator.');
  const message=supportMessage(input?.message),status=input?.status;
  if(!(SUPPORT_STATUSES as readonly unknown[]).includes(status))throw invalid('Choose a valid support status.','status');
  if(input.internal!==undefined&&typeof input.internal!=='boolean')throw invalid('Internal-note visibility must be a boolean.','internal');
  const internal=input.internal===true;
  if(internal&&status==='RESOLVED')throw invalid('Resolve a request using a requester-visible explanation.','internal');
  const priority=input.priority===undefined?undefined:supportPriority(input.priority);
  const assignedToId=input.assignedToId===undefined?undefined:input.assignedToId===null?null:String(input.assignedToId);
  const reference=(value:unknown,key:string)=>{
    if(value===undefined)return undefined;if(value===null)return null;
    if(typeof value!=='string'||value.trim().length<5||value.length>120||/[\x00-\x1f\x7f]/.test(value))throw invalid('Enter a traceable reference of 5–120 characters.',key);
    return value.trim();
  };
  const refundReference=reference(input.refundReference,'refundReference'),replacementReference=reference(input.replacementReference,'replacementReference');
  return prisma.$transaction(async tx=>{
    const lock=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "SupportCase" WHERE "id"=${id} FOR UPDATE`;
    if(!lock.length)throw new AppError(404,'NOT_FOUND','Support case not found.');
    const before=await tx.supportCase.findUniqueOrThrow({where:{id}});
    await activeSupportAdmin(tx,actor.id);
    if(assignedToId)await activeSupportAdmin(tx,assignedToId);
    await tx.supportNote.create({data:{caseId:id,actorId:actor.id,message,internal}});
    const currentPriority=priority??before.priority,now=new Date();
    const row=await tx.supportCase.update({where:{id},data:{status,...(!internal?{resolution:status==='RESOLVED'?message:null}:{}),...(priority?{priority,dueAt:supportDueAt(currentPriority,now)}:{}),...(assignedToId!==undefined?{assignedToId}:{}),...(refundReference!==undefined?{refundReference}:{}),...(replacementReference!==undefined?{replacementReference}:{}),resolvedAt:status==='RESOLVED'?now:null,...(before.status==='RESOLVED'&&status!=='RESOLVED'?{reopenedAt:now,dueAt:supportDueAt(currentPriority,now)}:{})}});
    await tx.adminAuditLog.create({data:{action:'SUPPORT_CASE_UPDATED',targetType:'SUPPORT_CASE',targetId:id,summary:`Admin ${actor.id} set ${status}; priority ${currentPriority}; owner ${row.assignedToId??'unassigned'}; ${internal?'internal note':'requester-visible reply'}.`}});
    return row;
  });
}
export async function escalateOverdueSupportCases(now=new Date()) {
  return prisma.$transaction(async tx=>{
    const cases=await tx.$queryRaw<{id:string}[]>`SELECT "id" FROM "SupportCase" WHERE "status"<>'RESOLVED' AND "dueAt"<=${now} AND "escalatedAt" IS NULL ORDER BY "dueAt" LIMIT 100 FOR UPDATE SKIP LOCKED`;
    for(const c of cases) {
      await tx.supportCase.update({where:{id:c.id},data:{escalatedAt:now}});
      await tx.adminAuditLog.create({data:{action:'SUPPORT_CASE_OVERDUE',targetType:'SUPPORT_CASE',targetId:c.id,summary:'Support response SLA elapsed; operations review required.'}});
    }
    return cases.length;
  });
}
