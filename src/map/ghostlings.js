// The ghost spider's brood. Like a real pholcid it carries its egg sac in its jaws; the first
// time it is sprayed or you struggle free it drops the sac, which bursts on the floor. About 36
// palm-sized young pour out, rush past your feet and scatter into the cracks. They are harmless:
// they don't cling to you, hurt you or slow you down. Spray curls them up.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { colorize, tag, seg, lingMaterial } from './spiderlings.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;
const rnd = (a, b) => a + Math.random() * (b - a);

// a pale hatchling with a tiny body and very long, thin legs (built ~1.1 units across, drawn at ~0.16)
function babyGeometry() {
  const parts = [];
  const pro = new THREE.SphereGeometry(1, 12, 8); pro.scale(0.045, 0.035, 0.05); pro.translate(0, 0.16, 0.04);
  colorize(pro, (c, x, y) => c.set('#cbbfa6').lerp(new THREE.Color('#8a7a62'), y < 0.15 ? 0.4 : 0));
  const abd = new THREE.SphereGeometry(1, 12, 10); abd.scale(0.05, 0.05, 0.1); abd.translate(0, 0.18, -0.09);
  colorize(abd, (c, x, y) => { c.set('#d6ccb6'); if (y > 0.21 && Math.abs(x) < 0.012) c.set('#9a8c74'); });
  parts.push(tag(pro, 0, new V3()), tag(abd, 0, new V3()));
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = 0.4 + i * 0.62;
    const hip = new V3(s * 0.025, 0.155, 0.05 - i * 0.022);
    const dir = new V3(s * Math.sin(a), 0, Math.cos(a));
    const L = [1.25, 1.0, 0.9, 1.1][i];
    const knee = hip.clone().addScaledVector(dir, 0.13 * L).add(new V3(0, 0.17, 0));
    const ank = hip.clone().addScaledVector(dir, 0.36 * L).add(new V3(0, 0.05, 0));
    const foot = hip.clone().addScaledVector(dir, 0.46 * L); foot.y = 0.004;
    for (const [p, q, r0, r1] of [[hip, knee, 0.016, 0.013], [knee, ank, 0.013, 0.01], [ank, foot, 0.01, 0.007]]) {
      const g = seg(p, q, r0, r1);
      colorize(g, (c, x, y) => c.set('#c4b79e').lerp(new THREE.Color('#5a4c3c'), Math.abs(y - knee.y) < 0.02 ? 0.7 : 0));
      parts.push(tag(g, 1 + i * 2 + (s > 0 ? 1 : 0), hip, true));
    }
  }
  return mergeGeometries(parts.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aLeg', 'aPivot', 'aDist'].includes(k)) g.deleteAttribute(k); return g; }));
}

// the sac: a loose ball of eggs in sparse silk, so the eggs show (about 0.04 units, in the spider's frame)
export function eggSacGeometry() {
  let r = 7;
  const R = () => { r = (r * 9301 + 49297) % 233280; return r / 233280; };
  const parts = [];
  for (let i = 0; i < 30; i++) {
    const u = R() * 2 - 1, th = R() * Math.PI * 2, rr = 0.026 * Math.cbrt(0.35 + 0.65 * R()), s = Math.sqrt(1 - u * u);
    const g = new THREE.SphereGeometry(0.0115 + R() * 0.003, 8, 6);
    g.translate(Math.cos(th) * s * rr, u * rr * 0.9, Math.sin(th) * s * rr);
    const shade = 0.85 + R() * 0.15;
    colorize(g, (c) => c.set('#ddd2ba').multiplyScalar(shade));
    g.deleteAttribute('uv');
    parts.push(g);
  }
  return mergeGeometries(parts);
}

