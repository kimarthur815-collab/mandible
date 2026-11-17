import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Tube } from './tube.js';
import { sstep } from './textures.js';

const V3 = THREE.Vector3;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const UP = new V3(0, 1, 0);
export const BODY_H = 0.36;

const col = (h) => new THREE.Color(h);

// ---------------------------------------------------------------- helpers
export function colorize(g, fn) {
  const p = g.attributes.position;
  const arr = new Float32Array(p.count * 3);
  const c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    fn(c, p.getX(i), p.getY(i), p.getZ(i), i);
    arr[i * 3] = c.r; arr[i * 3 + 1] = c.g; arr[i * 3 + 2] = c.b;
  }
  g.setAttribute('color', new THREE.BufferAttribute(arr, 3));
  return g;
}

export function smoothSeams(g) {
  const p = g.attributes.position, n = g.attributes.normal;
  const map = new Map();
  for (let i = 0; i < p.count; i++) {
    const key = p.getX(i).toFixed(4) + ',' + p.getY(i).toFixed(4) + ',' + p.getZ(i).toFixed(4);
    let a = map.get(key);
    if (!a) { a = []; map.set(key, a); }
    a.push(i);
  }
  const v = new V3();
  for (const a of map.values()) {
    if (a.length < 2) continue;
    v.set(0, 0, 0);
    for (const i of a) { v.x += n.getX(i); v.y += n.getY(i); v.z += n.getZ(i); }
    v.normalize();
    for (const i of a) n.setXYZ(i, v.x, v.y, v.z);
  }
  n.needsUpdate = true;
}

const _x = new V3(), _y = new V3(), _z = new V3();
function placeSeg(mesh, p0, p1, upHint, lenDesign) {
  _y.subVectors(p1, p0);
  const d = _y.length() || 1e-6;
  _y.divideScalar(d);
  _z.copy(upHint).addScaledVector(_y, -upHint.dot(_y));
  if (_z.lengthSq() < 1e-8) { _z.set(0, 0, 1).addScaledVector(_y, -_y.z); }
  _z.normalize();
  _x.crossVectors(_y, _z);
  const s = lenDesign ? d / lenDesign : 1;
  _y.multiplyScalar(s);
  mesh.matrix.makeBasis(_x, _y, _z);
  mesh.matrix.setPosition(p0);
  mesh.matrixWorldNeedsUpdate = true;
}

// --------------------------------------------------------------- pronotum
function pronotumR(phi) {
  const s = Math.sin(phi), c = Math.cos(phi);
  const a = 0.72, b = s >= 0 ? 0.58 : 0.46, n = s >= 0 ? 2.3 : 3.4;
  return Math.pow(Math.pow(Math.abs(c / a), n) + Math.pow(Math.abs(s / b), n), -1 / n);
}
export const PRONOTUM = { R: pronotumR, bbox: { minx: -0.72, maxx: 0.72, minz: -0.46, maxz: 0.58 } };

export function buildShell(R, top, bottom, bbox, NR = 40, NT = 168) {
  const cols = NT + 1, rings = NR + 1;
  const pos = new Float32Array(2 * rings * cols * 3), uv = new Float32Array(2 * rings * cols * 2);
  let k = 0;
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i <= NR; i++) {
    const rho = Math.sin((i / NR) * Math.PI / 2);
    for (let j = 0; j <= NT; j++) {
      const phi = (j / NT) * Math.PI * 2;
      const Rb = R(phi);
      const x = rho * Rb * Math.cos(phi), z = rho * Rb * Math.sin(phi);
      const y = layer === 0 ? top(rho, phi, x, z) : bottom(rho, phi, x, z);
      pos[k * 3] = x; pos[k * 3 + 1] = y; pos[k * 3 + 2] = z;
      uv[k * 2] = (x - bbox.minx) / (bbox.maxx - bbox.minx);
      uv[k * 2 + 1] = (z - bbox.minz) / (bbox.maxz - bbox.minz);
      k++;
    }
  }
  const idx = [];
  for (let layer = 0; layer < 2; layer++) {
    const base = layer * rings * cols;
    for (let i = 0; i < NR; i++) for (let j = 0; j < NT; j++) {
      const a = base + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (layer === 0) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  const n = g.attributes.normal, v = new V3();
  for (let layer = 0; layer < 2; layer++) {
    const base = layer * rings * cols;
    for (let i = 0; i <= NR; i++) {
      const a = base + i * cols, b = a + NT;
      v.set(n.getX(a) + n.getX(b), n.getY(a) + n.getY(b), n.getZ(a) + n.getZ(b)).normalize();
      n.setXYZ(a, v.x, v.y, v.z); n.setXYZ(b, v.x, v.y, v.z);
    }
    v.set(0, layer === 0 ? 1 : -1, 0);
    for (let j = 0; j <= NT; j++) n.setXYZ(base + j, v.x, v.y, v.z);
  }
  return g;
}

// ------------------------------------------------------------ wing shapes
function dorsalY(x, z) {
  const pz = sstep(-2.8, -1.5, z);
  const front = 1 - 0.6 * sstep(-0.3, 0.5, z);
  return 0.06 + 0.17 * Math.exp(-(x * x) / 0.18) * (0.35 + 0.65 * pz) * front;
}

function buildTegmen(side) {
  const NS = 80, NT = 30, L = 3.05, zBase = 0.55, xc = 0.25;
  const lift = side > 0 ? 0.016 : 0.0;
  const hw = (s) => 0.44 * Math.pow(Math.sin(Math.PI * (0.1 + 0.9 * s)), 0.42);
  const pivot = new V3(side * xc, dorsalY(side * xc, zBase) + lift + 0.012, zBase);
  const cols = NT + 1, rows = NS + 1;
  const pos = new Float32Array(2 * rows * cols * 3), uv = new Float32Array(2 * rows * cols * 2);
  let k = 0;
  for (let layer = 0; layer < 2; layer++) for (let i = 0; i <= NS; i++) {
    const s = i / NS;
    for (let j = 0; j <= NT; j++) {
      const t = -1 + (2 * j) / NT;
      const lat = xc + 0.03 * s + t * hw(s);
      const x = side * lat, z = zBase - s * L;
      const y = dorsalY(x, z) + lift + 0.012 - 0.03 * Math.pow(Math.max(0, t), 3) * Math.sin(Math.PI * s);
      const thick = 0.022 * Math.sqrt(Math.max(0, 1 - t * t)) * Math.sqrt(Math.max(0, Math.sin(Math.PI * s)));
      const yy = layer === 0 ? y + thick * 0.5 : y - thick * 0.5;
      pos[k * 3] = x - pivot.x; pos[k * 3 + 1] = yy - pivot.y; pos[k * 3 + 2] = z - pivot.z;
      uv[k * 2] = (t + 1) / 2; uv[k * 2 + 1] = s;
      k++;
    }
  }
  const idx = [];
  for (let layer = 0; layer < 2; layer++) {
    const base = layer * rows * cols;
    const up = (layer === 0) === (side > 0);
    for (let i = 0; i < NS; i++) for (let j = 0; j < NT; j++) {
      const a = base + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (up) idx.push(a, b, c, b, d, c); else idx.push(a, c, b, b, c, d);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return { geometry: g, pivot };
}

class HindWing {
  constructor(side, material) {
    this.side = side;
    this.NU = 26; this.NV = 16;
    const { NU, NV } = this;
    const vc = (NU + 1) * (NV + 1);
    this.pos = new Float32Array(vc * 3);
    const uv = new Float32Array(vc * 2);
    for (let a = 0; a <= NU; a++) for (let b = 0; b <= NV; b++) {
      const k = a * (NV + 1) + b;
      uv[k * 2] = a / NU; uv[k * 2 + 1] = b / NV;
    }
    const idx = [];
    for (let a = 0; a < NU; a++) for (let b = 0; b < NV; b++) {
      const p = a * (NV + 1) + b, q = p + 1, r = p + (NV + 1), s = r + 1;
      idx.push(p, q, r, q, s, r);
    }
    const g = new THREE.BufferGeometry();
    this.attr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.attr);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new V3(), 10);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.castShadow = true;
    this.mesh.renderOrder = 2;
    this.mesh.frustumCulled = false;
    this.group = new THREE.Group();
    this.group.add(this.mesh);
    this.last = -1;
    this.update(0);
  }
  update(open) {
    if (Math.abs(open - this.last) < 1e-4) return;
    this.last = open;
    const { NU, NV, side } = this;
    const span = lerp(0.08, 1.75, open);
    for (let a = 0; a <= NU; a++) {
      const u = a / NU;
      const psi = u * span;
      const len = 2.25 * (0.74 + 0.26 * Math.sin(Math.PI * u)) * lerp(0.92, 1, open);
      const pleat = (a % 2 ? 1 : -1) * lerp(0.04, 0.006, open);
      for (let b = 0; b <= NV; b++) {
        const v = 0.04 + 0.96 * (b / NV);
        const r = len * v;
        const k = (a * (NV + 1) + b) * 3;
        this.pos[k] = side * Math.sin(psi) * r;
        this.pos[k + 1] = pleat * v - 0.06 * v * v * open;
        this.pos[k + 2] = -Math.cos(psi) * r;
      }
    }
    this.attr.needsUpdate = true;
    this.geometry.computeVertexNormals();
    this.mesh.visible = open > 0.02;
  }
}

// ----------------------------------------------------------- body pieces
function ellipsoid(rx, ryT, ryB, rz, wSeg, hSeg, deform, colorFn) {
  const g = new THREE.SphereGeometry(1, wSeg, hSeg);
  g.rotateX(-Math.PI / 2); // poles along z
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const out = deform(x, y, z);
    p.setXYZ(i, out[0] * rx, out[1] * (y >= 0 ? ryT : ryB), out[2] * rz);
  }
  g.computeVertexNormals();
  smoothSeams(g);
  if (colorFn) colorize(g, colorFn);
  return g;
}

