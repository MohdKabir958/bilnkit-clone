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
const deadline=setTimeout(()=>{browser.kill();process.exit(1)},180000);
let ws;
try{
 let target;
 for(let i=0;i<60;i++){try{target=(await(await fetch('http://127.0.0.1:9231/json/list')).json()).find(x=>x.type==='page');if(target)break;}catch{}await new Promise(r=>setTimeout(r,200));}
 if(!target)throw Error('Chromium unavailable');
 ws=new WebSocket(target.webSocketDebuggerUrl);await new Promise((r,j)=>{ws.onopen=r;ws.onerror=j});
 let seq=0;const pending=new Map();ws.onmessage=e=>{const m=JSON.parse(e.data);if(m.id){const p=pending.get(m.id);pending.delete(m.id);m.error?p.reject(m.error):p.resolve(m.result);}};
 const call=(method,params={})=>new Promise((resolve,reject)=>{const id=++seq;pending.set(id,{resolve,reject});ws.send(JSON.stringify({id,method,params}));});
 const evaluate=async expression=>{const result=await call('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error('Browser evaluation failed');return result.result.value;};
 const waitFor=async(expression)=>{for(let i=0;i<150;i++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,200));}throw Error('Browser readiness timed out');};
 await call('Page.enable');await call('Performance.enable');
 await call('Emulation.setDeviceMetricsOverride',{width:1280,height:900,deviceScaleFactor:1,mobile:false});
 await call('Page.navigate',{url:base});await waitFor('!!document.querySelector("#admin-passcode,nav button")');
 const shot=async(name)=>{await new Promise(r=>setTimeout(r,1000));const png=await call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(new URL(name+'.png',folder),Buffer.from(png.data,'base64'));};
 await evaluate("localStorage.removeItem('kraveo_admin_token');location.reload()");
 await waitFor('!!document.querySelector("#admin-passcode")');
 await shot('login');
 // Authenticate via the actual API; keep credentials/token in memory, never in screenshots/logs.
 const auth=await(await fetch(api+'/api/auth/admin-login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({passcode:env.ADMIN_PASSCODE})})).json();
 if(!auth.token)throw Error('Local admin authentication failed');
 const key='kraveo_admin_token';
 await evaluate(`localStorage.setItem(${JSON.stringify(key)},${JSON.stringify(auth.token)});location.reload();`);
 await waitFor('!!document.querySelector("nav button")');
 const rows=[];
 for(const [name,labels] of [['dashboard',['Operations and support','Overview']],['vendors',['Vendors','Stores']],['inventory',['Products and inventory']],['orders',['Orders']],['riders',['Drivers','Delivery partners']],['finance',['Finance']],['coverage',['Delivery coverage']]]){
  const selected=await evaluate(`(()=>{const names=${JSON.stringify(labels)};const b=[...document.querySelectorAll('nav button')].find(b=>names.some(n=>(b.getAttribute('aria-label')||'').replace(/ \\(.*$/,'')===n));if(b)b.click();return !!b})()`);
  if(!selected)throw Error('Navigation target missing: '+name);
  await shot(name);
  rows.push({screen:name,width:1280,...JSON.parse(await evaluate('JSON.stringify({title:document.querySelector("h1")?.textContent,overflow:document.documentElement.scrollWidth>innerWidth})'))});
 }
 if(phase==='after') {
  for(const width of [1024,1440,1920]) {
   await call('Emulation.setDeviceMetricsOverride',{width,height:900,deviceScaleFactor:1,mobile:false});
   for(const [screen,label] of [['dashboard','Overview'],['inventory','Products and inventory'],['orders','Orders'],['vendors','Stores'],['riders','Delivery partners'],['finance','Finance'],['coverage','Delivery coverage']]) {
    await evaluate(`(()=>{const b=[...document.querySelectorAll('nav button')].find(b=>(b.getAttribute('aria-label')||'').split(' (')[0]===${JSON.stringify(label)});if(b)b.click()})()`);
    if(['dashboard','inventory','coverage'].includes(screen)) await shot(screen+'-'+width);
    else await new Promise(r=>setTimeout(r,250));
    rows.push({screen,width,overflow:await evaluate('document.documentElement.scrollWidth>innerWidth')});
   }
  }
  await call('Emulation.setDeviceMetricsOverride',{width:1024,height:900,deviceScaleFactor:1,mobile:false});
  await evaluate(`(()=>{[...document.querySelectorAll('nav button')].find(b=>(b.getAttribute('aria-label')||'').startsWith('Products and inventory')).click()})()`);
  await waitFor(`[...document.querySelectorAll('button')].some(b=>b.textContent==='Edit product')`);
  await evaluate(`(()=>{window.__grozoOpener=[...document.querySelectorAll('button')].find(b=>b.textContent==='Edit product');window.__grozoOpener.focus();window.__grozoOpener.click()})()`);
  await waitFor('!!document.querySelector("[role=dialog]")');
  rows.push({drawerInitialFocus:await evaluate('!!document.querySelector("[role=dialog]")?.contains(document.activeElement)')});
  await evaluate(`(()=>{const d=document.querySelector('[role=dialog]');[...d.querySelectorAll('button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled])')].at(-1).focus()})()`);
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
  rows.push({drawerFocusTrapped:await evaluate('!!document.querySelector("[role=dialog]")?.contains(document.activeElement)')});
  await shot('inventory-edit-1024');
  await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});
  rows.push({drawerClosed:await evaluate('!document.querySelector("[role=dialog]")'),focusRestored:await evaluate('document.activeElement===window.__grozoOpener')});
  await evaluate("document.documentElement.style.fontSize='200%'");await shot('inventory-text-200');
  rows.push({screen:'inventory',width:1024,textScale:2,overflow:await evaluate('document.documentElement.scrollWidth>innerWidth'),offenders:await evaluate("[...document.querySelectorAll('main *,header *')].filter(e=>e.getBoundingClientRect().right>innerWidth+1).slice(0,12).map(e=>({tag:e.tagName,classes:e.className,right:Math.round(e.getBoundingClientRect().right)}))")});
  await evaluate("document.documentElement.style.fontSize=''");
 }
 await call('Input.dispatchKeyEvent',{type:'keyDown',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});await call('Input.dispatchKeyEvent',{type:'keyUp',key:'Tab',code:'Tab',windowsVirtualKeyCode:9});
 rows.push({keyboardFocusedTag:await evaluate('document.activeElement?.tagName'),metrics:(await call('Performance.getMetrics')).metrics.filter(m=>['Nodes','JSHeapUsedSize','LayoutCount'].includes(m.name))});
 writeFileSync(new URL('capture-results.json',folder),JSON.stringify(rows,null,2)+'\n');console.log('PASS: browser captures saved for '+phase+'; '+rows.length+' observations.');
}finally{clearTimeout(deadline);ws?.close();browser.kill();}
