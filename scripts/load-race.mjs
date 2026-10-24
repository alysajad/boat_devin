import {DeepstreamClient} from '@deepstream/client';
import {performance} from 'node:perf_hooks';
import {writeFile} from 'node:fs/promises';
import {defaultConfig} from '../app/race-v2.ts';
const outputPrefix=process.env.LOAD_OUTPUT||'artifacts/load-motion';
const base=process.env.RACE_URL||'http://127.0.0.1:8080',duration=Number(process.env.LOAD_SECONDS||900)*1000;
const renderSamples=[],clients=[],sessions=[],latencies=[],stepSamples=[],errors=[],pending=new Map();let race,heartbeat,rowing,browser,broadcast,assetBytes=0,bytes=0,frames=0,accepted=0,rounds=0;
async function api(path,body,s){const response=await fetch(base+'/api/race/'+path,{method:body?'POST':'GET',headers:{'content-type':'application/json',...(s?{authorization:'Bearer '+s.token}:{})},body:body?JSON.stringify(body):undefined,signal:AbortSignal.timeout(10000)});const result=await response.json();if(!response.ok)throw Error(result.error);return result;}
async function attach(s){const c=new DeepstreamClient(base.replace(/^http/,'ws')+'/deepstream');clients.push(c);c.on('error',(e)=>errors.push(String(e)));await c.login({username:`race_v3-${s.code}/${s.id}`,token:s.token});const meta=c.record.getRecord(`race_v3-${s.code}/race`),snap=c.record.getRecord(`race_v3-${s.code}/${s.role==='player'?'status':'snapshot'}`);await Promise.all([meta.whenReady(),snap.whenReady()]);if(s.role==='admin'){race=meta.get();meta.subscribe(r=>race=r);snap.subscribe(r=>{Object.assign(race,r);bytes+=Buffer.byteLength(JSON.stringify(r));frames++;});}if(s.role==='player')snap.subscribe(r=>{const p=r.players.find(p=>p.id===s.id),prev=pending.get(s.id);if(prev&&p&&p.strokes>prev.count){latencies.push(performance.now()-prev.time);accepted++;pending.delete(s.id);}s.strokes=p?.strokes||0;});s.attached=true;return c;}
const started=Date.now();let admin;
try{
 // Each phone stays alive while the rest of the crew is still joining.
 heartbeat=setInterval(()=>sessions.forEach((s,i)=>{if(s.attached)clients[i].event.emit(`race_v3-${s.code}/heartbeat/${s.id}`,{});}),2000);
 admin=await api('create',{});await api('command',{action:'configure',boats:defaultConfig(10,5)},admin);sessions.push(admin);await attach(admin);
 const watch=await api('join',{code:admin.code,role:'watch'});sessions.push(watch);await attach(watch);
 for(let i=0;i<50;i++){const s=await api('join',{code:admin.code,name:'Load '+(i+1),team:'boat-'+(Math.floor(i/5)+1)});sessions.push(s);await attach(s);}
 let sequence=0;
 rowing=setInterval(()=>{if(race?.phase!=='racing')return;sequence++;sessions.forEach((s,i)=>{if(s.role!=='player')return;const p=race.players.find(p=>p.id===s.id);if(!p)return;pending.set(s.id,{time:performance.now(),count:s.strokes||0});clients[i].event.emit(`race_v3-${s.code}/stroke/${s.id}`,{round:race.round,seq:sequence,mode:'swipe',at:Date.now()});});},730);
 sessions.forEach((s,i)=>clients[i].event.emit(`race_v3-${s.code}/heartbeat/${s.id}`,{}));await new Promise(r=>setTimeout(r,300));
 console.log(JSON.stringify({event:'connected',room:admin.code,clients:clients.length,durationSeconds:duration/1000}));
 if(process.env.RENDER_BROADCAST==='1'){const {chromium}=await import('playwright-core');browser=await chromium.launch({headless:true,args:['--use-angle=gl']});broadcast=await browser.newPage({viewport:{width:1280,height:800}});broadcast.on('pageerror',error=>errors.push('Broadcast: '+error.message));broadcast.on('response',response=>{if(/\.(glb|ktx2|wasm|woff2|js|css)(\?|$)/.test(response.url()))void response.body().then(body=>assetBytes+=body.length).catch(()=>{});});const spectator=await api('join',{code:admin.code,role:'watch'});await broadcast.addInitScript(s=>sessionStorage.setItem(`race-v3:${s.code}:watch`,JSON.stringify(s)),spectator);await broadcast.goto(base+'/?room='+admin.code+'&watch=1');await broadcast.locator('#race-river[data-crew-asset=anatomical-rig]').waitFor({timeout:30000});await broadcast.locator('#renderer-notice').waitFor({state:'hidden',timeout:30000});}
 const end=Date.now()+duration;
 while(Date.now()<end){
  if(race.phase==='lobby'){for(const s of sessions.filter(s=>s.role==='player')){await api('command',{action:'controller',mode:'swipe'},s);await api('command',{action:'ready',ready:true},s);}await api('command',{action:'start'},admin);rounds++;}
  else if(race.phase==='results')await api('command',{action:'reset'},admin);
  else if(race.phase==='paused'){errors.push('Unexpected server pause');await api('command',{action:'resume'},admin);}
  const metrics=await api('metrics',null,admin);stepSamples.push(metrics.stepP95);
  if(broadcast&&stepSamples.length===15){console.log(JSON.stringify({event:'broadcast',diagnostics:await broadcast.locator('#race-river').evaluate(e=>({...e.dataset}))}));await broadcast.screenshot({path:outputPrefix+'-broadcast.png'});}
  if(broadcast&&stepSamples.length%30===0){const diagnostic=await broadcast.locator('#race-river').evaluate(e=>({...e.dataset}));const previous=renderSamples.at(-1);if(previous&&diagnostic.renderFrames===previous.renderFrames)errors.push('Broadcast stopped rendering');renderSamples.push(diagnostic);}
  if(stepSamples.length%30===0)console.log(JSON.stringify({event:'progress',elapsed:Math.round((Date.now()-started)/1000),rounds,accepted,stepP95:metrics.stepP95}));
  await new Promise(r=>setTimeout(r,1000));
 }
 const sorted=latencies.sort((a,b)=>a-b),result={transport:base.startsWith('https:')?'https-tunnel':'local',durationSeconds:Math.round((Date.now()-started)/1000),clients:clients.length+(browser?1:0),renderedBroadcast:!!browser,renderSamples,initialAssetBytes:assetBytes,players:50,boats:10,rounds,accepted,snapshots:frames,meanSnapshotBytes:Math.round(bytes/frames),inputAckP95Ms:sorted[Math.floor(sorted.length*.95)],worstWindowStepP95Ms:Math.max(...stepSamples),errors};
 await writeFile(outputPrefix+'.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));if(accepted<duration/1000*25||errors.length||assetBytes>10*1024*1024||result.inputAckP95Ms>350||result.worstWindowStepP95Ms>8)process.exitCode=1;
}finally{await browser?.close();clearInterval(heartbeat);clearInterval(rowing);if(admin)await api('command',{action:'reset'},admin).catch(()=>{});clients.forEach(c=>c.close());}
