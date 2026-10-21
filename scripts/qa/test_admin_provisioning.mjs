// Tests only a new local disposable database. No hosted access.
import assert from 'node:assert/strict';import fs from 'node:fs';import{createRequire}from'node:module';import{spawnSync}from'node:child_process';
import{fileURLToPath}from'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url)),require=createRequire(root+'/backend/package.json'),{PrismaClient}=require('@prisma/client');
const values=require('dotenv').parse(fs.readFileSync(root+'/backend/.env'));const base=new URL(values.DATABASE_URL);
assert.ok(['localhost','127.0.0.1'].includes(base.hostname));const name=`grozo_admin_bootstrap_${Date.now()}_test`;
const adminUrl=new URL(base);adminUrl.pathname='/postgres';const target=new URL(base);target.pathname='/'+name;
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}});let db;const checks=[];
try{await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'`);
const migration=spawnSync(process.execPath,['scripts/migrate.mjs'],{cwd:root+'/backend',env:{...process.env,DATABASE_URL:target.toString(),NODE_ENV:'test'},encoding:'utf8'});assert.equal(migration.status,0);
db=new PrismaClient({datasources:{db:{url:target.toString()}}});const sql=fs.readFileSync(root+'/Docs/clerk/provision-existing-admin.sql','utf8').match(/DO \$grozo_admin\$[\s\S]*?\$grozo_admin\$;/)[0];
const run=subject=>db.$transaction(async tx=>{await tx.$queryRaw`SELECT set_config('grozo.approved_admin_id',${subject},true)`;await tx.$executeRawUnsafe(sql);});
const user=await db.user.create({data:{name:'Synthetic approved operator',clerkUserId:'user_ApprovedOperator',kraveoCoins:123,tokenVersion:7}});
await run(user.clerkUserId);const promoted=await db.user.findUniqueOrThrow({where:{id:user.id}});assert.equal(promoted.role,'ADMIN');assert.equal(promoted.kraveoCoins,123);assert.equal(promoted.tokenVersion,7);assert.equal(await db.adminAuditLog.count(),1);checks.push('only exact linked account promoted with UUID, balance and tokenVersion preserved and audit recorded');
await run(user.clerkUserId);assert.equal(await db.adminAuditLog.count(),1);checks.push('idempotent rerun creates no duplicate audit');
await assert.rejects(()=>run('user_Unknown'));checks.push('missing identity refused');
await assert.rejects(()=>run('PASTE_EXACT_CLERK_USER_ID'));checks.push('unchanged placeholder refused');
for(const role of ['VENDOR','DRIVER']){const u=await db.user.create({data:{name:'Synthetic partner',role,clerkUserId:'user_'+role}});await assert.rejects(()=>run(u.clerkUserId));assert.equal((await db.user.findUniqueOrThrow({where:{id:u.id}})).role,role);checks.push(role+' identity preserved and refused');}
for(const field of ['deleted','suspended','deleteRequested']){const subject='user_Blocked'+field;await db.user.create({data:{name:'Synthetic blocked identity',clerkUserId:subject}});await db.clerkIdentityState.create({data:{clerkUserId:subject,[field]:true}});await assert.rejects(()=>run(subject));checks.push(field+' identity refused');}
assert.equal(await db.order.count(),0);assert.equal(await db.adminAuditLog.count(),1);
const result={database:name,checks,passed:checks.length,failed:0,remoteDatabaseModified:false};fs.writeFileSync(root+'/Docs/qa/admin-sql-provisioning.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}finally{await db?.$disconnect();await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);await admin.$disconnect();}
