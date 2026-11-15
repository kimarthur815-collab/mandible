import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildShell, colorize, PRONOTUM } from '../roach.js';
import { NavGrid } from './nav.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const lerp = THREE.MathUtils.lerp;
const SCALE = 0.085;   // preview roach is ~4 units long -> ~0.35 m

// ------------------------------------------------------------------ geometry
// One merged roach. Every vertex carries aLeg (0 body, 1-6 legs, 7-8 antennae),
// aPivot (joint it swings around) and aDist (0 at the joint .. 1 at the tip)
// so the vertex shader can walk the legs and wave the antennae per instance.
function tag(g, leg, pivot, distFn) {
  const n = g.attributes.position.count;
  const L = new Float32Array(n), P = new Float32Array(n * 3), D = new Float32Array(n);
  const p = g.attributes.position;
  for (let i = 0; i < n; i++) {
    L[i] = leg;
    P[i * 3] = pivot.x; P[i * 3 + 1] = pivot.y; P[i * 3 + 2] = pivot.z;
    D[i] = distFn ? distFn(p.getX(i), p.getY(i), p.getZ(i)) : 0;
  }
  g.setAttribute('aLeg', new THREE.BufferAttribute(L, 1));
  g.setAttribute('aPivot', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aDist', new THREE.BufferAttribute(D, 1));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}

function rod(a, b, r0, r1, seg = 6) {
  const d = new V3().subVectors(b, a), len = d.length();
  const g = new THREE.CylinderGeometry(r1, r0, len, seg, 1);
  g.translate(0, len / 2, 0);
  g.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()));
  g.translate(a.x, a.y, a.z);
  return g;
}

function ellip(rx, ry, rz, x, y, z, w = 14, h = 10) {
  const g = new THREE.SphereGeometry(1, w, h);
  g.scale(rx, ry, rz); g.translate(x, y, z);
  return g;
}

export function buildRoachGeometry() {
  const parts = [];
  const C = (hex) => new THREE.Color(hex);
  const body = 0.36;
  // head shield with the pale rim
  const prTop = (rho, phi, x, z) => 0.13 * Math.pow(Math.max(0, 1 - rho * rho), 0.62) + 0.016 * (rho > 0.86 ? 1 : 0) - 0.07 * Math.max(0, z / 0.58);
  const pr = buildShell(PRONOTUM.R, prTop, (rho, phi, x, z) => prTop(rho, phi, x, z) - 0.08 * (1 - rho * rho), PRONOTUM.bbox, 6, 28);
  pr.translate(0, body + 0.14, 0.82);
  colorize(pr, (c, x, y, z) => {
    const phi = Math.atan2(z - 0.82, x), rho = Math.hypot(x, z - 0.82) / PRONOTUM.R(phi);
    c.copy(C('#8a6036')).lerp(C('#1c0a05'), 1 - THREE.MathUtils.smoothstep(rho, 0.62, 0.8));
  });
  parts.push(tag(pr, 0, new V3()));
  // wings: two shallow lenses
  for (const s of [-1, 1]) {
    const w = new THREE.SphereGeometry(1, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2);
    w.scale(0.44, 0.09, 1.5); w.translate(s * 0.22, body + 0.08 + (s > 0 ? 0.012 : 0), -0.95);
    colorize(w, (c, x, y, z) => c.copy(C('#45200f')).lerp(C('#200c06'), THREE.MathUtils.smoothstep(z, -0.2, 0.5) * 0.7).lerp(C('#5e2f17'), THREE.MathUtils.smoothstep(Math.abs(x), 0.4, 0.62) * 0.4));
    parts.push(tag(w, s > 0 ? 10 : 9, new V3(s * 0.1, body + 0.1, 0.45)));
  }
  const belly = ellip(0.5, 0.12, 1.25, 0, body - 0.02, -0.9);
  colorize(belly, (c) => c.copy(C('#4a2412')));
  parts.push(tag(belly, 0, new V3()));
  const head = ellip(0.3, 0.19, 0.18, 0, body - 0.12, 1.33);
  colorize(head, (c, x, y) => c.copy(C('#2a1309')).lerp(C('#5a2c12'), y < body - 0.15 ? 0.6 : 0));
  parts.push(tag(head, 0, new V3()));
  // six legs (static pose; animated in the shader)
  const hips = [[0.2, 0.8], [0.26, 0.3], [0.28, -0.15]];
  const feet = [[1.22, 1.7], [2.06, -0.05], [1.68, -2.12]];
  const knees = [0.45, 0.48, 0.52];
  const legCol = C('#3a1a0b');
  for (let p = 0; p < 3; p++) for (const s of [-1, 1]) {
    const H = new V3(s * hips[p][0], body - 0.1, hips[p][1]);
    const F = new V3(s * feet[p][0], 0.04, feet[p][1]);
    const K = new V3().lerpVectors(H, F, 0.42); K.y = knees[p]; K.x *= 1.05;
    const T = F.clone().add(new V3(s * 0.25, -0.02, Math.sign(feet[p][1] || 1) * 0.25));
    const len = H.distanceTo(T);
    const dist = (x, y, z) => clamp(new V3(x, y, z).distanceTo(H) / len, 0, 1);
    const leg = 1 + p * 2 + (s > 0 ? 1 : 0);
    for (const g of [rod(H, K, 0.07, 0.055), rod(K, F, 0.05, 0.035), rod(F, T, 0.03, 0.02)]) {
      colorize(g, (c) => c.copy(legCol));
      parts.push(tag(g, leg, H, dist));
    }
  }
  // antennae
  for (const s of [-1, 1]) {
    const base = new V3(s * 0.12, body - 0.06, 1.5);
    let prev = base.clone(), dir = new V3(s * 0.35, 0.35, 0.87).normalize();
    const segs = 9, seg = 0.5;
    for (let i = 0; i < segs; i++) {
      dir.applyAxisAngle(new V3(1, 0, 0), 0.09).applyAxisAngle(new V3(0, 1, 0), s * 0.03).normalize();
      const next = prev.clone().addScaledVector(dir, seg);
      const g = rod(prev, next, 0.028 - i * 0.002, 0.026 - i * 0.002, 4);
      colorize(g, (c) => c.set('#4a2210'));
      parts.push(tag(g, s > 0 ? 8 : 7, base, (x, y, z) => clamp(new V3(x, y, z).distanceTo(base) / (segs * seg), 0, 1)));
      prev = next;
    }
  }
  const g = mergeGeometries(parts);
  g.scale(SCALE, SCALE, SCALE);
  const piv = g.attributes.aPivot;
  for (let i = 0; i < piv.count; i++) piv.setXYZ(i, piv.getX(i) * SCALE, piv.getY(i) * SCALE, piv.getZ(i) * SCALE);
  g.computeVertexNormals();
  return g;
}

