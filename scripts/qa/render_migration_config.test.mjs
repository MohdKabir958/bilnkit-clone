import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const script=new URL('../../backend/scripts/migrate-hosted.mjs',import.meta.url).pathname;
// Substitute the child process, not database credentials or validation. No DB is contacted.
const preload=`import child from 'node:child_process';import {syncBuiltinESMExports} from 'node:module';child.spawnSync=(exe,args,options)=>{console.log('CHILD_FIXTURE:'+JSON.stringify({args,database:options.env.DATABASE_URL}));return {status:Number(process.env.CHILD_FIXTURE_EXIT||0)};};syncBuiltinESMExports();`;
function run(values={}) {
 const env={...process.env,DATABASE_URL:'',MIGRATION_DATABASE_URL:'',...values};
 return spawnSync(process.execPath,['--import','data:text/javascript,'+encodeURIComponent(preload),script],{env,encoding:'utf8'});
}
test('direct migration connection wins over the pooled runtime URL without logging credentials',()=>{
 const direct='postgresql://synthetic:private-fixture@direct.example.test/test?sslmode=require';
 const result=run({DATABASE_URL:'postgresql://synthetic:other-fixture@pool.example.test/test',MIGRATION_DATABASE_URL:direct});
 assert.equal(result.status,0,result.stderr);
 const lines=result.stdout.split('\n');const child=JSON.parse(lines.find(l=>l.startsWith('CHILD_FIXTURE:')).slice(14));
 assert.equal(child.database,direct);assert.deepEqual(child.args,['scripts/migrate.mjs']);
 const applicationLog=lines.filter(l=>!l.startsWith('CHILD_FIXTURE:')).join('\n');
 assert.ok(applicationLog.includes('MIGRATION_DATABASE_URL, host direct.example.test'));
 assert.ok(!applicationLog.includes('private-fixture'));assert.ok(!applicationLog.includes('postgresql://'));
});
test('runtime URL is used only when no direct URL is configured',()=>{
 const result=run({DATABASE_URL:'postgresql://synthetic:fixture@pool.example.test/test'});
 assert.equal(result.status,0);assert.ok(result.stdout.includes('DATABASE_URL, host pool.example.test'));
});
test('missing, malformed and non-PostgreSQL settings stop before migration without exposing values',()=>{
 for (const value of ['', 'not-a-url-private-fixture','https://wrong.example.test/test']) {
  const result=run({DATABASE_URL:value});assert.equal(result.status,1);
  assert.ok(result.stderr.includes('DATABASE_URL must be a complete postgresql://'));
  assert.ok(!result.stdout.includes('CHILD_FIXTURE:'));assert.ok(!result.stderr.includes('private-fixture'));
 }
 const result=run({DATABASE_URL:'postgresql://synthetic:fixture@pool.example.test/test',MIGRATION_DATABASE_URL:'bad-direct-private-fixture'});
 assert.equal(result.status,1);assert.ok(result.stderr.startsWith('MIGRATION_DATABASE_URL'));
 assert.ok(!result.stdout.includes('CHILD_FIXTURE:'));assert.ok(!result.stderr.includes('private-fixture'));
});
test('migration failure propagates rather than starting a healthy-looking API',()=>{
 const result=run({DATABASE_URL:'postgresql://synthetic:fixture@pool.example.test/test',CHILD_FIXTURE_EXIT:'7'});
 assert.equal(result.status,7);
});
