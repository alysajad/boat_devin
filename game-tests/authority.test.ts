import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Authority} from '../server/authority.mjs';
import {defaultConfig,configError,boatLength,winners,defaultSettings,rankings} from '../app/race-v2.ts';
const client={record:{getRecord:()=>({whenReady:async()=>{},data:null,sets:0,set(value:any){this.data=value;this.sets++;}})},event:{subscribe(){}}};
async function room(count=2){const a=new Authority(),admin=await a.create(client);a.command(admin,{action:'configure',boats:defaultConfig(count,25)});return{a,admin,r:a.rooms.get(admin.code)};}
async function player(c:any,team:string){const s=await c.a.join(client,c.admin.code,'player','Rower',team);c.a.connection(`race_v3-${s.code}/${s.id}`,true);if(c.r.race.phase==='lobby'){c.a.command(s,{action:'controller',mode:'swipe'});c.a.command(s,{action:'ready',ready:true});}return s;}
function start(c:any){c.a.command(c.admin,{action:'start'});for(let i=0;i<301;i++)c.a.step(1/60);}
const input=(seq=1)=>({seq,round:1,mode:'swipe',at:Date.now()});
test('actual participant limits, automatic growth, frozen crews and late arrivals',async()=>{
 assert.equal(configError(defaultConfig(10,25)),'');assert.match(configError(defaultConfig(1)),/2 and 10/);
 const c=await room(10);try{for(let i=0;i<50;i++)await player(c,'boat-'+(Math.floor(i/5)+1));await assert.rejects(()=>player(c,'boat-1'),/50 players/);assert.equal(c.r.race.boats['boat-1'].length,boatLength(5));start(c);const b=c.r.race.boats['boat-1'];c.a.connection(`race_v3-${c.admin.code}/${c.r.race.players[0].id}`,false);assert.equal(b.crewCount,5);assert.equal(c.r.race.phase,'racing');assert.equal(c.r.race.logs.length,0);assert.throws(()=>c.a.command(c.admin,{action:'configure',boats:defaultConfig()}),/lobby/);}finally{c.a.close();}
 const d=await room();try{for(let i=0;i<25;i++)await player(d,'boat-1');await assert.rejects(()=>player(d,'boat-1'),/full/);await player(d,'boat-2');start(d);const late=await player(d,'boat-2');assert.equal(d.r.race.players.length,26);assert.equal(d.r.race.boats['boat-2'].crewCount,1);d.a.command(d.admin,{action:'reset'});assert.ok(d.r.race.players.find((p:any)=>p.id===late.id));assert.equal(d.r.race.players.length,27);}finally{d.a.close();}
});
test('mode, clock bounds, round, cadence and sequence validation; pause and reconnect',async()=>{
 const c=await room();try{const a=await player(c,'boat-1'),b=await player(c,'boat-2');assert.throws(()=>c.a.command(a,{action:'start'}),/admin/);start(c);c.a.stroke(a,input());c.a.stroke(a,input());c.a.stroke(a,input(2));c.a.stroke(a,{...input(3),mode:'motion'});c.a.stroke(a,{...input(4),round:2});c.a.stroke(a,{...input(5),at:Date.now()-2000});c.a.stroke(a,{...input(6),at:Date.now()+1000});assert.equal(c.r.race.players[0].strokes,1);for(let i=0;i<30;i++)c.a.step(1/60);assert.ok(c.r.race.boats['boat-1'].speed>0);assert.equal(c.r.race.boats['boat-1'].heading,0);const elapsed=c.r.race.elapsed;c.a.command(c.admin,{action:'pause'});c.a.step(.1);assert.equal(c.r.race.elapsed,elapsed);assert.equal(c.r.pending.length,0);c.a.command(c.admin,{action:'resume'});assert.equal(c.r.race.phase,'countdown');c.a.connection(`race_v3-${b.code}/${b.id}`,false);assert.equal(c.r.race.boats['boat-2'].crewCount,1);c.a.command(c.admin,{action:'reset'});assert.equal(c.r.race.round,2);assert.equal(c.r.race.players[0].ready,false);}finally{c.a.close();}
});
test('solo and uneven crews share maximum thrust; admin force scales propulsion',async()=>{
 const c=await room();try{await player(c,'boat-1');for(let i=0;i<7;i++)await player(c,'boat-2');start(c);for(const p of c.r.race.players)c.r.physics.stroke(p,.1);for(let i=0;i<30;i++)c.r.physics.step();assert.ok(Math.abs(c.r.race.boats['boat-1'].speed-c.r.race.boats['boat-2'].speed)<1e-9);const first=c.r.race.boats['boat-1'].speed;c.a.command(c.admin,{action:'reset'});c.a.command(c.admin,{action:'configure',boats:c.r.race.config,settings:{...defaultSettings(),forceMultiplier:3}});for(const p of c.r.race.players)p.ready=true;start(c);for(const p of c.r.race.players)c.r.physics.stroke(p,.1);for(let i=0;i<30;i++)c.r.physics.step();assert.ok(c.r.race.boats['boat-1'].speed>first*1.5);assert.equal(c.r.race.boats['boat-1'].x,-2);}finally{c.a.close();}
});
test('coordination uses distinct teammates in 300 ms, decays over two seconds, solo gets full credit',async()=>{
 const c=await room();try{await player(c,'boat-1');await player(c,'boat-2');await player(c,'boat-2');start(c);const now=Date.now();c.r.recent=[{id:'a',team:'boat-2',at:now},{id:'a',team:'boat-2',at:now+10}];assert.equal(c.a.coordination(c.r,'boat-2',now),0);c.r.recent.push({id:'b',team:'boat-2',at:now+299});assert.equal(c.a.coordination(c.r,'boat-2',now),1);assert.equal(c.a.coordination(c.r,'boat-2',now+2500),0);assert.equal(c.a.coordination(c.r,'boat-1',now),1);assert.equal(c.a.syncCredit([{id:'a',at:0},{id:'b',at:299},{id:'c',at:598}],299,3),.5);}finally{c.a.close();}
});
test('both race formats, authoritative close crossings, ties and settings bounds',async()=>{
 const c=await room();try{await player(c,'boat-1');await player(c,'boat-2');assert.throws(()=>c.a.command(c.admin,{action:'configure',boats:c.r.race.config,settings:{...defaultSettings(),forceMultiplier:99}}),/force/);start(c);const [a,b]=c.r.race.boatOrder.map((id:string)=>c.r.race.boats[id]);for(const boat of[a,b]){boat.distance=250-boat.length/2-.1;boat.progress=249.9;boat.speed=10;}c.a.step(.02);assert.equal(c.r.race.phase,'results');assert.equal(winners(c.r.race).length,2);assert.ok(a.finishTime>0);assert.ok(Math.abs(a.progress-250)<1e-6);
 c.a.command(c.admin,{action:'reset'});c.a.command(c.admin,{action:'configure',boats:c.r.race.config,settings:{...defaultSettings(),format:'timed',duration:30}});for(const p of c.r.race.players)p.ready=true;start(c);c.r.race.remaining=.01;c.r.physics.stroke(c.r.race.players[1]);c.a.step(.02);assert.equal(c.r.race.phase,'results');assert.equal(c.r.race.remaining,0);assert.equal(rankings(c.r.race)[0],'boat-2');}finally{c.a.close();}
});
test('controllers receive throttled compact status, broadcasts get detailed snapshots',async()=>{
 const c=await room();try{const before=c.r.status.sets,snaps=c.r.snapshot.sets;for(let i=0;i<4;i++)c.a.publish(c.r);assert.equal(c.r.status.sets,before);assert.equal(c.r.snapshot.sets,snaps+4);assert.equal('frames' in c.r.status.data,false);assert.ok('boats' in c.r.status.data);}finally{c.a.close();}
});

