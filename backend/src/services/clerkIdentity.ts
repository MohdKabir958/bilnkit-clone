import { clerkClient, verifyToken, getAuth } from '@clerk/express';
import { Request } from 'express';
import { Role, Prisma } from '@prisma/client';
import { prisma } from '../db';
import { AppError } from '../utils/appError';
import { synchronizeAdminAccess, VerifiedProviderIdentity, lockAdminDirectory } from './adminAccess';
import { clerkAdmins, clerkParties, nativeClerkRequest, usesClerk } from '../config/authMode';

export interface ProviderUser extends VerifiedProviderIdentity { banned: boolean; }
export interface ProviderSession { id: string; userId: string; status: string; }
export interface ClerkTransport {
  user(id: string): Promise<ProviderUser>;
  session(id: string): Promise<ProviderSession>;
  revoke(id: string): Promise<unknown>;
  deleteUser(id: string): Promise<unknown>;
  usersByEmail?(email: string): Promise<ProviderUser[]>;
}
const live: ClerkTransport = {
  user: id => clerkClient.users.getUser(id), session: id => clerkClient.sessions.getSession(id),
  revoke: id => clerkClient.sessions.revokeSession(id), deleteUser: id => clerkClient.users.deleteUser(id),
  usersByEmail: async email => (await clerkClient.users.getUserList({emailAddress:[email],limit:10})).data,
};
let transport: ClerkTransport = live;
/** Only provider HTTP calls may be faked. JWT verification always uses the official SDK. */
export function setClerkTestTransport(value: ClerkTransport | null) {
  if (process.env.NODE_ENV !== 'test') throw new Error('Clerk test transport is test-only.');
  transport = value ?? live;
}
export const deniedSession = () => new AppError(401, 'INVALID_SESSION', 'Invalid or expired authentication session.');
const unavailable = () => new AppError(503, 'AUTH_UNAVAILABLE', 'Authentication service is temporarily unavailable. Please retry.');

export async function verifiedPartnerIdentity(email: string) {
  if (!transport.usersByEmail) throw unavailable();
  let rows: ProviderUser[];
  try { rows = await transport.usersByEmail(email); } catch { throw unavailable(); }
  const verified = rows.filter(user => !user.banned && user.emailAddresses?.some(address => address.emailAddress.toLowerCase() === email && address.verification?.status === 'verified'));
  if (verified.length !== 1) throw new AppError(409,'PARTNER_ACCOUNT_REQUIRED','Ask this partner to create a Clerk account and verify this email first, or leave the owner blank to set up the store.','ownerEmail');
  return verified[0];
}

export async function verifiedClerkClaims(token: string, origin?: string) {
  let claims;
  try {
    claims = await verifyToken(token, {
      secretKey: process.env.CLERK_SECRET_KEY, jwtKey: process.env.CLERK_JWT_KEY,
      issuer: process.env.CLERK_ISSUER, authorizedParties: nativeClerkRequest(origin) ? undefined : clerkParties(),
      audience: process.env.CLERK_AUDIENCE || undefined, clockSkewInMs: 0,
    });
  } catch { throw deniedSession(); }
  if (typeof claims.sub !== 'string' || !claims.sub.startsWith('user_') || typeof claims.sid !== 'string' || !claims.sid.startsWith('sess_')) throw deniedSession();
  if (claims.iss !== process.env.CLERK_ISSUER) throw deniedSession();
  if (claims.azp ? !clerkParties().includes(claims.azp) : (origin || process.env.CLERK_ALLOW_NATIVE_WITHOUT_AZP !== 'true')) throw deniedSession();
  if (!claims.exp || claims.exp * 1000 <= Date.now()) throw deniedSession();
  return claims;
}

