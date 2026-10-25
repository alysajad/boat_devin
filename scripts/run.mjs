import httpProxy from 'http-proxy';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { createServer as createSecureServer } from 'node:https';
import { setTimeout as delay } from 'node:timers/promises';
import { existsSync } from 'node:fs';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
import { networkInterfaces } from 'node:os';
const production = process.argv.includes('--production');
const httpPort = Number(process.env.APP_PORT || 8080), wsPort = Number(process.env.WS_PORT || 6020);
const root = resolve('dist');
const apiPort=Number(process.env.API_PORT||wsPort+100);
const proxy=httpProxy.createProxyServer({ws:true});
proxy.on('error',(_error,_req,res)=>{if(res && 'writeHead' in res){res.writeHead(503);res.end('Race server is starting.');}else res?.destroy();});
const ds = spawn(process.execPath, ['scripts/multiplayer.mjs'], { env: { ...process.env, PORT: String(wsPort), API_PORT:String(apiPort) }, stdio: ['ignore', 'pipe', 'pipe'] });
ds.stdout.on('data', chunk => { if (/ERROR|FATAL|started|listening/i.test(String(chunk))) process.stdout.write(chunk); });
ds.stderr.on('data', chunk => process.stderr.write(chunk));
ds.on('error', error => { console.error(error); stop(1); });
ds.on('exit', code => { if (!stopping) { console.error(`Multiplayer server stopped (${code}).`); stop(code || 1); } });
let stopping = false, tunnel, server, secureServer, tunnelStatus='off', publicOrigin=process.env.PUBLIC_ORIGIN||'';
process.on('SIGINT',()=>stop());process.on('SIGTERM',()=>stop());
process.on('exit',()=>{tunnel?.kill('SIGTERM');ds.kill('SIGTERM');});
if(process.env.SKIP_BUILD!=='1'){
 const {build}=await import('./build.mjs');
 await build(!production);
}
const mime = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg':'image/jpeg', '.glb':'model/gltf-binary', '.ktx2':'image/ktx2', '.wasm':'application/wasm', '.woff2': 'font/woff2', '.woff': 'font/woff', '.txt': 'text/plain', '.json': 'application/json', '.map': 'application/json' };
const handler = async (req, res) => {
  try {
    const path = decodeURIComponent(new URL(req.url || '/', 'http://localhost').pathname);
    if(path.startsWith('/api/race/'))return proxy.web(req,res,{target:`http://127.0.0.1:${apiPort}`});
    if(path.startsWith('/deepstream'))return proxy.web(req,res,{target:`http://127.0.0.1:${wsPort}`});
    if (path === '/config.json') {
      const addresses = Object.values(networkInterfaces()).flat().filter(n => n?.family === 'IPv4' && !n.internal).map(n => n.address);
      res.writeHead(200, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(JSON.stringify({ websocketPath:'/deepstream', wsPort, addresses, appPort: httpPort, publicOrigin, localHttpsPort:secureServer?Number(process.env.HTTPS_PORT||8443):null, tunnelStatus }));
    }
    if (path === '/session') {
      const upstream = await fetch(`http://127.0.0.1:${wsPort}/session`, { signal: AbortSignal.timeout(2000) });
      res.writeHead(upstream.status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
      return res.end(await upstream.text());
    }
    if (path === '/health') { res.writeHead(200); return res.end('ok'); }
    const file = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end('Forbidden'); }
    if (!(await stat(file)).isFile()) throw new Error('missing');
    const data = await readFile(file);
    const immutable = /^\/chunks\/[^/]+-[A-Z0-9]{8}\.js(?:\.map)?$/.test(path);
    res.writeHead(200, { 'content-type': mime[extname(file)] || 'application/octet-stream', 'cache-control': immutable ? 'public, max-age=31536000, immutable' : production ? 'no-cache' : 'no-store' }); res.end(data);
  } catch { res.writeHead(404, { 'content-type': 'text/plain' }); res.end('Not found'); }
};
server=createServer(handler);
server.on('error',error=>{console.error(error);stop(1);});
const upgrade=(req,socket,head)=>{if(req.url?.startsWith('/deepstream'))proxy.ws(req,socket,head,{target:`http://127.0.0.1:${wsPort}`});else socket.destroy();};
server.on('upgrade',upgrade);
if(process.env.TLS_CERT&&process.env.TLS_KEY){
 secureServer=createSecureServer({cert:await readFile(process.env.TLS_CERT),key:await readFile(process.env.TLS_KEY)},handler);
 secureServer.on('upgrade',upgrade);
 secureServer.on('error',error=>{console.error(error);stop(1);});
 secureServer.listen(Number(process.env.HTTPS_PORT||8443),'0.0.0.0',()=>console.log('Trusted local HTTPS enabled on port '+(process.env.HTTPS_PORT||8443)));
}
server.listen(httpPort, '0.0.0.0', () => {
  console.log(`\nKerala Boat Race — host screen: http://localhost:${httpPort}\n`);
  for (const list of Object.values(networkInterfaces())) for (const n of list || []) if (n.family === 'IPv4' && !n.internal) console.log(`Phones on your Wi-Fi: http://${n.address}:${httpPort}`);
});
if(process.argv.includes('--event')){
 // Do not advertise a public URL before both the web origin and authority are ready.
 let ready=false;for(let attempt=0;attempt<60;attempt++){try{const response=await fetch(`http://127.0.0.1:${httpPort}/api/race/preflight`,{signal:AbortSignal.timeout(1000)});if(response.ok){ready=true;break;}}catch{}await delay(500);}
 if(!ready){console.error('Race origin did not become ready; tunnel was not started.');stop(1);}
 tunnelStatus='connecting';
 tunnel=spawn(process.env.CLOUDFLARED_BIN||(existsSync('.tools/cloudflared')?resolve('.tools/cloudflared'):'cloudflared'),['tunnel','--url',`http://127.0.0.1:${httpPort}`,'--no-autoupdate','--protocol',process.env.TUNNEL_TRANSPORT||'http2','--edge-ip-version',process.env.TUNNEL_EDGE_IP_VERSION||'4'],{stdio:['ignore','pipe','pipe']});
 let output='';const read=chunk=>{const text=String(chunk);process.stdout.write(text);if(text.includes('Registered tunnel connection'))tunnelStatus='connected';else if(/Retrying connection|Connection terminated/.test(text))tunnelStatus='reconnecting';output=(output+text).slice(-10000);const found=output.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);if(found&&publicOrigin!==found[0]){publicOrigin=found[0];console.log(`\nSecure phone link: ${publicOrigin} (the room QR updates automatically).\nKeep this laptop and tunnel running. This temporary demo URL changes on restart.\n`);}};
 tunnel.stdout.on('data',read);tunnel.stderr.on('data',read);
 tunnel.on('error',error=>{tunnelStatus='unavailable';console.error('Install cloudflared to enable secure phone motion, then run npm run event.',error.message);});
 tunnel.on('exit',()=>{publicOrigin=process.env.PUBLIC_ORIGIN||'';tunnelStatus='unavailable';if(!stopping)console.error('Tunnel stopped. Local admin remains available; restart the event for a fresh secure link.');});
}
function stop(exitCode=0) { stopping = true;tunnel?.kill('SIGTERM'); ds.kill('SIGTERM'); server?.close(); secureServer?.close(); process.exit(exitCode); }
