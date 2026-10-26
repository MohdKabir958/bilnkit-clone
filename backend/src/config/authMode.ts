import { RequestHandler } from 'express';

export type AuthMode = 'legacy' | 'clerk-test' | 'clerk';
export function authMode(env: NodeJS.ProcessEnv = process.env): AuthMode {
  const value = env.AUTH_MODE || 'legacy';
  if (!['legacy', 'clerk-test', 'clerk'].includes(value)) throw new Error('Unsupported AUTH_MODE.');
  if (value === 'clerk-test' && !['development', 'test'].includes(env.NODE_ENV || '')) {
    throw new Error('AUTH_MODE=clerk-test requires an isolated development/test environment.');
  }
  return value as AuthMode;
}
export const usesClerk = () => authMode() !== 'legacy';
export const legacyAuthOnly: RequestHandler = (_req, res, next) => {
  if (usesClerk()) return void res.status(410).json({ success: false, code: 'LEGACY_AUTH_DISABLED', message: 'Use Clerk to sign in.' });
  next();
};
export const clerkOnly: RequestHandler = (_req, res, next) => {
  if (!usesClerk()) return void res.status(404).json({ success: false, message: 'Not found.' });
  next();
};
export const clerkParties = () => (process.env.CLERK_AUTHORIZED_PARTIES || '').split(',').map(v => v.trim()).filter(Boolean).map(value => {
  // azp is an origin. Normalize a harmless trailing slash without accepting paths or wildcards.
  try { const url = new URL(value); return !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash && !url.hostname.includes('*') && ['https:', 'http:'].includes(url.protocol) ? url.origin : value; } catch { return value; }
});
export const clerkAdmins = () => (process.env.CLERK_ADMIN_USER_IDS || '').split(',').map(v => v.trim()).filter(Boolean);
export const nativeClerkRequest = (origin?: string) => !origin && process.env.CLERK_ALLOW_NATIVE_WITHOUT_AZP === 'true';
