import * as THREE from 'three';
import * as TX from '../textures.js';
import { buildLevel, buildBugMarkers, ROOMS, DOORS, SPOTS, greyMat, boxGeom } from './level.js';
import { Player } from './player.js';
import { makeSilkMaterial } from '../silk.js';
import { RoachSwarms } from './roachswarm.js';
import { Arms } from './arms.js';
import { beamPattern, makeCone, beamNear } from '../hands/beam.js';
import { Sound } from './audio.js';
import { dressLevel } from './dressing.js';
import { MapSpiders } from './spiders.js';
import { EggNest } from './spiderlings.js';
import { GhostBrood } from './ghostlings.js';
import { MapCentipede } from './centi.js';

const $ = (s) => document.querySelector(s);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const TEST = new URLSearchParams(location.search).has('test');
document.body.classList.toggle('touch', touch);

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.35 : 1.75));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.05);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 140);

// ------------------------------------------------------------------ level
const { group: levelGroup, colliders, labels: roomLabels } = buildLevel(scene);
const markers = buildBugMarkers(scene);
const silk = makeSilkMaterial();
// set dressing (boxes, racks, pipes, stains, signs...) adds its footprints to the colliders before the bugs map the floor
const dress = dressLevel(scene, { colliders, T: 0.3, silkMat: silk });
const nests = SPOTS.bugs.filter((b) => b.kind === 'roach').map((b, i) => ({ x: b.x, z: b.z, count: [12, 10, 9, 8][i] || 8, spread: 1.0 }));
const swarms = new RoachSwarms(scene, nests, colliders, TX.makeContactShadow(128));
const arms = new Arms();
// the big bugs: ceiling spiders + webs, egg sacs in the lab, the centipede in the wall
const BT = { chitin: TX.makeChitinNormal(256), terg: TX.makeTergiteTextures(512), band: TX.makeBandTextures(), bandU: TX.makeBandTexturesU(), eye: TX.makeEyeNormal(), contact: TX.makeContactShadow() };
BT.eye.repeat.set(3, 3);
const spiders = new MapSpiders(scene, silk, BT);
const eggs = new EggNest(scene, [[-7.6, 4.02, 62.6], [-6.7, 2.75, 61.3], [-9.5, 4.05, 63.2]], silk, BT);
const brood = new GhostBrood(scene);
const centi = new MapCentipede(scene, BT, dress.metalMaterial(0x7d8280));
const mist = makeMist(scene);
const sfx = new Sound();
window.__SFX = sfx;
let stepAcc = 0, stepSide = false;
arms.addOverlay(swarms.overlay);
// eyes getting used to the dark: with the light off, what is close slowly becomes faintly visible
const nightEye = new THREE.PointLight(0x9db0cc, 0, 6.5, 1.6);
scene.add(nightEye);
const NIGHT_K = 0.75;
const FLASH_I = 200;          // the flashlight's strength (turned down on close walls, see beamNear)
let adapt = 0, prevYaw = 0, prevPitch = 0, shakeKick = 0, prevCrouch = false, battK = 1, beamPow = 0;
const lensW = new THREE.Vector3();

// outside the shutter (seen once it opens)
{
  const out = new THREE.Mesh(boxGeom(14, 0.1, 10, 0, -0.05, -5), greyMat('#5e6670'));
  out.receiveShadow = true;
  scene.add(out);
}
const dawn = new THREE.PointLight(0x9fb8ff, 0, 18, 1.2);
dawn.position.set(0, 3, -4);
scene.add(dawn);

// ------------------------------------------------------------------ lights
const hemi = new THREE.HemisphereLight(0xdfe6ff, 0x3a3630, 0);
scene.add(hemi);
const flash = new THREE.SpotLight(0xffeedd, 0, 0, 0.5, 0.5, 2);
flash.castShadow = true;
flash.shadow.mapSize.set(touch ? 512 : 1024, touch ? 512 : 1024);
flash.shadow.bias = -0.0005; flash.shadow.normalBias = 0.002;     // (more, and light leaks round edges when the lens is near a wall)
// the near plane has to sit right at the lens: anything closer than it falls outside the beam
// pattern's projection and gets the raw, unpatterned spot instead (a hard-edged bright patch)
flash.shadow.camera.near = 0.01; flash.shadow.camera.far = 30;
flash.map = beamPattern();
scene.add(flash, flash.target);
// the shaft of light through the dusty air (as in the hands viewer)
const shaft = makeCone();
shaft.frustumCulled = false;
scene.add(shaft);
let nearK = 1;
// spill: the soft halo around a real flashlight beam that lights things right in front of you
const beamDir = new THREE.Vector3();
const spill = new THREE.PointLight(0xffeedd, 0, 1.8, 2);
scene.add(spill);
const bounce = new THREE.PointLight(0xffd8b0, 0, 8, 1.6);
scene.add(bounce);

const lampMat = () => new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: new THREE.Color(0xffa24a), emissiveIntensity: 0, roughness: 0.4 });
const lamps = SPOTS.lamps.map((s, i) => {
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  const pole = new THREE.Mesh(boxGeom(0.12, 2.8, 0.12, 0, 1.4, 0), dress.metalMaterial(0x6d726e));
  const arm = new THREE.Mesh(boxGeom(0.7, 0.08, 0.08, 0.3, 2.78, 0), dress.metalMaterial(0x6d726e));
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), lampMat());
  bulb.position.set(0.6, 2.62, 0);
  const shade = new THREE.Mesh(new THREE.ConeGeometry(0.3, 0.22, 20, 1, true), new THREE.MeshStandardMaterial({ color: 0x3a3732, side: THREE.DoubleSide }));
  shade.position.set(0.6, 2.72, 0);
  const lever = new THREE.Mesh(boxGeom(0.06, 0.4, 0.06, 0, 0.2, 0), new THREE.MeshStandardMaterial({ color: 0xb03020, roughness: 0.5 }));
  const leverPivot = new THREE.Group(); leverPivot.position.set(0.09, 1.05, 0); leverPivot.rotation.z = 0.6; leverPivot.add(lever);
  for (const m of [pole, arm, shade]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(pole, arm, bulb, shade, leverPivot);
  scene.add(g);
  const light = new THREE.PointLight(0xffa24a, 0, 9, 1.5);
  light.position.set(s.x + 0.6, 2.45, s.z);
  scene.add(light);
  colliders.push({ x0: s.x - 0.12, x1: s.x + 0.12, z0: s.z - 0.12, z1: s.z + 0.12 });
  return { ...s, idx: i, bulb, light, leverPivot, on: false, burnt: false, t: 0 };
});

const genMeshes = SPOTS.generators.map((s, i) => {
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  g.rotation.y = s.yaw;
  const body = new THREE.Mesh(boxGeom(1.6, 1.3, 1.1, 0, 0.65, 0), dress.metalMaterial(0xb0922a));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 20).rotateZ(Math.PI / 2).translate(0, 1.0, 0), dress.metalMaterial(0x4e5458));
  const panel = new THREE.Mesh(boxGeom(0.6, 0.4, 0.05, 0.3, 0.75, 0.57), dress.metalMaterial(0x34363a));
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: new THREE.Color(0xff2a10), emissiveIntensity: 1.2 }));
  led.position.set(0.45, 0.85, 0.6);
  for (const m of [body, drum, panel]) { m.castShadow = true; m.receiveShadow = true; }
  g.add(body, drum, panel, led);
  scene.add(g);
  const c = Math.abs(Math.cos(s.yaw)) > 0.5;
  colliders.push(c ? { x0: s.x - 0.8, x1: s.x + 0.8, z0: s.z - 0.55, z1: s.z + 0.55 } : { x0: s.x - 0.55, x1: s.x + 0.55, z0: s.z - 0.8, z1: s.z + 0.8 });
  return { ...s, idx: i, g, led, on: false };
});

const reds = {};
for (const [room, p] of Object.entries(SPOTS.redLights)) {
  const fixture = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.15, 0.15), new THREE.MeshStandardMaterial({ color: 0x220000, emissive: new THREE.Color(0xff1a08), emissiveIntensity: 0 }));
  fixture.position.set(p.x, p.y, p.z);
  scene.add(fixture);
  const light = new THREE.PointLight(0xff2a10, 0, 16, 1.4);
  light.position.set(p.x, p.y - 0.3, p.z - 0.3 * Math.sign(p.z - 40));
  scene.add(light);
  reds[room] = { fixture, light, on: false };
}

const noteMeshes = SPOTS.notes.map((n, i) => {
  const m = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.01, 0.4), new THREE.MeshStandardMaterial({ color: 0xe8e2d0, emissive: new THREE.Color(0x40382a), emissiveIntensity: 0.4 }));
  m.position.set(n.x, n.y, n.z); m.rotation.y = 0.3 * i;
  scene.add(m);
  return { ...n, idx: i, m, read: false };
});
const refill = (() => {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.28, 14), new THREE.MeshStandardMaterial({ color: 0xc8b23a, metalness: 0.6, roughness: 0.35, emissive: new THREE.Color(0x302808), emissiveIntensity: 0.6 }));
  m.position.set(SPOTS.refill.x, 0.14, SPOTS.refill.z);
  m.castShadow = true;
  scene.add(m);
  return { m, taken: false, x: SPOTS.refill.x, z: SPOTS.refill.z };
})();