function buildAbdomen() {
  const nSeg = 8;
  const cT = col('#2f1309'), cT2 = col('#4a210f'), cS = col('#6e3519'), cM = col('#a8703f');
  return ellipsoid(0.58, 0.16, 0.13, 1.35, 96, 72, (x, y, z) => {
    const along = (1 - z) / 2; // 0 front .. 1 tail  (z=-1 is tail after rotation)
    const s = along * nSeg;
    const f = s - Math.floor(s);
    const step = 0.935 + 0.065 * Math.pow(f, 0.55);
    const taper = 1 - 0.18 * sstep(0.75, 1.0, along);
    return [x * step * taper, y * step * (y < 0 ? 0.85 : 1), z];
  }, (c, x, y, z) => {
    const along = (1 - z / 1.35) / 2;
    const s = along * nSeg, f = s - Math.floor(s);
    const dorsal = sstep(-0.05, 0.08, y);
    c.copy(cS).lerp(cT, dorsal);
    if (dorsal > 0.5) c.lerp(cT2, 0.35 * sstep(0.2, 0.55, Math.abs(x) / 0.58));
    c.lerp(cM, (1 - sstep(0.0, 0.14, f)) * 0.55);
  });
}

function buildThorax() {
  const cT = col('#2a1108'), cS = col('#7a3f1c');
  return ellipsoid(0.46, 0.13, 0.13, 0.62, 64, 48, (x, y, z) => [x, y, z], (c, x, y) => {
    c.copy(cS).lerp(cT, sstep(-0.04, 0.06, y));
  });
}

function buildHead() {
  const g = new THREE.SphereGeometry(1, 56, 44);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const low = Math.max(0, -y);
    x *= 0.3 * (1 - 0.3 * low);
    z *= 0.18 * (1 - 0.15 * low) * (z > 0 ? 0.88 : 1);
    y *= 0.19;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  smoothSeams(g);
  const top = col('#1e0c06'), face = col('#4a210e'), clyp = col('#6e3818'), band = col('#160804');
  colorize(g, (c, x, y, z) => {
    c.copy(face).lerp(top, sstep(0.0, 0.12, y) * 0.9 + sstep(0.0, -0.1, z) * 0.5);
    c.lerp(clyp, sstep(-0.05, -0.13, y) * sstep(0.02, 0.12, z) * 0.7);
    c.lerp(band, Math.exp(-((y - 0.04) ** 2) / 0.002) * sstep(0.0, 0.1, z) * 0.6);
  });
  return g;
}

function headPoint(d) {
  const low = Math.max(0, -d.y);
  return new V3(
    d.x * 0.3 * (1 - 0.3 * low),
    d.y * 0.19,
    d.z * 0.18 * (1 - 0.15 * low) * (d.z > 0 ? 0.88 : 1),
  );
}

// compound eye as a kidney-shaped patch that hugs the head surface
function buildEye(side) {
  const d0 = new V3(side * 0.82, 0.32, 0.48).normalize();
  const a = new V3(0, 1, 0).addScaledVector(d0, -d0.y).normalize();   // up along surface
  const b = new V3().crossVectors(a, d0).multiplyScalar(side);          // toward the face
  const NR = 14, NA = 48;
  const pos = [], uv = [], idx = [];
  const tmp = new V3();
  for (let i = 0; i <= NR; i++) {
    const rho = i / NR;
    for (let j = 0; j <= NA; j++) {
      const ang = (j / NA) * Math.PI * 2;
      const t1 = 0.62 * rho * Math.sin(ang);
      const t2 = 0.27 * rho * Math.cos(ang) + 0.55 * t1 * t1 - 0.06;
      tmp.copy(d0).addScaledVector(a, t1).addScaledVector(b, t2).normalize();
      const P = headPoint(tmp);
      const bulge = 1.0 + 0.004 + 0.07 * Math.sqrt(Math.max(0, 1 - rho * rho));
      P.multiplyScalar(bulge);
      pos.push(P.x, P.y, P.z);
      uv.push(t2 * 3 + 0.5, t1 * 3 + 0.5);
    }
  }
  const cols = NA + 1;
  for (let i = 0; i < NR; i++) for (let j = 0; j < NA; j++) {
    const p0 = i * cols + j, p1 = p0 + 1, p2 = p0 + cols, p3 = p2 + 1;
    if (side > 0) idx.push(p0, p1, p2, p1, p3, p2); else idx.push(p0, p2, p1, p1, p2, p3);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // make sure normals face outward
  const n = g.attributes.normal, p = g.attributes.position;
  let dot = 0;
  for (let i = 0; i < n.count; i++) dot += n.getX(i) * p.getX(i) + n.getY(i) * p.getY(i) + n.getZ(i) * p.getZ(i);
  if (dot < 0) { const ix = g.index.array; for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; } g.computeVertexNormals(); }
  smoothSeams(g);
  return g;
}

