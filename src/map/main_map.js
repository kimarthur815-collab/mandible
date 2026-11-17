import * as THREE from 'three';
import * as TX from '../textures.js';
import { buildLevel, buildBugMarkers, ROOMS, DOORS, SPOTS, greyMat, boxGeom } from './level.js';
import { Player } from './player.js';
import { makeSilkMaterial, SILK_RES } from '../silk.js';
import { RoachSwarms } from './roachswarm.js';
import { Arms } from './arms.js';
import { beamPattern, makeCone, beamNear } from '../hands/beam.js';
import { Sound } from './audio.js';
import { dressLevel } from './dressing.js';
import { MapSpiders } from './spiders.js';
import { EggNest } from './spiderlings.js';
import { GhostBrood } from './ghostlings.js';
import { createPadMap } from './padmap.js';
import { BUG_PAGES, drawBugPage, tapePhoto } from './bugnotes.js';
import { MapCentipede, HUNT } from './centi.js';
import { PassageGate, Phantom, DeadWorker, GATE, BODY, LeeBody, LEE } from './scares.js';
import { createVisions } from './visions.js';
import { createDread, DREAD_CLIPS } from './dread.js';
import { createIntro } from './intro.js';
import { HQ_VOX, hqClips } from './hqvox.js';
import { createMarks } from './marks.js';
import { createFaceBugs } from './facebugs.js';
import { createCans } from './cans.js';
import { createDuct, DUCT, ductInside, ductS } from './duct.js';

const $ = (s) => document.querySelector(s);
const touch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
const TEST = new URLSearchParams(location.search).has('test');
document.body.classList.toggle('touch', touch);

// ------------------------------------------------------------------ renderer
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.35 : 1.75));
renderer.setSize(innerWidth, innerHeight); SILK_RES.set(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const GAME_EXPOSURE = 1.38;   // a little brighter than it was (1.22)
renderer.toneMappingExposure = GAME_EXPOSURE;
renderer.outputColorSpace = THREE.SRGBColorSpace;
$('#app').appendChild(renderer.domElement);
// roaches on you, up close, on a canvas of their own over the game's (facebugs.js)
const faceBugs = createFaceBugs($('#app'), { touch });
let fxBlur = 0, fxOn = false;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.FogExp2(0x000000, 0.05);
const camera = new THREE.PerspectiveCamera(70, innerWidth / innerHeight, 0.05, 140);
let intro = null;   // the opening drive (built near the end, see createIntro)
// settings, kept in this browser: look sensitivity, volume, brightness, quality (see the settings panel)
const SET_DEFAULT = { sens: 1, vol: 1, bright: 1, quality: 'high', diff: 'normal', sub: 'm', shake: true, tips: true, vibe: true, book: true, autoQ: true };
// difficulty: health, spray cans, how fast hunters run, how fast the flashlight heats, how far your
// footsteps carry, how long the starter cord takes to catch (s), and how hard a grab is to fight off
const DIFF = {
  easy: { label: '쉬움', hp: 5, spray: 5, speed: 0.82, heat: 0, hear: 0.75, pull: 1.8, mash: 0.7 },
  normal: { label: '보통', hp: 3, spray: 3, speed: 1, heat: 1, hear: 1, pull: 2.4, mash: 1 },
  hard: { label: '어려움', hp: 2, spray: 2, speed: 1.15, heat: 1.3, hear: 1.3, pull: 3.0, mash: 1.3 },
};
const D = () => DIFF[SET.diff] || DIFF.normal;
let devTools = (() => { try { return localStorage.getItem('mandible.dev') === '1'; } catch (e) { return false; } })();
const SET = (() => { try { return { ...SET_DEFAULT, ...JSON.parse(localStorage.getItem('mandible.settings') || '{}') }; } catch (e) { return { ...SET_DEFAULT }; } })();
// phones that can vibrate (Android; iPhone browsers can't)
const canVibe = typeof navigator.vibrate === 'function' && touch;
function buzz(p) { if (canVibe && SET.vibe !== false) { try { navigator.vibrate(p); } catch (e) { /* not allowed yet */ } } }
// draw with the brightness setting on top of whatever exposure the scene uses
function withBright(fn) { const e = renderer.toneMappingExposure; renderer.toneMappingExposure = e * SET.bright; fn(); renderer.toneMappingExposure = e; }

// ------------------------------------------------------------------ level
const { group: levelGroup, colliders, labels: roomLabels } = buildLevel(scene);
const markers = buildBugMarkers(scene);
markers.visible = false;              // a developer aid (F1)
const silk = makeSilkMaterial();
// set dressing (boxes, racks, pipes, stains, signs...) adds its footprints to the colliders before the bugs map the floor
const dress = dressLevel(scene, { colliders, T: 0.3, silkMat: silk });
// the lab's air duct, the way out once the last generator runs
const duct = createDuct(scene, { colliders, metalMat: dress.metalMaterial(0x7d8280) });
const nests = SPOTS.bugs.filter((b) => b.kind === 'roach').map((b, i) => ({ x: b.x, z: b.z, count: [10, 8, 7, 6][i] || 6, spread: 1.0 }));
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
flash.shadow.camera.near = 0.01; flash.shadow.camera.far = 22;     // (past that the beam is too faint for a shadow to show)
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

// ------------------------------------------------------------------ one zone at a time
// Until a room's generator runs, the way on is taped off: the machine room's generator opens the corridor,
// the hall's opens the lab. Walk up to the tape and you say so.
const zoneGates = [
  { room: 'machine', axis: 'z', at: 20, from: 16.8, to: 20.2 },
  { room: 'hall', axis: 'x', at: -6, from: 55.8, to: 59.2 },
].map((zg) => {
  const c = document.createElement('canvas'); c.width = 256; c.height = 32;
  const x = c.getContext('2d');
  x.fillStyle = '#f0c419'; x.fillRect(0, 0, 256, 32);
  x.fillStyle = '#111'; for (let k = -32; k < 256; k += 32) { x.beginPath(); x.moveTo(k, 32); x.lineTo(k + 16, 32); x.lineTo(k + 32, 0); x.lineTo(k + 16, 0); x.closePath(); x.fill(); }
  x.fillStyle = '#f0c419'; x.fillRect(84, 6, 88, 20); x.fillStyle = '#111'; x.font = 'bold 15px sans-serif'; x.textAlign = 'center'; x.fillText('출입금지', 128, 22);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
  const len = zg.to - zg.from, mat = new THREE.MeshStandardMaterial({ map: tex, side: THREE.DoubleSide, roughness: 0.6 });
  tex.repeat.set(Math.max(1, Math.round(len / 1.4)), 1);
  const tape = new THREE.Group();
  for (const [y, tilt] of [[1.02, 0.02], [1.48, -0.03]]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(len, 0.075), mat);
    m.rotation.z = tilt; m.position.y = y; tape.add(m);
  }
  if (zg.axis === 'z') tape.position.set((zg.from + zg.to) / 2, 0, zg.at); else { tape.position.set(zg.at, 0, (zg.from + zg.to) / 2); tape.rotation.y = Math.PI / 2; }
  scene.add(tape);
  const col = zg.axis === 'z' ? { x0: zg.from, x1: zg.to, z0: zg.at - 0.15, z1: zg.at + 0.15 } : { x0: zg.at - 0.15, x1: zg.at + 0.15, z0: zg.from, z1: zg.to };
  colliders.push(col);
  return { ...zg, tape, col, saidT: -99 };
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
// the production hall: cold light from the high windows all over it, and broken fluorescent fixtures
// hanging off one chain (one over each place the wolf spider waits, three over the floor). Once you come
// in, the one nearest the spider sputters on, and now and then one of the others catches for a while
const hallFill = [[3, 58], [15, 58]].map(([x, z]) => { const L = new THREE.PointLight(0x93a8d6, 0, 18, 1); L.position.set(x, 7.2, z); scene.add(L); return L; });
const hallTubes = [[22.5, 56.2, Math.PI / 2], [4.3, 68.5, 0], [-4.5, 52.3, Math.PI / 2], [22.5, 65.2, Math.PI / 2], [3, 57, 0.3], [13, 52.5, 0], [11, 64, Math.PI / 2]].map(([x, z, ry], i) => {
  const g = new THREE.Group(); g.position.set(x, 4.6, z); g.rotation.y = ry;
  const hang = new THREE.Group(); hang.position.x = 0.62; hang.rotation.z = 0.32 + 0.1 * i; g.add(hang);       // (dropped at one end)
  const body = new THREE.Group(); body.position.x = -0.62; hang.add(body);
  const metal = dress.metalMaterial(0xcfd2cf);
  body.add(new THREE.Mesh(new THREE.BoxGeometry(1.25, 0.07, 0.18), metal));
  const glow = new THREE.MeshStandardMaterial({ color: 0x9a9c9a, emissive: new THREE.Color(0xe8f0ff), emissiveIntensity: 0, roughness: 0.3 });
  for (const s of [-1, 1]) { const tb = new THREE.Mesh(new THREE.CylinderGeometry(0.013, 0.013, 1.18, 8), glow); tb.rotation.z = Math.PI / 2; tb.position.set(0, -0.05, s * 0.045); body.add(tb); }
  const chain = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, 3.0, 4), metal); chain.position.set(0.62, 1.5, 0); g.add(chain);
  const light = new THREE.PointLight(0xe4ecff, 0, 11, 1.5); light.position.set(0, -0.45, 0); body.add(light);
  scene.add(g);
  return { g, glow, light, x, z, k: 0, mode: 'off', timer: 1 + i * 1.7, lit: false };
});

// the notes: crumpled, torn-out notebook pages written in pen (the handwriting font loads in the page)
const HAND = '"Nanum Pen Script", "Comic Sans MS", cursive';
function drawPage(c, text, seed) {
  const W = c.width, H = c.height, x = c.getContext('2d');
  let r = seed * 9301 + 49297; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  x.clearRect(0, 0, W, H);
  // the page, its torn top edge (transparent where torn)
  x.save(); x.beginPath(); x.moveTo(0, H);
  x.lineTo(0, 14);
  for (let i = 0; i <= 40; i++) x.lineTo((i / 40) * W, 6 + rnd() * 14);
  x.lineTo(W, H); x.closePath(); x.clip();
  x.fillStyle = '#e6dfc8'; x.fillRect(0, 0, W, H);
  // grime: a yellowed edge, smudges, a coffee ring
  const g = x.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.85);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,90,40,.35)'); x.fillStyle = g; x.fillRect(0, 0, W, H);
  for (let i = 0; i < 900; i++) { x.fillStyle = `rgba(${90 + rnd() * 40},${70 + rnd() * 30},40,${rnd() * 0.07})`; x.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3); }
  for (let i = 0; i < 3; i++) { const sx = rnd() * W, sy = rnd() * H, sr = 20 + rnd() * 50, sg = x.createRadialGradient(sx, sy, 0, sx, sy, sr); sg.addColorStop(0, 'rgba(70,55,35,.16)'); sg.addColorStop(1, 'rgba(70,55,35,0)'); x.fillStyle = sg; x.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
  { const cx = W * (0.6 + rnd() * 0.25), cy = H * (0.62 + rnd() * 0.25), cr = W * 0.17; x.strokeStyle = 'rgba(110,70,30,.22)'; x.lineWidth = 5; x.beginPath(); x.arc(cx, cy, cr, 0.3, Math.PI * 1.85); x.stroke(); x.lineWidth = 2; x.strokeStyle = 'rgba(110,70,30,.14)'; x.beginPath(); x.arc(cx + 3, cy - 2, cr - 6, 0, Math.PI * 2); x.stroke(); }
  // ruled lines and the margin
  const top = H * 0.13, gap = H * 0.07;
  x.strokeStyle = 'rgba(90,120,170,.35)'; x.lineWidth = 1.5;
  for (let y = top; y < H; y += gap) { x.beginPath(); x.moveTo(0, y); x.lineTo(W, y); x.stroke(); }
  x.strokeStyle = 'rgba(190,70,70,.35)'; x.beginPath(); x.moveTo(W * 0.12, 0); x.lineTo(W * 0.12, H); x.stroke();
  // the writing: blue-black ballpoint, a little crooked
  x.fillStyle = '#1e2546'; x.strokeStyle = '#1e2546'; x.textBaseline = 'alphabetic';
  const fs = gap * 0.95; x.font = `${fs}px ${HAND}`;
  text.split('\n').forEach((ln, i) => {
    const y = top + gap * (i + 1) - gap * 0.18;
    x.save(); x.translate(W * 0.15 + rnd() * 6, y); x.rotate((rnd() - 0.5) * 0.04);
    let px = 0;
    for (const [j, part] of ln.split('~~').entries()) {
      x.fillText(part, px, 0);
      const w = x.measureText(part).width;
      if (j % 2 === 1) { x.lineWidth = 2.5; x.beginPath(); x.moveTo(px - 3, -fs * 0.3); x.lineTo(px + w + 3, -fs * 0.34); x.moveTo(px - 2, -fs * 0.22); x.lineTo(px + w + 2, -fs * 0.27); x.stroke(); }
      px += w;
    }
    x.restore();
  });
  // creases: faint light/dark lines where it was folded and crushed
  for (let i = 0; i < 5; i++) {
    const a = rnd() * Math.PI, cx = rnd() * W, cy = rnd() * H, dx = Math.cos(a) * W, dy = Math.sin(a) * W;
    x.lineWidth = 2; x.strokeStyle = 'rgba(255,255,255,.22)'; x.beginPath(); x.moveTo(cx - dx, cy - dy); x.lineTo(cx + dx, cy + dy); x.stroke();
    x.lineWidth = 1; x.strokeStyle = 'rgba(60,45,25,.18)'; x.beginPath(); x.moveTo(cx - dx + 2, cy - dy + 2); x.lineTo(cx + dx + 2, cy + dy + 2); x.stroke();
  }
  x.restore();
}
function crumpledPage(seed) {
  const geo = new THREE.PlaneGeometry(0.15, 0.2, 12, 16); geo.rotateX(-Math.PI / 2);
  const p = geo.attributes.position;
  let r = seed * 7919 + 13; const rnd = () => ((r = (r * 9301 + 49297) % 233280) / 233280);
  const folds = Array.from({ length: 4 }, () => { const a = rnd() * Math.PI; return { nx: Math.cos(a), nz: Math.sin(a), o: (rnd() - 0.5) * 0.08, h: 0.002 + rnd() * 0.004, s: rnd() < 0.5 ? 1 : -1 }; });
  for (let i = 0; i < p.count; i++) {
    const vx = p.getX(i), vz = p.getZ(i);
    let y = 0.0015;
    for (const f of folds) { const d = Math.abs(vx * f.nx + vz * f.nz - f.o); y += f.h * Math.max(0, 1 - d / 0.03) * f.s; }
    const ex = Math.abs(vx) / 0.075, ez = Math.abs(vz) / 0.1;
    y += 0.012 * Math.pow(Math.max(ex, ez), 3) * (0.5 + rnd() * 0.5);       // the edges curl up off the bench
    y += (rnd() - 0.5) * 0.0015;
    p.setY(i, Math.max(0.0008, y));
  }
  geo.computeVertexNormals();
  return geo;
}
const noteMeshes = SPOTS.notes.map((n, i) => {
  const c = document.createElement('canvas'); c.width = 384; c.height = 512;
  drawPage(c, n.text, i + 1);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
  const m = new THREE.Mesh(crumpledPage(i + 3), new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.92, emissive: new THREE.Color(0x2a2418), emissiveIntensity: 0.35, emissiveMap: tex }));
  m.position.set(n.x, n.y + 0.004, n.z); m.rotation.y = 0.5 + 1.1 * i;   // clear of the top (boxes grow a few mm)
  m.receiveShadow = true;
  scene.add(m);
  return { ...n, idx: i, m, c, tex, read: false };
});
// team 2's glow-paint arrows on the walls and floors
const marks = createMarks(scene);
// redraw the pages once the handwriting font is in
if (document.fonts && document.fonts.load) document.fonts.load(`40px ${HAND}`, '약쳤는데').then(() => { for (const n of noteMeshes) { drawPage(n.c, n.text, n.idx + 1); n.tex.needsUpdate = true; } paperMap.redraw(); journal.redraw(); }).catch(() => {});
// ------------------------------------------------------------------ voices at the bottom: radio calls and recordings, one after another
const voice = (() => {
  const q = []; let cur = null, t = 0;
  const show = (v) => {
    const el = $('#subtitle');
    if (!v) { el.classList.remove('show'); return; }
    el.querySelector('b').textContent = v.label; el.querySelector('span').textContent = v.text; el.querySelector('i').textContent = '';
    el.classList.toggle('me', v.who === '나'); el.classList.add('show');
    if (v.who === '나') sfx.mumble(Math.min(2.2, 0.5 + v.text.length * 0.06));
    else if (v.kind === 'tape') {
      // his recorded voice if it's in (the line lasts as long as it does); the old murmur if not
      const d = v.clip && sfx.playTape(v.clip);
      if (d) v.dur = d + 0.35; else if (v.text[0] === '(') sfx.tapeCut(); else sfx.tape(Math.max(0.4, v.dur - 0.4));
    } else if (v.kind === 'mimic') {
      const d = v.clip && sfx.mimicClip(v.clip, v.at.x, v.at.y, v.at.z, v.at.muffle);
      if (d) v.dur = d + 0.7; else sfx.mimic(v.dur, v.at.x, v.at.y, v.at.z, v.at.muffle);
    }
    else if (v.kind === 'whisper') sfx.whisper(v.dur);
    else {
      // the base's recorded voice if its pieces are in (the line lasts as long as they do); the garble if not
      sfx.squelch();
      const c = hqClips(v.text), d = c && sfx.playRadio(c.names, c.gaps);
      if (d) v.dur = d + 0.45; else if (/사각|기어/.test(v.text)) sfx.radioSkitter(v.dur - 0.4); else sfx.chatter(v.dur - 0.6);
    }
  };
  return {
    // lines: [[who, text, seconds?, clip?]]; kind: 'radio', 'tape' or 'mimic' (a voice from somewhere in the
    // building: who is where it comes from, at: { x, y, z, muffle }); clip: a recording of the line (docs/voice)
    say(lines, kind = 'radio', at = null) {
      for (const [who, text, dur, clip] of lines) q.push({ who, text, kind, at, clip, label: who === '나' ? '나' : kind === 'tape' ? `녹음 · ${who}` : kind === 'mimic' ? who : '무전', dur: dur || Math.min(6, 1.9 + text.length * 0.09) });
    },
    update(dt) {
      if (cur) { t += dt; if (t >= cur.dur) { cur = null; show(null); t = -0.35; } }
      else if (t < 0) t += dt;
      else if (q.length) { cur = q.shift(); t = 0; show(cur); }
    },
    clear() { q.length = 0; cur = null; t = 0; show(null); sfx.radioStop(); },
    get busy() { return !!cur || q.length > 0; },
  };
})();
// the base on the radio as the generators come on, and now and then something else on the channel
const RADIO_GEN = [
  [['본부', '치익— 3조, 발전기 돌아가는 소리가 잡힌다. 두 대 남았다.'], ['나', '...알겠습니다.']],
  [['본부', '한 대 남았다. ...3조, 방금 그 소리는 뭐야? 응답하라.']],
  [['본부', '셔터 열렸다! 3조, 당장 나와!'], ['본부', '실험실 환기 덕트가 하역장 위로 이어진다. 거기로 기어 와!']],
];
const RADIO_ODD = [
  [['본부', '치익... ...3조... 들...리...']],
  [['본부', '(지직거림 속에 누군가의 숨소리가 섞여 있다)']],
  [['본부', '치익— ...안에... 아직...']],
];
// ------------------------------------------------------------------ team 2's notebook: a page per bug, the first time you meet it
const tmpV = new THREE.Vector3();
const journal = (() => {
  const found = [];                       // page ids in the order found
  const pages = {};                       // id -> canvas (drawn once)
  const photos = {};                      // id -> a camera print taped onto that page
  let idx = 0, open = false, toastT = 0, forced = false, forcedAt = 0;
  const view = $('#journal canvas'), toast = $('#bugToast canvas');
  const pageCanvas = (id) => {
    if (!pages[id]) {
      const c = document.createElement('canvas'); c.width = 600; c.height = 800;
      const seed = BUG_PAGES.findIndex((p) => p.id === id) + 3;
      drawBugPage(c, BUG_PAGES.find((p) => p.id === id), seed);
      if (photos[id]) tapePhoto(c, photos[id], seed);
      pages[id] = c;
    }
    return pages[id];
  };
  const show = () => {
    const c = view.getContext('2d'); c.clearRect(0, 0, view.width, view.height);
    if (found.length) c.drawImage(pageCanvas(found[idx]), 0, 0, view.width, view.height);
    $('#jNum').textContent = `${idx + 1} / ${found.length}`;
    $('#jPrev').disabled = idx <= 0; $('#jNext').disabled = idx >= found.length - 1;
  };
  const api = {
    has: (id) => found.includes(id),
    get count() { return found.length; },
    get open() { return open; },
    add(id) {
      if (found.includes(id)) return false;
      found.push(id); idx = found.length - 1;
      document.body.classList.add('hasbook');
      const c = toast.getContext('2d'); c.clearRect(0, 0, toast.width, toast.height); c.drawImage(pageCanvas(id), 0, 0, toast.width, toast.height);
      return true;
    },
    toast() { $('#bugToast').classList.add('show'); toastT = 5.5; },
    setPhoto(id, photo) { photos[id] = photo; delete pages[id]; pageCanvas(id); if (open) show(); },
    get forced() { return forced; },
    // a page just found: put in front of you (the game waits) until you've had a moment to read it and close it
    read(id) {
      if (!found.includes(id)) return;
      idx = found.indexOf(id); forced = true; forcedAt = performance.now(); G.reading = true;
      $('#journal').classList.add('forced'); $('#jClose').textContent = '다 읽었다'; $('#jClose').classList.add('wait');
      setTimeout(() => $('#jClose').classList.remove('wait'), 1300);
      api.toggle(true);
    },
    toggle(on = !open, now = false) {          // (now: close a page put in front of you without the short wait)
      if (on && !found.length) return;
      if (!on && forced) {
        if (!now && performance.now() - forcedAt < 1300) return;
        forced = false; G.reading = false;
        $('#journal').classList.remove('forced'); $('#jClose').textContent = '닫기';
        if (!G.tipped.bookKey) { G.tipped.bookKey = true; setTimeout(() => tip(`수첩에 끼워 뒀다. 다시 보려면 (${KEY.book})`), 400); }
      }
      open = on; $('#journal').classList.toggle('show', on);
      document.querySelectorAll('[data-act="book"]').forEach((b) => b.classList.toggle('on', on));
      if (on) { show(); $('#bugToast').classList.remove('show'); sfx.paper(); if (document.pointerLockElement) document.exitPointerLock(); }
      else if (G.started && !G.won && !G.dead && !viaTouch()) requestLock();
    },
    flip(d) { if (!open) return; const n = Math.max(0, Math.min(found.length - 1, idx + d)); if (n !== idx) { idx = n; show(); sfx.paper(); } },
    update(dt) { if (toastT > 0 && (toastT -= dt) <= 0) $('#bugToast').classList.remove('show'); },
    reset() { for (const k of Object.keys(photos)) { delete photos[k]; delete pages[k]; } found.length = 0; idx = 0; forced = false; G.reading = false; $('#journal').classList.remove('forced'); $('#jClose').textContent = '닫기'; if (open) { open = false; $('#journal').classList.remove('show'); } toastT = 0; $('#bugToast').classList.remove('show'); document.body.classList.remove('hasbook'); },
  };
  for (const p of BUG_PAGES) pageCanvas(p.id);     // drawn up front (and again once the handwriting font is in)
  api.redraw = () => { for (const k of Object.keys(pages)) delete pages[k]; for (const p of BUG_PAGES) pageCanvas(p.id); if (open) show(); };
  return api;
})();
// a new bug: a torn page of team 2's notebook turns up (shown small at the side; J / 수첩 to read it)
// The first time, the page is put in front of you to read (the game waits): see readQueued. With
// '새 벌레 기록 펼치기' off in the settings (or '다음부턴 안 펼치기' on such a page) it only shows small at the side
function discover(id) {
  if (!G.started || journal.has(id)) return;
  journal.add(id);
  G.readQ.push({ id, at: t + 1.4 });
}
// ...once nothing is going on: not while you're grabbed, being chased, made to look, falling or in a scare
function readQueued() {
  const q = G.readQ[0];
  if (!q || t < q.at || !journal.has(q.id)) { if (q && !journal.has(q.id)) G.readQ.shift(); return; }
  if (!G.started || G.dead || G.won || G.grab || G.kill || G.drop || G.cine || G.lookSeq || focus || G.glance || G.chasing || G.attached.length || journal.open || (intro && intro.active)) return;
  G.readQ.shift();
  if ((TEST && !window.__READ) || SET.book === false) { journal.toast(); return; }      // (automated runs: no one to close it)
  if (showMap) toggleMap();
  journal.read(q.id);
}
document.querySelectorAll('[data-act="book"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); journal.toggle(); }));
$('#jPrev').addEventListener('click', (e) => { e.stopPropagation(); journal.flip(-1); });
$('#jNext').addEventListener('click', (e) => { e.stopPropagation(); journal.flip(1); });
$('#jClose').addEventListener('click', (e) => { e.stopPropagation(); journal.toggle(false); });
$('#jNever').addEventListener('click', (e) => {
  e.stopPropagation(); SET.book = false; applySettings(); journal.toggle(false, true);
  msg('이제 새 기록은 옆에 작게만 뜬다 (설정에서 다시 켤 수 있어요)');
});
$('#journal').addEventListener('pointerdown', (e) => e.stopPropagation());
$('#journal').addEventListener('click', (e) => { if (e.target.id === 'journal') journal.toggle(false); });   // tap beside the page
addEventListener('keydown', (e) => {
  if (e.code === 'KeyJ' && !e.repeat && G.started && !G.won) journal.toggle();
  else if (journal.open && (e.code === 'ArrowLeft' || e.code === 'ArrowRight')) { e.preventDefault(); journal.flip(e.code === 'ArrowLeft' ? -1 : 1); }
  else if (journal.open && e.code === 'Escape') journal.toggle(false);
});

// the gas mask you put on at the truck (intro.js): its view (#mask), your breathing in it (slow, harder after a
// run or with something after you; held while you hide, let out after), the visor fogging as you breathe out
const maskEl = $('#mask'), maskFog = maskEl.querySelector('i');
const MB = { on: false, t: 1, inhale: true, fog: 0, held: 0 };
function setMask(on) { MB.on = on; maskEl.classList.toggle('on', on); if (!on) { MB.fog = 0; maskFog.style.opacity = 0; } }
function maskTick(dt, k, hold) {
  if (!MB.on) return;
  if (hold) MB.held += dt;
  else {
    if (MB.held > 2.5) { sfx.maskBreath(false, 0.8); MB.fog = 0.6; MB.t = 0.7; MB.inhale = true; }
    MB.held = 0;
    if ((MB.t -= dt) <= 0) {
      sfx.maskBreath(MB.inhale, k);
      if (!MB.inhale) MB.fog = Math.min(1, 0.35 + 0.5 * k);
      MB.t = (MB.inhale ? 1.5 : 2.1) * (1 - 0.55 * k) + Math.random() * 0.3;
      MB.inhale = !MB.inhale;
    }
  }
  MB.fog = Math.max(0, MB.fog - dt * 0.6);
  maskFog.style.opacity = MB.fog.toFixed(3);
}
// breath (without the mask): after a hard run, short puffs of breath in front of your face, panting faster the more winded
// you are. They hang in the air in front of you (camera space) and show up best in the flashlight
const breath = (() => {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  { const g = c.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.45, 'rgba(255,255,255,0.3)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const tex = new THREE.CanvasTexture(c);
  const pool = Array.from({ length: 15 }, () => {
    const m = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xdde5ee, transparent: true, opacity: 0, depthWrite: false, fog: false }));
    m.visible = false; m.renderOrder = 6; scene.add(m);
    return { m, t: 0, life: 1, k: 0, o: new THREE.Vector3(), v: new THREE.Vector3(), spin: 0 };
  });
  let next = 0, wait = 0, lit = 0;
  return {
    update(dt, k, light) {
      lit += (light - lit) * Math.min(1, dt * 5);
      if (k > 0.03) {
        if ((wait -= dt) <= 0) {
          wait = 0.62 + (1 - k) * 0.85 + Math.random() * 0.18;
          for (let i = 0; i < 3; i++) {
            const p = pool[next++ % pool.length];
            p.t = 0; p.life = 0.85 + Math.random() * 0.5; p.k = k; p.spin = (Math.random() - 0.5) * 2;
            p.o.set((Math.random() - 0.5) * 0.03, -0.1 + Math.random() * 0.02, -0.2 - i * 0.025);            // just below the mouth
            p.v.set((Math.random() - 0.5) * 0.08, 0.05 + Math.random() * 0.05, -0.22 - Math.random() * 0.12);
            p.m.visible = true;
          }
          sfx.exhale(k);
        }
      } else wait = Math.min(wait, 0.25);
      for (const p of pool) {
        if (!p.m.visible) continue;
        p.t += dt; const u = p.t / p.life;
        if (u >= 1) { p.m.visible = false; continue; }
        p.o.addScaledVector(p.v, dt); p.v.multiplyScalar(1 - dt * 1.4);
        p.m.position.copy(p.o); camera.localToWorld(p.m.position);
        const s = 0.07 + u * 0.32; p.m.scale.set(s, s, s); p.m.material.rotation += p.spin * dt;
        p.m.material.opacity = Math.min(1, u * 4) * (1 - u) * (1 - u) * 0.62 * lit * (0.55 + p.k * 0.45);
      }
    },
    clear() { for (const p of pool) p.m.visible = false; },
  };
})();

