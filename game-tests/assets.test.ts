import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
function glb(file:string){const b=readFileSync(new URL('../public/assets/'+file,import.meta.url));return JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());}
test('both rower LODs retain UVs for the licensed skin texture',()=>{
 for(const name of ['crew/rower.glb','crew/rower-low.glb']){const model=glb(name);for(const mesh of model.meshes)for(const p of mesh.primitives){assert.ok(p.attributes.TEXCOORD_0!==undefined);assert.equal(model.accessors[p.attributes.TEXCOORD_0].count,model.accessors[p.attributes.POSITION].count);}}
});
test('tree foliage keeps cutout transparency and a bounded cluster mesh',()=>{
 const model=glb('scenery/island-tree.glb');const material=model.materials.findIndex((m:any)=>m.name.includes('leaves'));
 assert.equal(model.materials[material].alphaMode,'MASK');assert.ok(model.materials[material].alphaCutoff>0);
 const foliage=model.meshes.flatMap((m:any)=>m.primitives).filter((p:any)=>p.material===material);assert.ok(foliage.length);
 for(const p of foliage){const triangles=model.accessors[p.indices].count/3;assert.ok(triangles>=3000&&triangles<=10000);}
});
