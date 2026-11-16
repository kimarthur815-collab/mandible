// Prop geometry. Everything is added to a Batch keyed by (material, room) and merged,
// so a whole room of clutter costs a handful of draw calls.
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { fbm } from '../textures.js';

const V3 = THREE.Vector3;
const C = (hex) => new THREE.Color(hex);

export class Batch {
  constructor() { this.lists = new Map(); }
  add(mat, room, geo, color = 0xffffff, matrix = null) {
    let g = geo.index ? geo.toNonIndexed() : geo;
    if (matrix) g.applyMatrix4(matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    const n = g.attributes.position.count;
    if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(n * 2), 2));
    if (!g.attributes.color) {
      const c = color instanceof THREE.Color ? color : C(color), a = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) { a[i * 3] = c.r; a[i * 3 + 1] = c.g; a[i * 3 + 2] = c.b; }
      g.setAttribute('color', new THREE.BufferAttribute(a, 3));
    }
    for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv', 'color'].includes(k)) g.deleteAttribute(k);
    g.morphAttributes = {};
    g.clearGroups();
    const key = `${mat}|${room}`;
    if (!this.lists.has(key)) this.lists.set(key, []);
    this.lists.get(key).push(g);
  }
  build(materials, parent, shadowMats) {
    const meshes = [];
    for (const [key, list] of this.lists) {
      const [mat, room] = key.split('|');
      const geo = mergeGeometries(list, false);
      geo.computeBoundingSphere();
      const m = new THREE.Mesh(geo, materials[mat]);
      m.castShadow = shadowMats.has(mat); m.receiveShadow = true;
      m.userData.dressMat = mat; m.userData.room = room;
      parent.add(m); meshes.push(m);
    }
    return meshes;
  }
}

// ---------------------------------------------------------------- small helpers
export function mtx(x, y, z, ry = 0, rx = 0, rz = 0, s = 1) {
  return new THREE.Matrix4().compose(new V3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx, ry, rz, 'YXZ')), new V3(s, s, s));
}
// Every box and cylinder comes out a hair bigger than asked, by one of a few different amounts in
// turn, so two parts that were meant to sit flush never put a face in exactly the same plane:
// coplanar faces flicker through each other (z-fighting). 0.8 to 4.8 mm, invisible otherwise.
let grow = 0;
const nextGrow = () => 0.0008 + (grow++ % 6) * 0.0008;
// box with uvs in metres (scaled) so textures keep their size
export function box(w, h, d, uvScale = 1) {
  const e = nextGrow();
  const g = new THREE.BoxGeometry(w + 2 * e, h + 2 * e, d + 2 * e);
  const uv = g.attributes.uv, dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) { const i = f * 4 + k; uv.setXY(i, uv.getX(i) * dims[f][0] * uvScale, uv.getY(i) * dims[f][1] * uvScale); }
  return g;
}
export function cyl(r0, r1, h, seg = 16, open = false, uvScale = 1) {
  const g = new THREE.CylinderGeometry(r0, r1, h + 2 * nextGrow(), seg, 1, open);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 2 * Math.PI * r0 * uvScale, uv.getY(i) * h * uvScale);
  return g;
}
function remapUV(g, [u0, v0, du, dv], idx = null) {
  const uv = g.attributes.uv;
  const list = idx || [...Array(uv.count).keys()];
  for (const i of list) uv.setXY(i, u0 + uv.getX(i) * du, v0 + uv.getY(i) * dv);
}
const n3 = (x, y, z, s) => fbm(x + z * 1.37, y - z * 0.71, s, 3) - 0.5;
// bend a box-like geometry along its long axis (z), e.g. a sagging board
function sag(g, amount, axis = 'z', len = 1) {
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const t = (axis === 'z' ? p.getZ(i) : p.getX(i)) / (len / 2); p.setY(i, p.getY(i) - amount * (1 - t * t)); }
  g.computeVertexNormals();
}

// ---------------------------------------------------------------- cardboard box, dented and crushed
// cells: side cells and a top cell from the cardboard atlas
export function crumpledBox(B, room, atlas, w, h, d, m, R, opt = {}) {
  const g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
  const p = g.attributes.position, seed = Math.floor(R() * 999);
  const crush = opt.crush ?? R() * 0.35, lean = (R() - 0.5) * 0.12, bulge = 0.03 + R() * 0.05;
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const ex = Math.abs(x) / (w / 2), ey = Math.abs(y) / (h / 2), ez = Math.abs(z) / (d / 2);
    const inFace = (1 - Math.max(ex, ez) ** 6);       // 0 on the vertical edges
    const yt = (y / h) + 0.5;                          // 0 bottom .. 1 top
    // top sags in, sides bow out under the weight
    if (y > 0) y -= crush * h * 0.35 * (1 - ex * ex) * (1 - ez * ez);
    const bow = bulge * Math.sin(Math.PI * yt) * (opt.crush !== undefined ? 1.5 : 1);
    x *= 1 + bow * (1 - ez * ez) * 0.6; z *= 1 + bow * (1 - ex * ex) * 0.6;
    // dents and ripples
    const dn = n3(x * 5, y * 5, z * 5, seed) * 0.05 * Math.min(w, d) * inFace;
    x += Math.sign(x) * dn * (ex > 0.98 ? 1 : 0.3); z += Math.sign(z) * dn * (ez > 0.98 ? 1 : 0.3);
    if (ey > 0.98 && y > 0) y += n3(x * 7, z * 7, 3, seed) * 0.03 * h;
    x += lean * (yt) * h;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  // atlas cells per face (groups: +x,-x,+y,-y,+z,-z)
  const side = opt.cells || [0, 1, 2, 3, 6, 7];
  const ci = g.index.array;
  g.groups.forEach((gr, f) => {
    const cell = f === 2 ? (R() < 0.5 ? 4 : 5) : f === 3 ? 0 : side[Math.floor(R() * side.length)];
    const set = new Set(); for (let k = gr.start; k < gr.start + gr.count; k++) set.add(ci[k]);
    remapUV(g, atlas.cell(cell), [...set]);
  });
  const tint = C('#ffffff').multiplyScalar(0.8 + R() * 0.25);
  B.add('card', room, g, tint, m);
  // open flaps on some
  if (opt.open) {
    for (const [ax, sgn] of [['x', 1], ['x', -1], ['z', 1], ['z', -1]]) {
      if (R() < 0.25) continue;
      const len = ax === 'x' ? d : w, fl = (ax === 'x' ? w : d) * 0.5;
      const f = new THREE.BoxGeometry(ax === 'x' ? fl : len * 0.98, 0.005, ax === 'x' ? len * 0.98 : fl);
      remapUV(f, atlas.cell(0));
      const ang = (1.6 + R() * 0.9) * sgn;
      const pm = new THREE.Matrix4();
      if (ax === 'x') pm.makeTranslation(sgn * w / 2, h / 2 - crush * h * 0.1, 0).multiply(new THREE.Matrix4().makeRotationZ(ang)).multiply(new THREE.Matrix4().makeTranslation(-sgn * fl / 2, 0, 0));
      else pm.makeTranslation(0, h / 2 - crush * h * 0.1, sgn * d / 2).multiply(new THREE.Matrix4().makeRotationX(-ang)).multiply(new THREE.Matrix4().makeTranslation(0, 0, -sgn * fl / 2));
      f.applyMatrix4(pm);
      B.add('card', room, f, tint, m);
    }
  }
}

