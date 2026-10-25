import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import { WATER_LEVEL } from './world';

export type SceneQuality = 'low' | 'medium' | 'high';
type Assets = {
  geometry<T extends THREE.BufferGeometry>(g: T): T;
  material(color: string, roughness?: number): THREE.MeshStandardMaterial;
  wood: THREE.Material; deck: THREE.Material; trim: THREE.Material;
};
type Placement = { key: string; matrix: THREE.Matrix4 };
const CHUNK_LENGTH = 40;
const noise = (n: number) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

/** Static GPU buffers change only when a bounded set of 40m chunks changes. */
export function createScenery(scene: THREE.Scene, assets: Assets, broadcast: boolean, riverWidth = 40) {
  const { geometry, material, wood, deck, trim } = assets;
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const round = geometry(new THREE.SphereGeometry(1, 16, 10));
  const foliage = geometry(new THREE.SphereGeometry(1,24,16));
  const foliagePositions = foliage.getAttribute('position');
  const foliageColors: number[] = [];
  for(let i=0;i<foliagePositions.count;i++){
    const x=foliagePositions.getX(i),y=foliagePositions.getY(i),z=foliagePositions.getZ(i);
    const variation=Math.sin(x*13+y*7)*Math.sin(z*11-y*8),r=1+variation*.065;
    foliagePositions.setXYZ(i,x*r,y*r,z*r);
    const tone=.78+variation*.08+Math.max(0,y)*.22;foliageColors.push(tone,tone,tone);
  }
  foliage.setAttribute('color',new THREE.Float32BufferAttribute(foliageColors,3));foliage.computeVertexNormals();
  const foliageMaterial=material('#52794b');foliageMaterial.vertexColors=true;
  const trunk = geometry(new THREE.CylinderGeometry(.52, 1, 1, 12, 48));
  const barkColors:number[]=[],barkPosition=trunk.getAttribute('position');
  for(let i=0;i<barkPosition.count;i++){const y=barkPosition.getY(i),ring=Math.sin((y+.5)*Math.PI*70);barkPosition.setX(i,barkPosition.getX(i)+Math.sin((y+.5)*Math.PI)*.6);const c=.55+(ring>0?.20:0)+noise(i)*.05;barkColors.push(c,c*.94,c*.8);}
  trunk.setAttribute('color',new THREE.Float32BufferAttribute(barkColors,3));trunk.computeVertexNormals();const barkMaterial=material('#b9ae90');barkMaterial.vertexColors=true;
  const roof = geometry(new THREE.ConeGeometry(1, 1, 4));
  const leaf = material('#54744a'); leaf.side = THREE.DoubleSide;
  const frond = geometry(new THREE.BufferGeometry());
  const leaves: number[]=[];
  const spine=(t:number)=>new THREE.Vector3(0,.32*Math.sin(t*Math.PI)-.7*t*t,-3.4*t);
  for(let i=0;i<24;i++){
    const t=(i+.4)/25,a=spine(t),b=spine(t+.025);
    // Separate curved leaflets give the silhouette fine gaps instead of a solid triangle.
    for(const sign of [-1,1]){
      const width=Math.sin(t*Math.PI)*.53;
      const tip=new THREE.Vector3(sign*width,a.y-.14,a.z-.38);
      const middle=new THREE.Vector3(sign*width*.65,a.y+.035,a.z-.13);
      leaves.push(...a.toArray(),...middle.toArray(),...tip.toArray(),...a.toArray(),...tip.toArray(),...b.toArray());
    }
    leaves.push(-.018,a.y,a.z,.018,a.y,a.z,0,b.y,b.z);
  }
  frond.setAttribute('position',new THREE.Float32BufferAttribute(leaves,3));frond.computeVertexNormals();
  const definitions: Record<string, [THREE.BufferGeometry, THREE.Material, number]> = {
    trunk: [trunk, barkMaterial, 7 * 9], leaf: [frond, leaf, 7 * (9 * 8 + 32)],
    bush: [foliage, foliageMaterial, 7 * 32], bank: [round, material('#6b854f'), 7 * 10],
    buoy: [round, trim, 7 * 24], wall: [box, material('#e1d8b5'), 7 * 3],
    roof: [roof, material('#9c5236'), 7 * 2], timber: [box, wood, 7 * 40],
    reed: [round, material('#c1a264'), 7 * 2], hull: [round, wood, 7 * 2],
    deck: [box, deck, 7 * 3], shade: [box, material('#315c55'), 7 * 10],
  };
  const batches = new Map<string, THREE.InstancedMesh>();
  for (const [key, [g, m, capacity]] of Object.entries(definitions)) {
    const mesh = new THREE.InstancedMesh(g, m, capacity);
    mesh.count = 0; mesh.frustumCulled = false; mesh.name = `shore-${key}`;
    scene.add(mesh); batches.set(key, mesh);
  }
  const chunks = new Map<number, Placement[]>();
  let disposed=false;
  const treeKeys:string[]=[],treeMaterials:THREE.Material[]=[],treeTextures=new Set<THREE.Texture>();
  let key = '', seed = 0;
  const transform = new THREE.Object3D();
  function generate(id: number, quality: SceneQuality) {
    const placed: Placement[] = [];
    const put = (key: string, x: number, y: number, z: number, sx: number, sy: number, sz: number, ry = 0, rz = 0) => {
      transform.position.set(x, y, z); transform.scale.set(sx, sy, sz); transform.rotation.set(0, ry, rz);
      transform.updateMatrix(); placed.push({ key, matrix: transform.matrix.clone() });
    };
    const rand = (i: number) => noise(id * 371 + seed * 17 + i);
    const z0 = -id * CHUNK_LENGTH;
    const palms = quality === 'low' ? 4 : 8;
    for (let i = 0; i < palms; i++) {
      const side = i % 2 ? 1 : -1, x = side * (riverWidth/2+2 + rand(i) * 5), z = z0 - Math.floor(i / 2) * (80 / palms) - rand(i + 20) * 3;
      const h = 5 + rand(i + 60) * 2.4;
      put('trunk', x, h / 2, z, .17, h, .17, 0, (rand(i + 70) - .5) * .12);
      for (let j = 0; j < 7; j++) put('leaf', x, h, z, 1, 1, 1, j * Math.PI * 2 / 7 + rand(i + 80));
      if(!treeKeys.length)put('bush', x + side * 1.5, .58, z + 3, 1.8, 1, 1.7);
    }
    for(let i=0;i<16;i++){const side=i%2?1:-1,x=side*(riverWidth/2+1.2+rand(280+i)*1.8),z=z0-Math.floor(i/2)*5;
      for(const angle of [0,Math.PI])put('leaf',x,.38,z,.22,.42,.22,angle+rand(300+i)*2);
    }
    // Layered vegetation closes the empty horizon without loading distant forest models.
    const thickets=treeKeys.length?(quality==='low'?2:4):quality==='low'?4:12;
    for(let i=0;i<thickets;i++){
      const side=i%2?1:-1,h=2.4+rand(120+i)*1.8;
      if(treeKeys.length){for(const treeKey of treeKeys)put(treeKey,side*(riverWidth/2+5+rand(140+i)*10),0,z0-Math.floor(i/2)*(80/thickets)-rand(160+i)*6,h*2.4,h*2,h*2.4,rand(180+i)*Math.PI);}else put('bush',side*(riverWidth/2+10+rand(140+i)*9),h*.6,z0-rand(160+i)*40,h*1.45,h,h*1.6,rand(180+i)*Math.PI);
    }
    if(treeKeys.length){
      // A second tree line hides the flat map edge; small copies provide leaf-covered understory.
      const layers=quality==='low'?2:4;
      for(let i=0;i<layers;i++){
        const side=i%2?1:-1,under=i>=2,h=under?1.1+rand(330+i):7+rand(330+i)*3;
        for(const treeKey of treeKeys)put(treeKey,side*(riverWidth/2+(under?2.5:18)+rand(340+i)*4),under?-.45:0,z0-Math.floor(i/2)%2*20-rand(350+i)*10,h*(under?1.7:2.2),h,h*1.5,rand(360+i)*6.28);
      }
    }
    // A low, continuous canopy gives the palms depth and closes gaps behind the riverbank.
    if(!treeKeys.length)for(let i=0;i<8;i++){const side=i%2?1:-1;put('bush',side*(riverWidth/2+13+rand(220+i)*4),1.8,z0-Math.floor(i/2)*10,5.5,2.6+rand(240+i),6,rand(260+i));}
    for (let i = 0; i < 8; i++) put('bank', (i % 2 ? 1 : -1) * (riverWidth/2+1.8), WATER_LEVEL - .03, z0 - Math.floor(i / 2) * 10 - 4, 1.8, .48, 6);
    for (const side of [-1, 1]) for (let i = 0; i < 5; i++) {
      put('buoy', side * (riverWidth/2-.25), WATER_LEVEL + .08, z0 - i * 8, .095, .13, .095);
    }
    const side = rand(90) > .5 ? 1 : -1;
    if (id % 2 === 0) {
      const x = side * (riverWidth/2+7), z = z0 - 22;
      put('wall', x, 1.3, z, 4.2, 2.1, 3.2);
      put('roof', x, 2.85, z, 3.5, 1.8, 3, Math.PI / 4);
      for (const offset of [-1.25, 1.25]) put('shade', x + offset, 1.35, z + 1.615, .65, .8, .035);
      put('timber', x, .72, z + 1.65, .7, 1.45, .06);
      for (const offset of [-2, 2]) put('timber', x + offset, 1.1, z + 2.2, .08, 2.2, .08);
    }
    // Moored kettuvallam: stitched timber hull, arched woven canopy, open veranda.
    if (id % 3 === 0 && id >= 0 && id < 54) {
      const mooredSide=(id/3)%2 ? 1 : -1;
      const x = mooredSide * (riverWidth/2-1.4), z = z0 - 12;
      put('hull', x, .05, z, 1.04, .36, 4.8);
      put('deck', x, .31, z, 1.8, .12, 7.5);
      put('reed', x, 1.35, z + .25, 1, 1.05, 3.1);
      put('wall', x, .9, z + .2, 1.75, 1.15, 5.2);
      for (const along of [-1.6, -.4, .8, 2]) {
        put('shade', x - side * .89, 1.05, z + along, .045, .55, .75);
        put('timber', x - side * .92, 1.08, z + along, .06, .68, .035);
      }
      for (const dx of [-.8, .8]) for (const dz of [-3.5, 3.5]) put('timber', x + dx, .75, z + dz, .045, .9, .045);
      for (const dx of [-.8, .8]) put('timber', x + dx, 1.16, z - 3.25, .06, .06, 1.1);
      // Thin roof ribs give the canopy its woven Kerala silhouette.
      for (let i = 0; i < 9; i++) put('timber', x, 2.16 - Math.abs(i - 4) * .055, z - 2.25 + i * .6, 1.08, .035, .025);
      put('timber', mooredSide * (riverWidth/2-.3), .45, z - 4.6, .09, 1.1, .09);
    }
    return placed;
  }
  function update(distance: number, quality: SceneQuality, nextSeed: number, boatDistances: number[] = []) {
    const center = Math.floor(distance / CHUNK_LENGTH);
    const count = broadcast ? 7 : quality === 'low' ? 4 : 5;
    const start = center - (broadcast ? 3 : 1);
    const desired=new Set(Array.from({length:count},(_,i)=>start+i));
    if(broadcast && boatDistances.length===2 && Math.abs(boatDistances[0]-boatDistances[1])>160){
      desired.clear();desired.add(center);
      for(const boatDistance of boatDistances){const boatChunk=Math.floor(boatDistance/CHUNK_LENGTH);for(let offset=-1;offset<=1;offset++)desired.add(boatChunk+offset);}
    }
    const ids=[...desired].sort((a,b)=>a-b);
    const nextKey = `${ids.join(',')}/${quality}/${nextSeed}`;
    if (key === nextKey) return false;
    if (seed !== nextSeed || !key.endsWith(`/${quality}/${nextSeed}`)) chunks.clear();
    key = nextKey; seed = nextSeed;
    for (const id of chunks.keys()) if (!desired.has(id)) chunks.delete(id);
    for (const id of ids) if (!chunks.has(id)) chunks.set(id, generate(id, quality));
    for (const mesh of batches.values()) mesh.count = 0;
    for (const chunk of chunks.values()) for (const item of chunk) {
      const mesh = batches.get(item.key)!;
      mesh.setMatrixAt(mesh.count++, item.matrix);
    }
    for (const mesh of batches.values()) mesh.instanceMatrix.needsUpdate = true;
    return true;
  }
  // The scanned canopy is streamed only after a room opens, then reused by bounded chunks.
  const ready = new GLTFLoader().loadAsync('/assets/scenery/island-tree.glb').then(gltf=>{
    gltf.scene.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(gltf.scene),height=bounds.max.y-bounds.min.y;
    const center=bounds.getCenter(new THREE.Vector3());
    gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;
      const mats=Array.isArray(o.material)?o.material:[o.material];
      for(const m of mats){treeMaterials.push(m);for(const value of Object.values(m))if(value instanceof THREE.Texture){treeTextures.add(value);value.anisotropy=4;}m.side=THREE.DoubleSide;if(m.transparent){m.transparent=false;m.alphaTest=.35;}if(m.alphaTest>0)m.alphaToCoverage=true;m.needsUpdate=true;}
      if(disposed){o.geometry.dispose();return;}
      const g=geometry(o.geometry.clone().applyMatrix4(o.matrixWorld).translate(-center.x,-bounds.min.y,-center.z).scale(1/height,1/height,1/height));o.geometry.dispose();
      const name='tree-'+treeKeys.length,mesh=new THREE.InstancedMesh(g,o.material,56);mesh.count=0;mesh.frustumCulled=false;scene.add(mesh);batches.set(name,mesh);treeKeys.push(name);
    });
    if(disposed){treeMaterials.forEach(m=>m.dispose());treeTextures.forEach(t=>t.dispose());return;}
    chunks.clear();key='';
  }).catch(()=>{/* Existing palms and ground cover keep the shoreline playable offline after a failed asset load. */});
  return {
    ready, update,
    get chunkKeys() { return [...chunks.keys()].sort((a,b)=>a-b).join(','); },
    get activeChunks() { return chunks.size; },
    get residentInstances() { return [...chunks.values()].reduce((n, chunk) => n + chunk.length, 0); },
    dispose() { disposed=true;treeMaterials.forEach(m=>m.dispose());treeTextures.forEach(t=>t.dispose());chunks.clear(); for (const mesh of batches.values()) { mesh.dispose(); scene.remove(mesh); } },
  };
}
