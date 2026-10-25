import * as THREE from 'three';

/** Game-scaled Chundan Vallam section. Forward is -z; the raised stern is +z. */
export function chundanSection(u: number) {
  const t=Math.min(1,Math.abs(u));
  const end=Math.max(0,(t-.72)/.28);
  const rise=(u>0?2.8:.52)*end*end*(3-2*end);
  return {width:Math.max(.012,.78*Math.pow(Math.max(0,1-t**4),.6)),rise,rim:.46+rise};
}

/** Closed timber shell, with curved outer/inner surfaces and a real gunwale thickness. */
export function createChundanHull() {
  const positions:number[]=[],uvs:number[]=[],indices:number[]=[];
  const sections=96,arc=20,ring=(arc+1)*2;
  for(let i=0;i<=sections;i++){
    const u=i/sections*2-1,{width,rise}=chundanSection(u);
    for(let inner=0;inner<2;inner++)for(let j=0;j<=arc;j++){
      const angle=(inner?1-j/arc:j/arc)*Math.PI-Math.PI/2;
      positions.push(Math.max(.006,width-inner*.042)*Math.sin(angle),rise-.30+inner*.055+(.76-inner*.055)*(1-Math.cos(angle)),u);
      uvs.push(i/sections*8,(inner?2:0)+j/arc);
    }
  }
  for(let i=0;i<sections;i++)for(let j=0;j<ring;j++){
    const a=i*ring+j,b=i*ring+(j+1)%ring,c=b+ring,d=a+ring;indices.push(a,b,d,b,c,d);
  }
  // End caps keep the tips solid in first person and at low viewing angles.
  for(const [offset,reverse]of [[0,true],[sections*ring,false]] as const)for(let j=1;j<ring-1;j++)indices.push(offset,offset+(reverse?j+1:j),offset+(reverse?j:j+1));
  const hull=new THREE.BufferGeometry();hull.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));hull.setAttribute('uv',new THREE.Float32BufferAttribute(uvs,2));hull.setIndex(indices);hull.computeVertexNormals();return hull;
}
