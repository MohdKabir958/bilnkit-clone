// Actual Chromium screenshots against the local production API and controlled pilot data.
import {spawn} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(new URL('../../backend/package.json',import.meta.url));
const {parse}=require('dotenv');
const root=new URL('../../',import.meta.url);
const phase=process.env.GROZO_CAPTURE_PHASE||'after';
const base=process.env.GROZO_ADMIN_ORIGIN||'http://localhost:3000';
const api=process.env.GROZO_API_ORIGIN||'http://127.0.0.1:5000';
const env=parse(readFileSync(new URL('backend/.env',root)));
const folder=new URL(`Docs/ui-ux/${phase}/admin/`,root);mkdirSync(folder,{recursive:true});
const browser=spawn('chromium',['--headless','--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--no-first-run','--no-proxy-server','--disable-extensions','--disable-background-networking',`--user-data-dir=/tmp/grozo-ui-browser-${phase}`,'--remote-debugging-port=9231','about:blank'],{stdio:'ignore',env:{...process.env,XDG_CONFIG_HOME:'/workspace/.config',XDG_CACHE_HOME:'/workspace/.cache'}});
const deadline=setTimeout(()=>{browser.kill();process.exit(1)},90000);
let ws;
try{
 let target;
 for(let i=0;i<60;i++){try{target=(await(await fetch('http://127.0.0.1:9231/json/list')).json()).find(x=>x.type==='page');if(target)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!target)throw Error('Chromium unavailable');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>(await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true})).result.value;
 await call('Page.enable');await call('Performance.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:base});await new Promise(r=>setTimeout(r,2000));
 const shot=async(name)=>{await new Promise(r=>setTimeout(r,1000));const png=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(new URL(name+'.png',folder),Buffer.from(png.data,'base64'));};
 await shot('login');
 // Authenticate via the actual API; keep credentials/token in memory, never in screenshots/logs.
 const auth=await(await fetch(api+'/api/auth/admin-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({passcode:env.ADMIN_PASSCODE})})).json();
 if(!auth.token)throw Error('Local admin authentication failed');
 const credentialSource=readFileSync(new URL('web/super_admin/src/lib/credentials.ts',root),'utf8');
 const key=credentialSource.match(/(?:TOKEN_KEY|AUTH_KEY)\s*=\s*['"]([^'"]+)/)?.[1]||'kraveo_admin_token';
 await evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(auth.token)});location.reload();`);
 await new Promise(r=>setTimeout(r,2500));
 const rows=[];
 for(const [name,labels] of [['dashboard',['Operations and support','Overview']],['vendors',['Vendors','Stores']],['inventory',['Products and inventory']],['orders',['Orders']],['riders',['Drivers','Delivery partners']],['finance',['Finance']],['coverage',['Delivery coverage']]]){
  const selected=await evaluate(`(()=>{const names=${JSON.stringify(labels)};const b=[...document.querySelectorAll('nav button')].find(b=>names.some(n=>(b.getAttribute('aria-label')||'').replace(/ \\(.*$/,'')===n));if(b)b.click();return !!b})()`);
  if(!selected)throw Error('Navigation target missing: '+name);
  await shot(name);
  rows.push({screen:name,width:1280,...JSON.parse(await evaluate('JSON.stringify({title:document.querySelector("h1")?.textContent,overflow:document.documentElement.scrollWidth>innerWidth})'))});
 }
 if(phase==='after')for(const width of [1024,1440,1920]){
  await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});await shot('coverage-'+width);
  rows.push({screen:'coverage',width,overflow:await evaluate('document.documentElement.scrollWidth>innerWidth')});
 }
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 rows.push({keyboardFocusedTag:await evaluate('document.activeElement?.tagName'),metrics:(await call('Performance.getMetrics')).metrics.filter(m=>['Nodes','JSHeapUsedSize','LayoutCount'].includes(m.name))});
 writeFileSync(new URL('capture-results.json',folder),JSON.stringify(rows,null,2)+'\n');console.log('PASS: browser captures saved for '+phase+'; '+rows.length+' observations.');
}finally{clearTimeout(deadline);ws?.close();browser.kill();}
