import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as TX from './textures.js';
import { Centipede } from './centipede.js';

// Scene units are metres here: the centipede is ~4.2 m long.
const $ = (s) => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const TEST = new URLSearchParams(location.search).has('test');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const setLoad = (txt) => { const el = $('#loading .msg'); if (el) el.textContent = txt; };

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
  const BG_DARK = new THREE.Color(0x030303), BG_STUDIO = new THREE.Color(0x111214);
  scene.background = BG_DARK.clone();
  scene.fog = new THREE.FogExp2(0x030303, 0.055);
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.05, 200);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.04;

  // ------------------------------------------------------------ textures
  setLoad('마디 질감 생성 중');
  await nextFrame();
  const T = {
    terg: TX.makeTergiteTextures(coarse ? 384 : 512),
    band: TX.makeBandTextures(),
    bandU: TX.makeBandTexturesU(),
    chitin: TX.makeChitinNormal(256),
    eye: TX.makeEyeNormal(),
    contact: TX.makeContactShadow(),
  };
  T.eye.repeat.set(3, 3);
  setLoad('공장 바닥 만드는 중');
  await nextFrame();
  const F = TX.makeFloorTextures(coarse ? 768 : 1024);
  const D = TX.makeDrumTextures();
  const cookie = TX.makeCookie(512);

  // ------------------------------------------------------------ floor + props (for scale)
  for (const t of [F.map, F.roughnessMap, F.normalMap]) { t.repeat.set(40, 40); t.anisotropy = renderer.capabilities.getMaxAnisotropy(); }
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120),
    new THREE.MeshStandardMaterial({ map: F.map, roughnessMap: F.roughnessMap, normalMap: F.normalMap, roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 0.75 + 0.5 * TX.vnoise(v.x * 2 + 5, v.y * 2 + v.z * 3, 9);
      p.setXYZ(i, v.x * n, v.y * n * 0.6, v.z * n);
    }
    g.computeVertexNormals();
    const count = 420;
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.92 }), count);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3(), c = new THREE.Color();
    let seed = 11;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2, r = Math.pow(rnd(), 0.6) * 20;
      const sz = 0.01 + Math.pow(rnd(), 3) * 0.07;
      pos.set(Math.cos(a) * r, sz * 0.25, Math.sin(a) * r);
      q.setFromEuler(new THREE.Euler(rnd() * 0.4, rnd() * 6, rnd() * 0.4));
      s.set(sz, sz, sz * (0.7 + rnd() * 0.6));
      m.setMatrixAt(i, M.compose(pos, q, s));
      m.setColorAt(i, c.setHSL(0.07, 0.08 + rnd() * 0.1, 0.18 + rnd() * 0.18));
    }
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }
  const obstacles = [];
  {
    // a rusty oil drum (0.88 m tall) and a wooden pallet give the creature a size reference
    const drumMat = new THREE.MeshStandardMaterial({ map: D.map, roughnessMap: D.roughnessMap, normalMap: D.normalMap, metalness: 0.55, roughness: 1 });
    const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.29, 0.88, 40, 1), [drumMat, new THREE.MeshStandardMaterial({ color: 0x3a3430, metalness: 0.6, roughness: 0.6 }), drumMat]);
    drum.position.set(-3.6, 0.44, -0.2);
    drum.castShadow = drum.receiveShadow = true;
    scene.add(drum);
    obstacles.push({ x: -3.6, z: -0.2, r: 0.4 });
    const wood = new THREE.MeshStandardMaterial({ color: 0x6a5238, roughness: 0.9 });
    const pallet = new THREE.Group();
    for (let i = 0; i < 7; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.022, 0.1), wood); b.position.set(0, 0.13, -0.5 + i * 0.167); pallet.add(b); }
    for (let i = 0; i < 3; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.0), wood); b.position.set(-0.55 + i * 0.55, 0.06, 0); pallet.add(b); }
    pallet.traverse((o) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
    pallet.position.set(1.6, 0, -5.0); pallet.rotation.y = 0.5;
    scene.add(pallet);
    obstacles.push({ x: 1.6, z: -5.0, r: 0.8 });
  }

  // ------------------------------------------------------------ creature
  setLoad('지네 다리 80개 붙이는 중');
  await nextFrame();
  const cent = new Centipede(T);
  cent.obstacles = obstacles;
  cent.addTo(scene);
  const START = { x: -0.6, z: -1.8, yaw: 0.45 };
  cent.reset(START.x, START.z, START.yaw);

  // ------------------------------------------------------------ lights
  const hemi = new THREE.HemisphereLight(0x7f90b8, 0x0a0806, 0.05);
  scene.add(hemi);
  const spot = new THREE.SpotLight(0xffeedd, 260, 0, 0.36, 0.55, 2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  spot.shadow.bias = -0.0002; spot.shadow.normalBias = 0.02;
  spot.shadow.camera.near = 0.3; spot.shadow.camera.far = 40;
  spot.map = cookie;
  scene.add(spot, spot.target);
  const bounce = new THREE.PointLight(0xffd8b0, 5, 9, 1.6);
  scene.add(bounce);
  const key = new THREE.DirectionalLight(0xfff1e2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -7, right: 7, top: 7, bottom: -7, near: 0.5, far: 40 });
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0x9db5ff, 2.0);
  const fill = new THREE.DirectionalLight(0xffd6b0, 0.5);
  scene.add(key, key.target, rim, rim.target, fill, fill.target);

  // ------------------------------------------------------------ dust
  const DUST = coarse ? 600 : 1100;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(DUST * 3), ds = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { dp[i * 3] = Math.random() * 16; dp[i * 3 + 1] = Math.random() * 5; dp[i * 3 + 2] = Math.random() * 16; ds[i] = Math.random(); }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dg.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSpotPos: { value: new THREE.Vector3() },
      uSpotDir: { value: new THREE.Vector3(0, -1, 0) }, uCosO: { value: Math.cos(0.36) }, uCosI: { value: Math.cos(0.2) },
      uOn: { value: 1 }, uAmb: { value: 0 }, uPR: { value: renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; uniform vec3 uCenter; uniform vec3 uSpotPos; uniform vec3 uSpotDir;
      uniform float uCosO; uniform float uCosI; uniform float uOn; uniform float uAmb; uniform float uPR;
      varying float vI;
      void main(){
        vec3 box = vec3(16.0, 5.0, 16.0);
        vec3 p = position + vec3(sin(uTime*0.11 + aSeed*40.0)*0.4 + uTime*0.03, sin(uTime*0.07 + aSeed*23.0)*0.3 - uTime*0.01, cos(uTime*0.09 + aSeed*31.0)*0.4);
        vec3 origin = uCenter - vec3(8.0, 0.0, 8.0);
        p = mod(p - origin, box) + origin;
        vec3 L = p - uSpotPos; float d = length(L);
        float cone = smoothstep(uCosO, uCosI, dot(L / d, uSpotDir));
        vI = (cone * uOn * 2.4 / (1.0 + d * d * 0.03) + uAmb) * (0.35 + 0.65 * fract(aSeed * 7.13));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (9.0 + aSeed * 14.0) * uPR / max(0.5, -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying float vI;
      void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)); gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * vI * a * 0.35, 1.0); }`,
  });
  const dust = new THREE.Points(dg, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // ------------------------------------------------------------ camera
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: 0.08, minDistance: 1.4, maxDistance: 20, maxPolarAngle: Math.PI * 0.495, enablePan: false, rotateSpeed: coarse ? 0.7 : 0.9 });
  const view0 = () => (innerWidth < innerHeight ? { az: 0.75, el: 0.5, dist: 11.5 } : { az: 0.9, el: 0.3, dist: 7.6 });
  const focus = () => cent.center.clone().setY(0.35);
  const setView = (az, el, dist) => {
    const tgt = focus();
    controls.target.copy(tgt);
    camera.position.set(tgt.x + Math.sin(az) * Math.cos(el) * dist, tgt.y + Math.sin(el) * dist, tgt.z + Math.cos(az) * Math.cos(el) * dist);
    controls.update();
  };
  { const v = view0(); setView(v.az, v.el, v.dist); }

  // ------------------------------------------------------------ post
  const pr = renderer.getPixelRatio();
  const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 }));
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.2, 0.45, 0.82);
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

  // ------------------------------------------------------------ modes + UI
  const state = { mode: 'flash' };
  const aim = focus().setY(0.3), aimSmooth = aim.clone();
  function setLight(m) {
    state.mode = m;
    const studio = m === 'studio';
    spot.visible = !studio; bounce.visible = !studio;
    key.visible = rim.visible = fill.visible = studio;
    hemi.intensity = studio ? 0.35 : 0.05;
    scene.environmentIntensity = studio ? 0.75 : 0.04;
    scene.background.copy(studio ? BG_STUDIO : BG_DARK);
    scene.fog.color.copy(studio ? BG_STUDIO : BG_DARK);
    scene.fog.density = studio ? 0.03 : 0.055;
    dustMat.uniforms.uOn.value = studio ? 0 : 1;
    dustMat.uniforms.uAmb.value = studio ? 0.25 : 0;
    grain.uniforms.uVig.value = studio ? 0.4 : 0.75;
    renderer.toneMappingExposure = studio ? 1.0 : 1.25;
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }
  setLight('flash');

  const tipEl = $('#tip');
  const shown = {};
  let tipTimer = 0;
  function tip(text, key) {
    if (key) { shown[key] = (shown[key] || 0) + 1; if (shown[key] > 2) return; }
    tipEl.textContent = text;
    tipEl.classList.add('show');
    clearTimeout(tipTimer);
    tipTimer = setTimeout(() => tipEl.classList.remove('show'), 3500);
  }
  cent.onStun = (hits, hold) => {
    if (hold < 2) tip('지네는 빛에 익숙해진다', 'habit');
    else tip('지네는 손전등에 약하다', 'weak');
  };

  const wanderBtn = $('#wander'), chaseBtn = $('#chase');
  const syncButtons = () => {
    const m = cent.b.stun ? cent.b.prev : cent.mode;
    wanderBtn.classList.toggle('on', m === 'wander');
    chaseBtn.classList.toggle('on', m === 'chase');
    wanderBtn.textContent = m === 'wander' ? '멈추기' : '돌아다니기';
    chaseBtn.textContent = m === 'chase' ? '그만 쫓기' : '쫓아오기';
  };
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setLight(b.dataset.mode)));
  wanderBtn.addEventListener('click', () => {
    const m = cent.b.stun ? cent.b.prev : cent.mode;
    cent.setMode(m === 'wander' ? 'idle' : 'wander'); syncButtons();
  });
  chaseBtn.addEventListener('click', () => {
    const m = cent.b.stun ? cent.b.prev : cent.mode;
    if (m === 'chase') { cent.setMode('idle'); syncButtons(); return; }
    cent.setMode('chase'); syncButtons();
    if (state.mode === 'flash') tip('화면을 눌러 손전등으로 지네를 비춰라', 'chasehint');
  });
  $('#reset').addEventListener('click', () => { const v = view0(); setView(v.az, v.el, v.dist); aim.copy(focus()).setY(0.3); });

  // caught: lunge, black out, reset
  const fade = $('#fade');
  let resetAt = 0;
  cent.onCatch = () => {
    fade.classList.add('on');
    fade.querySelector('span').textContent = '지네에게 잡혔다';
    resetAt = performance.now() + 1700;
  };
  const doReset = () => {
    cent.mode = 'idle';
    cent.reset(START.x, START.z, START.yaw);
    const v = view0(); setView(v.az, v.el, v.dist);
    aim.copy(focus()).setY(0.3);
    syncButtons();
    fade.classList.remove('on');
    setTimeout(() => tip('지네는 손전등에 약하다', null), 500);
  };

  // aim the flashlight
  const ray = new THREE.Raycaster(), plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3), ndc = new THREE.Vector2();
  const aimAt = (cx, cy) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, p)) {
      if (p.distanceTo(camera.position) > 20) p.sub(camera.position).setLength(20).add(camera.position);
      aim.copy(p);
    }
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
    camera.aspect = w / h; camera.fov = w < h ? 58 : 45; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let t = 0, flick = 1, flickT = 0;
  const camOff = new THREE.Vector3(), prevTarget = new THREE.Vector3(), spotDir = new THREE.Vector3(), camGround = new THREE.Vector3();
  function frame(dtOverride) {
    const dt = dtOverride != null ? dtOverride : Math.min(clock.getDelta(), 1 / 20);
    t += dt;
    if (resetAt && performance.now() > resetAt && !TEST) { resetAt = 0; doReset(); }
    aimSmooth.lerp(aim, 1 - Math.exp(-dt * 6));
    camOff.set(0.3, -0.25, 0.05).applyQuaternion(camera.quaternion);
    spot.position.copy(camera.position).add(camOff);
    spot.position.y += Math.sin(t * 5.3) * 0.005;
    spot.target.position.copy(aimSmooth);
    flickT -= dt;
    if (flickT < 0) { flickT = 4 + Math.random() * 7; flick = 0; }
    flick = Math.min(1, flick + dt * (flick < 0.5 ? 6 : 2));
    const fl = flick < 1 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 60)) : 1;
    spot.intensity = 260 * fl * (0.985 + 0.015 * Math.sin(t * 13.0) * Math.sin(t * 7.7));
    spotDir.subVectors(spot.target.position, spot.position).normalize();
    bounce.position.copy(aimSmooth).add(new THREE.Vector3(0, 2.0, 0)).addScaledVector(spotDir, -0.8);
    bounce.intensity = 5 * fl;

    camGround.set(camera.position.x, 0, camera.position.z);
    cent.update(dt, { on: state.mode === 'flash', pos: spot.position, dir: spotDir }, camGround);
    if (cent.b.stun === false && (wanderBtn.classList.contains('on') !== (cent.mode === 'wander'))) syncButtons();

    // camera: follow while it wanders; hold still and watch it when it comes for you
    const chasing = cent.mode === 'chase' || cent.mode === 'lunge' || (cent.b.stun && cent.b.prev === 'chase');
    if (chasing) {
      controls.target.lerp(cent.headPos.clone().setY(0.4), 1 - Math.exp(-dt * 3));
      if (cent.mode === 'lunge') aim.copy(cent.headPos);
    } else {
      prevTarget.copy(controls.target);
      controls.target.lerp(focus(), 1 - Math.exp(-dt * 2));
      camera.position.add(controls.target.clone().sub(prevTarget));
    }
    controls.update();

    const c = controls.target;
    key.position.set(c.x + 6, 11, c.z + 5); key.target.position.copy(c);
    rim.position.set(c.x - 7, 4.5, c.z - 7); rim.target.position.copy(c);
    fill.position.set(c.x + 1.5, 3, c.z + 8); fill.target.position.copy(c);

    dustMat.uniforms.uTime.value = t;
    dustMat.uniforms.uCenter.value.copy(c);
    dustMat.uniforms.uSpotPos.value.copy(spot.position);
    dustMat.uniforms.uSpotDir.value.copy(spotDir);
    grain.uniforms.uTime.value = t;
    composer.render(dt);
  }

  window.__M = {
    setView, setLight, cent, camera, controls, aim, state, doReset,
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); },
    aimAt(x, y, z) { aim.set(x, y, z); aimSmooth.set(x, y, z); },
    wander() { wanderBtn.click(); }, chase() { chaseBtn.click(); },
  };

  $('#loading').classList.add('done');
  setTimeout(() => $('#hint').classList.add('show'), 600);
  setTimeout(() => $('#hint').classList.remove('show'), 6500);
  if (TEST) { window.__READY = true; return; }
  renderer.setAnimationLoop(() => frame());
}

init().catch((e) => { console.error(e); setLoad('불러오지 못했어요: ' + e.message); });
