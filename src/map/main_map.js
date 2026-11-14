import * as THREE from 'three';
import * as TX from '../textures.js';
import { buildLevel, buildBugMarkers, ROOMS, DOORS, SPOTS, greyMat, boxGeom } from './level.js';
import { Player } from './player.js';
import { makeSilkMaterial, makeDoorWeb } from '../silk.js';
import { RoachSwarms } from './roachswarm.js';

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
renderer.toneMappingExposure = 1.15;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('#app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.05);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 140);

// ------------------------------------------------------------------ level
const { group: levelGroup, colliders, labels: roomLabels } = buildLevel(scene);
const markers = buildBugMarkers(scene);
const nests = SPOTS.bugs.filter((b) => b.kind === 'roach').map((b, i) => ({ x: b.x, z: b.z, count: [12, 10, 9, 8][i] || 8, spread: 1.0 }));
const swarms = new RoachSwarms(scene, nests, colliders, TX.makeContactShadow(128));
const silk = makeSilkMaterial();
{
  const web = makeDoorWeb(0.1, 1.9, 0, 1.95, 3.95, silk);
  web.position.set(18.5, 0, 38);
  web.frustumCulled = false;
  scene.add(web);
}

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
const cookie = TX.makeCookie(256);
const flash = new THREE.SpotLight(0xffeedd, 0, 0, 0.5, 0.5, 2);
flash.castShadow = true;
flash.shadow.mapSize.set(touch ? 512 : 1024, touch ? 512 : 1024);
flash.shadow.bias = -0.0004; flash.shadow.normalBias = 0.03;
flash.shadow.camera.near = 0.2; flash.shadow.camera.far = 40;
flash.map = cookie;
scene.add(flash, flash.target);
// spill: the soft halo around a real flashlight beam that lights things right in front of you
const spill = new THREE.PointLight(0xffeedd, 0, 1.8, 2);
scene.add(spill);
const bounce = new THREE.PointLight(0xffd8b0, 0, 8, 1.6);
scene.add(bounce);

const lampMat = () => new THREE.MeshStandardMaterial({ color: 0x2a2620, emissive: new THREE.Color(0xffa24a), emissiveIntensity: 0, roughness: 0.4 });
const lamps = SPOTS.lamps.map((s, i) => {
  const g = new THREE.Group();
  g.position.set(s.x, 0, s.z);
  const pole = new THREE.Mesh(boxGeom(0.12, 2.8, 0.12, 0, 1.4, 0), greyMat('#7d7a74'));
  const arm = new THREE.Mesh(boxGeom(0.7, 0.08, 0.08, 0.3, 2.78, 0), greyMat('#7d7a74'));
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
  const body = new THREE.Mesh(boxGeom(1.6, 1.3, 1.1, 0, 0.65, 0), greyMat('#8a7a5e'));
  const drum = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 1.3, 20).rotateZ(Math.PI / 2).translate(0, 1.0, 0), greyMat('#6f6a60'));
  const panel = new THREE.Mesh(boxGeom(0.6, 0.4, 0.05, 0.3, 0.75, 0.57), greyMat('#55524c'));
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
const emDoor = new THREE.Mesh(boxGeom(3, 3, 0.18, 0, 1.5, 0), greyMat('#6e6258'));
emDoor.position.set(-15.5, 0, 52);
emDoor.castShadow = emDoor.receiveShadow = true;
scene.add(emDoor);
const emCol = { x0: -17, x1: -14, z0: 51.8, z1: 52.2 };
colliders.push(emCol);
const shutter = new THREE.Mesh(boxGeom(5.0, 4.5, 0.16, 0, 2.25, 0), greyMat('#7a7974'));
shutter.position.set(0, 0, 0.2);
shutter.castShadow = shutter.receiveShadow = true;
scene.add(shutter);
const shCol = { x0: -2.6, x1: 2.6, z0: 0.05, z1: 0.35 };
colliders.push(shCol);
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
  Object.assign(G, {
    battery: 1, flashOn: false, locked: false, holdT: 0, holdKey: null, shutter: 0, shutterOpening: false,
    emergency: 0, emergencyOpening: false, time: 0, timing: false, won: false, gens: 0, spray: 3, inSafe: false,
    tipped: {}, lampSeen: false, hp: 3, dead: false, attached: [], scared: false, events: [],
  });
  swarms.reset();
  $('#crawl').classList.remove('show'); $('#dead').classList.remove('show'); $('#hurt').style.opacity = 0;
  player.place(SPOTS.start.x, SPOTS.start.z, SPOTS.start.yaw);
  for (const l of lamps) { l.on = false; l.burnt = false; l.t = 0; l.light.intensity = 0; l.bulb.material.emissiveIntensity = 0; l.leverPivot.rotation.z = 0.6; }
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
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
const el = renderer.domElement;
el.addEventListener('click', () => {
  if (touch || !G.started) return;
  if (!locked) { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (err) { /* drag to look instead */ } }
  else toggleFlash();
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === el; });
let drag = null;
el.addEventListener('mousedown', (e) => { if (!locked && !touch) drag = { x: e.clientX, y: e.clientY }; });
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

// ------------------------------------------------------------------ actions
function toggleFlash() {
  if (!G.started) return;
  if (G.locked) { tip('배터리가 바닥났다. 잠시 기다려라', 'empty'); return; }
  G.flashOn = !G.flashOn;
  $('#bFlash').classList.toggle('on', G.flashOn);
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
  msg(`발전기 ${G.gens}/3 가동`);
  tip('발전기 소리가 벌레를 부른다', 'gen');
  if (g.room === 'lab') { G.emergencyOpening = true; setTimeout(() => msg('비상 통로가 열렸다'), 1400); }
  if (G.gens === 3) { G.shutterOpening = true; setTimeout(() => msg('셔터가 열린다. 하역장으로!'), 2800); }
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
function hurt() {
  if (dev.god || G.dead) return;
  G.hp--;
  const f = $('#hit'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  $('#hurt').style.opacity = (3 - G.hp) * 0.28;
  if (G.hp <= 0) die('달리는 소리가 바퀴를 부른다');
}
function die(deathTip) {
  G.dead = true; G.timing = false;
  G.attached.length = 0;
  $('#crawl').classList.remove('show');
  $('#dead').classList.add('show');
  $('#dead .s').textContent = '';
  setTimeout(() => { $('#dead .s').textContent = deathTip; }, 1600);
  setTimeout(() => { resetGame(); G.started = true; }, 3800);
}
function onAttach(r) {
  if (dev.god || G.dead || G.attached.length >= 3) return false;
  G.attached.push({ r, t: 1.5, shake: 0, rev: 0, lastSign: 0, taps: 0 });
  tip(touch ? '털기 버튼을 연타해 털어내라' : '마우스를 흔들어 털어내라', 'attach');
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
  for (const l of lamps) { mctx.fillStyle = l.burnt ? '#5a4a3a' : l.on ? '#ffb24a' : '#a07a40'; mctx.fillRect(X(l.x) - 2.5, Y(l.z) - 2.5, 5, 5); }
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
  if (G.started && !G.won && !G.dead) player.update(dt, inp);
  input.lookX = 0; input.lookY = 0;
  if (dev.battery) G.battery = 1;
  if (player.moved && !G.timing && !G.won) G.timing = true;
  if (G.timing) G.time += dt;

  // ---- flashlight + battery
  if (G.flashOn) G.battery -= dt / 30;
  else G.battery += dt * 0.02 * (G.inSafe ? 2 : 1);
  G.battery = Math.min(1, G.battery);
  if (G.battery <= 0) { G.battery = 0; G.flashOn = false; G.locked = true; $('#bFlash').classList.remove('on'); }
  if (G.locked && G.battery >= 0.15) G.locked = false;
  if (G.flashOn && G.battery < 0.2) tip('손전등을 끄면 배터리가 충전된다', 'battery');
  flickT -= dt;
  if (flickT < 0) { flickT = 5 + Math.random() * 8; flick = 0; }
  flick = Math.min(1, flick + dt * (flick < 0.5 ? 6 : 2));
  let fl = flick < 1 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 60)) : 1;
  if (G.battery < 0.2) fl *= (0.45 + G.battery * 2.5) * (Math.random() < 0.06 ? 0.15 : 1);
  player.forward(fwd);
  ray.set(camera.position, fwd);
  const hit = ray.intersectObjects(levelMeshes, false)[0];
  aim.copy(hit ? hit.point : camera.position.clone().addScaledVector(fwd, 12));
  aimS.lerp(aim, 1 - Math.exp(-dt * 14));
  const off = new THREE.Vector3(0.18, -0.16, 0).applyQuaternion(camera.quaternion);
  flash.position.copy(camera.position).add(off);
  flash.target.position.copy(aimS);
  flash.intensity = G.flashOn ? 115 * fl : 0;
  spill.position.copy(flash.position); spill.intensity = G.flashOn ? 0.2 * fl : 0;
  const hd = hit ? hit.distance : 12;
  bounce.position.copy(camera.position).addScaledVector(fwd, Math.min(hd * 0.75, 4.5));
  bounce.intensity = G.flashOn ? 2.2 * fl : 0;
  silk.uniforms.uSpotPos.value.copy(flash.position);
  silk.uniforms.uSpotDir.value.copy(fwd);
  silk.uniforms.uOn.value = G.flashOn ? 0.55 * fl : 0;
  silk.uniforms.uAmb.value = bright ? 0.15 : 0;

  // ---- roaches
  const noise = !G.started || G.dead || !player.moving || player.speed < 0.3 ? 0 : player.crouch ? 1 : player.running ? 12 : 5;
  swarms.update({
    dt, t, camera, frozen: dev.freeze || !G.started,
    player: { pos: player.pos, noise, alive: !G.dead && !G.won },
    flash: { on: G.flashOn && flash.intensity > 20, pos: flash.position, dir: fwd },
    lamps: lamps.map((l) => ({ x: l.x, z: l.z, on: l.on })),
    events: G.events,
    onAttach,
    onFirstFlee: () => tip('바퀴는 빛을 싫어한다', 'roachlight'),
    onFirstHunt: () => tip('바퀴는 소리를 따라온다. 앉아서 걸어라', 'roachsound'),
    onFlyerHit: () => { shakeScreen(); const h = $('#hit'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); },
  });
  G.events.length = 0;
  if (G.started && !G.scared && !dev.freeze && Math.hypot(player.pos.x - nests[0].x, player.pos.z - nests[0].z) < 7.5) { G.scared = true; swarms.jumpScare(camera, 0); }
  if (G.attached.length) {
    const a = G.attached[0];
    a.t -= dt;
    if (lookSign && lookSign !== a.lastSign) { a.rev++; a.lastSign = lookSign; }
    a.shake += lookMag;
    if ((a.shake > 0.9 && a.rev >= 3) || a.taps >= 4) { G.attached.shift(); swarms.drop(a.r, player.pos, player.pos); msg('털어냈다'); }
    else if (a.t <= 0) { G.attached.shift(); swarms.drop(a.r, player.pos, player.pos); hurt(); }
  }
  swarms.showAttached(camera, G.attached, dt, t);
  $('#crawl').classList.toggle('show', G.attached.length > 0);
  $('#bShake').classList.toggle('show', G.attached.length > 0);

  // ---- lamps (safe zones)
  G.inSafe = false;
  for (const l of lamps) {
    const d = Math.hypot(player.pos.x - l.x, player.pos.z - l.z);
    if (!G.lampSeen && d < 7 && !l.on) { G.lampSeen = true; tip('전등 아래는 안전하다. 하지만 오래가지 않는다', 'lamp'); }
    if (l.on) {
      l.t += dt;
      const left = 20 - l.t;
      const f = left < 5 ? (Math.sin(t * (18 + (5 - left) * 6)) > -0.2 ? 1 : 0.15) : 1;
      l.light.intensity = 9 * f;
      l.bulb.material.emissiveIntensity = 3 * f;
      if (d < 4.2) G.inSafe = true;
      if (l.t >= 20) { l.on = false; l.burnt = true; l.light.intensity = 0; l.bulb.material.emissive.set(0x40220e); l.bulb.material.emissiveIntensity = 0.4; msg('전구가 터졌다'); }
    }
  }
  $('#safe').classList.toggle('show', G.inSafe);

  // ---- red emergency lights
  for (const [room, r] of Object.entries(reds)) {
    const target = r.on ? 7 * (0.85 + 0.15 * Math.sin(t * 2.1 + room.length)) : 0;
    r.light.intensity += (target - r.light.intensity) * (1 - Math.exp(-dt * 3));
    r.fixture.material.emissiveIntensity = r.on ? 4 : 0;
    if (r.on && roomAt(player.pos.x, player.pos.z) === room) tip('붉은 빛은 벌레를 막지 못한다', 'red');
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
    G.won = true; G.timing = false;
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
      if (pressed && !o.on && !o.burnt) { o.on = true; o.t = 0; o.leverPivot.rotation.z = -0.6; }
    } else if (target.kind === 'note') {
      prompt = `${useLabel()} · 일지 읽기`;
      if (pressed) { o.read = true; o.m.visible = false; note(o.text); }
    } else if (target.kind === 'refill') {
      prompt = `${useLabel()} · 스프레이 리필 줍기`;
      if (pressed) { refill.taken = true; refill.m.visible = false; G.spray += 2; msg('스프레이 +2회'); }
    }
  } else G.holdT = 0;
  promptEl.classList.toggle('show', !!prompt);
  if (prompt) { $('#prompt span').textContent = prompt; barEl.style.width = `${(G.holdT / 3) * 100}%`; }
  $('#prompt .bar').style.opacity = G.holdT > 0 ? 1 : 0;

  // ---- HUD
  const segs = G.battery > 0.66 ? 3 : G.battery > 0.33 ? 2 : G.battery > 0 ? 1 : 0;
  document.querySelectorAll('#battery i').forEach((n, i) => {
    n.className = i < segs ? (G.battery < 0.2 ? 'low' : 'on') : '';
  });
  $('#battery').classList.toggle('dead', G.locked);
  $('#stamina').style.opacity = player.stamina < 0.999 ? 1 : 0;
  $('#stamina i').style.width = `${player.stamina * 100}%`;
  $('#stamina').classList.toggle('tired', player.exhausted);
  $('#spray b').textContent = G.spray;
  if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) updateHud();
  if (showMap) drawMap();
  if (dev.info && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
    fpsN++;
    $('#devinfo').textContent = `FPS ${Math.round(1 / Math.max(1e-3, fpsAvg))}  위치 ${player.pos.x.toFixed(1)}, ${player.pos.z.toFixed(1)}  방 ${(ROOMS[roomAt(player.pos.x, player.pos.z)] || {}).name || '-'}\n체력 ${G.hp}/3  배터리 ${Math.round(G.battery * 100)}%  소음 반경 ${noise}m  붙은 바퀴 ${G.attached.length}\n바퀴 떼 ${swarms.states().map((x, i) => `${i + 1}:${({ hide: '숨음', hunt: '추적', return: '복귀' })[x]}`).join('  ')}`;
  }
  fpsAvg += (dt - fpsAvg) * 0.05;
  renderer.render(scene, camera);
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
document.addEventListener('webkitfullscreenchange', syncFs);
document.querySelectorAll('[data-act="fs"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); toggleFullscreen(); }));
syncFs();
// iPhone Safari has no fullscreen for pages: point to Add to Home Screen instead
if (isIOS && !fsOK() && !standalone) $('#iosHint').classList.add('show');

// ------------------------------------------------------------------ start / win
G.started = false;
resetGame();
$('#startBtn').addEventListener('click', () => {
  if (touch && fsOK() && !fsEl() && !standalone) enterFullscreen().catch(() => {});
  G.started = true;
  $('#start').classList.add('hide');
  if (!touch) { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
  setTimeout(() => tip(touch ? '손전등 버튼으로 손전등을 켜라' : '좌클릭으로 손전등을 켜라', 'start'), 1200);
});
$('#againBtn').addEventListener('click', () => {
  resetGame(); G.started = true;
  if (!touch) { try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } }
});

// ------------------------------------------------------------------ landscape on phones
let needRotate = false;
function checkOrient() { needRotate = touch && innerHeight > innerWidth; $('#rotate').classList.toggle('show', needRotate); }
addEventListener('resize', checkOrient);
addEventListener('orientationchange', () => setTimeout(checkOrient, 200));
checkOrient();
$('#bShake').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); if (G.attached[0]) G.attached[0].taps++; });

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
  if (k === 'restart') { resetGame(); G.started = true; }
}));

window.__M = {
  player, G, camera, lamps, genMeshes, colliders, swarms, dev, devSet, hurt, nests,
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
