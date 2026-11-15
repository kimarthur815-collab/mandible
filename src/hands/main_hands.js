// MANDIBLE — first-person hands, standalone viewer.
// Blue nitrile gloves, white flash-spun suit sleeves, black tactical flashlight; seven poses from the
// reference sheet plus the spray can; three beam strengths; a game view and a studio view.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Hand, frameQ, handData } from './handmodel.js';
import { gloveMaterial, sleeveMaterial, tyvekTextures } from './materials.js';
import { makeFlashlight, flashSDF, makeCan, canSDF } from './props.js';
import * as S from '../map/surface.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const $ = (s) => document.querySelector(s);
const clamp = THREE.MathUtils.clamp;
const ease = (t) => t * t * (3 - 2 * t);

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: !!window.__TEST });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.12;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(54, innerWidth / innerHeight, 0.02, 60);
scene.add(camera);

const composer = new EffectComposer(renderer, new THREE.WebGLRenderTarget(innerWidth, innerHeight, { type: THREE.HalfFloatType, samples: 4 }));
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth / 2, innerHeight / 2), 0.45, 0.5, 2.6);
composer.addPass(bloom);
const grain = new ShaderPass({
  uniforms: { tDiffuse: { value: null }, uT: { value: 0 }, uVig: { value: 0.55 }, uGrain: { value: 0.035 } },
  vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uT, uVig, uGrain; varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
    void main(){
      vec2 d = vUv - 0.5;
      float ca = 0.0012 * dot(d, d) * 4.0;
      vec3 c = vec3(texture2D(tDiffuse, vUv + d * ca).r, texture2D(tDiffuse, vUv).g, texture2D(tDiffuse, vUv - d * ca).b);
      c *= 1.0 - uVig * smoothstep(0.25, 0.85, length(d * vec2(1.25, 1.0)));
      c += (h(vUv * 931.0 + uT) - 0.5) * uGrain * (0.35 + 0.65 * (1.0 - min(1.0, dot(c, vec3(0.33)))));
      gl_FragColor = vec4(max(c, 0.0), 1.0);
    }`,
});
composer.addPass(grain);
composer.addPass(new OutputPass());

// on short (phone, landscape) screens, shift the picture up so the pose buttons don't cover the hands
function fit() {
  renderer.setSize(innerWidth, innerHeight); composer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  const pad = innerHeight < 560 ? Math.round(Math.min(64, innerHeight * 0.15)) : 0;
  if (pad) camera.setViewOffset(innerWidth, innerHeight + pad, 0, pad, innerWidth, innerHeight); else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
addEventListener('resize', fit);
fit();

// ------------------------------------------------------------------ the room (game view)
const room = new THREE.Group();
scene.add(room);
const solids = [];
function buildRoom() {
  const macro = S.macroNoise();
  const cf = S.concreteFloor(1), pw = S.paintedWall(3), wb = S.wallBand(5), rc = S.rawConcrete(7);
  const W = (o) => S.worldMaterial({ macro, ...o });
  const floorM = W({ color: cf.color, data: cf.data, tint: 0xb4aea4, wet: 0.65 });
  const wallM = W({ color: pw.color, data: pw.data, band: wb.color, bandData: wb.data, tint: 0xcfc8bc, bandTint: 0x6e6a62, split: 1.1 });
  const ceilM = W({ color: rc.color, data: rc.data, tint: 0x8a867e });
  const box = (w, h, d, x, y, z, m) => {
    const o = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
    o.position.set(x, y, z); o.receiveShadow = true; o.castShadow = true;
    room.add(o); solids.push(o); return o;
  };
  // the room: 4.4 wide, 3 high, from z = 2.2 to z = -3
  box(4.4, 0.1, 5.4, 0, -0.05, -0.4, floorM);
  box(4.4, 0.1, 5.4, 0, 3.05, -0.4, ceilM);
  box(0.1, 3, 5.4, -2.25, 1.5, -0.4, wallM);
  box(0.1, 3, 5.4, 2.25, 1.5, -0.4, wallM);
  box(4.4, 3, 0.1, 0, 1.5, 2.25, wallM);
  // front wall with a doorway (x -0.5..0.5, up to 2.1)
  box(1.75, 3, 0.14, -1.375, 1.5, -3.05, wallM);
  box(1.75, 3, 0.14, 1.375, 1.5, -3.05, wallM);
  box(1.0, 0.9, 0.14, 0, 2.55, -3.05, wallM);
  // door frame
  const frameM = new THREE.MeshStandardMaterial({ color: 0x5a5148, roughness: 0.75 });
  box(0.07, 2.12, 0.18, -0.535, 1.06, -3.05, frameM); box(0.07, 2.12, 0.18, 0.535, 1.06, -3.05, frameM); box(1.14, 0.07, 0.18, 0, 2.125, -3.05, frameM);
  // the door, open into the room on the left
  const door = box(0.98, 2.06, 0.045, 0, 0, 0, new THREE.MeshStandardMaterial({ color: 0x6d6a60, roughness: 0.8 }));
  door.geometry.translate(0.49, 1.03, 0);
  door.position.set(-0.5, 0, -2.98); door.rotation.y = 1.25;
  // corridor beyond, ending in a window
  box(1.8, 0.1, 7, 0, -0.05, -6.5, floorM);
  box(1.8, 0.1, 7, 0, 2.65, -6.5, ceilM);
  box(0.1, 2.7, 7, -0.85, 1.3, -6.5, wallM);
  box(0.1, 2.7, 7, 0.85, 1.3, -6.5, wallM);
  box(1.8, 1.0, 0.1, 0, 0.5, -10, wallM); box(1.8, 0.7, 0.1, 0, 2.3, -10, wallM);
  box(0.5, 1.0, 0.1, -0.65, 1.45, -10, wallM); box(0.5, 1.0, 0.1, 0.65, 1.45, -10, wallM);
  const win = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.95), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.55, 0.66, 0.82) }));
  win.position.set(0, 1.45, -10.02); room.add(win);
  const bars = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 });
  box(0.03, 0.95, 0.03, 0, 1.45, -9.98, bars); box(0.8, 0.03, 0.03, 0, 1.45, -9.98, bars);
  const moon = new THREE.PointLight(0x9db4d8, 3.5, 8, 1.4); moon.position.set(0, 1.5, -9.4); room.add(moon);
  // a rack on the left wall with a few boxes
  const metal = new THREE.MeshStandardMaterial({ color: 0x3d3f42, roughness: 0.55, metalness: 0.5 });
  for (const z of [-0.6, -2.2]) for (const x of [-2.18, -1.62]) box(0.05, 2.2, 0.05, x, 1.1, z, metal);
  for (const y of [0.35, 1.05, 1.75]) box(0.6, 0.04, 1.65, -1.9, y, -1.4, metal);
  const card = new THREE.MeshStandardMaterial({ color: 0x8a6e4a, roughness: 0.9 });
  box(0.45, 0.3, 0.4, -1.9, 0.52, -1.0, card); box(0.4, 0.42, 0.5, -1.88, 1.28, -1.8, card); box(0.35, 0.25, 0.35, -1.95, 1.9, -0.95, card);
  // papers on the floor
  const paper = new THREE.MeshStandardMaterial({ color: 0xb8b2a2, roughness: 0.95, side: THREE.DoubleSide });
  for (let i = 0; i < 9; i++) {
    const p = new THREE.Mesh(new THREE.PlaneGeometry(0.21, 0.29), paper);
    p.rotation.set(-Math.PI / 2, 0, Math.random() * 6); p.position.set(-1.4 + Math.random() * 2.6, 0.003 + i * 0.0004, -2.6 + Math.random() * 3.2);
    p.receiveShadow = true; room.add(p);
  }
  scene.fog = new THREE.FogExp2(0x000000, 0.06);
}

// ------------------------------------------------------------------ studio
const studio = new THREE.Group();
scene.add(studio);
const pmrem = new THREE.PMREMGenerator(renderer);
const envTex = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
function studioBackground() {
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(256, 210, 30, 256, 256, 380);
  grd.addColorStop(0, '#3a3c41'); grd.addColorStop(1, '#141518');
  g.fillStyle = grd; g.fillRect(0, 0, 512, 512);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
const studioBg = studioBackground();
const sKey = new THREE.DirectionalLight(0xfff4ea, 1.25); sKey.position.set(0.6, 1.2, 0.9); sKey.castShadow = true;
sKey.shadow.mapSize.set(2048, 2048); Object.assign(sKey.shadow.camera, { left: -0.5, right: 0.5, top: 0.5, bottom: -0.5, near: 0.1, far: 4 }); sKey.shadow.bias = -0.0004; sKey.shadow.normalBias = 0.002;
const sFill = new THREE.DirectionalLight(0xc8d6ff, 0.45); sFill.position.set(-1, 0.3, 0.6);
const sRim = new THREE.DirectionalLight(0xffffff, 0.8); sRim.position.set(-0.4, 0.8, -1.2);
const sHemi = new THREE.HemisphereLight(0xd8dcff, 0x2a2622, 0.35);
studio.add(sKey, sKey.target, sFill, sRim, sHemi);

// ------------------------------------------------------------------ hands, props
const rig = new THREE.Group();         // camera-space rig (follows the camera with a little lag)
scene.add(rig);
const tyvek = tyvekTextures();
const mats = { glove: (u) => gloveMaterial(u), sleeve: sleeveMaterial(tyvek) };
let R = null, L = null, flash = null, can = null, vmMats = [];

// beam
const LEVELS = {
  off: { I: 0, angle: 0.30, cone: 0 },
  low: { I: 220, angle: 0.34, cone: 0.35 },
  mid: { I: 700, angle: 0.38, cone: 0.7 },
  high: { I: 1800, angle: 0.42, cone: 1.0 },
};
let level = 'mid', beamK = 1, flick = 0;
const spot = new THREE.SpotLight(0xfff1de, 0, 0, 0.33, 0.55, 2);
spot.castShadow = true; spot.shadow.mapSize.set(1024, 1024); spot.shadow.camera.near = 0.05; spot.shadow.bias = -0.0005; spot.shadow.normalBias = 0.01;
spot.map = beamPattern();
const spill = new THREE.PointLight(0xfff1de, 0, 0.55, 2);
const bounce = new THREE.PointLight(0xd8cfc0, 0, 6, 2);
scene.add(bounce);
// light coming back off the room onto the arms (only reaches the arms)
const armFill = new THREE.PointLight(0xe6e0d6, 0, 1.6, 1.2);
camera.add(armFill); armFill.position.set(-0.05, 0.3, -0.75);
const armTop = new THREE.PointLight(0xdcd6cc, 0, 1.0, 1.5);
camera.add(armTop); armTop.position.set(0.0, 0.25, 0.05);
const nightAmb = new THREE.HemisphereLight(0x8090b0, 0x1a1816, 0.0);
room.add(nightAmb);
let cone = null, dust = null;
function beamPattern() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), id = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2);
    // hot centre, a faint ring from the reflector's edge, soft spill
    let v = Math.exp(-r * r / 0.06) * 1.0 + Math.exp(-Math.pow((r - 0.5) / 0.12, 2)) * 0.05 + Math.exp(-r * r / 0.3) * 0.38;
    v *= 1 - Math.pow(Math.min(1, r), 6);
    const k = Math.min(255, v * 230);
    id.data[(y * N + x) * 4] = k; id.data[(y * N + x) * 4 + 1] = k * 0.97; id.data[(y * N + x) * 4 + 2] = k * 0.92; id.data[(y * N + x) * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function makeCone() {
  const L = 7, g = new THREE.CylinderGeometry(0.02, L * Math.tan(0.36), L, 48, 24, true);
  g.translate(0, -L / 2, 0); g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0.7 }, uLen: { value: L } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ; varying float vAl;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vZ = position.z;
        vec3 ax = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz); vAl = abs(dot(ax, vec3(0.0, 0.0, -1.0)));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uK, uLen; varying vec3 vN; varying vec3 vV; varying float vZ; varying float vAl;
      void main(){ float e = abs(dot(normalize(vN), normalize(vV))); float d = vZ / uLen;
        // seen end-on (shining away from you) a shaft of light is barely visible
        float a = pow(e, 2.2) * exp(-d * 2.6) * smoothstep(0.0, 0.12, d) * 0.055 * uK * (1.0 - smoothstep(0.75, 0.97, vAl) * 0.85);
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(g, m);
}
function makeDust() {
  const N = 700, p = new Float32Array(N * 3), s = new Float32Array(N);
  for (let i = 0; i < N; i++) { p[i * 3] = (Math.random() - 0.5) * 5; p[i * 3 + 1] = Math.random() * 2.8; p[i * 3 + 2] = -Math.random() * 6 + 1.8; s[i] = Math.random(); }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(p, 3)); g.setAttribute('aS', new THREE.BufferAttribute(s, 1));
  const m = new THREE.ShaderMaterial({
    uniforms: { uLens: { value: new V3() }, uDir: { value: new V3(0, 0, -1) }, uCos: { value: Math.cos(0.33) }, uK: { value: 1 }, uT: { value: 0 }, uPx: { value: 1 } },
    vertexShader: `attribute float aS; uniform vec3 uLens, uDir; uniform float uCos, uK, uT, uPx; varying float vA;
      void main(){
        vec3 p = position + vec3(sin(uT * 0.21 + aS * 40.0), sin(uT * 0.13 + aS * 23.0) * 0.6, cos(uT * 0.17 + aS * 31.0)) * 0.12;
        vec3 v = p - uLens; float d = length(v); float c = dot(v / d, uDir);
        vA = smoothstep(uCos, uCos + 0.04, c) * uK * exp(-d * 0.45) * (0.4 + 0.6 * aS);
        vec4 mv = viewMatrix * vec4(p, 1.0);
        gl_PointSize = (0.004 + aS * 0.006) * uPx / -mv.z;
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: `varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = smoothstep(0.5, 0.0, length(c)) * vA; gl_FragColor = vec4(vec3(1.0, 0.95, 0.88) * a * 0.9, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const o = new THREE.Points(g, m); o.frustumCulled = false; return o;
}

// ------------------------------------------------------------------ grips (hand-frame placements)
// right hand power grip on the flashlight: the barrel runs obliquely across the palm, head out
// past the thumb and index finger
const GRIP = {
  axis: new V3(-0.72, 0, -0.69).normalize(),       // tail -> lens, in the right hand's frame (a diagonal power grip)
  at: new V3(0.004, -0.0315, -0.069),             // barrel axis point under the fingers' base
  zf: -0.03,                                       // where on the flashlight (its own z) that point is
};
function gripFrame(mir, axisZ, at, zf) {
  // flashlight/can local -> hand frame
  const a = mir ? new V3(-axisZ.x, axisZ.y, axisZ.z) : axisZ.clone();
  const p = mir ? new V3(-at.x, at.y, at.z) : at.clone();
  const q = frameQ(new V3(0, 0, 1), new V3(0, 1, 0), a, new V3(0, 1, 0));
  const pos = p.clone().sub(new V3(0, 0, zf).applyQuaternion(q));
  return { q, pos, axis: a, at: p };
}

// ------------------------------------------------------------------ hand states
function sdfIn(objQ, objPos, fn) {
  const iq = objQ.clone().invert();
  return (p) => fn(p.clone().sub(objPos).applyQuaternion(iq));
}
function solveGrip(hand, objQ, objPos, fn, opt = {}) {
  const sdf = sdfIn(objQ, objPos, fn);
  const ang = [];
  const abd = opt.abd || [0.04, 0, -0.04, -0.1];
  for (let c = 0; c < 4; c++) ang.push(hand.grasp(c, sdf, { abd: abd[c], start: opt.start || [0.15, 0.2, 0.1] }));
  const th = opt.thumb || {};
  // the thumb closes over the object, across the index and middle fingers
  const others = [...hand.capsules(0, ang[0]), ...hand.capsules(1, ang[1])];
  const tgt = th.target(objQ, objPos);
  ang.push(hand.thumbTo(tgt, sdf, { others, mcp: th.mcp ?? 0.4, ip: th.ip ?? 0.35 }));
  return ang;
}
function presetAngles(kind) {
  if (kind === 'open') return [[0.06, 0.1, 0.06, 0.13, 0], [0.04, 0.08, 0.05, 0.02, 0], [0.06, 0.1, 0.06, -0.09, 0], [0.1, 0.12, 0.08, -0.2, 0], [0.05, 0.1, 0.05, 0.62, 0.25]];
  if (kind === 'relaxed') return [[0.12, 0.18, 0.1, -0.02, 0], [0.2, 0.28, 0.14, 0.0, 0], [0.26, 0.34, 0.18, 0.0, 0], [0.34, 0.4, 0.22, 0.02, 0], [0.25, 0.2, 0.15, 0.12, 0.35]];
  return null;
}

// a hand's target: where the wrist goes, how the hand is turned, where the elbow is, finger angles, what it holds
const POSES = {};
function definePoses() {
  const fq = gripFrame(false, GRIP.axis, GRIP.at, GRIP.zf);
  // thumb target: on the barrel's far side, a little toward the head, pressing over the index finger
  const barrelThumb = (zf, rr, side = 1) => (q, pos) => {
    const axisP = new V3(0, 0, zf).applyQuaternion(q).add(pos);
    const away = new V3(0, -1, 0);          // the barrel's far side from the palm (hand frame)
    return axisP.addScaledVector(away, rr);
  };
  const rightAngTight = solveGrip(R, fq.q, fq.pos, flashSDF, { thumb: { target: barrelThumb(GRIP.zf + 0.03, 0.0135 + 0.0105) } });
  // a light hold: the fingers only partly close round the barrel (the last joints stay open)
  const LOOSE = [0.85, 0.7, 0.55];
  const rightAng = rightAngTight.map((a, c) => c < 4 ? [a[0] * LOOSE[0], a[1] * LOOSE[1], a[2] * LOOSE[2], a[3], a[4]] : a.slice());
  // The right hand holds the flashlight like the reference photo: the back of the hand faces right,
  // the fingers wrap round the barrel toward you, the thumb is on top and the head stands up out of
  // the fist. The forearm comes up from the lower right and runs straight into the hand.
  const ARM_R = new V3(-0.02, -0.06, 1).normalize();          // where the forearm runs, in the hand's frame
  const FPS_R = new V3(0.75, -0.55, 0.35).normalize();      // arms come in from the lower corner
  const rightHand = (grip, long, back, lift = 0.14, maxTip = 40) => {
    const q0 = frameQ(new V3(0, 0, -1), new V3(0, 1, 0), long.clone().normalize(), back.clone().normalize());
    const wrist = grip.clone().sub(GRIP.at.clone().applyQuaternion(q0));
    // the forearm runs straight into the untipped hand
    const arm = ARM_R.clone().applyQuaternion(q0).lerp(FPS_R, 0.3).normalize();
    // then the wrist tips down (toward the little finger) until the flashlight points ahead
    const axis = new V3(0, 1, 0).applyQuaternion(q0);
    let best = null;
    for (let d = 0; d <= maxTip; d += 1) for (const sg of [-1, 1]) {
      const q = new Q().setFromAxisAngle(axis, sg * THREE.MathUtils.degToRad(d)).multiply(q0);
      const beam = GRIP.axis.clone().applyQuaternion(q);
      const c = Math.abs(beam.y - lift) + (beam.z > 0 ? 2 : 0) + d * 0.002;
      if (!best || c < best.c) best = { c, q, d };
    }
    return { wrist, handQ: best.q, elbow: wrist.clone().addScaledVector(arm, 0.27), held: 'flash', ang: rightAng, tip: best.d };
  };
  const leftRelaxed = { wrist: new V3(-0.17, -0.15, -0.41), handQ: frameQ(new V3(0, 0, -1), new V3(0, 1, 0), new V3(0.32, 0.02, -1), new V3(-0.25, 0.9, 0.35)), elbow: new V3(-0.3, -0.62, 0.0), held: null, ang: presetAngles('relaxed') };
  const holding = () => rightHand(new V3(0.17, -0.12, -0.42), new V3(-0.08, -0.05, -1), new V3(0.95, 0.25, 0.25), 0.1, 25);
  POSES.default = { R: holding(), L: leftRelaxed, light: true };
  // light off: the hand drops a little and the flashlight tips forward
  POSES.off = { R: rightHand(new V3(0.18, -0.16, -0.42), new V3(-0.08, -0.2, -1), new V3(0.95, 0.25, 0.25), -0.3, 25), L: { ...leftRelaxed, wrist: new V3(-0.19, -0.185, -0.38) }, light: false };
  // left hand open, reaching to take hold of something
  POSES.use = {
    R: holding(),
    L: { wrist: new V3(-0.13, -0.12, -0.40), handQ: frameQ(new V3(0, 0, -1), new V3(0, 1, 0), new V3(0.22, 0.75, -0.62), new V3(-0.45, 0.15, 0.88)), elbow: new V3(-0.28, -0.6, -0.04), held: null, ang: presetAngles('open') },
    light: true,
  };
  // the spray can in the left hand
  {
    const cg = gripFrame(true, GRIP.axis, new V3(0.004, -0.0505, -0.066), 0.0);
    const canAng = solveGrip(L, cg.q, cg.pos, canSDF, { abd: [0.08, 0.0, -0.06, -0.14], start: [0.1, 0.15, 0.1], thumb: { target: barrelThumb(0.03, 0.0333 + 0.0105), mcp: 0.25, ip: 0.2 } });
    // turn the hand so the can stands up with its label toward the camera
    const handQ = frameQ(cg.axis, new V3(0, 1, 0), new V3(0.12, 1, -0.28), new V3(-0.9, 0.0, -0.1));
    const at = new V3(-0.16, -0.17, -0.42);
    const wrist = at.clone().sub(cg.at.clone().applyQuaternion(handQ));
    POSES.spray = { R: holding(), L: { wrist, handQ, elbow: new V3(-0.24, -0.62, 0.02), held: 'can', ang: canAng, canFrame: cg }, light: true };
  }
  POSES._flashFrame = fq;
  // elbows: where the forearm would naturally be for that hand angle, pulled down and back out of view
  // bring everything a little closer to the eye (bigger hands on screen); in the two-handed pose the
  // left hand moves with the flashlight
  const NEAR = 0.9;
  const done = new Set();
  for (const [name, P] of Object.entries(POSES)) {
    if (!P || !P.R || !P.R.wrist) continue;
    const dR = P.R.wrist.clone().multiplyScalar(NEAR - 1);
    if (!done.has(P.R)) { P.R.wrist.add(dR); if (P.R.held === 'flash') P.R.elbow.add(dR); done.add(P.R); }
    if (done.has(P.L)) continue;
    done.add(P.L);
    if (name === 'both') P.L.wrist.add(dR); else P.L.wrist.multiplyScalar(NEAR);
  }
  for (const P of Object.values(POSES)) for (const k of ['R', 'L']) {
    const st = P[k]; if (!st || !st.wrist) continue;
    const sd = k === 'R' ? 1 : -1;
    if (st.held === 'flash') continue;            // the flashlight hand has its forearm already
    const neutral = new V3(0.2 * sd, -0.06, 1).normalize().applyQuaternion(st.handQ);
    const fps = new V3(0.75 * sd, -0.55, 0.35).normalize();
    st.elbow = st.wrist.clone().addScaledVector(neutral.lerp(fps, 0.55).normalize(), 0.27);
  }
}

// ------------------------------------------------------------------ pose blending
const cur = { R: null, L: null };
const trans = { R: null, L: null };
let poseName = 'default';
function copyState(s) { return { wrist: s.wrist.clone(), handQ: s.handQ.clone(), elbow: s.elbow.clone(), held: s.held, ang: s.ang.map((a) => a.slice()), canFrame: s.canFrame }; }
const LOW = { R: { wrist: new V3(0.28, -0.6, -0.22), elbow: new V3(0.34, -0.9, 0.1) }, L: { wrist: new V3(-0.28, -0.6, -0.22), elbow: new V3(-0.34, -0.9, 0.1) } };
function setPose(name) {
  const P = POSES[name];
  if (!P) return;
  poseName = name;
  for (const k of ['R', 'L']) {
    const to = P[k];
    const from = cur[k] ? copyState(cur[k]) : copyState(to);
    const swap = cur[k] && from.held !== to.held;            // drop the hand out of view to change what it holds
    trans[k] = { from, to, t: 0, dur: swap ? 0.95 : 0.5, swap };
  }
  targetLight = P.light;
  document.querySelectorAll('[data-pose]').forEach((b) => b.classList.toggle('on', b.dataset.pose === name));
}
let targetLight = true, lightOn = true;
function stepHand(k, dt) {
  const tr = trans[k];
  if (!tr) return;
  tr.t = Math.min(1, tr.t + dt / tr.dur);
  const s = cur[k] || (cur[k] = copyState(tr.to));
  if (tr.swap) {
    // down, change grip, up
    const a = tr.t < 0.5 ? ease(tr.t * 2) : ease((tr.t - 0.5) * 2);
    const A = tr.t < 0.5 ? tr.from : { ...tr.to, wrist: LOW[k].wrist, elbow: LOW[k].elbow, handQ: tr.to.handQ, ang: tr.to.ang };
    const B = tr.t < 0.5 ? { ...tr.from, wrist: LOW[k].wrist, elbow: LOW[k].elbow } : tr.to;
    if (tr.t >= 0.5) { s.held = tr.to.held; s.canFrame = tr.to.canFrame; }
    blendInto(s, A, B, a);
  } else {
    const a = ease(tr.t);
    blendInto(s, tr.from, tr.to, a);
    // a slight dip on the way
    s.wrist.y -= Math.sin(Math.PI * tr.t) * 0.02;
    s.held = tr.to.held; s.canFrame = tr.to.canFrame;
  }
  if (tr.t >= 1) trans[k] = null;
}
function blendInto(s, A, B, a) {
  s.wrist.lerpVectors(A.wrist, B.wrist, a);
  s.elbow.lerpVectors(A.elbow, B.elbow, a);
  s.handQ.slerpQuaternions(A.handQ, B.handQ, a);
  for (let c = 0; c < 5; c++) for (let j = 0; j < 5; j++) s.ang[c][j] = A.ang[c][j] + (B.ang[c][j] - A.ang[c][j]) * a;
}

// ------------------------------------------------------------------ view
let view = 'game';
const look = { yaw: 0, pitch: -0.04 };
const camHome = new V3(0.25, 1.62, 1.15);
let orbit = null;
function setView(v) {
  view = v;
  room.visible = v === 'game'; studio.visible = v === 'studio';
  scene.background = v === 'studio' ? studioBg : new THREE.Color(0x000000);
  scene.environment = v === 'studio' ? envTex : null;
  scene.fog = v === 'game' ? new THREE.FogExp2(0x000000, 0.06) : null;
  grain.uniforms.uVig.value = v === 'game' ? 0.55 : 0.25;
  // the held things get a faint reflection of the room in the game view (black metal is otherwise invisible in the dark)
  for (const [m, g] of vmMats) { m.envMap = envTex; m.envMapIntensity = v === 'game' ? g : 0.55; m.needsUpdate = true; }
  renderer.toneMappingExposure = v === 'game' ? 1.12 : 0.95;
  if (v === 'studio') {
    // freeze the rig where it is and orbit around the hands
    camera.position.copy(camHome); camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
    rig.position.copy(camera.position); rig.quaternion.copy(camera.quaternion);
    const c = new V3(0, -0.15, -0.4).applyQuaternion(rig.quaternion).add(rig.position);
    // step back a little from the eye so both arms are in view
    camera.position.copy(new V3(0, 0.05, 0.12).applyQuaternion(rig.quaternion).add(rig.position));
    orbit.target.copy(c); orbit.enabled = true; orbit.update();
    // keep to the front half, where the arms read as arms
    const az = orbit.getAzimuthalAngle();
    orbit.minAzimuthAngle = az - 1.2; orbit.maxAzimuthAngle = az + 1.2;
    orbit.minPolarAngle = 0.35; orbit.maxPolarAngle = 2.2;
  } else orbit.enabled = false;
  document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === v));
}
function setLevel(l) {
  level = l; flick = 0.12;
  document.querySelectorAll('[data-level]').forEach((b) => b.classList.toggle('on', b.dataset.level === l));
}

// drag to look (game view)
let drag = null;
renderer.domElement.addEventListener('pointerdown', (e) => { if (view === 'game') drag = { x: e.clientX, y: e.clientY }; });
addEventListener('pointermove', (e) => {
  if (!drag) return;
  look.yaw -= (e.clientX - drag.x) * 0.0035; look.pitch = clamp(look.pitch - (e.clientY - drag.y) * 0.0035, -0.9, 0.7);
  drag = { x: e.clientX, y: e.clientY };
});
addEventListener('pointerup', () => { drag = null; });

// ------------------------------------------------------------------ frame
let t = 0, autoT = 0, auto = false;
const ORDER = ['default', 'use', 'off', 'spray'];
const tmpQ = new Q(), rayc = new THREE.Raycaster();
const AIM = new V3(0.5, -0.1, -4.0);          // where the light is nudged toward, in view space
function frame(dt) {
  t += dt;
  if (auto) { autoT += dt; if (autoT > 3.2) { autoT = 0; setPose(ORDER[(ORDER.indexOf(poseName) + 1) % ORDER.length]); } }
  // camera + rig
  if (view === 'game') {
    camera.position.copy(camHome);
    camera.position.y += Math.sin(t * 1.5) * 0.004;
    if (!window.__CAMLOCK) camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
    rig.position.copy(camera.position);
    if (window.__CAMLOCK) rig.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ')); else rig.quaternion.slerp(camera.quaternion, 1 - Math.exp(-dt * 11));
  } else orbit.update();
  // hands
  stepHand('R', dt); stepHand('L', dt);
  for (const [k, H] of [['R', R], ['L', L]]) {
    const s = cur[k];
    if (!s) continue;
    // breathing and a faint tremor
    const ph = k === 'R' ? 0 : 1.7;
    const w = s.wrist.clone().add(new V3(Math.sin(t * 0.9 + ph) * 0.002, Math.sin(t * 1.5 + ph) * 0.003, Math.sin(t * 0.7 + ph) * 0.0015));
    const hq = s.handQ.clone().multiply(tmpQ.setFromEuler(new THREE.Euler(Math.sin(t * 7.3 + ph) * 0.0025 + Math.sin(t * 1.1) * 0.01, Math.sin(t * 5.9 + ph) * 0.002, Math.sin(t * 0.8 + ph) * 0.008)));
    for (let c = 0; c < 5; c++) for (let j = 0; j < 3; j++) H.ang[c][j] = s.ang[c][j] + (s.held ? 0 : Math.sin(t * 0.6 + c * 1.3 + ph) * 0.02);
    for (let c = 0; c < 5; c++) { H.ang[c][3] = s.ang[c][3]; H.ang[c][4] = s.ang[c][4]; }
    if (window.__DBG && window.__DBG[k]) { const D = window.__DBG[k]; for (let c = 0; c < 5; c++) for (let j = 0; j < 5; j++) H.ang[c][j] = D.ang[c][j]; }
    H.applyAngles();
    if (window.__DBG && window.__DBG[k] && window.__DBG[k].pose) H.place(window.__DBG[k].pose.w, window.__DBG[k].pose.q, window.__DBG[k].pose.e); else H.place(w, hq, s.elbow);
  }
  // what the left hand holds
  can.visible = cur.L && cur.L.held === 'can';
  if (can.visible) { const cf = cur.L.canFrame; can.position.copy(cf.pos); can.quaternion.copy(cf.q); }
  // light
  lightOn = targetLight && level !== 'off';
  const Lv = LEVELS[lightOn ? level : 'off'];
  flick = Math.max(0, flick - dt);
  beamK += ((lightOn ? 1 : 0) - beamK) * Math.min(1, dt * 30);
  const fl = flick > 0 ? (Math.sin(t * 160) > 0 ? 0.35 : 1) : 1;
  const I = LEVELS[level].I * beamK * fl * (targetLight ? 1 : 0);
  spot.intensity = I; spot.angle = Lv.angle || 0.33;
  spill.intensity = 0;
  flash.userData.led.emissiveIntensity = I > 0 ? 1.6 + I * 0.0015 : 0;
  rig.updateMatrixWorld(true);
  // held upright like the reference photo, the flashlight itself points up; its light is steered to
  // where you are looking (a little right of and above centre), as in the photo
  const lens = new V3(0, 0, 0.0845).applyMatrix4(flash.matrixWorld);
  const aim = rig.localToWorld(AIM.clone());
  const dir = new V3(0, 0, 1).transformDirection(flash.matrixWorld).lerp(aim.clone().sub(lens).normalize(), 0.5).normalize();
  // (the light starts just past the head, so it doesn't light the flashlight's own reflector and bezel)
  spot.position.copy(lens).addScaledVector(dir, 0.07); spot.target.position.copy(lens).addScaledVector(dir, 4); spot.target.updateMatrixWorld();
  cone.position.copy(lens); cone.quaternion.setFromUnitVectors(new V3(0, 0, 1), dir);
  cone.material.uniforms.uK.value = (lightOn ? LEVELS[level].cone : 0) * beamK * fl * (view === 'game' ? 1 : 0.5);
  cone.visible = cone.material.uniforms.uK.value > 0.01;
  dust.material.uniforms.uLens.value.copy(lens); dust.material.uniforms.uDir.value.copy(dir);
  dust.material.uniforms.uCos.value = Math.cos(spot.angle * 0.9); dust.material.uniforms.uK.value = I / 700;
  dust.material.uniforms.uT.value = t; dust.material.uniforms.uPx.value = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  dust.visible = view === 'game';
  // light bouncing back off whatever the beam hits lights the gloves from the front
  if (view === 'game' && I > 0) {
    rayc.set(lens, dir); rayc.far = 12;
    const hit = rayc.intersectObjects(solids, false)[0];
    if (hit) {
      const n = hit.face ? hit.face.normal.clone().transformDirection(hit.object.matrixWorld) : dir.clone().negate();
      bounce.position.copy(hit.point).addScaledVector(n, 0.35);
      const d = hit.distance;
      bounce.intensity = I * 0.02 / Math.max(0.6, d * d * 0.35);
    } else bounce.intensity = 0;
  } else bounce.intensity = 0;
  armFill.intensity = view === 'game' ? 0.05 + I * 0.0011 : 0;
  armTop.intensity = view === 'game' ? 0.06 + I * 0.0003 : 0;
  nightAmb.intensity = 0.3;
  grain.uniforms.uT.value = t;
}

// ------------------------------------------------------------------ boot
function boot() {
  buildRoom();
  handData();
  R = new Hand('right', mats); L = new Hand('left', mats);
  rig.add(R.mesh, L.mesh);
  flash = makeFlashlight();
  R.bones[1].add(flash);
  const fq = gripFrame(false, GRIP.axis, GRIP.at, GRIP.zf);
  flash.position.copy(fq.pos); flash.quaternion.copy(fq.q);
  scene.add(spot, spot.target);
  spill.position.set(0, 0.0, 0.07); flash.add(spill);
  cone = makeCone(); scene.add(cone);
  dust = makeDust(); scene.add(dust);
  can = makeCan(); L.bones[1].add(can); can.visible = false;
  vmMats = [];
  const collect = (o, g) => o.traverse((x) => { if (x.material && !x.material.isShaderMaterial && !x.material.isMeshBasicMaterial && !x.isPoints) vmMats.push([x.material, g]); });
  collect(flash, 0.55); collect(can, 0.3);
  vmMats.push([R.mesh.material, 0.1], [L.mesh.material, 0.1], [mats.sleeve, 0.06]);
  orbit = new OrbitControls(camera, renderer.domElement);
  orbit.enableDamping = true; orbit.minDistance = 0.14; orbit.maxDistance = 0.85; orbit.enabled = false;
  definePoses();
  setPose('default');
  for (const k of ['R', 'L']) { cur[k] = copyState(POSES.default[k]); trans[k] = null; }
  setView('game'); setLevel('mid');
  document.querySelectorAll('[data-pose]').forEach((b) => b.addEventListener('click', () => { auto = false; $('#auto').classList.remove('on'); setPose(b.dataset.pose); }));
  document.querySelectorAll('[data-level]').forEach((b) => b.addEventListener('click', () => setLevel(b.dataset.level)));
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  $('#auto').addEventListener('click', () => { auto = !auto; autoT = 0; $('#auto').classList.toggle('on', auto); });
  $('#loading').classList.add('hide');
  let last = performance.now();
  const loop = (now) => {
    const dt = Math.min(0.05, (now - last) / 1000); last = now;
    if (!window.__NOLOOP) { frame(dt); composer.render(); }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
  window.__H = {
    setPose, setLevel, setView, look, camera, R, L, POSES, orbit, rig,
    step(n = 1, dt = 1 / 30) { for (let i = 0; i < n; i++) frame(dt); composer.render(); },
    get pose() { return poseName; },
  };
  window.__READY = true;
}
setTimeout(boot, 30);