function makeMaterial(uTime, uFace) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.05, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.uniforms.uFace = uFace;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aLeg; attribute vec3 aPivot; attribute float aDist;
        attribute float iPhase; attribute float iMove; attribute float iSeed;
        uniform float uTime;
        vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }`)
      ;
    sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uFace;').replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * uFace;
      { float mx = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b); if (mx > 0.55) outgoingLight *= 0.55 / mx; }
      #include <opaque_fragment>`);
    sh.vertexShader = sh.vertexShader
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        if (aLeg > 0.5 && aLeg < 6.5) {
          float li = aLeg - 1.0; float pair = floor(li / 2.0); float sideI = mod(li, 2.0);
          float grp = mod(pair + sideI, 2.0);
          float ph = iPhase + grp * 3.14159;
          float sgn = sideI > 0.5 ? 1.0 : -1.0;
          vec3 p = transformed - aPivot;
          p = rotY(p, sin(ph) * 0.5 * min(iMove, 1.4) * sgn + sin(uTime * 6.0 + iSeed * 11.0 + li) * 0.05);
          p.y += max(0.0, cos(ph)) * 0.022 * min(iMove, 1.4) * aDist;
          transformed = p + aPivot;
        } else if (aLeg > 8.5) {
          // wings: closed unless flying (iMove > 1)
          float open = clamp(iMove - 1.0, 0.0, 1.0);
          float sgn = aLeg > 9.5 ? 1.0 : -1.0;
          vec3 p = transformed - aPivot;
          p = rotY(p, -sgn * 0.75 * open);
          float flap = open * (0.55 + 0.75 * sin(uTime * 75.0 + iSeed));
          float c = cos(sgn * flap), s = sin(sgn * flap);
          p = vec3(c * p.x - s * p.y, s * p.x + c * p.y, p.z);
          transformed = p + aPivot;
        } else if (aLeg > 6.5) {
          float sgn = aLeg > 7.5 ? 1.0 : -1.0;
          vec3 p = transformed - aPivot;
          p = rotY(p, (sin(uTime * 2.2 + iSeed * 7.0 + sgn) * 0.4 + sin(uTime * 11.0 + iSeed * 3.0) * 0.07) * aDist);
          p.y += sin(uTime * 1.6 + iSeed * 5.0 + sgn) * 0.02 * aDist;
          transformed = p + aPivot;
        }`);
  };
  return m;
}

// ------------------------------------------------------------------ swarm
export class RoachSwarms {
  constructor(scene, nests, colliders, shadowTex) {
    this.colliders = colliders;
    this.uTime = { value: 0 };
    this.nests = nests;
    const total = nests.reduce((a, n) => a + n.count, 0) + 1;   // +1 = the flyer for the jump scare
    this.N = total;
    const geo = buildRoachGeometry();
    this.iPhase = new THREE.InstancedBufferAttribute(new Float32Array(total), 1).setUsage(THREE.DynamicDrawUsage);
    this.iMove = new THREE.InstancedBufferAttribute(new Float32Array(total), 1).setUsage(THREE.DynamicDrawUsage);
    const seeds = new Float32Array(total); for (let i = 0; i < total; i++) seeds[i] = Math.random();
    geo.setAttribute('iPhase', this.iPhase);
    geo.setAttribute('iMove', this.iMove);
    geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seeds, 1));
    // uFace: an even fill for roaches on your face (overlay pass only), so the whole bug is readable
    // instead of a lamp glinting off the end nearest your eye
    this.uFace = { value: 0 }; this.faceAmb = 0;
    this.mesh = new THREE.InstancedMesh(geo, makeMaterial(this.uTime, this.uFace), total);
    this.mesh.onBeforeRender = () => { this.uFace.value = 0; };
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    // roaches on you are drawn in the arms pass, in front of everything
    const og = geo.clone();
    this.oPhase = new THREE.InstancedBufferAttribute(new Float32Array(4), 1).setUsage(THREE.DynamicDrawUsage);
    this.oMove = new THREE.InstancedBufferAttribute(new Float32Array(4), 1).setUsage(THREE.DynamicDrawUsage);
    og.setAttribute('iPhase', this.oPhase); og.setAttribute('iMove', this.oMove);
    og.setAttribute('iSeed', new THREE.InstancedBufferAttribute(new Float32Array([0.13, 0.57, 0.81, 0.33]), 1));
    this.overlay = new THREE.InstancedMesh(og, this.mesh.material, 4);
    this.overlay.frustumCulled = false;
    this.overlay.onBeforeRender = () => { this.uFace.value = this.faceAmb; };
    this.overlay.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    for (let i = 0; i < 4; i++) this.overlay.setMatrixAt(i, new THREE.Matrix4().makeScale(0, 0, 0));
    this.blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(0.34, 0.42).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, depthWrite: false, color: 0x000000, opacity: 0.7 }), total);
    this.blobs.frustumCulled = false;
    this.blobs.renderOrder = 1;
    scene.add(this.blobs);
    this.roaches = [];
    this.swarms = nests.map((n, si) => ({ ...n, idx: si, state: 'hide', target: new V3(n.x, 0, n.z), lostT: 0, alerted: false }));
    let k = 0;
    for (const s of this.swarms) for (let j = 0; j < s.count; j++) this.roaches.push(this.newRoach(k++, s.idx));
    this.flyer = this.newRoach(k, -1);
    this.flyer.state = 'off';
    this.roaches.push(this.flyer);
    // navigation: free cells, light mask, distance fields
    this.nav = new NavGrid(colliders);
    this.FIELD = { wallCost: 0.88, litCost: 7, maxDist: 48 };
    this.fPlayer = new Float32Array(this.nav.N).fill(Infinity);
    this.fieldAge = 99; this.fieldCell = -1;
    this.buildNestFields();
    this.t = 0;
    this.reset();
  }

  newRoach(i, sw) {
    const R = Math.random;
    return {
      i, sw, pos: new V3(), yaw: 0, speed: 0, state: 'idle', fleeT: 0, burst: 0, burstOn: false, off: new V3(), phase: R() * 6, scale: 0.85 + R() * 0.3, flyT: 0, from: new V3(), to: new V3(),
      // personality: how it weaves, whether it circles round to the side, how fast it is
      zigAmp: 0.15 + R() * 0.65, zigFreq: 1.4 + R() * 3.2, zigPh: R() * 6.3,
      flank: R() < 0.55 ? (R() < 0.5 ? -1 : 1) : 0, speedK: 0.85 + R() * 0.35,
      meander: 0.2 + R() * 0.35, meanderF: 0.25 + R() * 0.4,
      mode: 'move', waitT: 0, pounceT: 0, recoilT: 0, rdx: 0, rdz: 1,
      escCd: 0, escT: 0, escDur: 1, escH: 1, deadT: 0, spasm: 0,
    };
  }

  buildNestFields() {
    this.fNest = this.swarms.map((s) => this.nav.field([[s.x, s.z]], { wallCost: this.FIELD.wallCost, maxDist: 60 }));
  }

  reset() {
    for (const s of this.swarms) { s.state = 'hide'; s.target.set(s.x, 0, s.z); s.lostT = 0; s.alerted = false; s.tCell = -1; s.bayT = 0; s.calmT = 0; s.huntT = 0; }
    for (const r of this.roaches) {
      if (r === this.flyer) { r.sw = -1; r.state = 'off'; continue; }
      const s = this.swarms[r.sw];
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * s.spread;
      r.pos.set(s.x + Math.cos(a) * d, 0, s.z + Math.sin(a) * d);
      r.yaw = Math.random() * Math.PI * 2; r.speed = 0; r.state = 'idle'; r.fleeT = 0; r.mode = 'move'; r.waitT = 0; r.pounceT = 0; r.flipT = 0; r.escCd = 0; r.deadT = 0;
      r.off.set((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
    }
    this.scared = false;
  }

  // you came back at a lamp: every living roach goes home and settles; the dead stay where they lie
  regroup() {
    for (const s of this.swarms) { s.state = 'hide'; s.target.set(s.x, 0, s.z); s.lostT = 0; s.tCell = -1; s.bayT = 0; s.calmT = 6; s.huntT = 0; }
    for (const r of this.roaches) {
      if (r.state === 'dead') continue;
      if (r === this.flyer && r.sw < 0) { if (r.state !== 'off') { r.sw = 0; r.state = 'idle'; } else continue; }
      const s = this.swarms[r.sw];
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * s.spread;
      r.pos.set(s.x + Math.cos(a) * d, 0, s.z + Math.sin(a) * d);
      r.yaw = Math.random() * Math.PI * 2; r.speed = 0; r.state = 'idle'; r.fleeT = 0; r.mode = 'move'; r.waitT = 0; r.pounceT = 0; r.flipT = 0; r.escCd = 0;
    }
    this.overlay.setMatrixAt(3, new THREE.Matrix4().makeScale(0, 0, 0)); this.overlay.instanceMatrix.needsUpdate = true;
  }

  // lit, it sometimes takes off and flies away from you to somewhere dark 4-8 m off
  startEscape(r, ctx) {
    const nav = this.nav, P = ctx.player.pos;
    const a0 = Math.atan2(r.pos.x - P.x, r.pos.z - P.z);
    let best = null, bestD = 0;
    for (let k = 0; k < 12; k++) {
      const a = a0 + (Math.random() - 0.5) * 2.4, d = 4 + Math.random() * 4;
      const x = r.pos.x + Math.sin(a) * d, z = r.pos.z + Math.cos(a) * d;
      if (!nav.free(x, z) || nav.isLit(x, z) || !nav.sees(r.pos.x, r.pos.z, x, z)) continue;
      const dp = Math.hypot(x - P.x, z - P.z);
      if (dp > 4.5 && dp > bestD) { best = [x, z]; bestD = dp; }
    }
    if (!best) return false;
    const d = Math.hypot(best[0] - r.pos.x, best[1] - r.pos.z);
    r.from.set(r.pos.x, 0, r.pos.z); r.to.set(best[0], 0, best[1]);
    r.state = 'escape'; r.escT = 0; r.escDur = 0.2 + d / 4.4; r.escH = 0.9 + Math.random() * 0.7; r.speed = 0; r.mode = 'move';
    r.yaw = Math.atan2(r.to.x - r.from.x, r.to.z - r.from.z);
    ctx.onEscape && ctx.onEscape(r.pos, r.escDur);
    return true;
  }

  // you hid: they lose you and comb the floor round the spot where you went
  startSearch(s, P) {
    const nav = this.nav, k = nav.nearestFree(P.x, P.z, 12);
    s.state = 'search'; s.searchT = 6 + Math.random() * 3; s.lostT = 0; s.huntT = 0; s.bayT = 0;
    s.target.set(k >= 0 ? nav.cx(k) : P.x, 0, k >= 0 ? nav.cz(k) : P.z); s.tCell = -1;
  }

  alertNearest(p) {
    let best = null;
    for (const s of this.swarms) { const d = Math.hypot(s.x - p.x, s.z - p.z); if (!best || d < best.d) best = { s, d }; }
    if (best) { best.s.state = 'hunt'; best.s.target.copy(p); best.s.lostT = 0; }
  }

  jumpScare(camera) {
    const f = this.flyer;
    const fwd = new V3(0, 0, -1).applyQuaternion(camera.quaternion);
    const flat = new V3(fwd.x, 0, fwd.z).normalize();
    const C = camera.position;
    // first solid thing straight ahead (rack, wall, crate) within 5.5 m
    let hit = 4.2;
    for (let d = 1.6; d <= 5.5; d += 0.1) {
      const x = C.x + flat.x * d, z = C.z + flat.z * d;
      if (this.colliders.some((c) => x > c.x0 && x < c.x1 && z > c.z0 && z < c.z1)) { hit = d - 0.08; break; }
    }
    f.from.set(C.x + flat.x * hit, C.y + 0.45, C.z + flat.z * hit);
    f.to.copy(C).addScaledVector(fwd, 0.17).add(new V3(0, -0.03, 0));
    // clinging: back toward the camera, head up
    const up = new V3(0, 1, 0), toCam = flat.clone().negate();
    f.q0 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3().crossVectors(toCam, up), toCam, up));
    // flying in: belly and legs toward the face
    f.q1 = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(new V3().crossVectors(flat, up), flat, up));
    f.state = 'fly'; f.flyT = 0; f.launched = false;
    f.pos.copy(f.from);
  }

  // ctx: { dt, t, player:{pos,noise,alive}, flash:{on,pos,dir}, lamps:[{x,z,on}], events:[{x,z,r}], frozen, onAttach(r), onFirstFlee(), onFirstHunt(), onFirstWait(), camera }
  update(ctx) {
    const { dt } = ctx;
    this.uTime.value += dt;
    this.t += dt;
    const P = ctx.player.pos, nav = this.nav, F = this.FIELD;
    if (nav.refreshIfChanged()) { this.buildNestFields(); this.fieldAge = 99; for (const s of this.swarms) s.tCell = -1; }
    // what is lit right now (beam footprint + lamp discs)
    nav.updateLight(ctx.flash.on ? { on: true, pos: ctx.flash.pos, dir: ctx.flash.dir, angle: 0.5, range: 13 } : null, ctx.lamps);
    // distance field toward the player, routed around walls and around light
    this.fieldAge += dt;
    const pk = nav.idx(P.x, P.z);
    if (this.fieldAge > 0.25 && (pk !== this.fieldCell || this.fieldAge > 0.5)) {
      nav.field([[P.x, P.z]], F, this.fPlayer);
      this.fieldCell = pk; this.fieldAge = 0;
    }
    // ---- swarm level: hearing, being lit, losing track
    const act = this.swarms.map(() => 0), held = this.swarms.map(() => 0);
    for (const r of this.roaches) {
      if (r.sw < 0 || r.state === 'attached' || r.state === 'off' || r.state === 'flee' || r.state === 'dead' || r.state === 'escape') continue;
      act[r.sw]++;
      if (r.mode === 'recoil' || r.mode === 'scatter' || r.mode === 'wait') held[r.sw]++;
    }
    for (const s of this.swarms) {
      let heard = null;
      const c = this.centroid(s), dc = Math.hypot(c.x - P.x, c.z - P.z);
      // kept at bay by light for a while: they give up and leave you alone for a bit
      // (you standing in a lit lamp counts too: they circle a moment, then lose interest)
      if (s.state === 'hunt' && ((act[s.idx] && held[s.idx] / act[s.idx] > 0.25) || (ctx.playerSafe && dc < 14))) s.bayT = (s.bayT || 0) + dt * (ctx.playerSafe ? 1.2 : 1);
      else s.bayT = Math.max(0, (s.bayT || 0) - dt * 0.5);
      if (s.bayT > 3) { s.state = 'return'; s.target.set(s.x, 0, s.z); s.calmT = 12; s.bayT = 0; }
      // they don't keep after you for long, even if they can still hear you
      if (s.state === 'hunt') s.huntT = (s.huntT || 0) + dt; else s.huntT = 0;
      if (s.huntT > 14) { s.state = 'return'; s.target.set(s.x, 0, s.z); s.calmT = 10; s.huntT = 0; }
      s.calmT = Math.max(0, (s.calmT || 0) - dt);
      const calm = s.calmT > 0;
      if (ctx.player.noise > 0 && dc < ctx.player.noise * 0.75 && (!calm || (ctx.player.noise >= 12 && dc < 5))) heard = P;
      for (const e of ctx.events) if (Math.hypot(s.x - e.x, s.z - e.z) < e.r) heard = heard || new V3(e.x, 0, e.z);
      const hid = ctx.player.hidden;
      if (hid && s.state === 'hunt' && !ctx.frozen && !heard && (dc < 9 || Math.hypot(s.target.x - P.x, s.target.z - P.z) < 4)) this.startSearch(s, P);
      if (s.state === 'search' && !ctx.frozen) {
        s.searchT -= dt;
        if (!hid && ctx.player.alive && dc < 7) { s.state = 'hunt'; s.target.copy(P); s.lostT = 0; }      // there you are
        else if (s.searchT <= 0) { s.state = 'return'; s.target.set(s.x, 0, s.z); s.calmT = 8; }
      }
      if (heard && !ctx.frozen) {
        if (s.state !== 'hunt' && ctx.onFirstHunt) ctx.onFirstHunt(s);
        s.state = 'hunt'; s.target.copy(heard); s.lostT = 0; s.alerted = true;
      } else if (s.state === 'hunt') {
        s.lostT += dt;
        // right next to you they keep tracking; otherwise they lose interest fairly soon
        if (dc < 2.2) { s.target.copy(P); s.lostT = Math.min(s.lostT, 1.5); }
        if (s.lostT > 3.5) { s.state = 'return'; s.target.set(s.x, 0, s.z); }
      } else if (s.state === 'return') {
        if (Math.hypot(c.x - s.x, c.z - s.z) < 1.2) s.state = 'hide';
      }
      // a field to a noise somewhere else than the player
      if ((s.state === 'hunt' && Math.hypot(s.target.x - P.x, s.target.z - P.z) > 2) || s.state === 'search') {
        const tk = nav.idx(s.target.x, s.target.z);
        if (tk !== s.tCell) { s.f = nav.field([[s.target.x, s.target.z]], F, s.f); s.tCell = tk; }
        s.useF = s.f;
      } else s.useF = this.fPlayer;
    }
    // ---- individuals
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(), pos = new V3();
    const D = { x: 0, z: 0 };
    const T = this.t;
    for (const r of this.roaches) {
      if (r.state === 'off' || r.state === 'attached') { this.hide(r); continue; }
      if (r.state === 'fly' || r.state === 'face') { this.updateFlyer(r, ctx); continue; }
      if (r.state === 'dead') {
        // sprayed: stays on its back for good, legs still going - hard at first, then weaker, with the odd spasm
        r.deadT += dt;
        if (!ctx.frozen) { if (r.spasm > 0) r.spasm -= dt; else if (Math.random() < dt * 0.25) r.spasm = 0.3 + Math.random() * 0.5; }
        const mv = r.spasm > 0 ? 1.3 : 0.35 + 1.15 * Math.exp(-r.deadT / 8);
        this.iMove.array[r.i] = mv; this.iPhase.array[r.i] += dt * (10 + 22 * mv);
        if (!ctx.frozen) r.yaw += Math.sin(T * 1.3 + r.zigPh) * dt * 0.2 * mv;
        q.setFromEuler(e.set(0, r.yaw, Math.PI));
        M.compose(pos.set(r.pos.x, 0.09 * r.scale, r.pos.z), q, sc.setScalar(r.scale));
        this.mesh.setMatrixAt(r.i, M);
        M.makeScale(0, 0, 0); this.blobs.setMatrixAt(r.i, M);
        continue;
      }
      if (r.state === 'escape') {
        // flying away: wings up, a short hop off the floor, an arc, and down somewhere dark
        if (!ctx.frozen) r.escT += dt;
        const TO = 0.2, u = clamp((r.escT - TO) / (r.escDur - TO), 0, 1), ez = u * u * (3 - 2 * u);
        pos.lerpVectors(r.from, r.to, ez);
        const h = Math.sin(Math.PI * u) * r.escH + (r.escT < TO ? 0 : 0.05);
        r.pos.set(pos.x, 0, pos.z);
        const nose = Math.cos(Math.PI * u) * 0.35;
        q.setFromEuler(e.set(-nose, r.yaw, Math.sin(T * 23 + r.zigPh) * 0.25, 'YXZ'));
        M.compose(pos.set(pos.x, 0.004 + h, pos.z), q, sc.setScalar(r.scale));
        this.mesh.setMatrixAt(r.i, M);
        const bs = r.scale * Math.max(0.2, 1 - h * 0.5);
        M.compose(pos.set(r.pos.x, 0.003, r.pos.z), q.setFromEuler(e.set(0, r.yaw, 0)), sc.setScalar(bs)); this.blobs.setMatrixAt(r.i, M);
        this.iMove.array[r.i] = r.escT < TO ? 1 + r.escT / TO : 2; this.iPhase.array[r.i] += dt * 40;
        if (u >= 1) { r.state = 'idle'; r.mode = 'scatter'; r.scatterT = 0.4; r.recoilT = 0; r.rdx = Math.sin(r.yaw); r.rdz = Math.cos(r.yaw); r.speed = 2; }
        continue;
      }
      r.escCd -= dt;
      if (r.flipT > 0) {
        r.flipT -= dt; r.speed = 0;
        this.iMove.array[r.i] = 1.5; this.iPhase.array[r.i] += dt * 30;
        q.setFromEuler(e.set(0, r.yaw, Math.PI));
        M.compose(pos.set(r.pos.x, 0.09 * r.scale, r.pos.z), q, sc.setScalar(r.scale));
        this.mesh.setMatrixAt(r.i, M);
        M.makeScale(0, 0, 0); this.blobs.setMatrixAt(r.i, M);
        continue;
      }
      const s = this.swarms[r.sw];
      const k = nav.idx(r.pos.x, r.pos.z);
      const cellLit = k >= 0 ? nav.lit[k] : 0;
      const onWall = k >= 0 && nav.wall[k];
      const dP = Math.hypot(P.x - r.pos.x, P.z - r.pos.z);
      let dx = 0, dz = 0, want = 0, turn = 10;
      if (!ctx.frozen && cellLit && r.mode !== 'recoil') {
        // now and then one takes to the air instead of running (never more than two at once)
        if (r.escCd <= 0 && r !== this.flyer) {
          r.escCd = 5;
          if (Math.random() < 0.22 && this.roaches.filter((x) => x.state === 'escape').length < 2 && this.startEscape(r, ctx)) continue;
        }
        r.mode = 'recoil'; r.recoilT = 0; r.waitT = 0; r.pounceT = 0;
        if (ctx.onFirstFlee) ctx.onFirstFlee();
      }
      if (r.mode === 'recoil') {
        // get out of the light by the shortest way that is not a wall
        r.recoilT -= dt;
        if (r.recoilT <= 0) { this.pickRecoil(r, ctx); r.recoilT = 0.15; }
        dx = r.rdx; dz = r.rdz; want = 5.5; turn = 16;
        if (!cellLit) { r.mode = 'scatter'; r.scatterT = 0.5 + Math.random() * 0.7; r.waitT = 0; }
      } else if (r.mode === 'scatter') {
        r.scatterT -= dt; r.recoilT -= dt;
        if (r.recoilT <= 0) { this.pickRecoil(r, ctx); r.recoilT = 0.2; }
        dx = r.rdx; dz = r.rdz; want = 4.4 * r.speedK; turn = 12;
        if (r.scatterT <= 0) { r.mode = 'move'; r.waitT = 0; r.burstOn = false; r.burst = 0.6 + Math.random() * 0.8; }   // a wary pause before coming again
      } else if (r.state === 'flee') {
        // thrown off: run away from the player, around walls
        r.fleeT -= dt;
        if (nav.descend(this.fPlayer, r.pos.x, r.pos.z, D, -1)) { dx = D.x; dz = D.z; } else { dx = r.pos.x - P.x; dz = r.pos.z - P.z; }
        want = 5; if (r.fleeT <= 0) r.state = 'idle';
      } else if (s.state === 'hunt') {
        if (!nav.descend(s.useF, r.pos.x, r.pos.z, D)) { const l = Math.hypot(s.target.x - r.pos.x, s.target.z - r.pos.z) || 1; D.x = (s.target.x - r.pos.x) / l; D.z = (s.target.z - r.pos.z) / l; }
        // weave, and some circle round to come at you from the side
        let ang = Math.atan2(D.x, D.z);
        const close = dP < 1.3;
        ang += Math.sin(T * r.zigFreq + r.zigPh) * r.zigAmp * (onWall ? 0.35 : 1) * (close ? 0.25 : 1);
        ang += Math.sin(T * r.meanderF + r.zigPh * 2.1) * r.meander * (onWall ? 0.4 : 1) * (close ? 0 : 1);   // slow wide curves
        if (r.flank && dP > 1.6 && dP < 7.5) ang += r.flank * 0.85 * Math.min(1, (dP - 1.6) / 2);
        dx = Math.sin(ang); dz = Math.cos(ang);
        // light ahead? stop at its edge, or creep sideways along it
        const ax = r.pos.x + dx * 0.4, az = r.pos.z + dz * 0.4;
        if (!ctx.frozen && nav.isLit(ax, az)) {
          const side = r.flank || (r.i % 2 ? 1 : -1);
          let found = false;
          for (const turnA of [0.9, -0.9, 1.6, -1.6]) {
            const a2 = ang + turnA * side, cx = Math.sin(a2), cz = Math.cos(a2);
            if (nav.free(r.pos.x + cx * 0.4, r.pos.z + cz * 0.4) && !nav.isLit(r.pos.x + cx * 0.4, r.pos.z + cz * 0.4) && !nav.isLit(r.pos.x + cx * 0.8, r.pos.z + cz * 0.8)) {
              dx = cx; dz = cz; found = true; break;
            }
          }
          if (r.mode !== 'wait') { r.mode = 'wait'; }
          r.waitT += dt;
          if (r.waitT > 2.2 + (r.i % 5) * 0.3) { r.mode = 'scatter'; r.scatterT = 0.8 + Math.random() * 0.6; r.waitT = 0; this.pickRecoil(r, ctx); r.recoilT = 0.2; }
          if (r.waitT > 1 && ctx.onFirstWait) ctx.onFirstWait();
          if (found && Math.sin(T * 1.7 + r.zigPh) > -0.2) { want = 1.1; }
          else {
            // hold at the edge facing you, twitching forward and back
            const fx = P.x - r.pos.x, fz = P.z - r.pos.z, fl = Math.hypot(fx, fz) || 1;
            dx = fx / fl; dz = fz / fl;
            want = Math.max(0, Math.sin(T * 5 + r.zigPh * 3)) * 0.35;
            if (nav.isLit(r.pos.x + dx * 0.3, r.pos.z + dz * 0.3)) want = 0;
          }
        } else {
          if (r.mode === 'wait' && r.waitT > 0.3) { r.pounceT = 0.9 + Math.random() * 0.6; this.pounceFlag = true; }   // the light left: rush in
          r.mode = 'move'; r.waitT = 0;
          if (r.pounceT > 0) { r.pounceT -= dt; want = 6.5 * r.speedK; turn = 14; }
          else {
            // dart, freeze, dart
            r.burst -= dt;
            if (r.burst <= 0) { r.burstOn = !r.burstOn; r.burst = r.burstOn ? 0.3 + Math.random() * 0.6 : 0.1 + Math.random() * 0.5; }
            want = r.burstOn ? 3.6 * r.speedK : 0;
          }
        }
      } else if (s.state === 'search') {
        // sniffing round where you vanished: dart between spots near it, pausing to feel about
        const tx = s.target.x, tz = s.target.z, dT = Math.hypot(tx - r.pos.x, tz - r.pos.z);
        r.seekT = (r.seekT || 0) - dt;
        if (!r.seek || r.seekT <= 0 || Math.hypot(r.seek.x - r.pos.x, r.seek.z - r.pos.z) < 0.25) {
          r.seekT = 0.7 + Math.random() * 1.3;
          for (let tries = 0; tries < 6; tries++) {
            const a = Math.random() * Math.PI * 2, d = 0.4 + Math.random() * 2.4, x = tx + Math.sin(a) * d, z = tz + Math.cos(a) * d;
            if (nav.free(x, z)) { r.seek = { x, z }; break; }
          }
        }
        if (dT > 3.2 && nav.descend(s.useF, r.pos.x, r.pos.z, D)) { dx = D.x; dz = D.z; }
        else if (r.seek) { dx = r.seek.x - r.pos.x; dz = r.seek.z - r.pos.z; }
        else { dx = tx - r.pos.x; dz = tz - r.pos.z; }
        const ang = Math.atan2(dx, dz) + Math.sin(T * r.zigFreq + r.zigPh) * r.zigAmp * 0.6;
        dx = Math.sin(ang); dz = Math.cos(ang);
        r.burst -= dt;
        if (r.burst <= 0) { r.burstOn = !r.burstOn; r.burst = r.burstOn ? 0.25 + Math.random() * 0.5 : 0.2 + Math.random() * 0.7; }
        want = r.burstOn ? (dT > 3.2 ? 3.2 : 2.0) * r.speedK : 0;
      } else if (s.state === 'return') {
        if (nav.descend(this.fNest[s.idx], r.pos.x, r.pos.z, D)) {
          const ang = Math.atan2(D.x, D.z) + Math.sin(T * r.zigFreq * 0.6 + r.zigPh) * r.zigAmp * 0.5;
          dx = Math.sin(ang); dz = Math.cos(ang);
        } else { dx = s.x + r.off.x - r.pos.x; dz = s.z + r.off.z - r.pos.z; }
        r.burst -= dt;
        if (r.burst <= 0) { r.burstOn = !r.burstOn; r.burst = r.burstOn ? 0.4 + Math.random() * 0.8 : 0.1 + Math.random() * 0.5; }
        want = r.burstOn ? 2.2 * r.speedK : 0;
        if (Math.hypot(s.x - r.pos.x, s.z - r.pos.z) < 1.0) want *= 0.3;
      } else {
        // hiding: tiny shuffles around the nest
        r.burst -= dt;
        if (r.burst <= 0) { r.burstOn = Math.random() < 0.25; r.burst = 0.3 + Math.random() * 1.5; r.wander = Math.random() * Math.PI * 2; }
        dx = s.x + r.off.x * 0.6 + Math.cos(r.wander || 0) * 0.3 - r.pos.x; dz = s.z + r.off.z * 0.6 + Math.sin(r.wander || 0) * 0.3 - r.pos.z;
        want = r.burstOn && Math.hypot(dx, dz) > 0.1 ? 0.6 : 0;
      }
      if (ctx.frozen) want = 0;
      // steer: turn toward the wanted heading, slow down while turning hard
      if (Math.hypot(dx, dz) > 1e-4) {
        let dy = Math.atan2(dx, dz) - r.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        r.yaw += clamp(dy, -turn * dt, turn * dt);
        want *= Math.max(0.25, Math.cos(dy));
      }
      r.speed += clamp(want - r.speed, -40 * dt, 30 * dt);
      r.pos.x += Math.sin(r.yaw) * r.speed * dt;
      r.pos.z += Math.cos(r.yaw) * r.speed * dt;
      this.collide(r);
      // reach the player in the dark -> climb on
      // (under a table they reach in from the edge, but only once they know you're there)
      if (!ctx.frozen && r.mode !== 'recoil' && r.state !== 'flee' && s.state === 'hunt' && ctx.player.alive && !ctx.player.hidden && dP < (ctx.player.under ? 1.0 : 0.5) && !cellLit) {
        if (ctx.onAttach && ctx.onAttach(r)) { r.state = 'attached'; this.hide(r); continue; }
      }
      r.phase += r.speed * dt * 9;
      this.iPhase.array[r.i] = r.phase;
      this.iMove.array[r.i] = r.mode === 'wait' && r.speed < 0.2 ? 0.08 : clamp(r.speed / 1.2, 0, 1);
      q.setFromEuler(e.set(0, r.yaw, 0));
      M.compose(pos.copy(r.pos).setY(0.004), q, sc.setScalar(r.scale));
      this.mesh.setMatrixAt(r.i, M);
      M.compose(pos.set(r.pos.x, 0.003, r.pos.z), q, sc.setScalar(r.scale));
      this.blobs.setMatrixAt(r.i, M);
    }
    this.separate();
    this.mesh.instanceMatrix.needsUpdate = true;
    this.blobs.instanceMatrix.needsUpdate = true;
    this.iPhase.needsUpdate = true;
    this.iMove.needsUpdate = true;
  }

  // the way out of the light: free, dark soon, not toward the player, not a U-turn
  pickRecoil(r, ctx) {
    const nav = this.nav, P = ctx.player.pos;
    let ax = r.pos.x - P.x, az = r.pos.z - P.z;
    const al = Math.hypot(ax, az) || 1; ax /= al; az /= al;
    let best = -1e9, bx = r.rdx, bz = r.rdz;
    for (let a = 0; a < 16; a++) {
      const ang = a / 16 * Math.PI * 2, cx = Math.sin(ang), cz = Math.cos(ang);
      const x1 = r.pos.x + cx * 0.5, z1 = r.pos.z + cz * 0.5, x2 = r.pos.x + cx * 1.2, z2 = r.pos.z + cz * 1.2;
      if (!nav.free(x1, z1)) continue;
      let sc = (nav.isLit(x1, z1) ? 0 : 2) + (nav.isLit(x2, z2) ? 0 : 1.5) + (nav.free(x2, z2) ? 0.4 : 0);
      sc += 0.6 * (cx * ax + cz * az) + 0.3 * (cx * Math.sin(r.yaw) + cz * Math.cos(r.yaw));
      if (sc > best) { best = sc; bx = cx; bz = cz; }
    }
    r.rdx = bx; r.rdz = bz;
  }

  updateFlyer(r, ctx) {
    r.flyT += ctx.dt;
    const HOLD = 0.4, FLY = 0.5;
    const p = new V3(), q = new THREE.Quaternion();
    if (r.state === 'face') {
      r.faceT += ctx.dt;
      const cam = ctx.camera;
      cam.updateMatrixWorld();
      const k = r.faceT / 0.5;
      p.set(Math.sin(r.faceT * 31) * 0.012, -0.02 - k * k * 0.25, -0.2 - k * 0.05).applyMatrix4(cam.matrixWorld);
      // belly to the face, head up, wriggling
      const Y = new V3(0, 0, -1), Z = new V3(Math.sin(r.faceT * 17) * 0.2, 1, 0).normalize(), X = new V3().crossVectors(Y, Z);
      q.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)).premultiply(cam.quaternion);
      this.iMove.array[r.i] = 1.4;
      if (r.faceT > 0.5) {
        r.sw = 0; r.state = 'idle';
        this.overlay.setMatrixAt(3, new THREE.Matrix4().makeScale(0, 0, 0)); this.overlay.instanceMatrix.needsUpdate = true;
        this.drop(r, ctx.player.pos, ctx.player.pos);
        return;
      }
    } else if (r.flyT < HOLD) {
      // sits on the surface, twitching; wings start to lift at the end
      p.copy(r.from); q.copy(r.q0);
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(r.flyT * 40) * 0.06, 0)));
      this.iMove.array[r.i] = r.flyT > HOLD - 0.15 ? 1.5 : 0.35;
    } else {
      if (!r.launched) { r.launched = true; if (ctx.onFlyerLaunch) ctx.onFlyerLaunch(r.from); }
      const u = Math.min(1, (r.flyT - HOLD) / FLY);
      p.lerpVectors(r.from, r.to, Math.pow(u, 1.7));
      p.y += Math.sin(Math.PI * u) * 0.2;
      q.slerpQuaternions(r.q0, r.q1, Math.min(1, u * 2.5));
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.sin(r.flyT * 23) * 0.25)));
      this.iMove.array[r.i] = 2;
      if (u >= 1 && r.state === 'fly') { r.state = 'face'; r.faceT = 0; ctx.onFlyerHit && ctx.onFlyerHit(); }
    }
    r.pos.copy(p);
    this.iPhase.array[r.i] += ctx.dt * 40;
    const Mx = new THREE.Matrix4().compose(p, q, new V3(1.1, 1.1, 1.1)), Z = new THREE.Matrix4().makeScale(0, 0, 0);
    const near = r.state === 'face' || p.distanceTo(ctx.camera.position) < 0.9;
    this.mesh.setMatrixAt(r.i, near ? Z : Mx);
    this.overlay.setMatrixAt(3, near ? Mx : Z);
    this.oMove.array[3] = this.iMove.array[r.i]; this.oPhase.array[3] = this.iPhase.array[r.i];
    this.overlay.instanceMatrix.needsUpdate = true; this.oMove.needsUpdate = true; this.oPhase.needsUpdate = true;
    this.blobs.setMatrixAt(r.i, Z);
  }

  // roaches on the player, drawn right in front of the camera: the first one crawls toward the face
  showAttached(camera, list, dt, t) {
    camera.updateMatrixWorld();
    const slots = [
      [new V3(0.24, -0.24, -0.4), new V3(0.05, -0.07, -0.3)],
      [new V3(-0.26, -0.22, -0.42), new V3(-0.15, -0.13, -0.38)],
      [new V3(0.27, 0.17, -0.44), new V3(0.17, 0.09, -0.4)],
    ];
    list.forEach((at, k) => {
      const r = at.r, [A, B] = slots[k % 3];
      // the first one climbs onto your face and stays there; the others creep up from the edges
      const u = k === 0 ? Math.min(1, at.age / 1.5) : Math.min(0.55, 0.15 + at.age / 4) + Math.sin(t * 2 + k) * 0.05;
      const p = new V3().lerpVectors(A, B, u);
      if (k === 0 && u >= 1) { p.x += Math.sin(t * 1.3) * 0.035; p.y += Math.cos(t * 1.7) * 0.025; }
      const j = Math.min(1, at.shake) * 0.04 + 0.004;
      p.x += Math.sin(t * 41 + k) * j; p.y += Math.cos(t * 37 + k * 2) * j;
      const dir = new V3().subVectors(B, A); dir.z = 0; dir.normalize().applyAxisAngle(new V3(0, 0, 1), Math.sin(t * 6 + k * 3) * 0.18);
      const Y = new V3(0, 0, 1), X = new V3().crossVectors(Y, dir);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, dir)).premultiply(camera.quaternion);
      p.applyMatrix4(camera.matrixWorld);
      this.overlay.setMatrixAt(k, new THREE.Matrix4().compose(p, q, new V3(0.9, 0.9, 0.9)));
      this.oMove.array[k] = 1.2; this.oPhase.array[k] += dt * 24;
    });
    for (let k = list.length; k < 3; k++) this.overlay.setMatrixAt(k, new THREE.Matrix4().makeScale(0, 0, 0));
    this.overlay.instanceMatrix.needsUpdate = true;
    this.oMove.needsUpdate = true; this.oPhase.needsUpdate = true;
  }

  hide(r) {
    const Z = new THREE.Matrix4().makeScale(0, 0, 0);
    this.mesh.setMatrixAt(r.i, Z); this.blobs.setMatrixAt(r.i, Z);
  }

  drop(r, at, awayFrom) {
    // thrown off the player: land nearby and scatter
    const a = Math.random() * Math.PI * 2;
    r.pos.set(at.x + Math.cos(a) * 1.2, 0, at.z + Math.sin(a) * 1.2);
    if (!this.nav.free(r.pos.x, r.pos.z)) { const k = this.nav.nearestFree(r.pos.x, r.pos.z); if (k >= 0) r.pos.set(this.nav.cx(k), 0, this.nav.cz(k)); }
    r.yaw = Math.atan2(r.pos.x - awayFrom.x, r.pos.z - awayFrom.z);
    r.state = 'flee'; r.fleeT = 2.5; r.speed = 4; r.mode = 'move'; r.waitT = 0; r.pounceT = 0;
    this.collide(r);
  }

  centroid(s) {
    let x = 0, z = 0, n = 0;
    for (const r of this.roaches) if (r.sw === s.idx && r.state !== 'attached' && r.state !== 'off' && r.state !== 'dead' && r.state !== 'escape') { x += r.pos.x; z += r.pos.z; n++; }
    return n ? new V3(x / n, 0, z / n) : new V3(s.x, 0, s.z);
  }

  collide(r) {
    const rad = 0.13;
    for (const c of this.colliders) {
      if (c.off) continue;
      if (r.pos.x < c.x0 - rad || r.pos.x > c.x1 + rad || r.pos.z < c.z0 - rad || r.pos.z > c.z1 + rad) continue;
      const qx = clamp(r.pos.x, c.x0, c.x1), qz = clamp(r.pos.z, c.z0, c.z1);
      const dx = r.pos.x - qx, dz = r.pos.z - qz, d = Math.hypot(dx, dz);
      if (d > 1e-6) { r.pos.x = qx + dx / d * rad; r.pos.z = qz + dz / d * rad; }
      else {
        const l = r.pos.x - c.x0, rr = c.x1 - r.pos.x, b = r.pos.z - c.z0, t = c.z1 - r.pos.z, m = Math.min(l, rr, b, t);
        if (m === l) r.pos.x = c.x0 - rad; else if (m === rr) r.pos.x = c.x1 + rad; else if (m === b) r.pos.z = c.z0 - rad; else r.pos.z = c.z1 + rad;
      }
    }
  }

  separate() {
    const R = this.roaches, min = 0.26;
    for (let a = 0; a < R.length; a++) {
      const ra = R[a];
      if (ra.state === 'off' || ra.state === 'attached' || ra.state === 'fly' || ra.state === 'dead' || ra.state === 'escape') continue;
      for (let b = a + 1; b < R.length; b++) {
        const rb = R[b];
        if (rb.state === 'off' || rb.state === 'attached' || rb.state === 'fly' || rb.state === 'dead' || rb.state === 'escape') continue;
        const dx = rb.pos.x - ra.pos.x, dz = rb.pos.z - ra.pos.z, d2 = dx * dx + dz * dz;
        if (d2 < min * min && d2 > 1e-8) {
          const d = Math.sqrt(d2), push = (min - d) * 0.5;
          ra.pos.x -= dx / d * push; ra.pos.z -= dz / d * push;
          rb.pos.x += dx / d * push; rb.pos.z += dz / d * push;
        }
      }
    }
  }

  states() { return this.swarms.map((s) => s.state); }

  // spray: everything in the cone flips over
  sprayHit(origin, dir, range = 3.2, cosHalf = Math.cos(Math.PI / 6)) {
    let n = 0;
    for (const r of this.roaches) {
      if (r.sw < 0 || r.state === 'attached' || r.state === 'off' || r.state === 'fly' || r.state === 'face' || r.state === 'dead' || r.state === 'escape') continue;
      const vx = r.pos.x - origin.x, vy = 0.1 - origin.y, vz = r.pos.z - origin.z, d = Math.hypot(vx, vy, vz);
      if (d < range && (vx * dir.x + vy * dir.y + vz * dir.z) / d > cosHalf) { r.state = 'dead'; r.deadT = 0; r.spasm = 0; r.speed = 0; r.mode = 'move'; n++; }
    }
    return n;
  }

  // where the noise is: moving roaches per swarm, the closest one, and whether some just rushed in
  audioInfo(P) {
    const out = this.swarms.map(() => ({ x: 0, z: 0, moving: 0, n: 0, hunt: false }));
    let near = null;
    const emit = [];
    for (let i = 0; i < this.roaches.length; i++) {
      const r = this.roaches[i];
      if (r.sw < 0 || r.state === 'attached' || r.state === 'off' || r.state === 'fly' || r.state === 'face') continue;
      const o = out[r.sw];
      if (r.speed > 0.5) { o.moving++; o.x += r.pos.x; o.z += r.pos.z; o.n++; }
      const d = Math.hypot(r.pos.x - P.x, r.pos.z - P.z);
      // the closest ones get their own footsteps, so you can hear exactly where they are
      if (r.speed > 0.35 && d < 12) emit.push({ key: 'r' + i, kind: 'roach', x: r.pos.x, y: 0.05, z: r.pos.z, d, sp: clamp(r.speed / 3, 0.3, 1) });
      if (!near || d < near.d) near = { x: r.pos.x, z: r.pos.z, d, speed: clamp(r.speed / 3, 0, 1) };
    }
    out.forEach((o, i) => {
      if (o.n) { o.x /= o.n; o.z /= o.n; } else { const c = this.centroid(this.swarms[i]); o.x = c.x; o.z = c.z; }
      o.hunt = this.swarms[i].state === 'hunt'; o.search = this.swarms[i].state === 'search';
      o.d = Math.hypot(o.x - P.x, o.z - P.z);
    });
    const pounce = !!this.pounceFlag; this.pounceFlag = false;
    return { swarms: out, near, pounce, emit };
  }
}
