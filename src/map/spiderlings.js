// Egg sacs on the lab ceiling and wall, and the cat-sized spiderlings inside them.
// Loud noise within 5 m bursts them (generator 3 always does). The young swarm you for
// 10 s, freeze in the beam, slow you 10% per touch (max 40%), and scatter into the dark.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

const V3 = THREE.Vector3;
const clamp = THREE.MathUtils.clamp;

// ---------------------------------------------------------------- spiderling (about 0.55 m across the legs)
export function colorize(g, fn) {
  const p = g.attributes.position, c = new Float32Array(p.count * 3), col = new THREE.Color();
  for (let i = 0; i < p.count; i++) { fn(col, p.getX(i), p.getY(i), p.getZ(i)); c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3));
}
export function tag(g, leg, pivot, distFrom = null) {
  const n = g.attributes.position.count;
  const L = new Float32Array(n).fill(leg), P = new Float32Array(n * 3), D = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    P[i * 3] = pivot.x; P[i * 3 + 1] = pivot.y; P[i * 3 + 2] = pivot.z;
    D[i] = distFrom ? Math.hypot(g.attributes.position.getX(i) - pivot.x, g.attributes.position.getZ(i) - pivot.z) : 0;
  }
  g.setAttribute('aLeg', new THREE.BufferAttribute(L, 1));
  g.setAttribute('aPivot', new THREE.BufferAttribute(P, 3));
  g.setAttribute('aDist', new THREE.BufferAttribute(D, 1));
  if (g.attributes.uv) g.deleteAttribute('uv');
  return g;
}
export function seg(a, b, r0, r1) {
  const d = new V3().subVectors(b, a), L = d.length();
  const c = new THREE.CylinderGeometry(r1, r0, L, 6, 1);
  c.translate(0, L / 2, 0);
  c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()));
  c.translate(a.x, a.y, a.z);
  return c;
}
function spiderlingGeometry() {
  const parts = [];
  const pro = new THREE.SphereGeometry(1, 14, 10); pro.scale(0.06, 0.04, 0.07); pro.translate(0, 0.1, 0.05);
  colorize(pro, (c, x, y) => c.set('#2a1e15').lerp(new THREE.Color('#5a4632'), y > 0.12 ? 0.5 : 0));
  const abd = new THREE.SphereGeometry(1, 16, 12); abd.scale(0.085, 0.07, 0.11); abd.translate(0, 0.12, -0.1);
  colorize(abd, (c, x, y, z) => {
    c.set('#24190f');
    const chev = Math.abs(x) < 0.02 + Math.max(0, -(z + 0.1)) * 0.35 && y > 0.14 && Math.sin((z + 0.1) * 70) > 0.2;
    if (chev) c.set('#9a8460');
    if (y < 0.09) c.lerp(new THREE.Color('#3a2d22'), 0.6);
  });
  parts.push(tag(pro, 0, new V3()), tag(abd, 0, new V3()));
  for (const s of [-1, 1]) {
    const eye = new THREE.SphereGeometry(0.012, 8, 6); eye.translate(s * 0.02, 0.125, 0.11);
    colorize(eye, (c) => c.set('#050505'));
    parts.push(tag(eye, 0, new V3()));
  }
  // eight legs: femur up and out, tibia down, tarsus to the floor
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = (0.45 + i * 0.6);                       // angle from forward
    const hip = new V3(s * 0.035, 0.095, 0.06 - i * 0.03);
    const dir = new V3(s * Math.sin(a), 0, Math.cos(a));
    const knee = hip.clone().addScaledVector(dir, 0.1).add(new V3(0, 0.08, 0));
    const ank = hip.clone().addScaledVector(dir, 0.21).add(new V3(0, 0.03, 0));
    const foot = hip.clone().addScaledVector(dir, 0.27 + (i === 0 || i === 3 ? 0.03 : 0)); foot.y = 0.005;
    for (const [p, q, r0, r1] of [[hip, knee, 0.011, 0.009], [knee, ank, 0.009, 0.007], [ank, foot, 0.007, 0.004]]) {
      const g = seg(p, q, r0, r1);
      colorize(g, (c, x, y) => c.set(y > 0.12 ? '#4a3a2a' : '#2b2018').lerp(new THREE.Color('#6a5640'), Math.random() * 0.15));
      parts.push(tag(g, 1 + i * 2 + (s > 0 ? 1 : 0), hip, true));
    }
  }
  return mergeGeometries(parts.map((g) => { for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'color', 'aLeg', 'aPivot', 'aDist'].includes(k)) g.deleteAttribute(k); return g; }));
}

