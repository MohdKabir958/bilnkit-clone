import {createHash,randomBytes} from 'crypto';
import {Prisma} from '@prisma/client';
import {prisma} from '../db';
import {AppError} from '../utils/appError';
import {normalizeAdminEmail} from './adminAccess';
import {clerkAdmins} from '../config/authMode';
import {exactOrigin} from '../config/deploymentContract';
import {verifiedPartnerIdentity} from './clerkIdentity';

type Db=Prisma.TransactionClient|typeof prisma;
const invitationFields={id:true,email:true,state:true,expiresAt:true,createdAt:true,redeemedAt:true,completedAt:true,revokedAt:true} as const;
export const invitationDigest=(token:unknown)=>{
  if(typeof token!=='string'||!/^[a-f0-9]{64}$/.test(token))throw new AppError(400,'INVALID_INVITATION','Use the complete invitation link.','token');
  return createHash('sha256').update(token).digest('hex');
};
export const activeRiderInvitation=(row:{state:string;expiresAt:Date},now=new Date())=>['PENDING','VERIFIED'].includes(row.state)&&row.expiresAt>now;

/** Shared by preflight, invitation verification and final linking; final linking also holds the identity lock. */
export async function eligibleRiderAccount(db:Db,subject:string,email:string) {
  const user=await db.user.findUnique({where:{clerkUserId:subject}}),state=await db.clerkIdentityState.findUnique({where:{clerkUserId:subject}});
  if(!user)throw new AppError(409,'GROZO_SIGNIN_REQUIRED','The partner must sign in to Grozo. Create an onboarding invitation to verify their account.','email');
  if(user.deletedAt||!['STUDENT','DRIVER'].includes(user.role)||state?.deleted||state?.suspended||state?.deleteRequested||clerkAdmins().includes(subject))throw new AppError(409,'RIDER_UNAVAILABLE','Use a separate eligible partner account.','email');
  const stores=await db.vendor.count({where:{userId:user.id}});
  const administrator=await db.adminAccess.count({where:{OR:[{clerkUserId:subject},{email}],status:{in:['ACTIVE','INVITED']}}});
  if(stores||administrator)throw new AppError(409,'RIDER_UNAVAILABLE','An administrator or store owner cannot be repurposed as a rider.','email');
  const rider=await db.driverPartner.findUnique({where:{userId:user.id}});
  if(rider)throw new AppError(409,'RIDER_EXISTS','This partner already has an application. Review it in Applications.','email',{applicationId:rider.id});
  if(await db.order.count({where:{customerId:user.id}}))throw new AppError(409,'CUSTOMER_HISTORY_CONFLICT','This account has customer orders. Ask the partner to use a separate rider account.','email');
  return user;
}
export async function checkRiderEligibility(rawEmail:unknown) {
  const email=normalizeAdminEmail(rawEmail),identity=await verifiedPartnerIdentity(email,'email');
  await eligibleRiderAccount(prisma,identity.id,email);
  return {eligible:true,email};
}
export async function createRiderInvitation(actorId:string,input:{email?:unknown;consentConfirmed?:unknown}) {
  const email=normalizeAdminEmail(input.email);
  if(input.consentConfirmed!==true)throw new AppError(400,'CONSENT_REQUIRED','Confirm the partner agreed to receive an onboarding invitation.','consentConfirmed');
  let origin:string;try{origin=exactOrigin(process.env.ADMIN_URL||'','ADMIN_URL');}catch{throw new AppError(503,'INVITATIONS_UNAVAILABLE','Configure the trusted ADMIN_URL before creating an invitation link.');}
  const token=randomBytes(32).toString('hex'),now=new Date(),expiresAt=new Date(now.getTime()+72*3600000);
  const row=await prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${email}, 91972))`;
    if(await tx.riderInvitation.findFirst({where:{email,state:{in:['PENDING','VERIFIED']},expiresAt:{gt:now}}}))throw new AppError(409,'INVITATION_PENDING','An active invitation already exists. Review or revoke it before creating another.','email');
    const invite=await tx.riderInvitation.create({data:{email,tokenHash:invitationDigest(token),expiresAt,createdById:actorId},select:invitationFields});
    await tx.adminAuditLog.create({data:{action:'RIDER_INVITATION_CREATED',targetType:'RIDER_INVITATION',targetId:invite.id,summary:`Operator ${actorId} recorded consent and a 72-hour onboarding invitation. Manual delivery only; no email sent.`}});
    return invite;
  });
  return {...row,inviteUrl:`${origin}/partner-invite#invite=${token}`,delivery:{mode:'MANUAL',sent:false}};
}
export const listRiderInvitations=()=>prisma.riderInvitation.findMany({orderBy:{createdAt:'desc'},take:50,select:invitationFields});
export async function revokeRiderInvitation(actorId:string,id:string) {
  return prisma.$transaction(async tx=>{
    await tx.$queryRaw`SELECT id FROM "RiderInvitation" WHERE id=${id} FOR UPDATE`;
    const row=await tx.riderInvitation.findUnique({where:{id}});
    if(!row)throw new AppError(404,'NOT_FOUND','Invitation not found.');
    if(row.state==='COMPLETED')throw new AppError(409,'INVITATION_COMPLETED','Review the existing rider application instead of revoking a completed invitation.');
    if(row.state==='REVOKED')return {revoked:true};
    await tx.riderInvitation.update({where:{id},data:{state:'REVOKED',revokedAt:new Date()}});
    await tx.adminAuditLog.create({data:{action:'RIDER_INVITATION_REVOKED',targetType:'RIDER_INVITATION',targetId:id,summary:`Operator ${actorId} revoked an onboarding link without changing any account or rider approval.`}});
    return {revoked:true};
  });
}
export async function redeemRiderInvitation(subject:string,rawToken:unknown) {
  const hash=invitationDigest(rawToken),candidate=await prisma.riderInvitation.findUnique({where:{tokenHash:hash}});
  if(!candidate)throw new AppError(404,'INVALID_INVITATION','This invitation is unavailable. Ask the operator for a new link.');
  if(!activeRiderInvitation(candidate))throw new AppError(410,'INVITATION_EXPIRED','This invitation expired or was revoked. Ask the operator for a new link.');
  const identity=await verifiedPartnerIdentity(candidate.email,'email');
  if(identity.id!==subject)throw new AppError(403,'INVITATION_ACCOUNT_MISMATCH','Sign in with the verified email this invitation was issued to.');
  return prisma.$transaction(async tx=>{
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${subject},81971))`;
    await tx.$queryRaw`SELECT id FROM "RiderInvitation" WHERE id=${candidate.id} FOR UPDATE`;
    const row=await tx.riderInvitation.findUniqueOrThrow({where:{id:candidate.id}});
    if(!activeRiderInvitation(row))throw new AppError(410,'INVITATION_EXPIRED','This invitation expired or was revoked. Ask the operator for a new link.');
    if(row.state==='VERIFIED'){
      if(row.acceptedBySubject!==subject)throw new AppError(403,'INVITATION_ACCOUNT_MISMATCH','This invitation cannot be used by this account.');
      return {verified:true,alreadyVerified:true,approvalGranted:false};
    }
    await eligibleRiderAccount(tx,subject,row.email);
    await tx.riderInvitation.update({where:{id:row.id},data:{state:'VERIFIED',acceptedBySubject:subject,redeemedAt:new Date()}});
    await tx.adminAuditLog.create({data:{action:'RIDER_INVITATION_VERIFIED',targetType:'RIDER_INVITATION',targetId:row.id,summary:'Verified intended Clerk identity redeemed a one-time onboarding link. No role or rider approval granted.'}});
    return {verified:true,alreadyVerified:false,approvalGranted:false};
  });
}
