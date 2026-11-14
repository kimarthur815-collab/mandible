import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as TX from './textures.js';
import { Spider } from './spider.js';
import { makeSilkMaterial, makeDoorWeb, makeCornerWebs, Thread, EggSacs } from './silk.js';

// metres; a 3 m wide factory corridor with a 2.6 m ceiling
const $ = (s) => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const TEST = new URLSearchParams(location.search).has('test');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const setLoad = (txt) => { const el = $('#loading .msg'); if (el) el.textContent = txt; };
const CEIL = 2.6, HALF_W = 1.5, Z0 = -9.2, DOOR_Z = 6.5;
const BOUNDS = { x0: -1.05, x1: 1.05, z0: -6.5, z1: 5.2 };

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.6 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('#app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const BG_DARK = new THREE.Color(0x020202), BG_STUDIO = new THREE.Color(0x101113);
  scene.background = BG_DARK.clone();
  scene.fog = new THREE.FogExp2(0x020202, 0.09);
  const camera = new THREE.PerspectiveCamera(55, innerWidth / innerHeight, 0.02, 80);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.03;

  setLoad('거미줄 치는 중');
  await nextFrame();
  const T = { chitin: TX.makeChitinNormal(256) };
  const F = TX.makeFloorTextures(coarse ? 768 : 1024);
  const D = TX.makeDrumTextures();
  const cookie = TX.makeCookie(512);

  // ------------------------------------------------------------ corridor
  setLoad('복도 짓는 중');
  await nextFrame();
  const arch = new THREE.Group();
  scene.add(arch);
  const surf = (w, h, rx, ry, tint, wet = false) => {
    const tex = (t) => { const c = t.clone(); c.repeat.set(w / 2.5, h / 2.5); c.needsUpdate = true; return c; };
    return new THREE.MeshStandardMaterial({ map: tex(F.map), roughnessMap: wet ? tex(F.roughnessMap) : null, normalMap: tex(F.normalMap), color: tint, roughness: wet ? 1 : 0.92 });
  };
  const L = 22, zc = -1.2;
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, L), surf(3, L, 0, 0, 0xffffff));
  floor.material.roughness = 0.82;
  floor.rotation.x = -Math.PI / 2; floor.position.set(0, 0, zc);
  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, L), surf(3, L, 0, 0, 0x7a746a));
  ceil.rotation.x = Math.PI / 2; ceil.position.set(0, CEIL, zc);
  const wallMat = surf(L, CEIL, 0, 0, 0x857f74);
  const wl = new THREE.Mesh(new THREE.PlaneGeometry(L, CEIL), wallMat); wl.rotation.y = Math.PI / 2; wl.position.set(-HALF_W, CEIL / 2, zc);
  const wr = new THREE.Mesh(new THREE.PlaneGeometry(L, CEIL), wallMat); wr.rotation.y = -Math.PI / 2; wr.position.set(HALF_W, CEIL / 2, zc);
  const back = new THREE.Mesh(new THREE.PlaneGeometry(HALF_W * 2, CEIL), surf(3, CEIL, 0, 0, 0x8a8478)); back.position.set(0, CEIL / 2, Z0);
  for (const m of [floor, ceil, wl, wr, back]) { m.receiveShadow = true; arch.add(m); }
  // partition with a doorway at the far end
  const partMat = surf(1, CEIL, 0, 0, 0x8a8478);
  for (const s of [-1, 1]) {
    const p = new THREE.Mesh(new THREE.BoxGeometry(HALF_W - 0.75, CEIL, 0.15), partMat);
    p.position.set(s * (0.75 + (HALF_W - 0.75) / 2), CEIL / 2, DOOR_Z); p.receiveShadow = true; arch.add(p);
  }
  const lintel = new THREE.Mesh(new THREE.BoxGeometry(1.5, CEIL - 2.2, 0.15), partMat);
  lintel.position.set(0, 2.2 + (CEIL - 2.2) / 2, DOOR_Z); arch.add(lintel);
  const steel = new THREE.MeshStandardMaterial({ map: D.map, roughnessMap: D.roughnessMap, metalness: 0.6, roughness: 1 });
  for (const [w, h, x, y] of [[0.08, 2.2, -0.79, 1.1], [0.08, 2.2, 0.79, 1.1], [1.66, 0.08, 0, 2.24]]) {
    const f = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.2), steel); f.position.set(x, y, DOOR_Z); f.receiveShadow = true; arch.add(f);
  }
  // pipes and a dead lamp along the ceiling
  for (const s of [-1, 1]) {
    const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, L, 16).rotateX(Math.PI / 2), steel);
    pipe.position.set(s * 1.22, CEIL - 0.14, zc); pipe.castShadow = true; arch.add(pipe);
  }
  const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 1.2), new THREE.MeshStandardMaterial({ color: 0x2a2a28, metalness: 0.5, roughness: 0.6 }));
  lamp.position.set(0, CEIL - 0.04, -3.6); arch.add(lamp);
  // debris on the floor
  {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const count = 160;
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.92 }), count);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color();
    let seed = 21;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < count; i++) {
      const sz = 0.008 + Math.pow(rnd(), 3) * 0.05;
      pos.set((rnd() * 2 - 1) * 1.4, sz * 0.3, Z0 + rnd() * 18);
      q.setFromEuler(new THREE.Euler(rnd(), rnd() * 6, rnd()));
      m.setMatrixAt(i, M.compose(pos, q, s.set(sz, sz * 0.6, sz)));
      m.setColorAt(i, c.setHSL(0.07, 0.08, 0.2 + rnd() * 0.15));
    }
    m.receiveShadow = true;
    arch.add(m);
  }

  // ------------------------------------------------------------ silk
  const silk = makeSilkMaterial();
  const doorWeb = makeDoorWeb(0.08, 1.3, DOOR_Z - 0.12, 0.74, 2.18, silk);
  doorWeb.frustumCulled = false;
  scene.add(doorWeb);
  const corner = makeCornerWebs([
    { x: -1.48, y: 2.58, z: -1.5, sx: -1, sy: 1, len: 1.6 },
    { x: 1.48, y: 2.58, z: 3.2, sx: 1, sy: 1, len: 2.2 },
    { x: -1.48, y: 2.58, z: 4.5, sx: -1, sy: 1, len: 1.2 },
  ], silk);
  corner.frustumCulled = false;
  scene.add(corner);
  const thread = new Thread(silk);
  scene.add(thread.line);
  const eggs = new EggSacs([new THREE.Vector3(1.28, 2.46, 2.6), new THREE.Vector3(1.34, 2.4, 3.25), new THREE.Vector3(1.24, 2.48, 3.9)], T, silk);
  scene.add(eggs.group);

  // ------------------------------------------------------------ spider
  setLoad('거미 다리 붙이는 중');
  await nextFrame();
  const SPOT0 = { x: 0.25, z: 0.0, yaw: Math.PI * 0.92 };
  let spider = null;
  const spiderType = { v: 'wolf' };
  const makeSpider = (type) => {
    if (spider) { scene.remove(spider.root); spider.dispose(); }
    spider = new Spider(type, T);
    scene.add(spider.root);
    spider.placeOnCeiling(SPOT0.x, SPOT0.z, SPOT0.yaw, CEIL);
    wireSpider();
  };

  // ------------------------------------------------------------ lights
  const hemi = new THREE.HemisphereLight(0x7f90b8, 0x0a0806, 0.04);
  scene.add(hemi);
  const spot = new THREE.SpotLight(0xffeedd, 95, 0, 0.36, 0.55, 2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  spot.shadow.bias = -0.0002; spot.shadow.normalBias = 0.01;
  spot.shadow.camera.near = 0.1; spot.shadow.camera.far = 25;
  spot.map = cookie;
  scene.add(spot, spot.target);
  const bounce = new THREE.PointLight(0xffd8b0, 1.6, 5, 1.6);
  scene.add(bounce);
  const key = new THREE.DirectionalLight(0xfff1e2, 2.4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 0.5, far: 30 });
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0x9db5ff, 1.6);
  const fill = new THREE.PointLight(0xffe2c8, 6, 8, 1.5);
  scene.add(key, key.target, rim, rim.target, fill);

  // dust
  const DUST = coarse ? 400 : 700;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(DUST * 3), ds = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { dp[i * 3] = Math.random() * 3; dp[i * 3 + 1] = Math.random() * 2.6; dp[i * 3 + 2] = Math.random() * 10; ds[i] = Math.random(); }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dg.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSpotPos: { value: new THREE.Vector3() }, uSpotDir: { value: new THREE.Vector3(0, -1, 0) }, uCosO: { value: Math.cos(0.36) }, uCosI: { value: Math.cos(0.2) }, uOn: { value: 1 }, uAmb: { value: 0 }, uPR: { value: renderer.getPixelRatio() } },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; uniform vec3 uCenter; uniform vec3 uSpotPos; uniform vec3 uSpotDir;
      uniform float uCosO; uniform float uCosI; uniform float uOn; uniform float uAmb; uniform float uPR; varying float vI;
      void main(){
        vec3 box = vec3(3.0, 2.6, 10.0);
        vec3 p = position + vec3(sin(uTime*0.11 + aSeed*40.0)*0.2, sin(uTime*0.07 + aSeed*23.0)*0.2 - uTime*0.01, cos(uTime*0.09 + aSeed*31.0)*0.3 + uTime*0.02);
        vec3 origin = vec3(-1.5, 0.0, uCenter.z - 5.0);
        p = mod(p - origin, box) + origin;
        vec3 L = p - uSpotPos; float d = length(L);
        float cone = smoothstep(uCosO, uCosI, dot(L / d, uSpotDir));
        vI = (cone * uOn * 2.0 / (1.0 + d * d * 0.1) + uAmb) * (0.35 + 0.65 * fract(aSeed * 7.13));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (6.0 + aSeed * 10.0) * uPR / max(0.3, -mv.z);
      }`,
    fragmentShader: 'varying float vI; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * vI * a * 0.35, 1.0); }',
  });
  const dust = new THREE.Points(dg, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // ------------------------------------------------------------ camera
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 0.5, maxDistance: 7, minPolarAngle: 0.05, maxPolarAngle: Math.PI - 0.05, enablePan: false, rotateSpeed: coarse ? 0.7 : 0.9 });
  const VIEW_POS = new THREE.Vector3(-0.55, 1.6, -2.25);
  const spiderTarget = () => new THREE.Vector3(spider.root.position.x, CEIL - 0.15, spider.root.position.z);
  const setDefaultView = () => {
    controls.target.copy(spiderTarget());
    camera.position.copy(VIEW_POS);
    controls.update();
  };
  const clampCam = () => {
    camera.position.x = THREE.MathUtils.clamp(camera.position.x, -HALF_W + 0.15, HALF_W - 0.15);
    camera.position.y = THREE.MathUtils.clamp(camera.position.y, 0.2, CEIL - 0.12);
    camera.position.z = THREE.MathUtils.clamp(camera.position.z, Z0 + 0.2, DOOR_Z - 0.25);
  };

  // ------------------------------------------------------------ post
  const pr = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.25, 0.3, 0.85);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const grain = new ShaderPass({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uGrain: { value: 0.055 }, uVig: { value: 0.75 } },
    vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: /* glsl */`
      uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uVig; varying vec2 vUv;
      float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
      void main(){
        vec4 c = texture2D(tDiffuse, vUv);
        float g = h(vUv * 1024.0 + fract(uTime * 7.13) * 91.7) - 0.5;
        c.rgb += g * uGrain * (0.6 + 0.4 * (1.0 - dot(c.rgb, vec3(0.33))));
        float v = smoothstep(1.05, 0.25, length((vUv - 0.5) * vec2(1.15, 1.0)) * 1.25);
        c.rgb *= mix(1.0, v, uVig);
        gl_FragColor = c;
      }`,
  });
  composer.addPass(grain);

  // ------------------------------------------------------------ UI
  const state = { mode: 'flash', walk: null, userAimT: -99 };
  const aim = new THREE.Vector3(), aimSmooth = new THREE.Vector3();
  function setLight(m) {
    state.mode = m;
    const studio = m === 'studio';
    spot.visible = !studio; bounce.visible = !studio;
    key.visible = rim.visible = fill.visible = studio;
    hemi.intensity = studio ? 0.4 : 0.04;
    scene.environmentIntensity = studio ? 0.7 : 0.03;
    scene.background.copy(studio ? BG_STUDIO : BG_DARK);
    scene.fog.color.copy(studio ? BG_STUDIO : BG_DARK);
    scene.fog.density = studio ? 0.035 : 0.09;
    dustMat.uniforms.uOn.value = studio ? 0 : 1;
    dustMat.uniforms.uAmb.value = studio ? 0.2 : 0;
    silk.uniforms.uOn.value = studio ? 0 : 1;
    silk.uniforms.uKeyOn.value = studio ? 1 : 0;
    grain.uniforms.uVig.value = studio ? 0.4 : 0.75;
    renderer.toneMappingExposure = studio ? 1.0 : 1.3;
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }

  const tipEl = $('#tip');
  const shown = {};
  let tipTimer = 0;
  function tip(text, k) {
    if (k) { shown[k] = (shown[k] || 0) + 1; if (shown[k] > 2) return; }
    tipEl.textContent = text; tipEl.classList.add('show');
    clearTimeout(tipTimer); tipTimer = setTimeout(() => tipEl.classList.remove('show'), 3500);
  }

  const fade = $('#fade');
  let resetAt = 0;
  function wireSpider() {
    spider.onFirstLit = () => tip('거미는 위에서 기다린다. 천장을 비춰라', 'lit');
    spider.onRetract = () => tip('거미는 빛 아래로 내려오지 못한다', 'retract');
    spider.onCatch = () => {
      fade.classList.add('on'); fade.querySelector('span').textContent = '거미에게 붙잡혔다';
      resetAt = performance.now() + 1700;
      if (state.walk) state.walk.done = true;
    };
  }
  const fullReset = () => {
    makeSpider(spiderType.v);
    eggs.reset();
    state.walk = null;
    controls.enabled = true;
    setDefaultView();
    aim.copy(spiderTarget()); aimSmooth.copy(aim);
    fade.classList.remove('on');
  };

  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setLight(b.dataset.mode)));
  document.querySelectorAll('[data-spider]').forEach((b) => b.addEventListener('click', () => {
    spiderType.v = b.dataset.spider;
    document.querySelectorAll('[data-spider]').forEach((x) => x.classList.toggle('on', x === b));
    makeSpider(spiderType.v);
    if (!state.walk) { setDefaultView(); aim.copy(spiderTarget()); }
  }));
  const walkBtn = $('#walk');
  const startWalk = () => {
    if (state.walk) return;
    if (spider.state !== 'ceiling') makeSpider(spiderType.v);
    state.walk = { z: -6.2, x: -0.2, done: false };
    controls.enabled = false;
    camera.position.set(state.walk.x, 1.6, state.walk.z);
    aim.set(-0.1, 0.9, state.walk.z + 3.5); aimSmooth.copy(aim);
    state.userAimT = -99;
    if (state.mode === 'flash') tip('천장을 눌러 손전등으로 비춰 보세요', 'walkhint');
  };
  walkBtn.addEventListener('click', startWalk);
  $('#eggs').addEventListener('click', () => { if (eggs.burst()) tip('알집 근처에서는 소리를 내지 마라', 'eggs'); });
  $('#reset').addEventListener('click', fullReset);

  // flashlight aim: hover (mouse) or tap (touch) anywhere on the walls, floor or ceiling
  const ray = new THREE.Raycaster(), ndc = new THREE.Vector2();
  const aimAt = (cx, cy) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hit = ray.intersectObjects([spider.root, floor, ceil, wl, wr, back, doorWeb], true).find((h) => h.object.type !== 'LineSegments' || h.distance < 12);
    if (hit) aim.copy(hit.point); else aim.copy(ray.ray.at(6, new THREE.Vector3()));
    state.userAimT = performance.now();
  };
  let down = null;
  const el = renderer.domElement;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener('pointerup', (e) => {
    if (down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 8 && performance.now() - down.t < 400) aimAt(e.clientX, e.clientY);
    down = null;
  });
  el.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse' && e.buttons === 0) aimAt(e.clientX, e.clientY); });

  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h); composer.setSize(w, h); bloom.setSize(w / 2, h / 2);
    camera.aspect = w / h; camera.fov = w < h ? 68 : 55; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  makeSpider('wolf');
  setLight('flash');
  setDefaultView();
  aim.copy(spiderTarget()); aimSmooth.copy(aim);

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let t = 0, flick = 1, flickT = 0;
  const camOff = new THREE.Vector3(), spotDir = new THREE.Vector3();
  function frame(dtOverride) {
    const dt = dtOverride != null ? dtOverride : Math.min(clock.getDelta(), 1 / 20);
    t += dt;
    if (resetAt && performance.now() > resetAt && !TEST) { resetAt = 0; fullReset(); setTimeout(() => tip('붙잡혔을 때 스프레이를 쓰면 바로 빠져나온다'), 400); }

    // walk under the spider (the camera moves itself; the player only aims)
    const W = state.walk;
    if (W) {
      const hanging = spider.threadVisible;
      if (!W.done && !hanging) {
        W.z += dt * 1.25;
        if (W.z > DOOR_Z - 1.0) { W.done = true; }
      }
      camera.position.set(W.x + 0.02 * Math.sin(t * 4), 1.6 + 0.025 * Math.abs(Math.sin(t * 4)), W.z);
      const look = hanging ? spider.bodyWorld : new THREE.Vector3(W.x * 0.5, 1.75, W.z + 3);
      controls.target.lerp(look, 1 - Math.exp(-dt * (hanging ? 8 : 4)));
      camera.lookAt(controls.target);
      if (performance.now() - state.userAimT > 1500) aim.set(W.x * 0.5, 0.0, W.z + 2.6);   // untouched: the beam stays on the floor ahead
      if (W.done && !hanging && spider.state !== 'caught') { state.walk = null; controls.enabled = true; }
    } else {
      controls.update();
      clampCam();
    }

    aimSmooth.lerp(aim, 1 - Math.exp(-dt * 7));
    camOff.set(0.22, -0.2, 0.05).applyQuaternion(camera.quaternion);
    spot.position.copy(camera.position).add(camOff);
    spot.target.position.copy(aimSmooth);
    flickT -= dt;
    if (flickT < 0) { flickT = 4 + Math.random() * 7; flick = 0; }
    flick = Math.min(1, flick + dt * (flick < 0.5 ? 6 : 2));
    const fl = flick < 1 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 60)) : 1;
    spot.intensity = 95 * fl;
    spotDir.subVectors(spot.target.position, spot.position).normalize();
    const hitN = aimSmooth.clone().sub(spot.position).normalize().multiplyScalar(-0.5);
    bounce.position.copy(aimSmooth).add(hitN);
    bounce.intensity = 1.6 * fl;

    const light = { on: state.mode === 'flash', pos: spot.position.clone(), dir: spotDir.clone() };
    spider.update(dt, { light, cam: camera.position.clone(), bounds: BOUNDS });
    thread.set(spider.anchor, spider.spinneretWorld(), spider.threadVisible);
    eggs.update(dt, light, { x0: -1.4, x1: 1.4, z0: Z0 + 0.3, z1: DOOR_Z - 0.3 });
    if (light.on) {
      const wc = new THREE.Vector3(0.08, 1.3, DOOR_Z).sub(spot.position);
      if (wc.length() < 9 && wc.normalize().dot(spotDir) > Math.cos(0.25)) tip('스프레이로 거미줄을 녹일 수 있다', 'web');
    }

    const c = controls.target;
    key.position.set(c.x + 1.5, c.y + 6, c.z - 2); key.target.position.copy(c);
    rim.position.set(c.x - 2, c.y - 1, c.z + 4); rim.target.position.copy(c);
    fill.position.set(camera.position.x, camera.position.y + 0.2, camera.position.z);
    silk.uniforms.uSpotPos.value.copy(spot.position);
    silk.uniforms.uSpotDir.value.copy(spotDir);
    silk.uniforms.uKey.value.copy(key.position).sub(c).normalize();
    dustMat.uniforms.uTime.value = t;
    dustMat.uniforms.uCenter.value.copy(camera.position);
    dustMat.uniforms.uSpotPos.value.copy(spot.position);
    dustMat.uniforms.uSpotDir.value.copy(spotDir);
    grain.uniforms.uTime.value = t;
    composer.render(dt);
  }

  window.__M = {
    get spider() { return spider; }, eggs, camera, controls, aim, state, setLight, setDefaultView, fullReset, startWalk,
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); },
    aimAt(x, y, z) { aim.set(x, y, z); aimSmooth.set(x, y, z); state.userAimT = performance.now(); },
    type(v) { document.querySelector(`[data-spider="${v}"]`).click(); },
  };

  $('#loading').classList.add('done');
  setTimeout(() => $('#hint').classList.add('show'), 600);
  setTimeout(() => $('#hint').classList.remove('show'), 6500);
  if (TEST) { window.__READY = true; return; }
  renderer.setAnimationLoop(() => frame());
}

init().catch((e) => { console.error(e); setLoad('불러오지 못했어요: ' + e.message); });