export function lingMaterial(uTime) {
  const m = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uTime = uTime;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', `#include <common>
        attribute float aLeg; attribute vec3 aPivot; attribute float aDist;
        attribute float iPhase; attribute float iMove; attribute float iSeed;
        uniform float uTime;
        vec3 rotY(vec3 p, float a){ float c = cos(a), s = sin(a); return vec3(c*p.x + s*p.z, p.y, -s*p.x + c*p.z); }`)
      .replace('#include <begin_vertex>', `vec3 transformed = vec3(position);
        if (aLeg > 0.5) {
          float li = aLeg - 1.0; float pair = floor(li / 2.0); float sideI = mod(li, 2.0);
          float grp = mod(pair + sideI, 2.0);                 // alternating tetrapod gait
          float ph = iPhase + grp * 3.14159;
          float sgn = sideI > 0.5 ? 1.0 : -1.0;
          vec3 p = transformed - aPivot;
          float idle = sin(uTime * 3.0 + iSeed * 9.0 + li * 1.7) * 0.08;
          p = rotY(p, (sin(ph) * 0.42 * iMove + idle) * sgn);
          p.y += max(0.0, cos(ph)) * 0.05 * iMove * aDist / 0.27;
          transformed = p + aPivot;
        }`);
    sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', `{ float mx = max(max(outgoingLight.r, outgoingLight.g), outgoingLight.b); if (mx > 0.6) outgoingLight *= 0.6 / mx; }
      #include <opaque_fragment>`);
  };
  m.customProgramCacheKey = () => 'spiderling';
  return m;
}

