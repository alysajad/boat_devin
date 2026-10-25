import {test} from 'node:test';
import assert from 'node:assert/strict';
import {chundanSection,createChundanHull} from '../app/chundan.ts';
import {boatLength,crewSeatZ} from '../app/race-v2.ts';
test('Chundan hull has a narrow bow, raised stern and finite closed surface',()=>{
 const hull=createChundanHull();hull.computeBoundingBox();
 assert.equal(hull.boundingBox!.min.z,-1);assert.equal(hull.boundingBox!.max.z,1);
 assert.ok(chundanSection(1).rim>3);assert.ok(chundanSection(-1).rim<1.1);
 assert.ok(chundanSection(0).width>.7);assert.ok(chundanSection(1).width<.02);
 for(const attribute of Object.values(hull.attributes))assert.ok(Array.from(attribute.array).every(Number.isFinite));
 assert.ok(hull.index!.count<30000);
 const edges=new Map<string,number>(),index=hull.index!;
 for(let i=0;i<index.count;i+=3)for(let j=0;j<3;j++){const a=index.getX(i+j),b=index.getX(i+(j+1)%3),key=a<b?`${a}/${b}`:`${b}/${a}`;edges.set(key,(edges.get(key)||0)+1);}
 assert.ok([...edges.values()].every(count=>count===2));hull.dispose();
});
test('one to 25 rowers fit in paired seats ahead of the raised tail',()=>{
 for(let count=1;count<=25;count++){
  const length=boatLength(count);assert.ok(length>=14);
  for(let i=0;i<count;i++){const z=crewSeatZ(i,count),section=chundanSection(z/(length/2));assert.equal(section.rise,0);assert.ok(section.width>.65);if(i%2===1)assert.equal(z,crewSeatZ(i-1,count));}
  if(count>2)assert.ok(Math.abs(crewSeatZ(2,count)-crewSeatZ(0,count)-.95)<1e-12);
 }
});