// calling the base (R / 무전 button): three calls a run. The base talks you toward what is left to do,
// with a word on whatever is going on; but the squelch is loud, and anything close by hears it
function where(x, z) {
  const dx = x - player.pos.x, dz = z - player.pos.z, d = Math.hypot(dx, dz) || 1;
  const f = (dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw)) / d, r = (dx * -Math.cos(player.yaw) + dz * Math.sin(player.yaw)) / d;
  const side = f > 0.82 ? '네 정면' : f < -0.75 ? '네 뒤쪽' : r > 0 ? (f > 0.3 ? '오른쪽 앞' : f < -0.3 ? '오른쪽 뒤' : '오른쪽') : (f > 0.3 ? '왼쪽 앞' : f < -0.3 ? '왼쪽 뒤' : '왼쪽');
  const far = d < 8 ? '바로 근처다' : d < 30 ? `${Math.round(d / 5) * 5}미터쯤` : '꽤 멀다';
  return { side, far, d };
}
function radioHint() {
  const here = roomAt(player.pos.x, player.pos.z);
  if (G.gens >= 3) {
    if (G.dk.in) return '덕트 안이지? 계속 기어가라. 끝에서 하역장 천장으로 떨어진다.';
    if (here === 'dock') { const w = where(0, 0); return `셔터 열렸다. 당장 나와라. ${w.side} 방향, ${w.far}.`; }
    const w = where(DUCT.mouth.x, DUCT.wallZ + 0.3); return `실험실 남쪽 벽 환기구로 들어가라. 하역장으로 이어진다. ${w.side} 방향, ${w.far}.`;
  }
  let best = null;
  for (const g of genMeshes) if (!g.on) { const d = Math.hypot(g.x - player.pos.x, g.z - player.pos.z); if (!best || d < best.d) best = { g, d }; }
  const g = best.g, w = where(g.x, g.z), name = ROOMS[g.room].name;
  if (here === g.room) return `같은 방이다. ${name} 발전기, ${w.side}에 있다. ${w.far}.`;
  return `${name} 발전기가 아직이다. ${w.side} 방향, ${w.far}.`;
}
function radioSituation() {
  if (centi.state === 'poke') return '머리를 들이밀면 손전등을 비춰라. 빛을 받으면 물러난다.';
  if (centi.active && centi.state === 'chase') return G.gens >= 3 && !G.dk.landed ? '긴 놈이 따라오면 환기구로 기어 들어가! 그 덩치로는 못 들어온다.' : '긴 놈이 따라오면 불 켜진 전등 밑으로 가라. 그 빛 안으로는 못 들어온다.';
  if (spiders.chasers().length) return spiders.wolf && spiders.wolf.g && spiders.wolf.g.phase === 'chase'
    ? '홀의 큰 거미는 빛으로는 잠깐 움찔할 뿐이다. 앉아서 컨베이어 밑에 숨어라. 불 끄고, 가만히.' : '거미가 쫓아오면 손전등을 똑바로 비춰라. 빛을 싫어한다.';
  if (G.attached.length) return '몸에 붙은 건 당장 털어내라!';
  if (G.drained || G.battery < 0.3) return '손전등이 뜨거우면 잠깐 꺼서 식혀라.';
  if (G.spray === 0 && !refill.taken) return '스프레이가 떨어졌으면, 연결 복도에 2조가 두고 간 리필이 있을 거다.';
  if (G.hp <= 1) return '다쳤으면 무리하지 마라. 불 켜진 전등 근처가 그나마 안전하다.';
  return null;
}
function updateRadioBtn() { const b = $('#bRadio'); if (!b) return; b.querySelector('b').textContent = G.calls; b.classList.toggle('empty', G.calls <= 0); }
function radioCall() {
  if (!G.started || G.dead || G.won || G.kill || (intro && intro.active)) return;
  if (G.calls <= 0) { tip('무전기 배터리가 바닥났다... 더는 못 부른다'); return; }
  if (voice.busy) { tip('무전이 아직 이어지고 있다'); return; }
  G.calls--; G.stats.radio++; updateRadioBtn();
  G.stuckT = 0; $('#bRadio').classList.remove('nudge');
  G.events.push({ x: player.pos.x, z: player.pos.z, r: 13 });          // the squelch carries
  const lines = [['나', '본부, 3조. ...어디로 가야 합니까?'], ['본부', `치익— ${radioHint()}`]];
  const extra = radioSituation(); if (extra) lines.push(['본부', extra]);
  lines.push(['본부', G.calls ? `무전기 아껴 써라. 배터리, ${['', '한 번', '두 번'][G.calls]} 남았다.` : '...배터리가 다 됐다. 이제부턴 혼자다.']);
  voice.say(lines);
  if (!G.tipped.radioNoise) { G.tipped.radioNoise = true; setTimeout(() => { if (G.started && !G.won) tip('무전 소리가 너무 컸다... 뭔가 들었을지도'); }, 3200); }
}

// pocket recorders left by Lee Jeong-hun of team 2, on the tables
const TAPES = [
  { x: 11.25, y: 0.931, z: 20.0, lines: [['이정훈', '방역팀 2조 이정훈. 오후 4시 10분, 하역장으로 들어왔다.', null, 'lee_tape1_1'], ['이정훈', '...바닥이 움직이는 줄 알았는데, 전부 바퀴다. 보통 양이 아니야.', null, 'lee_tape1_2']] },
  { x: 13.5, y: 0.921, z: 18.9, lines: [['이정훈', '발전기 시동줄... 몇 번 세게 당겨야 걸린다.', null, 'lee_tape2_1'], ['이정훈', '시동 걸리는 소리가 엄청 커. 그 소리에 놈들이 몰려와. 조심해.', null, 'lee_tape2_2']] },
  { x: 20.8, y: 0.931, z: 63.1, lines: [['이정훈', '생산 홀. 천장에 뭔가 붙어 있다. 다리가 사람 팔만 해.', null, 'lee_tape3_1'], ['이정훈', '테이블 밑마다 야광봉 놔뒀다. 숨을 땐 불 끄고... 숨도 참아.', null, 'lee_tape3_2']] },
  { x: -16.6, y: 0.931, z: 60.0, lines: [['이정훈', '실험실 기록을 봤다. 여기서 만든 건 살충제가 아니었어.', null, 'lee_tape4_1'], ['이정훈', '벽 안에서 뭔가 긴 게 움직인다... 3조가 오면, 셔터로 바로—', null, 'lee_tape4_2'], ['이정훈', '(녹음이 뚝 끊긴다)', 2.2]] },
  // the last one, by his hand where he lies in the hall's corner
  { x: LEE.tape.x, y: LEE.tape.y, z: LEE.tape.z, lee: true, lines: [['이정훈', '(거친 숨) ...녹음 되나. 2조 이정훈. 몇 시인지도 모르겠다.', null, 'lee_tape5_1'], ['이정훈', '놈이 벽 속을 다닌다. 길고... 다리가 끝이 없어. 발전기 소리를 따라와.', null, 'lee_tape5_2'], ['이정훈', '3조, 이거 들으면... 발전기 다 돌리고 셔터로 나가. 뒤돌아보지 말고.', null, 'lee_tape5_3'], ['이정훈', '사원증... 우리 집사람한테 좀... (사각사각— 녹음이 끊긴다)', 3.0, 'lee_tape5_4']] },
];
const tapes = TAPES.map((r, i) => {
  const g = new THREE.Group();
  const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.022, 0.125), new THREE.MeshStandardMaterial({ color: 0x2a2c2e, roughness: 0.55, metalness: 0.2 }));
  const grill = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.003, 0.04), new THREE.MeshStandardMaterial({ color: 0x111213, roughness: 0.9 }));
  grill.position.set(0, 0.012, 0.03);
  const btn = new THREE.Mesh(new THREE.BoxGeometry(0.018, 0.006, 0.012), new THREE.MeshStandardMaterial({ color: 0x8a8c8e, roughness: 0.4 }));
  btn.position.set(0.015, 0.013, -0.04);
  const led = new THREE.Mesh(new THREE.SphereGeometry(0.004, 8, 6), new THREE.MeshStandardMaterial({ color: 0x300000, emissive: 0xff2010, emissiveIntensity: 2 }));
  led.position.set(-0.02, 0.012, -0.045);
  g.add(body, grill, btn, led); body.castShadow = true;
  g.position.set(r.x, r.y, r.z); g.rotation.y = 0.5 + i * 1.3;
  scene.add(g);
  return { ...r, g, led, played: false };
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
// the lab door: a steel slider on the lab side of the doorway from the hall, parked open along the wall.
// Shut (E), it keeps the centipede out - it prowls the hall outside the open doorway but won't come in -
// until it batters its way through: when the vent's grille comes off, or if that takes too long
const LAB = { x: -6.13, z0: 56, z1: 59, zc: 57.5 };
const labDoor = (() => {
  const W = 3.2, shut = LAB.zc, open = LAB.zc + 3.15;
  const steel = dress.metalMaterial(0x5e6662), dark = dress.metalMaterial(0x2c302e);
  const g = new THREE.Group();                                   // its foot on the floor, under the hall-side face
  const panel = new THREE.Group(); g.add(panel);
  const plate = new THREE.Mesh(boxGeom(0.07, 2.95, W, 0, 1.5, 0), steel); plate.castShadow = plate.receiveShadow = true; panel.add(plate);
  for (const y of [0.45, 1.5, 2.55]) for (const s of [-1, 1]) panel.add(new THREE.Mesh(boxGeom(0.025, 0.09, W - 0.12, s * 0.045, y, 0), dark));
  for (const s of [-1, 1]) panel.add(new THREE.Mesh(boxGeom(0.05, 0.3, 0.05, s * 0.07, 1.1, -W / 2 + 0.18), dark));   // the handles at its leading edge
  g.position.set(LAB.x, 0, open);
  scene.add(g);
  const rail = new THREE.Mesh(boxGeom(0.1, 0.08, 6.6, 0, 3.02, 0), dark); rail.position.set(LAB.x - 0.02, 0, LAB.zc + 1.6); scene.add(rail);
  const col = { x0: LAB.x - 0.08, x1: LAB.x + 0.12, z0: LAB.z0, z1: LAB.z1, off: true };
  colliders.push(col);
  // a caged bulb over it on the lab side, dead till the last generator's power comes through
  const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), new THREE.MeshStandardMaterial({ color: 0x999080, emissive: new THREE.Color(0xfff0c8), emissiveIntensity: 0 }));
  bulb.position.set(LAB.x - 0.16, 3.25, LAB.zc); scene.add(bulb);
  const cage = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.16, 8, 1, true), new THREE.MeshStandardMaterial({ color: 0x222420, wireframe: true }));
  cage.position.copy(bulb.position); scene.add(cage);
  const light = new THREE.PointLight(0xfff0c8, 0, 8, 1.6); light.position.set(LAB.x - 0.5, 3.0, LAB.zc); scene.add(light);
  return { g, panel, plate, col, W, shut, open, k: 1, want: 1, broken: false, fall: 0, closedT: 0, angry: false, smash: -1, scratchT: 0, bulb, light };
})();
spiders.setColliders(colliders);
// (made after the spiders took their feet surfaces, so their legs don't reach for these)
const gate = new PassageGate(scene, silk, BT, colliders);
const phantom = new Phantom(scene, silk, BT);
const deadMan = new DeadWorker(scene, silk, colliders);
const lee = new LeeBody(scene, colliders);
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
  if (G.drop) $('#fadeBlack').style.opacity = 0;
  clearTips();
  Object.assign(G, {
    battery: 1, flashOn: false, locked: false, holdT: 0, holdKey: null, shutter: 0, shutterOpening: false,
    emergency: 0, emergencyOpening: false, time: 0, timing: false, won: false, gens: 0, spray: D().spray, inSafe: false,
    tipped: {}, lampSeen: false, calls: 3, hp: D().hp, dead: false, kill: null, attached: [], attachCd: 0, chasing: false, chaseLen: 0, stingAt: -99, scared: false, events: [],
    grab: null, sprayCd: 0, webSlowT: 0, lingSlow: 0, lingT: 9, eggTip: false, checkpoint: null,
    hidden: false, revealT: 0, hiddenT: 0, stillT: 0, drained: false, blackT: 0, backT: 0, blackDone: false, blackPhantom: false,
    cans: 0, hasCam: false, shots: 0, camCd: 0, photos: {}, leeId: false, lostT: 0, lostHints: 0, stuckT: 0, stuckHints: 0, hallLit: false, lookSeq: null, seenRooms: new Set(), glance: null, glanceAt: -99,
    stats: { hits: 0, deaths: 0, spray: 0, thrown: 0, photos: 0, radio: 0 },
    drop: null, dk: freshDuct(), ductJolt: 0, cine: null, readQ: [], reading: false,
  });
  swarms.reset(); swarms.sealed = new Set([3]); gate.setOpen(false); phantom.hide(); setCrouch(false);
  spiders.reset(); eggs.reset(); brood.reset(); centi.reset();
  document.body.classList.remove('grabbed'); $('#grab').classList.remove('show');
  $('#crawl').classList.remove('show'); $('#dead').classList.remove('show'); $('#hurt').style.opacity = 0;
  player.place(SPOTS.start.x, SPOTS.start.z, SPOTS.start.yaw);
  for (const l of lamps) { l.on = false; l.burnt = false; l.t = 0; l.light.intensity = 0; l.bulb.material.emissive.set(0xffa24a); l.bulb.material.emissiveIntensity = 0; l.leverPivot.rotation.z = 0.6; }
  for (const g of genMeshes) { g.on = false; g.led.material.emissive.set(0xff2a10); }
  for (const r of tapes) { r.played = false; }
  voice.clear(); G.oddN = 0; G.oddT = 70 + Math.random() * 50; G.calls = 3; updateRadioBtn();
  journal.reset();
  for (const r of Object.values(reds)) { r.on = false; r.light.intensity = 0; r.fixture.material.emissiveIntensity = 0; }
  for (const n of noteMeshes) { n.read = false; n.m.visible = true; }
  marks.reset();
  faceBugs.clear();
  refill.taken = false; refill.m.visible = true;
  cans.reset(); camItem.taken = false; camItem.g.visible = true; updateItems();
  lee.reset(); visions.reset(); duct.reset(); dread.reset();
  emDoor.position.x = -15.5; emCol.off = false;
  Object.assign(labDoor, { k: 1, want: 1, broken: false, fall: 0, closedT: 0, angry: false, smash: -1 });
  labDoor.panel.rotation.set(0, 0, 0); labDoor.panel.position.set(0, 0, 0); labDoor.col.off = true;
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
// the lines at the bottom wait their turn: a new one queues behind the one showing instead of replacing it
// what to press, named in lines that tell you to do something: "손전등을 켜자 (좌클릭)"
// control hints in lines: the action and its PC key, e.g. (앉기 Ctrl); on touch screens the same, plus
// '· 버튼' (the on-screen button of that name)
const KEYS = { flash: ['손전등', '우클릭'], crouch: ['앉기', 'Ctrl'], spray: ['스프레이', 'T'], book: ['수첩', 'J'], radio: ['무전', 'R'], use: ['상호작용', 'E'], throw: ['던지기', 'G'], cam: ['카메라', 'V'], map: ['지도', 'M'] };
const KEY = Object.fromEntries(Object.entries(KEYS).map(([k, [act, key]]) => [k, `${act} ${key}`]));   // same on phones: the action matches the button label, plus the PC key
const tipQueue = [];
let tipBusy = false;
function tip(text, key) {
  if (SET.tips === false) return;
  if (key) { shownTips[key] = (shownTips[key] || 0) + 1; if (shownTips[key] > 2) return; }
  if ((tipBusy && tipEl.textContent === text) || tipQueue.includes(text)) return;   // already showing or waiting
  tipQueue.push(text);
  if (tipQueue.length > 4) tipQueue.shift();                                         // don't let a backlog build up
  if (!tipBusy) nextTip();
}
function nextTip() {
  const text = tipQueue.shift();
  if (text == null) { tipBusy = false; return; }
  tipBusy = true;
  tipEl.textContent = text; tipEl.classList.add('show');
  clearTimeout(tipTimer);
  tipTimer = setTimeout(() => { tipEl.classList.remove('show'); tipTimer = setTimeout(nextTip, 400); }, tipQueue.length ? 3000 : 3500);
}
// a line that counts down: if it is already showing, just change its text (no queue of near-copies)
function tipLive(text, prefix) {
  if (SET.tips === false) return;
  if (tipBusy && tipEl.textContent.startsWith(prefix)) {
    tipEl.textContent = text; clearTimeout(tipTimer);
    tipTimer = setTimeout(() => { tipEl.classList.remove('show'); tipTimer = setTimeout(nextTip, 400); }, 2500);
    return;
  }
  for (let i = tipQueue.length - 1; i >= 0; i--) if (tipQueue[i].startsWith(prefix)) tipQueue.splice(i, 1);
  tip(text);
}
function clearTips() { tipQueue.length = 0; clearTimeout(tipTimer); tipBusy = false; tipEl.classList.remove('show'); }
function msg(text) {
  msgEl.textContent = text; msgEl.classList.add('show');
  clearTimeout(msgTimer); msgTimer = setTimeout(() => msgEl.classList.remove('show'), 2600);
}
function note(text) {
  noteEl.textContent = '';
  for (const ln of text.split('\n')) {
    const row = document.createElement('div');
    ln.split('~~').forEach((part, j) => { const e = document.createElement(j % 2 ? 's' : 'span'); e.textContent = part; row.appendChild(e); });
    if (!ln) row.innerHTML = '&nbsp;';
    noteEl.appendChild(row);
  }
  noteEl.style.setProperty('--tilt', `${(Math.random() - 0.5) * 3}deg`);
  noteEl.classList.add('show');
  clearTimeout(noteTimer); noteTimer = setTimeout(() => noteEl.classList.remove('show'), 4000 + text.length * 60);
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
  if (e.code === 'KeyB' && devTools) toggleBright();
  if (e.code === 'KeyE') input.usePressed = true;
  if (e.code === 'KeyT' || e.code === 'KeyQ') useSpray();
  if (e.code === 'KeyR') radioCall();
  if (e.code === 'KeyG') throwCan();
  if (e.code === 'KeyV') snapPhoto();
  if (e.code === 'Space' && struggling()) mashGrab();
  if (e.code === 'ControlLeft' || e.code === 'ControlRight' || e.code === 'KeyC') setCrouch(!hold.crouch);     // (a toggle: press again to stand)
});
addEventListener('keyup', (e) => { keys[e.code] = false; });
// crouching is Ctrl, so while playing, Ctrl+key shortcuts (Ctrl+W closes the tab!) are kept from the browser where it allows:
// held back here, captured outright in fullscreen (keyboard lock, see enterFullscreen), and leaving asks first
addEventListener('keydown', (e) => { if (G.started && !G.won && e.ctrlKey && e.code !== 'ControlLeft' && e.code !== 'ControlRight') e.preventDefault(); }, { capture: true });
addEventListener('beforeunload', (e) => { if (G.started && !G.won && !G.dead) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('blur', () => { for (const k in keys) keys[k] = false; });   // a key let go while away would stay down
const el = renderer.domElement;
// tablets count as touch devices but can have a mouse too: decide per event, not per device.
// A tap also fires (fake) mouse events after it, so mouse events count only while the mouse was the last pointer used.
let lastPointer = 'mouse';
addEventListener('pointerdown', (e) => { lastPointer = e.pointerType; }, { capture: true });
addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') lastPointer = 'mouse'; }, { capture: true });
const viaTouch = () => lastPointer !== 'mouse';
// Tablet browsers (Chrome/Samsung on Android, Safari on iPad) have no pointer lock. If it has never worked here,
// the mouse looks around just by moving (freeLook), and holding the cursor at the left/right edge keeps turning.
let everLocked = false, freeLook = false, mouseX = null;
function requestLock() {
  const fail = () => { if (!everLocked) freeLook = true; };
  if (!el.requestPointerLock) { fail(); return; }
  try { const p = el.requestPointerLock(); if (p && p.catch) p.catch(fail); } catch (err) { fail(); }
  setTimeout(() => { if (!locked) fail(); }, 1000);
}
document.addEventListener('pointerlockerror', () => { if (!everLocked) freeLook = true; });
el.addEventListener('click', () => {
  if (viaTouch() || !G.started) return;
  if (!locked && !freeLook) requestLock();            // left click is for looking round (and struggling)
  else if (struggling()) mashGrab();
  else if (G.attached.length) shakeTap();
});
document.addEventListener('pointerlockchange', () => { locked = document.pointerLockElement === el; if (locked) { everLocked = true; freeLook = false; } });
let drag = null;
el.addEventListener('mousedown', (e) => { if (viaTouch()) return; if (e.button === 2) { if (G.started) toggleFlash(); return; } if (!locked && !freeLook) drag = { x: e.clientX, y: e.clientY }; });   // right click: the flashlight
addEventListener('mouseup', () => { drag = null; });
addEventListener('mousemove', (e) => {
  mouseX = null;
  if (viaTouch()) return;
  const k = SET.sens;
  if (locked) { input.lookX += e.movementX * 0.0022 * k; input.lookY += e.movementY * 0.0022 * k; }
  else if (freeLook) { if (e.target === el) { mouseX = e.clientX; input.lookX += e.movementX * 0.004 * k; input.lookY += e.movementY * 0.004 * k; } }
  else if (drag) { input.lookX += (e.clientX - drag.x) * 0.004 * k; input.lookY += (e.clientY - drag.y) * 0.004 * k; drag = { x: e.clientX, y: e.clientY }; }
});
document.addEventListener('mouseout', (e) => { if (!e.relatedTarget) mouseX = null; });
el.addEventListener('contextmenu', (e) => e.preventDefault());

// touch: left side = joystick, right side = look
const joy = { id: null, ox: 0, oy: 0, x: 0, y: 0 }, look = { id: null, x: 0, y: 0 };
const joyBase = $('#joy'), joyKnob = $('#joy i');
el.addEventListener('pointerdown', (e) => {
  if (e.pointerType !== 'touch') return;
  if (struggling()) mashGrab();           // caught or covered: tap anywhere on the screen
  else if (G.attached.length) shakeTap();
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
    input.lookX += (e.clientX - look.x) * 0.006 * SET.sens; input.lookY += (e.clientY - look.y) * 0.006 * SET.sens;
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
const setCrouch = (on) => { hold.crouch = on; $('#bCrouch').classList.toggle('on', on); };
const bindHold = (id, key) => {
  const b = $(id);
  const on = (e) => { e.preventDefault(); e.stopPropagation(); hold[key] = true; b.classList.add('on'); if (key === 'use') input.usePressed = true; };
  const off = (e) => { e.preventDefault(); hold[key] = false; b.classList.remove('on'); };
  b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
};
bindHold('#bRun', 'run'); bindHold('#bUse', 'use');
$('#bRadio').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); radioCall(); });
$('#bCrouch').addEventListener('pointerdown', (e) => { e.preventDefault(); setCrouch(!hold.crouch); });
$('#bFlash').addEventListener('pointerdown', (e) => { e.preventDefault(); toggleFlash(); });
$('#bSpray').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); useSpray(); });
$('#bThrow').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); throwCan(); });
$('#bCam').addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); snapPhoto(); });
document.querySelectorAll('[data-act="map"]').forEach((b) => b.addEventListener('click', toggleMap));
document.querySelectorAll('[data-act="bright"]').forEach((b) => b.addEventListener('click', toggleBright));
document.querySelectorAll('[data-act="marks"]').forEach((b) => b.addEventListener('click', () => { markers.visible = !markers.visible; b.classList.toggle('on', markers.visible); }));

