// Manual, isolated simulation only. No startup hook, production access or auth bypass.
import 'dotenv/config';
import {PrismaClient} from '@prisma/client';
import {readFileSync,writeFileSync,mkdirSync,existsSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {validateScenario,installDemoImages,createDemoScenario} from '../dist/demo/scenario.js';
const root=fileURLToPath(new URL('../../',import.meta.url));
if(process.env.NODE_ENV!=='development'||process.env.DEMO_SEED!=='1')throw Error('Requires NODE_ENV=development DEMO_SEED=1.');
const u=new URL(process.env.DATABASE_URL??'');
if(!['localhost','127.0.0.1'].includes(u.hostname)||!/^\/grozo_[a-z0-9_]+_demo$/.test(u.pathname))throw Error('Use a dedicated local grozo_*_demo database, never production or the existing pilot database.');
const output=path.resolve(process.env.DEMO_CREDENTIAL_FILE||'var/demo-credentials.json');
if(existsSync(output))throw Error('Credential file exists; no accounts or stock changed.');
const config=validateScenario(JSON.parse(readFileSync(process.env.DEMO_SCENARIO_FILE||path.join(root,'demo/scenario.json'),'utf8')));
const db=new PrismaClient();
try{
 if(await db.user.count()||await db.city.count()||await db.order.count())throw Error('Demo seed requires an empty migrated database.');
 const images=installDemoImages(root,path.resolve(process.env.UPLOAD_DIR||'var/uploads'),process.env.PUBLIC_BASE_URL||'http://127.0.0.1:5001');
 const result=await createDemoScenario(db,config,images);
 mkdirSync(path.dirname(output),{recursive:true,mode:0o700});writeFileSync(output,JSON.stringify({simulationOnly:true,...result},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(`Isolated synthetic demo: ${result.storeIds.length} stores, ${result.storeIds.length*config.products.length} products, ${result.addressIds.length} addresses, ${result.riderIds.length} approved offline riders. Every store/address pair passed real serviceability. Credentials are in the private output file.`);
}finally{await db.$disconnect();}
