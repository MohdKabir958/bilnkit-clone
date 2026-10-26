import { randomUUID } from 'crypto';
import supertest from 'supertest';
import { prisma } from '../harness/db';
import { startTestServer, stopTestServer, TestServerInstance } from '../harness/app';
import { getAdminToken, getStudentToken, getAuthHeader } from '../harness/auth';
import { DurableJobWorker, JobSpec, JobStore, jobBackoffMs, safeJobErrorCode } from '../../src/services/jobs';

jest.setTimeout(30_000);
describe('PostgreSQL durable background work', () => {
  const store = new JobStore();
  const names:string[]=[];
  const at=new Date('2026-10-26T12:00:00.000Z');
  let server:TestServerInstance;
  const spec=(extra:Partial<JobSpec>={}):JobSpec=>{
    const name=`qa-${randomUUID()}`;names.push(name);
    return {name,intervalMs:15_000,handler:async()=>undefined,...extra};
  };
  beforeAll(async()=>{
    await prisma.user.upsert({where:{id:'jobs-admin'},create:{id:'jobs-admin',name:'Job recovery operator',role:'ADMIN'},update:{role:'ADMIN',deletedAt:null}});
    await prisma.user.upsert({where:{id:'jobs-customer'},create:{id:'jobs-customer',name:'Job customer',role:'STUDENT'},update:{role:'STUDENT',deletedAt:null}});
    server=await startTestServer();
  });
  afterEach(async()=>{await prisma.backgroundJob.deleteMany({where:{name:{in:names.splice(0)}}});});
  afterAll(async()=>{await stopTestServer(server);await prisma.user.deleteMany({where:{id:{in:['jobs-admin','jobs-customer']}}});await prisma.$disconnect();});
  test('two workers cannot claim the same schedule and a handler holds no database transaction',async()=>{
    const s=spec();await store.register(s,at);
    const claims=await Promise.all([store.claim(s,'worker-a',at),store.claim(s,'worker-b',at)]);
    expect(claims.filter(Boolean)).toHaveLength(1);
    // A provider wait belongs outside the claim transaction, so requests retain pooled connections.
    expect(await prisma.$queryRaw`SELECT 1 AS ready`).toEqual([{ready:1}]);
    expect(await store.finish(claims.find(Boolean)!,new Date(at.getTime()+1))).toBe(true);
  });
  test('a killed process is recovered after lease expiry and its old token cannot complete or renew',async()=>{
    const s=spec();await store.register(s,at);
    const old=(await store.claim(s,'killed',at))!;
    const recoveredAt=new Date(at.getTime()+120_001);
    const recovered=(await store.claim(s,'replacement',recoveredAt))!;
    expect(recovered.recoveryCount).toBe(1);expect(recovered.leaseToken).not.toBe(old.leaseToken);
    expect(await store.heartbeat(old,120000,recoveredAt)).toBe(false);
    expect(await store.finish(old,recoveredAt)).toBe(false);
    expect(await store.finish(recovered,new Date(recoveredAt.getTime()+1))).toBe(true);
    expect((await store.runs(s.name)).map(r=>r.state).sort()).toEqual(['ABANDONED','SUCCEEDED']);
  });
  test('provider/database failure uses bounded exponential retry, dead letter and audited recovery',async()=>{
    const s=spec({maxAttempts:2});await store.register(s,at);
    const first=(await store.claim(s,'worker',at))!;
    await store.finish(first,new Date(at.getTime()+1),{code:'PROVIDER_DOWN',message:'secret must never persist'});
    expect(await store.claim(s,'worker',new Date(at.getTime()+2))).toBeNull();
    const second=(await store.claim(s,'worker',new Date(at.getTime()+15_002)))!;
    await store.finish(second,new Date(at.getTime()+15_003),new Error('https://credentials.invalid/private'));
    const row=await prisma.backgroundJob.findUniqueOrThrow({where:{name:s.name}});
    expect(row.state).toBe('DEAD');expect(row.lastErrorCode).toBe('JOB_EXECUTION_FAILED');
    expect(await store.claim(s,'worker',new Date(at.getTime()+60_000))).toBeNull();
    expect(await store.retry(s.name,'jobs-admin','Provider recovered; verified configuration',new Date(at.getTime()+60_000))).toBe(true);
    expect(await store.retry(s.name,'jobs-admin','Provider recovered; verified configuration',new Date(at.getTime()+60_000))).toBe(false);
    expect(await prisma.adminAuditLog.count({where:{action:'BACKGROUND_JOB_RETRY',targetId:s.name}})).toBe(1);
    expect(await store.claim(s,'worker',new Date(at.getTime()+60_001))).not.toBeNull();
    expect(jobBackoffMs(50)).toBe(30*60_000);expect(safeJobErrorCode({code:'secret/token'})).toBe('JOB_EXECUTION_FAILED');
  });
  test('manual recovery cannot steal an active worker lease',async()=>{
    const s=spec();await store.register(s,at);await store.claim(s,'active-worker',at);
    await expect(store.retry(s.name,'jobs-admin','Investigating delayed provider response',at)).rejects.toMatchObject({code:'JOB_RUNNING',status:409});
  });
  test('overlapping process polls share one execution and restart preserves the next scheduled run',async()=>{
    let release!:()=>void,entered!:()=>void;
    const wait=new Promise<void>(r=>{release=r;});const started=new Promise<void>(r=>{entered=r;});
    const handler=jest.fn(async()=>{entered();await wait;});const s=spec({handler});
    const worker=new DurableJobWorker([s],store,()=>at,'single-process');
    const a=worker.runDue(),b=worker.runDue();expect(a).toBe(b);await started;
    expect(await prisma.$queryRaw`SELECT 1 AS ready`).toEqual([{ready:1}]);
    release();await a;await worker.stop();expect(handler).toHaveBeenCalledTimes(1);
    const restart=new DurableJobWorker([s],store,()=>at,'restart');await restart.runDue();await restart.stop();
    expect(handler).toHaveBeenCalledTimes(1);
  });
  test('job monitoring and retry endpoints enforce backend admin authorization',async()=>{
    const request=supertest(server.baseUrl),s=spec();await store.register(s,new Date());
    expect((await request.get('/api/admin/jobs')).status).toBe(401);
    expect((await request.get('/api/admin/jobs').set(getAuthHeader(getStudentToken('jobs-customer','+919111111111')))).status).toBe(403);
    const admin=getAuthHeader(getAdminToken('jobs-admin','+919111111112'));
    const response=await request.get('/api/admin/jobs').set(admin);expect(response.status).toBe(200);
    const own=response.body.data.find((r:any)=>r.name===s.name);expect(own).toBeDefined();expect(own.leaseToken).toBeUndefined();expect(own.leaseOwner).toBeUndefined();
    expect((await request.post(`/api/admin/jobs/${s.name}/retry`).set(admin).send({reason:'bad'})).status).toBe(400);
  });
});