// ---------------------------------------------------------------- sacs + young
export class EggNest {
  constructor(scene, spots, silkMat, T, { perSac = 12 } = {}) {
    this.spots = spots.map((s) => new V3(...s));
    this.group = new THREE.Group();
    scene.add(this.group);
    this.mat = new THREE.MeshPhysicalMaterial({
      color: '#d2cbbd', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.35,
      normalMap: T.chitin, normalScale: new THREE.Vector2(1.6, 1.6),
    });
    this.matBurst = new THREE.MeshStandardMaterial({ color: '#6e6656', roughness: 0.9, normalMap: T.chitin, normalScale: new THREE.Vector2(2, 2), side: THREE.DoubleSide });
    this.sacs = this.spots.map((s, i) => {
      const g = new THREE.SphereGeometry(1, 40, 30);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const v = new V3().fromBufferAttribute(p, k);
        const n = 1 + 0.08 * Math.sin(v.x * 9 + i) * Math.sin(v.y * 7) + 0.05 * Math.sin(v.z * 13 + v.x * 5);
        p.setXYZ(k, v.x * n * 0.4, v.y * n * 0.34, v.z * n * 0.38);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mat);
      m.position.copy(s);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      return { m, ph: i * 1.7, burst: 0, pos: s.clone() };
    });
    // silk holding them up: to the ceiling (4.5 m) or the east wall (x = -6.3)
    const segs = [];
    let rs = 5;
    const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
    for (const s of this.spots) for (let k = 0; k < 40; k++) {
      const a = s.clone().add(new V3((rnd() - 0.5) * 0.5, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.5));
      const onWall = s.x > -6.9;
      const b = rnd() < (onWall ? 0.35 : 0.8) ? new V3(a.x + (rnd() - 0.5) * 1.2, 4.5, a.z + (rnd() - 0.5) * 1.2) : new V3(onWall ? -6.31 : a.x + (rnd() - 0.5) * 1.5, a.y + (rnd() - 0.5) * 1.2, a.z + (rnd() - 0.5) * 1.2);
      segs.push([a, b]);
    }
    const pos = new Float32Array(segs.length * 6), tan = new Float32Array(segs.length * 6);
    segs.forEach(([a, b], i) => { pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); const t = b.clone().sub(a).normalize(); tan.set([t.x, t.y, t.z, t.x, t.y, t.z], i * 6); });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
    const silk = new THREE.LineSegments(sg, silkMat); silk.frustumCulled = false;
    this.group.add(silk);

    // the young
    this.N = perSac * this.spots.length;
    const geo = spiderlingGeometry();
    this.iPhase = new THREE.InstancedBufferAttribute(new Float32Array(this.N), 1).setUsage(THREE.DynamicDrawUsage);
    this.iMove = new THREE.InstancedBufferAttribute(new Float32Array(this.N), 1).setUsage(THREE.DynamicDrawUsage);
    const seed = new Float32Array(this.N); for (let i = 0; i < this.N; i++) seed[i] = Math.random();
    geo.setAttribute('iPhase', this.iPhase); geo.setAttribute('iMove', this.iMove); geo.setAttribute('iSeed', new THREE.InstancedBufferAttribute(seed, 1));
    this.uTime = { value: 0 };
    this.mesh = new THREE.InstancedMesh(geo, lingMaterial(this.uTime), this.N);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.mesh);
    this.L = Array.from({ length: this.N }, (_, i) => ({ i, alive: false, p: new V3(), vy: 0, yaw: 0, speed: 0, phase: 'fall', t: 0, ph: Math.random() * 6, sc: 0.85 + Math.random() * 0.35, cd: 0, mean: 0.3 + Math.random() * 0.6, meanF: 0.6 + Math.random() * 1.4, flip: 0, spin: 0, vx: 0, vz: 0 }));
    this.reset();
  }

  reset() {
    this.active = false; this.time = 0; this.t = 0;
    for (const s of this.sacs) { s.burst = 0; s.m.material = this.mat; s.m.scale.setScalar(1); }
    for (const l of this.L) l.alive = false;
    this.hide();
  }
  hide() { const Z = new THREE.Matrix4().makeScale(0, 0, 0); for (let i = 0; i < this.N; i++) this.mesh.setMatrixAt(i, Z); this.mesh.instanceMatrix.needsUpdate = true; this.mesh.visible = false; }

  // the young vanish (after a checkpoint respawn); burst sacs stay burst
  clearYoung() { for (const l of this.L) l.alive = false; this.active = false; this.hide(); }

  get burstDone() { return this.sacs.every((s) => s.burst > 0); }

  burst() {
    if (this.sacs[0].burst > 0) return false;
    this.active = true; this.t = 0; this.mesh.visible = true;
    const per = this.N / this.sacs.length;
    this.sacs.forEach((s, i) => {
      s.burst = 0.001;
      for (let j = 0; j < per; j++) {
        const l = this.L[i * per + j];
        l.alive = true; l.phase = 'fall'; l.t = -Math.random() * 0.9;
        l.p.copy(s.pos).add(new V3((Math.random() - 0.5) * 0.3, -0.2, (Math.random() - 0.5) * 0.3));
        l.vy = -Math.random() * 0.8; l.vx = (Math.random() - 0.5) * 1.2; l.vz = (Math.random() - 0.5) * 1.2;
        l.yaw = Math.random() * 6.28; l.speed = 0; l.flip = 0; l.spin = 0; l.cd = 0;
      }
    });
    return true;
  }

  // ctx: { dt, player:{pos}, nav, field, light:{on,pos,dir}, frozen, onTouch(), onFirstLit() }
  update(ctx) {
    const { dt } = ctx;
    this.time += dt; this.uTime.value += dt;
    const t = this.time;
    for (const s of this.sacs) {
      if (s.burst > 0) {
        s.burst += dt;
        const b = s.burst;
        if (b > 0.2 && s.m.material !== this.matBurst) s.m.material = this.matBurst;
        const sc = b < 0.18 ? 1 + b * 1.6 : Math.max(0.5, 1.29 - (b - 0.18) * 2.5);
        s.m.scale.set(sc, sc * (b < 0.18 ? 1 : 0.7), sc);
      } else {
        const br = 1 + 0.05 * Math.sin(t * 1.4 + s.ph) + 0.015 * Math.sin(t * 5.1 + s.ph * 2);
        s.m.scale.set(br, br * 1.04, br);
      }
    }
    if (!this.active) return { moving: 0, cx: 0, cz: 0, emit: [] };
    this.t += dt;
    const P = ctx.player.pos, nav = ctx.nav;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3();
    const D = { x: 0, z: 0 };
    let alive = 0, moving = 0, cx = 0, cz = 0;
    const emit = [];
    const cosC = Math.cos(0.42);
    for (const l of this.L) {
      if (!l.alive) { M.makeScale(0, 0, 0); this.mesh.setMatrixAt(l.i, M); continue; }
      alive++;
      l.t += dt; l.cd -= dt;
      if (l.t < 0) { M.makeScale(0, 0, 0); this.mesh.setMatrixAt(l.i, M); continue; }
      let lit = false;
      if (ctx.light.on && l.phase === 'run') {
        const v = l.p.clone().sub(ctx.light.pos), d = v.length();
        lit = d < 13 && v.dot(ctx.light.dir) / d > cosC;
        if (lit && !this.seenLit) { this.seenLit = true; ctx.onFirstLit && ctx.onFirstLit(); }
      }
      let want = 0, dx = 0, dz = 0;
      if (l.phase === 'fall') {
        l.vy -= 9.8 * dt; l.p.y += l.vy * dt; l.p.x += l.vx * dt; l.p.z += l.vz * dt;
        if (l.p.y <= 0) { l.p.y = 0; l.phase = 'run'; }
      } else if (l.phase === 'swept') {
        l.p.x += l.vx * dt; l.p.z += l.vz * dt; l.vx *= 0.92; l.vz *= 0.92; l.vy -= 9.8 * dt; l.p.y = Math.max(0, l.p.y + l.vy * dt);
        l.spin += dt * 12; l.flip = Math.min(1, l.flip + dt * 4);
        if (l.t > 2.2) { l.sc *= 0.92; if (l.sc < 0.05) l.alive = false; }
      } else {
        if (l.phase === 'run' && this.t > 10) { l.phase = 'leave'; l.t = 0; }
        if (l.phase === 'run') {
          if (!nav.descend(ctx.field, l.p.x, l.p.z, D)) { const L = Math.hypot(P.x - l.p.x, P.z - l.p.z) || 1; D.x = (P.x - l.p.x) / L; D.z = (P.z - l.p.z) / L; }
          let ang = Math.atan2(D.x, D.z) + Math.sin(t * l.meanF + l.ph) * l.mean;
          dx = Math.sin(ang); dz = Math.cos(ang);
          want = lit || ctx.frozen ? 0 : 2.7 + (l.ph % 1) * 0.6;
          // lamps: they stop at the edge of a lit safe zone
          if (nav.lit[nav.idx(l.p.x + dx * 0.35, l.p.z + dz * 0.35)] === 2) want = 0;
          const dP = Math.hypot(P.x - l.p.x, P.z - l.p.z);
          if (dP < 0.55 && l.cd <= 0 && !ctx.frozen) { l.cd = 2.2; ctx.onTouch && ctx.onTouch(l); l.speed = -2.5; }
        } else {
          // scatter away from you into the dark, then gone
          if (!nav.descend(ctx.field, l.p.x, l.p.z, D, -1)) { D.x = l.p.x - P.x; D.z = l.p.z - P.z; }
          dx = D.x; dz = D.z; want = 3.4;
          if (l.t > 3) { l.sc *= 0.9; if (l.sc < 0.05) l.alive = false; }
        }
        if (Math.hypot(dx, dz) > 1e-4) {
          let dy = Math.atan2(dx, dz) - l.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
          l.yaw += clamp(dy, -9 * dt, 9 * dt);
          want *= Math.max(0.3, Math.cos(dy));
        }
        l.speed += clamp(want - l.speed, -18 * dt, 14 * dt);
        const nx = l.p.x + Math.sin(l.yaw) * l.speed * dt, nz = l.p.z + Math.cos(l.yaw) * l.speed * dt;
        if (nav.free(nx, nz)) { l.p.x = nx; l.p.z = nz; } else if (nav.free(nx, l.p.z)) l.p.x = nx; else if (nav.free(l.p.x, nz)) l.p.z = nz;
        if (Math.abs(l.speed) > 0.4) {
          moving++; cx += l.p.x; cz += l.p.z;
          const d = Math.hypot(l.p.x - P.x, l.p.z - P.z);
          if (d < 12) emit.push({ key: 'l' + l.i, kind: 'ling', x: l.p.x, y: l.p.y, z: l.p.z, d, sp: clamp(Math.abs(l.speed) / 2.5, 0.3, 1) });
        }
      }
      l.ph += Math.abs(l.speed) * dt * 7;
      this.iPhase.array[l.i] = l.ph;
      this.iMove.array[l.i] = l.phase === 'swept' ? 1.6 : l.phase === 'fall' ? 1.2 : clamp(Math.abs(l.speed) / 1.6, 0, 1.2);
      q.setFromEuler(e.set(0, l.yaw + l.spin, Math.PI * l.flip));
      M.compose(new V3(l.p.x, l.p.y + (l.flip > 0 ? 0.16 * l.flip : 0), l.p.z), q, sc.setScalar(l.sc * 1.9));
      this.mesh.setMatrixAt(l.i, M);
    }
    // spread out: push apart anything closer than 0.45 m
    for (let a = 0; a < this.N; a++) {
      const A = this.L[a]; if (!A.alive || A.phase === 'fall' || A.t < 0) continue;
      for (let b2 = a + 1; b2 < this.N; b2++) {
        const Bq = this.L[b2]; if (!Bq.alive || Bq.phase === 'fall' || Bq.t < 0) continue;
        const dx = Bq.p.x - A.p.x, dz = Bq.p.z - A.p.z, d2 = dx * dx + dz * dz;
        if (d2 < 0.2 && d2 > 1e-6) { const d = Math.sqrt(d2), push = (0.45 - d) * 0.5 / d; A.p.x -= dx * push; A.p.z -= dz * push; Bq.p.x += dx * push; Bq.p.z += dz * push; }
      }
    }
    this.mesh.instanceMatrix.needsUpdate = true; this.iPhase.needsUpdate = true; this.iMove.needsUpdate = true;
    if (alive === 0) { this.active = false; this.hide(); }
    return { moving, cx: moving ? cx / moving : 0, cz: moving ? cz / moving : 0, emit };
  }

  // spray cone sweeps them away
  spray(origin, dir, range = 3.2, cosHalf = Math.cos(Math.PI / 6)) {
    let n = 0;
    for (const l of this.L) {
      if (!l.alive || l.phase === 'swept' || l.t < 0) continue;
      const v = new V3(l.p.x, 0.15, l.p.z).sub(origin), d = v.length();
      if (d < range && v.dot(dir) / d > cosHalf) {
        l.phase = 'swept'; l.t = 0; n++;
        const a = new V3(l.p.x - origin.x, 0, l.p.z - origin.z).normalize();
        l.vx = a.x * (3 + Math.random() * 2); l.vz = a.z * (3 + Math.random() * 2); l.vy = 1.5 + Math.random();
      }
    }
    return n;
  }

  // something loud happened at (x, z) with radius r: sacs within 5 m of it burst
  hear(x, z, r) {
    if (this.sacs[0].burst > 0) return false;
    for (const s of this.sacs) if (Math.hypot(s.pos.x - x, s.pos.z - z) < Math.min(5, r)) return this.burst();
    return false;
  }
  nearestSac(p) { let d = 1e9; for (const s of this.sacs) d = Math.min(d, Math.hypot(s.pos.x - p.x, s.pos.z - p.z)); return d; }
}
