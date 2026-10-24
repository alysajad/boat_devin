// Reproducible conversion of the CC0 MakeHuman base + default rig. No runtime OBJ parser.
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import * as T from 'three';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();});}readAsDataURL(blob){blob.arrayBuffer().then(b=>{this.result='data:application/octet-stream;base64,'+Buffer.from(b).toString('base64');this.onloadend?.();});}};
const obj=await readFile('assets/source/base.obj','utf8'),rig=JSON.parse(await readFile('assets/source/default.mhskel','utf8')),weights=JSON.parse(await readFile('assets/source/default_weights.mhw','utf8')).weights;
const vertices=[],faces=[];let group='';
for(const line of obj.split('\n')){const p=line.trim().split(/\s+/);if(p[0]==='v')vertices.push(p.slice(1,4).map(Number));if(p[0]==='g')group=p[1];if(p[0]==='f'&&group==='body'){const ids=p.slice(1).map(s=>Number(s.split('/')[0])-1);for(let i=1;i<ids.length-1;i++)faces.push([ids[0],ids[i],ids[i+1]]);}}
const point=v=>new T.Vector3(-v[0]*.1,v[1]*.1+.84488,-v[2]*.1);
const names=Object.keys(rig.bones),heads={},bones={},tails={};
for(const name of names){const b=rig.bones[name];for(const [key,dest]of [['head',heads],['tail',tails]]){const ids=rig.joints[b[key]];dest[name]=point([0,1,2].map(k=>ids.reduce((sum,id)=>sum+vertices[id][k],0)/ids.length));}const bone=new T.Bone();bone.name=name;bone.userData={head:heads[name].toArray(),tail:tails[name].toArray()};bones[name]=bone;}
for(const name of names){const parent=rig.bones[name].parent;bones[name].position.copy(heads[name]);if(parent){bones[parent].add(bones[name]);bones[name].position.sub(heads[parent]);}}
const influences=vertices.map(()=>[]);for(const[name,entries]of Object.entries(weights))for(const[index,weight]of entries)influences[index].push([names.indexOf(name),weight]);
const positions=[],skinIndex=[],skinWeight=[];for(let i=0;i<vertices.length;i++){positions.push(...point(vertices[i]).toArray());const w=influences[i].sort((a,b)=>b[1]-a[1]).slice(0,4);while(w.length<4)w.push([names.indexOf('root'),0]);const sum=w.reduce((s,v)=>s+v[1],0)||1;skinIndex.push(...w.map(v=>v[0]));skinWeight.push(...w.map(v=>v[1]/sum));}
const scene=new T.Scene(),materials=[new T.MeshStandardMaterial({name:'skin',color:'#a97954',roughness:.72}),new T.MeshStandardMaterial({name:'jersey',color:'#45645e',roughness:1}),new T.MeshStandardMaterial({name:'shorts',color:'#303837',roughness:1}),new T.MeshStandardMaterial({name:'hair',color:'#242420',roughness:1})];
const groups=[[],[],[],[]];for(const face of faces){const p=[0,1,2].map(k=>face.reduce((s,i)=>s+vertices[i][k],0)/3);let m=0;if(p[1]>-.6&&p[1]<5.4&&Math.abs(p[0])<2.3)m=1;if(p[1]>-3&&p[1]<=-.6)m=2;if(p[1]>7.9||(p[1]>7.15&&p[2]<-.25))m=3;groups[m].push(...face);}
const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(positions,3));g.setAttribute('skinIndex',new T.Uint16BufferAttribute(skinIndex,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(skinWeight,4));g.setIndex(groups.flat());let start=0;groups.forEach((ids,i)=>{g.addGroup(start,ids.length,i);start+=ids.length;});g.computeVertexNormals();
const mesh=new T.SkinnedMesh(g,materials);mesh.name='Rower';mesh.add(bones.root);scene.add(mesh);scene.updateMatrixWorld(true);mesh.bind(new T.Skeleton(names.map(n=>bones[n])));
const data=await new GLTFExporter().parseAsync(scene,{binary:true,onlyVisible:false});await mkdir('public/assets/crew',{recursive:true});await writeFile('public/assets/crew/rower.glb',Buffer.from(data));
await writeFile('public/assets/crew/CREDITS.txt','Rower anatomy and rig: MakeHuman Community base mesh and default rig, CC0 1.0.\nCopyright (c) MakeHuman Community; rig weights (c) 2021 Data Collection AB, Joel Palmius, Jonas Hauquier.\nSource: https://github.com/makehumancommunity/makehuman/tree/master/makehuman/data\nConverted, dressed, and posed for Kerala Boat Race by scripts/build-crew.mjs.\nLicense: https://creativecommons.org/publicdomain/zero/1.0/\n');
console.log(`${faces.length} triangles, ${names.length} bones, ${data.byteLength} bytes`);

// Remove unused OBJ helper vertices and generate the distant crew LOD.
const {NodeIO}=await import('@gltf-transform/core'),{prune,weld,simplify}=await import('@gltf-transform/functions'),{MeshoptSimplifier}=await import('meshoptimizer');await MeshoptSimplifier.ready;const io=new NodeIO(),doc=await io.read('public/assets/crew/rower.glb');await doc.transform(prune(),weld());await io.write('public/assets/crew/rower.glb',doc);await doc.transform(simplify({simplifier:MeshoptSimplifier,ratio:.08,error:.015}),prune());await io.write('public/assets/crew/rower-low.glb',doc);
