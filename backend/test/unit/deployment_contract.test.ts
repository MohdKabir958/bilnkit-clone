import express from 'express';
import request from 'supertest';
import { clientCompatibility, clerkFrontendOrigin, exactOrigin, publicDeploymentContract } from '../../src/config/deploymentContract';
import { databaseConfiguration } from '../../src/config/databaseConfig';
import { clientContractMiddleware } from '../../src/middleware/clientContract';
import { assertRuntimeConfig } from '../../src/config/runtimeConfig';

const key = (host = 'fixture.clerk.accounts.dev', live = false) => `pk_${live ? 'live' : 'test'}_${Buffer.from(`${host}$`).toString('base64')}`;
const clerk = { NODE_ENV: 'development', AUTH_MODE: 'clerk-test', CLERK_PUBLISHABLE_KEY: key(), CLERK_SECRET_KEY: 'sk_test_synthetic_configuration_fixture', CLERK_ISSUER: 'https://fixture.clerk.accounts.dev', CLERK_AUTHORIZED_PARTIES: 'https://admin.example.test/', CLERK_WEBHOOK_SIGNING_SECRET: 'whsec_synthetic_fixture', DELIVERY_PROOF_SECRET: 'synthetic-independent-delivery-proof-fixture', DATABASE_URL: 'postgresql://localhost/grozo_test', PAYMENT_PROVIDER: 'disabled' };

describe('public deployment compatibility (not authentication)', () => {
  test('only a public Clerk frontend domain can be decoded', () => {
    expect(clerkFrontendOrigin(key())).toBe('https://fixture.clerk.accounts.dev');
    for (const value of [undefined, 'sk_test_private', 'pk_test_!', key('invalid/path'), key('name:password@host')]) expect(clerkFrontendOrigin(value)).toBeNull();
  });
  test('diagnostics contain no credentials, personal identifiers or database URLs', () => {
    const contract = publicDeploymentContract({ ...clerk, CLERK_ADMIN_USER_IDS: 'private-owner-identity', DATABASE_URL: 'postgresql://private:password@localhost/grozo_test' });
    const rendered = JSON.stringify(contract);
    expect(contract.auth).toEqual({ mode: 'clerk-test', provider: 'clerk', instance: 'https://fixture.clerk.accounts.dev', keyEnvironment: 'development' });
    for (const secret of ['sk_test_', 'whsec_', 'private-owner-identity', 'postgresql:', 'password']) expect(rendered).not.toContain(secret);
  });
  test('legacy compatibility stays opt-in until coordinated cutover', () => {
    expect(clientCompatibility({}, clerk).compatible).toBe(true);
    expect(clientCompatibility({}, { ...clerk, REQUIRE_CLIENT_CONTRACT: 'true' }).compatible).toBe(false);
    expect(clientCompatibility({ mode: 'legacy', protocol: '1' }, clerk).compatible).toBe(false);
    expect(clientCompatibility({ mode: 'clerk-test', protocol: '1' }, { ...clerk, AUTH_MODE: 'legacy' }).compatible).toBe(false);
  });
  test('Clerk instance and protocol mismatch are deployment errors', () => {
    expect(clientCompatibility({ mode: 'clerk-test', protocol: '1', clerkInstance: clerk.CLERK_ISSUER }, clerk).compatible).toBe(true);
    for (const input of [{ mode: 'unknown', protocol: '1' }, { mode: 'clerk', protocol: '2' }, { mode: 'clerk-test', protocol: '1', clerkInstance: 'https://other.clerk.accounts.dev' }, { mode: 'clerk-test', protocol: '1', clerkInstance: 'https://fixture.clerk.accounts.dev/path' }]) expect(clientCompatibility(input, clerk).compatible).toBe(false);
    expect(clientCompatibility({ mode: 'clerk-test', protocol: '1' }, { ...clerk, AUTH_MODE: 'clerk', CLERK_PUBLISHABLE_KEY: key('prod.example.test', true) }).compatible).toBe(false);
    expect(clientCompatibility({ mode: 'clerk', protocol: '1' }, { ...clerk, REQUIRE_CLIENT_CONTRACT: 'true' }).compatible).toBe(false);
  });
  test('exact origins permit harmless trailing slash but no wildcard/path/credential', () => {
    expect(exactOrigin('https://admin.example.test/', 'origin')).toBe('https://admin.example.test');
    expect(exactOrigin('http://localhost:5173', 'origin', true)).toBe('http://localhost:5173');
    for (const origin of ['https://*.example.test', 'https://admin.example.test/path', 'https://user:password@admin.example.test', 'http://admin.example.test', 'https://admin.example.test?next=x']) expect(() => exactOrigin(origin, 'origin', true)).toThrow();
  });
  test('startup rejects a different issuer and mixed key environments', () => {
    expect(() => assertRuntimeConfig(clerk)).not.toThrow();
    expect(() => assertRuntimeConfig({ ...clerk, CLERK_ISSUER: 'https://other.clerk.accounts.dev' })).toThrow('must match');
    expect(() => assertRuntimeConfig({ ...clerk, CLERK_SECRET_KEY: 'sk_live_synthetic_fixture' })).toThrow();
  });
  test('409 does not become a redirect, token issuance, or successful authorized operation', async () => {
    const previous = process.env.AUTH_MODE;
    try {
      process.env.AUTH_MODE = 'legacy';
      const app = express().use(clientContractMiddleware);
      const handler = jest.fn((_req, res) => res.json({ success: true }));
      app.get('/private', handler);
      const response = await request(app).get('/private').set('X-Grozo-Auth-Mode', 'clerk-test').set('X-Grozo-Client-Protocol', '1');
      expect(response.status).toBe(409);
      expect(response.body.code).toBe('DEPLOYMENT_MISMATCH');
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.headers.location).toBeUndefined();
      expect(response.body.token).toBeUndefined();
      expect(handler).not.toHaveBeenCalled();
    } finally { if (previous === undefined) delete process.env.AUTH_MODE; else process.env.AUTH_MODE = previous; }
  });
  test('contract enforcement never breaks independently signed provider webhooks', async () => {
    const previous = process.env.REQUIRE_CLIENT_CONTRACT;
    try {
      process.env.REQUIRE_CLIENT_CONTRACT = 'true';
      const app = express().use(clientContractMiddleware);
      app.post(['/webhooks/clerk', '/payments/webhook'], (_req, res) => res.status(401).json({ code: 'SIGNATURE_REQUIRED' }));
      expect((await request(app).post('/webhooks/clerk')).body.code).toBe('SIGNATURE_REQUIRED');
      expect((await request(app).post('/payments/webhook')).body.code).toBe('SIGNATURE_REQUIRED');
    } finally { if (previous === undefined) delete process.env.REQUIRE_CLIENT_CONTRACT; else process.env.REQUIRE_CLIENT_CONTRACT = previous; }
  });
});

