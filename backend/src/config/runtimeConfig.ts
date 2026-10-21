import { authMode } from './authMode';
/**
 * Boot-time configuration check. Pure (takes the env as an argument) so it can be tested.
 * Hard requirements stop the server from starting; soft ones are returned as warnings.
 * Runs whenever NODE_ENV is not 'test' (a staging box or a mistyped NODE_ENV must not start with an empty JWT secret).
 */
export const REQUIRED_CONFIG = ['JWT_SECRET', 'DATABASE_URL', 'ADMIN_PASSCODE', 'RAZORPAY_KEY_ID', 'RAZORPAY_KEY_SECRET', 'RAZORPAY_WEBHOOK_SECRET'] as const;
export const RECOMMENDED_CONFIG = ['GOOGLE_WEB_CLIENT_ID'] as const;

export const assertRuntimeConfig = (env: Record<string, string | undefined>): { warnings: string[] } => {
  const blank = (k: string) => !env[k] || !String(env[k]).trim();
  // A local server can develop non-payment features without invented gateway credentials.
  // Every deployed environment still requires the real provider configuration.
  const paymentsDisabled = env.PAYMENT_PROVIDER === 'disabled';
  if (paymentsDisabled && env.NODE_ENV !== 'development') {
    throw new Error('PAYMENT_PROVIDER=disabled is allowed only with NODE_ENV=development.');
  }
  if (env.PAYMENT_PROVIDER && !['disabled', 'razorpay'].includes(env.PAYMENT_PROVIDER)) {
    throw new Error('Unsupported PAYMENT_PROVIDER. Use razorpay, or disabled for local development.');
  }
  const mode = authMode(env);
  const required = mode === 'legacy' ? [...REQUIRED_CONFIG] : [...REQUIRED_CONFIG.filter(key => !['JWT_SECRET','ADMIN_PASSCODE'].includes(key)), 'CLERK_PUBLISHABLE_KEY','CLERK_SECRET_KEY','CLERK_WEBHOOK_SIGNING_SECRET','CLERK_ISSUER','CLERK_AUTHORIZED_PARTIES','DELIVERY_PROOF_SECRET'];
  const missing = required.filter(key => !(paymentsDisabled && key.startsWith('RAZORPAY_')) && blank(key));
  if (mode !== 'legacy') {
    const prefix = mode === 'clerk-test' ? 'pk_test_' : env.NODE_ENV === 'production' ? 'pk_live_' : 'pk_';
    if (!env.CLERK_PUBLISHABLE_KEY?.startsWith(prefix)) throw new Error('Clerk instance does not match the configured environment.');
    if (mode === 'clerk-test' && !env.CLERK_SECRET_KEY?.startsWith('sk_test_')) throw new Error('Clerk test mode requires a development instance.');
    if (env.NODE_ENV === 'production' && !env.CLERK_SECRET_KEY?.startsWith('sk_live_')) throw new Error('Production Clerk mode requires production credentials.');
    if (!env.CLERK_ISSUER?.startsWith('https://')) throw new Error('CLERK_ISSUER must be HTTPS.');
    if ((env.DELIVERY_PROOF_SECRET?.length ?? 0) < 32) throw new Error('DELIVERY_PROOF_SECRET must contain at least 32 characters.');
  }
  if (missing.length > 0) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  if (env.NODE_ENV === 'production') {
    if (mode === 'legacy' && ((env.JWT_SECRET?.length ?? 0) < 32 || (env.ADMIN_PASSCODE?.length ?? 0) < 20)) throw new Error('Production requires a JWT_SECRET of at least 32 characters and an ADMIN_PASSCODE of at least 20.');
    for (const key of ['ADMIN_URL', 'PUBLIC_BASE_URL']) {
      let url: URL; try {url = new URL(env[key] ?? '');} catch {throw new Error(`${key} must be a configured HTTPS URL.`);}
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`${key} must be an HTTPS origin.`);
    }
    if (env.CLIENT_URL && !/^https:\/\/[^/]+$/.test(env.CLIENT_URL)) throw new Error('CLIENT_URL must be an HTTPS origin.');
    if (!env.UPLOAD_DIR) throw new Error('UPLOAD_DIR must point to persistent image storage.');
  }
  const warnings: string[] = [];
  if (paymentsDisabled) warnings.push('Payments are DISABLED for local development. Checkout cannot charge or capture money.');
  for (const key of mode === 'legacy' ? RECOMMENDED_CONFIG : []) {
    if (blank(key)) warnings.push(`${key} is not set: customer Google sign-in will answer 503 until it is configured.`);
  }
  return { warnings };
};
