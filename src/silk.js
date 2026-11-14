import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { sstep } from './textures.js';
import { colorize } from './roach.js';

const V3 = THREE.Vector3;

// Silk threads are nearly invisible until a light rakes across them (fibre glint).
export function makeSilkMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: {
      uSpotPos: { value: new V3() }, uSpotDir: { value: new V3(0, 0, 1) }, uCosO: { value: Math.cos(0.36) }, uCosI: { value: Math.cos(0.2) },
      uOn: { value: 1 }, uAmb: { value: 0.0 }, uColor: { value: new THREE.Color('#e9eef5') }, uKey: { value: new V3(0.4, 1, 0.3).normalize() }, uKeyOn: { value: 0 },
    },
    vertexShader: /* glsl */`
      attribute vec3 aTan;
      uniform vec3 uSpotPos; uniform vec3 uSpotDir; uniform float uCosO; uniform float uCosI; uniform float uOn; uniform float uAmb;
      uniform vec3 uKey; uniform float uKeyOn;
      varying float vI;
      float glint(vec3 T, vec3 L, vec3 V) {
        float tl = dot(T, L), tv = dot(T, V);
        return pow(max(0.0, sqrt(max(0.0, 1.0 - tl * tl)) * sqrt(max(0.0, 1.0 - tv * tv)) - tl * tv), 60.0);
      }
      void main(){
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vec3 L = uSpotPos - wp.xyz; float d = length(L); L /= d;
        float cone = smoothstep(uCosO, uCosI, dot(-L, uSpotDir));
        vec3 V = normalize(cameraPosition - wp.xyz);
        vec3 T = normalize(mat3(modelMatrix) * aTan);
        vI = cone * uOn * (0.08 + 3.0 * glint(T, L, V)) / (1.0 + d * d * 0.06) + uKeyOn * (0.12 + 1.2 * glint(T, uKey, V)) + uAmb;
        gl_Position = projectionMatrix * viewMatrix * wp;
      }`,
    fragmentShader: /* glsl */`
      uniform vec3 uColor; varying float vI;
      void main(){ gl_FragColor = vec4(uColor * vI, 1.0); }`,
  });
}

function segmentsGeometry(segs) {
  const pos = new Float32Array(segs.length * 6), tan = new Float32Array(segs.length * 6);
  segs.forEach(([a, b], i) => {
    pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6);
    const t = new V3().subVectors(b, a).normalize();
    tan.set([t.x, t.y, t.z, t.x, t.y, t.z], i * 6);
  });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
  return g;
}

function sagLine(a, b, sag, n, out) {
  let prev = a.clone();
  for (let i = 1; i <= n; i++) {
    const u = i / n;
    const p = new V3().lerpVectors(a, b, u);
    p.y -= sag * 4 * u * (1 - u);
    out.push([prev, p]);
    prev = p;
  }
}

