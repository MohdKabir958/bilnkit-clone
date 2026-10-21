#!/usr/bin/env node
// Fresh local database per invocation, no destructive reuse and no production access.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {readFileSync,mkdirSync,openSync,closeSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import {spawn} from 'node:child_process';
import path from 'node:path';
import os from 'node:os';
const root=fileURLToPath(new URL('../../',import.meta.url)),backend=path.join(root,'backend'),require=createRequire(path.join(backend,'package.json'));
const {PrismaClient}=require('@prisma/client'),dotenv=require('dotenv');
const settings=dotenv.parse(readFileSync(path.join(backend,'.env'))),base=new URL(process.env.QA_DATABASE_URL||settings.DATABASE_URL||'');
if(!['localhost','127.0.0.1'].includes(base.hostname))throw Error('Full regression runner accepts only local PostgreSQL.');
const name=`grozo_final_${Date.now()}_test`,target=new URL(base);target.pathname='/'+name;
const admin=new URL(base);admin.pathname='/postgres';
const evidence=path.join(root,'Docs/qa');mkdirSync(evidence,{recursive:true});
const lock=path.join(root,'backend/var/full-regression.lock');mkdirSync(path.dirname(lock),{recursive:true});const handle=openSync(lock,'wx');
const log=path.join(evidence,'backend-full-run.log');writeFileSync(log,'Grozo complete backend regression\nFresh isolated database: '+name+'\n');
const env={...process.env,NODE_ENV:'test',TZ:'UTC',DATABASE_URL:target.toString(),JWT_SECRET:'local-final-regression-jwt-fixture-only-2026',ADMIN_PASSCODE:'local-final-regression-admin-fixture',PAYMENT_PROVIDER:'razorpay',RAZORPAY_KEY_ID:'rzp_test_local_simulator',RAZORPAY_KEY_SECRET:'local-simulator-hmac-fixture-not-a-gateway-credential',RAZORPAY_WEBHOOK_SECRET:'local-simulator-webhook-fixture-not-a-gateway-credential',FORCE_COLOR:'0'};
for(const k of ['FIREBASE_KEY_PATH','FIREBASE_SERVICE_ACCOUNT','MAPS_PROVIDER_TOKEN','RAZORPAY_PRODUCTION_KEY_ID'])delete env[k];
const run=(args)=>new Promise((resolve,reject)=>{const child=spawn(process.execPath,args,{cwd:backend,env,stdio:['ignore','pipe','pipe']});for(const stream of [child.stdout,child.stderr])stream.on('data',chunk=>appendFileSync(log,chunk));child.on('error',reject);child.on('close',code=>resolve(code??1));});
let exit=1,postgresVersion='unknown';
try{
 const db=new PrismaClient({datasources:{db:{url:admin.toString()}}});try{postgresVersion=(await db.$queryRawUnsafe("SELECT version() AS version"))[0].version;await db.$executeRawUnsafe(`CREATE DATABASE "${name}" WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'`);}finally{await db.$disconnect();}
 if(await run(['scripts/migrate.mjs'])!==0)throw Error('Migration prerequisites failed.');
 const start=Date.now();const output=path.join(evidence,'backend-full-run.json');
 // One Jest invocation: all suites, unchanged default --runInBand behavior.
 exit=await run(['node_modules/jest/bin/jest.js','--runInBand','--json',`--outputFile=${output}`]);
 const duration=Date.now()-start,result=JSON.parse(readFileSync(output,'utf8'));
 const summary={database:name,databaseHost:base.hostname,node:process.version,platform:os.platform(),architecture:os.arch(),postgres:postgresVersion,command:'node node_modules/jest/bin/jest.js --runInBand --json --outputFile=../Docs/qa/backend-full-run.json',invocations:1,passed:result.numPassedTests,failed:result.numFailedTests,skipped:result.numPendingTests,total:result.numTotalTests,suites:result.numTotalTestSuites,durationMs:duration,exitCode:exit,startedAt:new Date(start).toISOString(),finishedAt:new Date().toISOString()};
 writeFileSync(path.join(evidence,'backend-full-run-summary.json'),JSON.stringify(summary,null,2)+'\n');appendFileSync(log,'\nFINAL RESULT\n'+JSON.stringify(summary,null,2)+'\n');console.log(JSON.stringify(summary));
}catch(e){appendFileSync(log,'\nRUNNER ERROR: '+e.message+'\n');console.error(e.message);exit=1;}
finally{closeSync(handle);unlinkSync(lock);}
process.exitCode=exit;
