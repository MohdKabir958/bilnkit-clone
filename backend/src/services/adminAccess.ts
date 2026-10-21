import { Prisma, User } from '@prisma/client';
import { prisma } from '../db';
import { clerkAdmins } from '../config/authMode';
import { AppError } from '../utils/appError';

export type AdminTeamRole = 'OWNER' | 'ADMIN';
export interface VerifiedProviderIdentity {
  id: string;
  firstName?: string | null;
  lastName?: string | null;
  emailAddresses?: { id?: string; emailAddress: string; verification?: { status: string } | null }[];
}
export const normalizeAdminEmail = (raw: unknown): string => {
  if (typeof raw !== 'string' || raw.trim().length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim())) {
    throw new AppError(400, 'INVALID_EMAIL', 'Enter a valid email address.', 'email');
  }
  return raw.trim().toLowerCase();
};
export const lockAdminDirectory = (tx: Prisma.TransactionClient) => tx.$executeRaw`SELECT pg_advisory_xact_lock(81971, 714)`;
const verifiedEmails = (identity: VerifiedProviderIdentity) => (identity.emailAddresses ?? [])
  .filter(email => email.verification?.status === 'verified')
  .map(email => normalizeAdminEmail(email.emailAddress));

/** Bind explicit email grants only after provider verification. Never claim existing business records by email. */
export async function synchronizeAdminAccess(user: User, identity: VerifiedProviderIdentity) {
  const emails = verifiedEmails(identity);
  const known = await prisma.adminAccess.findFirst({where:{OR:[{userId:user.id},{clerkUserId:identity.id}]}});
  if (known) return known.status === 'ACTIVE' && known.userId === user.id && known.clerkUserId === identity.id && user.role === 'ADMIN' ? known : null;
  if (user.role !== 'ADMIN' && (!emails.length || !await prisma.adminAccess.findFirst({where:{email:{in:emails},status:'INVITED',userId:null,clerkUserId:null}}))) return null;
  return prisma.$transaction(async tx => {
    await lockAdminDirectory(tx);
    const linked = await tx.adminAccess.findFirst({where:{OR:[{userId:user.id},{clerkUserId:identity.id}]}});
    if (linked) return linked.status === 'ACTIVE' && linked.userId === user.id && linked.clerkUserId === identity.id && user.role === 'ADMIN' ? linked : null;
    const invitation = emails.length ? await tx.adminAccess.findFirst({where:{email:{in:emails},status:'INVITED',userId:null,clerkUserId:null}}) : null;
    if (invitation) {
      if (!['STUDENT','ADMIN'].includes(user.role)) throw new AppError(409,'PARTNER_ROLE_CONFLICT','Use a separate administrator identity; a store or delivery partner account cannot become an administrator.');
      // Same subject lock as deletion/linking; directory lock serializes concurrent accept/revoke.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${identity.id}, 81971))`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${user.id} FOR UPDATE`;
      const fresh = await tx.user.findUnique({where:{id:user.id}});
      const state = await tx.clerkIdentityState.findUnique({where:{clerkUserId:identity.id}});
      if (!fresh || fresh.deletedAt || state?.deleted || state?.suspended || state?.deleteRequested) throw new AppError(403,'ACCOUNT_UNAVAILABLE','This account cannot accept administrator access.');
      if (!['STUDENT','ADMIN'].includes(fresh.role)) throw new AppError(409,'PARTNER_ROLE_CONFLICT','Use a separate administrator identity; a store or delivery partner account cannot become an administrator.');
      await tx.user.update({where:{id:user.id},data:{role:'ADMIN'}});
      const grant = await tx.adminAccess.update({where:{id:invitation.id},data:{status:'ACTIVE',userId:user.id,clerkUserId:identity.id,displayName:user.name,acceptedAt:new Date()}});
      await tx.adminAuditLog.create({data:{action:'ADMIN_ACCESS_ACCEPTED',targetType:'USER',targetId:user.id,summary:`Verified Clerk identity accepted an explicit ${grant.role} invitation.`}});
      return grant;
    }
    // First owner/recovery only: an already provisioned ADMIN plus operator-controlled Clerk subject.
    // Revoked/linked rows above never fall through to bootstrap.
    if (user.role === 'ADMIN' && clerkAdmins().includes(identity.id)) {
      const email = emails[0];
      const reserved = email ? await tx.adminAccess.findUnique({where:{email}}) : null;
      const owner = await tx.adminAccess.create({data:{userId:user.id,clerkUserId:identity.id,email:reserved ? null : email,displayName:user.name,role:'OWNER',status:'ACTIVE',acceptedAt:new Date()}});
      await tx.adminAuditLog.create({data:{action:'ADMIN_OWNER_BOOTSTRAPPED',targetType:'USER',targetId:user.id,summary:'An explicitly provisioned bootstrap identity established owner access.'}});
      return owner;
    }
    return null;
  });
}