// a stack of boxes, sometimes toppled; returns its height
export function boxStack(B, room, atlas, x, y, z, ry, R, n = 3, sizeK = 1) {
  let top = y;
  for (let i = 0; i < n; i++) {
    const w = (0.45 + R() * 0.35) * sizeK, d = (0.35 + R() * 0.3) * sizeK, h = (0.3 + R() * 0.3) * sizeK;
    const ox = (R() - 0.5) * 0.12, oz = (R() - 0.5) * 0.12, r = ry + (R() - 0.5) * 0.4;
    crumpledBox(B, room, atlas, w, h, d, mtx(x + ox, top + h / 2, z + oz, r), R, { open: i === n - 1 && R() < 0.4, crush: i < n - 1 ? 0.15 + R() * 0.2 : undefined });
    top += h * 0.95;
  }
  return top;
}

// ---------------------------------------------------------------- wooden pallet (1.2 x 0.8)
export function pallet(B, room, m, R, broken = false) {
  const parts = [];
  const tint = C('#ffffff').multiplyScalar(0.7 + R() * 0.35);
  for (const z of [-0.35, -0.175, 0, 0.175, 0.35]) { if (broken && R() < 0.3) continue; const b = box(1.2, 0.022, 0.1); if (broken) sag(b, 0.02, 'x', 1.2); b.translate(0, 0.133, z); parts.push(b); }
  for (const x of [-0.55, 0, 0.55]) { const b = box(0.1, 0.022, 0.8); b.translate(x, 0.111, 0); parts.push(b); }
  for (const x of [-0.55, 0, 0.55]) for (const z of [-0.35, 0, 0.35]) { const b = box(0.1, 0.078, 0.12); b.translate(x, 0.061, z); parts.push(b); }
  for (const z of [-0.35, 0, 0.35]) { const b = box(1.2, 0.022, 0.1); b.translate(0, 0.011, z); parts.push(b); }
  for (const g of parts) B.add('wood', room, g, tint, m);
}

// ---------------------------------------------------------------- 200 L drum
export function drum(B, room, m, R, design = 0, opt = {}) {
  const r = 0.29, h = 0.88;
  const prof = [[0.27, 0], [0.29, 0.012], [0.29, 0.28], [0.3, 0.29], [0.29, 0.3], [0.29, 0.58], [0.3, 0.59], [0.29, 0.6], [0.29, 0.868], [0.27, 0.88], [0.265, 0.875]];
  const g = new THREE.LatheGeometry(prof.map(([a, b]) => new THREE.Vector2(a, b)), 18);
  const p = g.attributes.position, uv = g.attributes.uv, seed = Math.floor(R() * 999);
  const dents = opt.dent ? [[R() * 6.28, 0.2 + R() * 0.6, 0.02 + R() * 0.03], [R() * 6.28, 0.2 + R() * 0.6, 0.01 + R() * 0.02]] : [];
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i), a = Math.atan2(x, z);
    let k = 1;
    for (const [da, dy, dd] of dents) { const dA = Math.atan2(Math.sin(a - da), Math.cos(a - da)); k -= dd / r * Math.exp(-(dA * dA) / 0.08 - ((y / h - dy) ** 2) / 0.02); }
    p.setXYZ(i, x * k, y, z * k);
    uv.setXY(i, (design + (a / (Math.PI * 2) + 0.5)) * 0.25, y / h);
  }
  g.computeVertexNormals();
  const lid = new THREE.CircleGeometry(0.265, 14).rotateX(-Math.PI / 2).translate(0, h - 0.01, 0);
  const lu = lid.attributes.uv; for (let i = 0; i < lu.count; i++) lu.setXY(i, design * 0.25 + 0.2, 0.55);
  const bung = new THREE.CylinderGeometry(0.03, 0.03, 0.02, 10).translate(0.15, h, 0.05);
  const bu = bung.attributes.uv; for (let i = 0; i < bu.count; i++) bu.setXY(i, design * 0.25 + 0.2, 0.55);
  const tint = C('#ffffff').multiplyScalar(0.75 + R() * 0.3);
  for (const geo of [g, lid, bung]) B.add('drum', room, geo, tint, m);
}