// emergency door and shutter
const emDoor = new THREE.Mesh(boxGeom(3, 3, 0.18, 0, 1.5, 0), dress.metalMaterial(0x4f6b58));
emDoor.position.set(-15.5, 0, 52);
emDoor.castShadow = emDoor.receiveShadow = true;
scene.add(emDoor);
const emCol = { x0: -17, x1: -14, z0: 51.8, z1: 52.2 };
colliders.push(emCol);
const shutter = new THREE.Mesh(boxGeom(5.0, 4.5, 0.16, 0, 2.25, 0), dress.metalMaterial(0x8b8d88));
shutter.position.set(0, 0, 0.2);
shutter.castShadow = shutter.receiveShadow = true;
scene.add(shutter);
const shCol = { x0: -2.6, x1: 2.6, z0: 0.05, z1: 0.35 };
colliders.push(shCol);
spiders.setColliders(colliders);
const indicators = [0, 1, 2].map((i) => {
  const m = new THREE.Mesh(new THREE.SphereGeometry(0.11, 14, 10), new THREE.MeshStandardMaterial({ color: 0x200000, emissive: new THREE.Color(0xff2010), emissiveIntensity: 1.4 }));
  m.position.set(-0.6 + i * 0.6, 4.85, 0.45);
  scene.add(m);
  return m;
});
const shutterGlow = new THREE.PointLight(0xff2010, 0.6, 4, 2);
shutterGlow.position.set(0, 4.6, 1.0);
scene.add(shutterGlow);

// ------------------------------------------------------------------ player + state
const player = new Player(camera, colliders);
const G = {};
function resetGame() {
  sfx.resetWorld();
  Object.assign(G, {
    battery: 1, flashOn: false, locked: false, holdT: 0, holdKey: null, shutter: 0, shutterOpening: false,
    emergency: 0, emergencyOpening: false, time: 0, timing: false, won: false, gens: 0, spray: 3, inSafe: false,
    tipped: {}, lampSeen: false, hp: 3, dead: false, attached: [], scared: false, events: [],
    grab: null, sprayCd: 0, webSlowT: 0, lingSlow: 0, lingT: 9, eggTip: false, checkpoint: null,
    hidden: false, revealT: 0, hiddenT: 0, stillT: 0, drained: false,
  });
  swarms.reset();
  spiders.reset(); eggs.reset(); brood.reset(); centi.reset();
  document.body.classList.remove('grabbed'); $('#grab').classList.remove('show'); $('#bMash').classList.remove('show');
  $('#crawl').classList.remove('show'); $('#dead').classList.remove('show'); $('#hurt').style.opacity = 0;
  player.place(SPOTS.start.x, SPOTS.start.z, SPOTS.start.yaw);
  for (const l of lamps) { l.on = false; l.burnt = false; l.t = 0; l.light.intensity = 0; l.bulb.material.emissive.set(0xffa24a); l.bulb.material.emissiveIntensity = 0; l.leverPivot.rotation.z = 0.6; }
  for (const g of genMeshes) { g.on = false; g.led.material.emissive.set(0xff2a10); }
  for (const r of Object.values(reds)) { r.on = false; r.light.intensity = 0; r.fixture.material.emissiveIntensity = 0; }
  for (const n of noteMeshes) { n.read = false; n.m.visible = true; }
  refill.taken = false; refill.m.visible = true;
  emDoor.position.x = -15.5; emCol.off = false;
  shutter.position.y = 0; shCol.off = false;
  indicators.forEach((m) => m.material.emissive.set(0xff2010));
  dawn.intensity = 0;
  $('#win').classList.remove('show');
  updateHud();
}

// ------------------------------------------------------------------ HUD helpers
const tipEl = $('#tip'), msgEl = $('#msg'), noteEl = $('#note'), promptEl = $('#prompt'), barEl = $('#prompt .bar i');
let tipTimer = 0, msgTimer = 0, noteTimer = 0;
const shownTips = {};
function tip(text, key) {
  if (key) { shownTips[key] = (shownTips[key] || 0) + 1; if (shownTips[key] > 2) return; }
  tipEl.textContent = text; tipEl.classList.add('show');
  clearTimeout(tipTimer); tipTimer = setTimeout(() => tipEl.classList.remove('show'), 3500);
}
function msg(text) {
  msgEl.textContent = text; msgEl.classList.add('show');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => msgEl.classList.remove('show'), 2600);
}
function note(text) {
  noteEl.textContent = text; noteEl.classList.add('show');
  clearTimeout(noteTimer); noteTimer = setTimeout(() => noteEl.classList.remove('show'), 4800);
}
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateHud() {
  $('#obj').textContent = G.gens < 3 ? `발전기 ${G.gens}/3` : '하역장 셔터로 탈출';
  $('#timer').textContent = fmt(G.time || 0);
}

// ------------------------------------------------------------------ input
const keys = {};
const input = { mx: 0, mz: 0, run: false, crouch: false, lookX: 0, lookY: 0, use: false, usePressed: false };
let override = null;
let locked = false;
addEventListener('keydown', (e) => {
  if (e.repeat) return;
  keys[e.code] = true;
  if (e.code === 'KeyF') toggleFlash();
  if (e.code === 'KeyM') toggleMap();
  if (e.code === 'KeyB') toggleBright();
  if (e.code === 'KeyE') input.usePressed = true;
  if (e.code === 'KeyQ') useSpray();
  if (e.code === 'Space' && G.grab) mashGrab();
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const el = renderer.domElement;
el.addEventListener('click', () => {
  if (touch || !G.started) return;
  if (!locked) { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* drag to look instead */ } }
  else if (G.grab) mashGrab();
  else toggleFlash();
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === el; });
let drag = null;
el.addEventListener('mousedown', (e) => { if (e.button === 2) { useSpray(); return; } if (!locked && !touch) drag = { x: e.clientX, y: e.clientY }; });
addEventListener('mouseup', () => { drag = null; });
addEventListener('mousemove', (e) => {
  if (touch) return;
  if (locked) { input.lookX += e.movementX * 0.0022; input.lookY += e.movementY * 0.0022; }
  else if (drag) { input.lookX += (e.clientX - drag.x) * 0.004; input.lookY += (e.clientY - drag.y) * 0.004; drag = { x: e.clientX, y: e.clientY }; }
});
el.addEventListener('contextmenu', (e) => e.preventDefault());

// touch: left side = joystick, right side = look
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look = { id: null, x: 0, y: 0 };
const joyBase = $('#joy'), joyKnob = $('#joy i');
el.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  if (e.clientX < innerWidth * 0.45 && joy.id === null) {
    joy.id = e.pointerId; joy.ox = e.clientX; joy.oy = e.clientY; joy.x = 0; joy.y = 0;
    joyBase.style.left = `${e.clientX}px`; joyBase.style.top = `${e.clientY}px`; joyBase.classList.add('on');
  } else if (look.id === null) { look.id = e.pointerId; look.x = e.clientX; look.y = e.clientY; }
});
el.addEventListener('pointermove', (e) => {
  if (e.pointerId === joy.id) {
    let dx = e.clientX - joy.ox, dy = e.clientY - joy.oy;
    const l = Math.hypot(dx, dy), R = 55;
    if (l > R) { dx *= R / l; dy *= R / l; }
    joy.x = dx / R; joy.y = dy / R;
    joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  } else if (e.pointerId === look.id) {
    input.lookX += (e.clientX - look.x) * 0.006; input.lookY += (e.clientY - look.y) * 0.006;
    look.x = e.clientX; look.y = e.clientY;
  }
});
const endTouch = (e) => {
  if (e.pointerId === joy.id) { joy.id = null; joy.x = joy.y = 0; joyBase.classList.remove('on'); joyKnob.style.transform = ''; }
  if (e.pointerId === look.id) look.id = null;
};
el.addEventListener('pointerup', endTouch);
el.addEventListener('pointercancel', endTouch);
const hold = { run: false, use: false, crouch: false };
const bindHold = (id, key) => {
  const b = $(id);
  const on = (e) => { e.preventDefault(); e.stopPropagation(); hold[key] = true; b.classList.add('on'); if (key === 'use') input.usePressed = true; };
  const off = (e) => { e.preventDefault(); hold[key] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
};
bindHold('#bRun', 'run'); bindHold('#bUse', 'use');
$('#bCrouch').addEventListener('pointerdown', (e) => { e.preventDefault(); hold.crouch = !hold.crouch; $('#bCrouch').classList.toggle('on', hold.crouch); });
$('#bFlash').addEventListener('pointerdown', (e) => { e.preventDefault(); toggleFlash(); });
$('#bSpray').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); useSpray(); });
$('#bMash').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); mashGrab(); });
document.querySelectorAll('[data-act="map"]').forEach((b) => b.addEventListener('click', toggleMap));
document.querySelectorAll('[data-act="bright"]').forEach((b) => b.addEventListener('click', toggleBright));
document.querySelectorAll('[data-act="marks"]').forEach((b) => b.addEventListener('click', () => { markers.visible = !markers.visible; b.classList.toggle('on', markers.visible); }));

