import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { buildShell, colorize, PRONOTUM } from '../roach.js';

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

function makeMaterial(uTime) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36, metalness: 0.05, side: THREE.DoubleSide });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aLeg; attribute vec3 aPivot; attribute float aDist;
        attribute float iPhase; attribute float iMove; attribute float iSeed;
        uniform float uTime;
        vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }`)
      ;
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{ float mx = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b); if (mx > 0.55) outgoingLight *= 0.55 / mx; }
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
    this.mesh = new THREE.InstancedMesh(geo, makeMaterial(this.uTime), total);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
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
    this.reset();
  }

  newRoach(i, sw) {
    return { i, sw, pos: new V3(), yaw: 0, speed: 0, state: 'idle', fleeT: 0, burst: 0, burstOn: false, off: new V3(), phase: Math.random() * 6, scale: 0.85 + Math.random() * 0.3, flyT: 0, from: new V3(), to: new V3() };
  }

  reset() {
    for (const s of this.swarms) { s.state = 'hide'; s.target.set(s.x, 0, s.z); s.lostT = 0; s.alerted = false; }
    for (const r of this.roaches) {
      if (r === this.flyer) { r.sw = -1; r.state = 'off'; continue; }
      const s = this.swarms[r.sw];
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * s.spread;
      r.pos.set(s.x + Math.cos(a) * d, 0, s.z + Math.sin(a) * d);
      r.yaw = Math.random() * Math.PI * 2; r.speed = 0; r.state = 'idle'; r.fleeT = 0;
      r.off.set((Math.random() - 0.5) * 1.6, 0, (Math.random() - 0.5) * 1.6);
    }
    this.scared = false;
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
    f.state = 'fly'; f.flyT = 0;
    f.pos.copy(f.from);
  }

  // ctx: { dt, t, player:{pos,noise}, flash:{on,pos,dir}, lamps:[{x,z,on}], events:[{x,z,r}], frozen, onAttach(r), onFirstFlee(), onFirstHunt(), camera }
  update(ctx) {
    const { dt } = ctx;
    this.uTime.value += dt;
    const P = ctx.player.pos;
    const cosCone = Math.cos(0.5);
    // ---- swarm level: hearing
    for (const s of this.swarms) {
      let heard = null;
      if (ctx.player.noise > 0) {
        const c = this.centroid(s);
        if (Math.hypot(c.x - P.x, c.z - P.z) < ctx.player.noise) heard = P;
      }
      for (const e of ctx.events) if (Math.hypot(s.x - e.x, s.z - e.z) < e.r) heard = heard || new V3(e.x, 0, e.z);
      if (heard && !ctx.frozen) {
        if (s.state !== 'hunt' && ctx.onFirstHunt) ctx.onFirstHunt(s);
        s.state = 'hunt'; s.target.copy(heard); s.lostT = 0; s.alerted = true;
      } else if (s.state === 'hunt') {
        s.lostT += dt;
        // keep tracking a player who is close even if quiet
        const c = this.centroid(s);
        if (Math.hypot(c.x - P.x, c.z - P.z) < 3.5) { s.target.copy(P); s.lostT = Math.min(s.lostT, 2); }
        if (s.lostT > 7) { s.state = 'return'; s.target.set(s.x, 0, s.z); }
      } else if (s.state === 'return') {
        const c = this.centroid(s);
        if (Math.hypot(c.x - s.x, c.z - s.z) < 1.2) s.state = 'hide';
      }
    }
    // ---- individuals
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(), pos = new V3();
    for (const r of this.roaches) {
      if (r.state === 'off' || r.state === 'attached') { this.hide(r); continue; }
      if (r.state === 'fly' || r.state === 'face') { this.updateFlyer(r, ctx); continue; }
      const s = this.swarms[r.sw];
      let tx, tz, want = 0;
      // light: flashlight cone or a lit safe lamp makes them scatter to the dark
      let lit = false, awayX = 0, awayZ = 0;
      if (ctx.flash.on) {
        const vx = r.pos.x - ctx.flash.pos.x, vy = 0.05 - ctx.flash.pos.y, vz = r.pos.z - ctx.flash.pos.z;
        const d = Math.hypot(vx, vy, vz);
        if (d < 13 && (vx * ctx.flash.dir.x + vy * ctx.flash.dir.y + vz * ctx.flash.dir.z) / d > cosCone) {
          lit = true;
          // flee sideways out of the beam and away from the player
          const ax = ctx.flash.dir.x, az = ctx.flash.dir.z, al = Math.hypot(ax, az) || 1;
          const perp = (vx * -az + vz * ax) / al;
          awayX = (-az / al) * Math.sign(perp || 1) * 1.2 + vx / d * 0.6;
          awayZ = (ax / al) * Math.sign(perp || 1) * 1.2 + vz / d * 0.6;
        }
      }
      for (const l of ctx.lamps) if (l.on) {
        const dx = r.pos.x - l.x, dz = r.pos.z - l.z, d = Math.hypot(dx, dz);
        if (d < 4.6) { lit = true; awayX += dx / (d || 1) * 2; awayZ += dz / (d || 1) * 2; }
      }
      if (lit && !ctx.frozen) {
        if (r.state !== 'flee' && ctx.onFirstFlee) ctx.onFirstFlee();
        r.state = 'flee'; r.fleeT = 3;
        r.fleeX = awayX; r.fleeZ = awayZ;
      }
      if (r.state === 'flee') {
        r.fleeT -= dt;
        tx = r.pos.x + r.fleeX * 3; tz = r.pos.z + r.fleeZ * 3; want = 5.0;
        if (r.fleeT <= 0) r.state = 'idle';
      } else if (s.state === 'hunt' || s.state === 'return') {
        tx = s.target.x + r.off.x; tz = s.target.z + r.off.z;
        if (s.state === 'hunt' && Math.hypot(P.x - r.pos.x, P.z - r.pos.z) < 2.5) { tx = P.x; tz = P.z; }
        // irregular bursts: dart, freeze, dart
        r.burst -= dt;
        if (r.burst <= 0) { r.burstOn = !r.burstOn; r.burst = r.burstOn ? 0.25 + Math.random() * 0.55 : 0.08 + Math.random() * 0.4; }
        want = r.burstOn ? (s.state === 'hunt' ? 4.0 : 2.0) : 0;
        const dd = Math.hypot(tx - r.pos.x, tz - r.pos.z);
        if (dd < 0.25) want = 0;
      } else {
        // hiding: tiny shuffles around the nest
        r.burst -= dt;
        if (r.burst <= 0) { r.burstOn = Math.random() < 0.25; r.burst = 0.3 + Math.random() * 1.5; r.wander = Math.random() * Math.PI * 2; }
        tx = s.x + r.off.x * 0.6 + Math.cos(r.wander || 0) * 0.3; tz = s.z + r.off.z * 0.6 + Math.sin(r.wander || 0) * 0.3;
        want = r.burstOn ? 0.6 : 0;
      }
      if (ctx.frozen) want = 0;
      // steer
      const dx = tx - r.pos.x, dz = tz - r.pos.z;
      if (Math.hypot(dx, dz) > 0.05 && want > 0) {
        let dy = Math.atan2(dx, dz) - r.yaw;
        dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        r.yaw += clamp(dy, -12 * dt, 12 * dt);
        want *= Math.max(0.2, Math.cos(dy));
      }
      r.speed += clamp(want - r.speed, -40 * dt, 30 * dt);
      r.pos.x += Math.sin(r.yaw) * r.speed * dt;
      r.pos.z += Math.cos(r.yaw) * r.speed * dt;
      this.collide(r);
      // reach the player -> climb on
      if (!ctx.frozen && r.state !== 'flee' && s.state === 'hunt' && ctx.player.alive && Math.hypot(P.x - r.pos.x, P.z - r.pos.z) < 0.5) {
        if (ctx.onAttach && ctx.onAttach(r)) { r.state = 'attached'; this.hide(r); continue; }
      }
      r.phase += r.speed * dt * 9;
      this.iPhase.array[r.i] = r.phase;
      this.iMove.array[r.i] = clamp(r.speed / 1.2, 0, 1);
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
        this.drop(r, ctx.player.pos, ctx.player.pos);
        return;
      }
    } else if (r.flyT < HOLD) {
      // sits on the surface, twitching; wings start to lift at the end
      p.copy(r.from); q.copy(r.q0);
      q.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0, Math.sin(r.flyT * 40) * 0.06, 0)));
      this.iMove.array[r.i] = r.flyT > HOLD - 0.15 ? 1.5 : 0.35;
    } else {
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
    this.mesh.setMatrixAt(r.i, new THREE.Matrix4().compose(p, q, new V3(1.1, 1.1, 1.1)));
    this.blobs.setMatrixAt(r.i, new THREE.Matrix4().makeScale(0, 0, 0));
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
      const u = k === 0 ? Math.min(1, 1 - at.t / 1.5) : 0.2 + Math.sin(t * 2 + k) * 0.05;
      const p = new V3().lerpVectors(A, B, u);
      const j = Math.min(1, at.shake) * 0.04 + 0.004;
      p.x += Math.sin(t * 41 + k) * j; p.y += Math.cos(t * 37 + k * 2) * j;
      const dir = new V3().subVectors(B, A); dir.z = 0; dir.normalize().applyAxisAngle(new V3(0, 0, 1), Math.sin(t * 6 + k * 3) * 0.18);
      const Y = new V3(0, 0, 1), X = new V3().crossVectors(Y, dir);
      const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, dir)).premultiply(camera.quaternion);
      p.applyMatrix4(camera.matrixWorld);
      this.mesh.setMatrixAt(r.i, new THREE.Matrix4().compose(p, q, new V3(0.9, 0.9, 0.9)));
      this.blobs.setMatrixAt(r.i, new THREE.Matrix4().makeScale(0, 0, 0));
      this.iMove.array[r.i] = 1.2; this.iPhase.array[r.i] += dt * 24;
    });
    this.mesh.instanceMatrix.needsUpdate = true;
    this.iMove.needsUpdate = true; this.iPhase.needsUpdate = true;
  }

  hide(r) {
    const Z = new THREE.Matrix4().makeScale(0, 0, 0);
    this.mesh.setMatrixAt(r.i, Z); this.blobs.setMatrixAt(r.i, Z);
  }

  drop(r, at, awayFrom) {
    // thrown off the player: land nearby and scatter
    const a = Math.random() * Math.PI * 2;
    r.pos.set(at.x + Math.cos(a) * 1.2, 0, at.z + Math.sin(a) * 1.2);
    r.yaw = Math.atan2(r.pos.x - awayFrom.x, r.pos.z - awayFrom.z);
    r.state = 'flee'; r.fleeT = 2.5; r.fleeX = Math.sin(r.yaw); r.fleeZ = Math.cos(r.yaw); r.speed = 4;
    this.collide(r);
  }

  centroid(s) {
    let x = 0, z = 0, n = 0;
    for (const r of this.roaches) if (r.sw === s.idx && r.state !== 'attached' && r.state !== 'off') { x += r.pos.x; z += r.pos.z; n++; }
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
      if (ra.state === 'off' || ra.state === 'attached' || ra.state === 'fly') continue;
      for (let b = a + 1; b < R.length; b++) {
        const rb = R[b];
        if (rb.state === 'off' || rb.state === 'attached' || rb.state === 'fly') continue;
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
}