// ---------------------------------------------------------------- sack of powder
export function sack(B, room, m, R) {
  const g = new THREE.SphereGeometry(1, 12, 7);
  const p = g.attributes.position, seed = Math.floor(R() * 999);
  for (let i = 0; i < p.count; i++) {
    let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    if (y < 0) y *= 0.25;                         // flat underneath
    const wr = n3(x * 3, y * 3, z * 3, seed) * 0.25;
    x *= 0.3 * (1 + wr); z *= 0.46 * (1 + wr * 0.5); y = (y + 0.25) * 0.12 * (1 + wr);
    z += Math.sin(x * 4) * 0.02;
    p.setXYZ(i, x, y, z);
  }
  g.computeVertexNormals();
  B.add('sack', room, g, C('#ffffff').multiplyScalar(0.8 + R() * 0.25), m);
}

// ---------------------------------------------------------------- pallet racking (frames, beams, wire decks) with its load
export function rack(B, room, atlas, x, z0, z1, R) {
  const len = z1 - z0, bays = Math.max(1, Math.round(len / 2.6)), span = len / bays;
  const BLUE = C('#2a5597'), ORANGE = C('#d0661c');
  const levels = [1.15, 2.2, 3.15];
  for (let b = 0; b <= bays; b++) {
    const z = z0 + b * span;
    for (const sx of [-1, 1]) {
      const u = box(0.09, 3.3, 0.07, 1.5); u.translate(x + sx * 0.55, 1.65, z);
      B.add('metal', room, u, BLUE);
      // footplate
      const fp = box(0.16, 0.012, 0.14); fp.translate(x + sx * 0.55, 0.006, z); B.add('metal', room, fp, BLUE);
    }
    // frame bracing across the depth: zig-zag struts
    for (let k = 0; k < 5; k++) {
      const y0 = 0.15 + k * 0.62, y1 = y0 + 0.62;
      const a = new V3(x - 0.52, k % 2 ? y1 : y0, z), c = new V3(x + 0.52, k % 2 ? y0 : y1, z);
      const L = a.distanceTo(c), s = box(0.025, L, 0.025); s.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(c.y - a.y, c.x - a.x) - Math.PI / 2)); s.translate((a.x + c.x) / 2, (a.y + c.y) / 2, z);
      B.add('metal', room, s, BLUE);
    }
  }
  for (let b = 0; b < bays; b++) {
    const zc = z0 + (b + 0.5) * span;
    for (const y of levels) {
      for (const sx of [-1, 1]) { const bm = box(0.05, 0.11, span - 0.07, 1.5); bm.translate(x + sx * 0.55, y, zc); B.add('metal', room, bm, ORANGE); }
      const deck = new THREE.PlaneGeometry(1.05, span - 0.1).rotateX(-Math.PI / 2);
      const du = deck.attributes.uv; for (let i = 0; i < du.count; i++) du.setXY(i, du.getX(i) * 6.5, du.getY(i) * (span - 0.1) * 6);
      deck.translate(x, y + 0.064, zc);                  // 4+ mm above the beams (boxes grow by up to 4.8 mm)
      B.add('mesh', room, deck, C('#9aa0a6'));
    }
    // the load on each level (ground, two decks, top)
    for (const y of [0, ...levels.map((v) => v + 0.074)]) {   // pallets stand 5+ mm above the deck, never in its plane
      const k = R();
      if (y > 3 && k < 0.35) continue;
      if (k < 0.45) { pallet(B, room, mtx(x, y, zc, Math.PI / 2 + (R() - 0.5) * 0.1), R, R() < 0.1); boxStack(B, room, atlas, x, y + 0.145, zc, Math.PI / 2, R, 1 + Math.floor(R() * (y > 3 ? 3 : 2)), 1.2); }
      else if (k < 0.62) { for (const dz of [-0.35, 0.35]) drum(B, room, mtx(x + (R() - 0.5) * 0.2, y, zc + dz, R() * 6), R, Math.floor(R() * 4), { dent: R() < 0.4 }); }
      else if (k < 0.8) { pallet(B, room, mtx(x, y, zc, Math.PI / 2), R); for (let s = 0; s < 3 + Math.floor(R() * 4); s++) sack(B, room, mtx(x + (R() - 0.5) * 0.3, y + 0.15 + Math.floor(s / 2) * 0.13, zc + ((s % 2) - 0.5) * 0.5, Math.PI / 2 + (R() - 0.5) * 0.4), R); }
      else if (k < 0.92) { for (let s = 0; s < 2; s++) crumpledBox(B, room, atlas, 0.5, 0.35, 0.4, mtx(x + (R() - 0.5) * 0.4, y + 0.18, zc + (s - 0.5) * 0.9, R() * 6, 0, (R() - 0.5) * 0.2), R, { open: true }); }
    }
  }
}

