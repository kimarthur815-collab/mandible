import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as TX from './textures.js';
import { Roach, PRONOTUM } from './roach.js';

const $ = (s) => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const params = new URLSearchParams(location.search);
const TEST = params.has('test');

const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const setLoad = (txt) => { const el = $('#loading .msg'); if (el) el.textContent = txt; };

async function init() {
  // ------------------------------------------------------------ renderer
  const renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
  const maxPR = coarse ? 1.6 : 2;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPR));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('#app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const BG_DARK = new THREE.Color(0x030303), BG_STUDIO = new THREE.Color(0x111214);
  scene.background = BG_DARK.clone();
  scene.fog = new THREE.FogExp2(0x030303, 0.07);

  const camera = new THREE.PerspectiveCamera(36, innerWidth / innerHeight, 0.03, 150);

  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.04;

  // ------------------------------------------------------------ textures
  setLoad('키틴 질감 생성 중');
  await nextFrame();
  const T = {};
  T.pronotum = TX.makePronotumTextures(PRONOTUM.R, PRONOTUM.bbox, coarse ? 768 : 1024);
  setLoad('날개맥 그리는 중');
  await nextFrame();
  T.wing = TX.makeWingTextures(512, 1024, 3);
  T.hind = TX.makeHindWingTexture(512);
  T.chitin = TX.makeChitinNormal(256);
  T.eye = TX.makeEyeNormal();
  T.eye.repeat.set(2.2, 2.2);
  T.rings = TX.makeRingTextures();
  T.contact = TX.makeContactShadow();
  setLoad('바닥 만드는 중');
  await nextFrame();
  const F = TX.makeFloorTextures(coarse ? 768 : 1024);
  const cookie = TX.makeCookie(512);
  [T.pronotum.map, T.wing.map, F.map].forEach((t) => (t.anisotropy = renderer.capabilities.getMaxAnisotropy()));

  // ------------------------------------------------------------ floor
  for (const t of [F.map, F.roughnessMap, F.normalMap]) t.repeat.set(9, 9);
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(90, 90),
    new THREE.MeshStandardMaterial({ map: F.map, roughnessMap: F.roughnessMap, normalMap: F.normalMap, normalScale: new THREE.Vector2(1.1, 1.1), roughness: 1, metalness: 0 }),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  // gravel and debris
  {
    const g = new THREE.IcosahedronGeometry(1, 1);
    const p = g.attributes.position;
    for (let i = 0; i < p.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i);
      const n = 0.75 + 0.5 * TX.vnoise(v.x * 2 + 5, v.y * 2 + v.z * 3, 9);
      p.setXYZ(i, v.x * n, v.y * n * 0.6, v.z * n);
    }
    g.computeVertexNormals();
    const count = 260;
    const m = new THREE.InstancedMesh(g, new THREE.MeshStandardMaterial({ color: 0x55504a, roughness: 0.92 }), count);
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), pos = new THREE.Vector3();
    let seed = 7;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const c = new THREE.Color();
    for (let i = 0; i < count; i++) {
      const a = rnd() * Math.PI * 2, r = 1.5 + Math.pow(rnd(), 0.7) * 16;
      const sz = 0.015 + Math.pow(rnd(), 3) * 0.09;
      pos.set(Math.cos(a) * r, sz * 0.25, Math.sin(a) * r);
      q.setFromEuler(new THREE.Euler(rnd() * 0.4, rnd() * 6, rnd() * 0.4));
      s.set(sz, sz, sz * (0.7 + rnd() * 0.6));
      M.compose(pos, q, s);
      m.setMatrixAt(i, M);
      m.setColorAt(i, c.setHSL(0.07, 0.08 + rnd() * 0.1, 0.18 + rnd() * 0.18));
    }
    m.castShadow = true; m.receiveShadow = true;
    scene.add(m);
  }

  // ------------------------------------------------------------ roach
  setLoad('바퀴 조립 중');
  await nextFrame();
  const roach = new Roach(T);
  roach.addTo(scene);
  roach.root.rotation.y = 0.5;

  // ------------------------------------------------------------ lights
  const hemi = new THREE.HemisphereLight(0x7f90b8, 0x0a0806, 0.05);
  scene.add(hemi);

  const spot = new THREE.SpotLight(0xffeedd, 110, 0, 0.34, 0.55, 2);
  spot.castShadow = true;
  spot.shadow.mapSize.set(coarse ? 1024 : 2048, coarse ? 1024 : 2048);
  spot.shadow.bias = -0.00015;
  spot.shadow.normalBias = 0.015;
  spot.shadow.camera.near = 0.3;
  spot.shadow.camera.far = 40;
  spot.map = cookie;
  scene.add(spot, spot.target);
  // soft bounce from the lit patch so the floor around the beam reads
  const bounce = new THREE.PointLight(0xffd8b0, 3.0, 7, 1.6);
  scene.add(bounce);

  const key = new THREE.DirectionalLight(0xfff1e2, 2.6);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -4; key.shadow.camera.right = 4; key.shadow.camera.top = 4; key.shadow.camera.bottom = -4;
  key.shadow.camera.near = 0.5; key.shadow.camera.far = 30;
  key.shadow.bias = -0.0002; key.shadow.normalBias = 0.02;
  const rim = new THREE.DirectionalLight(0x9db5ff, 2.0);
  const fill = new THREE.DirectionalLight(0xffd6b0, 0.5);
  scene.add(key, key.target, rim, rim.target, fill, fill.target);

  // ------------------------------------------------------------ dust
  const DUST = coarse ? 500 : 900;
  const dg = new THREE.BufferGeometry();
  const dp = new Float32Array(DUST * 3), ds = new Float32Array(DUST);
  for (let i = 0; i < DUST; i++) { dp[i * 3] = Math.random() * 12; dp[i * 3 + 1] = Math.random() * 4; dp[i * 3 + 2] = Math.random() * 12; ds[i] = Math.random(); }
  dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
  dg.setAttribute('aSeed', new THREE.BufferAttribute(ds, 1));
  const dustMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uTime: { value: 0 }, uCenter: { value: new THREE.Vector3() }, uSpotPos: { value: new THREE.Vector3() },
      uSpotDir: { value: new THREE.Vector3(0, -1, 0) }, uCosO: { value: Math.cos(0.34) }, uCosI: { value: Math.cos(0.18) },
      uOn: { value: 1 }, uAmb: { value: 0 }, uPR: { value: renderer.getPixelRatio() },
    },
    vertexShader: /* glsl */`
      attribute float aSeed; uniform float uTime; uniform vec3 uCenter; uniform vec3 uSpotPos; uniform vec3 uSpotDir;
      uniform float uCosO; uniform float uCosI; uniform float uOn; uniform float uAmb; uniform float uPR;
      varying float vI;
      void main(){
        vec3 box = vec3(12.0, 4.0, 12.0);
        vec3 p = position + vec3(sin(uTime*0.11 + aSeed*40.0)*0.4 + uTime*0.03, sin(uTime*0.07 + aSeed*23.0)*0.3 - uTime*0.01, cos(uTime*0.09 + aSeed*31.0)*0.4);
        vec3 origin = uCenter - vec3(6.0, 0.0, 6.0);
        p = mod(p - origin, box) + origin;
        vec3 L = p - uSpotPos; float d = length(L);
        float cone = smoothstep(uCosO, uCosI, dot(L / d, uSpotDir));
        vI = (cone * uOn * 2.2 / (1.0 + d * d * 0.05) + uAmb) * (0.35 + 0.65 * fract(aSeed * 7.13));
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = (8.0 + aSeed * 14.0) * uPR / max(0.5, -mv.z);
      }`,
    fragmentShader: /* glsl */`
      varying float vI;
      void main(){
        vec2 c = gl_PointCoord - 0.5; float r = length(c);
        float a = smoothstep(0.5, 0.0, r);
        gl_FragColor = vec4(vec3(1.0, 0.93, 0.82) * vI * a * 0.35, 1.0);
      }`,
  });
  const dust = new THREE.Points(dg, dustMat);
  dust.frustumCulled = false;
  scene.add(dust);

  // ------------------------------------------------------------ camera + controls
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.minDistance = 1.0;
  controls.maxDistance = 16;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.enablePan = false;
  controls.rotateSpeed = coarse ? 0.7 : 0.9;
  const view0 = () => (innerWidth < innerHeight ? { az: 0.6, el: 0.5, dist: 8.6 } : { az: 0.85, el: 0.28, dist: 5.0 });
  const setView = (az, el, dist) => {
    const tgt = roach.position.clone().add(new THREE.Vector3(0, 0.32, 0));
    controls.target.copy(tgt);
    camera.position.set(tgt.x + Math.sin(az) * Math.cos(el) * dist, tgt.y + Math.sin(el) * dist, tgt.z + Math.cos(az) * Math.cos(el) * dist);
    controls.update();
  };
  { const v = view0(); setView(v.az, v.el, v.dist); }

  // ------------------------------------------------------------ post
  const pr = renderer.getPixelRatio();
  const rt = new THREE.WebGLRenderTarget(innerWidth * pr, innerHeight * pr, { type: THREE.HalfFloatType, samples: 4 });
  const composer = new EffectComposer(renderer, rt);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.22, 0.45, 0.82);
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

  // ------------------------------------------------------------ modes
  const state = { mode: 'flash', walk: false, wings: false, follow: true };
  const aim = new THREE.Vector3().copy(roach.position).setY(0.25);
  const aimSmooth = aim.clone();
  function setMode(m) {
    state.mode = m;
    const studio = m === 'studio';
    spot.visible = !studio;
    key.visible = rim.visible = fill.visible = studio;
    hemi.intensity = studio ? 0.35 : 0.05;
    scene.environmentIntensity = studio ? 0.75 : 0.04;
    scene.background.copy(studio ? BG_STUDIO : BG_DARK);
    scene.fog.color.copy(studio ? BG_STUDIO : BG_DARK);
    scene.fog.density = studio ? 0.035 : 0.07;
    dustMat.uniforms.uOn.value = studio ? 0 : 1;
    dustMat.uniforms.uAmb.value = studio ? 0.25 : 0;
    grain.uniforms.uVig.value = studio ? 0.4 : 0.75;
    renderer.toneMappingExposure = studio ? 1.0 : 1.25;
    document.querySelectorAll('[data-mode]').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }
  setMode('flash');

  // ------------------------------------------------------------ tips (game-style)
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
  roach.onFlee = () => tip('바퀴는 빛을 싫어한다', 'flee');

  // ------------------------------------------------------------ UI
  document.querySelectorAll('[data-mode]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.mode)));
  const walkBtn = $('#walk'), wingBtn = $('#wings');
  walkBtn.addEventListener('click', () => {
    state.walk = !state.walk; roach.walking = state.walk;
    walkBtn.classList.toggle('on', state.walk);
    walkBtn.textContent = state.walk ? '멈추기' : '돌아다니기';
    if (state.walk && state.mode === 'flash') tip('화면을 눌러 손전등을 바퀴에 비춰 보세요', 'walkhint');
  });
  const flyNow = () => {
    const p = roach.position;
    const dx = camera.position.x - p.x, dz = camera.position.z - p.z, d = Math.hypot(dx, dz) || 1;
    const travel = THREE.MathUtils.clamp(d - 2.2, 1.2, 4.4);
    if (roach.fly(p.x + (dx / d) * travel, p.z + (dz / d) * travel)) tip('바퀴는 날 수도 있다', 'wings');
  };
  wingBtn.addEventListener('click', flyNow);
  $('#reset').addEventListener('click', () => {
    const v = view0(); setView(v.az, v.el, v.dist);
    aim.copy(roach.position).setY(0.25);
  });

  // aim the flashlight: hover (mouse) or tap (touch)
  const ray = new THREE.Raycaster();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.25);
  const ndc = new THREE.Vector2();
  const aimAt = (cx, cy) => {
    const r = renderer.domElement.getBoundingClientRect();
    ndc.set(((cx - r.left) / r.width) * 2 - 1, -((cy - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const p = new THREE.Vector3();
    if (ray.ray.intersectPlane(plane, p)) {
      const d = p.distanceTo(controls.target);
      if (d > 14) p.sub(controls.target).setLength(14).add(controls.target);
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

  // ------------------------------------------------------------ resize
  function resize() {
    const w = innerWidth, h = innerHeight;
    renderer.setSize(w, h);
    composer.setSize(w, h);
    bloom.setSize(w / 2, h / 2);
    camera.aspect = w / h;
    camera.fov = w < h ? 46 : 36;
    camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);
  resize();

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let t = 0, flick = 1, flickT = 0;
  const camOff = new THREE.Vector3(), prevTarget = controls.target.clone();
  const spotDir = new THREE.Vector3();
  function frame(dtOverride) {
    const dt = dtOverride != null ? dtOverride : Math.min(clock.getDelta(), 1 / 20);
    t += dt;

    // flashlight held slightly right and below the eye, lagging behind the aim
    aimSmooth.lerp(aim, 1 - Math.exp(-dt * 6));
    camOff.set(0.28, -0.22, 0.05).applyQuaternion(camera.quaternion);
    spot.position.copy(camera.position).add(camOff);
    spot.position.y += Math.sin(t * 5.3) * 0.004;
    spot.target.position.copy(aimSmooth);
    flickT -= dt;
    if (flickT < 0) { flickT = 4 + Math.random() * 7; flick = 0; }
    flick = Math.min(1, flick + dt * (flick < 0.5 ? 6 : 2));
    const fl = flick < 1 ? 0.55 + 0.45 * Math.abs(Math.sin(t * 60)) : 1;
    spot.intensity = 110 * fl * (0.985 + 0.015 * Math.sin(t * 13.0) * Math.sin(t * 7.7));
    spotDir.subVectors(spot.target.position, spot.position).normalize();
    bounce.position.copy(aimSmooth).add(new THREE.Vector3(0, 1.4, 0)).addScaledVector(spotDir, -0.6);
    bounce.intensity = spot.visible ? 3.0 * fl : 0;

    roach.update(dt, { on: state.mode === 'flash' && spot.visible, pos: spot.position, dir: spotDir });

    // follow the creature
    // while it flies at you the camera stays put and only turns to watch it
    const flying = roach.flight && !roach.flight.landed;
    if (flying) {
      aim.copy(roach.position).setY(Math.max(0.25, roach.position.y + 0.2));
      controls.target.lerp(roach.position.clone().add(new THREE.Vector3(0, 0.3, 0)), 1 - Math.exp(-dt * 7));
    } else if (state.follow) {
      const want = roach.position.clone().add(new THREE.Vector3(0, 0.32, 0));
      prevTarget.copy(controls.target);
      controls.target.lerp(want, 1 - Math.exp(-dt * 3));
      camera.position.add(controls.target.clone().sub(prevTarget));
    }
    controls.update();

    // studio lights follow too
    const c = controls.target;
    key.position.set(c.x + 4.5, 7.5, c.z + 3.5); key.target.position.copy(c);
    rim.position.set(c.x - 5, 3.2, c.z - 5); rim.target.position.copy(c);
    fill.position.set(c.x + 1, 2, c.z + 6); fill.target.position.copy(c);

    dustMat.uniforms.uTime.value = t;
    dustMat.uniforms.uCenter.value.copy(c);
    dustMat.uniforms.uSpotPos.value.copy(spot.position);
    dustMat.uniforms.uSpotDir.value.copy(spotDir);
    grain.uniforms.uTime.value = t;
    composer.render(dt);
  }

  // test hooks
  window.__M = {
    setView, setMode, roach, camera, controls, aim, state,
    step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); },
    walk(v) { if (state.walk !== v) walkBtn.click(); },
    fly: flyNow,
    aimAt(x, y, z) { aim.set(x, y, z); aimSmooth.set(x, y, z); },
  };

  $('#loading').classList.add('done');
  setTimeout(() => $('#hint').classList.add('show'), 600);
  setTimeout(() => $('#hint').classList.remove('show'), 6500);
  if (TEST) { window.__READY = true; return; }
  renderer.setAnimationLoop(() => frame());
}

init().catch((e) => {
  console.error(e);
  setLoad('불러오지 못했어요: ' + e.message);
});
