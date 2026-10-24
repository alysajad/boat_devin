import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RowGesture, clampLook } from '../app/controls.ts';
test('a downward pull fires once at 48px, ignores other fingers and resets on release', () => {
  const row = new RowGesture();
  assert.equal(row.start(1, 100), true);
  assert.equal(row.start(2, 100), false);
  assert.deepEqual(row.move(2, 200), { progress: 0, stroke: false });
  assert.equal(row.move(1, 90).progress, 0);
  assert.equal(row.move(1, 147).stroke, false);
  assert.equal(row.move(1, 148).stroke, true);
  assert.equal(row.move(1, 200).stroke, false);
  row.move(1, 100);
  assert.equal(row.move(1, 160).stroke, false);
  row.cancel();
  assert.equal(row.move(1, 200).stroke, false);
  assert.equal(row.start(2, 10), true);
  assert.equal(row.move(2, 58).stroke, true);
});
test('canceling an unfinished gesture cannot produce a late stroke', () => {
  const row = new RowGesture(); row.start(5, 0); row.move(5, 40); row.cancel();
  assert.equal(row.owns(5), false);
  assert.equal(row.move(5, 100).stroke, false);
  row.start(5, 100);
  assert.equal(row.move(5, 120).stroke, false);
});
test('look angles stay within a comfortable seated range', () => {
  assert.deepEqual(clampLook(9, -9), { yaw: Math.PI / 3, pitch: -Math.PI / 12 });
  assert.deepEqual(clampLook(-9, 9), { yaw: -Math.PI / 3, pitch: Math.PI / 12 });
  assert.deepEqual(clampLook(0, 0), { yaw: 0, pitch: 0 });
});

test('sideways swipes work in both directions and fire only once per touch',()=>{
 for(const direction of [-1,1]){const row=new RowGesture();row.start(1,100,100);assert.equal(row.move(1,100,100+direction*47).stroke,false);assert.equal(row.move(1,100,100+direction*60).stroke,true);assert.equal(row.move(1,100,100-direction*60).stroke,false);}
});
