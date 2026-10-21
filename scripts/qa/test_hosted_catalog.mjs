// Exercise the exact operator SQL in a fresh local DB; never accepts a remote URL.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('../../',import.meta.url));
const require=createRequire(root+'backend/package.json');
const {PrismaClient}=require('@prisma/client');
const dotenv=require('dotenv');
const local=dotenv.parse(readFileSync(root+'backend/.env'));
const base=new URL(local.DATABASE_URL);
if(!['127.0.0.1','localhost'].includes(base.hostname))throw Error('Only a local QA database is allowed.');
const name=`grozo_catalog_${Date.now()}_test`;
const adminUrl=new URL(base);adminUrl.pathname='/postgres';
const admin=new PrismaClient({datasources:{db:{url:adminUrl.toString()}}});
const target=new URL(base);target.pathname='/'+name;
const checks=[];
let db,globalDb;
try {
  await admin.$executeRawUnsafe(`CREATE DATABASE "${name}" WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'`);
  const migration=spawnSync(process.execPath,['scripts/migrate.mjs'],{cwd:root+'backend',env:{...process.env,NODE_ENV:'test',DATABASE_URL:target.toString()},encoding:'utf8'});
  assert.equal(migration.status,0,'Local migrations must succeed.');checks.push('all migrations applied to fresh local database');
  db=new PrismaClient({datasources:{db:{url:target.toString()}}});
  const sentinel=await db.user.create({data:{id:'qa-existing-account',name:'Synthetic existing account',role:'STUDENT',clerkUserId:'user_SyntheticSeedIsolation',kraveoCoins:123,tokenVersion:7}});
  const sql=readFileSync(root+'Docs/demo/seed-hosted-catalog.sql','utf8').match(/DO \$grozo_seed\$[\s\S]*?\$grozo_seed\$;/)[0];
  await db.$executeRawUnsafe(sql);
  assert.equal(await db.vendor.count(),2);assert.equal(await db.menuItem.count(),24);checks.push('exactly two stores and 24 products inserted');
  assert.equal(await db.stockMovement.count(),22);checks.push('initial inventory movements recorded for 22 in-stock products; zero-stock packs add no movement');
  assert.deepEqual(await db.user.findUnique({where:{id:sentinel.id}}),sentinel);assert.equal(await db.user.count(),1);checks.push('existing account, Clerk identity, role and balance preserved; no new accounts');
  const first=await db.menuItem.findFirstOrThrow({orderBy:{id:'asc'}});
  await db.menuItem.update({where:{id:first.id},data:{stockQty:{decrement:1},stockVersion:{increment:1}}});
  await db.stockMovement.create({data:{menuItemId:first.id,delta:-1,kind:'ADJUSTMENT',reason:'Synthetic test count',reference:'qa-count-change'}});
  await db.$executeRawUnsafe(sql);
  assert.equal((await db.menuItem.findUniqueOrThrow({where:{id:first.id}})).stockQty,first.stockQty-1);
  assert.equal(await db.stockMovement.count(),23);assert.equal(await db.menuItem.count(),24);checks.push('repeat seed preserves changed stock and creates no duplicate products or movements');
  process.env.DATABASE_URL=target.toString();process.env.NODE_ENV='test';process.env.AUTH_MODE='legacy';
  const {deliveryEligibility}=require(root+'backend/dist/services/geography.js');
  const config=JSON.parse(readFileSync(root+'demo/scenario.json'));
  for(const a of config.addresses)for(const id of ['gzhostdemo-blr-store-1','gzhostdemo-blr-store-2']) {
    const point=config.points[a.point];await deliveryEligibility(db,{cityId:'gzhostdemo-blr-city',lat:point.lat,lng:point.lng},id);
  }
  checks.push('all four store/address combinations pass real serviceability');
  const express=require('express'),supertest=require('supertest');
  const {apiRouter}=require(root+'backend/dist/routes/api.js');
  globalDb=require(root+'backend/dist/db.js').prisma;
  const app=express();app.use(express.json());app.use('/api',apiRouter);
  const listing=await supertest(app).get('/api/vendors');assert.equal(listing.status,200);
  const rows=listing.body.data||listing.body;assert.equal(rows.length,2);
  const details=await supertest(app).get('/api/vendors/gzhostdemo-blr-store-1');assert.equal(details.status,200);
  const store=details.body.data||details.body;assert.equal(store.menuItems.length,12);
  assert.ok(store.menuItems.every(p=>p.imageUrl.startsWith('https://raw.githubusercontent.com/')));
  checks.push('real public customer discovery and store detail return both stores and product images');
  assert.equal(await db.order.count(),0);checks.push('no orders or payment activity created');
  await db.vendor.update({where:{id:'gzhostdemo-blr-store-1'},data:{userId:sentinel.id}});
  await assert.rejects(()=>db.$executeRawUnsafe(sql));checks.push('ownership collision refuses reseeding rather than changing association');
  const result={database:name,host:base.hostname,checks,passed:checks.length,failed:0,remoteDatabaseModified:false};
  mkdirSync(root+'Docs/qa/hosted-demo-catalog',{recursive:true});
  writeFileSync(root+'Docs/qa/hosted-demo-catalog/local-verification.json',JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result,null,2));
} finally {
  await globalDb?.$disconnect();await db?.$disconnect();
  await admin.$executeRawUnsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`);
  await admin.$disconnect();
}
