import { AppError } from '../utils/appError';

/** Configuration readiness is not a live gateway health check. Provider outages still fail closed at payment start. */
export const paymentCapabilities = (cityCodEnabled = false) => {
  const disabled = process.env.PAYMENT_PROVIDER === 'disabled';
  const key = process.env.RAZORPAY_KEY_ID?.trim() ?? '';
  const secret = process.env.RAZORPAY_KEY_SECRET?.trim() ?? '';
  const webhook = process.env.RAZORPAY_WEBHOOK_SECRET?.trim() ?? '';
  const configured = !disabled && !!key && !!secret && !!webhook;
  const testMode = key.startsWith('rzp_test_');
  // A staging test gateway must never be represented as accepting real production money.
  const productionMismatch = process.env.NODE_ENV === 'production' && testMode;
  const onlineAvailable = configured && !productionMismatch;
  const methods: ('ONLINE' | 'COD')[] = [];
  if (onlineAvailable) methods.push('ONLINE');
  if (cityCodEnabled) methods.push('COD');
  return {
    currency: 'INR', paymentMethods: methods,
    online: { available: onlineAvailable, mode: onlineAvailable ? (testMode ? 'TEST' : 'LIVE') : 'UNAVAILABLE',
      reason: disabled ? 'PAYMENTS_DISABLED' : productionMismatch ? 'PAYMENT_ENVIRONMENT_MISMATCH' : !configured ? 'PAYMENT_NOT_CONFIGURED' : null },
    cash: { available: cityCodEnabled, reason: cityCodEnabled ? null : 'COD_NOT_ENABLED' },
    message: onlineAvailable ? (testMode ? 'Online payment uses the test gateway. No real money is collected.' : null)
      : cityCodEnabled ? 'Online payment is unavailable. Cash on delivery is available.' : 'Payment is unavailable for this store. Please try again later.',
  };
};

export const requirePaymentMethod = (method: 'ONLINE' | 'COD', cityCodEnabled = false) => {
  const capabilities = paymentCapabilities(cityCodEnabled);
  if (!capabilities.paymentMethods.includes(method)) throw new AppError(503,
    method === 'COD' ? 'COD_UNAVAILABLE' : 'ONLINE_PAYMENT_UNAVAILABLE',
    method === 'COD' ? 'Cash on delivery is not enabled for this city.' : 'Online payment is unavailable. Refresh checkout to see available methods.',
    undefined, { paymentCapabilities: capabilities });
  return capabilities;
};
