import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {clone} from 'three/addons/utils/SkeletonUtils.js';
// One local transfer, shared geometry; each visible rower has an independent skeleton.
let source:Promise<{high:THREE.Group;low:THREE.Group}>|undefined;
export function loadCrew(){return source??=Promise.all([
 new GLTFLoader().loadAsync('/assets/crew/rower.glb'),new GLTFLoader().loadAsync('/assets/crew/rower-low.glb'),
 new THREE.TextureLoader().loadAsync('/assets/crew/skin.jpg')
]).then(([high,low,skin])=>{
 skin.colorSpace=THREE.SRGBColorSpace;skin.flipY=true;skin.anisotropy=4;
 const eyeGeometry=new THREE.SphereGeometry(.012,12,8),irisGeometry=new THREE.SphereGeometry(.0055,12,8);
 const sclera=new THREE.MeshStandardMaterial({color:'#bcb4a6',roughness:.38}),iris=new THREE.MeshStandardMaterial({color:'#23180f',roughness:.3});
 for(const model of [high.scene,low.scene]){
  const eyeBones:THREE.Bone[]=[];
  model.traverse(o=>{if(o instanceof THREE.Mesh){const m=o.material as THREE.MeshStandardMaterial;if(m.name==='skin'){m.map=skin;m.color.set('#c2a18a');m.roughness=.62;}}
   if(o instanceof THREE.Bone&&/^eye[LR]$/.test(o.name))eyeBones.push(o);
  });
  for(const bone of eyeBones){const eye=new THREE.Group();eye.name='eye-decoration';const white=new THREE.Mesh(eyeGeometry,sclera),pupil=new THREE.Mesh(irisGeometry,iris);white.scale.set(1,.85,1);pupil.position.z=-.010;pupil.scale.z=.35;eye.add(white,pupil);bone.add(eye);}
 }
 return {high:high.scene,low:low.scene};
}).catch(e=>{source=undefined;throw e;});}
function createRig(source:THREE.Group,color:string,own:boolean){
 const root=clone(source),bones=new Map<string,THREE.Bone>(),meshes:THREE.SkinnedMesh[]=[],owned:THREE.Material[]=[],eyes:THREE.Object3D[]=[];
 root.traverse(o=>{if(o.name==='eye-decoration')eyes.push(o);if(o instanceof THREE.Bone)bones.set(o.name.replace(/([LR])$/,'.$1'),o);if(o instanceof THREE.SkinnedMesh){meshes.push(o);o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;const m=o.material as THREE.MeshStandardMaterial;if(m.name==='jersey'||m.name==='shorts'){o.material=m.clone();(o.material as THREE.MeshStandardMaterial).color.set(m.name==='jersey'?color:'#efe8d2');owned.push(o.material);}}});
 const pelvis=bones.get('root')!;pelvis.position.y-=.32;
 for(const suffix of ['L','R']){
  bones.get('upperleg01.'+suffix)!.rotation.x=Math.PI*.43;
  bones.get('lowerleg01.'+suffix)!.rotation.x=-Math.PI*.43;
  const wrist=bones.get('wrist.'+suffix)!;
  const wristHead=new THREE.Vector3().fromArray(wrist.userData.head);
  const index=new THREE.Vector3().fromArray(bones.get('finger2-1.'+suffix)!.userData.head),pinky=new THREE.Vector3().fromArray(bones.get('finger5-1.'+suffix)!.userData.head);
  const across=index.sub(pinky).normalize();
  const forward=new THREE.Vector3().fromArray(bones.get('finger3-1.'+suffix)!.userData.head).sub(wristHead);forward.addScaledVector(across,-across.dot(forward)).normalize();
  const back=new THREE.Vector3().crossVectors(across,forward).normalize();
  const shaftCenter=forward.clone().multiplyScalar(.07).addScaledVector(back,-.025);
  root.updateMatrixWorld(true);
  for(let f=1;f<=5;f++){
   const first=bones.get(`finger${f}-1.${suffix}`);if(!first)continue;
   const start=new THREE.Vector3().fromArray(first.userData.head).sub(wristHead);
   const center=shaftCenter.clone().addScaledVector(across,start.dot(across));
   const radial=start.clone().sub(center),radius=Math.max(.024,Math.hypot(radial.dot(forward),radial.dot(back)));
   let angle=Math.atan2(radial.dot(back),radial.dot(forward));
   for(let j=1;j<=3;j++){
    const bone=bones.get(`finger${f}-${j}.${suffix}`);if(!bone)continue;
    const restDirection=new THREE.Vector3().fromArray(bone.userData.tail).sub(new THREE.Vector3().fromArray(bone.userData.head));
    angle-=(f===1?-1:1)*2*Math.asin(Math.min(.95,restDirection.length()/(2*radius)));
    const end=center.clone().addScaledVector(forward,Math.cos(angle)*radius).addScaledVector(back,Math.sin(angle)*radius);
    const q=new THREE.Quaternion().setFromUnitVectors(restDirection.normalize(),end.clone().sub(start).normalize());
    bone.parent!.updateWorldMatrix(true,false);const parentQ=bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    bone.position.copy(start).add(wristHead);bone.position.y-=.32;bone.parent!.worldToLocal(bone.position);
    bone.quaternion.copy(parentQ.invert()).multiply(q);bone.updateMatrixWorld(true);start.copy(end);
   }
  }

 }
 const fullGeometry=meshes.map(m=>m.geometry),povGeometry=new Map<THREE.SkinnedMesh,THREE.BufferGeometry>();
 let firstPerson=false;
 function setFirstPerson(active:boolean){if(active===firstPerson)return;firstPerson=active;eyes.forEach(e=>e.visible=!active);for(const [i,m]of meshes.entries()){
  if(active&&!povGeometry.has(m)){const g=fullGeometry[i].clone(),p=g.getAttribute('position'),indices=Array.from(g.index!.array),visible:number[]=[];for(let j=0;j<indices.length;j+=3)if(indices.slice(j,j+3).every(v=>p.getY(v)<1.4))visible.push(...indices.slice(j,j+3));g.setIndex(visible);povGeometry.set(m,g);}
  m.geometry=active?povGeometry.get(m)!:fullGeometry[i];
 }}
 setFirstPerson(own);
 root.updateMatrixWorld(true);
 const a=new THREE.Vector3(),b=new THREE.Vector3(),q=new THREE.Quaternion(),parentQ=new THREE.Quaternion(),rootQ=new THREE.Quaternion(),mid=new THREE.Vector3(),worldStart=new THREE.Vector3(),rollQ=new THREE.Quaternion();
 function aim(name:string,start:THREE.Vector3,end:THREE.Vector3,roll=0){
  const bone=bones.get(name)!;a.fromArray(bone.userData.head);b.fromArray(bone.userData.tail).sub(a).normalize();a.subVectors(end,start).normalize();q.setFromUnitVectors(b,a).premultiply(rollQ.setFromAxisAngle(a,roll)).premultiply(rootQ);
  bone.parent!.updateWorldMatrix(true,false);worldStart.copy(start).applyMatrix4(root.matrixWorld);bone.position.copy(worldStart);bone.parent!.worldToLocal(bone.position);
  bone.parent!.getWorldQuaternion(parentQ);bone.quaternion.copy(parentQ.invert()).multiply(q);bone.updateMatrixWorld(true);
 }
 const restHand=['L','R'].map(suffix=>{
  const x=new THREE.Vector3().fromArray(bones.get('finger2-1.'+suffix)!.userData.head).sub(new THREE.Vector3().fromArray(bones.get('finger5-1.'+suffix)!.userData.head)).normalize();
  const y=new THREE.Vector3().fromArray(bones.get('finger3-1.'+suffix)!.userData.head).sub(new THREE.Vector3().fromArray(bones.get('wrist.'+suffix)!.userData.head));y.addScaledVector(x,-x.dot(y)).normalize();
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x,y,new THREE.Vector3().crossVectors(x,y))).invert();
 });
 const targetA=new THREE.Vector3(),targetB=new THREE.Vector3(),elbow=new THREE.Vector3(),direction=new THREE.Vector3(),bend=new THREE.Vector3();
 const gripX=new THREE.Vector3(),gripY=new THREE.Vector3(),gripZ=new THREE.Vector3(),gripMatrix=new THREE.Matrix4(),gripQ=new THREE.Quaternion(),forearmAxis=new THREE.Vector3(),restAxis=new THREE.Vector3(),twistDelta=new THREE.Quaternion(),forearmQ=new THREE.Quaternion();
 function arm(side:number,shoulder:THREE.Vector3,hand:THREE.Vector3){
  const suffix=side===0?'L':'R';targetA.copy(shoulder);
  // The shaft lies inside the fingers, 7cm ahead of the wrist, not inside the wrist joint.
  targetB.copy(hand).addScaledVector(gripY,-.07).addScaledVector(gripZ,.025);
  direction.subVectors(targetB,targetA);const distance=Math.min(.505,Math.max(.09,direction.length()));direction.normalize();targetB.copy(targetA).addScaledVector(direction,distance);
  const along=(.23*.23-.28*.28+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,.23*.23-along*along));
  bend.set(side===0?-.4:.4,-1,.15);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
  elbow.copy(targetA).addScaledVector(direction,along).addScaledVector(bend,height);
  mid.copy(targetA).lerp(elbow,.27);aim('upperarm01.'+suffix,targetA,mid);aim('upperarm02.'+suffix,mid,elbow);
  // Spread pronation through both forearm bones instead of twisting only the wrist.
  forearmAxis.subVectors(targetB,elbow).normalize();const forearm=bones.get('lowerarm02.'+suffix)!;
  restAxis.fromArray(forearm.userData.tail).sub(a.fromArray(forearm.userData.head)).normalize();forearmQ.setFromUnitVectors(restAxis,forearmAxis);
  twistDelta.copy(gripQ).multiply(restHand[side]).multiply(forearmQ.invert());
  const raw=2*Math.atan2(twistDelta.x*forearmAxis.x+twistDelta.y*forearmAxis.y+twistDelta.z*forearmAxis.z,twistDelta.w),roll=Math.atan2(Math.sin(raw),Math.cos(raw));
  mid.copy(elbow).lerp(targetB,.5);aim('lowerarm01.'+suffix,elbow,mid,roll*.35);aim('lowerarm02.'+suffix,mid,targetB,roll*.8);
  const wrist=bones.get('wrist.'+suffix)!;wrist.parent!.updateWorldMatrix(true,false);wrist.position.copy(targetB).applyMatrix4(root.matrixWorld);wrist.parent!.worldToLocal(wrist.position);
  wrist.parent!.getWorldQuaternion(parentQ);wrist.quaternion.copy(parentQ.invert()).multiply(rootQ).multiply(gripQ).multiply(restHand[side]);wrist.updateMatrixWorld(true);
 }
 const defaultAxis=new THREE.Vector3(0,1,0);
 function pose(shoulders:THREE.Vector3[],hands:THREE.Vector3[],shaft=defaultAxis,paddleSide=-1){
  root.updateWorldMatrix(true,false);root.getWorldQuaternion(rootQ);
  gripX.copy(shaft).multiplyScalar(-paddleSide).normalize();gripY.set(0,0,-1).addScaledVector(gripX,gripX.z).normalize();gripZ.crossVectors(gripX,gripY);
  gripQ.setFromRotationMatrix(gripMatrix.makeBasis(gripX,gripY,gripZ));arm(0,shoulders[0],hands[0]);arm(1,shoulders[1],hands[1]);
 }
 // Far rowers use a single frozen skin pose. Bone updates are reserved for nearby crew.
 function dispose(){povGeometry.forEach(g=>g.dispose());owned.forEach(m=>m.dispose());meshes.forEach(m=>{m.skeleton.dispose();});}
 return {root,pose,dispose,meshes,setFirstPerson};
}