function readInput(dt) {
  if (override) return override;
  if (freeLook && mouseX !== null) {
    const e = mouseX / innerWidth, edge = 0.08;
    if (e < edge) input.lookX -= (1 - e / edge) * 2.4 * dt;
    else if (e > 1 - edge) input.lookX += ((e - (1 - edge)) / edge) * 2.4 * dt;
  }
  input.mx = (keys.KeyD ? 1 : 0) - (keys.KeyA ? 1 : 0) + joy.x;
  input.mz = (keys.KeyW ? 1 : 0) - (keys.KeyS ? 1 : 0) - joy.y;
  input.run = !!(keys.ShiftLeft || keys.ShiftRight || hold.run);
  input.crouch = hold.crouch;
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
// what you're carrying: cans, the camera's shots left (status corner and the touch buttons)
function updateItems() {
  const bits = [];
  if (G.cans) bits.push(`캔 <b>${G.cans}</b>`);
  if (G.hasCam) bits.push(`카메라 <b>${G.shots}</b>`);
  $('#items').innerHTML = bits.join(' · ');
  $('#bThrow').classList.toggle('show', G.cans > 0); $('#bThrow b').textContent = G.cans;
  $('#bCam').classList.toggle('show', !!G.hasCam); $('#bCam').classList.toggle('empty', G.shots <= 0); $('#bCam b').textContent = G.shots;
}
// a can out of your hand, along your look, with a little lift
function throwCan() {
  if (!G.started || G.dead || G.won || G.kill || G.grab) return;
  if (G.cans <= 0) { tip('던질 캔이 없다'); return; }
  const d = new THREE.Vector3(); player.forward(d); d.normalize();
  const right = new THREE.Vector3(-d.z, 0, d.x).normalize();
  const from = camera.position.clone().addScaledVector(d, 0.35).addScaledVector(right, -0.12); from.y -= 0.12;
  if (!cans.throw(from, d)) return;
  G.cans--; G.stats.thrown++; sfx.whoosh(); updateItems();
}
// where a thrown can lands first: a clank that carries. Roaches come to the noise, and the centipede or the
// wolf spider goes over to look (unless it's right on you)
function canHit(x, y, z, first, k) {
  sfx.canClank(x, y, z, first ? Math.max(0.75, k) : k);
  if (!first) return;
  G.events.push({ x, z, r: 15 });
  const lured = centi.lure(x, z, swarms.nav) | spiders.lureWolf(x, z, player.pos);
  if (!G.tipped.canLure) { G.tipped.canLure = true; setTimeout(() => { if (G.started && !G.dead) tip(lured ? '소리 난 쪽으로 간다...' : '소리 난 쪽으로 몰려가겠지...'); }, 500); }
}
// the disposable camera: a blinding flash that scatters roaches, makes the ghost spider cower, sends the wolf
// back to the walls and stops the centipede for a moment (and makes whatever has you let go). The picture of
// whatever bug it caught goes into the notebook, taped onto its page.
function snapPhoto() {
  if (!G.started || G.dead || G.won || !G.hasCam) return;
  if (G.kill && !G.kill.escapable) return;
  if (G.shots <= 0) { tip('필름을 다 썼다'); return; }
  if (G.camCd > 0) return;                       // still winding on
  G.shots--; G.camCd = 1.3; G.stats.photos++;
  updateItems(); sfx.shutter(); buzz(30);
  const fx = $('#camFx'); fx.classList.remove('on'); void fx.offsetWidth; fx.classList.add('on');
  const o = camera.position.clone(), d = new THREE.Vector3(); player.forward(d); d.normalize();
  camFlash.position.copy(o).addScaledVector(d, 0.3); camFlash.intensity = 90;
  // what's in the picture: the rarest bug in view
  const subj = photoSubject(o, d);
  // the picture itself: drawn now with the flash on, the middle of the screen cut out
  if (subj) takePicture(subj);
  // the flash hits everything in front of you
  const nR = swarms.flashScatter(o, d);
  const sps = spiders.flash(o, d);
  const cS = centi.flashStun(o, d);
  for (const sp of sps) { const p = sp.s.bodyWorld; sfx.spiderFlinch(p.x, p.y, p.z); }
  if (cS) sfx.centiHiss(centi.head.x, centi.head.z);
  if (G.grab) { const sp = G.grab.sp; endGrab(true); if (sp !== gate) spiders.release(sp); msg('플래시에 놀라 떨어져 나갔다'); }
  else if (struggling() && G.kill) { sfx.centiHiss(centi.head.x, centi.head.z); centiRelease('spray'); }
  if (!subj && !nR && !sps.length && !cS) tip('...아무것도 안 찍혔다');
}
function photoSubject(o, d) {
  const inView = (p, range) => { const v = p.clone().sub(o), dist = v.length(); return dist < range && v.dot(d) / (dist || 1) > Math.cos(0.55) && canSee(p); };
  if (centi.active && centi.state !== 'dormant' && inView(centi.head.clone().setY(Math.max(0.3, centi.head.y)), 12)) return 'centi';
  for (const sp of spiders.spiders) if (inView(sp.s.bodyWorld, 12)) return sp.mode === 'wall' ? 'wolf' : 'ghost';
  if (gate.s && inView(gate.s.bodyWorld, 12)) return 'gate';
  if (!eggs.burstDone) for (const [x, y, z] of [[-7.6, 4.02, 62.6], [-6.7, 2.75, 61.3], [-9.5, 4.05, 63.2]]) if (inView(new THREE.Vector3(x, y, z), 10)) return 'eggs';
  for (const r of swarms.roaches) if (!['off', 'attached', 'escape'].includes(r.state) && inView(r.pos.clone().setY(Math.max(0.1, r.pos.y)), 7)) return 'roach';
  return null;
}
const photoCv = (() => { const c = document.createElement('canvas'); c.width = 320; c.height = 240; return c; })();
function takePicture(id) {
  withBright(() => renderer.render(scene, camera));
  // the middle of the frame at 4:3, onto a small print
  const W = el.width, H = el.height, ch = Math.min(H, W * 0.75) * 0.8, cw = ch * 4 / 3;
  const c = document.createElement('canvas'); c.width = 320; c.height = 240;
  const x = c.getContext('2d');
  x.drawImage(el, (W - cw) / 2, (H - ch) / 2, cw, ch, 0, 0, 320, 240);
  // a cheap film camera's look: warm, hard flash fall-off, grain, the date in orange
  x.globalCompositeOperation = 'multiply'; x.fillStyle = '#ffe6c4'; x.fillRect(0, 0, 320, 240);
  x.globalCompositeOperation = 'source-over';
  const v = x.createRadialGradient(160, 120, 60, 160, 120, 210); v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,.55)'); x.fillStyle = v; x.fillRect(0, 0, 320, 240);
  for (let i = 0; i < 1400; i++) { const a = Math.random() * 0.16; x.fillStyle = Math.random() < 0.5 ? `rgba(255,255,255,${a})` : `rgba(0,0,0,${a})`; x.fillRect(Math.random() * 320, Math.random() * 240, 1, 1); }
  const now = new Date(), two = (n) => String(n).padStart(2, '0');
  x.font = 'bold 15px monospace'; x.fillStyle = '#ff8c2e'; x.shadowColor = 'rgba(255,120,40,.8)'; x.shadowBlur = 4;
  x.fillText(`'${two(now.getFullYear() % 100)} ${two(now.getMonth() + 1)} ${two(now.getDate())}`, 214, 228);
  G.photos[id] = c;
  journal.setPhoto(id, c);
  if (!journal.has(id)) discover(id);
  if (!G.tipped['photo' + id]) { G.tipped['photo' + id] = true; setTimeout(() => { if (G.started && !G.dead) tip(`찍었다. 수첩에 붙여 뒀다 (${KEY.book})`); }, 700); }
}
function useSpray() {
  if (!G.started || G.dead || G.won) return;
  if (G.sprayCd > 0) return;
  if (G.spray <= 0) { sfx.spray(true); msg('스프레이가 다 떨어졌다...'); return; }
  if (G.kill && !G.kill.escapable) return;          // on hard, once it has you there is no reaching the can
  G.spray--; G.sprayCd = 0.7; G.revealT = 1.5; G.stats.spray++;      // the hiss gives a hiding place away
  updateHud();
  arms.sprayPuff(); sfx.spray();
  // the hit test comes from the eye along the view, the mist from the nozzle
  const o = camera.position.clone(), d = new THREE.Vector3(); player.forward(d);
  G.mistIn = 0.12; G.mistDir = d.clone();     // the can needs a moment to come up
  const hitR = swarms.sprayHit(o, d);
  const sp = spiders.spray(o, d);
  const lings = eggs.spray(o, d) + brood.spray(o, d);
  const c = centi.spray(o, d);
  if (G.grab && G.grab.sp === gate) { const p = gate.s.bodyWorld; sfx.spiderFlinch(p.x, p.y, p.z); endGrab(true); }
  else if (gate.spray(o, d)) { tip('거미줄이 너무 두껍다. 스프레이로는 안 된다'); const p = gate.s.bodyWorld; sfx.spiderFlinch(p.x, p.y, p.z); }
  if (sp.webs) { tip('거미줄이 녹아내린다', 'webmelt'); for (const w of spiders.webs) if (w.state === 'melting') sfx.webMelt(w.x, w.z); }
  if (G.grab && sp.spiders.includes(G.grab.sp)) endGrab(true);
  if (c) sfx.centiHiss(centi.head.x, centi.head.z);
  if (struggling() && G.kill) { sfx.centiHiss(centi.head.x, centi.head.z); centiRelease('spray'); }
  if (hitR + lings > 0) sfx.roachDie(hitR + lings);
  for (const s2 of sp.spiders) { const p = s2.s.bodyWorld; sfx.spiderFlinch(p.x, p.y, p.z); }
  if (hitR + lings + sp.spiders.length + (c ? 1 : 0) === 0 && !sp.webs) { /* missed */ }
}

