import { test } from 'node:test';
import assert from 'node:assert/strict';
import { newRace, beginRace, startReason, applyStroke, step, rematch, winner, validGuest, type Race, type InputMemory } from '../app/engine.ts';
function ready(count = 2): Race {
  const s = newRace('ABC234','host');
  for (const team of ['coral','gold'] as const) for (let i=0;i<count;i++) s.players.push({id:`${team}${i}`,name:`Player ${i}`,team,side:i%2?'right':'left',ready:true,connected:true,strokes:0});
  return s;
}
test('lobby enforces equal crews, minimum size, connections, and readiness',()=>{
 const s=ready();assert.equal(startReason(s),'');s.players.pop();assert.match(startReason(s),/at least/);s.players=ready(3).players;s.players.pop();assert.match(startReason(s),/Balance/);s.players=ready().players;s.players[0].ready=false;assert.match(startReason(s),/ready/);s.players[0].connected=false;assert.match(startReason(s),/reconnect/);
});
test('countdown, fixed race duration, draw, and rematch reset',()=>{
 const s=ready();assert.ok(beginRace(s));assert.equal(s.phase,'countdown');for(let i=0;i<151;i++)step(s,1/30);assert.equal(s.phase,'racing');for(let i=0;i<1801;i++)step(s,1/30);assert.equal(s.phase,'results');assert.equal(winner(s),'draw');s.boats.coral.distance=24.6;s.boats.gold.distance=24.4;assert.equal(winner(s),'coral');s.boats.coral.distance=24.3;assert.equal(winner(s),'draw');rematch(s);assert.equal(s.round,2);assert.equal(s.players[0].side,'right');assert.equal(s.players[0].ready,false);assert.equal(s.boats.coral.distance,0);assert.equal(s.remaining,60);
});
test('duplicate, stale, rate-limited and non-player strokes are ignored',()=>{
 const s=ready();s.phase='racing';const memory:InputMemory=new Map();const input={seq:1,round:1};assert.ok(applyStroke(s,'coral0',input,0,memory));assert.equal(applyStroke(s,'coral0',input,400,memory),false);assert.equal(applyStroke(s,'coral0',{seq:2,round:1},50,memory),false);assert.equal(applyStroke(s,'coral0',{seq:2,round:1},400,memory),false);assert.equal(applyStroke(s,'coral0',{seq:3,round:0},600,memory),false);assert.equal(applyStroke(s,'missing',{seq:3,round:1},700,memory),false);assert.ok(applyStroke(s,'coral0',{seq:3,round:1},700,memory));assert.equal(s.players[0].strokes,2);s.phase='paused';assert.equal(applyStroke(s,'coral0',{seq:4,round:1},1000,memory),false);
});
test('balanced paddles go straight, one side turns, crew size normalizes force',()=>{
 const small=ready(2),large=ready(6);small.phase=large.phase='racing';for(const s of [small,large]){const memory:InputMemory=new Map();for(const p of s.players.filter(p=>p.team==='coral'))applyStroke(s,p.id,{seq:1,round:1},0,memory);}for(let i=0;i<40;i++){step(small,1/120);step(large,1/120);}assert.ok(small.boats.coral.speed>0);assert.ok(Math.abs(small.boats.coral.heading)<1e-9);assert.ok(Math.abs(large.boats.coral.heading)<1e-9);assert.ok(Math.abs(small.boats.coral.speed-large.boats.coral.speed)<1e-9);applyStroke(small,'coral0',{seq:2,round:1},400,new Map());step(small,.1);assert.ok(small.boats.coral.x>0);
});
test('logs and banks slow boats without repeatedly counting the same collision',()=>{
 const s=ready();s.phase='racing';const b=s.boats.coral;b.distance=34;b.x=0;b.speed=8;step(s,.1);assert.equal(b.collisions,1);assert.ok(b.speed<3);step(s,.1);assert.equal(b.collisions,1);b.x=.9;b.speed=8;step(s,.1);assert.equal(b.collisions,2);assert.ok(Math.abs(b.x)<=.83);assert.ok(b.speed<4);
});
test('malformed presence records cannot join the game',()=>{
 assert.equal(validGuest(null),false);assert.equal(validGuest({id:'a'}),false);assert.ok(validGuest({id:'a',instance:'b',name:'Sam',mode:'player',team:'coral',ready:false,heartbeat:1,stroke:{seq:1,round:1}}));
});

test('the visible bow contacts a log before the centre reaches it; nearby clear water does not collide', () => {
  const hit = ready(), clear = ready(); hit.phase = clear.phase = 'racing';
  hit.boats.coral.distance = 30; clear.boats.coral.distance = 29.5;
  step(hit, 1 / 120); step(clear, 1 / 120);
  assert.equal(hit.boats.coral.collisions, 1);
  assert.equal(clear.boats.coral.collisions, 0);
});
test('paddle torque turns continuously and identical elapsed time gives identical movement', () => {
  const a = ready(), b = ready(); a.phase = b.phase = 'racing';
  for (const s of [a,b]) {
    s.boats.coral.speed = 8;
    applyStroke(s, 'coral0', {seq:1,round:1}, 0, new Map());
    assert.equal(s.boats.coral.heading, 0, 'paddling must not teleport the hull to a new heading');
  }
  for (let i = 0; i < 10; i++) step(a, .1);
  for (let i = 0; i < 120; i++) step(b, 1 / 120);
  for (const key of ['x', 'distance', 'speed', 'heading'] as const) assert.ok(Math.abs(a.boats.coral[key] - b.boats.coral[key]) < 1e-8, key);
  assert.ok(a.boats.coral.heading > 0);
});
test('the race never moves past its final fractional tick and ignores invalid elapsed time', () => {
  const s = ready(); s.phase = 'racing'; s.remaining = .002; s.boats.coral.speed = 10;
  step(s, NaN); assert.equal(s.remaining, .002);
  step(s, .1); assert.equal(s.phase, 'results'); assert.ok(s.boats.coral.distance <= .020001);
});

test('stroke force builds during water contact, stops in recovery, and cannot be spammed', () => {
  const s=ready(); s.phase='racing'; const memory:InputMemory=new Map();
  applyStroke(s,'coral0',{seq:1,round:1},0,memory);
  assert.equal(s.boats.coral.speed,0,'no instantaneous speed jump');
  step(s,.1); const early=s.boats.coral.speed; assert.ok(early>0 && early<1);
  step(s,.1); step(s,.1); step(s,.02);
  const endDrive=s.boats.coral.speed;
  assert.ok(endDrive>early); step(s,.1);
  assert.ok(s.boats.coral.speed<endDrive,'recovery must only coast');
  assert.equal(applyStroke(s,'coral0',{seq:2,round:1},699,memory),false);
  assert.ok(applyStroke(s,'coral0',{seq:3,round:1},700,memory));
});
test('drag removes energy faster at higher speed and idle water cannot propel a boat', () => {
  const a=ready(),b=ready();a.phase=b.phase='racing';
  a.boats.coral.speed=2;b.boats.coral.speed=8;
  step(a,.1);step(b,.1);
  assert.ok(b.boats.coral.speed/8<a.boats.coral.speed/2);
  assert.equal(a.boats.gold.speed,0);assert.equal(a.boats.gold.distance,0);
});