// orb web spun across a door frame, partly torn
export function makeDoorWeb(cx, cy, z, halfW, height, mat) {
  let s = 77;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const segs = [];
  const C = new V3(cx, cy, z);
  const spokes = 26;
  const ends = [];
  for (let k = 0; k < spokes; k++) {
    const a = (k / spokes) * Math.PI * 2 + (rnd() - 0.5) * 0.12;
    const dx = Math.cos(a), dy = Math.sin(a);
    // ray to the door frame rectangle
    let tMax = 9;
    if (dx > 0) tMax = Math.min(tMax, (halfW - cx) / dx); if (dx < 0) tMax = Math.min(tMax, (-halfW - cx) / dx);
    if (dy > 0) tMax = Math.min(tMax, (height - cy) / dy); if (dy < 0) tMax = Math.min(tMax, (0.05 - cy) / dy);
    const E = new V3(cx + dx * tMax, cy + dy * tMax, z + (rnd() - 0.5) * 0.04);
    ends.push({ a, t: tMax, dx, dy });
    sagLine(C, E, 0.01, 8, segs);
  }
  // capture spiral, with gaps where it has torn
  const turns = 34;
  let prev = null;
  for (let i = 0; i <= turns * spokes; i++) {
    const k = i % spokes, r = 0.07 + (i / (turns * spokes)) * 1.1;
    const e = ends[k];
    if (r > e.t * 0.96) { prev = null; continue; }
    const p = new V3(cx + e.dx * r, cy + e.dy * r - 0.004, z);
    if (prev && rnd() > 0.06) sagLine(prev, p, 0.006, 2, segs);
    prev = p;
  }
  // stray sheet threads and tangles in the corners
  const corners = [[-halfW, height], [halfW, height], [-halfW, 0.05], [halfW, 0.05]];
  for (let k = 0; k < 70; k++) {
    const [qx, qy] = corners[Math.floor(rnd() * 4)];
    const a = new V3(qx + (rnd() - 0.5) * 0.2, qy + (rnd() - 0.5) * 0.25, z + (rnd() - 0.5) * 0.3);
    const b = new V3(qx * (0.3 + rnd() * 0.6), qy + (cy - qy) * rnd() * 0.7, z + (rnd() - 0.5) * 0.3);
    sagLine(a, b, 0.02 * rnd(), 4, segs);
  }
  return new THREE.LineSegments(segmentsGeometry(segs), mat);
}

// cobweb tangles in the ceiling/wall corners of the corridor
export function makeCornerWebs(list, mat) {
  let s = 91;
  const rnd = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
  const segs = [];
  for (const { x, y, z, sx, sy, len } of list) {
    for (let k = 0; k < 60; k++) {
      const a = new V3(x, y - rnd() * 0.5, z + (rnd() - 0.5) * len);
      const b = new V3(x - sx * rnd() * 0.5, y, z + (rnd() - 0.5) * len);
      sagLine(a, b, 0.05 * rnd(), 4, segs);
    }
  }
  return new THREE.LineSegments(segmentsGeometry(segs), mat);
}

// a single dynamic dragline
export class Thread {
  constructor(mat) {
    this.geo = segmentsGeometry([[new V3(), new V3(0, 1, 0)]]);
    this.line = new THREE.LineSegments(this.geo, mat);
    this.line.frustumCulled = false;
  }
  set(a, b, visible) {
    this.line.visible = visible;
    if (!visible) return;
    const p = this.geo.attributes.position, t = this.geo.attributes.aTan;
    p.setXYZ(0, a.x, a.y, a.z); p.setXYZ(1, b.x, b.y, b.z);
    const d = new V3().subVectors(b, a).normalize();
    t.setXYZ(0, d.x, d.y, d.z); t.setXYZ(1, d.x, d.y, d.z);
    p.needsUpdate = true; t.needsUpdate = true;
  }
}

// ---------------------------------------------------------------- egg sacs
function spiderlingGeom() {
  const parts = [];
  const b1 = new THREE.SphereGeometry(1, 10, 8); b1.scale(0.018, 0.012, 0.02); b1.translate(0, 0.014, 0.012);
  const b2 = new THREE.SphereGeometry(1, 10, 8); b2.scale(0.022, 0.017, 0.028); b2.translate(0, 0.016, -0.026);
  parts.push(b1, b2);
  for (const s of [-1, 1]) for (let i = 0; i < 4; i++) {
    const a = 0.5 + i * 0.62;
    for (const [r0, r1, h0, h1] of [[0.01, 0.03, 0.012, 0.028], [0.03, 0.055, 0.028, 0.0]]) {
      const p0 = new V3(s * Math.sin(a) * r0, h0, 0.012 + Math.cos(a) * r0);
      const p1 = new V3(s * Math.sin(a) * r1, h1, 0.012 + Math.cos(a) * r1);
      const d = new V3().subVectors(p1, p0);
      const c = new THREE.CylinderGeometry(0.0018, 0.0014, d.length(), 4);
      c.translate(0, d.length() / 2, 0);
      c.applyQuaternion(new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.clone().normalize()));
      c.translate(p0.x, p0.y, p0.z);
      parts.push(c);
    }
  }
  const g = mergeGeometries(parts.map((q) => { q.deleteAttribute('uv'); return q; }));
  colorize(g, (c, x, y) => c.set('#2e221a').lerp(new THREE.Color('#6a5844'), y > 0.02 ? 0.4 : 0));
  return g;
}

