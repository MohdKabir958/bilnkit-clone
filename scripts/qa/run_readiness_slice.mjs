import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync,appendFileSync,existsSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
// Dedicated local database per invocation. This runner never reuses or deletes a live database.
const root=fileURLToPath(new URL('../../',import.meta.url)),backend=path.join(root,'backend');
const require=createRequire(path.join(backend,'package.json'));
const {PrismaClient}=require('@prisma/client'),dotenv=require('dotenv');
const [label='compliance-payout',connections='3',repeatArg='1',...testArgs]=process.argv.slice(2);
if(!testArgs.length)testArgs.push('test/e2e/compliance_payout_readiness.test.ts');
if(testArgs.some(arg=>!/^test\/(?:e2e|unit)\/[a-z0-9_]+\.test\.ts$/.test(arg)))throw Error('Use explicit backend e2e/unit test paths only.');
if(!/^[a-z0-9-]+$/.test(label))throw Error('Invalid evidence label');
if(!/^[1-8]$/.test(connections))throw Error('Use 1–8 local test connections');
if(!/^\d+$/.test(repeatArg)||Number(repeatArg)<1||Number(repeatArg)>50)throw Error('Use 1–50 test repetitions');
const envPath=path.join(backend,'.env');
const saved=existsSync(envPath)?dotenv.parse(readFileSync(envPath)):{};
let base;
try{base=new URL(process.env.QA_DATABASE_URL||process.env.DATABASE_URL||saved.DATABASE_URL||'');}
catch{throw Error('Configure a local PostgreSQL DATABASE_URL for isolated regression.');}
if(!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Only local disposable DBs permitted');
const admin=new URL(base);admin.pathname='/postgres';
const target=new URL(base),database=`grozo_readiness_${Date.now()}_test`;
target.pathname='/'+database;target.searchParams.set('connection_limit',connections);target.searchParams.set('pool_timeout','1');
const evidence=path.join(root,'Docs/production-readiness/evidence/slices',label);mkdirSync(evidence,{recursive:true});
const env={...process.env,NODE_ENV:'test',AUTH_MODE:'legacy',LEGACY_CHECKOUT_ENABLED:'true',TZ:'UTC',DATABASE_URL:target.toString(),JWT_SECRET:'local-pricing-fixture-jwt-not-production',ADMIN_PASSCODE:'local-pricing-fixture-passcode',PAYMENT_PROVIDER:'razorpay',RAZORPAY_KEY_ID:'rzp_test_local_simulator',RAZORPAY_KEY_SECRET:'local-simulator-hmac-fixture-not-a-gateway-credential',RAZORPAY_WEBHOOK_SECRET:'local-simulator-webhook-fixture-not-a-gateway-credential',FORCE_COLOR:'0'};
for(const k of ['FIREBASE_KEY_PATH','FIREBASE_SERVICE_ACCOUNT','MAPS_PROVIDER_TOKEN'])delete env[k];
const run=(args,log)=>new Promise((resolve,reject)=>{writeFileSync(log,'');const child=spawn(process.execPath,args,{cwd:backend,env,stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',c=>appendFileSync(log,c));child.on('error',reject);child.on('close',code=>resolve(code??1));});
let postgresVersion='unknown';
const db=new PrismaClient({datasources:{db:{url:admin.toString()}}});
try{postgresVersion=(await db.$queryRawUnsafe('SELECT version() AS version'))[0].version;await db.$executeRawUnsafe(`CREATE DATABASE "${database}" WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'`);}finally{await db.$disconnect();}
if(await run(['scripts/migrate.mjs'],path.join(evidence,'migrations.txt'))!==0)throw Error('Migration failed');
const results=[];
for(let round=1;round<=Number(repeatArg);round++){
 const output=path.join(evidence,`run-${round}.json`),start=Date.now();
 const exitCode=await run(['node_modules/jest/bin/jest.js','--runInBand','--json',`--outputFile=${output}`,...testArgs],path.join(evidence,`run-${round}.txt`));
 const report=JSON.parse(readFileSync(output,'utf8'));
 results.push({round,exitCode,durationMs:Date.now()-start,passed:report.numPassedTests,failed:report.numFailedTests,skipped:report.numPendingTests});
 console.log(JSON.stringify(results.at(-1)));
 if(exitCode!==0)break;
}
writeFileSync(path.join(evidence,'summary.json'),JSON.stringify({database,node:process.version,platform:os.platform(),architecture:os.arch(),postgres:postgresVersion,connectionLimit:Number(connections),poolTimeoutSeconds:1,command:['node',...process.argv.slice(1)],results},null,2)+'\n');
if(results.some(r=>r.exitCode!==0))process.exitCode=1;
