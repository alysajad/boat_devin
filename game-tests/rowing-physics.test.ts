import {test} from 'node:test';
import assert from 'node:assert/strict';
import {RiverPhysics,bowProgress} from '../server/physics.mjs';
import {defaultSettings,defaultConfig,rankings} from '../app/race-v2.ts';
import {chundanFootprint,mooredHouseboat} from '../app/hull-profile.ts';
import {overlaps} from '../app/world.ts';
function setup(count=2){
 const players=Array.from({length:count},(_,i)=>({id:String(i),team:'boat-1',side:i%2?'right':'left',connected:true}));
 const race:any={players,config:defaultConfig(),boats:{},settings:{...defaultSettings(),format:'timed'},elapsed:0,phase:'racing'};
 const physics=new RiverPhysics(race),b=race.boats['boat-1'];return {race,physics,b,players};
}
function advance(p:any,seconds:number){for(let t=0;t<seconds-1e-8;t+=1/60)p.step(Math.min(1/60,seconds-t));}
function worldHull(b:any){const points=chundanFootprint(b.length),out:any[]=[];for(let i=0;i<points.length;i+=2)out.push([b.x+points[i]*Math.cos(b.heading)+points[i+1]*Math.sin(b.heading),b.distance-points[i]*Math.sin(b.heading)+points[i+1]*Math.cos(b.heading)]);return out;}
test('side strokes turn opposite the paddle and drift across the river; opposing forces cancel',()=>{
 for(const side of [0,1]){const {physics,b,players}=setup();try{for(let i=0;i<8;i++){physics.stroke(players[side]);advance(physics,.7);}assert.ok((side===0?1:-1)*b.heading>.05);assert.ok((side===0?1:-1)*b.x>.25);assert.ok(Math.abs(b.roll)>0);assert.ok(Math.abs(b.roll)<=Math.PI/15);}finally{physics.dispose();}}
 const {physics,b,players}=setup();try{for(let i=0;i<12;i++){players.forEach(p=>physics.stroke(p));advance(physics,.7);}assert.ok(Math.abs(b.heading)<1e-6);assert.ok(Math.abs(b.x)<1e-6);assert.ok(Math.abs(b.roll)<1e-6);assert.ok(b.speed>4);}finally{physics.dispose();}
});
test('odd crews balance side budgets, retain allocations after departures and center delayed bonus',()=>{
 const {physics,b,players,race}=setup(5);try{players.forEach(p=>physics.stroke(p));advance(physics,.7);assert.ok(Math.abs(b.heading)<1e-6);assert.equal(physics.allocations.get('0'),1/6);assert.equal(physics.allocations.get('1'),1/4);
 race.players=players.slice(0,1);physics.updateAssistance();assert.equal(b.soloAssist,true);assert.equal(b.crewCount,5);physics.stroke(players[0]);assert.equal(physics.drives[0].side,0);assert.equal(physics.drives[0].impulse,3.3*1.5/6);physics.bonus(players[0],1);assert.equal(physics.drives[1].side,0);assert.ok(Math.abs(physics.drives[1].impulse-3.3*1.5*.1/6)<1e-9);advance(physics,.7);assert.ok(Math.abs(b.heading)<1e-6);
 }finally{physics.dispose();}
});
test('mistimed and missed strokes rock transiently; balanced rowing straightens without lane recentering',()=>{
 const {physics,b,players}=setup();try{physics.stroke(players[0]);advance(physics,.2);assert.ok(b.heading>0);assert.ok(b.roll>0);physics.stroke(players[1]);advance(physics,.5);assert.ok(Math.abs(b.heading)<.05);
 b.x=5;b.heading=.2;b.vx=b.vy=0;physics.activity.set('boat-1',{left:0,right:0});
 for(let i=0;i<4;i++){players.forEach(p=>physics.stroke(p));advance(physics,.75);}assert.ok(Math.abs(b.heading)<.035);assert.ok(b.x>5);assert.ok(Math.abs(b.roll)<.01);
 }finally{physics.dispose();}
});
test('solo center propulsion and stabilization; fixed starting allocations survive reconnect changes',()=>{
 const {physics,b,players}=setup(1);try{b.heading=.2;for(let i=0;i<4;i++){physics.stroke(players[0]);advance(physics,.75);}assert.equal(b.soloAssist,true);assert.ok(Math.abs(b.heading)<.01);assert.ok(Math.abs(b.roll)<1e-6);assert.ok(b.speed>4);}finally{physics.dispose();}
});
test('CCD stops high-speed bank and houseboat penetration; sustained contact counts once and recovers',()=>{
 const {physics,b,race}=setup();try{
 b.x=10;b.distance=60;b.vx=100;b.heading=Math.PI/2;advance(physics,.2);
 assert.ok(Math.max(...worldHull(b).map(p=>p[0]))<race.riverWidth/2+.03);assert.ok(b.collisions>=1);assert.ok(b.speed<40);const collisions=b.collisions;
 advance(physics,3);assert.equal(b.collisions,collisions);assert.ok(b.x<19);assert.ok(Math.abs(b.roll)<=Math.PI/15);
 }finally{physics.dispose();}
 const c=setup();try{const m=mooredHouseboat(0,c.race.riverWidth)!;c.b.x=m.x;c.b.distance=-10;c.b.vy=80;advance(c.physics,.6);assert.ok(c.b.collisions>=1);assert.ok(c.b.distance<8);assert.ok(c.b.speed<20);assert.ok(Math.abs(c.b.roll)<=Math.PI/15);}finally{c.physics.dispose();}
});
test('racing hulls collide, slide apart and lose speed without elimination',()=>{
 const {race,physics:initial}=setup();initial.dispose();race.players.push({id:'b',team:'boat-2',side:'left',connected:true});const physics=new RiverPhysics(race);try{
 const a=race.boats['boat-1'],b=race.boats['boat-2'];a.x=-3;b.x=3;a.distance=b.distance=50;a.vx=20;b.vx=-20;
 advance(physics,.5);assert.ok(a.collisions>=1&&b.collisions>=1);assert.ok(a.speed<10&&b.speed<10);assert.ok(a.x<b.x);advance(physics,1);assert.equal(overlaps(worldHull(a),worldHull(b)),false);assert.equal(race.phase,'racing');
 }finally{physics.dispose();}
});
test('rotated bow finishes downstream, never on a backward crossing, and freezes every pose component',()=>{
 const {physics,b,race}=setup(1);try{race.settings.format='distance';race.settings.distance=100;b.heading=Math.PI/2;b.distance=99.9;b.progress=bowProgress(b);b.vy=12;physics.step(.02);assert.equal(race.phase,'results');assert.ok(Math.abs(b.progress-100)<1e-6);assert.ok(b.finishTime>0);assert.equal(b.vx+b.vy+b.angularVelocity+b.rollVelocity,0);
 }finally{physics.dispose();}
 const c=setup();try{c.race.settings.format='distance';c.race.settings.distance=100;c.b.distance=94;c.b.heading=0;c.b.progress=101;c.b.vy=-10;c.physics.step(.1);assert.equal(c.race.phase,'racing');assert.equal(c.b.finishTime,null);}finally{c.physics.dispose();}
});
test('timed ranking uses rotated downstream bow progress, not path length or scalar speed',()=>{
 const {physics,race,b}=setup();try{race.boatOrder.push('boat-2');race.boats['boat-2']={...b,progress:12,speed:1};b.speed=30;b.distance=10;b.heading=Math.PI;b.progress=bowProgress(b);assert.equal(rankings(race)[0],'boat-2');race.boatOrder.pop();}finally{physics.dispose();}
});

test('millisecond ties include a crossing just across the fixed-step boundary',()=>{
 const {race,physics:initial}=setup();initial.dispose();race.players.push({id:'b',team:'boat-2',side:'left',connected:true});race.settings.format='distance';race.settings.distance=100;race.elapsed=0;
 const physics=new RiverPhysics(race);try{const [a,b]=race.boatOrder.map((id:string)=>race.boats[id]);a.distance=93-.162;b.distance=93-.169;a.vy=b.vy=10;physics.step(1/60);assert.equal(race.phase,'results');assert.ok(a.finishTime>0&&b.finishTime>a.finishTime);assert.ok(b.finishTime-a.finishTime<.001);assert.ok(b.progress<100);}finally{physics.dispose();}
});
test('Rapier retains the full midsection for short and long hulls',()=>{
 for(const n of [1,25]){const {physics}=setup(n);try{const vertices=physics.bodies.get('boat-1').collider(0).vertices();let width=0;for(let i=0;i<vertices.length;i+=2)width=Math.max(width,Math.abs(vertices[i]));assert.ok(Math.abs(width-.78)<1e-6);}finally{physics.dispose();}}
});