export class EggSacs {
  constructor(spots, T, silkMat) {
    this.group = new THREE.Group();
    this.spots = spots;
    this.mat = new THREE.MeshPhysicalMaterial({
      color: '#d4cdbf', roughness: 0.85, sheen: 1, sheenColor: new THREE.Color('#ffffff'), sheenRoughness: 0.35,
      normalMap: T.chitin, normalScale: new THREE.Vector2(1.6, 1.6),
    });
    this.sacs = spots.map((s, i) => {
      const g = new THREE.SphereGeometry(1, 40, 30);
      const p = g.attributes.position;
      for (let k = 0; k < p.count; k++) {
        const v = new V3().fromBufferAttribute(p, k);
        const n = 1 + 0.08 * Math.sin(v.x * 9 + i) * Math.sin(v.y * 7) + 0.05 * Math.sin(v.z * 13 + v.x * 5);
        p.setXYZ(k, v.x * n * 0.13, v.y * n * 0.1, v.z * n * 0.12);
      }
      g.computeVertexNormals();
      const m = new THREE.Mesh(g, this.mat);
      m.position.copy(s);
      m.castShadow = m.receiveShadow = true;
      this.group.add(m);
      return { m, ph: i * 1.7, burst: 0 };
    });
    // silk holding the sacs to the ceiling and wall
    const segs = [];
    let rs = 3;
    const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
    for (const s of spots) for (let k = 0; k < 26; k++) {
      const a = s.clone().add(new V3((rnd() - 0.5) * 0.16, (rnd() - 0.5) * 0.14, (rnd() - 0.5) * 0.16));
      const b = rnd() < 0.6 ? new V3(a.x + (rnd() - 0.5) * 0.5, 2.6, a.z + (rnd() - 0.5) * 0.5) : new V3(1.5, a.y + (rnd() - 0.5) * 0.4, a.z + (rnd() - 0.5) * 0.5);
      segs.push([a, b]);
    }
    const pos = new Float32Array(segs.length * 6), tan = new Float32Array(segs.length * 6);
    segs.forEach(([a, b], i) => { pos.set([a.x, a.y, a.z, b.x, b.y, b.z], i * 6); const t = b.clone().sub(a).normalize(); tan.set([t.x, t.y, t.z, t.x, t.y, t.z], i * 6); });
    const sg = new THREE.BufferGeometry();
    sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    sg.setAttribute('aTan', new THREE.BufferAttribute(tan, 3));
    this.group.add(new THREE.LineSegments(sg, silkMat));

    // spiderlings
    this.N = 150;
    this.lings = new THREE.InstancedMesh(spiderlingGeom(), new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.6, sheen: 0.5, sheenColor: new THREE.Color('#8a7258') }), this.N);
    this.lings.frustumCulled = false;
    this.lings.castShadow = true;
    this.lings.count = 0;
    this.group.add(this.lings);
    this.L = Array.from({ length: this.N }, () => ({ alive: false, p: new V3(), vy: 0, yaw: 0, sp: 0, t: 0, phase: 'fall', ph: 0, turn: 0 }));
    this.active = false;
    this.time = 0;
  }

  reset() {
    for (const s of this.sacs) { s.burst = 0; s.m.scale.setScalar(1); s.m.material = this.mat; s.m.visible = true; }
    for (const l of this.L) l.alive = false;
    this.lings.count = 0;
    this.active = false;
  }

  burst() {
    if (this.active) return false;
    this.active = true;
    let k = 0;
    this.sacs.forEach((s, i) => {
      s.burst = 0.001;
      for (let j = 0; j < this.N / this.sacs.length; j++, k++) {
        const l = this.L[k];
        l.alive = true; l.phase = 'fall'; l.t = -Math.random() * 0.8;
        l.p.copy(this.spots[i]).add(new V3((Math.random() - 0.5) * 0.1, -0.05, (Math.random() - 0.5) * 0.1));
        l.vy = -Math.random() * 0.5; l.yaw = Math.random() * 6.28; l.sp = 0.9 + Math.random() * 1.1; l.ph = Math.random() * 6.28;
      }
    });
    this.lings.count = this.N;
    return true;
  }

  update(dt, light, bounds) {
    this.time += dt;
    const t = this.time;
    for (const s of this.sacs) {
      if (s.burst > 0) {
        s.burst += dt;
        const b = s.burst;
        const sc = b < 0.15 ? 1 + b * 1.5 : Math.max(0.55, 1.22 - (b - 0.15) * 2.5);
        s.m.scale.set(sc, sc * (b < 0.15 ? 1 : 0.8), sc);
      } else {
        const br = 1 + 0.045 * Math.sin(t * 1.6 + s.ph);
        s.m.scale.set(br, br * 1.03, br);
      }
    }
    if (!this.active) return;
    const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), sc = new V3(1, 1, 1);
    let alive = 0;
    const cosC = Math.cos(0.22);
    this.L.forEach((l, i) => {
      if (!l.alive) { M.makeScale(0, 0, 0); this.lings.setMatrixAt(i, M); return; }
      alive++;
      l.t += dt;
      if (l.t < 0) { M.makeScale(0, 0, 0); this.lings.setMatrixAt(i, M); return; }
      let lit = false;
      if (light.on) {
        const v = l.p.clone().sub(light.pos); const d = v.length();
        lit = d < 14 && v.dot(light.dir) / d > cosC;
      }
      if (l.phase === 'fall') {
        l.vy -= 9.8 * dt; l.p.y += l.vy * dt;
        if (l.p.y <= 0.005) { l.p.y = 0.005; l.phase = 'run'; }
      } else {
        let sp = l.sp;
        if (l.phase === 'run' && l.t > 10) { l.phase = 'leave'; l.yaw = l.p.z > 0 ? 0 : Math.PI; l.sp = 2.4; }
        if (lit && l.phase === 'run') sp = 0;
        l.turn += (Math.random() - 0.5) * 30 * dt;
        l.turn *= 0.9;
        if (sp > 0) l.yaw += l.turn * dt * (l.phase === 'leave' ? 0.2 : 1);
        l.p.x += Math.sin(l.yaw) * sp * dt; l.p.z += Math.cos(l.yaw) * sp * dt;
        if (l.p.x < bounds.x0) { l.p.x = bounds.x0; l.yaw = -l.yaw; }
        if (l.p.x > bounds.x1) { l.p.x = bounds.x1; l.yaw = -l.yaw; }
        if (l.phase === 'run' && (l.p.z < bounds.z0 || l.p.z > bounds.z1)) { l.yaw = Math.PI - l.yaw; l.p.z = THREE.MathUtils.clamp(l.p.z, bounds.z0, bounds.z1); }
        if (l.phase === 'leave' && Math.abs(l.p.z) > 9.5) { l.alive = false; }
        this.anyLit = this.anyLit || lit;
      }
      const wig = (lit && l.phase === 'run') ? 0.05 * Math.sin(t * 40 + l.ph) : 0.25 * Math.sin(t * 30 + l.ph);
      q.setFromEuler(e.set(0, l.yaw + wig, 0));
      M.compose(l.p, q, sc.setScalar(0.9 + (l.ph % 1) * 0.4));
      this.lings.setMatrixAt(i, M);
    });
    this.lings.instanceMatrix.needsUpdate = true;
    if (alive === 0) { this.active = false; this.lings.count = 0; }
  }
}