function buildMandible(side) {
  const parts = [];
  const cone = new THREE.ConeGeometry(0.045, 0.14, 12, 6);
  cone.rotateX(Math.PI); // tip -> -Y
  cone.translate(0, -0.07, 0);
  cone.scale(1, 1, 0.6);
  const p = cone.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i);
    p.setX(i, p.getX(i) - side * 2.2 * y * y);
  }
  cone.computeVertexNormals();
  parts.push(cone);
  for (let t = 0; t < 3; t++) {
    const tooth = new THREE.ConeGeometry(0.012, 0.035, 5);
    tooth.rotateZ(side * Math.PI / 2);
    const yy = -0.05 - t * 0.028;
    tooth.translate(-side * (0.02 + 2.2 * yy * yy) - side * 0.012, yy, 0);
    parts.push(tooth);
  }
  const g = mergeGeometries(parts.map((q) => { q.deleteAttribute('uv'); return q; }));
  const dark = col('#140703'), base = col('#3a170a');
  colorize(g, (c, x, y) => c.copy(base).lerp(dark, sstep(-0.02, -0.1, y)));
  return g;
}

// ------------------------------------------------------------- leg parts
function segGeom({ len, r0, r1, flat = 0.8, bulge = 0, c0, c1, joint, spineCol, spines = [], knob = true }) {
  const parts = [];
  const cyl = new THREE.CylinderGeometry(1, 1, len, 14, 12, true);
  cyl.translate(0, len / 2, 0);
  const p = cyl.attributes.position, n = cyl.attributes.normal;
  const R = (f) => lerp(r0, r1, f) * (1 + bulge * Math.sin(Math.PI * f));
  for (let i = 0; i < p.count; i++) {
    const f = p.getY(i) / len;
    const r = R(f);
    p.setX(i, p.getX(i) * r * flat);
    p.setZ(i, p.getZ(i) * r);
    const nx = n.getX(i) / flat, nz = n.getZ(i), l = Math.hypot(nx, nz) || 1;
    n.setXYZ(i, nx / l, 0, nz / l);
  }
  colorize(cyl, (c, x, y) => {
    const f = y / len;
    c.copy(c0).lerp(c1, f);
    c.lerp(joint, (1 - sstep(0.0, 0.1, f)) * 0.6 + sstep(0.9, 1.0, f) * 0.5);
  });
  parts.push(cyl);
  if (knob) {
    const s = new THREE.SphereGeometry(1, 14, 10);
    s.scale(r0 * flat * 1.04, r0 * 1.04, r0 * 1.04);
    colorize(s, (c) => c.copy(joint).lerp(c0, 0.35));
    parts.push(s);
  }
  const e = new THREE.SphereGeometry(1, 12, 8);
  e.scale(r1 * flat, r1 * 0.9, r1);
  e.translate(0, len, 0);
  colorize(e, (c) => c.copy(joint));
  parts.push(e);
  const q = new THREE.Quaternion();
  for (const sp of spines) {
    const cone = new THREE.ConeGeometry(sp.r, sp.l, 6, 2);
    cone.translate(0, sp.l / 2, 0);
    const radial = new V3(Math.cos(sp.ang) * flat, 0, Math.sin(sp.ang)).normalize();
    const dir = radial.clone().multiplyScalar(Math.cos(sp.tilt)).add(new V3(0, Math.sin(sp.tilt), 0)).normalize();
    q.setFromUnitVectors(UP, dir);
    cone.applyQuaternion(q);
    const rr = R(sp.f) * 0.85;
    cone.translate(Math.cos(sp.ang) * rr * flat, sp.f * len, Math.sin(sp.ang) * rr);
    colorize(cone, (c, x, y) => c.copy(spineCol));
    parts.push(cone);
  }
  return mergeGeometries(parts);
}

function clawGeom() {
  const parts = [];
  for (const s of [-1, 1]) {
    const c = new THREE.ConeGeometry(0.011, 0.075, 6, 5);
    c.translate(0, 0.0375, 0);
    const p = c.attributes.position;
    for (let i = 0; i < p.count; i++) { const y = p.getY(i); p.setZ(i, p.getZ(i) - 4.5 * y * y); }
    c.computeVertexNormals();
    c.rotateY(s * 0.45);
    c.rotateX(0.2);
    colorize(c, (cc) => cc.set('#120603'));
    parts.push(c);
  }
  // arolium pad
  const pad = new THREE.SphereGeometry(0.018, 10, 8);
  pad.scale(1, 0.7, 1.2);
  pad.translate(0, 0.005, -0.01);
  colorize(pad, (cc) => cc.set('#b0794a'));
  parts.push(pad);
  return mergeGeometries(parts);
}

// ================================================================ Roach
export class Roach {
  constructor(T) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = BODY_H;
    this.root.add(this.body);
    this.extras = new THREE.Group(); // world-space tubes
    this.speed = 0; this.yawRate = 0; this.wing = 0; this.wingTarget = 0;
    this.flight = null; this.flapPhase = 0; this.flapAmp = 0; this.airborne = 0;
    this.walking = false; this.alarm = 0;
    this.shiver = 0;          // 0..1: trembling all over (set from outside: a roach on your face)
    this.time = 0;