function readInput() {
  if (override) return override;
  input.mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x;
  input.mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - joy.y;
  input.run = !!(keys.ShiftLeft || keys.ShiftRight || hold.run);
  input.crouch = !!(keys.KeyC || hold.crouch);
  input.use = !!(keys.KeyE || hold.use);
  return input;
}

// ------------------------------------------------------------------ spray mist
function makeMist(sc) {
  const N = 160, pos = new Float32Array(N * 3), age = new Float32Array(N).fill(9), vel = new Float32Array(N * 3);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('aAge', new THREE.BufferAttribute(age, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uBright: { value: 0.3 }, uPx: { value: 600 } },
    vertexShader: `attribute float aAge; uniform float uPx; varying float vA;
      void main() { vA = clamp(1.0 - aAge / 1.1, 0.0, 1.0) * step(aAge, 1.1); vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_Position = projectionMatrix * mv; gl_PointSize = uPx * (0.05 + aAge * 0.35) / -mv.z; }`,
    fragmentShader: `uniform float uBright; varying float vA;
      void main() { float r = length(gl_PointCoord - 0.5); if (r > 0.5 || vA <= 0.0) discard; gl_FragColor = vec4(vec3(0.86, 0.93, 0.84) * uBright, vA * (1.0 - r * 2.0) * 0.35); }`,
  });
  const pts = new THREE.Points(g, mat); pts.frustumCulled = false; sc.add(pts);
  let k = 0;
  return {
    emit(o, d) {
      for (let i = 0; i < 70; i++) {
        const j = k++ % N;
        const sp = new THREE.Vector3((Math.random() - 0.5) * 0.5, (Math.random() - 0.5) * 0.4, (Math.random() - 0.5) * 0.5).add(d).normalize().multiplyScalar(3.5 + Math.random() * 3);
        pos[j * 3] = o.x; pos[j * 3 + 1] = o.y; pos[j * 3 + 2] = o.z; vel.set([sp.x, sp.y, sp.z], j * 3); age[j] = -Math.random() * 0.35;
      }
    },
    update(dt, bright, px) {
      mat.uniforms.uBright.value = bright; mat.uniforms.uPx.value = px;
      for (let j = 0; j < N; j++) {
        if (age[j] > 1.2) continue;
        age[j] += dt;
        if (age[j] < 0) continue;
        const dr = Math.exp(-dt * 3.2);
        vel[j * 3] *= dr; vel[j * 3 + 1] = vel[j * 3 + 1] * dr - dt * 0.3; vel[j * 3 + 2] *= dr;
        pos[j * 3] += vel[j * 3] * dt; pos[j * 3 + 1] += vel[j * 3 + 1] * dt; pos[j * 3 + 2] += vel[j * 3 + 2] * dt;
      }
      g.attributes.position.needsUpdate = true; g.attributes.aAge.needsUpdate = true;
    },
  };
}

// ------------------------------------------------------------------ spray: 60 degree cone, 3 m
function useSpray() {
  if (!G.started || G.dead || G.won) return;
  if (G.sprayCd > 0) return;
  if (G.spray <= 0) { sfx.spray(true); msg('스프레이가 다 떨어졌다...'); return; }
  G.spray--; G.sprayCd = 0.7; G.revealT = 1.5;      // the hiss gives a hiding place away
  updateHud();
  arms.sprayPuff(); sfx.spray();
  // the hit test comes from the eye along the view, the mist from the nozzle
  const o = camera.position.clone(), d = new THREE.Vector3(); player.forward(d);
  G.mistIn = 0.12; G.mistDir = d.clone();     // the can needs a moment to come up
  const hitR = swarms.sprayHit(o, d);
  const sp = spiders.spray(o, d);
  const lings = eggs.spray(o, d) + brood.spray(o, d);
  const c = centi.spray(o, d);
  if (sp.webs) { tip('거미줄이 녹아내린다', 'webmelt'); for (const w of spiders.webs) if (w.state === 'melting') sfx.webMelt(w.x, w.z); }
  if (G.grab && sp.spiders.includes(G.grab.sp)) endGrab(true);
  if (c) sfx.centiHiss(centi.head.x, centi.head.z);
  if (hitR + lings > 0) sfx.roachDie(hitR + lings);
  for (const s2 of sp.spiders) { const p = s2.s.bodyWorld; sfx.spiderFlinch(p.x, p.y, p.z); }
  if (hitR + lings + sp.spiders.length + (c ? 1 : 0) === 0 && !sp.webs) { /* missed */ }
}