describe('Neon runtime/migration configuration', () => {
  const runtime = 'postgresql://fixture:synthetic@ep-demo-pooler.example.neon.tech/grozo?sslmode=require&connection_limit=5&pool_timeout=10';
  const direct = runtime.replace('-pooler.', '.');
  const env = { NODE_ENV: 'production', DATABASE_URL: runtime, MIGRATION_DATABASE_URL: direct };
  test('pooled runtime and matching direct TLS migration are supported', () => expect(databaseConfiguration(env)).toMatchObject({ provider: 'neon', pooled: true, tlsRequired: true, connectionLimit: 5, directMigrationsConfigured: true }));
  test.each([
    { DATABASE_URL: runtime.replace('sslmode=require', 'sslmode=disable') },
    { MIGRATION_DATABASE_URL: runtime },
    { MIGRATION_DATABASE_URL: undefined },
    { MIGRATION_DATABASE_URL: direct.replace('/grozo?', '/other?') },
    { MIGRATION_DATABASE_URL: direct.replace('ep-demo.', 'ep-other.') },
    { DATABASE_URL: runtime.replace('connection_limit=5', 'connection_limit=100') },
    { DATABASE_URL: runtime.replace('pool_timeout=10', 'pool_timeout=0') },
  ])('rejects unsafe or unrelated configuration %j', (bad) => expect(() => databaseConfiguration({ ...env, ...bad })).toThrow());
  test('invalid URLs never appear in validation messages', () => {
    try { databaseConfiguration({ DATABASE_URL: 'https://private:password@host/secret' }); throw Error('should fail'); }
    catch (error) { expect(String(error)).not.toContain('password'); expect(String(error)).toContain('PostgreSQL'); }
  });
});