// ---------------------------------------------------------------- pipes, beams, fixtures
export function pipe(B, room, pts, r, color, R, opt = {}) {
  const path = new THREE.CurvePath();
  const P = pts.map((p) => new V3(...p));
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1];
    if (i > 0) { const prevDir = new V3().subVectors(a, P[i - 1]).normalize(); path.add(new THREE.QuadraticBezierCurve3(a.clone().addScaledVector(prevDir, -Math.min(0.25, r * 3)), a, a.clone().addScaledVector(new V3().subVectors(b, a).normalize(), Math.min(0.25, r * 3)))); }
    const s = i > 0 ? a.clone().addScaledVector(new V3().subVectors(b, a).normalize(), Math.min(0.25, r * 3)) : a;
    const e = i < P.length - 2 ? b.clone().addScaledVector(new V3().subVectors(b, a).normalize(), -Math.min(0.25, r * 3)) : b;
    path.add(new THREE.LineCurve3(s, e));
  }
  const L = path.getLength();
  const g = new THREE.TubeGeometry(path, Math.max(8, Math.ceil(L * 3)), r, 12, false);
  const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * L, uv.getY(i) * r * 6.28);
  B.add('metal', room, g, color);
  // flanges and wall brackets along the straight runs
  for (let i = 0; i < P.length - 1; i++) {
    const a = P[i], b = P[i + 1], len = a.distanceTo(b), dir = new V3().subVectors(b, a).normalize();
    const q = new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), dir);
    for (let t = 1.5; t < len - 0.5; t += 3) {
      const at = a.clone().addScaledVector(dir, t);
      const f = cyl(r * 1.6, r * 1.6, 0.05, 14); f.applyMatrix4(new THREE.Matrix4().compose(at, q, new V3(1, 1, 1))); B.add('metal', room, f, color);
      if (opt.wall) {
        const w = opt.wall; // { axis:'x'|'z', at: wall coordinate }
        const bp = at.clone();
        const dist = Math.abs((w.axis === 'x' ? bp.x : bp.z) - w.at);
        const br = box(w.axis === 'x' ? dist : 0.036, 0.05, w.axis === 'x' ? 0.036 : dist);   // thinner than the 5 cm flange
        br.translate(w.axis === 'x' ? (bp.x + w.at) / 2 : bp.x, bp.y - r - 0.02, w.axis === 'x' ? bp.z : (bp.z + w.at) / 2);
        B.add('metal', room, br, C('#555555'));
      }
    }
  }
  if (opt.valve) { const [vx, vy, vz] = opt.valve; valveWheel(B, room, new V3(vx, vy, vz), R); }
}
export function valveWheel(B, room, at, R, color = '#b8261c') {
  const t = new THREE.TorusGeometry(0.14, 0.015, 8, 24); t.rotateX(Math.PI / 2); t.translate(at.x, at.y, at.z);
  B.add('metal', room, t, C(color));
  for (let k = 0; k < 3; k++) { const s = box(0.26, 0.015, 0.015); s.rotateY((k / 3) * Math.PI); s.translate(at.x, at.y, at.z); B.add('metal', room, s, C(color)); }
  const stem = cyl(0.02, 0.02, 0.2, 8); stem.translate(at.x, at.y - 0.1, at.z); B.add('metal', room, stem, C('#777'));
}
// I-beam along x or z
export function ibeam(B, room, a, b, y, depth = 0.3, color = C('#4a4f55')) {
  const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz), ry = Math.atan2(dx, dz);
  const m = mtx((a[0] + b[0]) / 2, y, (a[1] + b[1]) / 2, ry);
  for (const [w, h, oy] of [[0.18, 0.02, depth / 2], [0.18, 0.02, -depth / 2], [0.015, depth, 0]]) { const g = box(w, h, L, 1); g.translate(0, oy, 0); B.add('metal', room, g, color, m); }
}
// a dead fluorescent fixture on chains; `drop` lets one end hang down
export function fluoro(B, room, x, y, z, ry, R, drop = 0) {
  const m = mtx(x, y, z, ry);
  const pivot = new THREE.Matrix4().makeTranslation(0.62, 0, 0).multiply(new THREE.Matrix4().makeRotationZ(drop)).multiply(new THREE.Matrix4().makeTranslation(-0.62, 0, 0));
  const hous = box(1.25, 0.07, 0.18); hous.applyMatrix4(pivot); B.add('metal', room, hous, C('#cfd2cf'), m);
  for (const s of [-1, 1]) { const tb = cyl(0.013, 0.013, 1.18, 8); tb.rotateZ(Math.PI / 2); tb.translate(0, -0.05, s * 0.045); tb.applyMatrix4(pivot); B.add('tube', room, tb, C('#ffffff'), m); }
  for (const cx of [-0.55, 0.55]) {
    const hang = cx > 0 ? 0.6 : 0.6 + Math.sin(drop) * 1.1;
    const ch = cyl(0.006, 0.006, hang, 4); ch.translate(cx, hang / 2 + 0.03, 0); B.add('metal', room, ch, C('#666'), m);
  }
}
// hanging cable (sagging)
export function cable(B, room, a, b, sagAmt, r = 0.012) {
  const A = new V3(...a), Bv = new V3(...b);
  const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, p = new V3().lerpVectors(A, Bv, t); p.y -= sagAmt * 4 * t * (1 - t); pts.push(p); }
  const g = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 24, r, 6, false);
  B.add('rubber', room, g, C('#151515'));
}
export function chainHook(B, room, x, top, len, z) {
  for (let y = top - 0.06; y > top - len; y -= 0.07) { const l = new THREE.TorusGeometry(0.025, 0.006, 4, 8); if (Math.round(y / 0.07) % 2) l.rotateY(Math.PI / 2); l.translate(x, y, z); B.add('metal', room, l, C('#5a5550')); }
  const hook = new THREE.TorusGeometry(0.07, 0.016, 6, 12, Math.PI * 1.4); hook.rotateZ(Math.PI * 0.8); hook.translate(x, top - len - 0.07, z);
  B.add('metal', room, hook, C('#6a5f52'));
}
// wall-mounted electrical panel with conduits running up
export function elecPanel(B, room, x, y, z, ry, ceil, R) {
  const m = mtx(x, y, z, ry);
  const body = box(0.6, 0.8, 0.2); body.translate(0, 0, 0.1); B.add('metal', room, body, C('#8f9693'), m);
  const door = box(0.58, 0.78, 0.02); door.translate(-0.29, 0, 0); door.applyMatrix4(new THREE.Matrix4().makeRotationY(-0.6 - R() * 0.6)); door.translate(0.29, 0, 0.21); B.add('metal', room, door, C('#8f9693'), m);
  for (const cx of [-0.18, 0, 0.18]) { const c = cyl(0.022, 0.022, ceil - y - 0.4, 8); c.translate(cx, 0.4 + (ceil - y - 0.4) / 2, 0.1); B.add('metal', room, c, C('#9a9a96'), m); }
  for (let i = 0; i < 6; i++) { const br = box(0.04, 0.1, 0.06); br.translate(-0.18 + i * 0.07, 0.15, 0.178); B.add('rubber', room, br, C('#222'), m); }
}
// wall vent grille
export function vent(B, room, x, y, z, ry, w = 0.8, h = 0.5) {
  const m = mtx(x, y, z, ry);
  const fr = [[w, 0.05, 0, h / 2], [w, 0.05, 0, -h / 2], [0.05, h, -w / 2, 0], [0.05, h, w / 2, 0]];
  for (const [bw, bh, ox, oy] of fr) { const b = box(bw, bh, 0.06); b.translate(ox, oy, 0.03); B.add('metal', room, b, C('#7d8280'), m); }
  for (let k = 0; k < 7; k++) { const s = box(w - 0.06, 0.012, 0.05); s.rotateX(0.7); s.translate(0, -h / 2 + (k + 0.5) * h / 7, 0.03); B.add('metal', room, s, C('#6f7472'), m); }
  const back = box(w, h, 0.01); back.translate(0, 0, 0.005); B.add('rubber', room, back, C('#050505'), m);
}
// steel door frame round an opening
export function doorFrame(B, room, cx, cz, axis, w, h) {
  const col = C('#3d4a44');
  const along = axis === 'z';      // opening runs along x (wall at z)
  // (the frame stands 12 mm into the opening, so its inner faces never share a plane with the wall's)
  const k = 0.012;
  for (const s of [-1, 1]) {
    const j = box(along ? 0.12 : 0.42, h - k, along ? 0.42 : 0.12);
    j.translate(along ? cx + s * (w / 2 + 0.06 - k) : cx, (h - k) / 2, along ? cz : cz + s * (w / 2 + 0.06 - k));
    B.add('metal', room, j, col);
  }
  // the header stands a little proud of the jambs all round, so its faces never share their planes
  const hd = box(along ? w + 0.256 - 2 * k : 0.44, 0.14, along ? 0.44 : w + 0.256 - 2 * k); hd.translate(cx, h + 0.07 - k, cz); B.add('metal', room, hd, col);
}
// fire extinguisher on a bracket
export function extinguisher(B, room, x, y, z, ry) {
  const m = mtx(x, y, z, ry);
  const body = cyl(0.08, 0.08, 0.5, 14); body.translate(0, 0.25, 0.1); B.add('metal', room, body, C('#c41f16'), m);
  const top = new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); top.translate(0, 0.5, 0.1); B.add('metal', room, top, C('#c41f16'), m);
  const valve = box(0.05, 0.08, 0.05); valve.translate(0, 0.6, 0.1); B.add('metal', room, valve, C('#222'), m);
  const hose = new THREE.TorusGeometry(0.1, 0.012, 6, 12, Math.PI); hose.rotateZ(-Math.PI / 2); hose.translate(0.06, 0.48, 0.1); B.add('rubber', room, hose, C('#111'), m);
}
// bollard: yellow post with black bands
export function bollard(B, room, x, z) {
  const p = cyl(0.08, 0.08, 1.0, 14); p.translate(x, 0.5, z); B.add('metal', room, p, C('#d8a91c'));
  for (const y of [0.3, 0.7]) { const b = cyl(0.083, 0.083, 0.1, 14); b.translate(x, y, z); B.add('metal', room, b, C('#151515')); }
  const cap = new THREE.SphereGeometry(0.08, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2); cap.translate(x, 1.0, z); B.add('metal', room, cap, C('#d8a91c'));
}

