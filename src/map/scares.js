// Three set pieces:
//  - PassageGate: the emergency passage behind the warehouse's west door is a dead end until the lab
//    generator opens its far door, so a big ghost spider has walled its mouth off with silk. It won't
//    let you by (it shakes in its web at you, the way cellar spiders do), spray won't touch that web,
//    and it does you no harm. Once all three generators run it is gone and the web hangs in rags.
//  - Phantom: during the blackout when the first generator starts, a ghost spider drops on its line
//    in front of your face; when the lights come back it is hanging there, and it shoots back up.
//  - DeadWorker: the pest-control man who came in before you, wrapped head-down in silk in the
//    corridor, his flashlight still on the floor below him, flickering.
import * as THREE from 'three';
import { Spider } from '../spider.js';
import { Thread, sagLine, segmentsGeometry } from '../silk.js';
import { Hand } from '../hands/handmodel.js';
import { gloveMaterial, sleeveMaterial, tyvekTextures } from '../hands/materials.js';
import { makeFlashlight } from '../hands/props.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp, sstep = THREE.MathUtils.smoothstep;

function rng(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

function surfQuat(n, f) {
  const Y = n.clone().normalize(), Z = f.clone().addScaledVector(Y, -f.dot(Y));
  if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
  Z.normalize();
  const X = new V3().crossVectors(Y, Z);
  return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
}

// a sheet of old, dusty silk: many fine strands, thick in the corners and round the middle
function silkSheetTexture(seed, torn = false) {
  const N = 512, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), R = rng(seed);
  g.clearRect(0, 0, N, N);
  g.lineCap = 'round';
  const strand = (x0, y0, x1, y1, a, w) => {
    g.strokeStyle = `rgba(235,232,222,${a})`; g.lineWidth = w;
    g.beginPath(); g.moveTo(x0, y0);
    const mx = (x0 + x1) / 2 + (R() - 0.5) * 40, my = (y0 + y1) / 2 + (R() - 0.5) * 40 + 10;
    g.quadraticCurveTo(mx, my, x1, y1); g.stroke();
  };
  const n = torn ? 260 : 2600;
  for (let i = 0; i < n; i++) {
    let x0, y0, x1, y1;
    if (torn) {
      // only rags along the frame
      const side = Math.floor(R() * 3);
      if (side === 0) { x0 = R() * N; y0 = R() * 30; } else if (side === 1) { x0 = R() * 40; y0 = R() * N; } else { x0 = N - R() * 40; y0 = R() * N; }
      x1 = x0 + (R() - 0.5) * 120; y1 = y0 + R() * 160;
    } else {
      const k = R();
      if (k < 0.35) { const cx = R() < 0.5 ? 0 : N, cy = R() < 0.5 ? 0 : N; x0 = cx + (R() - 0.5) * 60; y0 = cy + (R() - 0.5) * 60; x1 = cx + (N / 2 - cx) * R() * 1.2; y1 = cy + (N / 2 - cy) * R() * 1.2; }
      else if (k < 0.65) { const a = R() * 6.28, r = 40 + R() * 200; x0 = N / 2 + (R() - 0.5) * 60; y0 = N * 0.45 + (R() - 0.5) * 60; x1 = N / 2 + Math.cos(a) * r; y1 = N * 0.45 + Math.sin(a) * r; }
      else { x0 = R() * N; y0 = R() * N; x1 = x0 + (R() - 0.5) * 240; y1 = y0 + (R() - 0.5) * 240; }
    }
    strand(x0, y0, x1, y1, 0.05 + R() * 0.16, 0.6 + R() * 1.4);
  }
  // matted clumps
  if (!torn) for (let i = 0; i < 40; i++) {
    const x = R() * N, y = R() * N, r = 6 + R() * 26;
    const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(225,222,210,0.28)'); gr.addColorStop(1, 'rgba(225,222,210,0)');
    g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

// ---------------------------------------------------------------- the spider in the passage door
export const GATE = { x: -11.72, z0: 27, z1: 30, h: 3, cz: 28.5 };

export class PassageGate {
  constructor(scene, silk, T, colliders) {
    this.group = new THREE.Group(); scene.add(this.group);
    this.col = { x0: -12.3, x1: -11.7, z0: GATE.z0, z1: GATE.z1, y1: GATE.h };
    colliders.push(this.col);
    // silk: three layered sheets (lit by the flashlight like any surface) and loose strands that glint
    this.sheets = [];
    [[0.0, 11], [0.06, 23], [0.13, 37]].forEach(([dx, seed]) => {
      const m = new THREE.MeshStandardMaterial({ map: silkSheetTexture(seed), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, metalness: 0, color: 0xd8d4c8 });
      const p = new THREE.Mesh(new THREE.PlaneGeometry(GATE.z1 - GATE.z0 + 0.1, GATE.h + 0.05), m);
      p.rotation.y = Math.PI / 2; p.position.set(GATE.x - dx, GATE.h / 2, GATE.cz);
      this.group.add(p); this.sheets.push(p);
    });
    const R = rng(5), segs = [];
    for (let i = 0; i < 520; i++) {
      const edge = R();
      const a = edge < 0.5
        ? new V3(GATE.x - R() * 0.25, R() < 0.5 ? R() * 0.4 : GATE.h - R() * 0.3, GATE.z0 + R() * 3)
        : new V3(GATE.x - R() * 0.25, R() * GATE.h, R() < 0.5 ? GATE.z0 + R() * 0.3 : GATE.z1 - R() * 0.3);
      const b = R() < 0.5 ? new V3(GATE.x - R() * 0.2, 1.0 + R() * 1.4, GATE.cz + (R() - 0.5) * 1.4) : new V3(GATE.x - R() * 0.25, R() * GATE.h, GATE.z0 + R() * 3);
      sagLine(a, b, 0.03 * R(), 3, segs);
    }
    this.lines = new THREE.LineSegments(segmentsGeometry(segs), silk);
    this.lines.frustumCulled = false; this.group.add(this.lines);
    // what is left once it has gone: rags along the frame
    this.rags = new THREE.Mesh(new THREE.PlaneGeometry(GATE.z1 - GATE.z0 + 0.1, GATE.h + 0.05),
      new THREE.MeshStandardMaterial({ map: silkSheetTexture(53, true), transparent: true, depthWrite: false, side: THREE.DoubleSide, roughness: 1, color: 0xd0ccc0 }));
    this.rags.rotation.y = Math.PI / 2; this.rags.position.set(GATE.x - 0.05, GATE.h / 2, GATE.cz);
    this.group.add(this.rags);
    // the spider, head down in the middle of it, back to you
    const s = new Spider('ghost', T);
    s.root.scale.setScalar(2.35);
    s.noAmbush = true; s.state = 'chase'; s.speed = 0;
    s.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    const UP = new V3(0, 1, 0), NX = new V3(1, 0, 0);
    // feet: on the web (and the wall face round the door, which is the same plane) or the floor
    s.surf = (a, b) => {
      let bt = 1, bn = null;
      if (a.x >= GATE.x && b.x < GATE.x) { const t = (GATE.x - a.x) / (b.x - a.x); if (t < bt) { bt = t; bn = NX; } }
      if (a.y >= 0 && b.y < 0) { const t = a.y / (a.y - b.y); if (t < bt) { bt = t; bn = UP; } }
      return bn ? { p: new V3().lerpVectors(a, b, bt), n: bn, t: bt } : null;
    };
    scene.add(s.root);
    this.s = s;
    this.t = 0; this.cd = 0; this.lean = 0; this.near = false; this.touchCd = 0;
    this.setOpen(false);
  }

  setOpen(open) {
    this.open = open;
    this.col.off = open;
    this.s.root.visible = !open;
    for (const p of this.sheets) p.visible = !open;
    this.lines.visible = !open;
    this.rags.visible = open;
    this.near = false;
  }

  // the spray hits the web? (it can't melt it)
  spray(origin, dir, range = 3.4) {
    if (this.open || Math.abs(dir.x) < 1e-4) return false;
    const t = (GATE.x - origin.x) / dir.x;
    if (t < 0 || t > range) return false;
    const y = origin.y + dir.y * t, z = origin.z + dir.z * t;
    if (y < 0 || y > GATE.h + 0.3 || z < GATE.z0 - 0.4 || z > GATE.z1 + 0.4) return false;
    this.s.whirl = 1.6;
    return true;
  }

  // ctx: { dt, cam, light, playerPos, onNear(), onShake(x,y,z), onTouch() }
  update(ctx) {
    if (this.open) return;
    const s = this.s, dt = ctx.dt, P = ctx.playerPos;
    this.t += dt; this.cd -= dt; this.touchCd -= dt;
    const front = P.x > GATE.x - 0.2;
    const d = Math.hypot(P.x - GATE.x, P.z - clamp(P.z, GATE.z0, GATE.z1));
    const lit = s.isLit(ctx.light);
    if (front && d < 6.5 && !this.near) { this.near = true; ctx.onNear && ctx.onNear(); }
    if (d > 9) this.near = false;
    // the closer you come, the more it leans off the web toward you and the more often it shakes
    const k = front ? sstep(6, 1.0, d) : 0;
    this.lean += (k - this.lean) * Math.min(1, dt * 3);
    if (front && (d < 4.5 || lit) && this.cd <= 0) {
      s.whirl = 0.7 + Math.random() * 0.7 + k * 0.6;
      this.cd = 0.8 + (1 - k) * 2.2 + Math.random();
      ctx.onShake && ctx.onShake(GATE.x + 0.4, 1.7, GATE.cz);
    }
    if (front && d < 0.5 && this.touchCd <= 0) { this.touchCd = 4; s.whirl = 2; ctx.onTouch && ctx.onTouch(); }
    // body: head down, turned a little toward you, pulled off the web as it leans out
    const toward = clamp((P.z - GATE.cz) * 0.25, -0.5, 0.5);
    const q = surfQuat(new V3(1, 0, 0), new V3(0, -1, toward));
    const body = new V3(GATE.x + s.P.H * 2.35 + this.lean * 0.28, 1.75 - this.lean * 0.15 + 0.02 * Math.sin(this.t * 1.3), GATE.cz + toward * 0.3);
    s.setBodyAt(body, q);
    s.speed = 0;
    s.update(dt, { light: ctx.light, cam: ctx.cam, bounds: { x0: -12, x1: -11, z0: 27, z1: 30 } });
  }
}

// ---------------------------------------------------------------- the one that drops in the blackout
export class Phantom {
  constructor(scene, silk, T) {
    const s = new Spider('ghost', T);
    s.root.scale.setScalar(1.9);
    s.noAmbush = true; s.grabDist = 0.6;
    s.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    s.root.visible = false;
    scene.add(s.root);
    this.th = new Thread(silk); scene.add(this.th.line); this.th.line.visible = false;
    this.s = s; this.active = false;
  }

  // drop in front of the camera (yaw = the way you face), from a ceiling at ceilY, inside the room box
  show(cam, yaw, ceilY, box) {
    const s = this.s;
    const x = clamp(cam.x + Math.sin(yaw) * 1.7, box.x0 + 0.5, box.x1 - 0.5), z = clamp(cam.z + Math.cos(yaw) * 1.7, box.z0 + 0.5, box.z1 - 0.5);
    const UP = new V3(0, 1, 0), DN = new V3(0, -1, 0);
    s.surf = (a, b) => {
      if (a.y <= ceilY && b.y > ceilY) { const t = (ceilY - a.y) / (b.y - a.y); return { p: new V3().lerpVectors(a, b, t), n: DN, t }; }
      if (a.y >= 0 && b.y < 0) { const t = a.y / (a.y - b.y); return { p: new V3().lerpVectors(a, b, t), n: UP, t }; }
      return null;
    };
    s.placeOnCeiling(x, z, yaw + Math.PI, ceilY);
    s.root.visible = true;
    s.caught = false; s.onCatch = null;
    s.startDrop(cam);
    this.box = box; this.ceilY = ceilY;
    this.active = true; this.t = 0; this.litT = -1; this.lightsT = -1; this.gone = 0;
    return { x, z };
  }

  lightsBack() { if (this.active) { this.lightsT = 0; this.s.whirl = 0.9; } }

  // ctx: { dt, cam, light, onRetract(x,y,z) }
  update(ctx) {
    if (!this.active) return;
    const s = this.s, dt = ctx.dt;
    this.t += dt;
    if (this.lightsT >= 0) this.lightsT += dt;
    // hold it on its line in front of you; it goes back up once the beam has been on it a moment, or soon anyway
    const realLit = s.isLit(ctx.light);
    if (realLit && this.lightsT >= 0) this.litT = this.litT < 0 ? 0 : this.litT + dt;
    const up = (this.litT > 0.5 || this.lightsT > 2.2);
    if ((s.state === 'hang' || s.state === 'drop') && !up) {
      if (s.state === 'hang') s.st = Math.min(s.st, 0.3);       // (never swings at you)
    } else if ((s.state === 'hang' || s.state === 'drop') && up) {
      s.startRetract(); s.whirl = 0.6;
      const b = s.bodyWorld; ctx.onRetract && ctx.onRetract(b.x, b.y, b.z);
    }
    if (s.state === 'ceiling') {
      // back up: scuttle off across the ceiling, then it's gone
      this.gone += dt;
      if (this.gone < 0.05) s.callTo(s.root.position.x + (Math.random() - 0.5) * 8, s.root.position.z + (Math.random() - 0.5) * 8, this.box);
    }
    if (s.state === 'crawl' || s.state === 'ceiling') this.gone += dt;
    s.update(dt, { light: this.lightsT >= 0 && this.lightsT < 0.6 ? { on: false } : ctx.light, cam: ctx.cam, bounds: this.box });
    this.th.set(s.anchor, s.spinneretWorld(), s.threadVisible);
    if (this.gone > 2.5) this.hide();
  }

  hide() { this.active = false; this.s.root.visible = false; this.th.line.visible = false; }
}

// ---------------------------------------------------------------- the man who came in before you
export const BODY = { x: 17.9, z: 41.0, top: 4.0 };

export class DeadWorker {
  constructor(scene, silk, colliders) {
    const base = new THREE.Group(); base.position.set(BODY.x, 0, BODY.z); scene.add(base);
    // everything that hangs turns slowly on its line; his face toward the way you come in (south)
    const g = new THREE.Group(); g.rotation.y = -Math.PI / 2; base.add(g);
    this.group = g;
    // the cocoon: head down, feet to the ceiling, lumpy where the silk is wound tight
    const prof = [[0.0, 1.70], [0.08, 1.72], [0.12, 1.78], [0.135, 1.88], [0.125, 1.98], [0.11, 2.05], [0.2, 2.13], [0.245, 2.24], [0.235, 2.42], [0.215, 2.62], [0.2, 2.78],
      [0.19, 2.92], [0.165, 3.1], [0.14, 3.3], [0.115, 3.5], [0.09, 3.68], [0.06, 3.82], [0.03, 3.92], [0.0, 3.96]];
    const pts = prof.map(([r, y]) => new THREE.Vector2(r, y));
    const geo = new THREE.LatheGeometry(pts, 40);
    const R = rng(17), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i), a = Math.atan2(z, x);
      const k = 1 + 0.06 * Math.sin(y * 31 + a * 2) + 0.04 * Math.sin(y * 13 - a * 3) + (R() - 0.5) * 0.03;
      pos.setXYZ(i, x * k, y, z * k * 0.86);
    }
    geo.computeVertexNormals();
    // wound silk: streaks running round and round
    const c = document.createElement('canvas'); c.width = 256; c.height = 512;
    const cg = c.getContext('2d'); cg.fillStyle = '#8e897c'; cg.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 900; i++) {
      const y = R() * 512, w = 30 + R() * 200, x = R() * 256;
      cg.strokeStyle = `rgba(${R() < 0.5 ? '205,200,188' : '96,88,74'},${0.08 + R() * 0.2})`; cg.lineWidth = 0.6 + R() * 2.2;
      cg.beginPath(); cg.moveTo(x, y); cg.quadraticCurveTo(x + w / 2, y + (R() - 0.5) * 30, x + w, y + (R() - 0.5) * 50); cg.stroke();
    }
    for (let i = 0; i < 30; i++) { cg.fillStyle = `rgba(70,58,40,${0.05 + R() * 0.12})`; const y = 60 + R() * 440; cg.fillRect(0, y, 256, 2 + R() * 18); }
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = THREE.RepeatWrapping;
    const cocoon = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ map: tex, roughness: 0.95, color: 0xc4bfb2 }));
    cocoon.castShadow = cocoon.receiveShadow = true;
    g.add(cocoon);
    // the hood and the respirator showing through torn silk at the bottom (face toward the corridor)
    const tyvek = sleeveMaterial(tyvekTextures(256, 9));
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.118, 24, 16), tyvek);
    hood.scale.set(1, 1.15, 0.95); hood.position.set(-0.03, 1.86, 0); g.add(hood);
    const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.75 });
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.07, 20, 14), rubber);
    mask.scale.set(0.7, 1, 1.05); mask.position.set(-0.115, 1.82, 0); g.add(mask);
    const filt = new THREE.MeshStandardMaterial({ color: 0x8a2a5a, roughness: 0.6 });
    for (const sz of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.CylinderGeometry(0.036, 0.036, 0.028, 18).rotateX(Math.PI / 2), filt);
      f.position.set(-0.13, 1.8, sz * 0.07); f.rotation.y = sz * 0.6; g.add(f);
    }
    const lens = new THREE.Mesh(new THREE.SphereGeometry(0.05, 16, 10), new THREE.MeshPhysicalMaterial({ color: 0x222a30, roughness: 0.1, metalness: 0.2, clearcoat: 1 }));
    lens.scale.set(0.35, 0.8, 1.1); lens.position.set(-0.115, 1.93, 0); g.add(lens);
    // one arm got free of the silk and hangs down past his head, glove and all
    const hand = new Hand('right', { glove: (u) => gloveMaterial(u), sleeve: tyvek });
    const wrist = new V3(-0.06, 1.42, 0.2), shoulder = new V3(-0.01, 2.26, 0.13);
    const elbow = wrist.clone().lerp(shoulder, 0.75);
    // back of the hand toward the corridor, fingers down
    const hy = new V3(-1, 0, 0).applyAxisAngle(new V3(0, 1, 0), -0.4), hz = elbow.clone().sub(wrist).normalize();
    hy.addScaledVector(hz, -hy.dot(hz)).normalize();
    const hq = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3().crossVectors(hy, hz), hy, hz));
    hand.ang = hand.chains.map((_, ci) => ci < 4 ? [0.3 + ci * 0.06, 0.45, 0.3, 0, 0] : [0.15, 0.25, 0.2, 0.1, 0]);
    hand.applyAngles();
    hand.place(wrist, hq, elbow);
    g.add(hand.mesh);
    this.hand = hand;
    // the upper arm, from the end of the sleeve up into the silk
    const sTop = wrist.clone().addScaledVector(hz, 0.5), len = sTop.distanceTo(shoulder);
    const upper = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.044, len + 0.04, 14, 1, true), tyvek);
    upper.position.copy(sTop).lerp(shoulder, 0.5);
    upper.quaternion.setFromUnitVectors(new V3(0, 1, 0), shoulder.clone().sub(sTop).normalize());
    g.add(upper);
    // loose silk: lines up to the ceiling and strands wound round it, that glint in the beam
    const segs = [], L = rng(29);
    for (let i = 0; i < 9; i++) { const a = L() * 6.28; sagLine(new V3(Math.cos(a) * 0.08, 3.9, Math.sin(a) * 0.08), new V3(Math.cos(a) * (0.3 + L() * 0.6), BODY.top, Math.sin(a) * (0.3 + L() * 0.6)), 0, 2, segs); }
    for (let i = 0; i < 220; i++) {
      const y = 1.75 + L() * 2.15, r = 0.12 + 0.13 * Math.sin(Math.PI * clamp((y - 1.7) / 2.3, 0, 1)) + 0.02;
      const a0 = L() * 6.28, a1 = a0 + 0.6 + L() * 1.5;
      sagLine(new V3(Math.cos(a0) * r, y, Math.sin(a0) * r * 0.86), new V3(Math.cos(a1) * r, y + (L() - 0.5) * 0.12, Math.sin(a1) * r * 0.86), -0.01, 2, segs);
    }
    const lines = new THREE.LineSegments(segmentsGeometry(segs), silk); lines.frustumCulled = false; g.add(lines);
    // his flashlight, still on, lying on the floor pointing back down the corridor
    const fl = makeFlashlight(), fa = Math.PI + 0.25, fx = BODY.x + 1.0, fz = BODY.z - 0.45;
    fl.position.set(1.0, 0.022, -0.45); fl.rotation.set(0, fa, Math.PI / 2 - 0.1);
    base.add(fl);
    this.led = fl.userData.led;
    this.light = new THREE.SpotLight(0xffe8cc, 0, 11, 0.42, 0.55, 1.6);
    this.light.position.set(fx + Math.sin(fa) * 0.09, 0.05, fz + Math.cos(fa) * 0.09);
    this.light.target.position.set(fx + Math.sin(fa) * 4, 0.35, fz + Math.cos(fa) * 4);
    scene.add(this.light, this.light.target);
    this.col = { x0: BODY.x - 0.27, x1: BODY.x + 0.27, z0: BODY.z - 0.24, z1: BODY.z + 0.3, y1: BODY.top };
    colliders.push(this.col);
    this.t = 0; this.fl = 1; this.flickT = 0;
  }

  // the dying flashlight flickers; the body turns slowly on its line
  update(dt) {
    this.t += dt; this.flickT -= dt;
    if (this.flickT <= 0) { this.flickT = Math.random() < 0.25 ? 0.04 + Math.random() * 0.1 : 0.3 + Math.random() * 1.6; this.fl = Math.random() < 0.3 ? Math.random() * 0.3 : 0.75 + Math.random() * 0.25; }
    this.light.intensity = 9 * this.fl;
    this.led.emissiveIntensity = 2.2 * this.fl;
    this.group.rotation.y = -Math.PI / 2 + 0.35 * Math.sin(this.t * 0.23);
  }
}
