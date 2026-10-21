// Start a local-only UI fixture server; no provider tokens, database or production entrypoint changes.
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
const require=createRequire(new URL('../../../web/super_admin/package.json',import.meta.url));
const {createServer}=await import(new URL('../../../web/super_admin/node_modules/vite/dist/node/index.js',import.meta.url));
const react=(await import(require.resolve('@vitejs/plugin-react'))).default;
const root=fileURLToPath(new URL('../../../web/super_admin/',import.meta.url));
process.chdir(root);
process.env.VITE_AUTH_MODE='clerk-test';process.env.VITE_CLERK_PUBLISHABLE_KEY='pk_test_Y2FwYWJsZS1tdXR0LTYuY2xlcmsuYWNjb3VudHMuZGV2JA==';
process.env.VITE_API_BASE_URL='http://127.0.0.1:5199';process.env.VITE_SOCKET_URL='http://127.0.0.1:5199';
const entry=fileURLToPath(new URL('entry.tsx',import.meta.url));
const server=await createServer({root,configFile:false,resolve:{alias:{'react':root+'node_modules/react','react-dom':root+'node_modules/react-dom','@fontsource-variable':root+'node_modules/@fontsource-variable'}},plugins:[react(),{name:'explicit-local-fixture',configureServer(s){s.middlewares.use('/capture',async(req,res)=>{res.setHeader('Content-Type','text/html; charset=utf-8');res.end(await s.transformIndexHtml('/capture',`<html><head><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Grozo local fixture capture</title></head><body><div style="background:#fff8df;padding:6px;text-align:center;font:11px sans-serif">LOCAL BROWSER CAPTURE · SYNTHETIC API FIXTURES · NOT A HOSTED SESSION</div><div id="root"></div><script type="module" src="/@fs/${entry}"></script></body></html>`));});}}],server:{host:'127.0.0.1',port:5198,strictPort:true,fs:{allow:[fileURLToPath(new URL('../../../',import.meta.url))]}}});
await server.listen();console.log('Fixture capture server: http://127.0.0.1:5198/capture');
