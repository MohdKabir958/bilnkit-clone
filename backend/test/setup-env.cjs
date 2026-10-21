// Historical lifecycle fixtures explicitly create v1 orders; deployed servers default to v2-only creation.
process.env.LEGACY_CHECKOUT_ENABLED='true';
// Explicit, non-secret fixtures for the local payment simulator and real HMAC tests.
// Loaded only by Jest, before services read their environment. Never used by the API entrypoint.
if (process.env.NODE_ENV !== 'test') throw new Error('Test fixtures must only run in test mode.');
if (!process.env.DATABASE_URL || !new URL(process.env.DATABASE_URL).pathname.endsWith('_test')) {
  throw new Error('DATABASE_URL must name a disposable database ending in _test; tests delete records.');
}
process.env.RAZORPAY_KEY_ID ||= 'rzp_test_local_simulator';
process.env.JWT_SECRET ||= 'local-jwt-fixture-for-jest-only';
process.env.RAZORPAY_KEY_SECRET ||= 'local-simulator-hmac-fixture-not-a-gateway-credential';
process.env.RAZORPAY_WEBHOOK_SECRET ||= 'local-simulator-webhook-fixture-not-a-gateway-credential';
// Prevent dotenv from importing a developer's disabled mode; NODE_ENV=test still selects the simulator.
process.env.PAYMENT_PROVIDER = 'razorpay';
