import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS} from '@gltf-transform/extensions';
import {prune,weld,simplify,textureCompress} from '@gltf-transform/functions';
import {MeshoptSimplifier} from 'meshoptimizer';
import sharp from 'sharp';
import {mkdir,writeFile} from 'node:fs/promises';
await MeshoptSimplifier.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS),doc=await io.read('assets/source/tree/tree.gltf');
// Preserve leaf silhouettes: the source glTF uses a JPEG plus a separate alpha map.
const leaves=doc.getRoot().listMaterials().find(m=>m.getName().includes('leaves'));
const rgb=leaves.getBaseColorTexture();
const alpha=await sharp('assets/source/tree/textures/leaves-alpha.png').extractChannel(0).toBuffer();
rgb.setImage(await sharp(rgb.getImage()).removeAlpha().joinChannel(alpha).png().toBuffer()).setMimeType('image/png');
leaves.setAlphaMode('MASK').setAlphaCutoff(.35).setDoubleSided(true);
// Shore-distance asset: retain the photographic color and silhouette, omit micro-surface maps.
for(const m of doc.getRoot().listMaterials()){m.setNormalTexture(null).setMetallicRoughnessTexture(null).setOcclusionTexture(null).setRoughnessFactor(.95).setMetallicFactor(0);}
// Build broadleaf cluster cards from the source leaf positions/UVs. Simplifying an
// entire forest of disconnected leaves removes whole leaves and leaves a bare tree.
const foliage=[];
for(const mesh of doc.getRoot().listMeshes())for(const p of mesh.listPrimitives()){
 if(p.getMaterial()!==leaves)continue;
 const positions=p.getAttribute('POSITION').getArray(),uv=p.getAttribute('TEXCOORD_0').getArray(),idx=p.getIndices().getArray(),count=positions.length/3;
 const parent=Int32Array.from({length:count},(_,i)=>i),root=i=>{while(parent[i]!==i){parent[i]=parent[parent[i]];i=parent[i];}return i;};
 for(let i=0;i<idx.length;i+=3){const a=root(idx[i]);parent[root(idx[i+1])]=a;parent[root(idx[i+2])]=a;}
 const groups=new Map();for(let i=0;i<count;i++){const k=root(i);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(i);}
 const output={p:[],uv:[],n:[],idx:[]};let leaf=0;
 for(const ids of groups.values()){
  // Stable spatial sampling; 3,155 cards preserve coverage with enlarged leaf clusters.
  if(leaf++%14!==0)continue;
  const mean=[0,0,0,0,0];for(const i of ids){for(let k=0;k<3;k++)mean[k]+=positions[i*3+k]/ids.length;mean[3]+=uv[i*2]/ids.length;mean[4]+=uv[i*2+1]/ids.length;}
  let uu=0,vv=0,uvSum=0,u0=Infinity,v0=Infinity,u1=-Infinity,v1=-Infinity;const pu=[0,0,0],pv=[0,0,0];
  for(const i of ids){const u=uv[i*2]-mean[3],v=uv[i*2+1]-mean[4];uu+=u*u;vv+=v*v;uvSum+=u*v;u0=Math.min(u0,u);u1=Math.max(u1,u);v0=Math.min(v0,v);v1=Math.max(v1,v);for(let k=0;k<3;k++){pu[k]+=(positions[i*3+k]-mean[k])*u;pv[k]+=(positions[i*3+k]-mean[k])*v;}}
  const det=uu*vv-uvSum*uvSum;if(Math.abs(det)<1e-12)continue;
  const du=pu.map((x,k)=>(x*vv-pv[k]*uvSum)/det),dv=pv.map((x,k)=>(x*uu-pu[k]*uvSum)/det);
  const n=[du[1]*dv[2]-du[2]*dv[1],du[2]*dv[0]-du[0]*dv[2],du[0]*dv[1]-du[1]*dv[0]],len=Math.hypot(...n)||1,start=output.p.length/3;
  for(const [u,v]of [[u0,v0],[u1,v0],[u1,v1],[u0,v1]]){output.p.push(...du.map((x,k)=>mean[k]+(x*u+dv[k]*v)*2.4));output.uv.push(u+mean[3],v+mean[4]);output.n.push(...n.map(x=>x/len));}
  output.idx.push(start,start+1,start+2,start,start+2,start+3);
 }
 foliage.push([p,output]);
}

await doc.transform(prune(),weld(),simplify({simplifier:MeshoptSimplifier,ratio:.016,error:.008}),textureCompress({encoder:sharp,targetFormat:'webp',resize:[1024,1024],quality:80}),prune());
for(const [p,o]of foliage){const buffer=doc.getRoot().listBuffers()[0];for(const [name,key,type]of [['POSITION','p','VEC3'],['NORMAL','n','VEC3'],['TEXCOORD_0','uv','VEC2']])p.setAttribute(name,doc.createAccessor().setType(type).setArray(new Float32Array(o[key])).setBuffer(buffer));p.setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(o.idx)).setBuffer(buffer));}
await doc.transform(prune());
await mkdir('public/assets/scenery',{recursive:true});await io.write('public/assets/scenery/island-tree.glb',doc);
await writeFile('public/assets/scenery/CREDITS.txt','Island Tree 01 — Poly Haven, CC0 1.0.\nSource: https://polyhaven.com/a/island_tree_01\nOriginal mesh simplified; 1K photographic textures and leaf alpha preserved for broadcast by scripts/build-tree.mjs.\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\n');
console.log(doc.getRoot().listMeshes().flatMap(m=>m.listPrimitives().map(p=>p.getIndices().getCount()/3)));