// ------------------------------------------------------------------ grabbed by a spider: struggle 2 s
function startGrab(sp) {
  if (dev.god) { spiders.release(sp); return; }
  G.grab = { sp, meter: 0.65, t: 0 };
  G.attached.forEach((a) => swarms.drop(a.r, player.pos, player.pos)); G.attached.length = 0;
  sfx.grab(); shakeScreen();
  const h = $('#hit'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
  document.body.classList.add('grabbed');
  $('#grab').classList.add('show'); $('#bMash').classList.add('show');
}
function mashGrab() { if (G.grab) { G.grab.meter = Math.min(1, G.grab.meter + 0.1); sfx.struggle(); } }
function endGrab(sprayed) {
  const g = G.grab;
  if (!g) return;
  G.grab = null;
  document.body.classList.remove('grabbed');
  $('#grab').classList.remove('show'); $('#bMash').classList.remove('show');
  { const p = g.sp.s.bodyWorld; sfx.escape(p.x, p.y, p.z); }
  if (sprayed) { msg('스프레이로 떼어냈다. 살았다'); return; }
  spiders.release(g.sp);
  msg('하아... 겨우 빠져나왔다');
  hurt('붙잡혔을 때 스프레이를 썼어야 했다');
}

// ------------------------------------------------------------------ actions
function toggleFlash() {
  if (!G.started) return;
  if (!G.flashOn && G.drained) { if (window.__SFX) window.__SFX.click(false); tip('손전등이 아직 뜨겁다'); return; }
  G.flashOn = !G.flashOn;
  $('#bFlash').classList.toggle('on', G.flashOn);
  arms.toggleClick();
  if (window.__SFX) window.__SFX.click(G.flashOn);
}
let showMap = false, bright = false;
function toggleMap() { showMap = !showMap; $('#minimap').classList.toggle('show', showMap); document.querySelectorAll('[data-act="map"]').forEach((b) => b.classList.toggle('on', showMap)); }
function toggleBright() {
  bright = !bright;
  hemi.intensity = bright ? 1.5 : 0;
  roomLabels.visible = bright;
  scene.fog.density = bright ? 0.012 : 0.05;
  document.querySelectorAll('[data-act="bright"]').forEach((b) => b.classList.toggle('on', bright));
}
function genOn(g) {
  g.on = true;
  G.gens++;
  G.events.push({ x: g.x, z: g.z, r: 30 });
  g.led.material.emissive.set(0x30ff60);
  const r = reds[g.room];
  r.on = true;
  indicators[G.gens - 1].material.emissive.set(0x30ff60);
  msg(G.gens === 3 ? '마지막 발전기다. 됐다!' : `발전기가 돌아간다. ${['', '두 대', '한 대'][G.gens]} 남았다`);
  sfx.generatorStart(g.x, g.z);
  tip('발전기 소리에 벌레들이 몰려오겠다...', 'gen');
  if (g.room === 'hall' && !centi.active) { sfx.silence(1.4); setTimeout(() => { if (!G.dead) centi.wake(); }, 1300); }
  if (g.room === 'lab') {
    G.emergencyOpening = true; setTimeout(() => { msg('비상 통로 문이 열렸다'); }, 1400); sfx.doorRumble(-15.5, 52, 1.6);
    setTimeout(() => { if (!G.dead && eggs.burst()) sfx.eggBurst(-7.6, 4, 62.6); centi.enrage(player.pos); }, 600);
  }
  if (G.gens === 3) { G.shutterOpening = true; setTimeout(() => msg('셔터가 열린다. 하역장으로 가야 해!'), 2800); sfx.doorRumble(0, 0.5, 3.4); }
  updateHud();
}

// interaction target in front of the player
const fwd = new THREE.Vector3();
function findTarget() {
  player.forward(fwd);
  const fl = Math.hypot(fwd.x, fwd.z) || 1;
  const fx = fwd.x / fl, fz = fwd.z / fl;
  let best = null;
  const consider = (kind, obj, x, z, range) => {
    const dx = x - player.pos.x, dz = z - player.pos.z, d = Math.hypot(dx, dz);
    if (d > range) return;
    const facing = (dx * fx + dz * fz) / (d || 1);
    if (facing < (touch ? 0.25 : 0.45) && d > 0.9) return;
    const score = d - facing;
    if (!best || score < best.score) best = { kind, obj, score };
  };
  for (const g of genMeshes) consider('gen', g, g.x, g.z, 2.4);
  for (const l of lamps) consider('lamp', l, l.x, l.z, 1.9);
  for (const n of noteMeshes) if (!n.read) consider('note', n, n.x, n.z, 1.9);
  if (!refill.taken) consider('refill', refill, refill.x, refill.z, 1.6);
  return best;
}
const useLabel = () => (touch ? '손 버튼' : 'E');

// ------------------------------------------------------------------ damage, death
const dev = { god: false, battery: false, noclip: false, freeze: false, fast: false, info: false };
// ---- lamp checkpoints: pulling a lamp's lever saves there; die and you get up under it again.
// Progress stays (generators, notes, the refill, snapped threads, the egg sac, dead roaches),
// health is back to 3, the spray keeps what was left, the lamp comes on again for 10 s and
// every bug goes back to where it started.
function respawnAtLamp(l) {
  Object.assign(G, { dead: false, hp: 3, attached: [], grab: null, sprayCd: 0, webSlowT: 0, lingSlow: 0, lingT: 9, holdT: 0, events: [], hidden: false, revealT: 0, hiddenT: 0 });
  document.body.classList.remove('grabbed'); $('#grab').classList.remove('show'); $('#bMash').classList.remove('show');
  $('#crawl').classList.remove('show'); $('#dead').classList.remove('show'); $('#hurt').style.opacity = 0;
  // stand beside the pole, on the side with the most room, facing out
  let best = null;
  for (let k = 0; k < 12; k++) {
    const a = k * Math.PI / 6, cx = Math.sin(a), cz = Math.cos(a);
    if (!swarms.nav.free(l.x + cx * 1.1, l.z + cz * 1.1)) continue;
    let room = 0;
    for (let d = 1.1; d < 4; d += 0.25) { if (!swarms.nav.free(l.x + cx * d, l.z + cz * d)) break; room++; }
    if (!best || room > best.room) best = { a, cx, cz, room };
  }
  if (best) player.place(l.x + best.cx * 1.1, l.z + best.cz * 1.1, best.a); else player.place(l.x + 1, l.z, 0);
  // the lamp comes back on for a while
  l.t = l.on ? Math.min(l.t, 10) : 10; l.on = true; l.burnt = false; l.leverPivot.rotation.z = -0.6; l.bulb.material.emissive.set(0xffa24a);
  sfx.lampOn(l.x, l.z);
  // the bugs go back where they started
  swarms.regroup(); spiders.regroup(); eggs.clearYoung(); brood.reset(); centi.regroup(l);
  G.started = true;
  sfx.respawn();
  msg('...정신이 든다. 전등 아래다');
}

function hurt(reason = '뛰는 소리에 바퀴들이 몰려왔다') {
  if (dev.god || G.dead) return;
  G.hp--;
  sfx.hurt();
  const f = $('#hit'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  $('#hurt').style.opacity = (3 - G.hp) * 0.28;
  if (G.hp <= 0) die(reason);
}
function die(deathTip) {
  if (G.dead) return;
  G.dead = true; G.timing = false;
  sfx.death();
  if (G.grab) { G.grab = null; document.body.classList.remove('grabbed'); $('#grab').classList.remove('show'); $('#bMash').classList.remove('show'); }
  G.attached.length = 0;
  $('#crawl').classList.remove('show');
  $('#dead').classList.add('show');
  $('#dead .s').textContent = '';
  setTimeout(() => { $('#dead .s').textContent = deathTip; }, 1600);
  setTimeout(() => { if (G.checkpoint) respawnAtLamp(G.checkpoint); else { resetGame(); G.started = true; } }, 3800);
}
function onAttach(r) {
  if (dev.god || G.dead || G.attached.length >= 3) return false;
  G.attached.push({ r, age: 0, shake: 0, rev: 0, lastSign: 0, taps: 0 });
  sfx.attach();
  tip(touch ? '떼어내야 해! (털기 버튼 연타)' : '떼어내야 해! (마우스를 흔들어)', 'attach');
  return true;
}
function shakeScreen() { document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); }

// ------------------------------------------------------------------ minimap
const mm = $('#minimap canvas'), mctx = mm.getContext('2d');
const MB = { x0: -21, x1: 25, z0: -3, z1: 71 };
function drawMap() {
  const W = mm.width, H = mm.height, s = Math.min(W / (MB.x1 - MB.x0), H / (MB.z1 - MB.z0));
  const X = (x) => (MB.x1 - x) * s, Y = (z) => H - (z - MB.z0) * s;   // +x drawn to the left so the map matches the view when facing north
  mctx.clearRect(0, 0, W, H);
  for (const r of Object.values(ROOMS)) {
    mctx.fillStyle = 'rgba(200,200,190,0.10)';
    mctx.strokeStyle = 'rgba(230,225,215,0.55)'; mctx.lineWidth = 1;
    mctx.fillRect(X(r.x1), Y(r.z1), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
    mctx.strokeRect(X(r.x1), Y(r.z1), (r.x1 - r.x0) * s, (r.z1 - r.z0) * s);
  }
  for (const d of DOORS) {
    mctx.strokeStyle = d.locked === 'emergency' && emCol.off === false ? '#ff5a3a' : d.locked === 'shutter' && !shCol.off ? '#ff5a3a' : 'rgba(0,0,0,0.9)';
    mctx.lineWidth = 3;
    mctx.beginPath();
    if (d.axis === 'z') { mctx.moveTo(X(d.from), Y(d.at)); mctx.lineTo(X(d.to), Y(d.at)); } else { mctx.moveTo(X(d.at), Y(d.from)); mctx.lineTo(X(d.at), Y(d.to)); }
    mctx.stroke();
  }
  if (markers.visible) for (const b of SPOTS.bugs) { mctx.fillStyle = 'rgba(255,60,40,0.75)'; mctx.beginPath(); mctx.arc(X(b.x), Y(b.z), 3, 0, Math.PI * 2); mctx.fill(); }
  for (const l of lamps) {
    mctx.fillStyle = l.burnt ? '#5a4a3a' : l.on ? '#ffb24a' : '#a07a40'; mctx.fillRect(X(l.x) - 2.5, Y(l.z) - 2.5, 5, 5);
    if (l === G.checkpoint) { mctx.strokeStyle = '#ffd890'; mctx.lineWidth = 1.5; mctx.beginPath(); mctx.arc(X(l.x), Y(l.z), 6, 0, Math.PI * 2); mctx.stroke(); }
  }
  for (const g of genMeshes) { mctx.fillStyle = g.on ? '#40ff70' : '#ffd23a'; mctx.beginPath(); mctx.arc(X(g.x), Y(g.z), 4, 0, Math.PI * 2); mctx.fill(); }
  const px = X(player.pos.x), py = Y(player.pos.z), a = player.yaw;
  mctx.save(); mctx.translate(px, py); mctx.rotate(-a);
  mctx.fillStyle = '#ffffff'; mctx.beginPath(); mctx.moveTo(0, -7); mctx.lineTo(4.5, 5); mctx.lineTo(-4.5, 5); mctx.closePath(); mctx.fill();
  mctx.restore();
}

// ------------------------------------------------------------------ loop
function resize() {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.fov = innerWidth < innerHeight ? 80 : 70;
  camera.updateProjectionMatrix();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  mm.width = 170 * dpr; mm.height = 270 * dpr;
}
addEventListener('resize', resize);
resize();

const ray = new THREE.Raycaster();
const levelMeshes = [...levelGroup.children, shutter, emDoor];
const hideSpots = colliders.filter((c) => c.hide);
const aim = new THREE.Vector3(), aimS = new THREE.Vector3();
let t = 0, flick = 1, flickT = 3;
const clock = new THREE.Clock();
let prevUse = false;

function roomAt(x, z) {
  for (const [k, r] of Object.entries(ROOMS)) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return k;
  return null;
}

function frame(dtOverride) {
  const dt = dtOverride != null ? dtOverride : Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  if (needRotate) { renderer.render(scene, camera); return; }
  const inp = readInput();
  const lookMag = Math.abs(inp.lookX) + Math.abs(inp.lookY) * 0.5, lookSign = Math.abs(inp.lookX) > 0.004 ? Math.sign(inp.lookX) : 0;
  if (G.started && !G.won && !G.dead && !G.grab) player.update(dt, inp);
  input.lookX = 0; input.lookY = 0;
  if (dev.battery) G.battery = 1;
  if (player.moved && !G.timing && !G.won) G.timing = true;
  if (G.timing) G.time += dt;

  // ---- flashlight + battery
  // G.battery is how much the flashlight has left before it overheats (1 = cool)
  if (G.drained) {
    // overheated: it cut out, and won't come on until it has cooled right down, 10 s
    G.battery = Math.min(1, G.battery + dt / 10);
    G.tickT = (G.tickT || 0) - dt;
    if (G.tickT <= 0) { G.tickT = 0.5 + Math.random() * 1.2; sfx.coolTick(); }
    if (G.battery >= 1) { G.drained = false; tip('손전등이 식었다'); }
  } else if (G.flashOn) G.battery -= dt / 30;
  else G.battery += dt * 0.02 * (G.inSafe ? 2 : 1);
  G.battery = Math.min(1, G.battery);
  if (G.battery <= 0 && !G.drained) {
    G.battery = 0; G.drained = true;
    if (G.flashOn) toggleFlash();
    sfx.overheat(); tip('손전등이 과열되었다');
  }
  if (G.flashOn && G.battery < 0.3) tip('손전등이 뜨거워진다... 잠깐 꺼 둬야겠다', 'battery');
  flickT -= dt;
  if (flickT < 0) {
    // it stutters more often as the battery runs down
    flickT = G.battery < 0.3 ? 1.2 + Math.random() * 3 : 5 + Math.random() * 8; flick = 0;
    if (G.flashOn && G.battery < 0.3) sfx.flashCrackle();
  }
  flick = Math.min(1, flick + dt * (flick < 0.5 ? 6 : 2));
  let fl = flick < 1 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 60)) : 1;
  if (G.battery < 0.15 && G.battery > 0) fl *= Math.random() < 0.05 ? 0.4 : 1;
  // the brightness tells you what is left: full when charged, dimming as it drains, a faint glow when empty
  const b = G.battery;
  battK += ((b <= 0 ? 0.09 : 0.09 + 0.91 * Math.pow(b, 1.3)) - battK) * Math.min(1, dt * 3);
  fl *= battK;
  flash.color.setRGB(1, 0.93 - (1 - Math.min(1, b / 0.35)) * 0.17, 0.87 - (1 - Math.min(1, b / 0.35)) * 0.38);
  player.forward(fwd);
  ray.set(camera.position, fwd);
  const hit = ray.intersectObjects(levelMeshes, false)[0];
  aim.copy(hit ? hit.point : camera.position.clone().addScaledVector(fwd, 12));
  aimS.lerp(aim, 1 - Math.exp(-dt * 14));
  const hd = hit ? hit.distance : 12;
  // the arms: the beam comes out of the flashlight in the right hand
  let dYaw = player.yaw - prevYaw; dYaw = Math.atan2(Math.sin(dYaw), Math.cos(dYaw));
  const dPitch = player.pitch - prevPitch; prevYaw = player.yaw; prevPitch = player.pitch;
  let nearLamp = null;
  for (const l of lamps) if (l.on) { const d = Math.hypot(player.pos.x - l.x, player.pos.z - l.z); if (d < 9 && (!nearLamp || d < nearLamp.d)) nearLamp = { d, l }; }
  shakeKick = Math.max(0, shakeKick - dt * 4);
  arms.update({
    dt, camera, moving: player.moving && player.speed > 0.3, running: player.running, crouch: player.crouch, speed: player.speed,
    lookDX: dYaw, lookDY: dPitch, flashOn: G.flashOn, flashK: fl, aimWorld: aimS, hitDist: hd, heat: G.drained ? 0.6 + 0.4 * (1 - G.battery) : 1 - G.battery,
    lamp: nearLamp ? { k: (1 - nearLamp.d / 9) * (nearLamp.l.light.intensity / 9), dir: new THREE.Vector3(player.pos.x - nearLamp.l.x, 0, player.pos.z - nearLamp.l.z).normalize() } : null,
    adapt, bright, using: inp.use, faceLit: G.attached.length > 0 || swarms.flyer.state === 'face', shake: G.attached.length ? Math.min(1, 0.3 + lookMag * 10 + shakeKick) : 0,
  });
  arms.lensWorld(camera, hd, lensW);
  flash.position.copy(lensW);
  flash.target.position.copy(aimS);
  // a wall right in front of you would go white: the beam is turned down the closer the wall is
  nearK += (beamNear(hd) - nearK) * Math.min(1, dt * 10);
  flash.intensity = G.flashOn ? FLASH_I * fl * nearK : 0;
  // what the bugs react to is the beam itself, not how much a close wall turned it down
  beamPow = G.flashOn ? FLASH_I * fl : 0;
  spill.position.copy(flash.position); spill.intensity = G.flashOn ? 0.2 * fl : 0;
  shaft.position.copy(flash.position);
  shaft.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), beamDir.subVectors(aimS, flash.position).normalize());
  shaft.material.uniforms.uK.value = G.flashOn ? 0.7 * fl : 0;
  shaft.visible = G.flashOn;
  // dark adaptation: builds up over ~7 s with the light off, gone almost at once when it comes on
  adapt = G.flashOn ? Math.max(0, adapt - dt / 0.6) : Math.min(1, adapt + dt / 7);
  nightEye.position.copy(camera.position);
  nightEye.intensity = bright ? 0 : Math.pow(adapt, 1.5) * NIGHT_K;
  bounce.position.copy(camera.position).addScaledVector(fwd, Math.min(hd * 0.75, 4.5));
  bounce.intensity = G.flashOn ? 2.2 * fl * Math.min(1, nearK * 1.6) : 0;
  dress.update(dt, camera.position, flash.position, beamDir.subVectors(flash.target.position, flash.position).normalize(), G.flashOn ? fl : 0, renderer.domElement.height * 1.2);
  silk.uniforms.uSpotPos.value.copy(flash.position);
  silk.uniforms.uSpotDir.value.copy(fwd);
  silk.uniforms.uOn.value = G.flashOn ? 0.55 * fl : 0;
  silk.uniforms.uAmb.value = bright ? 0.15 : 0;

  // ---- hiding: all the way under a table or a conveyor, light off, keeping still.
  // Hunters lose you and search round where you went; light, moving or the spray gives you away.
  G.revealT = Math.max(0, G.revealT - dt);
  const quiet = G.started && !G.dead && !G.won && !G.grab && !!player.inside && !G.flashOn && player.speed < 0.35 && G.revealT <= 0 && G.attached.length === 0;
  G.stillT = quiet ? (G.stillT || 0) + dt : 0;
  G.hidden = G.stillT > 0.6;          // a moment of keeping still first
  G.hiddenT = G.hidden ? G.hiddenT + dt : 0;
  if (player.inside && G.started) tip('불을 끄고 가만히 있자. 그럼 못 찾을 거야', 'hide');
  // ---- roaches
  const noise = !G.started || G.dead || G.hidden || !player.moving || player.speed < 0.3 ? 0 : player.crouch ? 1 : player.running ? 12 : 5;
  swarms.update({
    dt, t, camera, frozen: dev.freeze || !G.started,
    player: { pos: player.pos, noise, alive: !G.dead && !G.won, hidden: G.hidden, under: !!player.inside },
    flash: { on: beamPow > 20, pos: flash.position, dir: beamDir.subVectors(flash.target.position, flash.position).normalize() },
    lamps: lamps.map((l) => ({ x: l.x, z: l.z, on: l.on })),
    events: G.events, playerSafe: G.inSafe,
    onAttach,
    onFirstFlee: () => tip('바퀴들이 빛을 피한다', 'roachlight'),
    onEscape: (p, dur) => sfx.wingTakeoff(p.x, p.z, dur),
    onFirstWait: () => tip('빛 밖에서 기다리고 있다... 불을 돌리면 덮치겠지', 'roachwait'),
    onFirstHunt: () => tip('소리를 듣고 오는 건가... 몸을 낮추고 걷자', 'roachsound'),
    onFlyerLaunch: (p) => sfx.scareLaunch(p.x, p.y, p.z),
    onFlyerOff: () => { sfx.shakeOff(); sfx.roachDie(1); },
    onFlyerHit: () => {
      sfx.scareHit(); shakeScreen(); const h = $('#hit'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); },
  });
  // ---- spiders, webs, egg sacs, centipede
  const light = { on: beamPow > 20, pos: flash.position.clone(), dir: beamDir.clone() };
  const frozen = dev.freeze || !G.started;
  let safeLamp = null;
  for (const l of lamps) if (l.on && Math.hypot(player.pos.x - l.x, player.pos.z - l.z) < 4.2) safeLamp = { x: l.x, z: l.z, r: 4.2 };
  spiders.update({
    dt, cam: camera.position.clone(), camFwd: fwd.clone(), light, safe: !!safeLamp, frozen, playerPos: player.pos, alive: G.started && !G.dead && !G.won, god: dev.god, hidden: G.hidden,
    nav: swarms.nav, field: swarms.fPlayer,
    onWolfWake: (sp) => { const p = sp.s.root.position; sfx.spiderWake(p.x, p.y, p.z); tip('벽에서 거미가 내려온다! 빛을 비추면 물러나려나', 'wolfwake'); },
    onWolfLit: (sp) => { const p = sp.s.root.position; sfx.spiderFlinch(p.x, p.y, p.z); },
    onWake: (sp) => { const p = sp.s.root.position; sfx.creak(p.x, 3.6, p.z); sfx.centiHiss(p.x, p.z); tip('실을 건드렸다... 뭔가 깨어났다', 'tripwake'); },
    onCower: (sp) => { const p = sp.s.root.position; sfx.spiderFlinch(p.x, p.y, p.z); tip('빛을 비추니 움츠러든다', 'ghostlit'); },
    onThreadLit: () => tip('실이 쳐져 있다. 숙이고 지나가야겠다', 'trip'),
    onSacBurst: (p) => { brood.burst(p); sfx.sacDrop(p.x, p.z); sfx.eggBurst(p.x, 0.2, p.z); },
    onFirstLit: () => tip('위에서 뭔가 기다리고 있었다. 천장을 잘 봐야겠다', 'spiderlit'),
    onDrop: (sp) => sfx.creak(sp.s.root.position.x, sp.ceil - 0.3, sp.s.root.position.z),
    onCatch: (sp) => startGrab(sp),
    onWebLit: () => tip('거미줄이다. 스프레이로 녹일 수 있겠다', 'weblit'),
  });
  if (G.started && !G.dead && !G.grab) {
    const tr = spiders.threadAt(player.pos, camera.position.y + 0.12);
    if (tr) { spiders.snapThread(tr); sfx.threadSnap(player.pos.x, 1.4, player.pos.z); msg('실을 끊어 버렸다...'); }
    const w = spiders.webAt(player.pos);
    if (w) {
      spiders.hitWeb(w, player.pos);
      G.webSlowT = 3; G.events.push({ x: player.pos.x, z: player.pos.z, r: 8 });
      sfx.webTear(w.x, w.z); tip('거미줄이 떨린다... 거미가 온다', 'webhit');
    }
  }
  G.webSlowT = Math.max(0, G.webSlowT - dt);
  if (G.started && !G.dead) {
    if (noise >= 12) eggs.hear(player.pos.x, player.pos.z, noise) && sfx.eggBurst(-7.6, 4, 62.6);
    for (const e of G.events) if (eggs.hear(e.x, e.z, e.r)) sfx.eggBurst(-7.6, 4, 62.6);
    if (!G.eggTip && eggs.nearestSac(player.pos) < 6 && !eggs.burstDone) { G.eggTip = true; tip('알집이다... 소리 내지 말자', 'eggs'); }
  }
  const lingInfo = eggs.update({
    dt, player: { pos: player.pos }, nav: swarms.nav, field: swarms.fPlayer, light, frozen, hidden: G.hidden,
    onTouch: () => {
      if (dev.god) return;
      G.lingSlow = Math.min(0.4, G.lingSlow + 0.1); G.lingT = 0;
      sfx.burst && sfx.ctx && sfx.burst({ dur: 0.12, f: 3800, q: 1, gain: 0.3 });
      tip('새끼들은 스프레이 한 번이면 쓸려 나가겠다', 'lings');
    },
  });
  const broodInfo = brood.update({ dt, player: { pos: player.pos }, nav: swarms.nav, frozen });
  G.lingT += dt;
  if (G.lingT > 2.5) G.lingSlow = Math.max(0, G.lingSlow - dt * 0.06);
  centi.update({
    dt, player: { pos: player.pos, noise, alive: G.started && !G.dead && !G.won && !dev.god, hidden: G.hidden }, cam: camera.position.clone(),
    light, nav: swarms.nav, field: swarms.fPlayer, events: G.events, safe: safeLamp, frozen,
    onBurst: () => { sfx.ventBurst(15, 69.7); shakeScreen(); const h = $('#hit'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); },
    onLunge: () => sfx.centiScreech(centi.head.x, centi.head.z),
    onStun: (hits, hold) => {
      sfx.centiHiss(centi.head.x, centi.head.z);
      tip('지네가 빛에 움찔한다', 'centilight');
      if (hold < 2) tip('빛에 점점 익숙해지는 것 같다...', 'centiadapt');
    },
    onCatch: () => die(G.lingSlow > 0.15 ? '실험실에 들어가기 전에 스프레이를 남겨 뒀어야 했다' : '전등 불빛 안으로 도망쳤어야 했다'),
  });
  G.events.length = 0;

  // grabbed: the meter drains; keep it up for 2 s
  if (G.grab && !G.dead) {
    const gr = G.grab;
    gr.t += dt; gr.meter -= dt * 0.42;
    $('#grab .bar i').style.width = `${Math.max(0, gr.meter) * 100}%`;
    if (gr.meter <= 0) die('붙잡혔을 때 스프레이를 썼어야 했다');
    else if (gr.t >= 2) endGrab(false);
  }
  G.sprayCd = Math.max(0, G.sprayCd - dt);
  if (G.mistIn > 0) { G.mistIn -= dt; if (G.mistIn <= 0) mist.emit(arms.nozzleWorld(camera, new THREE.Vector3()), G.mistDir); }
  mist.update(dt, 0.08 + (G.flashOn ? 0.55 * fl : 0) + (bright ? 0.6 : 0), renderer.domElement.height * 1.4);

  // ---- sound
  if (G.started && !G.dead && player.crouch !== prevCrouch) { prevCrouch = player.crouch; sfx.rustle(player.crouch); }
  if (G.started && !G.won && player.moving && player.speed > 0.3) {
    stepAcc += player.speed * dt;
    const stride = player.running ? 1.0 : player.crouch ? 0.55 : 0.78;
    if (stepAcc > stride) { stepAcc = 0; stepSide = !stepSide; sfx.step(player.running ? 'run' : player.crouch ? 'crouch' : 'walk', stepSide); }
  }
  const ai = swarms.audioInfo(player.pos);
  let inten = 0;
  for (const w of ai.swarms) if (w.hunt) inten = Math.max(inten, 1 - w.d / 14);
  if (G.attached.length) inten = Math.max(inten, 0.8 + G.attached.length * 0.07);
  const fly = swarms.flyer;
  if (fly.state === 'fly' || fly.state === 'face') { inten = 1; sfx.flyerAt(fly.pos.x, fly.pos.y, fly.pos.z); }
  if (centi.active) { const dC = Math.hypot(centi.head.x - player.pos.x, centi.head.z - player.pos.z); if (centi.state === 'chase') inten = Math.max(inten, 0.65, 1 - dC / 20); }
  if (G.grab) inten = 1;
  // hidden: everything hushes but your heart, which speeds up as something searches closer
  let searchD = 99;
  for (const w of ai.swarms) if (w.search && w.n) searchD = Math.min(searchD, w.d);
  if (centi.state === 'search') searchD = Math.min(searchD, Math.hypot(centi.head.x - player.pos.x, centi.head.z - player.pos.z));
  for (const q of spiders.searchers()) searchD = Math.min(searchD, Math.hypot(q.x - player.pos.x, q.z - player.pos.z));
  if (eggs.lost && lingInfo.moving) searchD = Math.min(searchD, Math.hypot(eggs.lost.x - player.pos.x, eggs.lost.z - player.pos.z));
  const searchK = G.hidden ? Math.max(0, Math.min(1, 1 - (searchD - 1) / 6)) : 0;
  if (G.hidden) inten = Math.max(inten * 0.6, searchK * 0.9);
  // being chased with somewhere to hide close by
  if (inten > 0.6 && !player.under && !G.tipped.hideHint && hideSpots.some((c) => Math.max(c.x0 - player.pos.x, 0, player.pos.x - c.x1) + Math.max(c.z0 - player.pos.z, 0, player.pos.z - c.z1) < 6)) {
    G.tipped.hideHint = true; tip('테이블이나 컨베이어 밑에 기어 들어가 숨자', 'hidehint');
  }
  if (spiders.ghostInfo()) inten = Math.max(inten, 0.8);
  if (lingInfo.moving) inten = Math.max(inten, 0.7);
  if (broodInfo.moving > 4) inten = Math.max(inten, 0.4);
  sfx.update({ dt, camera, swarms: ai.swarms, near: ai.near, attached: G.attached.length, intensity: G.started ? Math.max(0, Math.min(1, inten)) : 0, pounce: ai.pounce,
    centi: centi.active ? { x: centi.head.x, z: centi.head.z, speed: centi.speed } : null, lings: lingInfo, ghost: spiders.ghostInfo(),
    brood: broodInfo, hush: G.hidden,
    emit: G.started ? ai.emit.concat(lingInfo.emit || [], broodInfo.emit, spiders.emitters(player.pos)) : [] });
  if (G.started && !G.scared && !dev.freeze && Math.hypot(player.pos.x - nests[0].x, player.pos.z - nests[0].z) < 7.5) { G.scared = true; swarms.jumpScare(camera, 0); }
  for (const a of G.attached) a.age += dt;
  // roaches on you: no damage, but they slow you down and crawl over your face until shaken off
  player.slowMul = Math.max(0.3, Math.max(0.4, 1 - 0.22 * G.attached.length) * (1 - G.lingSlow) * (G.webSlowT > 0 ? 0.5 : 1));
  if (G.attached.length) {
    const a = G.attached[0];
    if (lookSign && lookSign !== a.lastSign) { a.rev++; a.lastSign = lookSign; }
    a.shake += lookMag;
    if ((a.shake > 0.9 && a.rev >= 3) || a.taps >= 4) { G.attached.shift(); swarms.throwDead(a.r, player.pos, player.yaw); msg('떼어냈다!'); sfx.shakeOff(); sfx.roachDie(1); if (G.attached[0]) { G.attached[0].shake = 0; G.attached[0].rev = 0; G.attached[0].taps = 0; } }
  }
  swarms.showAttached(camera, G.attached, dt, t);
  { const on = G.attached.length > 0 || swarms.flyer.state === 'face', k = on ? (G.flashOn ? 0.3 : 0.22) : 0; swarms.faceAmb += (k - swarms.faceAmb) * Math.min(1, dt * 6); }
  $('#crawl').classList.toggle('show', G.attached.length > 0);
  $('#crawl').style.setProperty('--n', G.attached.length);
  $('#bShake').classList.toggle('show', G.attached.length > 0);

  // ---- lamps (safe zones)
  G.inSafe = false;
  for (const l of lamps) {
    const d = Math.hypot(player.pos.x - l.x, player.pos.z - l.z);
    if (!G.lampSeen && d < 7 && !l.on) { G.lampSeen = true; tip('전등 아래는 안전하다. 오래가진 않겠지만', 'lamp'); }
    if (l.on) {
      l.t += dt;
      const left = 20 - l.t;
      const f = left < 5 ? (Math.sin(t * (18 + (5 - left) * 6)) > -0.2 ? 1 : 0.15) : 1;
      l.light.intensity = 9 * f;
      sfx.lampLevel(l.x, l.z, f);
      l.bulb.material.emissiveIntensity = 3 * f;
      if (d < 4.2) G.inSafe = true;
      if (l.t >= 20) { sfx.lampPop(l.x, l.z); l.on = false; l.burnt = true; l.light.intensity = 0; l.bulb.material.emissive.set(0x40220e); l.bulb.material.emissiveIntensity = 0.4; msg('전구가 나갔다...'); }
    }
  }
  $('#safe').classList.toggle('show', G.inSafe);
  // under a table: are you hidden, or giving yourself away?
  const hideEl = $('#hide');
  const hideTxt = !player.inside || !G.started || G.dead ? '' : G.hidden ? '숨을 죽인다...' : G.flashOn ? '불빛 때문에 들키겠다' : G.revealT > 0 ? '스프레이 소리에 들켰다' : player.speed >= 0.35 ? '움직이면 들킨다' : '';
  hideEl.classList.toggle('show', !!hideTxt); hideEl.classList.toggle('on', G.hidden);
  if (hideTxt && hideEl.dataset.t !== hideTxt) { hideEl.dataset.t = hideTxt; hideEl.querySelector('span').textContent = hideTxt; }

  // ---- red emergency lights
  for (const [room, r] of Object.entries(reds)) {
    const target = r.on ? 7 * (0.85 + 0.15 * Math.sin(t * 2.1 + room.length)) : 0;
    r.light.intensity += (target - r.light.intensity) * (1 - Math.exp(-dt * 3));
    r.fixture.material.emissiveIntensity = r.on ? 4 : 0;
    if (r.on && roomAt(player.pos.x, player.pos.z) === room) tip('붉은 비상등으로는 벌레를 못 막는다', 'red');
  }
  for (const g of genMeshes) if (g.on) g.g.position.y = 0.006 * Math.sin(t * 90);

  // ---- doors
  if (G.emergencyOpening && G.emergency < 1) { G.emergency = Math.min(1, G.emergency + dt / 1.6); emDoor.position.x = -15.5 - 3 * G.emergency; if (G.emergency > 0.7) emCol.off = true; }
  if (G.shutterOpening && G.shutter < 1) {
    G.shutter = Math.min(1, G.shutter + dt / 3.2);
    shutter.position.y = 4.4 * G.shutter + 0.01 * Math.sin(t * 40) * (1 - G.shutter);
    dawn.intensity = 6 * G.shutter;
    if (G.shutter > 0.55) shCol.off = true;
  }
  shutterGlow.color.set(G.gens === 3 ? 0x30ff60 : 0xff2010);
  if (!G.won && G.shutter > 0.55 && player.pos.z < -1.0) {
    G.won = true; G.timing = false; sfx.win();
    $('#winTime').textContent = fmt(G.time);
    $('#win').classList.add('show');
    if (document.pointerLockElement) document.exitPointerLock();
  }

  // ---- interaction
  const target = G.started && !G.won ? findTarget() : null;
  let prompt = '';
  const pressed = inp.usePressed || (inp.use && !prevUse);
  prevUse = inp.use; input.usePressed = false;
  if (target) {
    const o = target.obj;
    if (target.kind === 'gen') {
      if (o.on) prompt = '발전기 가동 중';
      else {
        prompt = `${useLabel()} 꾹 누르기 · 발전기 켜기`;
        if (inp.use) { G.holdT += dt; if (G.holdT >= 3) { G.holdT = 0; genOn(o); } } else G.holdT = 0;
      }
    } else if (target.kind === 'lamp') {
      prompt = o.burnt ? '전구가 터져서 다시 켤 수 없다' : o.on ? `전등이 켜져 있다 (${Math.ceil(20 - o.t)}초)` : `${useLabel()} · 전등 레버 당기기`;
      if (pressed && !o.on && !o.burnt) {
        o.on = true; o.t = 0; o.leverPivot.rotation.z = -0.6; sfx.lampOn(o.x, o.z);
        if (G.checkpoint !== o) { G.checkpoint = o; msg('불을 켰다. 무슨 일이 생기면 여기로 돌아오자'); }
      }
    } else if (target.kind === 'note') {
      prompt = `${useLabel()} · 일지 읽기`;
      if (pressed) { o.read = true; o.m.visible = false; note(o.text); sfx.paper(); }
    } else if (target.kind === 'refill') {
      prompt = `${useLabel()} · 스프레이 리필 줍기`;
      if (pressed) { refill.taken = true; refill.m.visible = false; G.spray += 2; sfx.canRattle(); msg('스프레이를 주웠다 (+2)'); }
    }
  } else G.holdT = 0;
  promptEl.classList.toggle('show', !!prompt);
  if (prompt) { $('#prompt span').textContent = prompt; barEl.style.width = `${(G.holdT / 3) * 100}%`; }
  $('#prompt .bar').style.opacity = G.holdT > 0 ? 1 : 0;

  // ---- HUD
  $('#stamina').style.opacity = player.stamina < 0.999 ? 1 : 0;
  $('#stamina i').style.width = `${player.stamina * 100}%`;
  $('#stamina').classList.toggle('tired', player.exhausted);
  $('#spray b').textContent = G.spray;
  if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) updateHud();
  if (showMap) drawMap();
  if (dev.info && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
    fpsN++;
    $('#devinfo').textContent = `FPS ${Math.round(1 / Math.max(1e-3, fpsAvg))}  위치 ${player.pos.x.toFixed(1)}, ${player.pos.z.toFixed(1)}  방 ${(ROOMS[roomAt(player.pos.x, player.pos.z)] || {}).name || '-'}\n체력 ${G.hp}/3  열 ${Math.round((1 - G.battery) * 100)}%${G.drained ? ' 과열' : ''}  소음 반경 ${noise}m  붙은 바퀴 ${G.attached.length}\n숨기 ${G.hidden ? '숨음' : player.inside ? '들킴' : '-'}  바퀴 떼 ${swarms.states().map((x, i) => `${i + 1}:${({ hide: '숨음', hunt: '추적', search: '수색', return: '복귀' })[x]}`).join('  ')}\n거미 ${spiders.states().join(' / ')}  지네 ${centi.info()}  알집 ${eggs.burstDone ? '터짐' : '그대로'}  느려짐 ${Math.round((1 - player.slowMul) * 100)}%`;
  }
  fpsAvg += (dt - fpsAvg) * 0.05;
  if (window.__NORENDER) return;
  renderer.render(scene, camera);
  arms.render(renderer, camera);
}
let fpsAvg = 1 / 60, fpsN = 0;

