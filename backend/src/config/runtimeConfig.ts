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
  const missing = REQUIRED_CONFIG.filter((key) => !(paymentsDisabled && key.startsWith('RAZORPAY_')) && blank(key));
  if (missing.length > 0) throw new Error(`Missing required configuration: ${missing.join(', ')}`);
  if (env.NODE_ENV === 'production') {
    if ((env.JWT_SECRET?.length ?? 0) < 32 || (env.ADMIN_PASSCODE?.length ?? 0) < 20) throw new Error('Production requires a JWT_SECRET of at least 32 characters and an ADMIN_PASSCODE of at least 20.');
    for (const key of ['ADMIN_URL', 'PUBLIC_BASE_URL']) {
      let url: URL; try {url = new URL(env[key] ?? '');} catch {throw new Error(`${key} must be a configured HTTPS URL.`);}
      if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error(`${key} must be an HTTPS origin.`);
    }
    if (env.CLIENT_URL && !/^https:\/\/[^/]+$/.test(env.CLIENT_URL)) throw new Error('CLIENT_URL must be an HTTPS origin.');
    if (!env.UPLOAD_DIR) throw new Error('UPLOAD_DIR must point to persistent image storage.');
  }
  const warnings: string[] = [];
  if (paymentsDisabled) warnings.push('Payments are DISABLED for local development. Checkout cannot charge or capture money.');
  for (const key of RECOMMENDED_CONFIG) {
    if (blank(key)) warnings.push(`${key} is not set: customer Google sign-in will answer 503 until it is configured.`);
  }
  return { warnings };
};
