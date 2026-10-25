import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {createCrew} from '../app/crew.ts';
import {paddlePose,PADDLE_LEAN} from '../app/rowing.ts';
const data=await readFile(new URL('../public/assets/crew/rower.glb',import.meta.url));
const {scene}=await new GLTFLoader().parseAsync(data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength),'');
test('both paddle grips stay within 2 cm through catch, drive and recovery, with unchanged arm/finger lengths',()=>{
 const crew=createCrew({high:scene,low:scene},'#ffffff',true),bones=new Map<string,THREE.Bone>();crew.root.traverse(o=>{if(o instanceof THREE.Bone)bones.set(o.name,o);});
 const visible: {mesh:THREE.SkinnedMesh;indices:number[]}[]=[];crew.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)visible.push({mesh:o,indices:[...new Set(Array.from(o.geometry.index!.array))]});});
 const camera=new THREE.Vector3(0,1.32,.24);
 const pos=(b:THREE.Object3D)=>b.getWorldPosition(new THREE.Vector3());
 try{for(const side of [-1,1]){const previous=new Map<string,THREE.Quaternion>();for(let age=0;age<.72;age+=.01){
 const stroke=paddlePose(age),paddle=new THREE.Object3D();paddle.position.set(side*.35,stroke.y,stroke.z+.03);paddle.rotation.set(stroke.pitch,stroke.feather,side*PADDLE_LEAN);crew.pose(paddle,side);crew.root.updateMatrixWorld(true);
 if(Math.round(age*100)%10===0)for(const {mesh,indices}of visible){for(const index of indices){const v=new THREE.Vector3().fromBufferAttribute(mesh.geometry.getAttribute('position'),index);mesh.applyBoneTransform(index,v);v.applyMatrix4(mesh.matrixWorld);assert.ok(v.distanceTo(camera)>.045,'visible skin intersects the POV camera');}}
 for(const [name,bone]of bones){if(!/wrist|lowerarm/.test(name))continue;const q=bone.getWorldQuaternion(new THREE.Quaternion()),last=previous.get(name);if(last)assert.ok(last.angleTo(q)<.5,`discontinuous ${name} at ${age}`);previous.set(name,q);}
 for(const [i,suffix]of ['L','R'].entries()){
  const wrist=bones.get('wrist'+suffix)!,head=new THREE.Vector3().fromArray(wrist.userData.head);
  const across=new THREE.Vector3().fromArray(bones.get('finger2-1'+suffix)!.userData.head).sub(new THREE.Vector3().fromArray(bones.get('finger5-1'+suffix)!.userData.head)).normalize();
  const forward=new THREE.Vector3().fromArray(bones.get('finger3-1'+suffix)!.userData.head).sub(head);forward.addScaledVector(across,-across.dot(forward)).normalize();
  const back=new THREE.Vector3().crossVectors(across,forward),grip=forward.multiplyScalar(.09).addScaledVector(back,-.018).applyQuaternion(wrist.getWorldQuaternion(new THREE.Quaternion())).add(pos(wrist));
  const expected=new THREE.Vector3(0,i===(side>0?1:0)?.04:.42,0).applyMatrix4(paddle.matrix);
  assert.ok(expected.y<1.19,'hand obstructs forward horizon');
  assert.ok(expected.x*side>.16,'hand enters central sightline');
  assert.ok(grip.distanceTo(expected)<.02,`${side}, ${age}: grip error ${grip.distanceTo(expected)}`);
  for(const [a,b]of [['upperarm01','upperarm02'],['upperarm02','lowerarm01'],['lowerarm01','lowerarm02'],['lowerarm02','wrist']]){
   const bone=bones.get(a+suffix)!,length=new THREE.Vector3().fromArray(bone.userData.tail).distanceTo(new THREE.Vector3().fromArray(bone.userData.head));assert.ok(Math.abs(pos(bone).distanceTo(pos(bones.get(b+suffix)!))-length)<1e-5,`${a}: stretched`);
  }
  // Distal fingertips wrap within 3 cm of their handle/shaft axis.
  const axis=new THREE.Vector3(i===(side>0?1:0)?0:1,i===(side>0?1:0)?1:0,0).applyQuaternion(paddle.quaternion);
  for(let f=1;f<=5;f++){
   const tipBone=bones.get(`finger${f}-3${suffix}`)!;
   const tip=new THREE.Vector3().fromArray(tipBone.userData.tail).sub(new THREE.Vector3().fromArray(tipBone.userData.head)).applyQuaternion(tipBone.getWorldQuaternion(new THREE.Quaternion())).add(pos(tipBone)).sub(expected);
   tip.addScaledVector(axis,-tip.dot(axis));assert.ok(tip.length()<.03,`finger ${f} off grip: ${tip.length()}`);
  }
  for(let f=1;f<=5;f++)for(let j=1;j<3;j++){
   const bone=bones.get(`finger${f}-${j}${suffix}`)!,next=bones.get(`finger${f}-${j+1}${suffix}`)!;const length=new THREE.Vector3().fromArray(bone.userData.tail).distanceTo(new THREE.Vector3().fromArray(bone.userData.head));assert.ok(Math.abs(pos(bone).distanceTo(pos(next))-length)<1e-5,'finger stretched');
  }
 }
 }}}finally{crew.dispose();}
});
