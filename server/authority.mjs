import { randomBytes, randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import { configError, defaultConfig, boatLength, startReason, defaultSettings, settingsError } from '../app/race-v2.ts';
import { RiverPhysics, STROKE_MS } from './physics.mjs';
const id=()=>randomBytes(12).toString('hex');
const code=()=>Array.from(randomBytes(6),v=>'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[v%31]).join('');
export class Authority {
 constructor(){this.bootId=randomUUID();this.rooms=new Map();this.sessions=new Map();this.users=new Map();this.secret=id();this.metrics={steps:0,stepMs:0,maxStepMs:0,inputs:0,rejected:0};}
 session(room,role,name='',playerId=id()){
  const s={code:room.race.room,id:playerId,role,name,token:randomBytes(32).toString('hex'),bootId:this.bootId,seen:Date.now()};this.sessions.set(s.token,s);this.users.set(`race_v3-${s.code}/${s.id}`,s);return s;
 }
 auth(token){const s=this.sessions.get(token);if(!s||!this.rooms.has(s.code))throw new Error('Session expired. Join a fresh room.');return s;}
 async create(client){
  let name;do{name=code();}while(this.rooms.has(name));
  const race={schema:3,settings:defaultSettings(),elapsed:0,room:name,round:1,phase:'lobby',config:defaultConfig(),boatOrder:[],players:[],boats:{},remaining:60,countdown:5,revision:0,seed:7,riverWidth:40,message:'',serverTime:Date.now(),logs:[]};
  const room={client,race,memory:new Map(),recent:[],pending:[],statusAt:0,physics:null,touched:Date.now(),dirty:true};this.rooms.set(name,room);this.lobbyBoats(room);
  room.meta=client.record.getRecord(`race_v3-${name}/race`);room.snapshot=client.record.getRecord(`race_v3-${name}/snapshot`);room.status=client.record.getRecord(`race_v3-${name}/status`);await Promise.all([room.meta.whenReady(),room.snapshot.whenReady(),room.status.whenReady()]);this.publish(room,true);
  const s=this.session(room,'admin','Host');client.event.subscribe(`race_v3-${name}/heartbeat/${s.id}`,()=>{if(!s.connected)s.inputAfter=Date.now();s.seen=Date.now();s.connected=true;room.touched=Date.now();});return s;
 }
 async join(client,code,role,name,team){
  const room=this.rooms.get(code);if(!room)throw new Error('Room not found. Ask the laptop host to create a new race.');
  if(!['player','watch'].includes(role))throw new Error('Invalid role.');
  name=String(name||'').trim().slice(0,24);if(role==='player'&&!name)throw new Error('Enter your name.');
  const race=room.race;let selected;
  if(role==='player'&&race.players.length+[...this.sessions.values()].filter(s=>s.code===code&&s.waiting).length>=50)throw new Error('The room is full (50 players maximum).');
  if(role==='player'&&race.phase==='lobby'){
   const available=race.config.filter(c=>race.players.filter(p=>p.team===c.id).length<25);
   selected=team?available.find(c=>c.id===team):available.sort((a,b)=>race.players.filter(p=>p.team===a.id).length-race.players.filter(p=>p.team===b.id).length)[0];
   if(!selected)throw new Error('This boat is full. Choose another boat.');
  }
  const s=this.session(room,role,name);
  s.client=client;
  s.team=team;
  if(selected){race.players.push({id:s.id,name,team:selected.id,seat:0,side:'left',ready:false,connected:false,strokes:0,lastStroke:0,lastSide:'left',mode:null,cadence:0});this.seats(room);}
  else if(role==='player')s.waiting=true;
  client.event.subscribe(`race_v3-${code}/stroke/${s.id}`,input=>this.stroke(s,input));
  client.event.subscribe(`race_v3-${code}/heartbeat/${s.id}`,data=>{if(!this.sessions.has(s.token))return;const p=race.players.find(p=>p.id===s.id);if(p&&!p.connected){p.connected=true;room.dirty=true;}if(!s.connected)s.inputAfter=Date.now();s.seen=Date.now();s.connected=true;room.touched=Date.now();if(Number.isFinite(data?.at))client.event.emit?.(`race_v3-${code}/feedback/${s.id}`,{kind:'clock',sent:data.at,serverTime:Date.now()});});
  room.dirty=true;room.touched=Date.now();this.publish(room,true);return s;
 }
 connection(user,connected){const s=this.users.get(user);if(!s)return;if(!connected&&s.role==='player'){this.leave(s);return;}const room=this.rooms.get(s.code);if(!room)return;if(connected&&!s.connected)s.inputAfter=Date.now();s.seen=Date.now();s.connected=connected;const p=room.race.players.find(p=>p.id===s.id);if(p){p.connected=connected;if(!connected&&room.race.phase==='lobby')p.ready=false;room.dirty=true;}}
 leave(s){
  if(!s||!this.sessions.delete(s.token))return;
  this.users.delete(`race_v3-${s.code}/${s.id}`);
  for(const channel of ['stroke','heartbeat'])s.client?.event.unsubscribe?.(`race_v3-${s.code}/${channel}/${s.id}`);
  const room=this.rooms.get(s.code);if(!room)return;
  room.race.players=room.race.players.filter(p=>p.id!==s.id);
  room.pending=room.pending.filter(p=>p.player.id!==s.id);
  room.recent=room.recent.filter(p=>p.id!==s.id);room.memory.delete(s.id);
  // Active boat dimensions and starting crew normalization remain frozen.
  if(room.race.phase==='lobby')this.seats(room);
  room.dirty=true;this.publish(room,true);
 }
 seats(room){for(const c of room.race.config)room.race.players.filter(p=>p.team===c.id).forEach((p,i)=>{const side=(i+room.race.round)%2?'left':'right';if(p.seat!==i||p.side!==side)p.ready=false;p.seat=i;p.side=side;});this.lobbyBoats(room);}
 lobbyBoats(room){const r=room.race;r.boatOrder=r.config.map(c=>c.id);r.riverWidth=Math.max(40,r.config.length*4+24);r.boats=Object.fromEntries(r.config.map((c,i)=>[c.id,{x:(i-(r.config.length-1)/2)*4,distance:-boatLength(r.players.filter(p=>p.team===c.id).length)/2,speed:0,heading:0,vx:0,vy:0,angularVelocity:0,length:boatLength(r.players.filter(p=>p.team===c.id).length),progress:0,collisions:0,splash:0,crewCount:r.players.filter(p=>p.team===c.id).length,sync:0,finishTime:null}]));}
 command(s,body){
  const room=this.rooms.get(s.code),r=room.race,p=r.players.find(p=>p.id===s.id),action=body.action;room.touched=Date.now();
  if(action==='controller'){
   if(!p||!['motion','swipe'].includes(body.mode))throw new Error('Choose motion or swipe rowing.');
   p.mode=body.mode;p.ready=false;room.dirty=true;
  }else if(action==='ready'){
   if(!p||!['lobby','paused'].includes(r.phase))throw new Error('Readiness can only change in the lobby or a pause.');
   if(body.ready&&!p.mode)throw new Error('Enable motion or choose swipe rowing first.');p.ready=!!body.ready;room.dirty=true;
  }else if(action==='team'){
   if(!p||r.phase!=='lobby')throw new Error('Change boats in the lobby.');
   this.move(room,p.id,body.team);room.dirty=true;
  }else{
   if(s.role!=='admin')throw new Error('Only the room admin can do that.');
   if(action==='configure'){
    if(r.phase!=='lobby')throw new Error('Configure boats in the lobby.');
    const error=configError(body.boats);if(error)throw new Error(error);
    for(const old of r.config){const n=r.players.filter(p=>p.team===old.id).length,c=body.boats.find(c=>c.id===old.id);if(n&&!c)throw new Error('Move players before removing their boat or reducing its seats.');}
    const settings=body.settings??r.settings;const invalid=settingsError(settings);if(invalid)throw new Error(invalid);r.settings={...settings};r.remaining=settings.duration;
    r.config=body.boats.map(c=>({...c,name:c.name.trim()}));r.players.forEach(p=>p.ready=false);this.seats(room);
   }else if(action==='move'){
    if(r.phase!=='lobby')throw new Error('Move players in the lobby.');this.move(room,body.playerId,body.team);
   }else if(action==='remove'){
    if(r.phase!=='lobby')throw new Error('Return to the lobby before removing players.');this.leave(this.users.get(`race_v3-${s.code}/${body.playerId}`));
   }else if(action==='balance'){
    if(r.phase!=='lobby')throw new Error('Balance in the lobby.');
    const counts=new Map(r.config.map(c=>[c.id,0]));
    for(const p of r.players){const c=r.config.filter(c=>counts.get(c.id)<25).sort((a,b)=>counts.get(a.id)-counts.get(b.id))[0];p.team=c.id;p.ready=false;counts.set(c.id,counts.get(c.id)+1);}this.seats(room);
   }else if(action==='start'||action==='resume'){
    if(!['lobby','paused'].includes(r.phase))throw new Error('Race already started.');
    if(r.phase==='lobby'){const reason=startReason(r);if(reason)throw new Error(reason);room.physics?.dispose();room.physics=new RiverPhysics(r);r.remaining=r.settings.duration;r.elapsed=0;room.recent=[];room.pending=[];room.memory.clear();r.countdown=5;}else r.countdown=3;
    room.inputAfter=Date.now()+r.countdown*1000;r.phase='countdown';r.message='';
   }else if(action==='pause'){
    if(!['countdown','racing'].includes(r.phase))throw new Error('No active race to pause.');room.pending=[];room.physics.drives=[];r.phase='paused';r.message='The admin paused the race.';
   }else if(action==='reset'){
    room.physics?.dispose();room.physics=null;r.round++;r.phase='lobby';r.remaining=r.settings.duration;r.elapsed=0;room.recent=[];room.pending=[];r.countdown=5;r.logs=[];r.message='';room.memory.clear();
    r.players.forEach(p=>Object.assign(p,{ready:false,strokes:0,lastStroke:0,cadence:0}));
    for(const waiting of this.sessions.values()){if(waiting.code!==r.room||!waiting.waiting)continue;const available=r.config.filter(c=>r.players.filter(p=>p.team===c.id).length<25);const c=available.find(c=>c.id===waiting.team)||available.sort((a,b)=>r.players.filter(p=>p.team===a.id).length-r.players.filter(p=>p.team===b.id).length)[0];if(!c)continue;r.players.push({id:waiting.id,name:waiting.name,team:c.id,seat:0,side:'left',lastSide:'left',ready:false,connected:!!waiting.connected,strokes:0,lastStroke:0,mode:null,cadence:0});waiting.waiting=false;}this.seats(room);
   }else throw new Error('Unknown command.');
   room.dirty=true;
  }
  this.publish(room,true);return {ok:true};
 }
 move(room,playerId,team){const r=room.race,p=r.players.find(p=>p.id===playerId),c=r.config.find(c=>c.id===team);if(!p||!c)throw new Error('Player or boat not found.');if(p.team===team)return;if(r.players.filter(p=>p.team===team).length>=25)throw new Error('This boat is full.');p.team=team;p.ready=false;this.seats(room);}
 stroke(s,input){
  const room=this.rooms.get(s.code);if(!room)return;const r=room.race,p=r.players.find(p=>p.id===s.id);this.metrics.inputs++;
  const reject=()=>{this.metrics.rejected++;};
  if(!this.sessions.has(s.token)||s.role!=='player'||!p?.connected||r.phase!=='racing'||!input||input.round!==r.round||!Number.isSafeInteger(input.seq)||input.seq<1||!['motion','swipe'].includes(input.mode)||input.mode!==p.mode)return reject();
  const prior=room.memory.get(p.id),now=performance.now(),wall=Date.now();
  if(prior&&input.seq<=prior.seq)return reject();
  room.memory.set(p.id,{...prior,seq:input.seq});
  // Client corrects its clock using an HTTP round trip. Bound it again at the trust boundary.
  if(!Number.isFinite(input.at)||input.at<wall-500||input.at>wall+100||input.at<Math.max(room.inputAfter||0,s.inputAfter||0))return reject();
  const at=Math.min(wall,Math.max(wall-500,input.at));
  if(prior?.at!=null&&(now-prior.at<STROKE_MS||at-prior.eventAt<STROKE_MS))return reject();
  p.cadence=prior?.at!=null?Math.round(60000/(now-prior.at)):0;
  room.memory.set(p.id,{seq:input.seq,at:now,eventAt:at});
  room.recent.push({id:p.id,team:p.team,at});
  room.pending.push({player:p,at,received:wall});
  p.strokes++;p.lastStroke=wall;p.lastSide=p.side;r.boats[p.team].splash++;
  const accepted={kind:'stroke',id:p.id,round:r.round,strokes:p.strokes,at:wall,side:p.side,cadence:p.cadence};
  room.client.event.emit?.(`race_v3-${s.code}/rowing`,accepted);
  room.client.event.emit?.(`race_v3-${s.code}/feedback/${s.id}`,accepted);
 }
 syncCredit(events,at,crew){
  if(crew===1)return 1;
  // A window is 300 ms wide in total, not 300 ms on either side of a stroke.
  const starts=events.filter(e=>e.at>=at-300&&e.at<=at).map(e=>e.at);
  const distinct=Math.max(1,...starts.map(start=>new Set(events.filter(e=>e.at>=start&&e.at<=start+300).map(e=>e.id)).size));
  return Math.min(1,(distinct-1)/Math.max(1,crew-1));
 }
 coordination(room,team,now){
  const n=room.race.boats[team].crewCount;if(n===1)return 1;
  const events=room.recent.filter(e=>e.team===team&&e.at>=now-2000);
  if(!events.length)return 0;
  return events.reduce((sum,e)=>sum+this.syncCredit(events,e.at,n),0)/events.length;
 }

 step(dt){
  if(!Number.isFinite(dt)||dt<=0)return;dt=Math.min(dt,.1);
  const start=performance.now(),now=Date.now();
  for(const room of this.rooms.values()){
   const r=room.race;
   room.recent=room.recent.filter(e=>e.at>=now-2500);
   for(const p of r.players)if(now-p.lastStroke>2500)p.cadence=0;
   if(r.phase==='countdown'){r.countdown=Math.max(0,r.countdown-dt);if(r.countdown<1e-8){r.phase='racing';room.inputAfter=now;room.dirty=true;}}
   else if(r.phase==='racing'){
    for(const id of r.boatOrder)r.boats[id].sync=this.coordination(room,id,now);
    // Base thrust is immediate; settle the small teamwork bonus after the coordination window.
    for(const pending of room.pending){
     if(!pending.started){room.physics.stroke(pending.player,0);pending.started=true;}
     if(now-pending.received>=800){const b=r.boats[pending.player.team];const events=room.recent.filter(e=>e.team===pending.player.team&&Math.abs(e.at-pending.at)<=300);const sync=this.syncCredit(events,pending.at,b.crewCount);room.physics.drives.push({id:pending.player.team,age:0,impulse:3.3*r.settings.forceMultiplier*.1*Math.max(0,sync)/b.crewCount});pending.done=true;}
    }
    room.pending=room.pending.filter(p=>!p.done);
    const slice=r.settings.format==='timed'?Math.min(dt,r.remaining):dt;
    const before=Object.fromEntries(r.boatOrder.map(id=>[id,r.boats[id].progress]));
    room.physics.step(slice);
    if(r.settings.format==='distance'){
     const crossings=r.boatOrder.filter(id=>before[id]<r.settings.distance&&r.boats[id].progress>=r.settings.distance).map(id=>({id,fraction:(r.settings.distance-before[id])/(r.boats[id].progress-before[id])}));
     if(crossings.length){const first=Math.min(...crossings.map(c=>c.fraction));for(const c of crossings)if(slice*(c.fraction-first)<.001)r.boats[c.id].finishTime=r.elapsed+slice*c.fraction;for(const id of r.boatOrder){const b=r.boats[id];b.progress=before[id]+(b.progress-before[id])*first;b.distance=b.progress-b.length/2;}r.elapsed+=slice*first;r.phase='results';room.dirty=true;}else r.elapsed+=slice;
    }else{r.elapsed+=slice;r.remaining=Math.max(0,r.remaining-slice);if(r.remaining<1e-8){r.remaining=0;r.phase='results';room.dirty=true;}}
   }
  }
  const cost=performance.now()-start;this.metrics.steps++;this.metrics.stepMs=cost;this.metrics.maxStepMs=Math.max(this.metrics.maxStepMs,cost);
 }
 publish(room,force=false){
  if(!room.meta)return;const r=room.race;r.revision++;r.serverTime=Date.now();
  if(room.dirty||force){room.meta.set(JSON.parse(JSON.stringify(r)));room.dirty=false;}
  const q=v=>Math.round(v*1000)/1000,common={phase:r.phase,remaining:q(r.remaining),countdown:q(r.countdown),elapsed:q(r.elapsed),revision:r.revision,round:r.round,serverTime:r.serverTime};
  room.snapshot.set({...common,frames:r.boatOrder.map(id=>{const b=r.boats[id];return[id,...[b.x,b.distance,b.speed,b.heading,b.vx,b.vy,b.angularVelocity,b.progress].map(q),b.collisions,b.splash,q(b.sync),b.finishTime];}),logs:[],strokes:r.players.map((p,i)=>[i,p.strokes,Math.min(65535,r.serverTime-p.lastStroke),p.lastSide,p.cadence])});
  if(force||r.serverTime>=room.statusAt){room.statusAt=force||r.serverTime-room.statusAt>200?r.serverTime+200:room.statusAt+200;room.status.set({...common,boats:Object.fromEntries(r.boatOrder.map(id=>{const b=r.boats[id];return[id,{progress:q(b.progress),speed:q(b.speed),sync:q(b.sync),finishTime:b.finishTime}];})),players:r.players.map(p=>({id:p.id,strokes:p.strokes,cadence:p.cadence}))});}
 }
 close(){for(const room of this.rooms.values())room.physics?.dispose();}
}
