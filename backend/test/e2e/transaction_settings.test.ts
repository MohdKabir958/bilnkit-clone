import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

// A real one-connection pool reproduces the checkout starvation: while a
// transaction owns that connection, settings must use it rather than queue
// another global-client query. The child gets an isolated Prisma singleton.
test('transaction settings remain available with a single database connection', async () => {
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.set('connection_limit', '1');
  url.searchParams.set('pool_timeout', '1');
  const program = `
    const {prisma}=require('./src/db');
    const {getSettings}=require('./src/services/settings');
    (async()=>{
      try {
        await prisma.$transaction(async(tx)=>{
          const settings=await getSettings(tx);
          if(typeof settings.fees.baseFee!=='number')throw Error('Missing fee settings');
        },{timeout:5000});
        process.stdout.write('PASS');
      } catch(e) {process.stderr.write(e.code||e.name);process.exitCode=1;}
      finally {await prisma.$disconnect();}
    })();`;
  const result = await promisify(execFile)(process.execPath, ['-r','ts-node/register/transpile-only','-e',program], {
    cwd: process.cwd(), env:{...process.env,DATABASE_URL:url.toString(),SETTINGS_CACHE_TTL_MS:'0'}, timeout:12000,
  });
  expect(result.stdout).toBe('PASS');
},15000);