// ------------------------------------------------------------------ fullscreen
const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const standalone = matchMedia('(display-mode: fullscreen)').matches || matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
const fsEl = () => document.fullscreenElement || document.webkitFullscreenElement || null;
const fsOK = () => !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
function enterFullscreen() {
  const d = document.documentElement;
  let req = null;
  try { req = d.requestFullscreen ? d.requestFullscreen({ navigationUI: 'hide' }) : d.webkitRequestFullscreen ? d.webkitRequestFullscreen() : null; } catch (e) { return Promise.reject(e); }
  return Promise.resolve(req).then(() => {
    // phones: hold the screen sideways while in fullscreen (Android); the rotate prompt covers the rest
    try { const p = screen.orientation && screen.orientation.lock && screen.orientation.lock('landscape'); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not supported */ }
  });
}
function exitFullscreen() { const f = document.exitFullscreen || document.webkitExitFullscreen; if (f) f.call(document); }
function toggleFullscreen() {
  if (standalone) { msg('이미 전체화면이에요'); return; }
  if (!fsOK()) { msg(isIOS ? '아이폰은 Safari에서 홈 화면에 추가해야 전체화면이 돼요' : '여기서는 전체화면이 막혀 있어요. 브라우저에서 직접 열어 주세요'); return; }
  if (fsEl()) exitFullscreen();
  else enterFullscreen().catch(() => msg('전체화면을 열 수 없어요. 브라우저에서 직접 열어 주세요'));
}
function syncFs() {
  const on = !!fsEl() || standalone;
  document.querySelectorAll('[data-act="fs"]').forEach((b) => { b.classList.toggle('on', on); b.textContent = on ? '창 모드' : '전체화면'; });
  if (standalone) document.querySelectorAll('[data-act="fs"]').forEach((b) => { b.style.display = 'none'; });
}
document.addEventListener('fullscreenchange', syncFs);
// sound needs a first tap or key press before the browser lets it play
addEventListener('pointerdown', () => sfx.start(), { once: true, capture: true });
addEventListener('keydown', () => sfx.start(), { once: true, capture: true });
document.querySelectorAll('[data-act="snd"]').forEach((b) => b.addEventListener('click', (e) => {
  e.stopPropagation(); sfx.start(); sfx.setMuted(!sfx.muted);
  document.querySelectorAll('[data-act="snd"]').forEach((x) => { x.classList.toggle('on', !sfx.muted); x.textContent = sfx.muted ? '소리 꺼짐' : '소리'; });
}));
document.addEventListener('webkitfullscreenchange', syncFs);
document.querySelectorAll('[data-act="fs"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); }));
syncFs();
// iPhone Safari has no fullscreen for pages: point to Add to Home Screen instead
if (isIOS && !fsOK() && !standalone) $('#iosHint').classList.add('show');

// ------------------------------------------------------------------ start / win
G.started = false;
resetGame();
$('#startBtn').addEventListener('click', () => {
  sfx.start();
  if (touch && fsOK() && !fsEl() && !standalone) enterFullscreen().catch(() => {});
  G.started = true;
  $('#start').classList.add('hide');
  if (!touch) { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
  setTimeout(() => tip(touch ? '너무 어둡다. 손전등을 켜자 (손전등 버튼)' : '너무 어둡다. 손전등을 켜자 (좌클릭)', 'start'), 1200);
});
$('#againBtn').addEventListener('click', () => {
  sfx.start();
  resetGame(); G.started = true;
  if (!touch) { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
});

// ------------------------------------------------------------------ landscape on phones
let needRotate = false;
function checkOrient() { needRotate = touch && innerHeight > innerWidth; $('#rotate').classList.toggle('show', needRotate); }
addEventListener('resize', checkOrient);
addEventListener('orientationchange', () => setTimeout(checkOrient, 200));
checkOrient();
$('#bShake').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (G.attached[0]) G.attached[0].taps++; shakeKick = 1; });

// ------------------------------------------------------------------ developer mode
const TP = {
  dock: [0, 3, 0, 0], ware: [0, 11.5, 0, 0], machine: [17.4, 15.5, 2.65, -0.15], corridor: [18.5, 22.5, 0, 0.1], hall: [18.5, 48, -0.7, 0.15],
  lab: [-7.4, 57.5, -Math.PI / 2, 0], pass: [-15.5, 49.5, Math.PI, 0], shutter: [0, 4.5, Math.PI, 0.1],
  roach0: [-6.4, 12.6, 0, -0.25], roach1: [5.5, 24.2, 0, -0.25], roach2: [19.0, 17.6, -2.0, -0.3], roach3: [-15.5, 39.2, Math.PI, -0.25],
  ghost: [18.5, 26.5, 0, 0.55], wolf: [12, 51, 0, 0.75], centi: [15, 64.5, 0, 0.0], eggs: [-10.2, 59.6, -0.85, 0.65],
};
const devPanel = $('#dev');
function toggleDev() { devPanel.classList.toggle('show'); document.querySelectorAll('[data-act="dev"]').forEach((b) => b.classList.toggle('on', devPanel.classList.contains('show'))); if (devPanel.classList.contains('show') && document.pointerLockElement) document.exitPointerLock(); }
document.querySelectorAll('[data-act="dev"]').forEach((b) => b.addEventListener('click', toggleDev));
addEventListener('keydown', (e) => { if (e.code === 'Backquote') toggleDev(); });
devPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
devPanel.querySelectorAll('[data-tp]').forEach((b) => b.addEventListener('click', () => {
  const [x, z, yaw, pitch] = TP[b.dataset.tp];
  if (!G.started) { G.started = true; $('#start').classList.add('hide'); }
  player.place(x, z, yaw); player.pitch = pitch;
}));
const devSet = (k, v) => {
  dev[k] = v;
  if (k === 'noclip') player.noclip = v;
  if (k === 'fast') player.speedMul = v ? 2 : 1;
  if (k === 'info') $('#devinfo').classList.toggle('show', v);
  devPanel.querySelector(`[data-dev="${k}"]`)?.classList.toggle('on', v);
};
devPanel.querySelectorAll('[data-dev]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.dev;
  if (k === 'bright') { toggleBright(); b.classList.toggle('on', bright); return; }
  if (k === 'marks') { markers.visible = !markers.visible; b.classList.toggle('on', markers.visible); document.querySelectorAll('[data-act="marks"]').forEach((x) => x.classList.toggle('on', markers.visible)); return; }
  devSet(k, !dev[k]);
}));
devPanel.querySelectorAll('[data-do]').forEach((b) => b.addEventListener('click', () => {
  const k = b.dataset.do;
  if (!G.started) { G.started = true; $('#start').classList.add('hide'); }
  if (k === 'call') { swarms.alertNearest(player.pos.clone()); msg('가장 가까운 바퀴 떼가 온다'); }
  if (k === 'scare') swarms.jumpScare(camera);
  if (k === 'attach') { const r = swarms.roaches.find((x) => x.state !== 'off' && x.state !== 'attached' && x.sw >= 0); if (r) { const god = dev.god; dev.god = false; if (onAttach(r)) { r.state = 'attached'; swarms.hide(r); } dev.god = god; } }
  if (k === 'gens') genMeshes.forEach((g) => { if (!g.on) genOn(g); });
  if (k === 'drop') spiders.dropNow(camera.position.clone());
  if (k === 'eggs' && eggs.burst()) sfx.eggBurst(-7.6, 4, 62.6);
  if (k === 'brood') { const f = new THREE.Vector3(Math.sin(player.yaw), 0, Math.cos(player.yaw)); const p = new THREE.Vector3(player.pos.x + f.x * 2.5, 0, player.pos.z + f.z * 2.5); brood.burst(p); sfx.eggBurst(p.x, 0.2, p.z); }
  if (k === 'centi') { if (!centi.wake()) msg('지네는 이미 깨어 있다'); }
  if (k === 'centichase') { centi.enrage(player.pos); msg('지네가 당신을 쫓는다'); }
  if (k === 'sprayfill') { G.spray += 3; updateHud(); }
  if (k === 'restart') { resetGame(); G.started = true; }
}));

window.__M = {
  player, G, camera, lamps, genMeshes, colliders, swarms, dev, devSet, hurt, nests, spiders, eggs, brood, centi, useSpray, mashGrab, resetGame, toggleBright,
  arms, sfx, scene, flashLight: flash, setAdapt(v) { adapt = v; }, get adapt() { return adapt; },
  renderInfo() { const i = renderer.info; i.autoReset = false; i.reset(); frame(1 / 30); const o = { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; i.autoReset = true; return o; },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); },
  start() { G.started = true; $('#start').classList.add('hide'); },
  setInput(o) { override = o ? Object.assign({ mx: 0, mz: 0, run: false, crouch: false, lookX: 0, lookY: 0, use: false, usePressed: false }, o) : null; },
  teleport(x, z, yaw, pitch = 0) { player.place(x, z, yaw); player.pitch = pitch; },
  flash(on) { if (G.flashOn !== on) toggleFlash(); },
  bright(on) { if (bright !== on) toggleBright(); },
  map(on) { if (showMap !== on) toggleMap(); },
};
$('#loading').classList.add('done');
if (TEST) window.__READY = true;
else renderer.setAnimationLoop(() => frame());
