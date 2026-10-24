import { Director } from './director';
import * as THREE from 'three';
import {KTX2Loader} from 'three/addons/loaders/KTX2Loader.js';
import { crewSeatZ, type Race, type Team, type Player, type Side } from './race-v2';
import { loadCrew, createCrew } from './crew';
import { HULL, LOG_HALF_LENGTH, LOG_RADIUS, WATER_LEVEL } from './world';
import { createScenery, type SceneQuality } from './scenery';
import { paddlePose, waterHeight, STROKE_SECONDS, PADDLE_LEAN } from './rowing';

type Options = { getRace: () => Race | null; playerId?: string; view: 'player' | 'broadcast'; followBoat?: () => string; cameraMode?: () => string; onFallback?: (reason: string) => void };


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
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  let reduced = reducedQuery.matches;
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 760;
  let quality: SceneQuality = mobile ? 'medium' : 'high';
  let renderFrames = 0, costTotal = 0, slowWindows = 0, fastWindows = 0;
  let yaw = 0, pitch = 0, preview = 0, localStrokeAt = -Infinity;
  let predictionCount = 0, predictionUntil = 0;
  const scene = new THREE.Scene();
  const sky = new THREE.Color('#b9cec5');
  scene.background = sky;
  scene.fog = new THREE.Fog('#b9cec5', 65, 190);
  const camera = new THREE.PerspectiveCamera(options.view === 'player' ? 72 : 50, 1, .045, 1000);
  camera.rotation.order = 'YXZ';
  element.dataset.view = options.view;
  element.dataset.lookYaw = '0'; element.dataset.lookPitch = '0';
  const onReduced = () => { reduced = reducedQuery.matches; element.dataset.motion = reduced ? 'reduced' : 'full'; };
  reducedQuery.addEventListener('change', onReduced);
  onReduced();

  function releaseGPU() {
    cancelAnimationFrame(frame);
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
    const pixelBudget = mobile ? 850000 : 1800000;
    renderer!.setPixelRatio(Math.min(devicePixelRatio || 1, dprCap, Math.sqrt(pixelBudget / (width * height))));
    element.dataset.pixelRatio = String(renderer!.getPixelRatio());
    renderer!.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
  };
  observer = new ResizeObserver(resize);
  observer.observe(element);
  resize();
  scene.add(new THREE.HemisphereLight('#dce8ed', '#414738', 1.7));
  const sunlight = new THREE.DirectionalLight('#ffe2ac', 2.8);
  sunlight.position.set(-35, 50, -30);
  scene.add(sunlight);
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
      vec3 color=mix(vec3(.64,.73,.70),vec3(.16,.35,.48),pow(h,.55));
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
      void main(){float t=time*(1.0-still);
        float a=world.x*1.7+world.z*2.1+t*.8; float b=world.x*3.3-world.z*1.4-t*.55;
        float c=world.x*5.7+world.z*.73+t*1.1;
        float ca=cos(a+sin(b*.17)*.8),cb=cos(b+sin(a*.21)*.7);
        vec3 normal=normalize(vec3(.035*ca+.024*cb+.009*cos(c),1.,.045*ca-.018*cb+.006*cos(c)));
        vec3 eye=normalize(cameraPosition-world); float fresnel=.035+.65*pow(1.-max(dot(normal,eye),0.),4.);
        vec3 deep=vec3(.022,.10,.08), reflected=vec3(.48,.60,.57);
        vec3 color=mix(deep,reflected,fresnel);
        vec3 sun=normalize(vec3(-.5,.8,-.35)); vec3 halfVector=normalize(sun+eye);
        color+=vec3(.92,.83,.57)*pow(max(dot(normal,halfVector),0.),100.)*.65;
        color+=vec3(.007,.015,.008)*(sin(world.x*.19+world.z*.15)*.5+.5);
        color=mix(color,vec3(.56,.69,.64),smoothstep(fogNear,fogFar,depth));
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
    node(bankGround, box, sand, sign * (riverWidth/2+25), -.18, 0, 50, .45, 900);
    node(bankGround, box, grass, sign * (riverWidth/2+26.5), .03, 0, 51, .6, 900);
  }
  scenery = createScenery(scene, { geometry, material, wood, deck, trim }, options.view === 'broadcast', riverWidth);
  const dynamicRoot = new THREE.Group(); scene.add(dynamicRoot);
  const logRoot = new THREE.Group(); scene.add(logRoot);
  type Crew = { root: THREE.Group; model?: ReturnType<typeof createCrew>; paddle: THREE.Group; splash: THREE.Group; playerId: string; strokes: number; at: number; side: number };
  type BoatScene = { root: THREE.Group; crew: Crew[]; wake: THREE.Group; x: number; distance: number; heading: number; collision: THREE.Mesh; collisions: number; collisionAt: number };
  const boats = {} as Record<Team, BoatScene>;
  const wakeMat = new THREE.MeshBasicMaterial({ color: '#dcf4d9', transparent: true, opacity: .4, depthWrite: false, side: THREE.DoubleSide }); materials.add(wakeMat);
  const wakeGeo = geometry(new THREE.PlaneGeometry(1, 1));
  const collisionGeo = geometry(new THREE.RingGeometry(.88, 1, 32));
  const collisionMat = new THREE.MeshBasicMaterial({ color: '#ff9b56', transparent: true, opacity: .8, depthWrite: false, side: THREE.DoubleSide });
  materials.add(collisionMat);
  // The outer top contour is exactly the shared collision polygon, including pointed ends.
  const hullShape = new THREE.Shape();
  HULL.forEach(([x, z], i) => i ? hullShape.lineTo(x, z) : hullShape.moveTo(x, z)); hullShape.closePath();
  const hullGeo = geometry(new THREE.ExtrudeGeometry(hullShape, { depth: .16, bevelEnabled: false })); hullGeo.rotateX(Math.PI / 2);
  const sideVertices: number[] = [];
  for (let i = 0; i < HULL.length; i++) {
    const [x, z] = HULL[i], [nx, nz] = HULL[(i + 1) % HULL.length];
    sideVertices.push(x,.44,z, nx,.44,nz, nx*.7,-.32,nz*.97, x,.44,z, nx*.7,-.32,nz*.97, x*.7,-.32,z*.97);
  }
  const hullSides = geometry(new THREE.BufferGeometry()); hullSides.setAttribute('position', new THREE.Float32BufferAttribute(sideVertices, 3)); hullSides.computeVertexNormals();
  const sideUV: number[]=[];for(let i=0;i<sideVertices.length;i+=3)sideUV.push(sideVertices[i+2]*.3,sideVertices[i+1]);
  hullSides.setAttribute('uv',new THREE.Float32BufferAttribute(sideUV,2));
  const sideMaterial = wood.clone(); sideMaterial.side = THREE.DoubleSide; materials.add(sideMaterial);
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
      m.map=texture;m.color.set(['#b79777','#fff4df','#e4c99c','#b79777'][i]);m.bumpMap=null;m.needsUpdate=true;
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
  // Round rail sections follow the same curved outline used by collision detection.
  const railSegments = HULL.map(([x,z], i) => { const [nx,nz] = HULL[(i+1)%HULL.length]; return { x, z, nx, nz }; });
  const bladeShape = new THREE.Shape(); bladeShape.moveTo(0,.25); bladeShape.bezierCurveTo(.08,.18,.15,-.03,.1,-.24); bladeShape.quadraticCurveTo(0,-.34,-.1,-.24); bladeShape.bezierCurveTo(-.15,-.03,-.08,.18,0,.25);
  const bladeGeo = geometry(new THREE.ExtrudeGeometry(bladeShape, { depth: .025, bevelEnabled: true, bevelThickness: .008, bevelSize: .012, bevelSegments: 1, curveSegments: 5 }));
  const armA = new THREE.Vector3(), armB = new THREE.Vector3(), elbow = new THREE.Vector3();
  const bladePoint = new THREE.Vector3();
  const contactShade = new THREE.MeshBasicMaterial({color:'#241d15',transparent:true,opacity:.18,depthWrite:false}); materials.add(contactShade);
  const contactGeo = geometry(new THREE.CircleGeometry(1, 16));
  for (const team of teams) {
    const root = new THREE.Group(); dynamicRoot.add(root);
    const length=initial.boats[team].length, capacity=initial.boats[team].crewCount;
    const hull = new THREE.Group(); hull.scale.set(1.65/1.48,1,length/9.8);root.add(hull);
    node(hull, hullGeo, wood, 0, .19, 0, 1, 1, 1);
    node(hull, hullSides, sideMaterial, 0, 0, 0, 1, 1, 1);
    for (const rail of railSegments) {
      const beam=node(hull,cylinder,teamMaterials[team],0,0,0,1,1,1);
      segment(beam,new THREE.Vector3(rail.x*.955,.455,rail.z*.992),new THREE.Vector3(rail.nx*.955,.455,rail.nz*.992),.033);
    }
    for (let j=0;j<7;j++) node(hull,box,j%2?deck:trim,(j-3)*.155,.225,0,.147,.055,6.1);
    for (let j=0;j<10;j++) {
      const z=-3.15+j*.68, width=.63-Math.abs(z)*.025;
      node(hull,box,wood,0,.265,z,width*2,.055,.055);
      for (const side of [-1,1]) {
        const rib=node(hull,box,deck,side*width,.35,z,.045,.23,.065);rib.rotation.z=-side*.22;
        node(hull,sphere,brass,side*(width-.02),.455,z,.025,.012,.025);
      }
    }
    // Bow ornament and slender flag provide a stable forward reference.
    node(hull, cylinder, trim, 0, .85, -4.35, .035, 1.3, .035);
    const flag = node(hull, box, teamMaterials[team], .24, 1.38, -4.35, .48, .24, .025); flag.rotation.z = -.1;
    const crew: Crew[] = [];
    for (let i = 0; i < capacity; i++) {
      node(root, box, deck, 0, .47, crewSeatZ(i, capacity) + .13, 1.3, .075, .26);
      node(root, contactGeo, contactShade, 0, .513, crewSeatZ(i, capacity) + .13, .36, .11, 1).rotation.x = -Math.PI / 2;
      const person = new THREE.Group(); root.add(person);
      const paddle = new THREE.Group(); person.add(paddle);
      node(paddle, cylinder, trim, 0, 0, 0, .024, 1.85, .024);
      const blade = node(paddle, bladeGeo, deck, 0, -.89, 0, 1, 1, 1); blade.rotation.y = .18;
      node(paddle, sphere, trim, 0, .92, 0, .075, .025, .025);
      const splash = new THREE.Group(); person.add(splash);
      for (let j = 0; j < 5; j++) node(splash, sphere, white, 0, 0, 0, .04, .08, .04);
      splash.visible = false;
      crew.push({ root: person, paddle, splash, playerId: '', strokes: 0, at: -Infinity, side: i % 2 ? 1 : -1 });
    }
    const wake = new THREE.Group(); dynamicRoot.add(wake);
    for (let i = 0; i < 8; i++) {
      const mesh = node(wake, wakeGeo, wakeMat, (i % 2 ? 1 : -1) * (.7 + Math.floor(i / 2) * .35), -.095, length/2 + Math.floor(i / 2) * 1.6, .055, 2.2, 1);
      mesh.rotation.set(-Math.PI / 2, 0, (i % 2 ? -1 : 1) * .22);
    }
    const collision = node(root, collisionGeo, collisionMat, 0, -.085, 0, 1.3, length/2+.3, 1);
    collision.rotation.x = -Math.PI / 2; collision.visible = false;
    boats[team] = { root, crew, wake, x: 0, distance: 0, heading: 0, collision, collisions: 0, collisionAt: -Infinity };
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
  function makeBatches(root: THREE.Group) {
    const groups = new Map<string, THREE.Mesh[]>();
    root.traverse(object => {
      if (!(object instanceof THREE.Mesh) || Array.isArray(object.material)) return;
      const key=object.geometry.uuid+object.material.uuid, group=groups.get(key)??[];
      group.push(object); groups.set(key,group);
    });
    const batches: {mesh:THREE.InstancedMesh;sources:THREE.Mesh[]}[]=[];
    for(const sources of groups.values()) {
      const mesh=new THREE.InstancedMesh(sources[0].geometry,sources[0].material,sources.length);
      mesh.count=0;mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage); mesh.frustumCulled=false;
      sources.forEach(source=>source.layers.set(1));scene.add(mesh);batches.push({mesh,sources});
    }
    return { update(){
      root.updateMatrixWorld(true);
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
  let logKey='';

  let lastRound = -1, rosterKey = '', lastTime = performance.now(), fpsTime = lastTime, fpsFrames = 0;
  const director=new Director(),aim=new THREE.Vector3(),projected=new THREE.Vector3();
  const labels=document.createElement('div');labels.className='boat-labels';element.append(labels);
  const labelMap=new Map(teams.map(id=>{const label=document.createElement('span');label.className='boat-label';label.textContent=initial.config.find(c=>c.id===id)!.name;label.style.borderColor=initial.config.find(c=>c.id===id)!.color;labels.append(label);return[id,label];}));
  const finish=new THREE.Mesh(new THREE.BoxGeometry(initial.riverWidth-10,.07,.3),new THREE.MeshBasicMaterial({color:0xf8eed0}));scene.add(finish);geometries.add(finish.geometry);materials.add(finish.material);
  const cameraPoint = new THREE.Vector3(), cameraTarget = new THREE.Vector3();
  const boatQuaternion = new THREE.Quaternion(), lookQuaternion = new THREE.Quaternion();
  const lookEuler = new THREE.Euler(0, 0, 0, 'YXZ');

  function syncRoster(race: Race, now: number) {
    const nextKey = `${race.round}:` + race.players.map(p => `${p.id}/${p.team}/${p.side}`).join(',');
    if (nextKey === rosterKey) return;
    rosterKey = nextKey;
    for (const team of teams) {
      const players = race.players.filter(p => p.team === team);
      boats[team].crew.forEach((crew, i) => {
        const player = players.find(p=>p.seat===i);
        crew.root.visible = !!player;
        crew.playerId = player?.id ?? '';
        crew.side = player?.side === 'right' ? 1 : -1;
        crew.root.position.set(race.boats[team].crewCount===1?0:crew.side * .22, 0, crewSeatZ(i, race.boats[team].crewCount));

        crew.strokes = player?.strokes ?? 0;
        crew.at = now - 1000;
      });
    }
    const player = race.players.find(p => p.id === options.playerId);
    if (player) {
      element.dataset.seat = String(race.players.filter(p => p.team === player.team).findIndex(p => p.id === player.id) + 1);
      element.dataset.side = player.side;
    } else { delete element.dataset.seat; delete element.dataset.side; }
  }
  function pose(crew: Crew, player: Player | undefined, now: number) {
    const own = options.view === 'player' && crew.playerId === options.playerId;
    if (player && player.strokes !== crew.strokes) {
      if (player.strokes > crew.strokes && !(own && now < predictionUntil && player.strokes <= predictionCount)) crew.at = now-Math.max(0,Date.now()-player.lastStroke);
      crew.strokes = player.strokes;
    }
    if(player && options.getRace()!.boats[player.team].crewCount===1)crew.side=(own?(localSide||player.lastSide):player.lastSide)==='right'?1:-1;
    const age = (now - (own ? Math.max(crew.at, localStrokeAt) : crew.at)) / 1000;
    const stroke = paddlePose(age, own ? preview : 0);
    crew.paddle.position.set(crew.side * .25, stroke.y, stroke.z);
    // Feather the blade through recovery; its working face pushes water during the drive.
    crew.paddle.rotation.set(stroke.pitch, stroke.active && !stroke.drive ? Math.sin(Math.PI * age / STROKE_SECONDS) * .7 : 0, crew.side * PADDLE_LEAN);
    crew.paddle.updateMatrix();
    const shoulders:THREE.Vector3[]=[], hands:THREE.Vector3[]=[];
    for (let i = 0; i < 2; i++) {
      armA.set(i ? .22 : -.22, own ? 1.06 : 1.17, -.04);
      armB.set(0, (i === (crew.side > 0 ? 1 : 0)) ? -.15 : .3, 0).applyMatrix4(crew.paddle.matrix);
      elbow.copy(armA).lerp(armB,.52); elbow.y-=.13; elbow.x+=(i?1:-1)*.07;
      shoulders.push(armA.clone());hands.push(armB.clone());
    }
    crew.model?.pose(shoulders,hands);
    bladePoint.set(0,-1.2,0).applyMatrix4(crew.paddle.matrix);
    if(own){element.dataset.strokePhase=stroke.drive?'drive':stroke.active?'recovery':'ready';element.dataset.bladeHeight=bladePoint.y.toFixed(3);}
    crew.splash.visible = stroke.drive;
    crew.splash.children.forEach((drop, i) => {
      const life = Math.min(1, age / .32);
      drop.position.set(bladePoint.x + Math.sin(i * 3) * .14, WATER_LEVEL + (reduced ? .035 : Math.sin(life * Math.PI) * (.16 + i * .035)), bladePoint.z + Math.cos(i * 4) * .12);
      drop.scale.setScalar(Math.max(0, 1 - life) * .055);
    });
  }
  function render(now: number) {
    if (disposed || failed || document.hidden) return;
    frame = requestAnimationFrame(render);
    const elapsed = now - lastTime;
    // Follow a 60 Hz display directly; a 40 Hz threshold skips every other frame on it.
    const interval = reduced ? 1000 / 30 : quality === 'low' ? 1000 / 30 : 1000 / 60;
    if (elapsed < interval - 1) return;
    lastTime = now;
    const costStart = performance.now();
    const race = options.getRace();
    if (!race) { renderer!.render(scene, camera); return; }
    const reset = race.round !== lastRound;
    if (reset) { localStrokeAt = -Infinity; predictionCount = 0; predictionUntil = 0; preview = 0; }
    syncRoster(race, now);
    const ease = reduced || reset ? 1 : 1 - Math.exp(-Math.min(elapsed, 100) / 80);
    let animatedCrew=0;
    for (const team of teams) {
      const b = boats[team], state = race.boats[team];
      const boatEase = state.collisions > b.collisions ? 1 : ease;
      b.x += (state.x - b.x) * boatEase;
      b.distance += (state.distance - b.distance) * boatEase;
      b.heading += Math.atan2(Math.sin(state.heading-b.heading),Math.cos(state.heading-b.heading)) * boatEase;
      b.root.position.set(b.x, 0, -b.distance);
      b.root.rotation.set(0,-b.heading,0);
      if (!reduced && race.phase==='racing') {
        const x=b.root.position.x,z=b.root.position.z,t=now*.001;
        b.root.position.y=waterHeight(x,z,t);
        // Sample the same surface at bow/stern and gunwales, instead of unrelated camera bob.
        const sample=state.length*.4,hx=Math.sin(b.heading)*sample,hz=-Math.cos(b.heading)*sample;
        b.root.rotation.x=(waterHeight(x+hx,z+hz,t)-waterHeight(x-hx,z-hz,t))/(sample*2);
        const rx=Math.cos(b.heading)*.65,rz=Math.sin(b.heading)*.65;
        b.root.rotation.z=(waterHeight(x+rx,z+rz,t)-waterHeight(x-rx,z-rz,t))/1.3;
      }
      b.wake.position.copy(b.root.position); b.wake.rotation.y = -b.heading;
      b.wake.visible = state.speed > .2;
      if (!reset && state.collisions > b.collisions) b.collisionAt = now;
      b.collisions = state.collisions;
      if (reset) b.collisionAt = -Infinity;
      b.collision.visible = now - b.collisionAt < 450;
      element.dataset.collision = teams.some(t => now - boats[t].collisionAt < 450) ? 'true' : 'false';
      b.wake.scale.set(1, 1, .6 + state.speed * .12);
      const localTeam=race.players.find(p=>p.id===options.playerId)?.team;
      const animate=options.view==='broadcast'||team===localTeam||Math.abs(state.distance-race.boats[localTeam??teams[0]].distance)<45;
      for (const crew of b.crew) {const own=crew.playerId===options.playerId;const nearby=Math.abs(crew.root.position.z+(localTeam===team?0:state.distance-race.boats[localTeam??teams[0]].distance))<12;
        const detailed=crew.root.visible && animate && (own || (nearby && animatedCrew<(quality==='low'?6:12)-(options.view==='player'?1:0)));crew.model?.setDetail(detailed);
        if(detailed){pose(crew,race.players.find(p=>p.id===crew.playerId),now);animatedCrew++;}else crew.splash.visible=false;}
    }
    const player = race.players.find(p => p.id === options.playerId);
    const leaderDistance = Math.max(...teams.map(id=>boats[id].distance));
    let anchor = leaderDistance;
    if (options.view === 'player' && player) {
      const boat = boats[player.team];
      const seat = race.players.filter(p => p.team === player.team).findIndex(p => p.id === player.id);
      // Eye position is at the seated player's head, inside the actual hull.
      cameraPoint.set(race.boats[player.team].crewCount===1?0:(player.side === 'left' ? -1 : 1) * .22, 1.38, crewSeatZ(seat, race.boats[player.team].crewCount) + .035);
      boat.root.updateMatrixWorld(true);
      camera.position.copy(boat.root.localToWorld(cameraPoint));
      boat.root.getWorldQuaternion(boatQuaternion);
      lookEuler.set(pitch - .13, yaw, 0);
      lookQuaternion.setFromEuler(lookEuler);
      camera.quaternion.copy(boatQuaternion).multiply(lookQuaternion);
      anchor = boat.distance;
    } else {
      const shot=director.select(race,now,options.cameraMode?.(),options.followBoat?.());
      element.dataset.camera=shot.shot;element.dataset.cameraBoat=shot.boat;
      const target=boats[shot.boat]||boats[teams[0]],tracked=Object.values(boats);
      const midpoint=tracked.reduce((sum,b)=>sum+b.distance,0)/tracked.length;
      const centerX=tracked.reduce((sum,b)=>sum+b.x,0)/tracked.length;
      const separation=Math.max(...tracked.map(b=>b.distance))-Math.min(...tracked.map(b=>b.distance));
      const width=Math.max(14,Math.max(...tracked.map(b=>b.x))-Math.min(...tracked.map(b=>b.x))+12);
      const spread=Math.max(20,separation+15,width/camera.aspect);
      (scene.fog as THREE.Fog).near=65+separation*.7;(scene.fog as THREE.Fog).far=190+separation*.9;
      cameraPoint.set(centerX+8,15+spread*.46,-midpoint+18+spread*.38);cameraTarget.set(centerX,0,-midpoint-2);anchor=midpoint;
      if(shot.shot!=='overview'){
       anchor=target.distance;cameraTarget.set(target.x,0,-target.distance);
       const length=race.boats[shot.boat]?.length||6;
       if(shot.shot==='side')cameraPoint.set(target.x+20,9,-target.distance+3);
       if(shot.shot==='chase')cameraPoint.set(target.x+4,7,-target.distance+length*.5+12);
       if(shot.shot==='bow')cameraPoint.set(target.x+3,4,-target.distance-length*.5-12);
       if(shot.shot==='finish'){cameraPoint.set(race.riverWidth*.4,12,-race.settings.distance-5);cameraTarget.set(0,0,-race.settings.distance+8);anchor=race.settings.distance;}
      }
      const blend=reduced||reset?1:1-Math.exp(-elapsed/650);
      camera.position.lerp(cameraPoint,blend);aim.lerp(cameraTarget,blend);camera.lookAt(aim);
    }
    finish.visible=race.settings.format==='distance';finish.position.set(0,.06,-race.settings.distance);
    camera.updateMatrixWorld();
    for(const [id,label]of labelMap){const b=boats[id];projected.set(b.x,2.5,-b.distance).project(camera);label.hidden=projected.z>1||projected.z< -1;label.style.left=`${Math.max(6,Math.min(94,(projected.x+1)*50))}%`;label.style.top=`${Math.max(6,Math.min(90,(1-projected.y)*50))}%`;}

    skyDome.position.copy(camera.position);
    water.position.z=-anchor-(options.view==='player'?150:0); bankGround.position.z=water.position.z;
    const fogDistance=quality==='low'?70:110;
    if(options.view==='player'){(scene.fog as THREE.Fog).near=fogDistance*.45;(scene.fog as THREE.Fog).far=fogDistance;}
    scenery!.update(anchor,quality,race.seed,teams.map(team=>boats[team].distance));
    element.dataset.activeChunks=String(scenery!.activeChunks);
    element.dataset.chunkKeys=scenery!.chunkKeys;
    logs.forEach((slot,index)=>{const log=race.logs[index];slot.mesh.visible=!!log && Math.abs(log.distance-anchor)<(options.view==='player'?fogDistance+16:180);if(!log)return;slot.id=log.id;slot.x=log.x;slot.distance=log.distance;slot.mesh.position.set(log.x,WATER_LEVEL+LOG_RADIUS*.7,-log.distance);slot.mesh.rotation.y=-log.heading;});
    waterMaterial.uniforms.time.value = now * .001;
    waterMaterial.uniforms.still.value = reduced ? 1 : 0;
    const nextLogKey=logs.filter(log=>log.mesh.visible).map(log=>`${log.id}/${log.x}/${log.distance}/${log.mesh.rotation.y}`).join(',');
    if(nextLogKey!==logKey){logBatches.update();logKey=nextLogKey;}
    dynamicBatches.update();
    waterMaterial.uniforms.fogNear.value=(scene.fog as THREE.Fog).near;
    waterMaterial.uniforms.fogFar.value=(scene.fog as THREE.Fog).far;
    renderer!.render(scene, camera);
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
      const targetFps = reduced || quality === 'low' ? 30 : 60;
      slowWindows=cost>14 || (!reduced && fps<targetFps*.72) ? slowWindows+1 : 0;
      fastWindows=cost<6 && fps>targetFps*.9 ? fastWindows+1 : 0;
      const levels:SceneQuality[]=['low','medium','high'];const level=levels.indexOf(quality);
      if(slowWindows>=2 && level>0){quality=levels[level-1];slowWindows=0;fastWindows=0;resize();}
      else if(fastWindows>=5 && level<(mobile?1:2)){quality=levels[level+1];fastWindows=0;resize();}
      element.dataset.quality=quality;costTotal=0;
      fpsFrames = 0; fpsTime = now;
    }
  }
  function onVisibility(){
    cancelAnimationFrame(frame);
    if(!document.hidden && !disposed && !failed){lastTime=fpsTime=performance.now();fpsFrames=0;costTotal=0;slowWindows=fastWindows=0;frame=requestAnimationFrame(render);}
  }
  void loadCrew().then(async source=>{
    if(disposed||failed)return;
    for(const team of teams)for(const crew of boats[team].crew){
      const player=options.getRace()?.players.filter(p=>p.team===team)[boats[team].crew.indexOf(crew)];
      const own=player?.id===options.playerId && options.view==='player';
      crew.model=createCrew(source,initial.config.find(c=>c.id===team)!.color,own);crewModels.push(crew.model);crew.root.add(crew.model.root);
      pose(crew,options.getRace()?.players.find(p=>p.id===crew.playerId),performance.now());
    }
    element.dataset.crewAsset='anatomical-rig';await Promise.all([...surfaceLoads,scenery?.ready]);if(disposed||failed)return;await renderer!.compileAsync(scene,camera);if(!disposed&&!failed)resolveReady();
  }).catch(error=>{console.error('Crew asset:',error);useFallback('Crew assets could not load. Showing the live river map; reload to retry 3D.');});
  document.addEventListener('visibilitychange',onVisibility);
  if(!document.hidden) frame = requestAnimationFrame(render);
  return controls;
}