const teamRole = (raw: unknown): AdminTeamRole => {
  if (raw !== 'OWNER' && raw !== 'ADMIN') throw new AppError(400,'INVALID_ROLE','Choose Owner or Administrator.','role');
  return raw;
};
const audit = (tx: Prisma.TransactionClient, actorId: string, action: string, id: string, role: string) => tx.adminAuditLog.create({data:{action,targetType:'ADMIN_ACCESS',targetId:id,summary:`Operator ${actorId} ${action.toLowerCase().replace(/_/g,' ')} (${role}).`}});
const assertOwner = async (tx: Prisma.TransactionClient, actorId: string) => {
  const actor = await tx.adminAccess.findUnique({where:{userId:actorId},include:{user:true}});
  if (actor?.role !== 'OWNER' || actor.status !== 'ACTIVE' || actor.user?.role !== 'ADMIN' || actor.user.deletedAt) throw new AppError(403,'OWNER_REQUIRED','Only an active owner can manage administrator access.');
};
export const publicAdminAccess = (row: any) => ({id:row.id,email:row.email,displayName:row.displayName,role:row.role,status:row.status,createdAt:row.createdAt,acceptedAt:row.acceptedAt,isCurrentUser:false});

export async function inviteAdmin(actorId: string, rawEmail: unknown, rawRole: unknown) {
  const email = normalizeAdminEmail(rawEmail), role = teamRole(rawRole ?? 'ADMIN');
  return prisma.$transaction(async tx => {
    await lockAdminDirectory(tx);
    await assertOwner(tx,actorId);
    const existing = await tx.adminAccess.findUnique({where:{email}});
    if (existing && existing.status !== 'REVOKED') throw new AppError(409,'ALREADY_INVITED','This email already has access or is waiting to sign in.');
    // Re-inviting a revoked identity requires the new explicit owner action; old UUID ownership is retained.
    const row = existing
      ? await tx.adminAccess.update({where:{id:existing.id},data:{role,status:'INVITED',userId:null,clerkUserId:null,displayName:null,acceptedAt:null,revokedAt:null,invitedById:actorId}})
      : await tx.adminAccess.create({data:{email,role,status:'INVITED',invitedById:actorId}});
    await audit(tx,actorId,'ADMIN_ACCESS_INVITED',row.id,role);
    return row;
  });
}

export async function changeAdminAccess(actorId: string, memberId: string, rawRole?: unknown, revoke = false) {
  const role = revoke ? undefined : teamRole(rawRole);
  return prisma.$transaction(async tx => {
    await lockAdminDirectory(tx);
    await assertOwner(tx,actorId);
    const row = await tx.adminAccess.findUnique({where:{id:memberId}});
    if (!row || row.status === 'REVOKED') throw new AppError(404,'NOT_FOUND','Team member not found.');
    if (row.role === 'OWNER' && row.status === 'ACTIVE' && (revoke || role !== 'OWNER')) {
      if (await tx.adminAccess.count({where:{role:'OWNER',status:'ACTIVE',user:{role:'ADMIN',deletedAt:null}}}) <= 1) throw new AppError(409,'LAST_OWNER','Add another active owner before removing the last owner.');
    }
    if (revoke && row.userId) {
      await tx.user.updateMany({where:{id:row.userId,role:'ADMIN'},data:{role:'STUDENT',tokenVersion:{increment:1}}});
    }
    const changed = await tx.adminAccess.update({where:{id:row.id},data:revoke?{status:'REVOKED',revokedAt:new Date()}:{role}});
    await audit(tx,actorId,revoke?'ADMIN_ACCESS_REVOKED':'ADMIN_ACCESS_ROLE_CHANGED',row.id,changed.role);
    return changed;
  });
}

/** Keep audit/identity tombstones, remove directory contact data under the account deletion policy. */
export const anonymizeAdminAccess = (tx:Prisma.TransactionClient,userId:string) => tx.adminAccess.updateMany({where:{userId},data:{email:null,displayName:null,status:'REVOKED',revokedAt:new Date()}});
