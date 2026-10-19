import { assertRuntimeConfig } from '../../src/config/runtimeConfig';

const local = { NODE_ENV: 'development', JWT_SECRET: 'local-only', ADMIN_PASSCODE: 'local-only', DATABASE_URL: 'postgresql://localhost/test', PAYMENT_PROVIDER: 'disabled' };

describe('explicit local payment disablement', () => {
  test('starts non-payment development features with an explicit warning', () => {
    expect(assertRuntimeConfig(local).warnings).toContainEqual(expect.stringContaining('Payments are DISABLED'));
  });
  test.each(['production', 'staging', 'test', undefined])('cannot disable required provider configuration in %s', (NODE_ENV) => {
    expect(() => assertRuntimeConfig({ ...local, NODE_ENV })).toThrow('allowed only');
  });
  test('still requires local authentication and database configuration', () => {
    expect(() => assertRuntimeConfig({ ...local, JWT_SECRET: '' })).toThrow('JWT_SECRET');
  });
  test('never silently accepts an unknown provider', () => {
    expect(() => assertRuntimeConfig({ ...local, PAYMENT_PROVIDER: 'unknown' })).toThrow('Unsupported');
  });
  test('requires gateway credentials by default', () => {
    expect(() => assertRuntimeConfig({ ...local, PAYMENT_PROVIDER: undefined })).toThrow('RAZORPAY_KEY');
  });
});