// ---------------------------------------------------------------- forklift (dead, forks down)
export function forklift(B, room, x, z, ry, R) {
  const m = mtx(x, 0, z, ry);
  const Y = C('#d39a17'), D = C('#1c1c1c'), G = C('#3a3a3a');
  const add = (g, c, mat = 'metal') => B.add(mat, room, g, c, m);
  let g = box(1.0, 0.55, 1.55); g.translate(0, 0.5, -0.1); add(g, Y);
  g = cyl(0.5, 0.5, 1.04, 20); g.rotateZ(Math.PI / 2); g.scale(1, 0.85, 0.55); g.translate(0, 0.62, -0.85); add(g, G);   // 2 cm proud of the body's sides
  g = box(0.5, 0.12, 0.45); g.translate(0, 0.84, -0.3); add(g, D, 'rubber');                                 // seat
  g = box(0.45, 0.5, 0.1); g.translate(0, 1.05, -0.5); add(g, D, 'rubber');
  g = new THREE.TorusGeometry(0.16, 0.02, 6, 16); g.rotateX(1.1); g.translate(0, 1.15, 0.25); add(g, D, 'rubber');
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) { g = box(0.05, 1.3, 0.05); g.translate(sx * 0.45, 1.4, sz > 0 ? 0.45 : -0.6); add(g, D); }
  for (let k = 0; k < 6; k++) { g = box(0.95, 0.03, 0.04); g.translate(0, 2.06, -0.55 + k * 0.2); add(g, D); }
  for (const sx of [-1, 1]) { g = box(0.08, 2.3, 0.1); g.translate(sx * 0.32, 1.15, 0.72); add(g, G); }
  g = box(0.8, 0.45, 0.05); g.translate(0, 0.3, 0.8); add(g, G);
  for (const sx of [-1, 1]) { g = box(0.1, 0.04, 1.1); g.translate(sx * 0.25, 0.03, 1.35); add(g, G); g = box(0.1, 0.45, 0.04); g.translate(sx * 0.25, 0.25, 0.82); add(g, G); }
  for (const [wx, wz, wr] of [[-0.5, 0.45, 0.3], [0.5, 0.45, 0.3], [-0.45, -0.75, 0.24], [0.45, -0.75, 0.24]]) { g = cyl(wr, wr, 0.22, 18); g.rotateZ(Math.PI / 2); g.translate(wx, wr, wz); add(g, C('#101010'), 'rubber'); g = cyl(wr * 0.5, wr * 0.5, 0.23, 12); g.rotateZ(Math.PI / 2); g.translate(wx, wr, wz); add(g, C('#8a8a80')); }
}