    // materials
    const chitin = (o) => new THREE.MeshPhysicalMaterial(Object.assign({
      roughness: 0.4, metalness: 0, clearcoat: 1, clearcoatRoughness: 0.18,
      normalMap: T.chitin, normalScale: new THREE.Vector2(0.35, 0.35), vertexColors: true,
    }, o));
    this.mats = {
      pronotum: new THREE.MeshPhysicalMaterial({
        map: T.pronotum.map, roughnessMap: T.pronotum.roughnessMap, normalMap: T.pronotum.normalMap,
        normalScale: new THREE.Vector2(0.5, 0.5), roughness: 1, clearcoat: 1, clearcoatRoughness: 0.08,
        sheen: 0.25, sheenColor: new THREE.Color('#6a3a1a'), sheenRoughness: 0.5,
      }),
      wing: new THREE.MeshPhysicalMaterial({
        map: T.wing.map, roughnessMap: T.wing.roughnessMap, normalMap: T.wing.normalMap,
        normalScale: new THREE.Vector2(0.7, 0.7), roughness: 1, clearcoat: 1, clearcoatRoughness: 0.12,
        sheen: 0.3, sheenColor: new THREE.Color('#7a3a14'), sheenRoughness: 0.45, side: THREE.DoubleSide,
      }),
      body: chitin({ roughness: 0.45, clearcoatRoughness: 0.18, normalScale: new THREE.Vector2(0.6, 0.6) }),
      leg: chitin({ roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.22 }),
      eye: new THREE.MeshPhysicalMaterial({
        color: '#1a0d08', roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.06,
        normalMap: T.eye, normalScale: new THREE.Vector2(0.35, 0.35),
        iridescence: 0.22, iridescenceIOR: 1.5, iridescenceThicknessRange: [250, 420],
      }),
      ring: new THREE.MeshPhysicalMaterial({
        map: T.rings.map, normalMap: T.rings.normalMap, roughness: 0.42, clearcoat: 0.7, clearcoatRoughness: 0.25,
      }),
      hind: new THREE.MeshPhysicalMaterial({
        map: T.hind, transparent: true, side: THREE.DoubleSide, roughness: 0.3, depthWrite: false,
        clearcoat: 0.6, clearcoatRoughness: 0.1,
      }),
      shadow: new THREE.MeshBasicMaterial({ map: T.contact, transparent: true, depthWrite: false, opacity: 0.75, color: 0x000000 }),
    };
    this.mats.ring.map.repeat.set(1, 1);

    const shadowMesh = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

    // pronotum
    const top = (rho, phi, x, z) => {
      const dome = 0.13 * Math.pow(Math.max(0, 1 - rho * rho), 0.62);
      const flat = lerp(1, 0.55, sstep(0.6, 1, rho));
      const lip = 0.016 * sstep(0.86, 1, rho);
      const slope = -0.07 * Math.max(0, z / 0.58);
      return dome * flat + lip + slope;
    };
    const bottom = (rho, phi, x, z) => top(rho, phi, x, z) - 0.1 * Math.pow(Math.max(0, 1 - rho * rho), 0.8);
    const pron = shadowMesh(new THREE.Mesh(buildShell(pronotumR, top, bottom, PRONOTUM.bbox), this.mats.pronotum));
    pron.position.set(0, 0.14, 0.82);
    this.body.add(pron);
    this.pronotum = pron;

    // thorax, abdomen
    const thorax = shadowMesh(new THREE.Mesh(buildThorax(), this.mats.body));
    thorax.position.set(0, -0.03, 0.32);
    this.body.add(thorax);
    const abd = shadowMesh(new THREE.Mesh(buildAbdomen(), this.mats.body));
    abd.position.set(0, -0.02, -0.95);
    this.body.add(abd);
    this.abdomen = abd;

    // tegmina
    this.tegmina = [];
    for (const side of [-1, 1]) {
      const { geometry, pivot } = buildTegmen(side);
      const grp = new THREE.Group();
      grp.position.copy(pivot);
      grp.rotation.order = 'ZYX';
      const m = shadowMesh(new THREE.Mesh(geometry, this.mats.wing));
      grp.add(m);
      this.body.add(grp);
      const hw = new HindWing(side, this.mats.hind);
      hw.group.position.set(pivot.x * 0.8, pivot.y - 0.035, pivot.z - 0.05);
      hw.group.rotation.order = 'ZYX';
      this.body.add(hw.group);
      this.tegmina.push({ side, grp, hw });
    }

    // head
    this.head = new THREE.Group();
    this.head.position.set(0, -0.12, 1.33);
    this.head.rotation.x = 0.35;
    this.body.add(this.head);
    this.head.add(shadowMesh(new THREE.Mesh(buildHead(), this.mats.body)));
    for (const side of [-1, 1]) {
      const e = new THREE.Mesh(buildEye(side), this.mats.eye);
      e.castShadow = true;
      this.head.add(e);
    }
    const labrum = new THREE.Mesh(colorize(new THREE.SphereGeometry(1, 24, 16).scale(0.075, 0.045, 0.03), (c) => c.set('#5a2c12')), this.mats.body);
    labrum.position.set(0, -0.13, 0.135);
    this.head.add(labrum);
    this.mandibles = [];
    for (const side of [-1, 1]) {
      const m = new THREE.Mesh(buildMandible(side), this.mats.leg);
      m.position.set(side * 0.06, -0.14, 0.1);
      m.rotation.order = 'YXZ';
      this.head.add(m);
      this.mandibles.push({ side, m });
    }

