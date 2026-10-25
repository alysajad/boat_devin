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
  const shaftCenter=forward.clone().multiplyScalar(.09).addScaledVector(back,-.018);
  root.updateMatrixWorld(true);
  for(let f=1;f<=5;f++){
   const first=bones.get(`finger${f}-1.${suffix}`);if(!first)continue;
   const start=new THREE.Vector3().fromArray(first.userData.head).sub(wristHead);
   const center=shaftCenter.clone().addScaledVector(across,start.dot(across));
   const radial=start.clone().sub(center);let radius=Math.hypot(radial.dot(forward),radial.dot(back));
   let angle=Math.atan2(radial.dot(back),radial.dot(forward));
   for(let j=1;j<=3;j++){
    const bone=bones.get(`finger${f}-${j}.${suffix}`);if(!bone)continue;
    const restDirection=new THREE.Vector3().fromArray(bone.userData.tail).sub(new THREE.Vector3().fromArray(bone.userData.head));
    const length=restDirection.length(),nextRadius=Math.max(.024,radius-length*.85);
    angle-=(f===1?-1:1)*Math.acos(THREE.MathUtils.clamp((radius*radius+nextRadius*nextRadius-length*length)/(2*radius*nextRadius),-1,1));radius=nextRadius;
    const end=center.clone().addScaledVector(forward,Math.cos(angle)*radius).addScaledVector(back,Math.sin(angle)*radius);
    const q=new THREE.Quaternion().setFromUnitVectors(restDirection.normalize(),end.clone().sub(start).normalize());
    bone.parent!.updateWorldMatrix(true,false);const parentQ=bone.parent!.getWorldQuaternion(new THREE.Quaternion());
    bone.position.copy(start).add(wristHead);bone.position.y-=.32;bone.parent!.worldToLocal(bone.position);
    bone.quaternion.copy(parentQ.invert()).multiply(q);bone.updateMatrixWorld(true);start.copy(end);
   }
  }

 }
 const cameraBones=new Set<THREE.Bone>();bones.get('neck01')!.traverse(o=>{if(o instanceof THREE.Bone)cameraBones.add(o);});
 const fullGeometry=meshes.map(m=>m.geometry),povGeometry=new Map<THREE.SkinnedMesh,THREE.BufferGeometry>();
 let firstPerson=false;
 function setFirstPerson(active:boolean){if(active===firstPerson)return;firstPerson=active;eyes.forEach(e=>e.visible=!active);for(const [i,m]of meshes.entries()){
  if(active&&!povGeometry.has(m)){const g=fullGeometry[i].clone(),indices=Array.from(g.index!.array),visible:number[]=[];for(let j=0;j<indices.length;j+=3)if(indices.slice(j,j+3).every(v=>{const skin=g.getAttribute('skinIndex'),weights=g.getAttribute('skinWeight');let headWeight=0;for(let k=0;k<4;k++)if(cameraBones.has(m.skeleton.bones[skin.getComponent(v,k)]))headWeight+=weights.getComponent(v,k);return headWeight<.5;}))visible.push(...indices.slice(j,j+3));g.setIndex(visible);povGeometry.set(m,g);}
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
 const anatomy=['L','R'].map(suffix=>{
  const length=(name:string)=>new THREE.Vector3().fromArray(bones.get(name+'.'+suffix)!.userData.tail).distanceTo(new THREE.Vector3().fromArray(bones.get(name+'.'+suffix)!.userData.head));
  const upper1=length('upperarm01'),upper2=length('upperarm02'),lower1=length('lowerarm01'),lower2=length('lowerarm02');
  const shoulder=new THREE.Vector3().fromArray(bones.get('upperarm01.'+suffix)!.userData.head);shoulder.y+=pelvis.position.y-new THREE.Vector3().fromArray(pelvis.userData.head).y;
  return {shoulder,upper:upper1+upper2,lower:lower1+lower2,upperFraction:upper1/(upper1+upper2),lowerFraction:lower1/(lower1+lower2)};
 });
 const targetA=new THREE.Vector3(),targetB=new THREE.Vector3(),elbow=new THREE.Vector3(),direction=new THREE.Vector3(),bend=new THREE.Vector3();
 const gripX=new THREE.Vector3(),gripY=new THREE.Vector3(),gripZ=new THREE.Vector3(),gripMatrix=new THREE.Matrix4(),gripQ=new THREE.Quaternion(),forearmAxis=new THREE.Vector3(),restAxis=new THREE.Vector3(),twistDelta=new THREE.Quaternion(),forearmQ=new THREE.Quaternion();
 function arm(side:number,hand:THREE.Vector3){
  const suffix=side===0?'L':'R',shape=anatomy[side];targetA.copy(shape.shoulder);
  // The shaft lies inside the fingers, 9cm ahead of the wrist, not inside the wrist joint.
  targetB.copy(hand).addScaledVector(gripY,-.09).addScaledVector(gripZ,.018);
  direction.subVectors(targetB,targetA);const distance=direction.length();direction.normalize();
  const along=(shape.upper**2-shape.lower**2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,shape.upper**2-along*along));
  bend.set(side===0?-.4:.4,-1,.15);bend.addScaledVector(direction,-bend.dot(direction)).normalize();
  elbow.copy(targetA).addScaledVector(direction,along).addScaledVector(bend,height);
  mid.copy(targetA).lerp(elbow,shape.upperFraction);aim('upperarm01.'+suffix,targetA,mid);aim('upperarm02.'+suffix,mid,elbow);
  // Spread pronation through both forearm bones instead of twisting only the wrist.
  forearmAxis.subVectors(targetB,elbow).normalize();const forearm=bones.get('lowerarm02.'+suffix)!;
  restAxis.fromArray(forearm.userData.tail).sub(a.fromArray(forearm.userData.head)).normalize();forearmQ.setFromUnitVectors(restAxis,forearmAxis);
  twistDelta.copy(gripQ).multiply(restHand[side]).multiply(forearmQ.invert());
  const raw=2*Math.atan2(twistDelta.x*forearmAxis.x+twistDelta.y*forearmAxis.y+twistDelta.z*forearmAxis.z,twistDelta.w),roll=Math.atan2(Math.sin(raw),Math.cos(raw));
  mid.copy(elbow).lerp(targetB,shape.lowerFraction);aim('lowerarm01.'+suffix,elbow,mid,roll*.35);aim('lowerarm02.'+suffix,mid,targetB,roll*.8);
  const wrist=bones.get('wrist.'+suffix)!;wrist.parent!.updateWorldMatrix(true,false);wrist.position.copy(targetB).applyMatrix4(root.matrixWorld);wrist.parent!.worldToLocal(wrist.position);
  wrist.parent!.getWorldQuaternion(parentQ);wrist.quaternion.copy(parentQ.invert()).multiply(rootQ).multiply(gripQ).multiply(restHand[side]);wrist.updateMatrixWorld(true);
 }
 const hands=[new THREE.Vector3(),new THREE.Vector3()],offsets=[new THREE.Vector3(),new THREE.Vector3()],orientations=[new THREE.Quaternion(),new THREE.Quaternion()];
 const correction=new THREE.Vector3(),wristPoint=new THREE.Vector3();
 function pose(paddle:THREE.Object3D,paddleSide=-1){
  root.updateWorldMatrix(true,false);root.getWorldQuaternion(rootQ);
  // Lower hand wraps the shaft; opposite hand wraps the transverse top handle.
  for(let i=0;i<2;i++){
   const lower=i===(paddleSide>0?1:0);
   gripX.set(lower?0:1,lower?1:0,0).applyQuaternion(paddle.quaternion).multiplyScalar(lower?-paddleSide:paddleSide).normalize();
   gripY.set(0,0,-1).addScaledVector(gripX,gripX.z).normalize();gripZ.crossVectors(gripX,gripY);
   orientations[i].setFromRotationMatrix(gripMatrix.makeBasis(gripX,gripY,gripZ));
   hands[i].set(0,lower?.04:.42,0).applyQuaternion(paddle.quaternion);
   offsets[i].copy(hands[i]).addScaledVector(gripY,-.09).addScaledVector(gripZ,.018);
  }
  // Project ONE rigid paddle into the intersection of both arms' reachable workspaces.
  // This preserves both grips and bone lengths, with a small natural elbow bend.
  const top=paddleSide>0?0:1;
  for(let iteration=0;iteration<64;iteration++){
   // Keep the handle below eye level and beside the forward sightline in every view.
   paddle.position.y=Math.min(paddle.position.y,anatomy[top].shoulder.y+.12-hands[top].y);
   const inboard=(paddle.position.x+hands[top].x)*paddleSide;
   if(inboard<.18)paddle.position.x+=paddleSide*(.18-inboard);
   let error=0;
   for(let i=0;i<2;i++){
    const shape=anatomy[i];wristPoint.copy(paddle.position).add(offsets[i]);correction.subVectors(wristPoint,shape.shoulder);
    const distance=correction.length(),reach=THREE.MathUtils.clamp(distance,Math.abs(shape.upper-shape.lower)+.035,(shape.upper+shape.lower)*.97);
    error=Math.max(error,Math.abs(distance-reach));if(distance>0)paddle.position.addScaledVector(correction,(reach-distance)/distance);
   }
   if(error<1e-7)break;
  }
  paddle.updateMatrix();
  for(let i=0;i<2;i++){
   gripQ.copy(orientations[i]);gripY.set(0,1,0).applyQuaternion(gripQ);gripZ.set(0,0,1).applyQuaternion(gripQ);
   hands[i].add(paddle.position);arm(i,hands[i]);
  }
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
 const paddle=new THREE.Object3D();paddle.position.set(-.35,1.03,-.29);paddle.rotation.set(-.22,0,-.65);model.pose(paddle);model.root.updateMatrixWorld(true);
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
