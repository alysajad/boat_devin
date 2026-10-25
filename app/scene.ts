import { chundanSection, createChundanHull } from './chundan';
import { FramePacer } from './frame-pacer';
import { Director } from './director';
import * as THREE from 'three';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import { crewSeatZ, rankings, type Race, type Team, type Player, type Side } from './race-v2';
import { loadCrew, createCrew } from './crew';
import { LOG_HALF_LENGTH, LOG_RADIUS, WATER_LEVEL } from './world';
import { createScenery, type SceneQuality } from './scenery';
import { paddlePose, waterHeight, PADDLE_LEAN } from './rowing';

type Options = { getRace: () => Race | null; playerId?: string; view: 'player' | 'broadcast'; followBoat?: () => string; cameraMode?: () => string; povPlayer?:()=>string;selectPlayer?:(id:string)=>void;serverNow?:()=>number;graphics?:()=>string;frameRate?:()=>number;previewRoot?:HTMLElement;onFallback?: (reason: string) => void };


/** World metres match the simulation: +x is right, forward is -z. */
export function mountRaceScene(element: HTMLElement, options: Options) {
  const initial = options.getRace()!;
  const teams = [...initial.boatOrder];
  const riverWidth = initial.riverWidth;
  let localSide: Side | undefined;
  let resolveReady!: () => void;
  const ready = new Promise<void>(resolve => { resolveReady = resolve; });
  const crewModels: ReturnType<typeof createCrew>[] = [];
  let disposed = false, failed = false, frame = 0;
  let fallback: { remove(): void } | undefined;
  let scenery: ReturnType<typeof createScenery> | undefined;
  const textures = new Set<THREE.Texture>();
  let renderer: THREE.WebGLRenderer | undefined;
  let compressed: KTX2Loader | undefined;
  let observer: ResizeObserver | undefined;
  let previewTarget:THREE.WebGLRenderTarget|undefined,removePicking=()=>{},releaseShadows=()=>{};
  const pacer=new FramePacer();
  let graphicsPreference=options.graphics?.()||'auto';
  const selectedPlayer=()=>options.povPlayer?.()||(options.view==='player'?options.playerId:'');
  const serverNow=()=>options.serverNow?.()??Date.now();
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  let quality: SceneQuality = mobile ? 'medium' : 'high';
  let frameFallback=false;
  let renderFrames = 0, costTotal = 0, slowWindows = 0, fastWindows = 0;
  let yaw = 0, pitch = 0, preview = 0, localStrokeAt = -Infinity;
  let predictionCount = 0, predictionUntil = 0;
  const scene = new THREE.Scene();
  const sky = new THREE.Color('#c4dcd7');
  scene.background = sky;
  scene.fog = new THREE.Fog('#c4dcd7', 65, 190);
  const camera = new THREE.PerspectiveCamera(options.view === 'player' ? 72 : 50, 1, .045, 1000);
  camera.rotation.order = 'YXZ';
  element.dataset.view = options.view;
  element.dataset.lookYaw = '0'; element.dataset.lookPitch = '0';
  const onReduced = () => { reduced = reducedQuery.matches; element.dataset.motion = reduced ? 'reduced' : 'full'; };
  reducedQuery.addEventListener('change', onReduced);
  onReduced();

  function releaseGPU() {
    cancelAnimationFrame(frame);
    releaseShadows();removePicking();previewTarget?.dispose();previewTarget=undefined;
    observer?.disconnect();
    renderer?.domElement.removeEventListener('webglcontextlost', contextLost);
    renderer?.domElement.remove();
    scenery?.dispose(); scenery=undefined;
    scene.traverse(object => { if (object instanceof THREE.InstancedMesh) object.dispose(); });
    textures.forEach(t => t.dispose()); textures.clear();
    geometries.forEach(g => g.dispose()); geometries.clear();
    materials.forEach(m => m.dispose()); materials.clear();
    crewModels.forEach(model => model.dispose());
    scene.clear();
    compressed?.dispose();
    renderer?.dispose();
    renderer?.forceContextLoss();
    renderer=undefined;
  }
  function useFallback(reason: string) {
    if (disposed || failed) return;
    failed = true;
    releaseGPU();
    element.dataset.renderer = '2d';
    options.onFallback?.(reason);
    const canvas = document.createElement('canvas'); element.append(canvas);
    const ctx = canvas.getContext('2d')!;
    let raf = 0;
    const draw = () => { if(disposed)return; canvas.width=element.clientWidth;canvas.height=element.clientHeight;
      ctx.fillStyle='#294d4b';ctx.fillRect(0,0,canvas.width,canvas.height);const race=options.getRace();
      if(race){const lead=Math.max(0,...race.boatOrder.map(id=>race.boats[id].distance));for(const id of race.boatOrder){const b=race.boats[id];ctx.fillStyle=race.config.find(c=>c.id===id)!.color;ctx.beginPath();ctx.ellipse(canvas.width/2+b.x/race.riverWidth*canvas.width,canvas.height*.3+(lead-b.distance)*3,6,18,b.heading,0,Math.PI*2);ctx.fill();}}
      raf=requestAnimationFrame(draw);};draw();fallback={remove(){cancelAnimationFrame(raf);canvas.remove();}};resolveReady();
  }
  function contextLost(event: Event) {
    event.preventDefault();
    useFallback('The 3D connection was lost. The live river map is still available.');
  }
  const controls = {
    ready,
    remove() {
      if (disposed) return;
      disposed = true;
      releaseGPU();
      fallback?.remove();element.querySelector('.boat-labels')?.remove();
      reducedQuery.removeEventListener('change', onReduced);
      document.removeEventListener('visibilitychange', onVisibility);
      delete element.dataset.renderer;
      delete element.dataset.seat;
      delete element.dataset.side;
      delete element.dataset.motion;
      delete element.dataset.quality;
      delete element.dataset.fps;
      delete element.dataset.view;
      delete element.dataset.collision;
      delete element.dataset.lookYaw;
      delete element.dataset.lookPitch;
      delete element.dataset.drawCalls;
      delete element.dataset.triangles;
      for (const key of ['activeChunks', 'residentInstances', 'renderFrames', 'pixelRatio', 'chunkKeys', 'renderCost', 'strokePhase', 'bladeHeight', 'antialias', 'surfaceAssets']) delete element.dataset[key];
    },
    setLook(nextYaw: number, nextPitch: number) {
      yaw = THREE.MathUtils.clamp(Number.isFinite(nextYaw) ? nextYaw : 0, -Math.PI / 3, Math.PI / 3);
      pitch = THREE.MathUtils.clamp(Number.isFinite(nextPitch) ? nextPitch : 0, -Math.PI / 12, Math.PI / 12);
      element.dataset.lookYaw = String(yaw); element.dataset.lookPitch = String(pitch);
    },
    recenter() { yaw = 0; pitch = 0; element.dataset.lookYaw = '0'; element.dataset.lookPitch = '0'; },
    previewStroke(progress: number, side?: Side) { if(side)localSide=side; preview = THREE.MathUtils.clamp(Number.isFinite(progress) ? progress : 0, 0, 1); },
    stroke(side?: Side) {
      if(side)localSide=side;
      localStrokeAt = performance.now();
      const player = options.getRace()?.players.find(p => p.id === options.playerId);
      predictionCount = Math.max(predictionCount, player?.strokes ?? 0) + 1;
      predictionUntil = localStrokeAt + 1600;
    },
  };
  try {
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, powerPreference: 'high-performance' });
  } catch {
    useFallback('3D is unavailable on this device. Showing the live river map.');
    return controls;
  }
  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, mobile ? 1.5 : 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  renderer.domElement.setAttribute('role', 'img');
  renderer.domElement.setAttribute('aria-label', options.view === 'player' ? 'Seated first-person view from your crew boat on a Kerala river. Your hands and paddle are visible.' : 'Elevated live broadcast view of both crew boats on a palm-lined Kerala river.');
  renderer.domElement.style.cssText = 'display:block;width:100%;height:100%;';
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  element.append(renderer.domElement);
  element.dataset.renderer = '3d';
  element.dataset.antialias = String(renderer.getContext().getContextAttributes()?.antialias ?? false);
  element.dataset.quality = quality;
  const resize = () => {
    const width = Math.max(1, element.clientWidth), height = Math.max(1, element.clientHeight);
    const dprCap = quality === 'low' ? 1 : quality === 'medium' ? 1.25 : mobile ? 1.5 : 2;
    const pixelBudget = graphicsPreference==='performance'?1000000:quality==='low'?1000000:quality==='medium'?1800000:graphicsPreference==='uhd'?8294400:mobile?850000:3000000;
    renderer!.setPixelRatio(Math.min(graphicsPreference==='uhd'?2:devicePixelRatio||1,graphicsPreference==='performance'?1:dprCap,Math.sqrt(pixelBudget/(width*height))));
    element.dataset.pixelRatio = String(renderer!.getPixelRatio());
    renderer!.setSize(width, height, false);
    element.dataset.resolution=`${renderer!.domElement.width}×${renderer!.domElement.height}`;
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  observer = new ResizeObserver(resize);
  observer.observe(element);
  resize();
  scene.add(new THREE.HemisphereLight('#d9efff', '#5c6145', 2.05));
  const sunlight = new THREE.DirectionalLight('#ffdfaf', 2.45);
  sunlight.position.set(-35, 50, -30);
  sunlight.castShadow=true;sunlight.shadow.mapSize.set(2048,2048);
  Object.assign(sunlight.shadow.camera,{left:-42,right:42,top:55,bottom:-55,near:1,far:160});
  sunlight.shadow.bias=-.00015;sunlight.shadow.normalBias=.025;sunlight.shadow.autoUpdate=false;sunlight.shadow.needsUpdate=true;
  releaseShadows=()=>sunlight.shadow.dispose();scene.add(sunlight,sunlight.target);let shadowAt=0;

  function geometry<T extends THREE.BufferGeometry>(g: T): T { geometries.add(g); return g; }
  function material(color: string, roughness = .85) {
    const m = new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 }); materials.add(m); return m;
  }
  const box = geometry(new THREE.BoxGeometry(1, 1, 1));
  const sphere = geometry(new THREE.SphereGeometry(1, 16, 10));
  const cylinder = geometry(new THREE.CylinderGeometry(1, 1, 1, 16));
  const torsoGeometry = geometry(new THREE.LatheGeometry([
    new THREE.Vector2(.62,-.5),new THREE.Vector2(.68,-.43),new THREE.Vector2(.73,-.05),
    new THREE.Vector2(.86,.28),new THREE.Vector2(.8,.4),new THREE.Vector2(.36,.5),
  ],16));
  const limbGeometry = geometry(new THREE.LatheGeometry([
    new THREE.Vector2(.6,-.5),new THREE.Vector2(.82,-.42),new THREE.Vector2(1,.12),
    new THREE.Vector2(.9,.38),new THREE.Vector2(.65,.5),
  ],10));
  const skyMaterial = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    vertexShader: 'varying vec3 skyDirection; void main(){skyDirection=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
    fragmentShader: `precision highp float; varying vec3 skyDirection;
      void main(){vec3 d=normalize(skyDirection);float h=max(d.y,0.);
      vec3 color=mix(vec3(.55,.72,.72),vec3(.035,.20,.42),pow(h,.48));
      vec2 q=d.xz/max(.12,d.y+.22);float clouds=sin(q.x*2.3+sin(q.y*1.7))*.5+sin(q.y*3.1-q.x*.7)*.25;
      float veil=smoothstep(.30,.72,clouds)*smoothstep(.03,.18,h)*(1.-smoothstep(.4,.8,h));
      color=mix(color,vec3(.83,.88,.82),veil*.48);
      float sun=max(dot(d,normalize(vec3(-35.,50.,-30.))),0.);
      color+=vec3(1.,.69,.31)*(pow(sun,64.)*.22+pow(sun,1800.)*2.);
      gl_FragColor=vec4(color,1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
      }`,
  });
  materials.add(skyMaterial);
  const skyDome = new THREE.Mesh(geometry(new THREE.SphereGeometry(450, 16, 8)), skyMaterial);
  skyDome.renderOrder = -1; scene.add(skyDome);
  const wood = material('#653b25'), deck = material('#bd8550'), trim = material('#efd39a');
  const skin = [material('#925733'), material('#be7e4c'), material('#6a412c')];
  const hair = material('#252723'), shorts = material('#f1e7c7');
  const teamMaterials = Object.fromEntries(initial.config.map(c=>[c.id, material(c.color)]));
  const grass = material('#8c9d68'), sand = material('#c1b18a');
  const white = material('#fff5d5');
  function surfaceTexture(fabric: boolean) {
    const size = 128, data = new Uint8Array(size * size * 4);
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
      const grain = fabric ? ((x % 4 < 2) !== (y % 4 < 2) ? 11 : -8) : Math.sin(x * .65 + Math.sin(y * .06) * 1.5) * 13 + Math.sin(x * 2.4 + y * .025) * 5;
      const tone = 213 + grain + Math.sin(x * 7.1 + y * 9.3) * 3;
      const i = (y * size + x) * 4; data[i] = tone; data[i + 1] = tone; data[i + 2] = tone; data[i + 3] = 255;
    }
    const texture = new THREE.DataTexture(data, size, size); texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.colorSpace = THREE.SRGBColorSpace; texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter;
    texture.magFilter = THREE.LinearFilter; texture.repeat.set(fabric ? 3 : 2, fabric ? 3 : 1); texture.needsUpdate = true; textures.add(texture); return texture;
  }
  const woodTexture = surfaceTexture(false), clothTexture = surfaceTexture(true);
  woodTexture.anisotropy = Math.min(4, renderer.capabilities.getMaxAnisotropy());
  for (const m of [wood, deck, trim]) { m.map = woodTexture; m.bumpMap = woodTexture; m.bumpScale = .012; m.roughness = .62; }
  for (const m of [...Object.values(teamMaterials), shorts]) { m.map = clothTexture; m.bumpMap = clothTexture; m.bumpScale = .004; m.roughness = .95; }
  const brass = material('#bb9950', .42); brass.metalness = .45;

  const node = (parent: THREE.Object3D, shape: THREE.BufferGeometry, mat: THREE.Material, x: number, y: number, z: number, sx: number, sy: number, sz: number) => {
    const mesh = new THREE.Mesh(shape, mat); mesh.position.set(x, y, z); mesh.scale.set(sx, sy, sz); parent.add(mesh); return mesh;
  };
  const segment = (mesh: THREE.Mesh, a: THREE.Vector3, b: THREE.Vector3, radius: number) => {
    mesh.position.copy(a).add(b).multiplyScalar(.5);
    mesh.scale.set(radius, a.distanceTo(b), radius);
    mesh.quaternion.setFromUnitVectors(up, direction.copy(b).sub(a).normalize());
  };
  const up = new THREE.Vector3(0, 1, 0), direction = new THREE.Vector3();

  // Analytic shallow ripples with view-dependent Fresnel and broad sun highlights.
  const waterMaterial = new THREE.ShaderMaterial({
    uniforms: { time: { value: 0 }, still: { value: reduced ? 1 : 0 }, fogNear: { value: 65 }, fogFar: { value: 145 } },
    vertexShader: `varying vec3 world; varying float depth; uniform float time; uniform float still;
      void main(){vec4 p=modelMatrix*vec4(position,1.0); float t=time*(1.0-still);
      p.y+=.012*sin(p.x*.65+p.z*.9+t*.7);world=p.xyz;vec4 v=viewMatrix*p;depth=-v.z;gl_Position=projectionMatrix*v;}`,
    fragmentShader: `precision highp float;
      varying vec3 world; varying float depth; uniform float time; uniform float still; uniform float fogNear; uniform float fogFar;
      float hash(vec2 p){vec3 q=fract(vec3(p.xyx)*.1031);q+=dot(q,q.yzx+33.33);return fract((q.x+q.y)*q.z);}
      float ripple(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+1.),f.x),f.y);}
      void main(){float t=time*(1.0-still);
        // Crossed, low-amplitude ripples fade into the horizon instead of aliasing into stripes.
        float a=world.x*.82+world.z*1.12+t*.65;float b=world.x*1.63-world.z*.71-t*.43;
        float c=world.x*3.7+world.z*2.3+t*.92;
        float detail=1.-smoothstep(25.,110.,depth);
        float ca=cos(a+sin(b*.33)),cb=cos(b+sin(a*.27));
        vec2 uv=world.xz*1.8+vec2(t*.12,-t*.08);float n=ripple(uv);
        vec2 broken=vec2(ripple(uv+vec2(.15,0.))-n,ripple(uv+vec2(0.,.15))-n);
        vec3 normal=normalize(vec3(.008*ca+broken.x*.45*detail,1.,.008*cb+broken.y*.45*detail));
        vec3 eye=normalize(cameraPosition-world);float fresnel=.08+.78*pow(1.-max(dot(normal,eye),0.),4.);
        vec3 reflection=reflect(-eye,normal);
        vec3 reflected=mix(vec3(.40,.59,.56),vec3(.19,.46,.61),max(0.,reflection.y));
        vec3 color=mix(vec3(.025,.12,.085),reflected,fresnel);
        vec3 sun=normalize(vec3(-.5,.8,-.35));vec3 halfVector=normalize(sun+eye);
        float highlight=pow(max(dot(normal,halfVector),0.),160.);
        color+=vec3(.95,.81,.51)*highlight*.48;
        color+=vec3(.009,.023,.019)*sin(a+sin(b)*1.7)*sin(b+cos(c)*.6)*detail;
        color=mix(color,vec3(.55,.72,.68),smoothstep(fogNear,fogFar,depth));
        gl_FragColor=vec4(color,1.); #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  // Shader includes must start on their own source line.
  waterMaterial.fragmentShader = waterMaterial.fragmentShader.replace('; #include', ';\n#include');
  materials.add(waterMaterial);
  const water = node(scene, geometry(new THREE.PlaneGeometry(220, 900, 12, 80)), waterMaterial, 0, WATER_LEVEL, -300, 1, 1, 1);
  water.rotation.x = -Math.PI / 2;
  const bankGround = new THREE.Group(); scene.add(bankGround);
  for (const sign of [-1, 1]) {
    node(bankGround, box, sand, sign * (riverWidth/2+100), -.18, 0, 200, .45, 900);
    node(bankGround, box, grass, sign * (riverWidth/2+101.5), .03, 0, 201, .6, 900);
  }
  scenery = createScenery(scene, { geometry, material, wood, deck, trim }, options.view === 'broadcast', riverWidth);
  const dynamicRoot = new THREE.Group(); scene.add(dynamicRoot);
  const logRoot = new THREE.Group(); scene.add(logRoot);
  type Crew = { root: THREE.Group; model?: ReturnType<typeof createCrew>; paddle: THREE.Group; splash: THREE.Group; playerId: string; strokes: number; at: number; side: number };
  type BoatScene = { root: THREE.Group; crew: Crew[]; wake: THREE.Group; x: number; distance: number; heading: number; roll: number; collision: THREE.Mesh; collisions: number; collisionAt: number };
  const boats = {} as Record<Team, BoatScene>;
  const softPixels=new Uint8Array(64*64*4);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++){const i=(y*64+x)*4,r=Math.hypot((x-31.5)/31.5,(y-31.5)/31.5);softPixels.set([255,255,255,Math.round(Math.pow(Math.max(0,1-r*r),2)*255)],i);}
  const softMask=new THREE.DataTexture(softPixels,64,64);softMask.needsUpdate=true;softMask.magFilter=softMask.minFilter=THREE.LinearFilter;textures.add(softMask);
  const hullShade=new THREE.MeshBasicMaterial({color:'#092e2b',map:softMask,transparent:true,opacity:.48,depthWrite:false});materials.add(hullShade);
  const wakeMat = new THREE.MeshBasicMaterial({ color: '#d5eee6', map:softMask, transparent: true, opacity: .45, depthWrite: false, side: THREE.DoubleSide }); materials.add(wakeMat);
  const wakeGeo = geometry(new THREE.PlaneGeometry(1, 1));
  const collisionGeo = geometry(new THREE.RingGeometry(.88, 1, 32));
  const collisionMat = new THREE.MeshBasicMaterial({ color: '#ff9b56', transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide });
  materials.add(collisionMat);
  const hullGeo=geometry(createChundanHull());
  const sideMaterial=wood.clone();sideMaterial.side=THREE.DoubleSide;sideMaterial.roughness=.32;materials.add(sideMaterial);
  const garlandGold=material('#f5ae25',.8),garlandIvory=material('#fff4ce',.85);
  // Local photographed surfaces load only in a room. Existing materials render immediately.
  let surfaceAssets = 0;
  const surfaceLoads: Promise<unknown>[]=[];
  function loadSurface(file: string, color: boolean, apply: (texture: THREE.Texture) => void) {
    compressed ??= new KTX2Loader().setTranscoderPath('/assets/basis/').setWorkerLimit(1).detectSupport(renderer!);
    const applyLoaded=(loaded:THREE.Texture)=>{
      if(disposed||failed){loaded.dispose();return;}
      textures.add(loaded);loaded.colorSpace=color?THREE.SRGBColorSpace:THREE.NoColorSpace;
      loaded.wrapS=loaded.wrapT=THREE.RepeatWrapping;loaded.anisotropy=Math.min(4,renderer!.capabilities.getMaxAnisotropy());
      apply(loaded);element.dataset.surfaceAssets=String(++surfaceAssets);
    };
    surfaceLoads.push(compressed.loadAsync('/assets/river/'+file.replace('.jpg','.ktx2')).then(applyLoaded).catch(async()=>{
      if(!disposed&&!failed)try{applyLoaded(await new THREE.TextureLoader().loadAsync('/assets/river/'+file));}catch{/* Procedural surface stays available. */}
    }));
  }
  loadSurface('wood-color.jpg', true, texture => {
    texture.repeat.set(1, 2);
    [wood,deck,trim,sideMaterial].forEach((m,i)=>{
      m.map=texture;m.color.set(['#805a35','#e1b77d','#f2d39a','#66523f'][i]);m.roughness=i===3?.30:i===0?.42:.60;m.bumpMap=null;m.needsUpdate=true;
    });
  });
  loadSurface('wood-normal.jpg', false, texture => {
    texture.repeat.set(1, 2);
    for(const m of [wood,deck,trim,sideMaterial]){m.normalMap=texture;m.normalScale.set(.35,.35);m.needsUpdate=true;}
  });
  loadSurface('shore-color.jpg', true, texture => {
    texture.repeat.set(8,90);
    for(const m of [grass,sand]){m.map=texture;m.needsUpdate=true;}
  });
  const bladeShape = new THREE.Shape(); bladeShape.moveTo(0,.25); bladeShape.bezierCurveTo(.08,.18,.15,-.03,.1,-.24); bladeShape.quadraticCurveTo(0,-.34,-.1,-.24); bladeShape.bezierCurveTo(-.15,-.03,-.08,.18,0,.25);
  const bladeGeo = geometry(new THREE.ExtrudeGeometry(bladeShape, { depth: .025, bevelEnabled: true, bevelThickness: .008, bevelSize: .012, bevelSegments: 1, curveSegments: 5 }));
  const bladePoint = new THREE.Vector3();
  const contactShade = new THREE.MeshBasicMaterial({color:'#241d15',map:softMask,transparent:true,opacity:.24,depthWrite:false}); materials.add(contactShade);
  const contactGeo = geometry(new THREE.CircleGeometry(1, 16));
  for (const team of teams) {
    const root = new THREE.Group(); dynamicRoot.add(root);
    const length=initial.boats[team].length, capacity=initial.boats[team].crewCount;
    node(root,wakeGeo,hullShade,0,WATER_LEVEL+.006,0,2.6,length*1.08,1).rotation.x=-Math.PI/2;
    const hull=new THREE.Group();root.add(hull);
    node(hull,hullGeo,sideMaterial,0,0,0,1,1,length/2);
    // Fine brass caps and a slim team-colour inlay follow the raised stern.
    for(let j=0;j<64;j++){
      const u=j/64*2-1,v=(j+1)/64*2-1,a=chundanSection(u),b=chundanSection(v);
      for(const side of [-1,1]){
        const rail=node(hull,cylinder,brass,0,0,0,1,1,1);
        segment(rail,new THREE.Vector3(side*a.width,a.rim,u*length/2),new THREE.Vector3(side*b.width,b.rim,v*length/2),.018);
        const inlay=node(hull,cylinder,teamMaterials[team],0,0,0,1,1,1);
        segment(inlay,new THREE.Vector3(side*(a.width+.008),a.rim-.075,u*length/2),new THREE.Vector3(side*(b.width+.008),b.rim-.075,v*length/2),.021);
      }
    }
    // Individually fitted deck boards and cross ribs make the long timber hull legible.
    const boards=Math.ceil(length/.38);
    for(let j=0;j<boards;j++){
      const u=-.93+j/(boards-1)*1.86,section=chundanSection(u),width=section.width*.84;
      const plank=node(hull,box,deck,0,.205+section.rise,u*length/2,width*2,.045,length*1.86/(2*boards)-.015);
      const ahead=chundanSection(Math.min(.999,u+.005));plank.rotation.x=-Math.atan2(ahead.rise-section.rise,length*.0025);
      if(j%2===0&&Math.abs(u)<.76){node(hull,box,wood,0,.29,u*length/2,width*2,.055,.055);for(const side of [-1,1])node(hull,sphere,brass,side*(width-.035),.32,u*length/2,.018,.012,.018);}
    }
    // Onam floral accents frame the high tail without covering the rowers or the bow.
    for(const side of [-1,1])for(let j=0;j<18;j++){
      const u=.78+j/17*.20,section=chundanSection(u);
      node(hull,sphere,j%4===0?garlandIvory:garlandGold,side*(section.width+.025),section.rim-.14,u*length/2,.052,.055,.05);
    }
    const bow=chundanSection(-.985);
    node(hull,cylinder,brass,0,bow.rim+.28,-length*.4925,.018,.58,.018);
    const flagGeometry=geometry(new THREE.BufferGeometry());flagGeometry.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.42,-.10,0,0,-.22,0],3));flagGeometry.computeVertexNormals();
    const flagMaterial=teamMaterials[team].clone();flagMaterial.side=THREE.DoubleSide;materials.add(flagMaterial);
    node(hull,flagGeometry,flagMaterial,0,bow.rim+.56,-length*.4925,1,1,1);
    const crew: Crew[] = [];
    for (let i = 0; i < capacity; i++) {
      if(i%2===0)node(root, box, deck, 0, .47, crewSeatZ(i, capacity) + .13, 1.3, .075, .26);
      node(root, contactGeo, contactShade, capacity===1?0:(i%2?1:-1)*.36, .513, crewSeatZ(i, capacity) + .13, .36, .11, 1).rotation.x = -Math.PI / 2;
      const person = new THREE.Group(); root.add(person);
      const paddle = new THREE.Group(); person.add(paddle);
      node(paddle, cylinder, trim, 0, -.23, 0, .018, 1.3, .018);
      const blade = node(paddle, bladeGeo, deck, 0, -.89, 0, 1, 1, 1); blade.rotation.y = .18;
      node(paddle, sphere, trim, 0, .42, 0, .055, .018, .022);
      const splash = new THREE.Group(); person.add(splash);
      for (let j = 0; j < 5; j++) node(splash, sphere, white, 0, 0, 0, .04, .08, .04);
      splash.visible = false;
      crew.push({ root: person, paddle, splash, playerId: '', strokes: 0, at: -Infinity, side: i % 2 ? 1 : -1 });
    }
    const wake = new THREE.Group(); dynamicRoot.add(wake);
    for (let i = 0; i < 8; i++) {
      const mesh = node(wake, wakeGeo, wakeMat, (i % 2 ? 1 : -1) * (.7 + Math.floor(i / 2) * .35), -.095, length/2 + Math.floor(i / 2) * 1.6, .23, 3.2, 1);
      mesh.rotation.set(-Math.PI / 2, 0, (i % 2 ? -1 : 1) * .22);
    }
    const collision = node(root, collisionGeo, collisionMat, 0, -.085, 0, 1.3, length/2+.3, 1);
    collision.rotation.x = -Math.PI / 2; collision.visible = false;
    boats[team] = { root, crew, wake, x: 0, distance: 0, heading: 0, roll: 0, collision, collisions: 0, collisionAt: -Infinity };
  }
  const logs: { mesh: THREE.Group; id: number; x: number; distance: number }[] = [];
  const bark = material('#896b43');
  for (let i = 0; i < 32; i++) {
    const log = new THREE.Group(); logRoot.add(log);
    node(log, cylinder, bark, 0, 0, 0, LOG_RADIUS, LOG_HALF_LENGTH * 2, LOG_RADIUS).rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) node(log, cylinder, deck, side * (LOG_HALF_LENGTH + .002), 0, 0, LOG_RADIUS * .85, .008, LOG_RADIUS * .85).rotation.z = Math.PI / 2;
    node(log, cylinder, bark, .4, .18, 0, .07, .55, .07).rotation.z = -.6;
    logs.push({ mesh: log, id: -1, x: 0, distance: 0 });
  }
  // Dynamic crew and static obstacle buffers are separate; hidden sources aren't submitted.
  function makeBatches(root: THREE.Group, sources?:THREE.Mesh[]) {
    const groups = new Map<string, THREE.Mesh[]>();
    const collect=(object:THREE.Object3D)=>{
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const m=object.material as THREE.MeshStandardMaterial;const key=object.geometry.uuid+(sources?m.name+m.color.getHexString():m.uuid), group=groups.get(key)??[];
      group.push(object); groups.set(key,group);
    };if(sources)sources.forEach(collect);else root.traverse(collect);
    const batches: {mesh:THREE.InstancedMesh;sources:THREE.Mesh[]}[]=[];
    for(const sources of groups.values()) {
      const mesh=new THREE.InstancedMesh(sources[0].geometry,sources[0].material,sources.length);
      mesh.castShadow=!(sources[0].material as THREE.Material).transparent;mesh.receiveShadow=true;
      mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled=false;
      sources.forEach(source=>source.layers.set(1));scene.add(mesh);batches.push({mesh,sources});
    }
    return { update(updateMatrices=true){
      if(updateMatrices)root.updateMatrixWorld(true);
      for(const {mesh,sources} of batches){
        let count=0;
        for(const source of sources){
          let visible=true;
          for(let parent:THREE.Object3D|null=source;parent;parent=parent.parent)if(!parent.visible){visible=false;break;}
          if(visible)mesh.setMatrixAt(count++,source.matrixWorld);
        }
        mesh.count=count;mesh.instanceMatrix.needsUpdate=true;
      }
    }, get count(){return batches.reduce((n,b)=>n+b.mesh.count,0);}, get capacity(){return batches.reduce((n,b)=>n+b.sources.length,0);} };
  }
  const dynamicBatches=makeBatches(dynamicRoot), logBatches=makeBatches(logRoot);
  let logKey='',distantBatches:ReturnType<typeof makeBatches>|undefined;

  let lastRound = -1, rosterKey = '', lastTime = performance.now(), fpsTime = lastTime, fpsFrames = 0;
  const director=new Director(),aim=new THREE.Vector3(),projected=new THREE.Vector3();
  const labels=document.createElement('div');labels.className='boat-labels';element.append(labels);
  const rowerLabels=new Map<string,HTMLButtonElement>();
  const labelMap=new Map(teams.map(id=>{const label=document.createElement('span');label.className='boat-label';label.textContent=initial.config.find(c=>c.id===id)!.name;label.style.borderColor=initial.config.find(c=>c.id===id)!.color;labels.append(label);return[id,label];}));
  const finish=new THREE.Mesh(new THREE.BoxGeometry(initial.riverWidth-10,.07,.3),new THREE.MeshBasicMaterial({color:0xf8eed0}));scene.add(finish);geometries.add(finish.geometry);materials.add(finish.material);
  const cameraPoint = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
  const boatQuaternion = new THREE.Quaternion(), lookQuaternion = new THREE.Quaternion();
  const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  function syncRoster(race: Race, now: number) {
    const nextKey = `${race.round}:` + race.players.map(p => `${p.id}/${p.team}/${p.side}`).join(',');
    if (nextKey === rosterKey) return;
    rosterKey = nextKey;
    for(const [id,label]of rowerLabels)if(!race.players.some(p=>p.id===id)){label.remove();rowerLabels.delete(id);}
    for(const p of race.players){let label=rowerLabels.get(p.id);if(!label){label=document.createElement('button');label.className='rower-label';label.dataset.player=p.id;label.addEventListener('click',()=>options.selectPlayer?.(p.id));labels.append(label);rowerLabels.set(p.id,label);}label.textContent=p.name;label.title=`${p.name} · enter first person`;label.dataset.dense=String(race.boats[p.team].crewCount>8);label.setAttribute('aria-label',`POV: ${p.name}`);label.style.setProperty('--rower-color',race.config.find(c=>c.id===p.team)!.color);}

    for (const team of teams) {
      const players = race.players.filter(p => p.team === team);
      boats[team].crew.forEach((crew, i) => {
        const player = players.find(p=>p.seat===i);
        crew.root.visible = !!player;
        crew.playerId = player?.id ?? '';
        crew.side = player?.side === 'right' ? 1 : -1;
        crew.root.position.set(race.boats[team].crewCount===1?0:crew.side * .36, 0, crewSeatZ(i, race.boats[team].crewCount));

        crew.strokes = player?.strokes ?? 0;
        crew.at = player?.strokes?now-Math.max(0,serverNow()-player.lastStroke):-Infinity;
      });
    }
    const player = race.players.find(p => p.id === options.playerId);
    if (player) {
      element.dataset.seat = String(race.players.filter(p => p.team === player.team).findIndex(p => p.id === player.id) + 1);
      element.dataset.side = player.side;
    } else { delete element.dataset.seat; delete element.dataset.side; }
  }
  function pose(crew: Crew, player: Player | undefined, now: number, detailed=true) {
    const own = crew.playerId === selectedPlayer();
    if (player && player.strokes !== crew.strokes) {
      if (player.strokes > crew.strokes && !(own && now < predictionUntil && player.strokes <= predictionCount)) crew.at = now-Math.max(0,serverNow()-player.lastStroke);
      crew.strokes = player.strokes;
    }
    if(player && options.getRace()!.boats[player.team].soloAssist)crew.side=(own?(localSide||player.lastSide):player.lastSide)==='right'?1:-1;
    const age = (now - (own ? Math.max(crew.at, localStrokeAt) : crew.at)) / 1000;
    const stroke = paddlePose(age, own ? preview : 0);
    crew.paddle.position.set(crew.side * .35, stroke.y, stroke.z+.03);
    // Feather the blade through recovery; its working face pushes water during the drive.
    crew.paddle.rotation.set(stroke.pitch, stroke.feather, crew.side * PADDLE_LEAN);
    crew.paddle.updateMatrix();
    // Constrain the shared paddle before skinning; external and POV use the same pose.
    if(detailed)crew.model?.pose(crew.paddle,crew.side);
    bladePoint.set(0,-1.2,0).applyMatrix4(crew.paddle.matrix);
    if(own){element.dataset.strokePhase=stroke.drive?'drive':stroke.active?'recovery':'ready';element.dataset.bladeHeight=bladePoint.y.toFixed(3);}
    crew.splash.visible = stroke.drive;
    crew.splash.children.forEach((drop, i) => {
      const life = Math.min(1, age / .32);
      drop.position.set(bladePoint.x + Math.sin(i * 3) * .14, WATER_LEVEL + (reduced ? .035 : Math.sin(life * Math.PI) * (.16 + i * .035)), bladePoint.z + Math.cos(i * 4) * .12);
      drop.scale.setScalar(Math.max(0, 1 - life) * .055);
    });
  }
  function setPOV(cam:THREE.PerspectiveCamera,player:Player,race:Race){
    const boat=boats[player.team];
    if(cam.fov!==78){cam.fov=78;cam.updateProjectionMatrix();}
    // A slight aft eye offset keeps the near forearm out of the center of the broadcast.
    cameraPoint.set(race.boats[player.team].crewCount===1?0:(player.side==='left'?-1:1)*.36,1.32,crewSeatZ(player.seat,race.boats[player.team].crewCount)+.24);
    boat.root.updateMatrixWorld(true);cam.position.copy(boat.root.localToWorld(cameraPoint));boatQuaternion.setFromEuler(new THREE.Euler(boat.root.rotation.x,-boat.heading,reduced?0:THREE.MathUtils.clamp(boat.roll,-Math.PI/60,Math.PI/60)));
    element.dataset.povRoll=(reduced?0:THREE.MathUtils.clamp(boat.roll,-Math.PI/60,Math.PI/60)).toFixed(4);
    lookEuler.set(pitch-.13,yaw,0);lookQuaternion.setFromEuler(lookEuler);cam.quaternion.copy(boatQuaternion).multiply(lookQuaternion);
  }
  function setShot(cam:THREE.PerspectiveCamera,shot:string,boatId:string,race:Race,blend=1){
    if(cam.fov!==50){cam.fov=50;cam.updateProjectionMatrix();}
    const target=boats[boatId]||boats[teams[0]],tracked=Object.values(boats);
    const midpoint=tracked.reduce((sum,b)=>sum+b.distance,0)/tracked.length,centerX=tracked.reduce((sum,b)=>sum+b.x,0)/tracked.length;
    const separation=Math.max(...tracked.map(b=>b.distance))-Math.min(...tracked.map(b=>b.distance));
    if(cam===camera){(scene.fog as THREE.Fog).near=65+separation*.7;(scene.fog as THREE.Fog).far=190+separation*.9;}
    const width=Math.max(14,Math.max(...tracked.map(b=>b.x))-Math.min(...tracked.map(b=>b.x))+12),spread=Math.max(24,separation+Math.max(...teams.map(id=>race.boats[id].length)),width/cam.aspect);
    cameraPoint.set(centerX+8,15+spread*.46,-midpoint+18+spread*.38);cameraTarget.set(centerX,0,-midpoint-2);let anchor=midpoint;
    if(shot!=='overview'){
      anchor=target.distance;cameraTarget.set(target.x,0,-target.distance);const length=race.boats[boatId]?.length||6;
      if(shot==='side')cameraPoint.set(target.x+Math.max(20,length*1.1),Math.max(7,length*.30),-target.distance+3);
      if(shot==='chase')cameraPoint.set(target.x+4,7,-target.distance+length*.5+12);
      if(shot==='bow')cameraPoint.set(target.x+3,4,-target.distance-length*.5-12);
      if(shot==='finish'){cameraPoint.set(race.riverWidth*.4,12,-race.settings.distance-5);cameraTarget.set(0,0,-race.settings.distance+8);anchor=race.settings.distance;}
    }
    cam.position.lerp(cameraPoint,blend);if(cam===camera){aim.lerp(cameraTarget,blend);cam.lookAt(aim);}else cam.lookAt(cameraTarget);
    return anchor;
  }
  const raycaster=new THREE.Raycaster(),pointer=new THREE.Vector2(),localRay=new THREE.Ray(),inverse=new THREE.Matrix4(),hitPoint=new THREE.Vector3();
  const rowerBounds=new THREE.Box3(new THREE.Vector3(-.36,.35,-.32),new THREE.Vector3(.36,1.65,.32));
  let down:{x:number;y:number;lastX:number;lastY:number}|undefined,hovered='';
  function pickRower(event:PointerEvent){
    const rect=element.getBoundingClientRect();pointer.set((event.clientX-rect.left)/rect.width*2-1,1-(event.clientY-rect.top)/rect.height*2);camera.updateMatrixWorld();raycaster.setFromCamera(pointer,camera);
    let nearest=Infinity,id='';
    for(const boat of Object.values(boats))for(const crew of boat.crew){
      if(!crew.root.visible||!crew.playerId||crew.playerId===selectedPlayer())continue;
      crew.root.updateWorldMatrix(true,false);inverse.copy(crew.root.matrixWorld).invert();localRay.copy(raycaster.ray).applyMatrix4(inverse);
      if(!localRay.intersectBox(rowerBounds,hitPoint))continue;hitPoint.applyMatrix4(crew.root.matrixWorld);
      const distance=hitPoint.distanceTo(raycaster.ray.origin);if(distance<nearest){nearest=distance;id=crew.playerId;}
    }return id;
  }
  function hoverRower(id:string){renderer!.domElement.style.cursor=id?'pointer':selectedPlayer()?'grab':'default';if(id===hovered)return;rowerLabels.get(hovered)?.removeAttribute('data-hovered');hovered=id;rowerLabels.get(id)?.setAttribute('data-hovered','true');}
  const pointerDown=(event:PointerEvent)=>{if(event.button!==0)return;down={x:event.clientX,y:event.clientY,lastX:event.clientX,lastY:event.clientY};renderer!.domElement.setPointerCapture(event.pointerId);};
  const pointerMove=(event:PointerEvent)=>{if(!down){hoverRower(pickRower(event));return;}if(!selectedPlayer())return;renderer!.domElement.style.cursor='grabbing';controls.setLook(yaw-(event.clientX-down.lastX)*.004,pitch-(event.clientY-down.lastY)*.004);down.lastX=event.clientX;down.lastY=event.clientY;};
  const pointerUp=(event:PointerEvent)=>{const start=down;down=undefined;renderer!.domElement.style.cursor=selectedPlayer()?'grab':'default';if(!start||Math.hypot(event.clientX-start.x,event.clientY-start.y)>6)return;const id=pickRower(event);if(id){options.selectPlayer?.(id);hoverRower('');}};
  const pointerCancel=()=>{down=undefined;hoverRower('');};
  renderer.domElement.addEventListener('pointerdown',pointerDown);renderer.domElement.addEventListener('pointermove',pointerMove);renderer.domElement.addEventListener('pointerup',pointerUp);renderer.domElement.addEventListener('pointercancel',pointerCancel);renderer.domElement.addEventListener('pointerleave',pointerCancel);
  removePicking=()=>{renderer?.domElement.removeEventListener('pointerdown',pointerDown);renderer?.domElement.removeEventListener('pointermove',pointerMove);renderer?.domElement.removeEventListener('pointerup',pointerUp);renderer?.domElement.removeEventListener('pointercancel',pointerCancel);renderer?.domElement.removeEventListener('pointerleave',pointerCancel);};
  const previewCamera=new THREE.PerspectiveCamera(50,240/135,.045,1000),pixels=new Uint8Array(240*135*4);
  let previewBusy=false,previewAt=0,previewIndex=0,labelsAt=0;
  if(options.previewRoot){previewTarget=new THREE.WebGLRenderTarget(240,135);previewTarget.texture.colorSpace=THREE.SRGBColorSpace;}
  function updatePreview(now:number,race:Race){
    if(!previewTarget||previewBusy||now<previewAt||!options.previewRoot?.isConnected)return;
    const canvases=options.previewRoot.querySelectorAll<HTMLCanvasElement>('canvas[data-preview]');if(!canvases.length)return;
    const canvas=canvases[previewIndex++%canvases.length];
    previewAt=now+(quality==='low'?500:200);previewBusy=true;
    const selected=race.players.find(p=>p.id===selectedPlayer()),own=selected?boats[selected.team].crew.find(c=>c.playerId===selected.id):undefined;
    own?.model?.setFirstPerson(false);setShot(previewCamera,canvas.dataset.preview!,options.followBoat?.()||rankings(race)[0],race);previewCamera.updateMatrixWorld();
    const skyPosition=skyDome.position.clone();skyDome.position.copy(previewCamera.position);
    renderer!.setRenderTarget(previewTarget);renderer!.render(scene,previewCamera);renderer!.setRenderTarget(null);skyDome.position.copy(skyPosition);own?.model?.setFirstPerson(true);
    void renderer!.readRenderTargetPixelsAsync(previewTarget,0,0,240,135,pixels).then(()=>{if(disposed||failed)return;canvas.getContext('2d')?.putImageData(new ImageData(new Uint8ClampedArray(pixels),240,135),0,0);canvas.dataset.frame=String(now);}).catch(()=>{if(!disposed)canvas.dataset.unavailable='true';}).finally(()=>{previewBusy=false;});
  }
  function render(now: number) {
    if (disposed || failed || document.hidden) return;
    frame = requestAnimationFrame(render);
    const elapsed = now - lastTime;
    const requested=options.frameRate?.()===90?90:60;
    const target=reduced||frameFallback?30:requested;
    if(!pacer.due(now,target))return;
    element.dataset.targetFps=String(target);
    lastTime = now;
    const costStart = performance.now();
    const race = options.getRace();
    if (!race) { renderer!.render(scene, camera); return; }
    const preference=options.graphics?.()||'auto';if(preference!==graphicsPreference){graphicsPreference=preference;frameFallback=false;quality=preference==='performance'?'medium':'high';slowWindows=fastWindows=0;resize();}
    element.dataset.round=String(race.round);element.dataset.phase=race.phase;
    const reset = race.round !== lastRound;
    if (reset) { localStrokeAt = -Infinity; predictionCount = 0; predictionUntil = 0; preview = 0; }
    syncRoster(race, now);
    const ease = reduced || reset ? 1 : 1 - Math.exp(-Math.min(elapsed, 100) / 50);
    let animatedCrew=0;
    for (const team of teams) {
      const b = boats[team], state = race.boats[team];
      const hit=state.contact||state.collisions>b.collisions;
      const boatEase = hit||race.phase!=='racing' ? 1 : ease;
      const ahead=race.phase==='racing'&&!hit?Math.min(.1,Math.max(0,(serverNow()-race.serverTime)/1000)):0;
      b.x += (state.x+state.vx*ahead-b.x) * boatEase;
      b.distance += (state.distance+state.vy*ahead-b.distance)*boatEase;
      b.heading += Math.atan2(Math.sin(state.heading+state.angularVelocity*ahead-b.heading),Math.cos(state.heading+state.angularVelocity*ahead-b.heading)) * boatEase;
      b.roll+=(state.roll-b.roll)*boatEase;
      b.root.position.set(b.x, reset?0:b.root.position.y, -b.distance);
      b.root.rotation.set(reset?0:b.root.rotation.x,-b.heading,b.roll);
      if (!reduced && race.phase==='racing') {
        const x=b.root.position.x,z=b.root.position.z,t=now*.001;
        b.root.position.y=waterHeight(x,z,t);
        // Sample the same surface at bow/stern and gunwales, instead of unrelated camera bob.
        const sample=state.length*.4,hx=Math.sin(b.heading)*sample,hz=-Math.cos(b.heading)*sample;
        b.root.rotation.x=(waterHeight(x+hx,z+hz,t)-waterHeight(x-hx,z-hz,t))/(sample*2);
      }
      b.wake.position.copy(b.root.position); b.wake.rotation.y = -b.heading;
      b.wake.visible = state.speed > .2;
      if (!reset && state.collisions > b.collisions) b.collisionAt = now;
      b.collisions = state.collisions;
      if (reset) b.collisionAt = -Infinity;
      b.collision.visible = now - b.collisionAt < 450;
      element.dataset.collision = teams.some(t => now - boats[t].collisionAt < 450) ? 'true' : 'false';
      b.wake.scale.set(1, 1, .6 + state.speed * .12);
      const localTeam=race.players.find(p=>p.id===selectedPlayer())?.team;
      const animate=options.view==='broadcast'||team===localTeam||Math.abs(state.distance-race.boats[localTeam??teams[0]].distance)<45;
      for (const crew of b.crew) {const own=crew.playerId===selectedPlayer();const nearby=Math.abs(crew.root.position.z+(localTeam===team?0:state.distance-race.boats[localTeam??teams[0]].distance))<12;
        const detailed=crew.root.visible && animate && (own || (nearby && animatedCrew<(quality==='low'?6:12)-(options.view==='player'?1:0)));crew.model?.setDetail(detailed);
        crew.model?.setFirstPerson(own);if(crew.root.visible)pose(crew,race.players.find(p=>p.id===crew.playerId),now,detailed);if(detailed)animatedCrew++;}
    }
    const player = race.players.find(p => p.id === selectedPlayer());
    const leaderDistance = Math.max(...teams.map(id=>boats[id].distance));
    let anchor = leaderDistance;
    if(player){
      setPOV(camera,player,race);anchor=boats[player.team].distance;
      element.dataset.camera='pov';element.dataset.cameraBoat=player.team;element.dataset.cameraPlayer=player.id;
    }else{
      delete element.dataset.cameraPlayer;
      const shot=director.select(race,now,options.cameraMode?.()==='pov'?'auto':options.cameraMode?.(),options.followBoat?.());
      element.dataset.camera=shot.shot;element.dataset.cameraBoat=shot.boat;
      anchor=setShot(camera,shot.shot,shot.boat,race,reduced||reset?1:1-Math.exp(-elapsed/400));
    }
    finish.visible=race.settings.format==='distance';finish.position.set(0,.06,-race.settings.distance);
    camera.updateMatrixWorld();
    if(now>=labelsAt){labelsAt=now+80;
    for(const p of race.players){const label=rowerLabels.get(p.id)!,crew=boats[p.team]?.crew.find(c=>c.playerId===p.id);if(!crew){label.hidden=true;continue;}crew.root.getWorldPosition(projected);projected.y+=1.65;projected.project(camera);label.hidden=p.id===selectedPlayer()||Math.abs(projected.x)>1||Math.abs(projected.y)>1||Math.abs(projected.z)>1;label.style.left=`${(projected.x+1)*50}%`;label.style.top=`calc(${(1-projected.y)*50}% - ${p.side==='left'&&race.boats[p.team].crewCount>1?22:0}px)`;label.dataset.active=String(p.strokes>0&&serverNow()-p.lastStroke<350);label.dataset.strokes=String(p.strokes);}
    for(const [id,label]of labelMap){const b=boats[id];projected.set(b.x,2.5,-b.distance).project(camera);label.hidden=projected.z>1||projected.z< -1;label.style.left=`${Math.max(6,Math.min(94,(projected.x+1)*50))}%`;label.style.top=`${Math.max(6,Math.min(90,(1-projected.y)*50))}%`;}

    }
    skyDome.position.copy(camera.position);
    water.position.z=-anchor-(options.view==='player'?150:0); bankGround.position.z=water.position.z;
    const fogDistance=quality==='low'?70:110;
    if(player){(scene.fog as THREE.Fog).near=fogDistance*.45;(scene.fog as THREE.Fog).far=fogDistance;}
    scenery!.update(anchor,quality,race.seed,teams.map(team=>boats[team].distance));
    element.dataset.activeChunks=String(scenery!.activeChunks);
    element.dataset.chunkKeys=scenery!.chunkKeys;
    logs.forEach((slot,index)=>{const log=race.logs[index];slot.mesh.visible=!!log && Math.abs(log.distance-anchor)<(options.view==='player'?fogDistance+16:180);if(!log)return;slot.id=log.id;slot.x=log.x;slot.distance=log.distance;slot.mesh.position.set(log.x,WATER_LEVEL+LOG_RADIUS*.7,-log.distance);slot.mesh.rotation.y=-log.heading;});
    waterMaterial.uniforms.time.value = now * .001;
    waterMaterial.uniforms.still.value = reduced ? 1 : 0;
    const nextLogKey=logs.filter(log=>log.mesh.visible).map(log=>`${log.id}/${log.x}/${log.distance}/${log.mesh.rotation.y}`).join(',');
    if(nextLogKey!==logKey){logBatches.update();logKey=nextLogKey;}
    dynamicBatches.update();distantBatches?.update(false);
    element.dataset.distantInstances=String(distantBatches?.count||0);
    waterMaterial.uniforms.fogNear.value=(scene.fog as THREE.Fog).near;
    waterMaterial.uniforms.fogFar.value=(scene.fog as THREE.Fog).far;
    sunlight.shadow.intensity=quality==='high'?.65:0;
    if(quality==='high'&&now>=shadowAt){shadowAt=now+66;sunlight.target.position.set(0,0,-anchor);sunlight.position.set(-35,50,-anchor-30);sunlight.target.updateMatrixWorld();sunlight.shadow.needsUpdate=true;}
    element.dataset.shadows=quality==='high'?'soft':'contact';
    renderer!.render(scene, camera);
    updatePreview(now,race);
    element.dataset.animatedCrew=String(animatedCrew);element.dataset.renderFrames=String(++renderFrames);
    element.dataset.residentInstances=String(scenery!.residentInstances+dynamicBatches.capacity+logBatches.capacity);
    costTotal+=performance.now()-costStart;
    lastRound = race.round;
    fpsFrames++;
    if (now - fpsTime > 2000) {
      const fps = fpsFrames * 1000 / (now - fpsTime);
      element.dataset.fps = String(Math.round(fps));
      element.dataset.drawCalls = String(renderer!.info.render.calls);
      element.dataset.triangles = String(renderer!.info.render.triangles);
      const cost=costTotal/Math.max(1,fpsFrames);
      element.dataset.renderCost=cost.toFixed(2);
      const targetFps=Math.min(target,pacer.refresh);
      slowWindows=cost>1000/targetFps*.85 || (!reduced && fps<targetFps*.72) ? slowWindows+1 : 0;
      fastWindows=cost<1000/Math.min(requested,pacer.refresh)*.36 && fps>targetFps*.9 ? fastWindows+1 : 0;
      const levels:SceneQuality[]=['low','medium','high'];const level=levels.indexOf(quality);
      if(slowWindows>=2 && level>0){quality=levels[level-1];slowWindows=0;fastWindows=0;resize();}
      else if(fastWindows>=5 && level<(mobile?1:2)){quality=levels[level+1];fastWindows=0;resize();}
      element.dataset.quality=quality;costTotal=0;
      fpsFrames = 0; fpsTime = now;
    }
  }
  function onVisibility(){
    cancelAnimationFrame(frame);
    if(!document.hidden && !disposed && !failed){pacer.reset();lastTime=fpsTime=performance.now();fpsFrames=0;costTotal=0;slowWindows=fastWindows=0;frame=requestAnimationFrame(render);}
  }
  void loadCrew().then(async source=>{
    if(disposed||failed)return;
    for(const team of teams)for(const crew of boats[team].crew){
      const player=options.getRace()?.players.find(p=>p.team===team&&p.seat===boats[team].crew.indexOf(crew));
      const own=player?.id===options.playerId && options.view==='player';
      crew.model=createCrew(source,initial.config.find(c=>c.id===team)!.color,own);crewModels.push(crew.model);crew.root.add(crew.model.root);
      pose(crew,options.getRace()?.players.find(p=>p.id===crew.playerId),performance.now());
    }
    distantBatches=makeBatches(dynamicRoot,crewModels.flatMap(m=>m.distantMeshes));
    element.dataset.boatStyle='chundan-vallam';element.dataset.crewAsset='anatomical-rig';await Promise.all([...surfaceLoads,scenery?.ready]);if(disposed||failed)return;await renderer!.compileAsync(scene,camera);if(disposed||failed)return;if(previewTarget){renderer!.setRenderTarget(previewTarget);const warming=renderer!.compileAsync(scene,previewCamera);renderer!.setRenderTarget(null);await warming;}if(!disposed&&!failed){lastTime=fpsTime=performance.now();fpsFrames=costTotal=slowWindows=fastWindows=0;frameFallback=false;quality=graphicsPreference==='performance'||mobile?'medium':'high';resize();resolveReady();}
  }).catch(error=>{console.error('Crew asset:',error);useFallback('Crew assets could not load. Showing the live river map; reload to retry 3D.');});
  document.addEventListener('visibilitychange',onVisibility);
  if(!document.hidden) frame = requestAnimationFrame(render);
  return controls;
}