    // contact shadow
    const cs = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 4.8), this.mats.shadow);
    cs.rotation.x = -Math.PI / 2;
    cs.position.set(0, 0.004, -0.3);
    cs.renderOrder = 1;
    this.root.add(cs);
    this.contact = cs;

    this.buildLegs();
    this.buildAppendages();
    this.behaviour = { mode: 'idle', timer: 1.5, target: new THREE.Vector2(), desired: 0, fleeCd: 0 };
  }

  // ------------------------------------------------------------- legs
  buildLegs() {
    const defs = [
      { hip: new V3(0.2, -0.08, 0.8), cox: new V3(0.5, -0.2, 0.4), Lc: 0.26, Lf: 0.6, Lt: 0.55, Lta: 0.42, home: new V3(1.22, 0.05, 1.7), r: [0.07, 0.055, 0.04, 0.024], sc: 0.8 },
      { hip: new V3(0.26, -0.1, 0.3), cox: new V3(0.6, -0.3, -0.3), Lc: 0.34, Lf: 0.78, Lt: 0.78, Lta: 0.55, home: new V3(2.06, 0.05, -0.05), r: [0.08, 0.062, 0.046, 0.026], sc: 1 },
      { hip: new V3(0.28, -0.1, -0.15), cox: new V3(0.55, -0.28, -0.6), Lc: 0.42, Lf: 0.98, Lt: 1.12, Lta: 0.75, home: new V3(1.68, 0.05, -2.12), r: [0.092, 0.07, 0.05, 0.028], sc: 1.2 },
    ];
    const C = {
      coxa: col('#5a2c14'), coxaD: col('#3e1c0c'),
      fem0: col('#42200e'), fem1: col('#331709'),
      tib0: col('#2e1408'), tib1: col('#3c1a0a'),
      tar: col('#4a2410'), tarD: col('#331709'),
      joint: col('#1c0a04'), spine: col('#140703'),
    };
    this.legs = [];
    const claw = clawGeom();
    for (let p = 0; p < 3; p++) for (const s of [-1, 1]) {
      const d = defs[p];
      const sc = d.sc;
      const femSpines = [], tibSpines = [];
      for (let k = 0; k < 5; k++) femSpines.push({ f: 0.3 + k * 0.14, ang: -Math.PI / 2 + (k % 2 ? 0.5 : -0.5), l: 0.05 * sc, r: 0.008 * sc, tilt: 0.75 });
      const angs = [-2.5, -0.7, 0.7, 2.5, -1.6, 1.6];
      const nT = 10 + p * 2;
      for (let k = 0; k < nT; k++) {
        const f = 0.12 + (k / (nT - 1)) * 0.8;
        tibSpines.push({ f, ang: angs[k % angs.length] + (k * 0.37) % 0.3, l: (0.07 + 0.07 * f) * sc, r: 0.009 * sc, tilt: 0.95 });
      }
      for (let k = 0; k < 4; k++) tibSpines.push({ f: 0.97, ang: -2.2 + k * 1.4, l: 0.11 * sc, r: 0.011 * sc, tilt: 1.1 });
      for (let k = 0; k < 18; k++) tibSpines.push({ f: 0.08 + ((k * 0.618) % 1) * 0.86, ang: k * 2.39, l: 0.035 * sc, r: 0.0035 * sc, tilt: 1.2 });
      for (let k = 0; k < 10; k++) femSpines.push({ f: 0.15 + ((k * 0.618) % 1) * 0.8, ang: k * 2.39, l: 0.028 * sc, r: 0.003 * sc, tilt: 1.25 });
      const leg = {
        p, side: s, group: (p + (s > 0 ? 1 : 0)) % 2,
        hip: d.hip.clone().multiply(new V3(s, 1, 1)),
        coxDir: d.cox.clone().multiply(new V3(s, 1, 1)).normalize(),
        Lc: d.Lc, Lf: d.Lf, Lt: d.Lt, Lta: d.Lta,
        home: d.home.clone().multiply(new V3(s, 1, 1)),
        foot: new V3(), from: new V3(), to: new V3(), stepping: false, t: 0,
      };
      const mk = (g, mat = this.mats.leg) => {
        const m = new THREE.Mesh(g, mat);
        m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true;
        this.root.add(m);
        return m;
      };
      leg.coxa = mk(segGeom({ len: d.Lc, r0: 0.085, r1: 0.06, flat: 0.5, bulge: 0.12, c0: C.coxa, c1: C.coxaD, joint: C.joint, spineCol: C.spine }));
      leg.femur = mk(segGeom({ len: d.Lf, r0: d.r[0] * 0.8, r1: d.r[1], flat: 0.72, bulge: 0.18, c0: C.fem0, c1: C.fem1, joint: C.joint, spineCol: C.spine, spines: femSpines }));
      leg.tibia = mk(segGeom({ len: d.Lt, r0: d.r[2] * 0.85, r1: d.r[2] * 1.05, flat: 0.85, c0: C.tib0, c1: C.tib1, joint: C.joint, spineCol: C.spine, spines: tibSpines }));
      const tl = [0.3, 0.18, 0.15, 0.12, 0.25];
      leg.tarsLen = tl.map((x) => x * d.Lta);
      leg.tarsi = leg.tarsLen.map((L, i) => mk(segGeom({ len: L, r0: d.r[3] * (1 - i * 0.08), r1: d.r[3] * (0.85 - i * 0.08), flat: 0.8, bulge: 0.1, c0: C.tar, c1: C.tarD, joint: C.joint, spineCol: C.spine, spines: i === 0 ? [{ f: 0.95, ang: -1.6, l: 0.04, r: 0.006, tilt: 1 }] : [] })));
      leg.claw = mk(claw);
      leg.tarsPts = [new V3(), new V3(), new V3(), new V3(), new V3(), new V3()];
      this.legs.push(leg);
    }
  }

  buildAppendages() {
    const T = this.mats.ring;
    // antennae
    this.antennae = [];
    for (const side of [-1, 1]) {
      const n = 64;
      const tube = new Tube(n, 7, T.clone());
      tube.mesh.material.map = T.map.clone(); tube.mesh.material.map.repeat.set(120, 1); tube.mesh.material.map.needsUpdate = true;
      tube.mesh.material.normalMap = T.normalMap.clone(); tube.mesh.material.normalMap.repeat.set(120, 1); tube.mesh.material.normalMap.needsUpdate = true;
      const P = Array.from({ length: n }, () => new V3());
      const R = Array.from({ length: n }, (_, i) => { const k = i / (n - 1); return lerp(0.027, 0.006, Math.pow(k, 0.55)) * (i < 2 ? 1.5 : 1); });
      this.extras.add(tube.mesh);
      this.antennae.push({ side, tube, P, R, n, len: 4.6, socket: new V3(side * 0.12, 0.06, 0.16), ph: side > 0 ? 0.7 : 2.9 });
    }
    // cerci
    this.cerci = [];
    for (const side of [-1, 1]) {
      const n = 12;
      const tube = new Tube(n, 7, T.clone());
      tube.mesh.material.map = T.map.clone(); tube.mesh.material.map.repeat.set(11, 1); tube.mesh.material.map.needsUpdate = true;
      tube.mesh.material.normalMap = T.normalMap.clone(); tube.mesh.material.normalMap.repeat.set(11, 1); tube.mesh.material.normalMap.needsUpdate = true;
      const P = Array.from({ length: n }, () => new V3());
      const R = Array.from({ length: n }, (_, i) => lerp(0.045, 0.01, i / (n - 1)));
      this.extras.add(tube.mesh);
      this.cerci.push({ side, tube, P, R, n, len: 0.62, base: new V3(side * 0.1, 0.0, -2.22), ph: side > 0 ? 1.3 : 0.2 });
    }
    // palps
    this.palps = [];
    const palpDefs = [
      { base: (s) => new V3(s * 0.12, -0.12, 0.08), lens: [0.07, 0.08, 0.15, 0.13, 0.13], r: 0.022, pitch: 0.55, yaw: 0.3, bends: [0.5, -0.9, 0.7, 0.35, 0.2] },
      { base: (s) => new V3(s * 0.04, -0.16, 0.09), lens: [0.05, 0.06, 0.08], r: 0.018, pitch: 0.9, yaw: 0.15, bends: [0.3, -0.5, 0.4] },
    ];
    for (const def of palpDefs) for (const side of [-1, 1]) {
      const n = 1 + def.lens.length * 2;
      const tube = new Tube(n, 7, this.mats.leg.clone());
      tube.mesh.material.vertexColors = false;
      tube.mesh.material.color = new THREE.Color('#4a2210');
      const P = Array.from({ length: n }, () => new V3());
      const R = Array.from({ length: n }, (_, i) => {
        const seg = Math.max(0, Math.ceil(i / 2) - 1);
        const mid = i % 2 === 1;
        return def.r * (1 - seg * 0.07) * (mid ? 1.2 : 0.85);
      });
      this.extras.add(tube.mesh);
      this.palps.push({ side, def, tube, P, R, ph: Math.random() * 6 });
    }
  }

  addTo(scene) {
    scene.add(this.root);
    scene.add(this.extras);
    this.root.updateMatrixWorld(true);
    for (const leg of this.legs) leg.foot.copy(leg.home).applyMatrix4(this.root.matrixWorld);
  }

  get position() { return this.root.position; }

  // ------------------------------------------------------------ behaviour
  pickTarget(minD, maxD, spread) {
    const b = this.behaviour;
    const yaw = this.root.rotation.y + (Math.random() - 0.5) * spread;
    const d = minD + Math.random() * (maxD - minD);
    let x = this.root.position.x + Math.sin(yaw) * d, z = this.root.position.z + Math.cos(yaw) * d;
    const R = 6.5;
    const l = Math.hypot(x, z);
    if (l > R) { x = (x / l) * R * 0.6; z = (z / l) * R * 0.6; }
    b.target.set(x, z);
  }

  think(dt, light) {
    const b = this.behaviour;
    b.fleeCd -= dt;
    b.timer -= dt;
    // light check
    let lit = false;
    if (light && light.on) {
      const c = new V3(this.root.position.x, 0.35, this.root.position.z);
      const v = c.sub(light.pos);
      const dist = v.length();
      const cosA = v.dot(light.dir) / dist;
      lit = cosA > Math.cos(0.15) && dist < 20;
    }
    this.lit = lit;
    if (!this.walking) {
      b.desired = 0;
      if (b.mode !== 'idle') { b.mode = 'idle'; }
      return;
    }
    if (lit && b.fleeCd <= 0 && b.mode !== 'flee') {
      b.mode = 'flee'; b.timer = 0.8 + Math.random() * 0.4; b.desired = 7.5; b.fleeCd = 1.6;
      const away = new THREE.Vector2(this.root.position.x - (light.pos.x + light.dir.x * 6), this.root.position.z - (light.pos.z + light.dir.z * 6));
      if (away.lengthSq() < 0.01) away.set(Math.random() - 0.5, Math.random() - 0.5);
      away.normalize().rotateAround(new THREE.Vector2(), (Math.random() - 0.5) * 0.8);
      let tx = this.root.position.x + away.x * 5, tz = this.root.position.z + away.y * 5;
      const l = Math.hypot(tx, tz);
      if (l > 6.5) { tx *= 6.5 / l; tz *= 6.5 / l; }
      b.target.set(tx, tz);
      this.onFlee && this.onFlee();
      return;
    }
    const dx = b.target.x - this.root.position.x, dz = b.target.y - this.root.position.z;
    const reached = Math.hypot(dx, dz) < 0.5;
    if (b.timer <= 0 || (reached && b.mode !== 'pause' && b.mode !== 'idle')) {
      if (b.mode === 'dart' || b.mode === 'flee' || b.mode === 'creep') {
        b.mode = 'pause'; b.desired = 0; b.timer = 0.3 + Math.random() * 1.6;
      } else {
        const r = Math.random();
        if (r < 0.72) { b.mode = 'dart'; b.desired = 3.2 + Math.random() * 3.2; b.timer = 0.3 + Math.random() * 0.7; this.pickTarget(2.5, 5, 2.4); }
        else { b.mode = 'creep'; b.desired = 0.5 + Math.random() * 0.5; b.timer = 1 + Math.random() * 1.5; this.pickTarget(1, 2, 1.6); }
      }
    }
  }

  // -------------------------------------------------------------- flight
  fly(tx, tz) {
    if (this.flight) return false;
    const from = new V3(this.root.position.x, 0, this.root.position.z);
    const to = new V3(tx, 0, tz);
    const l = Math.hypot(to.x, to.z);
    if (l > 7) to.multiplyScalar(7 / l);
    this.flight = { t: 0, takeoff: 0.3, air: 1.35, h: 1.25, from, to, yaw: Math.atan2(to.x - from.x, to.z - from.z), landed: false };
    this.wingTarget = 1;
    this.speed = 0;
    const b = this.behaviour;
    b.mode = 'pause'; b.timer = 3.5; b.desired = 0;
    return true;
  }

  updateFlight(dt) {
    const F = this.flight;
    F.t += dt;
    const u = clamp((F.t - F.takeoff) / F.air, 0, 1);
    const e = u * u * (3 - 2 * u);
    let dy = F.yaw - this.root.rotation.y;
    dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    this.root.rotation.y += dy * (1 - Math.exp(-dt * 12));
    this.root.position.x = lerp(F.from.x, F.to.x, e);
    this.root.position.z = lerp(F.from.z, F.to.z, e);
    this.root.position.y = F.landed ? 0 : F.h * Math.pow(Math.sin(Math.PI * u), 0.8);
    this.airborne = F.landed ? 0 : sstep(0.0, 0.1, u) * (1 - sstep(0.9, 1.0, u));
    const end = F.takeoff + F.air;
    this.flapAmp = sstep(0.1, 0.28, F.t) * (1 - sstep(end - 0.04, end + 0.16, F.t));
    if (!F.landed && u >= 1) {
      F.landed = true;
      this.root.position.y = 0;
      this.wingTarget = 0;
      for (const l of this.legs) { l.foot.y = 0.05; l.stepping = false; }
    }
    this.speed = 0;
    this.yawRate = 0;
    if (F.t > end + 0.9) this.flight = null;
  }

  // ------------------------------------------------------------- update
  update(dt, light) {
    this.time += dt;
    const t = this.time;
    const b = this.behaviour;
    if (this.flight) { this.lit = false; this.updateFlight(dt); } else { this.flapAmp = 0; this.airborne = 0; this.think(dt, light); }

    // steering
    const yaw = this.root.rotation.y;
    let desired = this.flight ? 0 : b.desired;
    if (desired > 0) {
      const dx = b.target.x - this.root.position.x, dz = b.target.y - this.root.position.z;
      const ty = Math.atan2(dx, dz);
      let dy = ty - yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const turnRate = 4 + this.speed * 1.6;
      const turn = clamp(dy, -turnRate * dt, turnRate * dt);
      this.root.rotation.y += turn;
      this.yawRate = lerp(this.yawRate, turn / Math.max(dt, 1e-3), 0.2);
      desired *= Math.max(0, Math.cos(dy));
    } else {
      this.yawRate = lerp(this.yawRate, 0, 0.2);
    }
    const acc = 40;
    this.speed += clamp(desired - this.speed, -acc * dt, acc * dt);
    const fy = this.root.rotation.y;
    const fwd = new V3(Math.sin(fy), 0, Math.cos(fy));
    this.root.position.addScaledVector(fwd, this.speed * dt);

    // wings
    const wr = this.flight ? 7 : (this.wingTarget > this.wing ? 5 : 3.5);
    this.wing += clamp(this.wingTarget - this.wing, -wr * dt, wr * dt);
    const w = this.wing;
    const wl = sstep(0, 0.6, w), wh = sstep(0.35, 1, w);
    this.flapPhase += dt * Math.PI * 2 * 13;
    // shivering: every so often the wings buzz half open in a burst
    const sh = this.shiver, burst = sh * sstep(0.55, 0.8, Math.sin(t * 2.3) * Math.sin(t * 0.9 + 1.3) + 0.35);
    const fa = this.flapAmp + 0.22 * burst, fs = Math.sin(this.flapPhase), fs2 = Math.sin(this.flapPhase - 0.7);
    for (const tg of this.tegmina) {
      const s = tg.side;
      // lift, splay, then beat about the body's long axis
      tg.grp.rotation.set(lerp(0.85, 0.45, fa) * wl, -s * lerp(0.62, 1.05, fa) * wl, s * (0.18 * wl + 0.42 * fa * fs));
      tg.hw.group.rotation.set(lerp(0.6 * wl + 0.15 * wh, 0.22, fa), -s * lerp(0.25 * wl, 0.08, fa), s * (0.1 * wh + 0.95 * fa * fs2));
      tg.hw.update(wh);
    }
    // alarm (lit, wings open)
    this.alarm = lerp(this.alarm, Math.max(this.lit ? 1 : 0, w * 0.6 * (1 - this.airborne)), 1 - Math.exp(-dt * 6));

    // body pose
    const run = clamp(this.speed / 5, 0, 1);
    let bob = 0;
    for (const leg of this.legs) if (leg.stepping) bob = Math.max(bob, Math.sin(Math.PI * leg.t));
    const air = this.airborne;
    this.body.position.y = BODY_H + 0.012 * bob * run + 0.06 * w * (1 - air) + 0.004 * Math.sin(t * 2.1) + 0.03 * fa * Math.sin(this.flapPhase + 1.2);
    this.body.rotation.x = -0.05 * run - 0.08 * w * (1 - air) - 0.32 * air + 0.01 * Math.sin(t * 1.3);
    // contact shadow stays on the floor and fades with height
    const hgt = this.root.position.y, k = clamp(hgt / 1.6, 0, 1);
    this.contact.position.y = -hgt + 0.004;
    this.contact.scale.setScalar(1 + 0.6 * k);
    this.contact.material.opacity = 0.75 * (1 - 0.75 * k);
    this.body.rotation.z = clamp(-this.yawRate * 0.015, -0.07, 0.07);
    this.abdomen.scale.set(1, 1 + 0.03 * Math.sin(t * 2.4), 1);
    if (sh > 0) {
      // the whole body buzzes on its legs (a beat of two fast wobbles, so it never settles into a rhythm),
      // the belly pumps, and harder in the bursts
      const k = sh * (0.7 + 0.6 * burst);
      this.body.position.x = 0.09 * k * Math.sin(t * 61) * Math.sin(t * 17 + 0.6);
      this.body.position.z = 0.1 * k * Math.sin(t * 53 + 1.1) * Math.sin(t * 13);
      this.body.position.y += 0.04 * k * Math.sin(t * 73 + 2.0);
      this.body.rotation.y = 0.12 * k * Math.sin(t * 47) * Math.sin(t * 11 + 2.1);
      this.body.rotation.z += 0.14 * k * Math.sin(t * 67 + 0.3);
      this.body.rotation.x += 0.07 * k * Math.sin(t * 43 + 1.7);
      // and the claws scrabble where they grip
      this.legs.forEach((l, i) => { if (!l.stepping) { l.foot.x += 0.04 * sh * 31 * Math.cos(t * 31 + i * 2.1) * dt; l.foot.z += 0.04 * sh * 27 * Math.cos(t * 27 + i * 1.3) * dt; } });
      const pump = Math.sin(t * 9.5);
      this.abdomen.scale.set(1 + 0.05 * sh * pump, 1 + 0.03 * Math.sin(t * 2.4) + 0.12 * sh * pump, 1 - 0.04 * sh * pump);
    } else { this.body.position.x = 0; this.body.position.z = 0; this.body.rotation.y = 0; }
    this.head.rotation.set(0.35 - 0.12 * this.alarm + 0.04 * Math.sin(t * 0.7), clamp(this.yawRate * 0.04, -0.25, 0.25) + 0.06 * Math.sin(t * 0.45), 0);
    const chew = Math.max(0, Math.sin(t * 0.6)) > 0.7 ? 1 : 0;
    for (const md of this.mandibles) md.m.rotation.set(0.15, -md.side * (0.08 + 0.2 * Math.max(chew, sh) * Math.max(0, Math.sin(t * (9 + 7 * sh)))), 0);

    this.root.updateMatrix();
    this.root.updateMatrixWorld(true);
    this.body.updateMatrix();

    this.updateGait(dt, fwd);
    this.updateLegs();
    this.updateTubes(t, dt);
  }

  updateGait(dt, fwd) {
    if (this.flight && !this.flight.landed) {
      // legs let go of the floor and dangle under the body
      const tuck = new V3();
      const blend = 1 - Math.exp(-dt * (this.airborne > 0 ? 14 : 4));
      this.legs.forEach((l, i) => {
        tuck.set(l.home.x * 0.55, 0.06 + 0.12 * this.airborne + 0.03 * Math.sin(this.time * 8 + i * 1.7), l.home.z * 0.62);
        tuck.applyMatrix4(this.root.matrixWorld);
        l.foot.lerp(tuck, blend);
        l.stepping = false;
      });
      return;
    }
    const sp = this.speed;
    const stepDur = clamp(0.22 - sp * 0.023, 0.065, 0.22);
    const thr = sp < 0.08 ? 0.12 : 0.16 + sp * 0.1;
    const lift = clamp(0.1 + sp * 0.025, 0.1, 0.24);
    const vel = fwd.clone().multiplyScalar(sp);
    const homeW = new V3();
    const busy = [false, false];
    for (const l of this.legs) if (l.stepping) busy[l.group] = true;
    const want = [false, false];
    const errs = [];
    for (const l of this.legs) {
      homeW.copy(l.home).applyMatrix4(this.root.matrixWorld);
      const e = Math.hypot(l.foot.x - homeW.x, l.foot.z - homeW.z);
      errs.push(e);
      if (!l.stepping && e > thr) want[l.group] = true;
    }
    // choose group: only one group may swing at a time
    for (const g of [0, 1]) {
      const other = 1 - g;
      if (want[g] && !busy[other] && !busy[g]) {
        if (want[other] && this.lastGroup === g) continue; // alternate
        this.lastGroup = g;
        this.legs.forEach((l, i) => {
          if (l.group !== g) return;
          if (errs[i] < thr * 0.25 && sp < 0.08) return;
          homeW.copy(l.home).applyMatrix4(this.root.matrixWorld);
          l.from.copy(l.foot);
          l.to.copy(homeW).addScaledVector(vel, stepDur * 1.0);
          if (sp > 0.08) l.to.addScaledVector(fwd, thr * 0.85);
          l.to.y = 0.05;
          l.stepping = true; l.t = 0; l.dur = stepDur * (0.9 + Math.random() * 0.2); l.lift = lift;
        });
        busy[g] = true;
      }
    }
    for (const l of this.legs) {
      if (!l.stepping) continue;
      l.t = Math.min(1, l.t + dt / l.dur);
      const e = l.t * l.t * (3 - 2 * l.t);
      l.foot.lerpVectors(l.from, l.to, e);
      l.foot.y = 0.05 + l.lift * Math.sin(Math.PI * l.t);
      if (l.t >= 1) { l.stepping = false; l.foot.copy(l.to); }
    }
  }

  updateLegs() {
    const root = this.root;
    const bodyM = this.body.matrix;
    const hip = new V3(), cd = new V3(), C = new V3(), A = new V3(), K = new V3(), Aa = new V3(), h = new V3(), side = new V3();
    const upHint = new V3(0, 1, 0);
    for (const l of this.legs) {
      hip.copy(l.hip).applyMatrix4(bodyM);
      cd.copy(l.coxDir).transformDirection(bodyM);
      A.copy(l.foot);
      root.worldToLocal(A);
      // coxa swings a little toward the foot
      h.set(A.x - hip.x, 0, A.z - hip.z).normalize();
      cd.lerp(new V3(h.x * 0.8, cd.y, h.z * 0.8), 0.25).normalize();
      C.copy(hip).addScaledVector(cd, l.Lc);
      h.set(A.x - C.x, 0, A.z - C.z);
      const dx = h.length();
      h.divideScalar(dx || 1);
      const dy = A.y - C.y;
      let D = Math.hypot(dx, dy);
      D = clamp(D, Math.abs(l.Lf - l.Lt) + 0.05, (l.Lf + l.Lt) * 0.995);
      const alpha = Math.atan2(dy, dx);
      const gamma = Math.acos(clamp((l.Lf * l.Lf + D * D - l.Lt * l.Lt) / (2 * l.Lf * D), -1, 1));
      const th = alpha + gamma;
      K.copy(C).addScaledVector(h, l.Lf * Math.cos(th)); K.y += l.Lf * Math.sin(th);
      Aa.copy(C).addScaledVector(h, D * Math.cos(alpha)); Aa.y += D * Math.sin(alpha);
      side.set(l.side, 0, 0).transformDirection(bodyM);
      placeSeg(l.coxa, hip, C, side, l.Lc);
      placeSeg(l.femur, C, K, upHint, l.Lf);
      placeSeg(l.tibia, K, Aa, h, l.Lt);
      // tarsus arcs down to the floor and lies on it
      const raise = Aa.y - 0.05;
      let cum = 0;
      l.tarsPts[0].copy(Aa);
      const total = l.Lta;
      for (let i = 0; i < 5; i++) {
        cum += l.tarsLen[i];
        const f = cum / total;
        const P = l.tarsPts[i + 1];
        P.copy(Aa).addScaledVector(h, cum * 0.97);
        P.y = 0.018 + raise + (0.05 - 0.018) * (1 - sstep(0.0, 0.4, f)) + 0.012 * Math.sin(Math.PI * f);
      }
      for (let i = 0; i < 5; i++) placeSeg(l.tarsi[i], l.tarsPts[i], l.tarsPts[i + 1], upHint, l.tarsLen[i]);
      const end = l.tarsPts[5];
      const dir = new V3().subVectors(end, l.tarsPts[4]).normalize();
      placeSeg(l.claw, end, end.clone().add(dir), upHint, 1);
    }
  }

  updateTubes(t, dt) {
    const head = this.head;
    head.updateWorldMatrix(true, false);
    const qHead = new THREE.Quaternion();
    head.getWorldQuaternion(qHead);
    const q = new THREE.Quaternion(), qt = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), dir = new V3();
    const run = clamp(this.speed / 4, 0, 1), al = this.alarm;
    for (const a of this.antennae) {
      a.P[0].copy(a.socket);
      head.localToWorld(a.P[0]);
      const air = this.airborne;
      const yawB = lerp(a.side * (0.4 + 0.3 * Math.sin(t * 0.83 + a.ph) + 0.12 * Math.sin(t * 2.3 + a.ph * 3) + 0.25 * al) * (1 - 0.35 * run), a.side * (0.3 + 0.05 * Math.sin(t * 9 + a.ph)), air);
      const pitB = lerp(-0.55 + 0.16 * Math.sin(t * 1.13 + a.ph * 1.7) - 0.35 * al + 0.12 * run, -0.15, air);
      q.copy(qHead).multiply(qt.setFromEuler(e.set(pitB, yawB, 0)));
      const seg = a.len / (a.n - 1);
      for (let i = 1; i < a.n; i++) {
        const k = i / (a.n - 1);
        const bp = (0.04 * Math.pow(k, 0.7) + 0.03 * Math.sin(t * 1.9 - k * 5 + a.ph) * k) * (1 - 0.55 * al) * (1 - 0.75 * this.airborne);
        const by = a.side * 0.01 + 0.032 * Math.sin(t * 2.6 - k * 6.5 + a.ph * 2) * k + 0.03 * Math.sin(t * 7 + k * 9) * k * al + 0.05 * this.shiver * Math.sin(t * 29 + k * 11 + a.ph) * k;
        q.multiply(qt.setFromEuler(e.set(bp, by, 0)));
        dir.set(0, 0, 1).applyQuaternion(q);
        a.P[i].copy(a.P[i - 1]).addScaledVector(dir, seg);
        if (a.P[i].y < 0.012) a.P[i].y = 0.012;
      }
      a.tube.update(a.P, a.R);
    }
    // cerci
    const body = this.body;
    body.updateWorldMatrix(true, false);
    const qBody = new THREE.Quaternion();
    body.getWorldQuaternion(qBody);
    for (const c of this.cerci) {
      c.P[0].copy(c.base);
      body.localToWorld(c.P[0]);
      q.copy(qBody).multiply(qt.setFromEuler(e.set(-0.25 + 0.06 * Math.sin(t * 1.7 + c.ph), Math.PI + c.side * (-0.38 - 0.06 * Math.sin(t * 1.1 + c.ph)), 0)));
      const seg = c.len / (c.n - 1);
      for (let i = 1; i < c.n; i++) {
        q.multiply(qt.setFromEuler(e.set(0.03, -c.side * 0.01, 0)));
        dir.set(0, 0, 1).applyQuaternion(q);
        c.P[i].copy(c.P[i - 1]).addScaledVector(dir, seg);
      }
      c.tube.update(c.P, c.R);
    }
    // palps
    for (const p of this.palps) {
      const d = p.def;
      p.P[0].copy(d.base(p.side));
      head.localToWorld(p.P[0]);
      const tap = Math.max(0, Math.sin(t * 3.1 + p.ph)) * (1 - run);
      q.copy(qHead).multiply(qt.setFromEuler(e.set(d.pitch + 0.25 * tap, p.side * d.yaw, 0)));
      let k = 1;
      for (let s = 0; s < d.lens.length; s++) {
        const bend = d.bends[s] + (s === 1 ? -0.3 * tap : 0) + (s === 2 ? 0.35 * tap : 0);
        q.multiply(qt.setFromEuler(e.set(bend, p.side * 0.05, 0)));
        dir.set(0, 0, 1).applyQuaternion(q);
        for (let sub = 0; sub < 2; sub++) {
          p.P[k].copy(p.P[k - 1]).addScaledVector(dir, d.lens[s] / 2);
          if (p.P[k].y < 0.015) p.P[k].y = 0.015;
          k++;
        }
      }
      p.tube.update(p.P, p.R);
    }
  }
}