// ---------------------------------------------------------------- conveyor line along z
export function conveyor(B, room, atlas, x, z0, z1, R) {
  const L = z1 - z0, zc = (z0 + z1) / 2;
  const F = C('#5b6b4f'), K = C('#1a1a1a');
  for (const sx of [-1, 1]) { const s = box(0.06, 0.18, L, 1); s.translate(x + sx * 0.62, 0.85, zc); B.add('metal', room, s, F); }
  const belt = box(1.15, 0.04, L - 0.1, 1); belt.translate(x, 0.9, zc); B.add('rubber', room, belt, K);
  for (let z = z0 + 0.2; z < z1; z += 1.6) for (const sx of [-1, 1]) {
    const l = box(0.07, 0.78, 0.07); l.translate(x + sx * 0.58, 0.39, z); B.add('metal', room, l, F);
    const fp = box(0.14, 0.01, 0.14); fp.translate(x + sx * 0.58, 0.005, z); B.add('metal', room, fp, F);
  }
  // cross braces up under the belt, so there is room to crawl underneath
  for (let z = z0 + 0.8; z < z1; z += 3.2) { const xb = box(1.2, 0.05, 0.05); xb.translate(x, 0.73, z); B.add('metal', room, xb, F); }
  for (let z = z0 + 0.15; z < z1; z += 0.3) for (const sx of [-1, 1]) { const rc = cyl(0.035, 0.035, 0.02, 8); rc.rotateZ(Math.PI / 2); rc.translate(x + sx * 0.655, 0.86, z); B.add('metal', room, rc, C('#8b8b86')); }
  const motor = cyl(0.17, 0.17, 0.45, 14); motor.rotateZ(Math.PI / 2); motor.translate(x + 0.9, 0.62, z1 - 0.3); B.add('metal', room, motor, C('#2c4d7a'));
  // things left on the belt
  for (let z = z0 + 0.8; z < z1 - 0.5; z += 1.2 + R() * 1.8) {
    if (R() < 0.6) crumpledBox(B, room, atlas, 0.45, 0.3, 0.38, mtx(x + (R() - 0.5) * 0.3, 0.92 + 0.15, z, R() * 0.6), R);
    else sack(B, room, mtx(x, 0.92, z, R() * 3), R);
  }
}

// ---------------------------------------------------------------- open steel work table (room to crawl under)
// w along its own x, d along z, turned by ry; legs `inset` from the corners
export function steelTable(B, room, x, z, w, d, ry, R, inset = 0.06) {
  const m = mtx(x, 0, z, ry);
  const S = C('#a7aba9'), D = C('#7c817f');
  let g = box(w, 0.035, d); g.translate(0, 0.9, 0); B.add('metal', room, g, S, m);
  // turned-down lip and an apron under the edge
  for (const s of [-1, 1]) {
    g = box(w, 0.06, 0.012); g.translate(0, 0.87, s * d / 2); B.add('metal', room, g, S, m);
    g = box(0.012, 0.06, d); g.translate(s * w / 2, 0.87, 0); B.add('metal', room, g, S, m);
    g = box(w - 2 * inset, 0.08, 0.02); g.translate(0, 0.8, s * (d / 2 - inset)); B.add('metal', room, g, D, m);
  }
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    g = box(0.04, 0.86, 0.04); g.translate(sx * (w / 2 - inset), 0.43, sz * (d / 2 - inset)); B.add('metal', room, g, D, m);
    g = cyl(0.03, 0.03, 0.02, 10); g.translate(sx * (w / 2 - inset), 0.01, sz * (d / 2 - inset)); B.add('rubber', room, g, C('#1a1a1a'), m);
  }
  // rails across the two short ends only: the long sides stay open
  for (const sx of [-1, 1]) { g = box(0.025, 0.025, d - 2 * inset); g.translate(sx * (w / 2 - inset), 0.16, 0); B.add('metal', room, g, D, m); }
  // things left on top
  g = box(0.42, 0.03, 0.3); g.translate(-w * 0.22, 0.93, -d * 0.1); g.rotateY(0); B.add('metal', room, g, C('#c4c6c2'), m);
  for (let k = 0; k < 3; k++) { g = box(0.16, 0.012, 0.016); g.rotateY((R() - 0.5) * 0.8); g.translate(-w * 0.22 + (R() - 0.5) * 0.25, 0.952, -d * 0.1 + (R() - 0.5) * 0.18); B.add('metal', room, g, C('#d6d8d4'), m); }
  g = cyl(0.05, 0.045, 0.14, 12); g.translate(w * 0.3, 0.987, d * 0.15); B.add('amber', room, g, C('#fff'), m);
  if (R() < 0.7) { g = box(0.3, 0.02, 0.24); g.rotateY(R() * 2); g.translate(w * 0.05, 0.928, d * 0.12); B.add('paper', room, g, C('#d8d2c2'), m); }
  // a rag hanging over the edge
  g = new THREE.PlaneGeometry(0.22, 0.32, 3, 4).rotateX(-Math.PI / 2);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const zz = p.getZ(i); if (zz > 0.04) { p.setY(i, -(zz - 0.04) * 1.4); p.setZ(i, 0.04 + (zz - 0.04) * 0.25); } p.setY(i, p.getY(i) + R() * 0.006); }
  g.computeVertexNormals(); g.translate(w * 0.38, 0.926, d / 2 - 0.06);   // the top is at most 0.9223 B.add('paper', room, g, C('#6b6250'), m);
}

