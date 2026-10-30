import test from 'node:test';
import assert from 'node:assert/strict';
import { postgresEnvironment, validateRestoreTarget } from '../database_recovery.mjs';

test('PostgreSQL credentials enter child environment and never command arguments', () => {
  const { env } = postgresEnvironment('postgresql://synthetic:p%40ssword@127.0.0.1:5433/fixture_test?sslmode=disable');
  assert.equal(env.PGUSER, 'synthetic'); assert.equal(env.PGPASSWORD, 'p@ssword');
  assert.equal(env.PGDATABASE, 'fixture_test'); assert.equal(env.PGPORT, '5433');
});
test('restore cannot target an existing application database or its own backup source', () => {
  assert.throws(() => validateRestoreTarget('postgresql://localhost/market'), /isolated/);
  assert.throws(() => validateRestoreTarget('postgresql://localhost/safe_restore_test', 'postgresql://localhost/safe_restore_test'), /different/);
  assert.equal(validateRestoreTarget('postgresql://localhost/new_restore_test').env.PGDATABASE, 'new_restore_test');
});
test('remote backup/restore requires TLS and invalid URLs are never echoed', () => {
  for (const url of ['postgresql://user:private-password@db.example.test/database?sslmode=disable', 'https://user:private-password@db.example.test/database', 'not-a-private-password']) {
    assert.throws(() => postgresEnvironment(url), error => !String(error).includes('private-password'));
  }
  assert.equal(postgresEnvironment('postgresql://user:fixture@db.example.test/database?sslmode=require').env.PGSSLMODE, 'require');
});
