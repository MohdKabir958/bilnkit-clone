import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root=fileURLToPath(new URL('../../',import.meta.url)),backend=path.join(root,'backend'),require=createRequire(path.join(backend,'package.json'));
const {PrismaClient}=require('@prisma/client');const values=require('dotenv').parse(readFileSync(path.join(backend,'.env')));
const u=new URL(values.DATABASE_URL);if(!['localhost','127.0.0.1'].includes(u.hostname))throw Error('Only local demo setup is permitted.');
const dbname=`grozo_client_${Date.now()}_demo`,admin=new URL(u);admin.pathname='/postgres';u.pathname='/'+dbname;
const db=new PrismaClient({datasources:{db:{url:admin.toString()}}});try{await db.$executeRawUnsafe(`CREATE DATABASE "${dbname}" WITH ENCODING 'UTF8' TEMPLATE template0 LC_COLLATE 'C.UTF-8' LC_CTYPE 'C.UTF-8'`);}finally{await db.$disconnect();}
const env={...process.env,...values,NODE_ENV:'development',DATABASE_URL:u.toString(),DEMO_SEED:'1',PORT:'5001',PUBLIC_BASE_URL:'http://127.0.0.1:5001',ADMIN_URL:'http://localhost:3001',UPLOAD_DIR:path.join(backend,'var/client-demo/uploads'),DEMO_CREDENTIAL_FILE:path.join(backend,'var/client-demo/accounts-'+dbname+'.json')};
mkdirSync(path.join(backend,'var/client-demo'),{recursive:true});writeFileSync(path.join(backend,'var/client-demo/runtime.json'),JSON.stringify(env),{mode:0o600});
for(const args of [['scripts/migrate.mjs'],['scripts/seed-demo.mjs']]){const r=spawnSync(process.execPath,args,{cwd:backend,env,stdio:'inherit'});if(r.status!==0)process.exit(r.status||1);}
console.log('Demo database prepared. Start server with private runtime settings in backend/var/client-demo/runtime.json.');
