import { Deepstream } from '@deepstream/server';
import { DeepstreamClient } from '@deepstream/client';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { performance } from 'node:perf_hooks';
import { Authority } from '../server/authority.mjs';
const require=createRequire(import.meta.url);
const {TOPIC,RECORD_ACTION:R,EVENT_ACTION:E}=require('@deepstream/server/dist/src/constants');
const authority=new Authority(),server=new Deepstream('conf/config.yml');
const wsPort=Number(process.env.PORT||6020),apiPort=Number(process.env.API_PORT||wsPort+100);
const auth={description:'Room capability authentication',async whenReady(){},async close(){},async isValidUser(_connection,data){
 if(data.token===authority.secret&&data.username==='_race_server')return {isValid:true,id:'_race_server'};
 const s=authority.sessions.get(data.token);if(!s||data.username!==`race_v4-${s.code}/${s.id}`)return {isValid:false};
 authority.connection(data.username,true);return {isValid:true,id:data.username};
},onClientDisconnect(user){authority.connection(user,false);}};
const permissions={description:'Server authoritative room records',async whenReady(){},async close(){},canPerformAction(socket,message,callback,pass){
 let allowed=socket.userId==='_race_server';const s=authority.users.get(socket.userId);
 if(!allowed&&s&&authority.sessions.has(s.token)){
  const prefix=`race_v4-${s.code}/`;
  if(message.topic===TOPIC.RECORD&&[prefix+'race',prefix+(s.role==='player'?'status':'snapshot')].includes(message.name))allowed=[R.READ,R.HEAD,R.SUBSCRIBE,R.UNSUBSCRIBE,R.SUBSCRIBEANDHEAD,R.SUBSCRIBEANDREAD,R.SUBSCRIBECREATEANDREAD].includes(message.action);
  if(message.topic===TOPIC.EVENT&&message.action===E.EMIT)allowed=message.name===prefix+`heartbeat/${s.id}`||(s.role==='player'&&message.name===prefix+`stroke/${s.id}`);
  if(message.topic===TOPIC.EVENT&&[E.SUBSCRIBE,E.UNSUBSCRIBE].includes(message.action))allowed=message.name===prefix+`feedback/${s.id}`||(s.role!=='player'&&message.name===prefix+'rowing');
  const second=Math.floor(Date.now()/1000);if(s.rateSecond!==second){s.rateSecond=second;s.rate=0;}if(++s.rate>100)allowed=false;
 }
 callback(socket,message,pass,null,allowed);
}};
server.set('authentication',auth);server.set('permission',permissions);
let client,timer,publisher,api,last=performance.now(),debt=0;
const samples=[];
function publicSession(s){const {code,token,id,role,name,bootId,waiting}=s;return{code,token,id,role,name,bootId,waiting};}
server.on('started',async()=>{
 server.getServices().httpService.registerGetPathPrefix('/session',(_meta,respond)=>respond(null,{bootId:authority.bootId}));
 client=new DeepstreamClient(`ws://127.0.0.1:${wsPort}/deepstream`);client.on('error',(e)=>console.error('authority transport:',e));await client.login({username:'_race_server',token:authority.secret});
 api=createServer(async(req,res)=>{
  res.setHeader('content-type','application/json');res.setHeader('cache-control','no-store');
  const reply=(status,body)=>{res.statusCode=status;res.end(JSON.stringify(body));};
  try{
   const path=new URL(req.url,'http://localhost').pathname;
   if(req.method==='GET'&&path==='/api/race/preflight')return reply(200,{bootId:authority.bootId,serverTime:Date.now(),websocketPath:'/deepstream'});
   if(req.method==='GET'&&path.startsWith('/api/race/room/')){const room=authority.rooms.get(path.split('/').pop());if(!room)return reply(404,{error:'Room not found.'});return reply(200,{config:room.race.config,phase:room.race.phase,players:room.race.players.map(p=>({id:p.id,team:p.team}))});}
   const token=(req.headers.authorization||'').replace(/^Bearer /,'');
   if(req.method==='GET'&&path==='/api/race/session'){const s=authority.auth(token);return reply(200,publicSession(s));}
   if(req.method==='GET'&&path==='/api/race/metrics'){const s=authority.auth(token);if(s.role!=='admin')return reply(403,{error:'Admin only.'});const sorted=[...samples].sort((a,b)=>a-b);return reply(200,{...authority.metrics,stepP95:sorted[Math.floor(sorted.length*.95)]||0,players:authority.rooms.get(s.code).race.players.length,connections:[...authority.sessions.values()].filter(c=>c.code===s.code&&c.connected).length});}
   if(req.method!=='POST')return reply(404,{error:'Not found.'});
   let raw='';for await(const chunk of req){raw+=chunk;if(raw.length>16384)return reply(413,{error:'Request too large.'});}const body=JSON.parse(raw||'{}');
   if(path==='/api/race/create')return reply(201,publicSession(await authority.create(client)));
   if(path==='/api/race/join')return reply(201,publicSession(await authority.join(client,String(body.code||'').toUpperCase(),body.role||'player',body.name,body.team)));
   if(path==='/api/race/leave'){const s=authority.sessions.get(token||body.token);if(s?.role==='player')authority.leave(s);return reply(200,{ok:true});}
   if(path==='/api/race/command')return reply(200,authority.command(authority.auth(token),body));
   return reply(404,{error:'Not found.'});
  }catch(e){reply(400,{error:e.message||'Request failed.'});}
 });
 api.listen(apiPort,process.env.INTERNAL_BIND||'127.0.0.1',()=>console.log(`Race API listening ${apiPort}`));
 last=performance.now();
 timer=setInterval(()=>{const now=performance.now(),elapsed=(now-last)/1000;last=now;
  if(elapsed>2){for(const room of authority.rooms.values())if(['racing','countdown'].includes(room.race.phase)){room.race.phase='paused';room.race.message='Server timing stalled. The admin can resume.';room.dirty=true;}debt=0;return;}
  debt+=elapsed;while(debt>=1/60){authority.step(1/60);samples.push(authority.metrics.stepMs);if(samples.length>900)samples.shift();debt-=1/60;}
 },1000/60);
 publisher=setInterval(()=>{
  for(const room of authority.rooms.values())authority.publish(room);
  for(const s of authority.sessions.values())if((s.connected||s.role==='player')&&s.seen&&Date.now()-s.seen>8000)authority.connection(`race_v4-${s.code}/${s.id}`,false);
 },50);
 console.log('Authoritative race simulation started');
});
let stopping=false;
function stop(){if(stopping)return;stopping=true;clearInterval(timer);clearInterval(publisher);api?.close();authority.close();client?.close();server.stop();}
server.on('stopped',()=>process.exit(0));process.on('SIGINT',stop);process.on('SIGTERM',stop);server.start();
