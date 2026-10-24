import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
// One local transfer, shared geometry; each visible rower has an independent skeleton.
let source:Promise<{high:THREE.Group;low:THREE.Group}>|undefined;
export function loadCrew(){return source??=Promise.all(['rower.glb','rower-low.glb'].map(file=>new GLTFLoader().loadAsync('/assets/crew/'+file))).then(([high,low])=>({high:high.scene,low:low.scene})).catch(e=>{source=undefined;throw e;});}
const up=new THREE.Vector3(0,1,0);
function createRig(source:THREE.Group,color:string,own:boolean){
 const root=clone(source),bones=new Map<string,THREE.Bone>(),meshes:THREE.SkinnedMesh[]=[],owned:THREE.Material[]=[];
 root.traverse(o=>{if(o instanceof THREE.Bone)bones.set(o.name.replace(/([LR])$/,'.$1'),o);if(o instanceof THREE.SkinnedMesh){meshes.push(o);o.frustumCulled=false;const m=o.material as THREE.MeshStandardMaterial;if(m.name==='jersey'){o.material=m.clone();(o.material as THREE.MeshStandardMaterial).color.set(color);owned.push(o.material);}}});
 const pelvis=bones.get('root')!;pelvis.position.y-=.32;
 for(const suffix of ['L','R']){
  bones.get('upperleg01.'+suffix)!.rotation.x=Math.PI*.43;
  bones.get('lowerleg01.'+suffix)!.rotation.x=-Math.PI*.43;
  for(let f=1;f<=5;f++)for(let j=1;j<=3;j++){const b=bones.get(`finger${f}-${j}.${suffix}`);if(b)b.rotation.x=j===1?.35:1.15;}
 }
 const fullGeometry=meshes.map(m=>m.geometry),povGeometry=new Map<THREE.SkinnedMesh,THREE.BufferGeometry>();
 function setFirstPerson(active:boolean){for(const [i,m]of meshes.entries()){
  if(active&&!povGeometry.has(m)){const g=fullGeometry[i].clone(),p=g.getAttribute('position'),indices=Array.from(g.index!.array),visible:number[]=[];for(let j=0;j<indices.length;j+=3)if(indices.slice(j,j+3).every(v=>p.getY(v)<1.4))visible.push(...indices.slice(j,j+3));g.setIndex(visible);povGeometry.set(m,g);}
  m.geometry=active?povGeometry.get(m)!:fullGeometry[i];
 }}
 setFirstPerson(own);
 root.updateMatrixWorld(true);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),q=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),mid=new THREE.Vector3();
 function aim(name:string,start:THREE.Vector3,end:THREE.Vector3){
  const bone=bones.get(name)!;a.fromArray(bone.userData.head);b.fromArray(bone.userData.tail).sub(a).normalize();q.setFromUnitVectors(b,end.clone().sub(start).normalize());
  bone.parent!.updateWorldMatrix(true,false);bone.position.copy(start);bone.parent!.worldToLocal(bone.position);
  bone.parent!.getWorldQuaternion(parentQ);bone.quaternion.copy(parentQ.invert()).multiply(q);bone.updateMatrixWorld(true);
 }
 // Work in the model's local space. Temporarily identity transforms avoid converting every bone target.
 const targetA=new THREE.Vector3(),targetB=new THREE.Vector3(),elbow=new THREE.Vector3(),direction=new THREE.Vector3();
 function arm(side:number,shoulder:THREE.Vector3,hand:THREE.Vector3){
  const suffix=side===0?'L':'R';targetA.copy(shoulder);targetB.copy(hand);
  // Analytic two-link IK: clamp reach to measured upper/forearm lengths; elbow bends outward/downward.
  direction.subVectors(targetB,targetA);const distance=Math.min(.535,Math.max(.09,direction.length()));direction.normalize();targetB.copy(targetA).addScaledVector(direction,distance);
  const along=(.245*.245-.295*.295+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,.245*.245-along*along));
  const bend=new THREE.Vector3(side===0?-.4:.4,-1,.15).addScaledVector(direction,-new THREE.Vector3(side===0?-.4:.4,-1,.15).dot(direction)).normalize();
  elbow.copy(targetA).addScaledVector(direction,along).addScaledVector(bend,height);
  mid.copy(targetA).lerp(elbow,.27);aim('upperarm01.'+suffix,targetA,mid);aim('upperarm02.'+suffix,mid,elbow);
  mid.copy(elbow).lerp(targetB,.5);aim('lowerarm01.'+suffix,elbow,mid);aim('lowerarm02.'+suffix,mid,targetB);
  // Wrist continues along the forearm; finger joints curl around the paddle grip.
  targetB.z+=.035;aim('wrist.'+suffix,targetB,targetB.clone().add(new THREE.Vector3(0,-.015,-.065)));
 }
 function pose(shoulders:THREE.Vector3[],hands:THREE.Vector3[]){
  const parent=root.parent;parent?.remove(root);root.updateMatrixWorld(true);arm(0,shoulders[0],hands[0]);arm(1,shoulders[1],hands[1]);parent?.add(root);
 }
 // Far rowers use a single frozen skin pose. Bone updates are reserved for nearby crew.
 function dispose(){povGeometry.forEach(g=>g.dispose());owned.forEach(m=>m.dispose());meshes.forEach(m=>{m.skeleton.dispose();});}
 return {root,pose,dispose,meshes,setFirstPerson};
}

export function createCrew(source:{high:THREE.Group;low:THREE.Group},color:string,own:boolean){
 const rig=createRig(source.high,color,own),root=new THREE.Group();root.add(rig.root);
 let low:THREE.Group|undefined,near=true;const lowGeometry:THREE.BufferGeometry[]=[],lowMaterials:THREE.Material[]=[];
 function freeze(){
  if(low||own)return;const model=createRig(source.low,color,false);low=new THREE.Group();
  const shoulders=[new THREE.Vector3(-.22,1.06,-.04),new THREE.Vector3(.22,1.06,-.04)];
  model.pose(shoulders,[new THREE.Vector3(-.34,.91,-.29),new THREE.Vector3(-.07,1.27,-.38)]);model.root.updateMatrixWorld(true);
  const point=new THREE.Vector3();for(const skinned of model.meshes){skinned.skeleton.update();const geometry=skinned.geometry.clone(),p=geometry.getAttribute('position');for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i);skinned.applyBoneTransform(i,point);p.setXYZ(i,point.x,point.y,point.z);}geometry.computeVertexNormals();const material=(skinned.material as THREE.Material).clone(),mesh=new THREE.Mesh(geometry,material);mesh.applyMatrix4(skinned.matrixWorld);low.add(mesh);lowGeometry.push(geometry);lowMaterials.push(material);}model.dispose();
 }
 return {root,pose:rig.pose,setFirstPerson:rig.setFirstPerson,setDetail(active:boolean){active||=own;if(active===near)return;near=active;if(active){if(low)root.remove(low);root.add(rig.root);}else{freeze();root.remove(rig.root);if(low)root.add(low);}},dispose(){rig.dispose();lowGeometry.forEach(g=>g.dispose());lowMaterials.forEach(m=>m.dispose());}};
}