// Share the baked distant pose across rowers and rematches: no per-seat vertex baking.
const distantCache=new WeakMap<THREE.Group,THREE.Group>();
function distantCrew(source:THREE.Group){
 const cached=distantCache.get(source);if(cached)return cached;
 const model=createRig(source,'#ffffff',false),low=new THREE.Group();
 model.pose([new THREE.Vector3(-.17,1.05,-.015),new THREE.Vector3(.17,1.05,-.015)],[new THREE.Vector3(-.4,.95,-.42),new THREE.Vector3(-.13,1.35,-.42)]);model.root.updateMatrixWorld(true);
 const point=new THREE.Vector3();
 for(const skinned of model.meshes){skinned.skeleton.update();const geometry=skinned.geometry.clone(),p=geometry.getAttribute('position');for(let i=0;i<p.count;i++){point.fromBufferAttribute(p,i);skinned.applyBoneTransform(i,point);p.setXYZ(i,point.x,point.y,point.z);}geometry.computeVertexNormals();const material=(skinned.material as THREE.Material).clone(),mesh=new THREE.Mesh(geometry,material);mesh.applyMatrix4(skinned.matrixWorld);mesh.castShadow=true;mesh.receiveShadow=true;low.add(mesh);}
 model.dispose();distantCache.set(source,low);return low;
}
export function createCrew(source:{high:THREE.Group;low:THREE.Group},color:string,own:boolean){
 const rig=createRig(source.high,color,own),root=new THREE.Group();root.add(rig.root);
 let low:THREE.Group|undefined,near=true;const lowMaterials:THREE.Material[]=[],distantMeshes:THREE.Mesh[]=[];
 function freeze(){
  if(low||own)return;low=distantCrew(source.low).clone(true);low.visible=false;
  low.traverse(o=>{if(o instanceof THREE.Mesh){distantMeshes.push(o);const m=o.material as THREE.MeshStandardMaterial;if(m.name==='jersey'){o.material=m.clone();(o.material as THREE.MeshStandardMaterial).color.set(color);lowMaterials.push(o.material);}}});
 }
 freeze();
 return {root,distantMeshes,pose:rig.pose,setFirstPerson:rig.setFirstPerson,setDetail(active:boolean){active||=own;if(active===near)return;near=active;if(low)low.visible=!active;if(active){if(low)root.remove(low);root.add(rig.root);}else{freeze();root.remove(rig.root);if(low)root.add(low);}},dispose(){rig.dispose();lowMaterials.forEach(m=>m.dispose());}};
}
