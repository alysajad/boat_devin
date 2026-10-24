import { test } from 'node:test';
import assert from 'node:assert/strict';
import { paddlePose, DRIVE_SECONDS, STROKE_SECONDS, PADDLE_LEAN } from '../app/rowing.ts';
import { HULL, LANE_HALF_WIDTH, LATERAL_SCALE, footprint, overlaps } from '../app/world.ts';
import { newRace, step } from '../app/engine.ts';
test('render-space heading rotates the bow in the same direction as positive steering', () => {
  const bow = footprint([[0, -4.9]], 0, 0, Math.PI / 2)[0];
  assert.ok(Math.abs(bow[0] - 4.9) < 1e-10); assert.ok(Math.abs(bow[1]) < 1e-10);
});
test('collision test rejects separated polygons, includes touching and rotated contact', () => {
  const square = [[-1,-1],[1,-1],[1,1],[-1,1]] as const;
  assert.equal(overlaps(square, footprint(square, 2, 0, 0)), true);
  assert.equal(overlaps(square, footprint(square, 2.01, 0, 0)), false);
  assert.equal(overlaps(square, footprint(square, 2.2, 0, Math.PI / 4)), true);
});
test('lane collisions constrain every rotated hull vertex, not just its centre', () => {
  for (const side of [-1, 1]) {
    const s = newRace('ABC234', 'host'); s.phase = 'racing';
    const b = s.boats.coral; b.x = side * .7; b.heading = side * .8; b.speed = 10;
    step(s, .1);
    for (const [x] of footprint(HULL, b.x * LATERAL_SCALE, -b.distance, b.heading)) assert.ok(Math.abs(x) <= LANE_HALF_WIDTH + 1e-8);
    assert.equal(b.collisions, 1); assert.ok(b.speed < 5);
  }
});

test('paddle blade is submerged through the drive and lifted for the return', () => {
  for(let age=0;age<DRIVE_SECONDS;age+=.02){
    const p=paddlePose(age);
    const tip=p.y-1.2*Math.cos(p.pitch)*Math.cos(PADDLE_LEAN);
    assert.ok(tip<-.12,`dry drive at ${age}`);assert.equal(p.drive,true);
  }
  for(let age=DRIVE_SECONDS+.1;age<STROKE_SECONDS;age+=.02){
    const p=paddlePose(age);
    const tip=p.y-1.2*Math.cos(p.pitch)*Math.cos(PADDLE_LEAN);
    assert.ok(tip>-.12,`submerged recovery at ${age}`);assert.equal(p.drive,false);
  }
  assert.equal(paddlePose(Infinity).active,false);
});