export async function resolveClerkSession(token: string, origin?: string) {
  const claims = await verifiedClerkClaims(token, origin);
  let session: ProviderSession, identity: ProviderUser;
  try { [session, identity] = await Promise.all([transport.session(claims.sid as string), transport.user(claims.sub)]); }
  catch (error) {
    const status = (error as {status?: number}).status;
    if (status === 404 || status === 401) throw deniedSession();
    throw unavailable();
  }
  if (session.id !== claims.sid || session.userId !== claims.sub || identity.id !== claims.sub || session.status !== 'active') throw deniedSession();
  if (identity.banned) throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended. Contact Grozo support.');
  const user = await provisionClerkUser(claims.sub, identity);
  if (user.deletedAt) throw deniedSession();
  const access = await synchronizeAdminAccess(user,identity);
  if (user.role === 'ADMIN' && !access) throw new AppError(403, 'ADMIN_NOT_PROVISIONED', 'Administrator access has not been provisioned.');
  // Database approval is authoritative, independently of token metadata/provider login.
  if (user.role === 'VENDOR') {
    const rows = await prisma.vendor.findMany({where:{userId:user.id},select:{approvalStatus:true}});
    if (rows.some(v => v.approvalStatus === 'SUSPENDED') && !rows.some(v => v.approvalStatus === 'APPROVED')) throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Store access is suspended.');
  }
  if (user.role === 'DRIVER' && (await prisma.driverPartner.findUnique({where:{userId:user.id}}))?.approvalStatus === 'SUSPENDED') throw new AppError(403, 'ACCOUNT_SUSPENDED', 'Delivery partner access is suspended.');
  return {id:user.id, phone:user.phone, role:access ? 'ADMIN' as const : user.role, adminRole:access?.role, exp:claims.exp, sid:claims.sid as string, clerkUserId:claims.sub};
}

