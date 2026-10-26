import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { runtimeReadiness } from '../../src/services/readinessDiagnostic';
import { redactLog, structuredLog } from '../../src/utils/logger';

describe('release readiness and safe diagnostics', () => {
  let directory: string;
  beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), 'grozo-readiness-')); });
  afterEach(async () => { await fs.rm(directory, { recursive: true, force: true }); });
  test('release schema probes and private storage write are required together', async () => {
    const query = jest.fn().mockResolvedValue([{ unfinished: 0n }]);
    const UPLOAD_DIR = path.join(directory, 'public'), SUPPORT_EVIDENCE_DIR = path.join(directory, 'private');
    expect(await runtimeReadiness({ $queryRaw: query } as any, { UPLOAD_DIR, SUPPORT_EVIDENCE_DIR })).toEqual({ ready: true, schemaReady: true, uploadWritable: true });
    expect(query.mock.calls.length).toBeGreaterThanOrEqual(8);
    expect(await fs.readdir(UPLOAD_DIR)).toEqual([]);
    expect(await fs.readdir(SUPPORT_EVIDENCE_DIR)).toEqual([]);
  });
  test('private evidence cannot overlap public images, including through parent symlinks', async () => {
    const UPLOAD_DIR = path.join(directory, 'public');
    await fs.mkdir(UPLOAD_DIR);
    const link = path.join(directory, 'alias'); await fs.symlink(UPLOAD_DIR, link);
    const query = jest.fn().mockResolvedValue([{ unfinished: 0n }]);
    for (const SUPPORT_EVIDENCE_DIR of [UPLOAD_DIR, path.join(UPLOAD_DIR, 'private'), path.join(link, 'private')]) {
      await expect(runtimeReadiness({ $queryRaw: query } as any, { UPLOAD_DIR, SUPPORT_EVIDENCE_DIR })).rejects.toMatchObject({ code: 'UPLOAD_UNAVAILABLE' });
    }
  });
  test('a reachable empty or unfinished database does not pass readiness', async () => {
    for (const query of [jest.fn().mockRejectedValue(Error('private database credentials')), jest.fn().mockResolvedValue([{ unfinished: 1n }])]) {
      await expect(runtimeReadiness({ $queryRaw: query } as any, { UPLOAD_DIR: directory })).rejects.toMatchObject({ code: 'SCHEMA_NOT_READY' });
    }
  });
  test('a symlink or file cannot impersonate persistent upload storage', async () => {
    const file = path.join(directory, 'file'); await fs.writeFile(file, 'file');
    const link = path.join(directory, 'link'); await fs.symlink(directory, link);
    const query = jest.fn().mockResolvedValue([{ unfinished: 0n }]);
    for (const UPLOAD_DIR of [file, link]) await expect(runtimeReadiness({ $queryRaw: query } as any, { UPLOAD_DIR })).rejects.toMatchObject({ code: 'UPLOAD_UNAVAILABLE' });
  });
  test('database URLs, bearer tokens, private identity and Prisma query arguments are redacted', () => {
    const rendered = structuredLog('error', ['Connection postgresql://owner:sensitive-password@ep.example.test/db failed', { email: 'person@example.test', latitude: 20, token: 'sensitive-token', nested: ['postgres://owner:private@localhost/db'] }]);
    for (const secret of ['sensitive-password', 'sensitive-token', 'person@example.test', 'owner:private']) expect(rendered).not.toContain(secret);
    expect(rendered).toContain('[redacted]');
    expect(redactLog('Invalid `prisma.user.create()` invocation: private arguments')).toBe('[redacted database error]');
  });
});