// ------------------------------------------------------------------ grabbed by a spider: struggle 2 s
const releaseGrabber = (sp) => { if (sp === gate) gate.release(); else spiders.release(sp); };
function startGrab(sp) {
  if (dev.god) { releaseGrabber(sp); return; }
  G.grab = { sp, meter: 0.65, t: 0 };
  $('#grab .t').textContent = '거미가 덮쳤다!';
  G.attached.forEach((a) => swarms.drop(a.r, player.pos, player.pos)); G.attached.length = 0;
  sfx.grab(); shakeScreen(); buzz([90, 50, 140]);
  const h = $('#hit'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
  document.body.classList.add('grabbed');
  $('#grab').classList.add('show');
}
function struggling() { return !!G.grab || !!(G.kill && G.kill.escapable && G.kill.t > 0.45 && !G.kill.done); }
function mashGrab() {
  if (G.grab) { G.grab.meter = Math.min(1, G.grab.meter + 0.1); sfx.struggle(); }
  else if (struggling()) { G.kill.meter = Math.min(1, G.kill.meter + 0.085); sfx.struggle(); }
}
function endGrab(sprayed) {
  const g = G.grab;
  if (!g) return;
  G.grab = null;
  G.grabSafeT = 4;                       // a few seconds to get away before anything can grab you again
  document.body.classList.remove('grabbed');
  $('#grab').classList.remove('show');
  { const p = g.sp.s.bodyWorld; sfx.escape(p.x, p.y, p.z); }
  // the big one on the passage web lets go and you stagger back from it
  if (g.sp === gate) { gate.release(); player.place(Math.max(player.pos.x, GATE.x + 1.9), player.pos.z, player.yaw); }
  if (sprayed) { msg('스프레이로 떼어냈다. 살았다'); return; }
  if (g.sp !== gate) spiders.release(g.sp);
  msg('하아... 겨우 빠져나왔다');
  if (SET.diff === 'hard') hurt('붙잡혔을 때 스프레이를 썼어야 했다');      // only the hard game makes you pay for it
}

// ------------------------------------------------------------------ the results: a grade, your best, achievements
const ACH = [
  ['escape', '탈출', '처음으로 공장을 빠져나왔다', () => true],
  ['nodeath', '무사히', '한 번도 쓰러지지 않고 탈출', (r) => r.deaths === 0],
  ['nospray', '맨손', '스프레이를 한 번도 쓰지 않고 탈출', (r) => r.spray === 0],
  ['silent', '무전 침묵', '본부에 길을 한 번도 묻지 않고 탈출', (r) => r.radio === 0],
  ['can', '딴 데 봐', '빈 캔을 던져 벌레를 꾀어내고 탈출', (r) => r.thrown > 0],
  ['photo', '찰칵', '벌레 세 종류를 카메라로 찍고 탈출', (r) => r.kinds >= 3],
  ['collector', '기록 수집가', '수첩 6장과 녹음 5개를 모두 모으고 탈출', (r) => r.pages >= 6 && r.tapes >= 5],
  ['lee', '이정훈', '이정훈의 사원증을 가지고 탈출', (r) => r.lee],
  ['fast', '5분 컷', '5분 안에 탈출', (r) => r.time < 300],
  ['hard', '어려움', '어려움 난이도로 탈출', (r) => r.diff === 'hard'],
];
const GRADE_ORDER = ['C', 'B', 'A', 'S'];
function showResults() {
  const st = G.stats, r = {
    time: G.time, hits: st.hits, deaths: st.deaths, spray: st.spray, thrown: st.thrown, radio: st.radio, diff: SET.diff,
    pages: journal.count, tapes: tapes.filter((x) => x.played).length, lee: !!G.leeId, kinds: Object.keys(G.photos).length, photos: st.photos,
  };
  // the grade: a clean, quick, thorough run scores highest
  const score = 100 - 15 * r.deaths - 6 * r.hits - 6 * Math.max(0, r.time / 60 - 5) + 2 * r.pages + 2 * r.tapes + (r.lee ? 8 : 0);
  const grade = score >= 105 ? 'S' : score >= 85 ? 'A' : score >= 65 ? 'B' : 'C';
  const gEl = $('#grade'); gEl.textContent = grade; gEl.className = grade;
  $('#winTime').textContent = fmt(r.time);
  $('#winDiff').textContent = `난이도 ${D().label}`;
  $('#winSub').textContent = r.lee ? '셔터 밖으로 빠져나왔다 · 이정훈의 사원증과 함께' : '셔터 밖으로 빠져나왔다';
  // your best on this difficulty
  let best = {}; try { best = JSON.parse(localStorage.getItem('mandible.best') || '{}'); } catch (e) { /* */ }
  const b = best[SET.diff], better = !b || r.time < b.time, betterGrade = !b || GRADE_ORDER.indexOf(grade) > GRADE_ORDER.indexOf(b.grade);
  if (better || betterGrade) {
    best[SET.diff] = { time: better ? r.time : b.time, grade: betterGrade ? grade : b.grade };
    try { localStorage.setItem('mandible.best', JSON.stringify(best)); } catch (e) { /* */ }
  }
  const bEl = $('#winBest');
  bEl.textContent = !b ? '첫 기록' : better ? `새 최고 기록! (이전 ${fmt(b.time)})` : `최고 기록 ${fmt(b.time)} · ${b.grade}`;
  bEl.classList.toggle('new', !b || better);
  const rows = [['다친 횟수', r.hits], ['쓰러진 횟수', r.deaths], ['스프레이', `${r.spray}번`], ['던진 캔', r.thrown], ['사진', `${r.photos}장 (벌레 ${r.kinds}종)`],
    ['무전', `${r.radio}번`], ['수첩', `${r.pages} / 6`], ['녹음', `${r.tapes} / 5`], ['이정훈의 사원증', r.lee ? '가져옴' : '—']];
  $('#winStats').innerHTML = rows.map(([k, v]) => `<li><span>${k}</span><b>${v}</b></li>`).join('');
  // achievements (kept in this browser)
  let got = []; try { got = JSON.parse(localStorage.getItem('mandible.ach') || '[]'); } catch (e) { /* */ }
  const fresh = ACH.filter(([id, , , ok]) => !got.includes(id) && ok(r)).map(([id]) => id);
  got = got.concat(fresh);
  try { localStorage.setItem('mandible.ach', JSON.stringify(got)); } catch (e) { /* */ }
  $('#achN').textContent = `${ACH.filter(([id]) => got.includes(id)).length} / ${ACH.length}`;   // (not counting ones since taken out)
  $('#achList').innerHTML = ACH.map(([id, name, desc]) => `<li class="${fresh.includes(id) ? 'new' : got.includes(id) ? 'got' : ''}">${name}<small>${desc}</small></li>`).join('');
}

// ------------------------------------------------------------------ actions
function toggleFlash() {
  if (!G.started || G.cine) return;
  if (G.blackT > 0) tip('손전등도 안 켜진다...');
  if (!G.flashOn && G.drained) { if (window.__SFX) window.__SFX.click(false); tipLive(`손전등이 아직 뜨겁다 (${Math.max(1, Math.ceil((1 - G.battery) * 5))}초)`, '손전등이 아직 뜨겁다'); return; }
  G.flashOn = !G.flashOn;
  $('#bFlash').classList.toggle('on', G.flashOn);
  arms.toggleClick();
  if (window.__SFX) window.__SFX.click(G.flashOn);
}
let showMap = false, bright = false;
function toggleMap() { showMap = !showMap; if (showMap) paperMap.resize(); $('#paperMap').classList.toggle('show', showMap); if (showMap) sfx.padBeep(); document.querySelectorAll('[data-act="map"]').forEach((b) => b.classList.toggle('on', showMap)); }
function toggleBright() {
  bright = !bright;
  hemi.intensity = bright ? 1.5 : 0;
  roomLabels.visible = bright;
  scene.fog.density = bright ? 0.012 : 0.05;
  document.querySelectorAll('[data-act="bright"]').forEach((b) => b.classList.toggle('on', bright));
}
// a generator coming on overloads the old wiring: every light in the place dies for 3 s
// (the flashlight too). The first time, something drops on its line in front of you meanwhile;
// and when the lights come back, the nearest roaches are suddenly a lot closer.
function startBlackout() {
  G.blackT = 3.0; G.backT = 0; buzz(90);
  G.blackPhantom = !G.blackDone; G.blackDone = true;
  // the first time: you can't look away. The view is held (and turned) on the spot where it comes down
  // until the light is back on it and it has gone back up; the flashlight is on for when the power returns
  if (G.blackPhantom && !G.grab && !G.kill) {
    const rm = ROOMS[roomAt(player.pos.x, player.pos.z)] || ROOMS.machine;
    const sp = Phantom.spot(camera.position, player.yaw, rm);
    G.cine = { t: 0, rm, spot: sp, at: new THREE.Vector3(sp.x, Math.max(1.0, camera.position.y + 0.15) - 0.1, sp.z), endT: -1 };
    G.attached.forEach((a) => swarms.drop(a.r, player.pos, player.pos)); G.attached.length = 0;     // (they drop off in the dark: nothing over the view)
    if (G.drained) { G.drained = false; G.battery = Math.max(G.battery, 0.5); }
    if (!G.flashOn) { G.flashOn = true; $('#bFlash').classList.add('on'); }
    if (showMap) toggleMap(); if (journal.open) journal.toggle(false);
  }
  for (const r of Object.values(reds)) r.light.intensity = 0;
  sfx.blackout();
  setTimeout(() => { if (G.blackT > 0) tip('...불이 다 나갔다'); }, 500);
}
function endBlackout() {
  G.blackT = 0; G.backT = 0.4;
  sfx.powerBack();
  phantom.lightsBack();
  if (G.cine && phantom.active) { setTimeout(() => { if (G.cine) { shakeScreen(); buzz([60, 30, 120]); sfx.violinStab(); } }, 250); }
  if (swarms.ambushNear(player.pos, player.yaw)) tip('...언제 이렇게 가까이 왔지');
}
function genOn(g) {
  g.on = true; G.lostT = 0; G.stuckT = 0;
  G.gens++;
  G.events.push({ x: g.x, z: g.z, r: 30 });
  g.led.material.emissive.set(0x30ff60);
  const r = reds[g.room];
  r.on = true;
  indicators[G.gens - 1].material.emissive.set(0x30ff60);
  msg(G.gens === 3 ? '마지막 발전기다. 됐다!' : `발전기가 돌아간다. ${['', '두 대', '한 대'][G.gens]} 남았다`);
  startBlackout();
  sfx.generatorStart(g.x, g.z); buzz([40, 60, 120]);
  tip('발전기 소리에 벌레들이 몰려오겠다...', 'gen');
  if (g.room === 'hall' && !centi.active) { sfx.silence(1.4); setTimeout(() => { if (!G.dead) centi.wake(); }, 1300); }
  if (g.room === 'lab') {
    // in the dark, the centipede comes for you: by the time the power's back it's at the lab door
    setTimeout(() => { if (!G.dead && eggs.burst()) sfx.eggBurst(-7.6, 4, 62.6); centi.enrage(player.pos); centi.toDoor(LAB.x, LAB.zc); }, 600);
    // the power back, the duct's fans start and blow the grille off its mouth (the emergency door stays
    // jammed). The view is held on the centipede trying to get in at the door, then turned to the vent
    setTimeout(() => {
      if (G.dead || G.won) return;
      duct.openVent(); sfx.ductBang(DUCT.mouth.x, 0.5, DUCT.wallZ); sfx.canClank(DUCT.mouth.x, 0.2, DUCT.wallZ + 1.6, 1);
      msg('환풍기가 돌기 시작했다... 환기구 덮개가 떨어져 나갔다');
      labDoor.angry = true;                                           // (it heard that)
      if (centi.active && centi.state === 'prowl') { centi.pushT = Math.max(centi.pushT || 0, 2.6); sfx.centiScreech(centi.head.x, centi.head.z); }
      const atDoor = () => (centi.active && Math.hypot(centi.head.x - LAB.x, centi.head.z - LAB.zc) < 7 ? new THREE.Vector3(centi.head.x, 0.7, centi.head.z) : new THREE.Vector3(LAB.x, 1.3, LAB.zc));
      if (!G.flashOn && !G.drained) { G.flashOn = true; $('#bFlash').classList.add('on'); }
      if (!G.grab && !G.kill) G.lookSeq = { t: 0, shots: [{ p: atDoor, end: 2.2, zoom: 0.5 }, { p: () => new THREE.Vector3(DUCT.mouth.x, 0.45, DUCT.wallZ), end: 3.6 }] };
    }, 3150);
  }
  if (G.gens === 3) {
    G.shutterOpening = true; sfx.doorRumble(0, 0.5, 3.4);
    setTimeout(() => { if (!G.dk.in) tip('셔터는 하역장... 너무 멀다. 환기구로 기어가자', 'ductgo'); }, 6600);
  }
  { const n = G.gens; setTimeout(() => { if (!G.dead && !G.won && G.gens === n) voice.say(RADIO_GEN[n - 1]); }, 4300); }
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
  { const c = cans.nearest(player.pos, 1.5); if (c) consider('can', c, c.pos.x, c.pos.z, 1.5); }
  // notes and recorders only from inside the same room (not through a wall)
  const pr = roomAt(player.pos.x, player.pos.z), same = (x, z) => !pr || roomAt(x, z) === pr;
  for (const n of noteMeshes) if (!n.read && same(n.x, n.z)) consider('note', n, n.x, n.z, 1.9);
  for (const r of tapes) if (!r.played && same(r.x, r.z)) consider('tape', r, r.x, r.z, 1.9);
  if (!refill.taken) consider('refill', refill, refill.x, refill.z, 1.6);
  if (!camItem.taken && same(camItem.x, camItem.z)) consider('camera', camItem, camItem.x, camItem.z, 1.8);
  if (!G.leeId) consider('leeId', lee, LEE.id.x, LEE.id.z, 1.7);
  if (!labDoor.broken) consider('labdoor', labDoor, LAB.x + (player.pos.x < LAB.x ? -0.3 : 0.3), LAB.zc, 2.2);
  return best;
}
const useLabel = () => (touch ? 'E · 손 버튼' : 'E');   // the PC key shows on touch screens too

// ------------------------------------------------------------------ damage, death
const dev = { god: false, battery: false, noclip: false, freeze: false, fast: false, info: false };
// ---- lamp checkpoints: pulling a lamp's lever saves there; die and you get up under it again.
// Progress stays (generators, notes, the refill, snapped threads, the egg sac, dead roaches),
// health is back to 3, the spray keeps what was left, the lamp comes on again for 10 s and
// every bug goes back to where it started.
function respawnAtLamp(l) {
  clearTips(); voice.clear();
  Object.assign(G, { dead: false, kill: null, chasing: false, chaseLen: 0, hp: D().hp, attached: [], attachCd: 0, grab: null, sprayCd: 0, webSlowT: 0, lingSlow: 0, lingT: 9, holdT: 0, grabSafeT: 0, events: [], hidden: false, revealT: 0, hiddenT: 0, drop: null });
  if (!labDoor.broken) { labDoor.smash = -1; labDoor.closedT = 0; labDoor.panel.position.set(0, 0, 0); }
  // the duct can be crawled again (what already happened in it stays done)
  Object.assign(G.dk, { in: false, parked: false, F: null, followAt: 0, broke: false, landed: false, ambushed: false });
  document.body.classList.remove('grabbed'); $('#grab').classList.remove('show');
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
  G.blackT = 0; G.backT = 0; phantom.hide(); G.cine = null;
  G.started = true;
  sfx.respawn();
  msg('...정신이 든다. 전등 아래다');
}

function hurt(reason = '뛰는 소리에 바퀴들이 몰려왔다') {
  if (dev.god || G.dead) return;
  G.hp--; G.stats.hits++;
  sfx.hurt(); buzz(220);
  const f = $('#hit'); f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  $('#hurt').style.opacity = (1 - G.hp / D().hp) * 0.84;
  if (G.hp <= 0) die(reason);
}
function die(deathTip) {
  if (G.dead) return;
  G.dead = true; G.timing = false; G.stats.deaths++;
  sfx.death(); buzz(500);
  if (G.grab) { if (G.grab.sp === gate) gate.release(); G.grab = null; document.body.classList.remove('grabbed'); $('#grab').classList.remove('show'); }
  G.attached.length = 0;
  $('#crawl').classList.remove('show');
  $('#dead').classList.add('show');
  $('#dead .s').textContent = '';
  setTimeout(() => { $('#dead .s').textContent = deathTip; }, 1600);
  setTimeout(() => { if (G.checkpoint) respawnAtLamp(G.checkpoint); else { resetGame(); G.started = true; } }, 3800);
}
// after one climbs on or is shaken off, no other can climb on for a few seconds
const ATTACH_CD = 3.5;
function onAttach(r) {
  if (dev.god || G.dead || G.attached.length >= 3 || G.attachCd > 0 || G.cine || G.lookSeq) return false;   // (not while the view is held on something)
  G.attachCd = ATTACH_CD;
  G.attached.push({ r, age: 0, shake: 0, rev: 0, lastSign: 0, taps: 0 });
  sfx.attach(); buzz(45); shudJolt = 1.8; shudNext = 0.6;
  msg(touch ? '얼굴에 붙었다! 화면을 좌우로 흔들어 떼어내!' : '얼굴에 붙었다! 마우스를 흔들어 떼어내!');
  return true;
}
// caught by the centipede: your head is turned to it as it rears up, jaws working, then it strikes
function startCentiKill(deathTip) {
  if (G.dead || G.kill || G.centiCd > 0) return;
  if (dev.god) return;
  if (G.grab) endGrab(true);
  if (journal.open) journal.toggle(false);
  buzz([60, 40, 60, 40, 220]);
  // below hard it can be fought off: struggle (click / tap / Space) or spray it, and it lets go
  const escapable = SET.diff !== 'hard';
  G.kill = { t: 0, tip: deathTip, struck: false, y0: camera.position.y, fell: false, beat: 0, from: camera.position.clone(), roll: 0, escapable, meter: 0.6, done: false };
  if (escapable) $('#grab .t').textContent = '지네가 몸을 감았다!';
  centi.kill(camera.position);
  sfx.centiScreech(centi.head.x, centi.head.z); sfx.grab();
  shakeScreen();
}
// caught by the centipede (about 2.6 s): it rears up in your face, knocks you down, drags you in and
// coils round you on the floor; the head hangs over you, lowers, and strikes
function centiKillStep(dt) {
  const K = G.kill, h = centi.head, cam = camera.position;
  K.t += dt;
  const sm = (x) => { x = Math.min(1, Math.max(0, x)); return x * x * (3 - 2 * x); };
  // knocked down: falling, then on your back with your head tipped to one side
  const fall = Math.min(1, Math.max(0, (K.t - 0.45) / 0.4)), fallK = fall * fall;
  // dragged toward its body in two jerks
  const body = centi.c.rPos[24] || h, toB = new THREE.Vector3(body.x - K.from.x, 0, body.z - K.from.z);
  const tl = toB.length() || 1; toB.divideScalar(tl);
  const drag = Math.min(tl - 0.6, 0.28 * sm((K.t - 0.9) / 0.18) + 0.22 * sm((K.t - 1.25) / 0.18));
  cam.set(K.from.x + toB.x * Math.max(0, drag), K.y0 - (K.y0 - 0.3) * fallK + (fall >= 1 ? 0.02 * Math.max(0, Math.sin((K.t - 0.85) * 18)) * Math.exp(-(K.t - 0.85) * 6) : 0), K.from.z + toB.z * Math.max(0, drag));
  if (fall > 0.3 && !K.drop) { const a = player.yaw - 1.2; K.drop = new THREE.Vector3(cam.x + Math.sin(a) * 0.7, 0.07, cam.z + Math.cos(a) * 0.7); }
  if (fall >= 1 && !K.fell) {
    K.fell = true; shakeScreen();
    if (sfx.ctx) { sfx.tone({ dest: sfx.sfx, f0: 85, f1: 38, dur: 0.3, gain: 0.9, attack: 0.004 }); sfx.burst({ dest: sfx.sfx, dur: 0.18, f: 400, q: 0.8, type: 'lowpass', gain: 0.6, buf: sfx.brown }); }
  }
  if (centi.c.kill) centi.c.kill.cam.copy(cam);
  // always looking at the head
  const yaw = Math.atan2(h.x - cam.x, h.z - cam.z), pitch = Math.atan2(h.y - cam.y, Math.hypot(h.x - cam.x, h.z - cam.z));
  let dy = yaw - player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  const k = Math.min(1, dt * (K.t < 0.5 ? 9 : 5));
  player.yaw += dy * k; player.pitch += (THREE.MathUtils.clamp(pitch, -0.6, 1.3) - player.pitch) * k;
  K.roll += (0.45 * fallK - K.roll) * Math.min(1, dt * 6);
  const jit = K.t > 1.5 ? 0.02 : 0.01;
  camera.quaternion.setFromEuler(new THREE.Euler(player.pitch + (Math.random() - 0.5) * jit, player.yaw + Math.PI + (Math.random() - 0.5) * jit, K.roll, 'YXZ'));
  // pinned: legs all over you, the edges going dark, your heart going
  if (K.t > 0.9) {
    const n = Math.min(3, 1 + (K.t - 0.9) * 1.6);
    const cr = $('#crawl'); cr.style.setProperty('--n', n.toFixed(2)); cr.classList.add('show');
    $('#hurt').style.opacity = Math.min(0.9, 0.3 + (K.t - 0.9) * 0.4);
    if ((K.beat -= dt) <= 0) { if (sfx.ctx) sfx.heartbeat(1); K.beat = Math.max(0.28, 0.55 - (K.t - 0.9) * 0.18); }
  }
  if (K.escapable) {
    // fight it: the meter drains; keep it up to the end (or fill it) and it lets go, let it empty and it bites
    if (K.t > 0.9 && !K.done) {
      $('#grab').classList.add('show');
      K.meter -= dt * 0.45 * D().mash;               // on normal you have to fight; on easy it barely needs it
      $('#grab .bar i').style.width = `${Math.max(0, K.meter) * 100}%`;
      if (K.meter >= 1 || K.t >= 2.3) { centiRelease('kick'); return; }
      if (K.meter <= 0) {
        K.done = true; $('#grab').classList.remove('show');
        sfx.centiScreech(h.x, h.z); sfx.scareHit(); shakeScreen();
        const el = $('#hit'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
        hurt(K.tip);
        if (G.dead) { G.kill = null; $('#crawl').classList.remove('show'); return; }
        K.bitT = K.t;
      }
    }
    if (K.done && K.t - K.bitT > 0.45) centiRelease('bitten');
    return;
  }
  if (!K.struck && K.t >= 2.42) {
    K.struck = true;
    sfx.centiScreech(h.x, h.z); sfx.scareHit(); sfx.hurt(); shakeScreen();
    const el = $('#hit'); el.classList.remove('on'); void el.offsetWidth; el.classList.add('on');
  }
  if (K.t >= 2.65) { const tipTxt = K.tip; G.kill = null; $('#crawl').classList.remove('show'); die(tipTxt); }
}
// it lets go: you kick free (or it bit you, or the spray in its face), get up where you were dragged to
function centiRelease(how) {
  const K = G.kill; if (!K) return;
  G.kill = null; G.centiCd = 5;
  $('#grab').classList.remove('show'); $('#crawl').classList.remove('show');
  $('#hurt').style.opacity = (1 - G.hp / D().hp) * 0.84;
  centi.release();
  sfx.escape(centi.head.x, 0.4, centi.head.z); shakeScreen();
  const c = camera.position;
  if (swarms.nav.free(c.x, c.z)) player.place(c.x, c.z, player.yaw);
  G.rise = { t: 0, y0: c.y };
  msg(how === 'spray' ? '머리에 스프레이를 쐈다! 빠져나왔다' : how === 'bitten' ? '물렸다... 그래도 빠져나왔다' : '걷어차고 빠져나왔다! 뛰어!');
}
function shakeScreen() { if (SET.shake === false) return; document.body.classList.remove('shake'); void document.body.offsetWidth; document.body.classList.add('shake'); }

// ------------------------------------------------------------------ minimap
// the map: a tablet held up, its floor plan centred on you (padmap.js); what it marks depends on the difficulty
const paperMap = createPadMap({ canvas: $('#paperMap canvas'), ROOMS, DOORS, SPOTS });
function drawMap() {
  paperMap.draw({ x: player.pos.x, z: player.pos.z, yaw: player.yaw, room: roomAt(player.pos.x, player.pos.z), gens: genMeshes, lamps, gensOn: G.gens, emergency: G.emergency > 0.7, duct: duct.open ? DUCT : null, inDuct: G.dk.in, t });
}

// ------------------------------------------------------------------ loop
let baseFov = 70, fovK = 1;
// a held look can close in (its shot's zoom); otherwise the view eases back out
function updateZoom(dt) {
  const q = G.lookSeq, shot = q && q.shots.find((s) => q.t < s.end), want = (shot && shot.zoom) || 1;
  if (Math.abs(want - fovK) < 0.002) return;
  fovK += (want - fovK) * Math.min(1, dt * 3);
  camera.fov = baseFov * fovK; camera.updateProjectionMatrix();
}
function resize() {
  renderer.setSize(innerWidth, innerHeight); SILK_RES.set(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  baseFov = innerWidth < innerHeight ? 80 : 70;
  camera.fov = baseFov * fovK;
  camera.updateProjectionMatrix();
  paperMap.resize();
  faceBugs.resize();
  if (intro) intro.resize();
}
addEventListener('resize', resize);
resize();

const ray = new THREE.Raycaster();
const levelMeshes = [...levelGroup.children, shutter, emDoor, ...duct.meshes];
// empty cans to throw (cans.js)
const cans = createCans(scene, levelMeshes);
// team 2's disposable camera, on the warehouse table by the machine room door: 3 shots of flash
const camItem = (() => {
  const c = document.createElement('canvas'); c.width = 128; c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#1d6b3a'; x.fillRect(0, 0, 128, 64); x.fillStyle = '#f2c21b'; x.fillRect(0, 22, 128, 20);
  x.fillStyle = '#111'; x.font = 'bold 13px sans-serif'; x.fillText('FILM 27', 8, 37); x.fillStyle = '#fff'; x.fillText('2조', 92, 15);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const g = new THREE.Group();
  g.add(new THREE.Mesh(boxGeom(0.13, 0.068, 0.036, 0, 0, 0), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.6 })));
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.02, 0.016, 18).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4 }));
  lens.position.set(-0.02, -0.004, 0.024);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.012, 18), new THREE.MeshStandardMaterial({ color: 0x0c1520, metalness: 0.9, roughness: 0.08 }));
  glass.position.set(-0.02, -0.004, 0.0325);
  const flashW = new THREE.Mesh(boxGeom(0.032, 0.016, 0.004, 0.038, 0.018, 0.019), new THREE.MeshStandardMaterial({ color: 0xe8eef2, roughness: 0.2, emissive: new THREE.Color(0x9aa6b0), emissiveIntensity: 0.3 }));
  const wheel = new THREE.Mesh(new THREE.CylinderGeometry(0.009, 0.009, 0.012, 14), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.7 }));
  wheel.position.set(0.045, 0.039, -0.006);
  g.add(lens, glass, flashW, wheel);
  g.position.set(11.3, 0.96, 21.0); g.rotation.y = -1.25;
  g.children[0].castShadow = true;
  scene.add(g);
  return { x: 11.3, z: 21.0, g, taken: false };
})();
const camFlash = new THREE.PointLight(0xf2f5ff, 0, 18, 1.2);
scene.add(camFlash);
// things that may not be there (visions.js)
const visions = createVisions(scene, { canSee, levelMeshes, colliders });
// more of the dark (dread.js): his voice from the vents, something outside your hiding place, the flashlight
// stuttering near them, something crawling over the ceiling
const dread = createDread(scene, { sfx, voice, canSee });
const hideSpots = colliders.filter((c) => c.hide);
// a chemical light stick left by each hiding place (the team before you marked them). Each glows faintly;
// one shared weak light sits at the stick nearest you, so from under a table you can watch what is
// prowling round outside. The bugs don't care about it (it isn't part of what they treat as light).
const glow = (() => {
  const mat = new THREE.MeshStandardMaterial({ color: 0x3a5a22, emissive: 0xb4ff5c, emissiveIntensity: 1.6, roughness: 0.4 });
  const halo = (() => {
    const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32); gr.addColorStop(0, 'rgba(180,255,92,0.55)'); gr.addColorStop(1, 'rgba(180,255,92,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    return new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
  })();
  const stickG = new THREE.CapsuleGeometry(0.011, 0.13, 4, 8); stickG.rotateZ(Math.PI / 2);
  const haloG = new THREE.PlaneGeometry(0.7, 0.7); haloG.rotateX(-Math.PI / 2);
  const sticks = [];
  const put = (c, x, z, ry) => {
    const m = new THREE.Mesh(stickG, mat); m.position.set(x, 0.012, z); m.rotation.y = ry; scene.add(m);
    const h = new THREE.Mesh(haloG, halo); h.position.set(x, 0.006, z); h.renderOrder = 2; scene.add(h);
    sticks.push({ c, x, z });
  };
  for (const c of hideSpots) {
    const long = c.z1 - c.z0 > 4;               // conveyor lines: a stick every 5 m, side to side
    if (long) for (let z = c.z0 + 2.5, k = 0; z < c.z1 - 1; z += 5, k++) put(c, k % 2 ? c.x0 - 0.18 : c.x1 + 0.18, z, 1.2 + k);
    else {                                      // a table: on the floor beside it, on an open side
      const xc = (c.x0 + c.x1) / 2, zc = (c.z0 + c.z1) / 2;
      const at = [[c.x1 + 0.35, zc + 0.2], [c.x0 - 0.35, zc - 0.2], [xc + 0.2, c.z1 + 0.35], [xc - 0.2, c.z0 - 0.35]].find(([x, z]) => swarms.nav.free(x, z)) || [c.x1 + 0.2, zc];
      put(c, at[0], at[1], 0.6);
    }
  }
  const light = new THREE.PointLight(0xccffa0, 0, 7.5, 1.3);
  scene.add(light);
  let cur = null;
  return {
    light,
    get at() { return cur; },
    update(dt) {
      let best = null, bd = 6;
      if (G.started && !G.dead) for (const s of sticks) { const d = Math.hypot(s.x - player.pos.x, s.z - player.pos.z); if (d < bd) { bd = d; best = s; } }
      if (best !== cur && light.intensity < 0.02) { cur = best; if (cur) light.position.set(cur.x, 0.35, cur.z); }
      const want = cur && best === cur ? 0.8 : 0;
      light.intensity += (want - light.intensity) * Math.min(1, dt * 3);
    },
  };
})();
// turning the view toward something worth seeing (the dead man, a spider, the brood):
// eases round over ~0.8 s and holds a moment, ignoring your own looking meanwhile
let focus = null;
const seeRay = new THREE.Raycaster();
function canSee(p) {
  const o = camera.position, d = p.distanceTo(o);
  seeRay.set(o, p.clone().sub(o).divideScalar(d)); seeRay.far = d - 0.4;
  return seeRay.intersectObjects(levelMeshes, false).length === 0;
}
// (stab: it's a bug you're being made to look at: a shriek of violins with it)
function lookToward(p, hold = 0.5, stab = false) {
  if (!G.started || G.dead || G.grab) return;
  focus = { p: p.clone(), t: 0, end: 0.8 + hold };
  if (stab) sfx.violinStab();
}
// a glance over your shoulder: the head turns, you keep running the way you were going (camera only)
const UPV = new THREE.Vector3(0, 1, 0);
function glanceAt(p) {
  const f = new THREE.Vector3(); player.forward(f);
  let d = Math.atan2(p.x - camera.position.x, p.z - camera.position.z) - Math.atan2(f.x, f.z);
  d = Math.atan2(Math.sin(d), Math.cos(d));
  G.glance = { t: 0, ang: THREE.MathUtils.clamp(d, -2.7, 2.7) };
}
// ---- the air duct, once the last generator runs (see duct.js). The crawl is scripted: the centipede
// can't follow you in, so it rams the mouth, then goes along outside the metal knocking, gets ahead
// of you and hits the bend, pushes its head in through a side grille (light makes it pull back, get
// too close and it bites), and at the end the floor grille gives way: down through the dock's ceiling,
// with the shutter open ahead of you and the centipede coming out of the dock's wall behind.
// ---- the lab door (see labDoor): sliding; the centipede at it; battering it down
function updateLabDoor(dt) {
  const D_ = labDoor;
  if (!D_.broken) {
    D_.k += THREE.MathUtils.clamp(D_.want - D_.k, -dt / 0.9, dt / 0.9);
    const zc = D_.shut + (D_.open - D_.shut) * D_.k, edge = zc - D_.W / 2;      // (its leading edge)
    D_.g.position.z = zc;
    D_.col.z0 = Math.max(LAB.z0, edge); D_.col.off = edge > LAB.z1 - 0.05;
  }
  const shut = !D_.broken && D_.k < 0.08;
  if (shut && centi.active && D_.smash < 0) {
    if (centi.state === 'prowl') {
      // right outside: scratching, feeling along the steel, now and then a knock
      D_.closedT += dt;
      D_.scratchT -= dt;
      if (D_.scratchT <= 0) { D_.scratchT = 0.9 + Math.random() * 1.4; if (Math.random() < 0.35) sfx.ductKnock(LAB.x + 0.1, 1.0, centi.head.z, 0.6); else sfx.ductScrape(LAB.x + 0.1, 0.8, centi.head.z, 0.7); }
      if (D_.closedT > 1.5) tip('...문 밖에서 긁는 소리가 난다', 'labscratch');
      if (D_.closedT > 12) tip('문이 오래 못 버틸 것 같다... 서두르자', 'labhurry');
      if (D_.angry || D_.closedT > 22) D_.smash = 0;
    } else if (Math.abs(centi.head.x - LAB.x) < 1.4 && Math.abs(centi.head.z - LAB.zc) < 2) D_.smash = 0;     // coming through after you
  }
  if (D_.smash >= 0 && !D_.broken) {
    const s0 = D_.smash; D_.smash += dt;
    // blow after blow, the steel jumping in its rail, till it gives (time enough to get into the vent)
    for (const at of [0, 1.6, 3.2, 4.8, 6.4, 8.0]) if (s0 <= at && D_.smash > at) {
      sfx.ductBang(LAB.x, 1.2, LAB.zc); sfx.doorRumble(LAB.x, LAB.zc, 0.4); shakeScreen(); buzz([50, 30, 90]);
      if (at === 0) { tip('문을 들이받는다!!'); sfx.centiScreech(LAB.x + 1, LAB.zc); }
    }
    D_.panel.position.x = -(0.04 + 0.01 * D_.smash) * Math.max(0, Math.sin((D_.smash % 1.6) * 30)) * Math.exp(-(D_.smash % 1.6) * 6);
    if (D_.smash > 8.8) breakLabDoor();
  }
  // the bulb: on once the last generator's power is back, flickering, jumping with every blow
  const lit = G.gens >= 3 && G.blackT <= 0 ? (Math.random() < 0.06 || (D_.smash >= 0 && (D_.smash % 1.6) < 0.15) ? 0.15 : 1) : 0;
  D_.light.intensity = 7 * lit; D_.bulb.material.emissiveIntensity = 2 * lit;
  if (D_.broken && D_.fall < 1) {
    D_.fall = Math.min(1, D_.fall + dt / 0.55);
    const e = D_.fall * D_.fall;
    D_.panel.rotation.z = (Math.PI / 2 - 0.04) * e; D_.panel.position.set(-0.3 * e, 0.05 * e, 0);
  }
}
function breakLabDoor() {
  const D_ = labDoor;
  D_.broken = true; D_.fall = 0; D_.col.off = true; D_.smash = -1;
  sfx.ductBang(LAB.x, 1, LAB.zc); sfx.canClank(LAB.x - 1.5, 0.1, LAB.zc, 1); sfx.centiScreech(LAB.x, LAB.zc); shakeScreen(); buzz([80, 40, 200]);
  msg('문이 부서졌다!!');
  if (centi.state === 'prowl') { centi.state = 'chase'; centi.lostT = 0; }
}
function freshDuct() { return { in: false, outT: 0, seen: false, parked: false, followAt: 0, F: null, saidF: false, cornerWait: 0, cornerDone: false, poked: false, pokeT: 0, pokeGo: false, popped: false, bit: false, pokeTip: false, after: false, broke: false, landed: false, ambushAt: 0, ambushed: false }; }
function updateDuct(dt) {
  const K = G.dk, P = player.pos;
  duct.update(dt, t);
  const live = G.started && !G.dead && !G.won && duct.open;
  const inside = live && !G.drop && ductInside(P.x, P.z), s = inside ? ductS(P.x, P.z) : 0;
  sfx.ductAir(inside ? Math.min(1, s / 2) : 0);
  if (!live) return;
  K.in = inside && s > 0.6;
  if (!K.in && !K.seen && !K.landed && Math.hypot(P.x - DUCT.mouth.x, P.z - DUCT.wallZ) < 3.2) { K.seen = true; tip('환기구다... 저기로 기어 들어가자', 'ductin'); }
  K.outT = K.in ? 0 : K.outT + dt;
  // in: too narrow for it
  if (K.in && !K.parked) {
    K.parked = true;
    const rams = centi.blocked(DUCT.mouth, swarms.nav);
    if (!K.cornerDone && !K.followAt) K.followAt = t + (rams ? 4.2 : 1.2);
  }
  // out again: it comes looking (and if it's still at the mouth, it's right there)
  if (!K.in && K.parked && !K.landed && !G.drop) {
    if (centi.state === 'ram') { centi.state = 'chase'; centi.lostT = 0; }
    if (K.outT > 2.5) { K.parked = false; K.F = null; if (centi.state === 'gone' || centi.state === 'poke') centi.regroup(P); }
  }
  // outside the metal: its legs on the far side of the west wall, knocking, catching you up and going on past
  if (K.in && !K.F && !K.cornerDone && K.followAt && t > K.followAt && s > 2 && s < 10) K.F = { on: true, x: DUCT.x0 - 0.6, z: Math.min(DUCT.wallZ + 0.8, P.z + 3.5), v: 2.4, knockT: 0.5 };
  const F = K.F;
  if (F && F.on && K.in) {
    const behind = F.z - P.z;
    F.z = Math.max(DUCT.z1 + 0.6, F.z - (1.7 + Math.max(0, behind) * 0.5) * dt);
    F.knockT -= dt;
    if (F.knockT <= 0) {
      const d = Math.hypot(F.x - P.x, F.z - P.z);
      F.knockT = 0.3 + Math.random() * 0.7;
      if (Math.random() < 0.2) sfx.ductScrape(DUCT.x0, 0.4, F.z, 0.6);
      else sfx.ductKnock(DUCT.x0, 0.2 + Math.random() * 0.6, F.z, Math.max(0.2, 1 - d / 5));
      if (d < 1.6) G.ductJolt = Math.max(G.ductJolt, 0.014);
      if (!K.saidF) { K.saidF = true; setTimeout(() => { if (G.dk.in) tip('...밖에서 따라온다'); }, 900); }
    }
    if (F.z <= DUCT.z1 + 0.6) { F.on = false; K.cornerWait = t; }    // at the bend: and then nothing
  }
  if (!K.cornerDone && K.in && s > 11.6 && !K.cornerWait) K.cornerWait = t - 1;
  // the bend: two blows on the wall right in front of you, the metal buckling in
  if (!K.cornerDone && K.cornerWait && t - K.cornerWait > 1.1 && K.in && s > 10.6) {
    K.cornerDone = true; K.F = null;
    const bx = DUCT.mouth.x, bz = DUCT.z0;
    sfx.ductBang(bx, 0.45, bz - 0.3); duct.dent(0.08); shakeScreen(); buzz([80, 40, 160]); G.ductJolt = 0.05;
    lookToward(new THREE.Vector3(bx, 0.45, bz), 1.6);                  // (the view turned to the metal caving in)
    setTimeout(() => { if (G.dead || G.won) return; sfx.ductBang(bx + 0.2, 0.35, bz - 0.3); sfx.centiScreech(bx, bz - 0.6, 0.05); duct.dent(0.17); G.ductJolt = 0.07; buzz(200); }, 650);
    setTimeout(() => { if (G.dk.in) tip('...벽 너머에 있다. 오른쪽으로, 계속 가자'); }, 1900);
  }
  // the side grille: a few taps ahead, then its head comes through
  const g = DUCT.grate;
  if (K.cornerDone && !K.poked && K.in && P.x > g.x - 3.3) {
    K.poked = true; K.pokeT = t;
    sfx.ductKnock(g.x, 0.4, g.z + 0.3, 0.5);
    setTimeout(() => { if (!G.dead && !G.won) sfx.ductKnock(g.x + 0.2, 0.5, g.z + 0.3, 0.8); }, 300);
  }
  if (K.poked && !K.pokeGo && t - K.pokeT > 0.5) { K.pokeGo = true; if (K.in) centi.pokeAt(g.x, g.z + 0.1, 0, -1, g.x - 0.7, g.z + 1.8); }
  if (centi.state === 'poke' && centi.poke) {
    const pk = centi.poke, h = centi.head;
    if (!K.popped && (h.z - g.z) < 0.05) {
      K.popped = true; duct.popSide(); lookToward(new THREE.Vector3(g.x, 0.4, g.z + 0.2), 1.4);   // (and to its head coming through)
      sfx.ductBang(g.x, 0.5, g.z); sfx.centiScreech(g.x, g.z - 0.3, 0.05); shakeScreen(); buzz([60, 30, 200]); G.ductJolt = 0.05;
    }
    if (pk.out && !pk.back) {
      if (!K.pokeTip && t - K.pokeT > 2.4) { K.pokeTip = true; tip(G.flashOn ? '머리에 손전등을 똑바로 비추자' : `손전등을 켜서 머리에 비추자 (${KEY.flash})`); }
      if (t - K.pokeT > 11) centi.retract();                 // (it gives up in the end)
      if (!K.bit && Math.hypot(h.x - P.x, h.z - P.z) < 0.78) {
        K.bit = true; centi.retract();
        sfx.centiScreech(h.x, h.z); sfx.scareHit(); shakeScreen(); msg('물렸다!');
        P.x = Math.max(DUCT.x1 + 0.4, P.x - 0.45 * Math.sign(h.x - P.x || 1)); player.vel.set(0, 0, 0);
        hurt('덕트 안에서 지네 머리에 빛을 비췄어야 했다');
      }
    }
  }
  // gone back into the wall: off ahead of you, toward the dock
  if (K.poked && !K.after && centi.state === 'gone' && t - K.pokeT > 2) {
    K.after = true;
    setTimeout(() => { if (G.dk.in) sfx.ductScrape(DUCT.end + 0.4, 0.5, DUCT.z1 + 0.4, 1.2); }, 700);
    setTimeout(() => { if (G.dk.in) sfx.ductKnock(DUCT.end + 1.5, 0.3, DUCT.z0 - 1, 0.25); }, 2100);
  }
  // the end: the floor grille gives way under you
  if (K.in && !K.broke && P.x > DUCT.drop0 + 0.3) {
    K.broke = true;
    const L = DUCT.land;
    G.drop = { t: 0, phase: 'give', pitch: player.pitch, y0: camera.position.y, landYaw: Math.atan2(0 - L.x, -0.5 - L.z) };
    sfx.ductGive(); buzz([30, 40, 30]);
    if (showMap) toggleMap(); if (journal.open) journal.toggle(false);
  }
  // in the dock: out of the wall behind you
  if (K.landed && !K.ambushed && t >= K.ambushAt) { K.ambushed = true; centi.ambush(DUCT.dockVent); }
}
// down through the floor, a moment of dark, out through the dock's ceiling and onto the concrete
function dropStep(dt) {
  const d = G.drop, L = DUCT.land, fb = $('#fadeBlack');
  d.t += dt;
  let y = camera.position.y, pitch = d.pitch, roll = 0;
  if (d.phase === 'give') {
    y = d.y0 - 0.06 * Math.min(1, d.t / 0.5) + (Math.random() - 0.5) * 0.012;
    if (d.t >= 0.5) { d.phase = 'fall'; d.t = 0; duct.breakFloor(); }
  } else if (d.phase === 'fall') {
    y = d.y0 - 0.06 - 8 * d.t * d.t; pitch = d.pitch + (-0.9 - d.pitch) * Math.min(1, d.t / 0.35); roll = 0.3 * d.t;
    fb.style.opacity = Math.min(1, d.t / 0.4);
    if (d.t >= 0.42) { d.phase = 'dark'; d.t = 0; fb.style.opacity = 1; }
  } else if (d.phase === 'dark') {
    y = -2.5;
    if (d.t >= 0.35) {
      d.phase = 'drop'; d.t = 0;
      player.place(L.x, L.z, d.landYaw); duct.landed();
    }
  } else if (d.phase === 'drop') {
    const k = Math.min(1, d.t / 0.45);
    y = 5.75 - (5.75 - 0.5) * k * k; pitch = -1.15 + 0.25 * k; roll = 0.12 * (1 - k);
    fb.style.opacity = Math.max(0, 1 - d.t / 0.12);
    if (k >= 1) {
      d.phase = 'land'; d.t = 0;
      sfx.landThud(); shakeScreen(); buzz(260); G.ductJolt = 0.05;
      const h = $('#hit'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on');
    }
  } else if (d.phase === 'land') {
    y = 0.5 + 0.02 * Math.sin(d.t * 10) * Math.max(0, 1 - d.t);
    pitch = -0.9 * (1 - THREE.MathUtils.smoothstep(d.t, 0.25, 1.0)); roll = 0.05 * Math.sin(d.t * 3) * (1 - d.t);
    if (d.t >= 1.0) {
      G.drop = null; player.pitch = 0; G.rise = { t: 0, y0: 0.5 };
      G.dk.landed = true; G.dk.ambushAt = t + 0.6;
      msg('셔터가 열려 있다... 뛰어!');
      return;
    }
  }
  camera.position.set(player.pos.x, y, player.pos.z);
  camera.quaternion.setFromEuler(new THREE.Euler(pitch, player.yaw + Math.PI, roll, 'YXZ'));
}
// the blackout scare: no moving, no looking away; the head turns to where it comes down
function applyCine(dt, inp) {
  const c = G.cine;
  if (!c) return inp;
  c.t += dt;
  if (G.dead || G.grab || G.kill || G.won) { G.cine = null; return inp; }
  if (c.endT < 0 && (phantom.leaving || (!phantom.active && c.t > 2.5))) c.endT = c.t + 0.7;     // seen it go back up
  if ((c.endT >= 0 && c.t > c.endT) || c.t > 8) { G.cine = null; return inp; }
  const cp = camera.position, dx = c.at.x - cp.x, dz = c.at.z - cp.z, k = 1 - Math.exp(-dt * 3.5);
  let dy = Math.atan2(dx, dz) - player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw += dy * k;
  player.pitch += (THREE.MathUtils.clamp(Math.atan2(c.at.y - cp.y, Math.hypot(dx, dz)), -1.2, 1.2) - player.pitch) * k;
  return { ...inp, mx: 0, mz: 0, run: false, lookX: 0, lookY: 0 };
}
// a held look (G.lookSeq): no moving, no looking away; the head turned to each thing in turn
function applyLookSeq(dt, inp) {
  const q = G.lookSeq;
  if (!q) return inp;
  q.t += dt;
  const shot = q.shots.find((s) => q.t < s.end);
  if (!shot || G.dead || G.grab || G.kill || G.won) { G.lookSeq = null; return inp; }
  const at = shot.p(), cp = camera.position, dx = at.x - cp.x, dz = at.z - cp.z, k = 1 - Math.exp(-dt * 3.5);
  let dy = Math.atan2(dx, dz) - player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw += dy * k;
  player.pitch += (THREE.MathUtils.clamp(Math.atan2(at.y - cp.y, Math.hypot(dx, dz)), -1.2, 1.2) - player.pitch) * k;
  return { ...inp, mx: 0, mz: 0, run: false, lookX: 0, lookY: 0 };
}
function applyFocus(dt, inp) {
  if (!focus) return inp;
  focus.t += dt;
  if (focus.t > focus.end || G.dead || G.grab) { focus = null; return inp; }
  const c = camera.position, dx = focus.p.x - c.x, dz = focus.p.z - c.z, k = 1 - Math.exp(-dt * 5);
  let dy = Math.atan2(dx, dz) - player.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
  player.yaw += dy * k;
  player.pitch += (THREE.MathUtils.clamp(Math.atan2(focus.p.y - c.y, Math.hypot(dx, dz)), -1.2, 1.2) - player.pitch) * k;
  return { ...inp, lookX: 0, lookY: 0 };
}
const BODY_SEE = new THREE.Vector3(BODY.x, 2.4, BODY.z);
const aim = new THREE.Vector3(), aimS = new THREE.Vector3();
let t = 0, flick = 1, flickT = 3;
const clock = new THREE.Clock();
let prevUse = false;

function roomAt(x, z) {
  for (const [k, r] of Object.entries(ROOMS)) if (x >= r.x0 && x <= r.x1 && z >= r.z0 && z <= r.z1) return k;
  return null;
}

// ---- room culling. The walls hide everything outside the room you're in and the rooms you can see into
// through an open doorway, but the renderer would draw it all anyway (and draw it again into the
// flashlight's shadow). So for each frame, whatever is in a room out of sight is left out. Standing in a
// doorway counts as both rooms; the duct is a room off the lab. Things in no room (inside a wall) are
// drawn only near you.
const SEES = {};
{
  const link = (a, b) => { (SEES[a] ||= new Set([a])).add(b); (SEES[b] ||= new Set([b])).add(a); };
  for (const d of DOORS) if (d.b && !d.locked) link(d.a, d.b);
  link('lab', 'duct');
}
const OPEN_DOORS = DOORS.filter((d) => d.b && !d.locked);
const cullList = [];          // { o, room } for things that stay put, { o, at() } for things that move
const culled = [];
const _cb = new THREE.Box3();
function cullAdd(o, room) { if (o) cullList.push({ o, room }); }
function cullMoving(o, at) { if (o) cullList.push({ o, at }); }
function cullBoxRoom(o, fallback = null) {
  _cb.setFromObject(o);
  if (_cb.isEmpty()) return fallback;
  const a = roomAt(_cb.min.x + 0.35, _cb.min.z + 0.35), b = roomAt(_cb.max.x - 0.35, _cb.max.z - 0.35);
  return a && a === b ? a : fallback;
}
function cullSetup() {
  for (const m of levelGroup.children) { const r = cullBoxRoom(m); if (r) cullAdd(m, r); }
  for (const m of dress.meshes) if (ROOMS[m.userData.room]) cullAdd(m, m.userData.room);
  for (const m of duct.group.children) cullAdd(m, cullBoxRoom(m, 'duct'));
  for (const sp of spiders.spiders) cullMoving(sp.s.root, () => sp.s.root.position);
  cullMoving(phantom.s.root, () => phantom.s.root.position);
  cullList.push({ o: centi.c.group, at: () => ({ x: centi.head.x, z: centi.head.z }), near: 9 });
  cullAdd(eggs.group, 'lab'); cullAdd(lee.group, 'hall'); cullList.push({ o: deadMan.group.parent, room: 'corridor', far: { x: BODY.x, z: BODY.z, d: 20 } });
  cullAdd(gate.group, 'ware'); cullAdd(gate.s.root, 'ware');
}
let visRooms = null;
function cullRooms() {
  culled.length = 0; visRooms = null;
  if (window.__NOCULL) return;
  const cp = camera.position;
  const here = ductInside(cp.x, cp.z) ? 'duct' : roomAt(cp.x, cp.z);
  if (!here) return;
  const vis = visRooms = new Set(SEES[here] || [here]);
  for (const d of OPEN_DOORS) {
    const mid = (d.from + d.to) / 2, half = (d.to - d.from) / 2;
    const along = d.axis === 'z' ? cp.x - mid : cp.z - mid, across = d.axis === 'z' ? cp.z - d.at : cp.x - d.at;
    if (Math.abs(across) < 2.5 && Math.abs(along) < half + 1) for (const r of [d.a, d.b]) for (const k of SEES[r]) vis.add(k);
  }
  for (const it of cullList) {
    const o = it.o;
    if (!o.visible) continue;
    let room = it.room;
    if (it.at) {
      const p = it.at();
      if (Math.hypot(p.x - cp.x, p.z - cp.z) < (it.near || 0)) continue;      // (a long body reaches round a doorway)
      room = ductInside(p.x, p.z) ? 'duct' : roomAt(p.x, p.z);
      if (!room) { if (Math.hypot(p.x - cp.x, p.z - cp.z) > 16) { o.visible = false; culled.push(o); } continue; }
    }
    if (room && !vis.has(room)) { o.visible = false; culled.push(o); }
    else if (it.far && Math.hypot(it.far.x - cp.x, it.far.z - cp.z) > it.far.d) { o.visible = false; culled.push(o); }
  }
}
function uncull() { for (const o of culled) o.visible = true; culled.length = 0; }

// ---- the light pool. Every lamp, red emergency light, glow and spill around the map is a point light,
// and every lit pixel works through all of them, on or off, near or far. So they are kept out of the
// render (invisible) and each frame the few that can matter (on, in a room you can see, near enough)
// are copied into a handful of real lights. What you see doesn't change; the shading gets cheaper.
const POOL_N = 5;
const poolSrc = [], poolSlots = [];
const _lp = new THREE.Vector3();
function poolSetup() {
  scene.traverse((o) => { if (o.isPointLight && o !== spill && o !== bounce && o !== nightEye) poolSrc.push(o); });
  for (const L of poolSrc) L.visible = false;
  for (let i = 0; i < POOL_N; i++) { const L = new THREE.PointLight(0xffffff, 0, 1, 2); scene.add(L); poolSlots.push(L); }
}
const poolCand = [];
function poolLights() {
  const cp = camera.position;
  poolCand.length = 0;
  for (const L of poolSrc) {
    if (!(L.intensity > 1e-3)) continue;
    L.updateWorldMatrix(true, false); _lp.setFromMatrixPosition(L.matrixWorld);
    const d = _lp.distanceTo(cp), reach = (L.distance || 30) + 10;
    if (d > reach) continue;
    if (visRooms) { const r = ductInside(_lp.x, _lp.z) ? 'duct' : roomAt(_lp.x, _lp.z); if (r && !visRooms.has(r)) continue; }
    poolCand.push({ L, x: _lp.x, y: _lp.y, z: _lp.z, w: L.intensity * (1 - d / reach) });
  }
  poolCand.sort((a, b) => b.w - a.w);
  for (let i = 0; i < POOL_N; i++) {
    const S = poolSlots[i], c = poolCand[i];
    if (!c) { S.intensity = 0; continue; }
    S.position.set(c.x, c.y, c.z); S.color.copy(c.L.color); S.intensity = c.L.intensity; S.distance = c.L.distance; S.decay = c.L.decay;
  }
}

const fleeV = new THREE.Vector3(), fleeF = new THREE.Vector3();
const wolfHelp = { t: 5, n: 0 };     // (the wolf spider's hiding hints, see the frame)
function frame(dtOverride) {
  const dt = dtOverride != null ? dtOverride : Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  // the opening drive has its own scene; the game waits until you step inside
  if (intro && intro.active) {
    if (!needRotate) intro.update(dt);
    maskTick(dt, 0.12, false);
    if (intro.active) { sfx.setMusic(intro.musicMode(), { dt, duck: intro.musicDuck() }); if (!window.__NORENDER) withBright(() => intro.render()); return; }
  }
  if (needRotate) { withBright(() => renderer.render(scene, camera)); return; }
  if (G.reading) { input.lookX = 0; input.lookY = 0; if (!window.__NORENDER) withBright(() => renderer.render(scene, camera)); return; }
  readQueued();
  const inp = readInput(dt);
  const lookMag = Math.abs(inp.lookX) + Math.abs(inp.lookY) * 0.5, lookSign = Math.abs(inp.lookX) > 0.004 ? Math.sign(inp.lookX) : 0;
  if (G.started && !G.won && !G.dead && !G.grab && !G.kill && !G.drop) {
    player.update(dt, applyFocus(dt, applyLookSeq(dt, applyCine(dt, inp))));
    updateZoom(dt);
    if (dread.shake && SET.shake !== false) { camera.position.x += (Math.random() - 0.5) * dread.shake; camera.position.y += (Math.random() - 0.5) * dread.shake * 2; }
    if (G.ductJolt > 0.001) { camera.position.x += (Math.random() - 0.5) * G.ductJolt; camera.position.y += (Math.random() - 0.5) * G.ductJolt; camera.position.z += (Math.random() - 0.5) * G.ductJolt; }
    if (G.attached.length && SET.shake !== false) faceShudder(dt);
    if (G.glance) {
      const g = G.glance; g.t += dt;
      if (g.t > 1.6) G.glance = null;
      else camera.rotateOnWorldAxis(UPV, g.ang * THREE.MathUtils.smoothstep(g.t, 0, 0.35) * (1 - THREE.MathUtils.smoothstep(g.t, 1.0, 1.6)));
    }
  } else G.glance = null;
  G.ductJolt = Math.max(0, (G.ductJolt || 0) - dt * 0.12);
  if (G.drop) dropStep(dt);
  if (G.kill) centiKillStep(dt);
  if (G.rise && !G.kill) { G.rise.t += dt; const k = Math.min(1, G.rise.t / 0.7); camera.position.y = THREE.MathUtils.lerp(G.rise.y0, camera.position.y, k * k * (3 - 2 * k)); if (G.rise.t >= 0.7) G.rise = null; }
  G.centiCd = Math.max(0, (G.centiCd || 0) - dt);
  G.grabSafeT = Math.max(0, (G.grabSafeT || 0) - dt);
  input.lookX = 0; input.lookY = 0;
  if (dev.battery) G.battery = 1;
  if (player.moved && !G.timing && !G.won) G.timing = true;
  if (G.timing) G.time += dt;

  // ---- flashlight + battery
  // G.battery is how much the flashlight has left before it overheats (1 = cool). In the duct (and the drop
  // out of it) the fans' air keeps it cool: it never heats up or cuts out in there
  const ductCool = G.dk.in || !!G.drop;
  if (ductCool && G.drained) { G.drained = false; G.battery = Math.max(G.battery, 0.6); if (!G.flashOn) toggleFlash(); }
  if (ductCool) G.battery += dt * 0.1;
  else if (G.drained) {
    // overheated: it cut out, and won't come on until it has cooled right down, 5 s
    G.battery = Math.min(1, G.battery + dt / 5);
    G.tickT = (G.tickT || 0) - dt;
    if (G.tickT <= 0) { G.tickT = 0.5 + Math.random() * 1.2; sfx.coolTick(); }
    if (G.battery >= 1) { G.drained = false; tip('손전등이 식었다'); }
  } else if (G.flashOn && G.blackT <= 0) G.battery -= dt / 30 * D().heat;
  else G.battery += dt * 0.02 * (G.inSafe ? 2 : 1);
  G.battery = Math.min(1, G.battery);
  if (G.battery <= 0 && !G.drained) {
    G.battery = 0; G.drained = true;
    if (G.flashOn) toggleFlash();
    sfx.overheat(); tip('손전등이 과열되었다');
  }
  if (G.flashOn && G.battery < 0.3 && !ductCool) tip(`손전등이 뜨거워진다... 잠깐 꺼 둬야겠다 (${KEY.flash})`, 'battery');
  flickT -= dt;
  if (flickT < 0) {
    // it stutters more often as the battery runs down
    flickT = G.battery < 0.3 ? 1.2 + Math.random() * 3 : 5 + Math.random() * 8; flick = 0;
    if (G.flashOn && G.battery < 0.3) sfx.flashCrackle();
  }
  flick = Math.min(1, flick + dt * (flick < 0.5 ? 6 : 2));
  let fl = flick < 1 ? 0.6 + 0.4 * Math.abs(Math.sin(t * 60)) : 1;
  { const vf = new THREE.Vector3(); player.forward(vf);
    fl *= visions.update({ dt, t, cam: camera, fwd: vf, flashOn: G.flashOn && !G.drained, gens: G.gens, voiceBusy: voice.busy,
      live: G.started && !G.dead && !G.won && !G.dk.in && !G.drop, calm: !G.grab && !G.kill && !G.chasing && !G.hidden && G.blackT <= 0 && G.attached.length === 0,
      onWhisper: () => voice.say([['무전', '(치익...) ......뒤...... 에......', 2.6]], 'whisper'), onBehind: (x, z) => sfx.behind(x, z), tip, look: lookToward }); }
  { const rm = roomAt(player.pos.x, player.pos.z);
    fl *= dread.update({ dt, P: player.pos, live: G.started && !G.dead && !G.won && !G.dk.in && !G.drop && !G.grab && !G.kill,
      calm: !G.grab && !G.kill && !G.chasing && !G.hidden && G.blackT <= 0 && G.attached.length === 0,
      hidden: G.hidden && !G.chasing, hiddenT: G.hiddenT, hideIn: player.inside && player.inside.hide ? player.inside : null, glowAt: glow.at,
      room: rm, roomH: rm && ROOMS[rm] ? ROOMS[rm].h : 4, flashOn: G.flashOn && !G.drained, centi, spiders: spiders.spiders,
      tapesHeard: tapes.filter((x) => x.played).length, leeDead: !!G.tipped.leeSeen, time: G.time }).fl; }
  if (G.battery < 0.15 && G.battery > 0) fl *= Math.random() < 0.05 ? 0.4 : 1;
  // the brightness tells you what is left: full when charged, dimming as it drains, a faint glow when empty
  const b = G.battery;
  battK += ((b <= 0 ? 0.09 : 0.09 + 0.91 * Math.pow(b, 1.3)) - battK) * Math.min(1, dt * 3);
  fl *= battK;
  // the blackout: everything electric is dead for 3 s, then stutters back
  if (G.blackT > 0) {
    G.blackT -= dt;
    if (G.blackPhantom && G.blackT < 1.1 && !phantom.active) {
      const rm = G.cine ? G.cine.rm : ROOMS[roomAt(player.pos.x, player.pos.z)] || ROOMS.machine;
      const at = phantom.show(camera.position, player.yaw, rm.h, rm, G.cine ? G.cine.spot : undefined);
      G.blackPhantom = false;
      sfx.creak(at.x, rm.h - 0.3, at.z);
    }
    if (G.blackT <= 0) endBlackout();
  }
  G.backT = Math.max(0, G.backT - dt);
  const powerK = G.blackT > 0 ? (G.blackT > 2.85 && Math.random() < 0.5 ? 0.5 : 0) : G.backT > 0 ? (Math.random() < 0.55 ? 1 : 0.1) : 1;
  fl *= powerK;
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
  // knocked down by the centipede: the flashlight lies where it fell, still pointing at it
  if (G.kill && G.kill.drop) { flash.position.copy(G.kill.drop); flash.target.position.copy(centi.head); }
  // a wall right in front of you would go white: the beam is turned down the closer the wall is
  nearK += (beamNear(hd) - nearK) * Math.min(1, dt * 10);
  const ductK = G.dk.in ? 0.35 : 1;            // (in the duct's tight metal the beam is right on top of everything)
  flash.intensity = G.flashOn ? FLASH_I * fl * nearK * ductK : 0;
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
  nightEye.intensity = bright || G.blackT > 0 ? 0 : Math.pow(adapt, 1.5) * NIGHT_K;
  glow.update(dt); glow.light.intensity *= dread.glowK;
  bounce.position.copy(camera.position).addScaledVector(fwd, Math.min(hd * 0.75, 4.5));
  bounce.intensity = G.flashOn ? 2.2 * fl * Math.min(1, nearK * 1.6) * ductK : 0;
  dress.update(dt, camera.position, flash.position, beamDir.subVectors(flash.target.position, flash.position).normalize(), G.flashOn ? fl : 0, renderer.domElement.height * 1.2);
  const markSeen = marks.update(dt, flash.position, beamDir, G.flashOn ? fl : 0);
  if (markSeen && G.started && !G.dead && markSeen.d < 10) tip('2조가 뿌려 둔 야광 스프레이다... 이걸 따라가면 되겠다', 'marks');
  silk.uniforms.uSpotPos.value.copy(flash.position);
  silk.uniforms.uSpotDir.value.copy(fwd);
  silk.uniforms.uOn.value = G.flashOn ? 0.55 * fl : 0;
  silk.uniforms.uAmb.value = bright ? 0.15 : 0;

  // ---- hiding: all the way under a table or a conveyor, light off, keeping still.
  // Hunters lose you and search round where you went; light, moving or the spray gives you away.
  G.revealT = Math.max(0, G.revealT - dt);
  const hideIn = player.inside && player.inside.hide ? player.inside : null;        // (the duct is a crawl space, not a hiding place)
  const quiet = G.started && !G.dead && !G.won && !G.grab && !!hideIn && !G.flashOn && player.speed < 0.35 && G.revealT <= 0 && G.attached.length === 0;
  G.stillT = quiet ? (G.stillT || 0) + dt : 0;
  G.hidden = G.stillT > 0.6;          // a moment of keeping still first
  G.hiddenT = G.hidden ? G.hiddenT + dt : 0;
  if (hideIn && G.started) tip(`불을 끄고 가만히 있자 (${KEY.flash}). 그럼 못 찾을 거야`, 'hide');
  // the last generator on and the centipede seen (after any held look is over): run for the vent
  if (G.gens >= 3 && duct.open && !G.fleeSaid && G.started && !G.dead && !G.won && !G.dk.in && !G.dk.landed && !G.drop) {
    if (!G.centiSeen && centi.active && centi.state !== 'dormant' && centi.state !== 'gone') {
      const h = fleeV.set(centi.head.x, Math.max(0.4, centi.head.y), centi.head.z), c = camera.position, d = h.distanceTo(c);
      if (d < 18 && fleeF.set(0, 0, -1).applyQuaternion(camera.quaternion).dot(h.clone().sub(c)) / d > 0.6 && canSee(h)) G.centiSeen = true;
    }
    if (G.centiSeen && !G.lookSeq && !G.cine) { G.fleeSaid = true; msg('지네다...! 환풍기로 도망가자!'); tip('환풍기 쪽 환기구로 기어 들어가자. 저 덩치로는 못 따라온다'); }
  }
  // the wolf spider on you in the hall: what to do, spelled out (5 s into the chase, then every 12 s; four times in all)
  if (G.started && !G.dead && !G.hidden && wolfHelp.n < 4 && spiders.wolf && spiders.wolf.g && spiders.wolf.g.phase === 'chase' && roomAt(player.pos.x, player.pos.z) === 'hall' && (wolfHelp.t -= dt) <= 0) {
    wolfHelp.t = 12; wolfHelp.n++;
    tip(hideIn ? `컨베이어 밑이다. 불 끄고 가만히! (${KEY.flash})` : `컨베이어 밑으로! 앉아서 기어 들어가자 (${KEY.crouch})`);
  }
  // ---- thrown cans, the camera's flash
  cans.update(dt, canHit);
  camFlash.intensity *= Math.exp(-dt * 22);
  G.camCd = Math.max(0, (G.camCd || 0) - dt);
  // ---- roaches
  const noise = !G.started || G.dead || G.hidden || !player.moving || player.speed < 0.3 ? 0 : (player.crouch ? 1 : player.running ? 12 : 5) * D().hear;
  swarms.update({
    dt, t, camera, frozen: dev.freeze || !G.started,
    player: { pos: player.pos, noise, alive: !G.dead && !G.won, hidden: G.hidden, under: !!player.inside },
    flash: { on: beamPow > 20, pos: flash.position, dir: beamDir.subVectors(flash.target.position, flash.position).normalize() },
    lamps: lamps.map((l) => ({ x: l.x, z: l.z, on: l.on && G.blackT <= 0 })),
    events: G.events, playerSafe: G.inSafe,
    onAttach,
    onFirstFlee: () => tip('바퀴들이 빛을 피한다', 'roachlight'),
    onEscape: (p, dur) => sfx.wingTakeoff(p.x, p.z, dur),
    onFirstWait: () => tip('빛 밖에서 기다리고 있다... 불을 돌리면 덮치겠지', 'roachwait'),
    onFirstHunt: () => { tip(`소리를 듣고 오는 건가... 앉아서 걷자 (${KEY.crouch})`, 'roachsound'); discover('roach'); },
    onFlyerLaunch: (p) => sfx.scareLaunch(p.x, p.y, p.z),
    onFlyerOff: () => { sfx.shakeOff(); sfx.roachDie(1); },
    onFlyerHit: () => {
      sfx.scareHit(); shakeScreen(); buzz(120); const h = $('#hit'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); },
  });
  // ---- spiders, webs, egg sacs, centipede
  const light = { on: beamPow > 20, pos: flash.position.clone(), dir: beamDir.clone() };
  const frozen = dev.freeze || !G.started;
  let safeLamp = null;
  for (const l of lamps) if (l.on && G.blackT <= 0 && Math.hypot(player.pos.x - l.x, player.pos.z - l.z) < 4.2) safeLamp = { x: l.x, z: l.z, r: 4.2 };
  spiders.update({
    dt, cam: camera.position.clone(), camFwd: fwd.clone(), light, safe: !!safeLamp, frozen, playerPos: player.pos, alive: G.started && !G.dead && !G.won, god: dev.god || G.grabSafeT > 0, hidden: G.hidden,
    nav: swarms.nav, field: swarms.fPlayer,
    onWolfWake: (sp) => { const p = sp.s.root.position; sfx.spiderWake(p.x, p.y, p.z); tip(`벽에서 거미가 내려온다! 앉아서 컨베이어 밑에 숨자 (${KEY.crouch})`, 'wolfwake'); discover('wolf'); },
    onWolfLit: (sp) => { const p = sp.s.root.position; sfx.spiderFlinch(p.x, p.y, p.z); },
    onWake: (sp) => { const p = sp.s.root.position; sfx.creak(p.x, 3.6, p.z); sfx.centiHiss(p.x, p.z); tip('실을 건드렸다... 뭔가 깨어났다', 'tripwake'); },
    onCower: (sp) => { const p = sp.s.root.position; sfx.spiderFlinch(p.x, p.y, p.z); tip('빛을 비추니 움츠러든다', 'ghostlit'); },
    onThreadLit: () => tip(`실이 쳐져 있다. 앉아서 지나가야겠다 (${KEY.crouch})`, 'trip'),
    onSacBurst: (p) => {
      brood.burst(p); sfx.sacDrop(p.x, p.z); sfx.eggBurst(p.x, 0.2, p.z);
      G.broodGone = false; tip('알집이 터졌다... 새끼들이 쏟아져 나온다!'); lookToward(new THREE.Vector3(p.x, 0.15, p.z), 0.6, true);
    },
    onFirstLit: () => tip('위에서 뭔가 기다리고 있었다. 천장을 잘 봐야겠다', 'spiderlit'),
    onDrop: (sp) => sfx.creak(sp.s.root.position.x, sp.ceil - 0.3, sp.s.root.position.z),
    onCatch: (sp) => startGrab(sp),
    onWebLit: () => tip(`거미줄이다. 스프레이로 녹일 수 있겠다 (${KEY.spray})`, 'weblit'),
  });
  // the spider walling off the passage, the one from the blackout, the dead man in the corridor
  gate.update({ dt, cam: camera.position, light, playerPos: player.pos,
    canCatch: G.started && !G.dead && !G.won && !G.grab && !dev.god && !dev.freeze && !(G.grabSafeT > 0),
    onCatch: (g) => startGrab(g),
    onNear: () => { tip('저 안으로는... 못 가겠다', 'gate'); discover('gate'); if (!G.tipped.seeGate) { G.tipped.seeGate = true; lookToward(gate.s.bodyWorld, 0.5, true); } },
    onShake: (x, y, z) => sfx.spiderFlinch(x, y, z),
    onTouch: () => tip('거미줄이 너무 두껍다. 지나갈 수 없다') });
  phantom.update({ dt, cam: camera.position, light, onRetract: (x, y, z) => sfx.spiderFlinch(x, y, z) });
  deadMan.update(dt);
  lee.update(dt);
  if (G.started && !G.dead && !G.tipped.leeSeen && Math.hypot(player.pos.x - LEE.x, player.pos.z - LEE.z) < 11 && canSee(lee.pos)) {
    const v = lee.pos.clone().sub(camera.position).normalize(), f = new THREE.Vector3(); player.forward(f);
    if (v.dot(f.normalize()) > 0.75) { G.tipped.leeSeen = true; tip('저기... 누가 쓰러져 있다'); lookToward(lee.pos, 0.5); }
  }
  if (G.started && !G.dead && G.tipped.leeSeen && !G.tipped.leeNear && Math.hypot(player.pos.x - LEE.x, player.pos.z - (LEE.z - 1)) < 2.6) { G.tipped.leeNear = true; tip('...2조 이정훈 씨?'); }
  if (G.started && !G.tipped.body && Math.hypot(player.pos.x - BODY.x, player.pos.z - BODY.z) < 5.5 && canSee(BODY_SEE)) {
    G.tipped.body = true; sfx.sting(); tip('...나랑 같은 방역복이다. 먼저 들어온 사람인가');
    lookToward(BODY_SEE, 0.9);
  }
  // the first time each spider is close enough to see, the view turns to it
  if (G.started && !G.dead && !G.grab) {
    spiders.spiders.forEach((sp, i) => {
      if (G.tipped['see' + i]) return;
      const b = sp.s.bodyWorld;
      if (b.distanceTo(camera.position) < 7 && canSee(b)) { G.tipped['see' + i] = true; lookToward(b, 0.5, true); discover(sp.mode === 'trip' ? 'ghost' : 'wolf'); }
    });
  }
  if (G.started && !G.dead && !G.grab) {
    const tr = spiders.threadAt(player.pos, camera.position.y + 0.12);
    if (tr) { spiders.snapThread(tr); sfx.threadSnap(player.pos.x, 1.4, player.pos.z); msg('실을 끊어 버렸다...'); discover('ghost'); }
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
    if (!G.eggTip && eggs.nearestSac(player.pos) < 6 && !eggs.burstDone) { G.eggTip = true; tip(`알집이다... 앉아서 소리 내지 말고 지나가자 (${KEY.crouch})`, 'eggs'); discover('eggs'); }
  }
  const lingInfo = eggs.update({
    dt, player: { pos: player.pos }, nav: swarms.nav, field: swarms.fPlayer, light, frozen, hidden: G.hidden,
    onTouch: () => {
      if (dev.god) return;
      G.lingSlow = Math.min(0.4, G.lingSlow + 0.07); G.lingT = 0;
      sfx.burst && sfx.ctx && sfx.burst({ dur: 0.12, f: 3800, q: 1, gain: 0.3 });
      tip(`새끼들은 스프레이 한 번이면 쓸려 나가겠다 (${KEY.spray})`, 'lings');
    },
  });
  const broodInfo = brood.update({ dt, player: { pos: player.pos }, nav: swarms.nav, frozen });
  // ...and once they've streamed past you and scatter for the cracks, the view follows them
  if (G.broodGone === false && broodInfo.fleeing >= 8 && Math.hypot(broodInfo.fx - player.pos.x, broodInfo.fz - player.pos.z) > 2) {
    G.broodGone = true; tip('벽 틈으로 흩어져 들어간다...'); lookToward(new THREE.Vector3(broodInfo.fx, 0.1, broodInfo.fz), 0.6);
  }
  G.lingT += dt;
  if (G.lingT > 2.5) G.lingSlow = Math.max(0, G.lingSlow - dt * 0.06);
  centi.update({
    dt, player: { pos: player.pos, noise, alive: G.started && !G.dead && !G.won && !dev.god, hidden: G.hidden }, cam: camera.position.clone(),
    fence: labDoor.broken ? null : { inside: roomAt(player.pos.x, player.pos.z) === 'lab', open: labDoor.k > 0.08, x: -6, zc: LAB.zc, smash: labDoor.smash >= 0 },
    light, nav: swarms.nav, field: swarms.fPlayer, events: G.events, safe: safeLamp, frozen,
    onBurst: (V) => { sfx.ventBurst(V.x, V.z); if (V === DUCT.dockVent) { duct.burstDock(); glanceAt(V); } shakeScreen(); buzz([60, 30, 140]); const h = $('#hit'); h.classList.remove('on'); void h.offsetWidth; h.classList.add('on'); },
    onRam: () => {
      const m = DUCT.mouth;
      sfx.ductBang(m.x, 0.5, m.z - 0.3); sfx.centiScreech(m.x, m.z + 0.4, 0.08); shakeScreen(); buzz([90, 40, 160]); G.ductJolt = 0.06;
      setTimeout(() => { if (!G.dead && !G.won && centi.state === 'ram') { sfx.ductScrape(m.x, 0.5, m.z - 0.4, 1.0); sfx.centiHiss(m.x, m.z + 0.4); } }, 700);
      if (G.dk.in) { tip('못 들어온다... 덩치가 너무 크다'); lookToward(new THREE.Vector3(m.x, 0.5, m.z), 1.2); }
    },
    onPokeLit: () => { sfx.centiHiss(centi.head.x, centi.head.z); tip('빛을 받으니 물러난다', 'pokelit'); },
    onLunge: () => sfx.centiScreech(centi.head.x, centi.head.z),
    onStun: (hits, hold) => {
      sfx.centiHiss(centi.head.x, centi.head.z);
      tip('지네가 빛에 움찔한다', 'centilight');
      if (hold < 2) tip('빛에 점점 익숙해지는 것 같다...', 'centiadapt');
    },
    onCatch: () => startCentiKill(G.lingSlow > 0.15 ? '실험실에 들어가기 전에 스프레이를 남겨 뒀어야 했다' : '전등 불빛 안으로 도망쳤어야 했다'),
  });
  G.events.length = 0;
  updateDuct(dt);
  updateLabDoor(dt);

  // grabbed: the meter drains; keep it up for 2 s
  if (G.grab && !G.dead) {
    const gr = G.grab;
    gr.t += dt; gr.meter -= dt * 0.42 * D().mash;
    $('#grab .bar i').style.width = `${Math.max(0, gr.meter) * 100}%`;
    if (gr.meter <= 0) {
      if (SET.diff === 'hard') die('붙잡혔을 때 스프레이를 썼어야 했다');
      else { const sp = gr.sp; endGrab(true); if (sp !== gate) spiders.release(sp); msg('물렸다... 그래도 빠져나왔다'); hurt('붙잡혔을 때 스프레이를 썼어야 했다'); }
    } else if (gr.t >= 2) endGrab(false);
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
  if (G.dk.F && G.dk.F.on && G.dk.in) inten = Math.max(inten, 0.8 - Math.hypot(G.dk.F.x - player.pos.x, G.dk.F.z - player.pos.z) / 12);
  if (centi.state === 'poke' || centi.state === 'ram') inten = Math.max(inten, 0.85);
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
    G.tipped.hideHint = true; tip(`앉아서 테이블이나 컨베이어 밑에 숨자 (${KEY.crouch})`, 'hidehint');
  }
  if (spiders.ghostInfo()) inten = Math.max(inten, 0.8);
  if (lingInfo.moving) inten = Math.max(inten, 0.7);
  if (broodInfo.moving > 4) inten = Math.max(inten, 0.4);
  if (G.started && !G.dead && !journal.has('roach') && ai.swarms.some((w) => w.n && w.d < 6 && canSee(tmpV.set(w.x, 0.2, w.z)))) discover('roach');
  if (G.started && !G.dead && !journal.has('centi') && centi.active && centi.state !== 'dormant' && Math.hypot(centi.head.x - player.pos.x, centi.head.z - player.pos.z) < 22) discover('centi');
  // the centipede right behind you in a chase: your head snaps round to look (not too often)
  if (centi.active && centi.state === 'chase' && !G.glance && t - G.glanceAt > 9 && !G.grab && !G.kill && !G.hidden && !G.dead) {
    const dC = Math.hypot(centi.head.x - player.pos.x, centi.head.z - player.pos.z);
    if (dC < 5.5 && dC > 1.8) {
      const f = new THREE.Vector3(); player.forward(f);
      const behind = (f.x * (centi.head.x - player.pos.x) + f.z * (centi.head.z - player.pos.z)) / (Math.hypot(f.x, f.z) * dC || 1);
      if (behind < -0.3) { glanceAt(centi.head); G.glanceAt = t; sfx.heartbeat(1); if (!G.tipped.glance) { G.tipped.glance = true; tip('...바로 뒤에 있어!'); } }
    }
  }
  // lost: a long while with no new room and no generator, and not looking at the map: suggest the pad
  { const rm = roomAt(player.pos.x, player.pos.z);
    if (rm && !G.seenRooms.has(rm)) { G.seenRooms.add(rm); G.lostT = Math.min(G.lostT, 0); }
    if (showMap) G.lostT = Math.min(G.lostT, 0);
    else if (G.started && !G.dead && !G.won && !G.chasing && !G.hidden && !G.grab && !G.kill && !G.dk.in && !G.drop) G.lostT += dt;
    if (G.lostT > 55 && G.lostHints < 3) { G.lostHints++; G.lostT = -35; tip(`길을 못 찾겠다... 패드로 지도를 보자 (${KEY.map})`); }
    // stuck: a long while since the last generator, still wandering: ask the base (the button pulses)
    if (G.started && !G.dead && !G.won && !G.chasing && !G.grab && !G.kill && !G.dk.in && !G.drop) G.stuckT += dt;
    if (G.stuckT > 150 && G.lostT > 20 && G.calls > 0 && G.stuckHints < 3 && !voice.busy) {
      G.stuckHints++; G.stuckT = 60;
      tip(`너무 헤매고 있다... 무전으로 본부에 길을 물어보자 (${KEY.radio}) · ${G.calls}번 남음`);
      const b = $('#bRadio'); b.classList.add('nudge'); setTimeout(() => b.classList.remove('nudge'), 9000);
    }
  }
  // who's after you: a spider or the centipede chasing drives the chase music, something searching keeps a low pulse
  let chaseD = 99, chaseBy = null;
  for (const q of spiders.chasers()) { const d = Math.hypot(q.x - player.pos.x, q.z - player.pos.z); if (d < chaseD) { chaseD = d; chaseBy = 'spider'; } }
  if (centi.active && (centi.state === 'chase' || centi.state === 'emerge')) { const d = Math.hypot(centi.head.x - player.pos.x, centi.head.z - player.pos.z); if (d < chaseD) { chaseD = d; chaseBy = 'centi'; } }
  if (!chaseBy && centi.state === 'search') chaseBy = 'centi';
  if (G.kill) chaseBy = 'centi'; else if (G.grab) chaseBy = 'spider';
  const chasing = G.started && !G.dead && !G.won && chaseD < 99;
  const searching = G.started && !G.dead && (spiders.searchers().length > 0 || centi.state === 'search');
  let chaseK = chasing ? 0.45 + 0.55 * Math.max(0, Math.min(1, 1 - (chaseD - 2) / 16)) : searching ? 0.2 : 0;
  if (G.grab || G.kill) chaseK = 1;
  if (chasing && !G.chasing && t - G.stingAt > 8) { sfx.chaseStinger(); G.stingAt = t; buzz([30, 40, 90]); }        // found you
  if (!chasing && G.chasing && G.chaseLen > 3 && !G.dead) sfx.chaseOver();                  // lost you
  G.chaseLen = chasing ? G.chaseLen + dt : 0; G.chasing = chasing;
  // your heart in your hands: a double pulse with each beat while something is close
  G.buzzT = (G.buzzT || 0) - dt;
  if (canVibe && G.started && !G.dead && !G.won && inten > 0.6 && G.buzzT <= 0) { buzz([22, 110, 16]); G.buzzT = 60 / (62 + inten * 64); }
  // the factory's music tightens as the night goes on and something hunts you; it steps back while you hide or run.
  // From the duct on it gives way to the escape (which takes over from the chase music too)
  const escPh = !G.started || G.dead || G.won ? null : G.dk.landed || (G.drop && G.drop.phase === 'land') ? 'run' : G.drop ? 'drop' : G.dk.in ? 'duct' : null;
  sfx.setMusic(escPh ? 'escape' : G.started && !G.won ? 'inside' : 'off', {
    dt, tension: Math.min(1, 0.15 + 0.14 * G.gens + 0.35 * Math.max(0, Math.min(1, inten))),
    duck: (G.dead ? 0.3 : 1) * (G.hidden ? 0.4 : 1) * (1 - 0.8 * chaseK),
    phase: escPh, k: Math.max(0, Math.min(1, inten)),
  });
  sfx.update({ dt, camera, swarms: ai.swarms, near: ai.near, attached: G.attached.length, intensity: G.started && !G.won ? Math.max(0, Math.min(1, inten)) : 0, pounce: ai.pounce, chase: G.won || escPh ? 0 : chaseK, chaseBy,
    centi: centi.active ? { x: centi.head.x, z: centi.head.z, speed: centi.state === 'poke' ? 1.2 : centi.speed } : G.dk.F && G.dk.F.on && G.dk.in ? { x: G.dk.F.x, z: G.dk.F.z, speed: G.dk.F.v } : null, lings: lingInfo, ghost: spiders.ghostInfo(),
    brood: broodInfo, hush: G.hidden,
    emit: G.started ? ai.emit.concat(lingInfo.emit || [], broodInfo.emit, spiders.emitters(player.pos)) : [] });
  if (G.started && !G.scared && !dev.freeze && !G.cine && !G.lookSeq && Math.hypot(player.pos.x - nests[0].x, player.pos.z - nests[0].z) < 7.5) { G.scared = true; swarms.jumpScare(camera, 0); }
  for (const a of G.attached) a.age += dt;
  G.attachCd = Math.max(0, G.attachCd - dt);
  // roaches on you: no damage, but they slow you down and crawl over your face until shaken off
  player.slowMul = Math.max(0.3, Math.max(0.4, 1 - 0.22 * G.attached.length) * (1 - G.lingSlow) * (G.webSlowT > 0 ? 0.5 : 1)) * (showMap ? 0.8 : journal.open ? 0.55 : 1);
  if (G.attached.length) {
    const a = G.attached[0];
    if (a.age > (a.nag || 4)) { a.nag = a.age + 5; msg(touch ? '빨리! 화면을 마구 흔들어!' : '빨리! 마우스를 마구 흔들어!'); }   // still on you: say it again
    if (lookSign && lookSign !== a.lastSign) { a.rev++; a.lastSign = lookSign; }
    a.shake += lookMag;
    if (touch) { const ms = Math.abs(inp.mx) > 0.45 ? Math.sign(inp.mx) : 0; if (ms && ms !== a.lastMx) { a.rev++; a.lastMx = ms; a.shake += 0.3; } }
    if ((a.shake > 0.9 && a.rev >= 3) || a.taps >= 4) { G.attached.shift(); G.attachCd = ATTACH_CD; swarms.throwDead(a.r, player.pos, player.yaw); msg('떼어냈다!'); sfx.shakeOff(); sfx.roachDie(1); buzz(25); if (G.attached[0]) { G.attached[0].shake = 0; G.attached[0].rev = 0; G.attached[0].taps = 0; G.attached[0].nag = G.attached[0].age + 3; } }
  }
  // ...drawn up close on their own canvas; the world behind goes out of focus and shivers a little
  const faceN = faceBugs.update(dt, { list: G.attached, face: swarms.flyer.state === 'face', light: G.blackT > 0 ? 0.05 : G.flashOn ? Math.min(1, fl) : 0.12, bright: SET.bright });
  swarms.faceFx = faceN >= 0;
  swarms.showAttached(camera, faceN >= 0 ? [] : G.attached, dt, t);     // (the old way, if a second canvas can't be had)
  fxBlur += ((faceN > 0 && SET.quality !== 'low' ? (touch ? 1.1 : 1.5) * Math.min(faceN, 2) : 0) - fxBlur) * Math.min(1, dt * 3);
  if (faceN > 0 || fxOn) {
    const j = faceN > 0 && SET.shake !== false ? 0.9 + 0.3 * faceN : 0;
    el.style.filter = fxBlur > 0.05 ? `blur(${fxBlur.toFixed(2)}px)` : '';
    el.style.transform = j ? `translate(${(Math.sin(t * 31) * j).toFixed(1)}px, ${(Math.cos(t * 27) * j).toFixed(1)}px) scale(1.012)` : '';
    fxOn = faceN > 0 || fxBlur > 0.05;
  }
  // a lot of them round your feet: the view drops to look (not more than every 12 s)
  G.feetCd = Math.max(0, (G.feetCd || 0) - dt);
  if (G.started && !G.dead && !G.grab && !G.kill && !G.hidden && !player.inside && G.feetCd <= 0 && !focus) {
    let n = 0, sx = 0, sz = 0;
    for (const r of swarms.roaches) if ((r.state === 'idle' || r.state === 'flee') && r.pos.y < 0.35 && Math.hypot(r.pos.x - player.pos.x, r.pos.z - player.pos.z) < 1.3) { n++; sx += r.pos.x; sz += r.pos.z; }
    if (n >= 5) {
      G.feetCd = 12;
      lookToward(new THREE.Vector3(sx / n, 0.05, sz / n), 0.6, true);
      tip('발밑에... 바퀴가 우글거린다!', 'feet');
    } else if (eggs.active) {
      // the wolf spiderlings round your feet: the same look down
      let m = 0, lx = 0, lz = 0;
      for (const l of eggs.L) if (l.alive && l.t >= 0 && l.phase !== 'fall' && l.p.y < 0.4 && Math.hypot(l.p.x - player.pos.x, l.p.z - player.pos.z) < 1.4) { m++; lx += l.p.x; lz += l.p.z; }
      if (m >= 4) {
        G.feetCd = 12;
        lookToward(new THREE.Vector3(lx / m, 0.05, lz / m), 0.6, true);
        tip('발밑에... 거미 새끼들이 우글거린다!', 'feetling');
      }
    }
  }
  { const on = G.attached.length > 0 || swarms.flyer.state === 'face', k = on ? (G.flashOn ? 0.3 : 0.22) : 0; swarms.faceAmb += (k - swarms.faceAmb) * Math.min(1, dt * 6); }
  if (!G.kill) { $('#crawl').classList.toggle('show', G.attached.length > 0); $('#crawl').style.setProperty('--n', G.attached.length); }

  // ---- lamps (safe zones)
  G.inSafe = false;
  for (const l of lamps) {
    const d = Math.hypot(player.pos.x - l.x, player.pos.z - l.z);
    if (!G.lampSeen && d < 7 && !l.on) { G.lampSeen = true; tip('전등 아래는 안전하다. 오래가진 않겠지만', 'lamp'); }
    if (l.on) {
      l.t += dt;
      const left = 20 - l.t;
      const f = (left < 5 ? (Math.sin(t * (18 + (5 - left) * 6)) > -0.2 ? 1 : 0.15) : 1) * (G.blackT > 0 ? 0 : G.backT > 0 ? (Math.random() < 0.5 ? 1 : 0) : 1);
      if (G.blackT > 0) l.t -= dt;          // (the bulb isn't burning meanwhile)
      l.light.intensity = 9 * f;
      sfx.lampLevel(l.x, l.z, f);
      l.bulb.material.emissiveIntensity = 3 * f;
      if (d < 4.2 && G.blackT <= 0) G.inSafe = true;
      if (l.t >= 20) { sfx.lampOff(l.x, l.z); l.on = false; l.light.intensity = 0; l.bulb.material.emissiveIntensity = 0; l.leverPivot.rotation.z = 0.6; if (!G.tipped.lampOff) { G.tipped.lampOff = true; msg('불이 꺼졌다. 레버를 당기면 다시 켜진다'); } }
    }
  }
  $('#safe').classList.toggle('show', G.inSafe);
  // under a table: are you hidden, or giving yourself away?
  const hideEl = $('#hide');
  const hideTxt = !(player.inside && player.inside.hide) || !G.started || G.dead ? '' : G.hidden ? '숨을 죽인다...' : G.flashOn ? '불빛 때문에 들키겠다' : G.revealT > 0 ? '스프레이 소리에 들켰다' : player.speed >= 0.35 ? '움직이면 들킨다' : '';
  hideEl.classList.toggle('show', !!hideTxt); hideEl.classList.toggle('on', G.hidden);
  if (hideTxt && hideEl.dataset.t !== hideTxt) { hideEl.dataset.t = hideTxt; hideEl.querySelector('span').textContent = hideTxt; }

  // ---- the hall: window light; the broken tube by the wolf spider sputtering away, the others catching now
  // and then (all dead in a blackout)
  {
    if (!G.hallLit && G.started && roomAt(player.pos.x, player.pos.z) === 'hall') G.hallLit = true;
    for (const L of hallFill) L.intensity = G.started ? 6.5 : 0;
    const w = spiders.wolf && spiders.wolf.s.root.position;
    let live = null;
    if (G.hallLit && w) for (const h of hallTubes) if (!live || Math.hypot(h.x - w.x, h.z - w.z) < Math.hypot(live.x - w.x, live.z - w.z)) live = h;
    for (const h of hallTubes) {
      let on = false;
      if (h === live && G.blackT <= 0) {
        // a tube on its way out: lit for a while, then a stutter of quick blinks, now and then dark a moment
        h.timer -= dt;
        if (h.timer <= 0) {
          if (h.mode === 'on') { h.mode = Math.random() < 0.25 ? 'off' : 'stutter'; h.timer = h.mode === 'off' ? 0.4 + Math.random() * 1.4 : 0.3 + Math.random() * 0.9; }
          else { h.mode = 'on'; h.timer = 0.6 + Math.random() * 3; }
        }
        on = h.mode === 'on' || (h.mode === 'stutter' && Math.random() < 0.45);
      } else if (G.hallLit && G.blackT <= 0) {
        // the others: dark a while, then one catches (a few blinks), burns a few seconds, and dies again
        h.timer -= dt;
        if (h.timer <= 0) {
          if (h.mode === 'off') { h.mode = 'catch'; h.timer = 0.4 + Math.random() * 0.8; }
          else if (h.mode === 'catch') { h.mode = 'on'; h.timer = 3 + Math.random() * 6; }
          else { h.mode = 'off'; h.timer = 2 + Math.random() * 7; }
        }
        on = h.mode === 'on' ? Math.random() > 0.01 : h.mode === 'catch' && Math.random() < 0.35;
      } else h.mode = 'off';
      if (on && !h.lit) sfx.fluoroTick(h.x, 4.4, h.z);
      h.lit = on;
      h.k += ((on ? 1 : 0) - h.k) * Math.min(1, dt * (on ? 40 : 18));
      h.light.intensity = 14 * h.k; h.glow.emissiveIntensity = 2.6 * h.k;
    }
  }
  // ---- red emergency lights
  for (const [room, r] of Object.entries(reds)) {
    const target = r.on && G.blackT <= 0 ? 7 * (0.85 + 0.15 * Math.sin(t * 2.1 + room.length)) : 0;
    r.light.intensity += (target - r.light.intensity) * (1 - Math.exp(-dt * 3));
    r.fixture.material.emissiveIntensity = r.on && G.blackT <= 0 ? 4 : 0;
    if (r.on && roomAt(player.pos.x, player.pos.z) === room) tip('붉은 비상등으로는 벌레를 못 막는다', 'red');
  }
  for (const g of genMeshes) if (g.on) g.g.position.y = 0.006 * Math.sin(t * 90);

  // ---- doors (and the tape across the way on, until this zone's generator runs)
  for (const zg of zoneGates) {
    const gen = genMeshes.find((g) => g.room === zg.room), open = !!(gen && gen.on);
    zg.col.off = open; zg.tape.visible = !open;
    if (!open && G.started && !G.dead && !G.won) {
      const along = zg.axis === 'z' ? player.pos.x : player.pos.z, across = (zg.axis === 'z' ? player.pos.z : player.pos.x) - zg.at;
      if (along > zg.from && along < zg.to && Math.abs(across) < 1.0 && t - zg.saidT > 6) { zg.saidT = t; msg(`아직 ${ROOMS[zg.room].name} 발전기를 안 켰다. 먼저 켜고 가자`); }
    }
  }
  if (G.emergencyOpening && G.emergency < 1) { G.emergency = Math.min(1, G.emergency + dt / 1.6); emDoor.position.x = -15.5 - 3 * G.emergency; if (G.emergency > 0.7) emCol.off = true; }
  if (G.shutterOpening && G.shutter < 1) {
    G.shutter = Math.min(1, G.shutter + dt / 3.2);
    shutter.position.y = 4.4 * G.shutter + 0.01 * Math.sin(t * 40) * (1 - G.shutter);
    dawn.intensity = 6 * G.shutter;
    if (G.shutter > 0.55) shCol.off = true;
  }
  shutterGlow.color.set(G.gens === 3 ? 0x30ff60 : 0xff2010);
  if (!G.won && G.shutter > 0.55 && player.pos.z < -1.0) {
    G.won = true; G.timing = false; setMask(false);
    sfx.setMusic('escape', { phase: 'out' });     // through the shutter: the escape music lands (and rings on into the yard)
    $('#winTime').textContent = fmt(G.time);
    if (document.pointerLockElement) document.exitPointerLock();
    const showWin = () => { document.body.classList.remove('ending'); renderer.toneMappingExposure = GAME_EXPOSURE; sfx.introMode(false); sfx.engine(false); sfx.win(); showResults(); $('#win').classList.add('show'); };
    if (intro) {
      // out in the yard: back to the truck and one last call (see intro.ending)
      clearTips(); voice.clear(); promptEl.classList.remove('show');
      if (showMap) toggleMap(); if (journal.open) journal.toggle(false);
      document.body.classList.add('ending'); sfx.introMode(true);
      intro.ending(player.pos.x, showWin, G.leeId);
      return;
    }
    showWin();
  }

  // ---- interaction
  const target = G.started && !G.won ? findTarget() : null;
  let prompt = '';
  const pressed = inp.usePressed || (inp.use && !prevUse);
  prevUse = inp.use; input.usePressed = false;
  if (!target || target.kind !== 'gen') G.holdT = 0;
  if (target) {
    const o = target.obj;
    if (target.kind === 'gen') {
      if (o.on) prompt = '발전기 가동 중';
      else {
        // the starter cord: keep pulling (hold) and it catches after a couple of seconds; let go and it slips back
        const need = D().pull;
        if (inp.use) {
          const before = G.holdT;
          G.holdT += dt;
          if (before === 0 || Math.floor(before / 0.8) !== Math.floor(G.holdT / 0.8)) sfx.pullCord(true, o.x, o.z);   // a pull every 0.8 s
          if (G.holdT >= need) { G.holdT = 0; genOn(o); }
        } else G.holdT = Math.max(0, G.holdT - dt * 1.5);
        G.holdMax = need;
        prompt = `${useLabel()} 꾹 누르기 · 시동줄 당기기`;
      }
    } else if (target.kind === 'labdoor') {
      const D_ = labDoor, inWay = Math.abs(player.pos.x - LAB.x) < 0.55 && player.pos.z > LAB.z0 - 0.3 && player.pos.z < LAB.z1 + 0.3;
      prompt = `${useLabel()} · 문 ${D_.want > 0.5 ? '닫기' : '열기'}`;
      if (pressed) {
        if (D_.want > 0.5 && inWay) tip('문 앞에서 비켜야 닫을 수 있다');
        else if (D_.want > 0.5 && centi.active && Math.hypot(centi.head.x - LAB.x, centi.head.z - LAB.zc) < 1.6) tip('...늦었다');
        else { D_.want = D_.want > 0.5 ? 0 : 1; sfx.doorRumble(LAB.x, LAB.zc, 0.9); G.events.push({ x: LAB.x, z: LAB.zc, r: 8 }); }
      }
    } else if (target.kind === 'leeId') {
      prompt = `${useLabel()} · 사원증 챙기기`;
      if (pressed) {
        G.leeId = true; lee.takeCard(); sfx.paper(); buzz(30);
        msg('이정훈의 사원증을 챙겼다');
        tip('...같이 나가요. 이거라도', 'leeTake');
      }
    } else if (target.kind === 'can') {
      prompt = `${useLabel()} · 빈 캔 줍기 (${G.cans}/3)`;
      if (pressed) {
        if (G.cans >= 3) msg('더는 못 든다 (3개까지)');
        else {
          cans.take(o); G.cans++; sfx.canClank(o.pos.x, 0.1, o.pos.z, 0.15); updateItems();
          if (!G.tipped.canPick) { G.tipped.canPick = true; tip(`빈 살충제 캔이다. 던지면 그쪽에서 소리가 나서 벌레를 꾀어낼 수 있겠다 (${KEY.throw})`); }
        }
      }
    } else if (target.kind === 'camera') {
      prompt = `${useLabel()} · 일회용 카메라 줍기`;
      if (pressed) {
        camItem.taken = true; camItem.g.visible = false; G.hasCam = true; G.shots = 3; sfx.paper(); updateItems();
        tip(`2조 카메라다. 플래시로 벌레를 잠깐 멈추게 할 수 있겠다. 찍은 건 수첩에 붙여 두자 (${KEY.cam})`);
      }
    } else if (target.kind === 'lamp') {
      // as often as you like: pulling it again while it's on starts the 20 s over
      prompt = o.on ? `${useLabel()} · 레버 다시 당기기 (${Math.ceil(20 - o.t)}초 남음)` : `${useLabel()} · 전등 레버 당기기`;
      if (pressed) {
        o.on = true; o.t = 0; o.burnt = false; o.leverPivot.rotation.z = -0.6; sfx.lampOn(o.x, o.z);
        if (G.checkpoint !== o) { G.checkpoint = o; msg('불을 켰다. 무슨 일이 생기면 여기로 돌아오자'); }
      }
    } else if (target.kind === 'note') {
      prompt = `${useLabel()} · 일지 읽기`;
      if (pressed) { o.read = true; o.m.visible = false; note(o.text); sfx.paper(); }
    } else if (target.kind === 'tape') {
      prompt = `${useLabel()} · 녹음기 재생`;
      if (pressed) { o.played = true; o.led.material.emissiveIntensity = 0; voice.say(o.lines, 'tape'); }
    } else if (target.kind === 'refill') {
      prompt = `${useLabel()} · 스프레이 리필 줍기`;
      if (pressed) { refill.taken = true; refill.m.visible = false; G.spray += 2; sfx.canRattle(); msg('스프레이를 주웠다 (+2)'); }
    }
  }
  promptEl.classList.toggle('show', !!prompt);
  if (prompt) { $('#prompt span').textContent = prompt; barEl.style.width = `${Math.min(1, G.holdT / (G.holdMax || 3)) * 100}%`; }
  $('#prompt .bar').style.opacity = G.holdT > 0 ? 1 : 0;
  // recorders still to play blink their red light; the radio and recordings run at the bottom
  for (const r of tapes) if (!r.played) r.led.material.emissiveIntensity = Math.sin(t * 4 + r.x) > 0.2 ? 2.2 : 0.15;
  voice.update(dt); journal.update(dt);
  { // winded: stamina well down from running (not while hiding: you hold your breath there)
    const st = player.stamina, k = G.started && !G.dead && !G.won && !G.hidden && !G.kill ? Math.max(player.exhausted ? 0.85 : 0, Math.min(1, (0.62 - st) / 0.62)) : 0;
    if (MB.on) maskTick(dt, Math.max(k, G.started && !G.dead && !G.won && !G.hidden ? Math.min(1, inten) * 0.5 : 0), G.hidden || G.dead || G.won);   // in the mask: heard, and fogging the visor
    else breath.update(dt, k, G.flashOn && !G.drained && G.blackT <= 0 ? 1 : G.inSafe ? 0.7 : 0.28);
  }
  if (G.started && !G.dead && !G.won && G.oddN < RADIO_ODD.length && (G.oddT -= dt) <= 0 && !voice.busy) { voice.say(RADIO_ODD[G.oddN++]); G.oddT = 80 + Math.random() * 70; }

  // ---- HUD
  $('#stamina').style.opacity = player.stamina < 0.999 ? 1 : 0;
  $('#stamina i').style.width = `${player.stamina * 100}%`;
  $('#stamina').classList.toggle('tired', player.exhausted);
  $('#spray b').textContent = G.spray;
  if (Math.floor(t * 4) !== Math.floor((t - dt) * 4)) updateHud();
  if (showMap && (G.grab || G.dead || G.kill)) toggleMap();          // it drops when something has you
  if (showMap) drawMap(dt);
  if (dev.info && Math.floor(t * 4) !== Math.floor((t - dt) * 4)) {
    fpsN++;
    $('#devinfo').textContent = `FPS ${Math.round(1 / Math.max(1e-3, fpsAvg))}  위치 ${player.pos.x.toFixed(1)}, ${player.pos.z.toFixed(1)}  방 ${(ROOMS[roomAt(player.pos.x, player.pos.z)] || {}).name || '-'}\n체력 ${G.hp}/${D().hp}  열 ${Math.round((1 - G.battery) * 100)}%${G.drained ? ' 과열' : ''}  소음 반경 ${noise}m  붙은 바퀴 ${G.attached.length}\n숨기 ${G.hidden ? '숨음' : player.inside ? '들킴' : '-'}  바퀴 떼 ${swarms.states().map((x, i) => `${i + 1}:${({ hide: '숨음', hunt: '추적', search: '수색', return: '복귀' })[x]}`).join('  ')}\n거미 ${spiders.states().join(' / ')}  지네 ${centi.info()}  알집 ${eggs.burstDone ? '터짐' : '그대로'}  느려짐 ${Math.round((1 - player.slowMul) * 100)}%`;
  }
  fpsAvg += (dt - fpsAvg) * 0.05;
  if (window.__NORENDER) return;
  cullRooms(); poolLights();
  withBright(() => { renderer.render(scene, camera); if (!(G.kill && G.kill.t > 0.5)) arms.render(renderer, camera); });
  uncull();   // the arms are gone once you're knocked down
  faceBugs.render();
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
    // desktop Chrome/Edge: in fullscreen the game keys, Ctrl combinations included, go to the game and not the browser
    try { const kb = navigator.keyboard; if (kb && kb.lock) kb.lock(['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyE', 'KeyQ', 'KeyF', 'KeyM', 'KeyB', 'KeyC', 'KeyG', 'KeyV', 'KeyR', 'KeyT', 'KeyJ', 'Space', 'ShiftLeft', 'ShiftRight', 'ControlLeft', 'ControlRight']).catch(() => {}); } catch (e) { /* not supported */ }
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
  document.body.classList.toggle('fs', on); document.body.classList.toggle('nofs', !fsOK() && !standalone);
  document.querySelectorAll('[data-act="fs"]').forEach((b) => { b.classList.toggle('on', on); b.textContent = on ? '창 모드' : '전체화면'; });
  if (standalone) document.querySelectorAll('[data-act="fs"]').forEach((b) => { b.style.display = 'none'; });
}
document.addEventListener('fullscreenchange', syncFs);
// sound needs a first tap or key press before the browser lets it play
// (on the main screen the factory's own sounds stay off until you are inside)
sfx.prefetch(Object.values(HQ_VOX).filter((n) => n.startsWith('hq_i')));
const firstSound = () => { sfx.start(); sfx.loadVoices(Object.values(HQ_VOX)); if (intro && intro.active) sfx.introMode(true); };
addEventListener('pointerdown', firstSound, { once: true, capture: true });
addEventListener('keydown', firstSound, { once: true, capture: true });
// the main screen wants the whole screen; browsers only allow that from a tap, so the first tap on it asks
addEventListener('pointerup', (e) => {
  if (!(intro && intro.active) || fsEl() || standalone || !fsOK()) return;
  if (e.target.closest && e.target.closest('#tools, #dev, #settings')) return;
  enterFullscreen().catch(() => {});
}, { capture: true });
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
// the main screen is the drive in (not in tests unless asked for with ?intro)
intro = TEST && !new URLSearchParams(location.search).has('intro') ? null : createIntro({
  renderer, sfx, onDone: () => beginGame({ fromIntro: true }),
  ui: {
    fade(v) { $('#fadeBlack').style.opacity = v; },
    mask: setMask,
    subtitle(who, text) {
      const el = $('#subtitle');
      if (!who) { el.classList.remove('show'); return; }
      el.querySelector('b').textContent = who === '나' ? '나' : '무전'; el.querySelector('span').textContent = text;
      el.classList.toggle('me', who === '나'); el.classList.add('show');
      el.querySelector('i').textContent = touch ? '터치 ▸' : '엔터 ▸';
    },
    radioButton(x, y) { const b = $('#startBtn'); if (x == null) { b.style.visibility = 'hidden'; return; } b.style.visibility = ''; b.style.left = `${x}px`; b.style.top = `${y}px`; },
    skip(on) { $('#skipBtn').classList.toggle('show', on); },
  },
});
if (intro) document.body.classList.add('intro');
function beginGame({ fromIntro = false, quiet = false } = {}) {
  if (intro && intro.active) intro.stop();
  document.body.classList.remove('intro');
  $('#start').classList.add('hide');
  renderer.toneMappingExposure = GAME_EXPOSURE;
  sfx.introMode(false); sfx.engine(false);
  if (G.started) return;
  G.started = true; setMask(true);
  sfx.loadVoices([...TAPES.flatMap((r) => r.lines.map((l) => l[3]).filter(Boolean)), ...DREAD_CLIPS, ...Object.values(HQ_VOX)]);   // the recorded voices
  setTimeout(() => faceBugs.prepare(), 1500);       // build the close-up roaches while it's quiet
  G.hp = D().hp; G.spray = D().spray;
  if (fromIntro) sfx.slam();                      // the shutter comes down behind you
  if (!quiet) setTimeout(() => tip(`너무 어둡다. 손전등을 켜자 (${KEY.flash})`, 'start'), fromIntro ? 1800 : 1200);
  if (!quiet) setTimeout(() => { if (G.started && !G.won && G.calls === 3 && G.gens === 0) tip(`길을 모르겠으면 본부에 물어보자 (${KEY.radio}) · 세 번까지`, 'radiohint'); }, 50000);
  updateRadioBtn();
}
$('#startBtn').addEventListener('click', () => {
  sfx.start();
  if (fsOK() && !fsEl() && !standalone) enterFullscreen().catch(() => {});
  if (!viaTouch()) requestLock();
  if (intro && intro.active) { sfx.introMode(true); $('#start').classList.add('hide'); intro.answer(); }
  else beginGame();
});
$('#skipBtn').addEventListener('click', (e) => { e.stopPropagation(); if (intro && intro.active) intro.skip(); });
addEventListener('pointerdown', (e) => { if (intro && intro.active && !(e.target.closest && e.target.closest('#skipBtn, #tools, #settings, #dev'))) intro.tap(); });
addEventListener('keydown', (e) => { if (intro && intro.active && (e.code === 'Enter' || e.code === 'NumpadEnter' || e.code === 'Space')) { e.preventDefault(); intro.tap(); } });
$('#againBtn').addEventListener('click', () => {
  sfx.start();
  resetGame(); G.started = true; setMask(true);
  if (!viaTouch()) requestLock();
});

// ------------------------------------------------------------------ settings
// keeping up the frame rate: when frames run slow for a couple of seconds the picture is drawn a little
// less sharp (down to 60%), and sharper again once there's room; never sharper than the quality setting.
// Still under 30 fps at 60% for a few seconds: the quality setting itself steps down (high → mid → low,
// which drops the shadows), unless '화질 자동 조절' is off; it never steps back up on its own
const dynRes = { k: 1, acc: 0, n: 0, slow: 0, fast: 0, last: 0, crawl: 0, qHold: 0 };
function adaptRes() {
  const now = performance.now(), dt = (now - dynRes.last) / 1000; dynRes.last = now;
  if (TEST || !(dt > 0) || dt > 0.5 || document.hidden) return;
  dynRes.acc += dt; dynRes.n++;
  if (dynRes.acc < 1) return;
  const fps = dynRes.n / dynRes.acc; dynRes.acc = 0; dynRes.n = 0;
  if (fps < 45) { dynRes.slow++; dynRes.fast = 0; } else if (fps > 56) { dynRes.fast++; dynRes.slow = 0; } else dynRes.slow = dynRes.fast = 0;
  dynRes.crawl = fps < 30 && dynRes.k <= 0.61 ? dynRes.crawl + 1 : 0;
  if (dynRes.crawl >= 3 && SET.autoQ !== false && SET.quality !== 'low' && G.started && now > dynRes.qHold) {
    SET.quality = SET.quality === 'high' ? 'mid' : 'low'; dynRes.crawl = 0; dynRes.qHold = now + 15000; applySettings();
    msg(`화면이 버벅여서 화질을 '${SET.quality === 'mid' ? '중간' : '낮음'}'으로 낮췄어요 (설정에서 바꿀 수 있어요)`);
  }
  if (dynRes.slow >= 2 && dynRes.k > 0.6) { dynRes.k = Math.max(0.6, dynRes.k - 0.1); dynRes.slow = 0; dynRes.hold = now + 20000; applyQuality(); }
  else if (dynRes.fast >= 6 && dynRes.k < 1 && now > (dynRes.hold || 0)) { dynRes.k = Math.min(1, dynRes.k + 0.05); dynRes.fast = 0; applyQuality(); }
}
// quality: how sharp the picture is drawn, and (low) no shadows
function applyQuality() {
  const q = SET.quality, cap = q === 'high' ? (touch ? 1.35 : 1.75) : q === 'mid' ? (touch ? 1 : 1.25) : 0.7;
  renderer.setPixelRatio(Math.max(0.5, Math.min(window.devicePixelRatio || 1, cap) * dynRes.k));
  SILK_RES.set(innerWidth, innerHeight);
  const sh = q !== 'low';
  if (renderer.shadowMap.enabled !== sh) {
    renderer.shadowMap.enabled = sh;
    const redo = (o) => o.traverse((m) => { if (m.material) (Array.isArray(m.material) ? m.material : [m.material]).forEach((x) => { x.needsUpdate = true; }); });
    redo(scene); if (intro) redo(intro.scene);
  }
}
const setPanel = $('#settings');
const SET_UI = { sens: [$('#setSens'), (v) => `${v.toFixed(2)}×`], vol: [$('#setVol'), (v) => `${Math.round(v * 100)}%`], bright: [$('#setBright'), (v) => `${Math.round(v * 100)}%`] };
function syncSettings() {
  for (const [k, [inp, f]] of Object.entries(SET_UI)) { inp.value = SET[k]; inp.parentElement.querySelector('b').textContent = f(SET[k]); }
  setPanel.querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('on', b.dataset.sub === SET.sub));
  setPanel.querySelectorAll('[data-tog]').forEach((b) => b.classList.toggle('on', (SET[b.dataset.tog] !== false) === (b.dataset.v === '1')));
  setPanel.querySelectorAll('[data-q]').forEach((b) => b.classList.toggle('on', b.dataset.q === SET.quality));
  setPanel.querySelectorAll('[data-diff]').forEach((b) => b.classList.toggle('on', b.dataset.diff === SET.diff));
  $('#diffNote b').textContent = D().label;
}
function saveSettings() { try { localStorage.setItem('mandible.settings', JSON.stringify(SET)); } catch (e) { /* private mode */ } }
function applySettings() {
  sfx.setVolume(SET.vol); HUNT.speed = D().speed; paperMap.setDiff(SET.diff); applyQuality();
  document.body.dataset.sub = SET.sub || 'm';
  document.body.classList.toggle('noshake', SET.shake === false);
  $('#vibeRow').style.display = canVibe ? '' : 'none';
  if (SET.tips === false) clearTips();
  syncSettings(); saveSettings();
}
for (const [k, [inp]] of Object.entries(SET_UI)) inp.addEventListener('input', () => { SET[k] = +inp.value; applySettings(); });
setPanel.querySelectorAll('[data-q]').forEach((b) => b.addEventListener('click', () => { SET.quality = b.dataset.q; applySettings(); }));
setPanel.querySelectorAll('[data-sub]').forEach((b) => b.addEventListener('click', () => { SET.sub = b.dataset.sub; applySettings(); }));
setPanel.querySelectorAll('[data-tog]').forEach((b) => b.addEventListener('click', () => { SET[b.dataset.tog] = b.dataset.v === '1'; applySettings(); if (b.dataset.tog === 'vibe' && SET.vibe) buzz(40); }));
setPanel.querySelectorAll('[data-diff]').forEach((b) => b.addEventListener('click', () => {
  if (SET.diff === b.dataset.diff) return;
  SET.diff = b.dataset.diff; applySettings();
  if (G.started && !G.won) msg(`난이도 ${D().label}: 체력·스프레이 수는 다시 시작할 때부터`);
}));
$('#setReset').addEventListener('click', () => { Object.assign(SET, SET_DEFAULT); applySettings(); });
function toggleSettings(on = !setPanel.classList.contains('show')) {
  setPanel.classList.toggle('show', on);
  document.querySelectorAll('[data-act="set"]').forEach((b) => b.classList.toggle('on', on));
  if (on && document.pointerLockElement) document.exitPointerLock();
}
$('#setClose').addEventListener('click', () => { toggleSettings(false); if (G.started && !G.won && !viaTouch() && !(intro && intro.active)) requestLock(); });
document.querySelectorAll('[data-act="set"]').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); toggleSettings(); }));
setPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
setPanel.addEventListener('keydown', (e) => e.stopPropagation());
applySettings();