/** Serializes first request, webhook, linking and deletion for this subject across instances. */
export const lockClerkSubject = (tx: Prisma.TransactionClient, subject: string) => tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${subject}, 81971))`;
export async function provisionClerkUser(subject: string, identity: ProviderUser) {
  return prisma.$transaction(async tx => {
    await lockClerkSubject(tx, subject);
    const state = await tx.clerkIdentityState.findUnique({where:{clerkUserId:subject}});
    if (state?.deleted || state?.deleteRequested) throw deniedSession();
    if (state?.suspended) throw new AppError(403, 'ACCOUNT_SUSPENDED', 'This account is suspended.');
    const existing = await tx.user.findUnique({where:{clerkUserId:subject}});
    if (existing) return existing;
    const name = [identity.firstName, identity.lastName].filter(Boolean).join(' ').trim().slice(0,60) || 'Grozo customer';
    // Intentionally no email/phone search or auto-claim. Business contact fields remain profile data.
    return tx.user.create({data:{clerkUserId:subject,name,role:Role.STUDENT}});
  });
}

export async function clerkRequestIdentity(req: Request) {
  const raw = req.headers.authorization;
  if (!raw || !/^Bearer \S+$/.test(raw)) throw deniedSession();
  const auth = getAuth(req);
  if (!auth.userId || !auth.sessionId) throw deniedSession();
  const user = await resolveClerkSession(raw.slice(7), req.headers.origin);
  if (user.clerkUserId !== auth.userId || user.sid !== auth.sessionId) throw deniedSession();
  return user;
}

export async function linkClerkIdentity(userId: string, subject: string, operator: string) {
  if (!/^user_[A-Za-z0-9]+$/.test(subject) || !operator.trim()) throw new AppError(400,'INVALID_LINK','Provide an explicit subject and operator audit reference.');
  const identity = await transport.user(subject);
  if (identity.id !== subject || identity.banned) throw deniedSession();
  return prisma.$transaction(async tx => {
    await lockClerkSubject(tx,subject);
    await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId} FOR UPDATE`;
    const user = await tx.user.findUnique({where:{id:userId}});
    const claimed = await tx.user.findUnique({where:{clerkUserId:subject}});
    const state = await tx.clerkIdentityState.findUnique({where:{clerkUserId:subject}});
    if (!user || user.deletedAt || state?.deleted || state?.deleteRequested || state?.suspended) throw new AppError(409,'LINK_CONFLICT','This identity cannot be linked.');
    if ((user.clerkUserId && user.clerkUserId !== subject) || (claimed && claimed.id !== userId)) throw new AppError(409,'LINK_CONFLICT','Identity association conflicts with an existing link.');
    if (user.role === 'ADMIN' && !clerkAdmins().includes(subject)) throw new AppError(403,'ADMIN_NOT_PROVISIONED','Provision this exact admin subject in server configuration first.');
    const linked = await tx.user.update({where:{id:userId},data:{clerkUserId:subject}});
    if (!user.clerkUserId) await tx.adminAuditLog.create({data:{action:'CLERK_IDENTITY_LINKED',targetType:'USER',targetId:userId,summary:`Operator ${operator.slice(0,160)} verified and linked the explicit provider subject.`}});
    return {id:linked.id,clerkUserId:linked.clerkUserId,operator,alreadyLinked:user.clerkUserId===subject};
  });
}
export async function provisionClerkAdmin(subject: string, operator: string) {
  if (!/^user_[A-Za-z0-9]+$/.test(subject) || !clerkAdmins().includes(subject) || !operator.trim()) throw new AppError(403,'ADMIN_NOT_PROVISIONED','Explicit operator provisioning and an allowlisted subject are required.');
  const identity = await transport.user(subject);
  if (identity.id !== subject || identity.banned) throw deniedSession();
  return prisma.$transaction(async tx => {
    await lockAdminDirectory(tx);
    await lockClerkSubject(tx,subject);
    const state = await tx.clerkIdentityState.findUnique({where:{clerkUserId:subject}});
    if (state?.deleted || state?.deleteRequested || state?.suspended) throw deniedSession();
    const existing = await tx.user.findUnique({where:{clerkUserId:subject}});
    if (existing?.deletedAt) throw deniedSession();
    if (existing && !['STUDENT','ADMIN'].includes(existing.role)) throw new AppError(409,'ROLE_CONFLICT','Do not repurpose a partner identity as an administrator.');
    const user = existing ? await tx.user.update({where:{id:existing.id},data:{role:'ADMIN'}}) : await tx.user.create({data:{clerkUserId:subject,name:'Grozo administrator',role:'ADMIN'}});
    await tx.adminAccess.upsert({where:{clerkUserId:subject},create:{userId:user.id,clerkUserId:subject,displayName:user.name,role:'OWNER',status:'ACTIVE',acceptedAt:new Date()},update:{userId:user.id,role:'OWNER',status:'ACTIVE',revokedAt:null,acceptedAt:new Date()}});
    await tx.adminAuditLog.create({data:{action:'CLERK_ADMIN_PROVISIONED',targetType:'USER',targetId:user.id,summary:`Operator ${operator.slice(0,160)} explicitly provisioned an allowlisted administrator.`}});
    return {id:user.id,role:user.role,alreadyProvisioned:existing?.role==='ADMIN'};
  });
}
export async function revokeClerkSession(sid: string) { try { await transport.revoke(sid); } catch { throw unavailable(); } }
export async function requestClerkDeletion(subject: string) {
  await prisma.clerkIdentityState.upsert({where:{clerkUserId:subject},create:{clerkUserId:subject,deleteRequested:true},update:{deleteRequested:true}});
  await retryClerkDeletions();
}
export async function retryClerkDeletions() {
  if (!usesClerk()) return;
  for (const state of await prisma.clerkIdentityState.findMany({where:{deleteRequested:true},take:25})) {
    try { await transport.deleteUser(state.clerkUserId); }
    catch(error) { if ((error as {status?:number}).status !== 404) continue; }
    await prisma.clerkIdentityState.update({where:{clerkUserId:state.clerkUserId},data:{deleted:true,deleteRequested:false}});
  }
}
