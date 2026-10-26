import { createHash, randomBytes } from 'crypto';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { ImageError, probeImage } from '../utils/imageProbe';
import { uploadDir } from '../routes/uploads';
import { SupportActor } from './supportCases';
import { privateSupportPath } from '../config/storagePaths';

export const MAX_EVIDENCE_BYTES=2*1024*1024;
export const EVIDENCE_TYPES=['image/jpeg','image/png','image/webp'];
const RETENTION_MS=90*86400000;
/** Private storage must never be nested within the public /uploads static root. */
export function supportEvidenceDir() {
  try { return privateSupportPath(uploadDir(), process.env.SUPPORT_EVIDENCE_DIR); }
  catch { throw new AppError(503,'EVIDENCE_STORAGE_UNSAFE','Support evidence storage must be separate from public product images.'); }
}
const safeKey=(key:string)=>/^[0-9a-f]{48}\.(jpg|png|webp)$/.test(key);
export async function authorizeSupportCase(actor:SupportActor,id:string) {
  const row=await prisma.supportCase.findFirst({where:{id,...(actor.role==='ADMIN'?{}:{customerId:actor.id})}});
  if(!row)throw new AppError(404,'NOT_FOUND','Support request not found.');return row;
}
const evidenceView=(row:any)=>({id:row.id,mime:row.mime,bytes:row.bytes,caption:row.caption,createdAt:row.createdAt,expiresAt:row.expiresAt});
export async function storeSupportEvidence(actor:SupportActor,caseId:string,declared:string,bytes:unknown,captionInput:unknown) {
  await authorizeSupportCase(actor,caseId);
  if(!EVIDENCE_TYPES.includes(declared))throw new AppError(415,'UNSUPPORTED_IMAGE_TYPE','Attach a JPEG, PNG or WebP photo.');
  if(!Buffer.isBuffer(bytes)||bytes.length===0)throw new AppError(400,'EMPTY_FILE','Choose a photo to attach.');
  if(bytes.length>MAX_EVIDENCE_BYTES)throw new AppError(413,'EVIDENCE_TOO_LARGE','Photos must be at most 2 MB.');
  const caption=captionInput==null?null:typeof captionInput==='string'?captionInput.trim():'';
  if(captionInput!=null&&(!caption||caption.length>300||/[\x00-\x1f\x7f]/.test(caption)))throw new AppError(400,'BAD_EVIDENCE_CAPTION','Use a caption of 1–300 characters.');
  let info;try{info=probeImage(bytes);}catch(e){if(e instanceof ImageError)throw new AppError(e.code==='NOT_AN_IMAGE'?415:400,e.code,e.message);throw e;}
  if(info.mime!==declared)throw new AppError(415,'IMAGE_TYPE_MISMATCH','The photo format does not match its declared type.');
  if(Math.min(info.width,info.height)<100||Math.max(info.width,info.height)>4096)throw new AppError(400,'EVIDENCE_DIMENSIONS','Use a clear photo between 100 and 4096 pixels on each side.');
  const root=supportEvidenceDir(),key=`${randomBytes(24).toString('hex')}.${info.ext}`,full=path.join(root,key);
  await fs.mkdir(root,{recursive:true,mode:0o700});
  await fs.writeFile(full,bytes,{flag:'wx',mode:0o600});
  try {
    const row=await prisma.$transaction(async tx=>{
      await tx.$queryRaw`SELECT "id" FROM "SupportCase" WHERE "id"=${caseId} FOR UPDATE`;
      const c=await tx.supportCase.findFirst({where:{id:caseId,...(actor.role==='ADMIN'?{}:{customerId:actor.id})}});
      if(!c)throw new AppError(404,'NOT_FOUND','Support request not found.');
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext('private-support-storage-quota'))::text`;
      const stored=await tx.supportEvidence.aggregate({_sum:{bytes:true}});
      const configured=Number(process.env.SUPPORT_EVIDENCE_QUOTA_MB??1024),quota=(Number.isFinite(configured)&&configured>0?configured:1024)*1024*1024;
      if((stored._sum.bytes??0)+bytes.length>quota)throw new AppError(507,'EVIDENCE_STORAGE_FULL','Support photo storage is full. Send a text description and contact support.');
      if(await tx.supportEvidence.count({where:{caseId}})>=20)throw new AppError(409,'EVIDENCE_LIMIT','This request already has 20 evidence photos.');
      const row=await tx.supportEvidence.create({data:{caseId,uploadedById:actor.id,storageKey:key,mime:info.mime,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex'),caption,expiresAt:new Date(Date.now()+RETENTION_MS)}});
      await tx.adminAuditLog.create({data:{action:'SUPPORT_EVIDENCE_ATTACHED',targetType:'SUPPORT_CASE',targetId:caseId,summary:`Account ${actor.id} attached private evidence ${row.id}; expires after 90 days.`}});
      return row;
    });return evidenceView(row);
  } catch(e){await fs.unlink(full).catch(()=>undefined);throw e;}
}
export async function readSupportEvidence(actor:SupportActor,caseId:string,evidenceId:string) {
  await authorizeSupportCase(actor,caseId);
  const row=await prisma.supportEvidence.findFirst({where:{id:evidenceId,caseId,expiresAt:{gt:new Date()}}});
  if(!row||!safeKey(row.storageKey))throw new AppError(404,'NOT_FOUND','Evidence is unavailable or its retention period ended.');
  let bytes:Buffer;try{bytes=await fs.readFile(path.join(supportEvidenceDir(),row.storageKey));}catch{throw new AppError(404,'NOT_FOUND','Evidence photo is unavailable.');}
  if(bytes.length!==row.bytes||createHash('sha256').update(bytes).digest('hex')!==row.sha256)throw new AppError(503,'EVIDENCE_INTEGRITY','Evidence photo could not be verified. Contact support.');
  return {mime:row.mime,bytes};
}
/** Bounded retention sweep. Missing files are safe after a crash; retry never extends the retention. */
export async function purgeExpiredSupportEvidence(now=new Date()) {
  const rows=await prisma.supportEvidence.findMany({where:{expiresAt:{lte:now}},orderBy:{expiresAt:'asc'},take:100});
  for(const row of rows){if(safeKey(row.storageKey))await fs.unlink(path.join(supportEvidenceDir(),row.storageKey)).catch((e:NodeJS.ErrnoException)=>{if(e.code!=='ENOENT')throw e;});await prisma.supportEvidence.deleteMany({where:{id:row.id,expiresAt:{lte:now}}});}
  return rows.length;
}