// ------------------------------------------------------------------ landscape on phones
let needRotate = false;
function checkOrient() { needRotate = touch && innerHeight > innerWidth; $('#rotate').classList.toggle('show', needRotate); }
addEventListener('resize', checkOrient);
addEventListener('orientationchange', () => setTimeout(checkOrient, 200));
checkOrient();
function shakeTap() { if (G.attached[0]) G.attached[0].taps++; shakeKick = 1; }
// a roach on your face: the view shudders the whole time it's there, with a sharper flinch now and then
// (harder with more of them on you, and while you fight it off)
let shudT = 0, shudJolt = 0, shudNext = 0;
function faceShudder(dt) {
  shudT += dt; shudNext -= dt; shudJolt = Math.max(0, shudJolt - dt * 5);
  if (shudNext <= 0) { shudJolt = Math.max(shudJolt, 0.6 + Math.random() * 0.8); shudNext = 0.5 + Math.random() * 1.1; }
  const k = Math.min(1.6, 0.6 + 0.25 * G.attached.length + shakeKick * 0.6) * (1 + shudJolt), t = shudT;
  const w = (a, b, c) => Math.sin(t * a) + 0.6 * Math.sin(t * b + 1.3) + 0.35 * Math.sin(t * c + 2.1);
  camera.rotateY(w(19, 31, 53) * 0.009 * k);
  camera.rotateX(w(23, 37, 59) * 0.007 * k);
  camera.rotateZ(w(13, 29, 47) * 0.016 * k);
  camera.position.y += w(27, 41, 67) * 0.006 * k;
}

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
addEventListener('keydown', (e) => { if (e.code === 'Backquote' && devTools) toggleDev(); });
// the developer buttons (개발 · 벌레 위치 · 밝게) stay hidden: F1 shows/hides them (on a phone: hold 설정 for 1.5 s)
function setDevTools(on) {
  devTools = on;
  document.body.classList.toggle('devtools', on);
  try { localStorage.setItem('mandible.dev', on ? '1' : '0'); } catch (e) { /* private mode */ }
  if (!on) {
    if (devPanel.classList.contains('show')) toggleDev();
    if (bright) toggleBright();
    if (markers.visible) { markers.visible = false; document.querySelectorAll('[data-act="marks"], [data-dev="marks"]').forEach((x) => x.classList.remove('on')); }
  }
  msg(on ? '개발자 도구 표시 (F1로 숨기기)' : '개발자 도구 숨김');
}
addEventListener('keydown', (e) => { if (e.code === 'F1') { e.preventDefault(); if (!e.repeat) setDevTools(!devTools); } }, { capture: true });
addEventListener('help', (e) => e.preventDefault());
{
  let holdT = 0, held = false;
  document.querySelectorAll('[data-act="set"]').forEach((b) => {
    b.addEventListener('pointerdown', () => { held = false; clearTimeout(holdT); holdT = setTimeout(() => { held = true; setDevTools(!devTools); }, 1500); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) b.addEventListener(ev, () => clearTimeout(holdT));
    b.addEventListener('click', (e) => { if (held) { e.stopImmediatePropagation(); held = false; } }, { capture: true });
  });
}
document.body.classList.toggle('devtools', devTools);
devPanel.addEventListener('pointerdown', (e) => e.stopPropagation());
devPanel.querySelectorAll('[data-tp]').forEach((b) => b.addEventListener('click', () => {
  const [x, z, yaw, pitch] = TP[b.dataset.tp];
  if (!G.started) beginGame({ quiet: true });
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
  if (!G.started) beginGame({ quiet: true });
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
  arms, sfx, scene, flashLight: flash, tip, duct, DUCT, labDoor, centiKill: startCentiKill, discover, journal, gate, phantom, deadMan, lee, visions, genOn, marks, faceBugs, dread, tapes, voice, throwCan, snapPhoto, glanceAt, cansList: () => cans.list, setAdapt(v) { adapt = v; }, get adapt() { return adapt; },
  FrustumCls: THREE.Frustum, cullRooms, uncull, culled, dynRes, adaptRes, pixelRatio: () => renderer.getPixelRatio(),
  // draw one frame from a set viewpoint without moving anything (to compare culled and unculled)
  renderView(x, y, z, yaw, pitch) {
    camera.position.set(x, y, z); camera.quaternion.setFromEuler(new THREE.Euler(pitch, yaw + Math.PI, 0, 'YXZ')); camera.updateMatrixWorld();
    cullRooms(); poolLights(); withBright(() => renderer.render(scene, camera)); uncull();
  },
  renderInfo() { const i = renderer.info; i.autoReset = false; i.reset(); frame(1 / 30); const o = { calls: i.render.calls, tris: i.render.triangles, geos: i.memory.geometries, tex: i.memory.textures }; i.autoReset = true; return o; },
  step(n = 1, dt = 1 / 60) { for (let i = 0; i < n; i++) frame(dt); },
  start() { beginGame({ quiet: true }); },
  intro: () => intro,
  setInput(o) { override = o ? Object.assign({ mx: 0, mz: 0, run: false, crouch: false, lookX: 0, lookY: 0, use: false, usePressed: false }, o) : null; },
  teleport(x, z, yaw, pitch = 0) { player.place(x, z, yaw); player.pitch = pitch; },
  flash(on) { if (G.flashOn !== on) toggleFlash(); },
  bright(on) { if (bright !== on) toggleBright(); },
  map(on) { if (showMap !== on) toggleMap(); },
};
cullSetup(); poolSetup();
$('#loading').classList.add('done');
if (TEST) window.__READY = true;
else renderer.setAnimationLoop(() => { adaptRes(); frame(); });
