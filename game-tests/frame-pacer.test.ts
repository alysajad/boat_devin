import {test} from 'node:test';
import assert from 'node:assert/strict';
import {FramePacer} from '../app/frame-pacer.ts';
for(const [display,target]of [[60,90],[90,90],[120,90],[144,90],[120,60],[60,30]])test(`${target} FPS target on a ${display} Hz display preserves fractional deadlines`,()=>{
 const pacer=new FramePacer();let rendered=0;
 for(let frame=0;frame<display*10;frame++)if(pacer.due(frame*1000/display,target))rendered++;
 assert.ok(Math.abs(rendered-Math.min(display,target)*10)<=1,`${rendered} frames`);
 assert.ok(Math.abs(pacer.refresh-display)<1);
});
test('a background interruption resumes without rendering queued frames',()=>{
 const p=new FramePacer();p.due(0,90);assert.ok(p.due(10000,90));assert.equal(p.due(10001,90),false);p.reset();assert.ok(p.due(10002,90));
});