export class GhostBrood {
  constructor(scene, N = 36) {
    this.N = N;
    const geo = babyGeometry();
    this.iPhase = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    this.iMove = new THREE.InstancedBufferAttribute(new Float32Array(N), 1).setUsage(THREE.DynamicDrawUsage);
    const seed = new Float32Array(N); for (let i = 0; i < N; i++) seed[i] = Math.random();
    geo.setAttribute('iPhase', this.iPhase); geo.setAttribute('iMove', this.iMove); geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 1));
    this.uTime = { value: 0 };
    this.mesh = new THREE.InstancedMesh(geo, lingMaterial(this.uTime), N);
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    scene.add(this.mesh);
    this.B = Array.from({ length: N }, (_, i) => ({ i, st: 'off', p: new V3(), yaw: 0, speed: 0, t: 0, delay: 0, dur: 0, ph: Math.random() * 6, sc: rnd(0.14, 0.19), dir: new V3(), fdir: new V3(), side: 1, off: 0 }));
    this.reset();
  }

  reset() { for (const b of this.B) b.st = 'off'; this.active = false; this.hide(); }

  hide() {
    const Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < this.N; i++) this.mesh.setMatrixAt(i, Z);
    this.mesh.instanceMatrix.needsUpdate = true;
    this.mesh.visible = false;
  }

  // the sac burst at `pos` (on the floor)
  burst(pos) {
    this.active = true; this.mesh.visible = true;
    for (const b of this.B) {
      b.st = 'wait'; b.t = 0; b.delay = Math.random() * 0.7; b.dur = rnd(0.25, 0.5);
      b.p.set(pos.x + rnd(-0.06, 0.06), 0, pos.z + rnd(-0.06, 0.06));
      b.yaw = Math.random() * Math.PI * 2; b.speed = rnd(1.2, 2.2);
    }
  }

  // spray curls up the young it reaches
  spray(origin, dir, range = 3.2, cosHalf = Math.cos(Math.PI / 6)) {
    if (!this.active) return 0;
    let n = 0;
    for (const b of this.B) {
      if (b.st === 'off' || b.st === 'wait' || b.st === 'dead' || b.st === 'hide') continue;
      const v = new V3(b.p.x - origin.x, 0.03 - origin.y, b.p.z - origin.z), d = v.length();
      if (d < range && v.dot(dir) / d > cosHalf - 0.15) { b.st = 'dead'; b.t = 0; n++; }
    }
    return n;
  }

  update({ dt, player, nav, frozen }) {
    if (!this.active) return { moving: 0, cx: 0, cz: 0, emit: [] };
    this.uTime.value += dt;
    const P = player.pos;
    let alive = 0, moving = 0, cx = 0, cz = 0;
    const emit = [];
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const b of this.B) {
      if (b.st === 'off') { this.mesh.setMatrixAt(b.i, Z); continue; }
      alive++;
      if (!frozen) b.t += dt;
      if (b.st === 'wait') {
        if (b.t < b.delay) { this.mesh.setMatrixAt(b.i, Z); continue; }
        b.st = 'spill'; b.t = 0;
      }
      let wantYaw = b.yaw, k = 1, flip = 0;
      if (b.st === 'spill') {
        // pouring out of the sac in every direction
        if (b.t > b.dur) {
          const dx = P.x - b.p.x, dz = P.z - b.p.z, d = Math.hypot(dx, dz);
          if (d > 9) { b.st = 'flee'; b.fdir.set(-dx / d, 0, -dz / d); }
          else {
            if (d > 0.05) b.dir.set(dx / d, 0, dz / d); else b.dir.set(Math.sin(b.yaw), 0, Math.cos(b.yaw));
            b.side = Math.random() < 0.5 ? -1 : 1; b.off = rnd(0.1, 0.65); b.st = 'rush';
          }
          b.t = 0; b.speed = rnd(2.4, 3.6);
        }
      } else if (b.st === 'rush') {
        // run at you and stream past your feet on one side
        const tx = P.x - b.dir.z * b.side * b.off + b.dir.x * 1.2, tz = P.z + b.dir.x * b.side * b.off + b.dir.z * 1.2;
        wantYaw = Math.atan2(tx - b.p.x, tz - b.p.z) + Math.sin(b.t * 13 + b.ph) * 0.3;
        const past = (b.p.x - P.x) * b.dir.x + (b.p.z - P.z) * b.dir.z;
        if (past > 0.5 || Math.hypot(tx - b.p.x, tz - b.p.z) < 0.25 || b.t > 3.5) {
          const a = rnd(-0.8, 0.8), ax = b.p.x - P.x, az = b.p.z - P.z, L = Math.hypot(ax, az) || 1;
          const fx = ax / L, fz = az / L;
          b.fdir.set(fx * Math.cos(a) + fz * Math.sin(a), 0, -fx * Math.sin(a) + fz * Math.cos(a));
          b.st = 'flee'; b.t = 0; b.speed = rnd(2.6, 3.4);
        }
      } else if (b.st === 'flee') {
        // scatter into the cracks
        wantYaw = Math.atan2(b.fdir.x, b.fdir.z) + Math.sin(b.t * 11 + b.ph) * 0.35;
        if (b.t > 4) { b.st = 'hide'; b.t = 0; }
      } else if (b.st === 'hide') {
        k = Math.max(0, 1 - b.t / 0.3);
        if (b.t > 0.3) { b.st = 'off'; this.mesh.setMatrixAt(b.i, Z); continue; }
      } else if (b.st === 'dead') {
        flip = 1; b.speed = 0;
        if (b.t > 1.6) { b.st = 'hide'; b.t = 0; }
      }
      if (!frozen && b.st !== 'dead') {
        let dy = wantYaw - b.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        b.yaw += clamp(dy, -14 * dt, 14 * dt);
        const sp = b.st === 'hide' ? 0.6 : b.speed;
        const nx = b.p.x + Math.sin(b.yaw) * sp * dt, nz = b.p.z + Math.cos(b.yaw) * sp * dt;
        if (nav.free(nx, nz)) { b.p.x = nx; b.p.z = nz; }
        else if (b.st === 'flee') { b.st = 'hide'; b.t = 0; }        // reached a wall: gone into a crack
        else if (nav.free(nx, b.p.z)) b.p.x = nx;
        else if (nav.free(b.p.x, nz)) b.p.z = nz;
        b.ph += sp * dt * 30;
      }
      const mv = b.st === 'dead' ? 1.4 : b.st === 'hide' ? 1 : clamp(b.speed / 1.5, 0, 1.4);
      this.iPhase.array[b.i] = b.st === 'dead' ? b.ph + b.t * 40 : b.ph;
      this.iMove.array[b.i] = mv;
      q.setFromEuler(e.set(0, b.yaw, Math.PI * flip));
      M.compose(new V3(b.p.x, flip ? 0.03 : 0, b.p.z), q, sc.setScalar(b.sc * k));
      this.mesh.setMatrixAt(b.i, M);
      if (b.st === 'spill' || b.st === 'rush' || b.st === 'flee') {
        moving++; cx += b.p.x; cz += b.p.z;
        const d = Math.hypot(b.p.x - P.x, b.p.z - P.z);
        if (d < 10) emit.push({ key: 'g' + b.i, kind: 'tiny', x: b.p.x, y: 0.02, z: b.p.z, d, sp: clamp(b.speed / 3, 0.4, 1) });
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.iPhase.needsUpdate = true; this.iMove.needsUpdate = true;
    if (alive === 0) { this.active = false; this.hide(); }
    return { moving, cx: moving ? cx / moving : 0, cz: moving ? cz / moving : 0, emit };
  }
}