// ---------------------------------------------------------------- big vertical tank with ribs, ladder, pipes
export function tank(B, room, x, z, r, h, R, ladderAng = 0, color = C('#8a958c')) {
  const body = cyl(r, r, h, 36, false, 0.6); body.translate(x, h / 2, z); B.add('metal', room, body, color);
  for (let y = 0.8; y < h; y += 1.1) { const t = new THREE.TorusGeometry(r + 0.01, 0.03, 6, 40); t.rotateX(Math.PI / 2); t.translate(x, y, z); B.add('metal', room, t, color.clone().multiplyScalar(0.8)); }
  const dome = new THREE.SphereGeometry(r, 30, 8, 0, Math.PI * 2, 0, Math.PI / 2); dome.scale(1, 0.3, 1); dome.translate(x, h, z); B.add('metal', room, dome, color);
  const hatch = cyl(0.3, 0.3, 0.12, 16); hatch.translate(x + r * 0.3, h + r * 0.27, z); B.add('metal', room, hatch, C('#555'));
  // ladder
  const lx = x + Math.sin(ladderAng) * (r + 0.18), lz = z + Math.cos(ladderAng) * (r + 0.18);
  const m = mtx(lx, 0, lz, ladderAng);
  for (const sx of [-0.2, 0.2]) { const s = box(0.04, h + 0.6, 0.04); s.translate(sx, (h + 0.6) / 2, 0); B.add('metal', room, s, C('#c79a1a'), m); }
  for (let y = 0.3; y < h + 0.5; y += 0.3) { const rg = cyl(0.015, 0.015, 0.4, 6); rg.rotateZ(Math.PI / 2); rg.translate(0, y, 0); B.add('metal', room, rg, C('#c79a1a'), m); }
  for (let y = 2.2; y < h + 0.5; y += 0.7) { const hoop = new THREE.TorusGeometry(0.35, 0.015, 4, 16, Math.PI); hoop.rotateX(Math.PI / 2); hoop.rotateY(Math.PI); hoop.translate(0, y, 0.05); B.add('metal', room, hoop, C('#c79a1a'), m); }
  // outlet pipe and valve at the bottom
  const a = ladderAng + Math.PI * 0.7;
  const ox = x + Math.sin(a) * r, oz = z + Math.cos(a) * r;
  pipe(B, room, [[ox, 0.6, oz], [ox + Math.sin(a) * 0.8, 0.6, oz + Math.cos(a) * 0.8], [ox + Math.sin(a) * 0.8, 0.05, oz + Math.cos(a) * 0.8]], 0.08, C('#7a7f80'), R, { valve: [ox + Math.sin(a) * 0.45, 0.82, oz + Math.cos(a) * 0.45] });
}

// ---------------------------------------------------------------- lab bench with glassware
export function labBench(B, room, x, z, w, d, ry, R, glassMat = 'glass') {
  const m = mtx(x, 0, z, ry);
  const base = box(w - 0.06, 0.82, d - 0.08); base.translate(0, 0.43, -0.02); B.add('metal', room, base, C('#c9cbc5'), m);
  const kick = box(w - 0.1, 0.1, d - 0.16); kick.translate(0, 0.05, -0.04); B.add('rubber', room, kick, C('#222'), m);
  const top = box(w, 0.04, d); top.translate(0, 0.88, 0); B.add('metal', room, top, C('#1d1f20'), m);
  const nDoors = Math.max(2, Math.round(w / 0.6));
  for (let i = 0; i < nDoors; i++) {
    const dx = -w / 2 + (i + 0.5) * w / nDoors;
    const dr = box(w / nDoors - 0.03, 0.64, 0.015); dr.translate(dx, 0.45, d / 2 - 0.05); B.add('metal', room, dr, C('#b9bcb6'), m);
    const hd = box(0.12, 0.02, 0.03); hd.translate(dx, 0.7, d / 2 - 0.03); B.add('metal', room, hd, C('#777'), m);
  }
  // glassware
  for (let k = 0; k < 4 + Math.floor(R() * 4); k++) {
    const gx = (R() - 0.5) * (w - 0.3), gz = (R() - 0.5) * (d - 0.2);
    const kind = R();
    let g;
    if (kind < 0.35) { g = new THREE.LatheGeometry([[0.0, 0], [0.05, 0], [0.05, 0.13], [0.055, 0.135]].map(([a, b]) => new THREE.Vector2(a, b)), 14); }
    else if (kind < 0.65) { g = new THREE.LatheGeometry([[0, 0], [0.07, 0.005], [0.075, 0.03], [0.04, 0.12], [0.018, 0.15], [0.018, 0.21], [0.022, 0.215]].map(([a, b]) => new THREE.Vector2(a, b)), 14); }
    else if (kind < 0.85) { g = new THREE.LatheGeometry([[0, 0], [0.045, 0], [0.045, 0.16], [0.02, 0.2], [0.016, 0.24]].map(([a, b]) => new THREE.Vector2(a, b)), 12); }
    else { g = cyl(0.03, 0.03, 0.08, 10); g.rotateZ(Math.PI / 2); g.translate(0, 0.03, 0); }  // fallen tube
    g.translate(gx, 0.895, gz);                         // 5 mm into the top: a glass base in its plane flickers
    B.add(kind > 0.65 && kind < 0.85 ? 'amber' : glassMat, room, g, C('#ffffff'), m);
  }
  // specimen jar: liquid with something dark curled inside
  if (R() < 0.7) {
    const jx = (R() - 0.5) * (w - 0.5), jz = (R() - 0.5) * (d - 0.3) * 0.5;
    const jar = cyl(0.12, 0.12, 0.34, 18); jar.translate(jx, 0.9 + 0.166, jz); B.add(glassMat, room, jar, C('#ffffff'), m);
    const lid = cyl(0.125, 0.125, 0.04, 18); lid.translate(jx, 0.9 + 0.356, jz); B.add('metal', room, lid, C('#333'), m);
    const liq = cyl(0.11, 0.11, 0.28, 16); liq.translate(jx, 0.9 + 0.155, jz); B.add('liquid', room, liq, C('#c2a24a'), m);
    const bug = new THREE.SphereGeometry(0.05, 10, 8); bug.scale(1, 0.55, 1.8); bug.rotateZ(0.4); bug.translate(jx, 0.9 + 0.13, jz); B.add('rubber', room, bug, C('#2a1408'), m);
  }
}