test('the first crossing freezes the race; remaining boats rank by progress, not projected crossing time',async()=>{
 const c=await room(3);try{for(const id of ['boat-1','boat-2','boat-3'])await player(c,id);start(c);const starts=[[249.95,10],[249.9,15],[249.99,1]];for(const [i,id]of c.r.race.boatOrder.entries()){const b=c.r.race.boats[id];b.progress=starts[i][0];b.distance=b.progress-b.length/2;b.speed=starts[i][1];}c.a.step(.02);assert.equal(c.r.race.phase,'results');assert.deepEqual(rankings(c.r.race),['boat-1','boat-3','boat-2']);assert.equal(c.r.race.boats['boat-2'].finishTime,null);assert.deepEqual(winners(c.r.race),['boat-1']);}finally{c.a.close();}
});

test('disconnect and explicit leave release slots, revoke sessions and cannot resurrect through a late heartbeat',async()=>{
 const handlers=new Map<string,Function>(),transport={...client,event:{subscribe(name:string,handler:Function){handlers.set(name,handler);},unsubscribe(name:string){handlers.delete(name);}}};
 const a=new Authority(),admin=await a.create(transport),room=a.rooms.get(admin.code);
 try{
  const s=await a.join(transport,admin.code,'player','Old rower','boat-1');a.connection(`race_v3-${s.code}/${s.id}`,true);
  const heartbeat=handlers.get(`race_v3-${s.code}/heartbeat/${s.id}`)!;
  a.connection(`race_v3-${s.code}/${s.id}`,false);assert.equal(room.race.players.length,0);assert.equal(room.race.boats['boat-1'].crewCount,0);assert.throws(()=>a.auth(s.token),/expired/);
  heartbeat();a.connection(`race_v3-${s.code}/${s.id}`,true);a.stroke(s,input());assert.equal(room.race.players.length,0);assert.equal(handlers.has(`race_v3-${s.code}/stroke/${s.id}`),false);
  const fresh=await a.join(transport,admin.code,'player','Old rower','boat-1');assert.notEqual(fresh.id,s.id);assert.equal(room.race.players.length,1);a.leave(fresh);a.leave(fresh);assert.equal(room.race.players.length,0);
 }finally{a.close();}
});

test('disconnect during a race removes the rower but freezes hull, seat positions and normalization',async()=>{
 const c=await room();try{const first=await player(c,'boat-1'),remaining=await player(c,'boat-1');await player(c,'boat-2');start(c);const before={...c.r.race.boats['boat-1']};c.a.stroke(first,input());c.a.leave(first);assert.equal(c.r.pending.length,0);assert.equal(c.r.race.players.find((p:any)=>p.id===remaining.id).seat,1);assert.equal(c.r.race.boats['boat-1'].crewCount,2);assert.equal(c.r.race.boats['boat-1'].length,before.length);const late=await player(c,'boat-1');assert.equal(late.waiting,true);c.a.leave(late);c.a.command(c.admin,{action:'reset'});assert.equal(c.r.race.boats['boat-1'].crewCount,1);assert.equal(c.r.race.players.length,2);}finally{c.a.close();}
});
