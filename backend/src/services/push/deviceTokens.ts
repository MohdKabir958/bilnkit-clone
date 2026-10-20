import { randomUUID } from 'crypto';
import { AppError } from '../../utils/appError';
import { prisma } from '../../db';
import { PushApp } from './types';

export const MAX_ACTIVE_TOKENS_PER_USER = 10;

const APP_OF_ROLE: Record<string, PushApp> = { STUDENT: 'CUSTOMER', VENDOR: 'VENDOR', DRIVER: 'DRIVER' };
/** The app a role may register for (ADMIN has none). */
export const appForRole = (role: string): PushApp | null => APP_OF_ROLE[role] ?? null;

export type RegisterInput = { userId: string; token: string; app: PushApp; platform: string; appVersion: string | null };

/**
 * Upsert by token. A token is permanently bound to its owner. Shared phones rotate FCM tokens when accounts change.
 * A user keeps at most MAX_ACTIVE_TOKENS_PER_USER active tokens: the least recently seen ones are disabled.
 */
export const registerDeviceToken = async (input: RegisterInput): Promise<void> => {
  const now = new Date();
  const saved=await prisma.$queryRaw<{id:string}[]>`INSERT INTO "DeviceToken" (id,"userId",token,app,platform,"appVersion","lastSeenAt") VALUES (${randomUUID()},${input.userId},${input.token},${input.app},${input.platform},${input.appVersion},${now}) ON CONFLICT(token) DO UPDATE SET app=EXCLUDED.app,platform=EXCLUDED.platform,"appVersion"=EXCLUDED."appVersion","lastSeenAt"=EXCLUDED."lastSeenAt","disabledAt"=NULL,"disabledReason"=NULL WHERE "DeviceToken"."userId"=EXCLUDED."userId" RETURNING id`;
  if(!saved.length)throw new AppError(409,'DEVICE_TOKEN_OWNED','This device token belongs to a different account. Refresh the device token before signing in again.');
  const active = await prisma.deviceToken.findMany({
    where: { userId: input.userId, disabledAt: null },
    orderBy: [{ lastSeenAt: 'desc' }, { createdAt: 'desc' }],
    select: { id: true, token: true },
  });
  const excess = active.filter((t) => t.token !== input.token).slice(MAX_ACTIVE_TOKENS_PER_USER - 1);
  if (excess.length > 0) {
    await prisma.deviceToken.updateMany({ where: { id: { in: excess.map((t) => t.id) }, disabledAt: null }, data: { disabledAt: now, disabledReason: 'LIMIT' } });
  }
};

/** Logout: only the owner can switch a token off; an unknown token (or somebody else's) is a quiet success. */
export const removeDeviceToken = async (userId: string, token: string): Promise<void> => {
  await prisma.deviceToken.updateMany({ where: { userId, token, disabledAt: null }, data: { disabledAt: new Date(), disabledReason: 'LOGOUT' } });
};

/** Account deleted, partner suspended / rejected: no more pushes to any device of this user. Never throws. */
export const disableUserTokens = async (userId: string, reason: string): Promise<void> => {
  try {
    await prisma.deviceToken.updateMany({ where: { userId, disabledAt: null }, data: { disabledAt: new Date(), disabledReason: reason.slice(0, 40) } });
  } catch (err) {
    console.error('could not disable device tokens:', (err as Error)?.name ?? 'error');
  }
};

/** FCM said the token is dead (UNREGISTERED, ...): off at once, reason = the FCM code. */
export const disableToken = async (token: string, reason: string): Promise<void> => {
  await prisma.deviceToken.updateMany({ where: { token, disabledAt: null }, data: { disabledAt: new Date(), disabledReason: reason.slice(0, 40) } });
};

export const activeTokensFor = (userId: string, app: PushApp) =>
  prisma.deviceToken.findMany({ where: { userId, app, disabledAt: null }, select: { token: true }, orderBy: { lastSeenAt: 'desc' } });