// ---------------------------------------------------------------- debris
export function paperSheet(B, room, x, y, z, ry, R) {
  const g = new THREE.PlaneGeometry(0.21, 0.297, 3, 3).rotateX(-Math.PI / 2);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, R() * 0.008 + Math.abs(p.getX(i)) * 0.06 * R());
  g.computeVertexNormals();
  B.add('paper', room, g, C('#ffffff').multiplyScalar(0.75 + R() * 0.25), mtx(x, y + 0.004, z, ry));   // all of it 4+ mm up
}
export function paperBall(B, room, x, y, z, R) {
  const g = new THREE.IcosahedronGeometry(0.045, 1);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const k = 0.7 + R() * 0.5; p.setXYZ(i, p.getX(i) * k, p.getY(i) * k, p.getZ(i) * k); }
  g.computeVertexNormals();
  B.add('paper', room, g, C('#ffffff'), mtx(x, y + 0.04, z, R() * 6));
}
export function chunk(B, room, x, z, s, R, color = '#8d8a83') {
  const g = new THREE.DodecahedronGeometry(s, 0);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, p.getY(i) * 0.6);
  g.computeVertexNormals();
  B.add('metal', room, g, C(color), mtx(x, s * 0.5, z, R() * 6, R(), R()));
}
export function shards(B, room, x, z, R, n = 10) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.BufferGeometry(), s = 0.02 + R() * 0.05;
    const a = [0, 0, 0, s, 0, R() * s * 0.5, R() * s, 0, s];
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(a), 3)); g.computeVertexNormals();
    B.add('glass', room, g, C('#ffffff'), mtx(x + (R() - 0.5) * 0.8, 0.004, z + (R() - 0.5) * 0.8, R() * 6, 0, 0));
  }
}
export function can(B, room, x, z, R) {
  const g = cyl(0.033, 0.033, 0.12, 12); g.rotateZ(Math.PI / 2); g.translate(0, 0.033, 0);
  B.add('metal', room, g, C(R() < 0.5 ? '#b51e1e' : '#d8c23a'), mtx(x, 0, z, R() * 6));
}
export function deadRoaches(B, room, x, z, R, n = 6) {
  for (let i = 0; i < n; i++) {
    const g = new THREE.SphereGeometry(0.012, 8, 6); g.scale(1, 0.5, 1.9);
    B.add('rubber', room, g, C('#2a160a'), mtx(x + (R() - 0.5) * 0.5, 0.006, z + (R() - 0.5) * 0.5, R() * 6, 0, R() < 0.3 ? Math.PI : 0));
  }
}
export function ceilingTile(B, room, x, z, R) {
  const g = box(0.6, 0.015, 0.6); const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) if (p.getX(i) > 0 && p.getZ(i) > 0) { p.setX(i, p.getX(i) * (0.3 + R() * 0.5)); }
  g.computeVertexNormals();
  B.add('metal', room, g, C('#cfccc2'), mtx(x, 0.01, z, R() * 6, (R() - 0.5) * 0.15));
}
export function plasticWrap(B, room, x, z, R) {
  const g = new THREE.PlaneGeometry(0.6 + R() * 0.6, 0.3 + R() * 0.4, 4, 3).rotateX(-Math.PI / 2);
  const p = g.attributes.position; for (let i = 0; i < p.count; i++) p.setY(i, R() * 0.05);
  g.computeVertexNormals();
  B.add('wrap', room, g, C('#ffffff'), mtx(x, 0.005, z, R() * 6));
}

// ---------------------------------------------------------------- flat things on surfaces: decals and signs
// quad of size w x h, facing +y (floor) or a wall normal, uv mapped to an atlas cell
export function quad(B, mat, room, cell, w, h, x, y, z, face, rot = 0) {
  const g = new THREE.PlaneGeometry(w, h);
  remapUV(g, cell);
  if (rot) g.rotateZ(rot);
  if (face === 'up') g.rotateX(-Math.PI / 2);
  else if (face === '+x') g.rotateY(Math.PI / 2);
  else if (face === '-x') g.rotateY(-Math.PI / 2);
  else if (face === '-z') g.rotateY(Math.PI);
  g.translate(x, y, z);
  B.add(mat, room, g);
}
