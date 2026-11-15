// Procedural gloved hand: a signed distance field built from round cones and ellipsoids,
// polygonised with surface nets, then skinned to a 17-bone skeleton.
// Canonical RIGHT hand: wrist at the origin, fingers toward -Z, palm facing -Y, thumb toward -X.
// Pure JS (no three.js) so it can also run in Node for testing.

export const FINGERS = [
  { name: 'index', mcp: [-0.0245, 0.0005, -0.0875], dir: [-0.075, 0.0, -1], len: [0.0415, 0.0245, 0.0205], rad: [0.0097, 0.0089, 0.0081] },
  { name: 'middle', mcp: [-0.0060, 0.0020, -0.0930], dir: [-0.005, 0.0, -1], len: [0.0460, 0.0285, 0.0215], rad: [0.0100, 0.0092, 0.0083] },
  { name: 'ring', mcp: [0.0120, 0.0005, -0.0890], dir: [0.07, 0.0, -1], len: [0.0430, 0.0270, 0.0210], rad: [0.0094, 0.0087, 0.0079] },
  { name: 'pinky', mcp: [0.0278, -0.0025, -0.0800], dir: [0.16, 0.0, -1], len: [0.0340, 0.0205, 0.0190], rad: [0.0085, 0.0078, 0.0071] },
];
export const THUMB = { cmc: [-0.0195, -0.0095, -0.0215], dir: [-0.60, -0.30, -0.74], len: [0.0430, 0.0320, 0.0270], rad: [0.0128, 0.0111, 0.0102] };

// ------------------------------------------------------------------ tiny vector helpers
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const len = (a) => Math.sqrt(dot(a, a));
const norm = (a) => mul(a, 1 / (len(a) || 1));
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const V = { sub, add, mul, dot, len, norm, cross, clamp };

function smin(a, b, k) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + 0.5 * (b - a) / k, 0, 1);
  return b + (a - b) * h - k * h * (1 - h);
}

// round cone between a (radius r1) and b (radius r2)  (after Inigo Quilez)
function roundCone(px, py, pz, a, b, r1, r2) {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz, rr = r1 - r2, a2 = l2 - rr * rr, il2 = 1 / l2;
  const pax = px - a[0], pay = py - a[1], paz = pz - a[2];
  const y = pax * bax + pay * bay + paz * baz, z = y - l2;
  const qx = pax * l2 - bax * y, qy = pay * l2 - bay * y, qz = paz * l2 - baz * y;
  const x2 = qx * qx + qy * qy + qz * qz, y2 = y * y * l2, z2 = z * z * l2;
  const k = Math.sign(rr) * rr * rr * x2;
  if (Math.sign(z) * a2 * z2 > k) return Math.sqrt(x2 + z2) * il2 - r2;
  if (Math.sign(y) * a2 * y2 < k) return Math.sqrt(x2 + y2) * il2 - r1;
  return (Math.sqrt(x2 * a2 * il2) + y * rr) * il2 - r1;
}
function ellipsoid(px, py, pz, c, r) {
  const x = (px - c[0]) / r[0], y = (py - c[1]) / r[1], z = (pz - c[2]) / r[2];
  const k0 = Math.sqrt(x * x + y * y + z * z);
  const k1 = Math.sqrt(x * x / (r[0] * r[0]) + y * y / (r[1] * r[1]) + z * z / (r[2] * r[2]));
  return k1 > 0 ? k0 * (k0 - 1) / k1 : -Math.min(r[0], r[1], r[2]);
}
function roundBox(x, y, z, hx, hy, hz, r) {
  const qx = Math.abs(x) - hx, qy = Math.abs(y) - hy, qz = Math.abs(z) - hz;
  const ox = Math.max(qx, 0), oy = Math.max(qy, 0), oz = Math.max(qz, 0);
  return Math.sqrt(ox * ox + oy * oy + oz * oz) + Math.min(Math.max(qx, qy, qz), 0) - r;
}

// ------------------------------------------------------------------ the skeleton in rest pose
// bones: 0 forearm, 1 hand, 2..13 fingers (3 each), 14..16 thumb
export function restSkeleton() {
  const bones = [];
  bones.push({ name: 'forearm', parent: -1, pos: [0, 0, 0], a: [0, 0, 0.004], b: [0, 0, 0.30], r: 0.028 });
  bones.push({ name: 'hand', parent: 0, pos: [0, 0, 0] });
  const chains = [];
  FINGERS.forEach((f, fi) => {
    const d = norm(f.dir);
    let p = f.mcp, parent = 1;
    const ids = [];
    for (let k = 0; k < 3; k++) {
      const q = add(p, mul(d, f.len[k]));
      const r1 = k === 0 ? f.rad[k] * 1.06 : f.rad[k], r2 = k === 2 ? f.rad[k] * 0.9 : f.rad[k] * 0.95;
      bones.push({ name: `${f.name}${k}`, parent, pos: p, a: p, b: k === 2 ? add(p, mul(d, f.len[k] - r2)) : q, r: r1, r2, dir: d, finger: fi, seg: k });
      parent = bones.length - 1; ids.push(parent); p = q;
    }
    chains.push({ ids, tip: p, dir: d });
  });
  {
    const d = norm(THUMB.dir);
    let p = THUMB.cmc, parent = 1;
    const ids = [];
    for (let k = 0; k < 3; k++) {
      const q = add(p, mul(d, THUMB.len[k]));
      const r1 = THUMB.rad[k], r2 = k === 2 ? THUMB.rad[k] * 0.9 : THUMB.rad[k] * 0.93;
      bones.push({ name: `thumb${k}`, parent, pos: p, a: p, b: k === 2 ? add(p, mul(d, THUMB.len[k] - r2)) : q, r: r1, r2, dir: d, finger: 4, seg: k });
      parent = bones.length - 1; ids.push(parent); p = q;
    }
    chains.push({ ids, tip: p, dir: d });
  }
  return { bones, chains };
}

// ------------------------------------------------------------------ the glove surface
// the palm: an elliptical cross-section (domed back, rounded sides) whose width and thickness
// change from the wrist to the knuckles, with rounded ends
const PALM = { z0: 0.004, z1: -0.091 };
const lerp = (a, b, t) => a + (b - a) * t;
function palmWH(z) {
  const t = clamp((PALM.z0 - z) / (PALM.z0 - PALM.z1), 0, 1);       // 0 wrist .. 1 knuckles
  const s = t * t * (3 - 2 * t);
  const hx = t < 0.45 ? lerp(0.0290, 0.0400, Math.sin(t / 0.45 * Math.PI / 2)) : lerp(0.0400, 0.0405, (t - 0.45) / 0.55);
  const hy = lerp(0.0152, 0.0110, s);
  return [hx, hy];
}
function palmSDF(x, y, z) {
  const zc = clamp(z, PALM.z1, PALM.z0);
  const [hx, hy] = palmWH(zc);
  // the back is a flatter dome than the palm side
  const yy = y + 0.0015;
  const ry = yy > 0 ? hy * 0.92 : hy * 1.08;
  const e = Math.sqrt((x / hx) * (x / hx) + (yy / ry) * (yy / ry));
  const radial = (e - 1) * Math.min(hx, ry);
  const dz = z < PALM.z1 ? PALM.z1 - z : z > PALM.z0 ? z - PALM.z0 : 0;
  if (dz <= 0) return radial;
  // rounded ends
  return radial > 0 ? Math.hypot(radial, dz) : dz;
}
const THENAR = { c: [-0.0225, -0.0115, -0.0345], r: [0.0150, 0.0110, 0.0250] };
const HYPO = { c: [0.0262, -0.0085, -0.0430], r: [0.0115, 0.0092, 0.0300] };
const PAD = { c: [0.0005, -0.0108, -0.0795], r: [0.0315, 0.0070, 0.0110] };

function wristSDF(x, y, z) {
  // an elliptical tube from the wrist into the sleeve; the glove cuff flares a little
  const t = clamp(z / 0.09, 0, 1);
  const rx = 0.0285 + 0.0045 * t * t, ry = 0.0195 + 0.0055 * t * t;
  const e = Math.sqrt((x / rx) * (x / rx) + ((y + 0.0005) / ry) * ((y + 0.0005) / ry)) - 1;
  const radial = e * Math.min(rx, ry);
  const capFar = z - 0.07, capNear = -0.006 - z;
  return Math.max(radial, capFar, capNear);
}

export function makeGloveSDF(sk) {
  const B = sk.bones;
  const fingerBones = B.filter((b) => b.finger !== undefined && b.finger < 4);
  const thumbBones = B.filter((b) => b.finger === 4);
  const knuckles = FINGERS.map((f) => [f.mcp[0], f.mcp[1] + 0.0048, f.mcp[2] + 0.0015]);
  return (x, y, z) => {
    let d = palmSDF(x, y, z);
    d = smin(d, ellipsoid(x, y, z, THENAR.c, THENAR.r), 0.010);
    d = smin(d, ellipsoid(x, y, z, HYPO.c, HYPO.r), 0.010);
    d = smin(d, ellipsoid(x, y, z, PAD.c, PAD.r), 0.008);
    d = smin(d, wristSDF(x, y, z), 0.014);
    for (let i = 0; i < 4; i++) {
      const k = knuckles[i];
      const dx = x - k[0], dy = y - k[1], dz = z - k[2];
      d = smin(d, Math.sqrt(dx * dx + dy * dy + dz * dz) - 0.0070, 0.007);
    }
    // fingers: each chain as one union (segments meet on shared spheres), then blended into the palm
    for (let f = 0; f < 4; f++) {
      let c = 1e9;
      for (let k = 0; k < 3; k++) {
        const b = fingerBones[f * 3 + k];
        c = Math.min(c, roundCone(x, y, z, b.a, b.b, b.r, b.r2));
      }
      d = smin(d, c, 0.0065);
    }
    let t = 1e9;
    for (const b of thumbBones) t = smin(t, roundCone(x, y, z, b.a, b.b, b.r, b.r2), 0.002);
    d = smin(d, t, 0.0115);
    return d;
  };
}

// ------------------------------------------------------------------ surface nets
// narrow band: a coarse grid first, exact values only near the surface
export function surfaceNets(f, bmin, bmax, h) {
  const nx = Math.ceil((bmax[0] - bmin[0]) / h) + 1, ny = Math.ceil((bmax[1] - bmin[1]) / h) + 1, nz = Math.ceil((bmax[2] - bmin[2]) / h) + 1;
  const C = 4, H = h * C;
  const cx = Math.ceil((nx - 1) / C) + 1, cy = Math.ceil((ny - 1) / C) + 1, cz = Math.ceil((nz - 1) / C) + 1;
  const coarse = new Float32Array(cx * cy * cz);
  for (let k = 0; k < cz; k++) for (let j = 0; j < cy; j++) for (let i = 0; i < cx; i++) coarse[i + cx * (j + cy * k)] = f(bmin[0] + i * H, bmin[1] + j * H, bmin[2] + k * H);
  const vals = new Float32Array(nx * ny * nz);
  const band = H * 1.8;
  for (let k = 0; k < nz; k++) {
    const kc = Math.min(cz - 2, Math.floor(k / C)), tk = k / C - kc;
    for (let j = 0; j < ny; j++) {
      const jc = Math.min(cy - 2, Math.floor(j / C)), tj = j / C - jc;
      for (let i = 0; i < nx; i++) {
        const ic = Math.min(cx - 2, Math.floor(i / C)), ti = i / C - ic;
        const c00 = coarse[ic + cx * (jc + cy * kc)] * (1 - ti) + coarse[ic + 1 + cx * (jc + cy * kc)] * ti;
        const c10 = coarse[ic + cx * (jc + 1 + cy * kc)] * (1 - ti) + coarse[ic + 1 + cx * (jc + 1 + cy * kc)] * ti;
        const c01 = coarse[ic + cx * (jc + cy * (kc + 1))] * (1 - ti) + coarse[ic + 1 + cx * (jc + cy * (kc + 1))] * ti;
        const c11 = coarse[ic + cx * (jc + 1 + cy * (kc + 1))] * (1 - ti) + coarse[ic + 1 + cx * (jc + 1 + cy * (kc + 1))] * ti;
        const v = (c00 * (1 - tj) + c10 * tj) * (1 - tk) + (c01 * (1 - tj) + c11 * tj) * tk;
        vals[i + nx * (j + ny * k)] = Math.abs(v) > band ? v : f(bmin[0] + i * h, bmin[1] + j * h, bmin[2] + k * h);
      }
    }
  }
  const idx = (i, j, k) => i + nx * (j + ny * k);
  const cidx = (i, j, k) => i + (nx - 1) * (j + (ny - 1) * k);
  const cellV = new Int32Array((nx - 1) * (ny - 1) * (nz - 1)).fill(-1);
  const pos = [];
  const E = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const co = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const g = new Float32Array(8);
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    let mask = 0;
    for (let c = 0; c < 8; c++) { g[c] = vals[idx(i + co[c][0], j + co[c][1], k + co[c][2])]; if (g[c] < 0) mask |= 1 << c; }
    if (mask === 0 || mask === 255) continue;
    let sx = 0, sy = 0, sz = 0, n = 0;
    for (const [a, b] of E) {
      const ga = g[a], gb = g[b];
      if ((ga < 0) === (gb < 0)) continue;
      const t = ga / (ga - gb);
      sx += co[a][0] + (co[b][0] - co[a][0]) * t; sy += co[a][1] + (co[b][1] - co[a][1]) * t; sz += co[a][2] + (co[b][2] - co[a][2]) * t; n++;
    }
    cellV[cidx(i, j, k)] = pos.length / 3;
    pos.push(bmin[0] + (i + sx / n) * h, bmin[1] + (j + sy / n) * h, bmin[2] + (k + sz / n) * h);
  }
  const quads = [];
  const quad = (a, b, c, d, flip) => { if (a < 0 || b < 0 || c < 0 || d < 0) return; if (flip) quads.push(a, d, c, b); else quads.push(a, b, c, d); };
  for (let k = 0; k < nz - 1; k++) for (let j = 0; j < ny - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const v0 = vals[idx(i, j, k)] < 0;
    if (j > 0 && k > 0 && (vals[idx(i + 1, j, k)] < 0) !== v0) quad(cellV[cidx(i, j - 1, k - 1)], cellV[cidx(i, j, k - 1)], cellV[cidx(i, j, k)], cellV[cidx(i, j - 1, k)], !v0);
    if (i > 0 && k > 0 && (vals[idx(i, j + 1, k)] < 0) !== v0) quad(cellV[cidx(i - 1, j, k - 1)], cellV[cidx(i - 1, j, k)], cellV[cidx(i, j, k)], cellV[cidx(i, j, k - 1)], !v0);
    if (i > 0 && j > 0 && (vals[idx(i, j, k + 1)] < 0) !== v0) quad(cellV[cidx(i - 1, j - 1, k)], cellV[cidx(i, j - 1, k)], cellV[cidx(i, j, k)], cellV[cidx(i - 1, j, k)], !v0);
  }
  return { pos: new Float32Array(pos), quads };
}

// pull vertices onto the true surface and take normals from the field's gradient
export function refine(f, pos, iters = 2) {
  const n = pos.length / 3, nrm = new Float32Array(pos.length), e = 0.00025;
  for (let v = 0; v < n; v++) {
    let x = pos[v * 3], y = pos[v * 3 + 1], z = pos[v * 3 + 2];
    for (let it = 0; it <= iters; it++) {
      const d = f(x, y, z);
      const gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e), gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e), gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
      const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
      if (it === iters) { nrm[v * 3] = gx / gl; nrm[v * 3 + 1] = gy / gl; nrm[v * 3 + 2] = gz / gl; break; }
      const s = d / (gl * gl);
      x -= gx * s; y -= gy * s; z -= gz * s;
    }
    pos[v * 3] = x; pos[v * 3 + 1] = y; pos[v * 3 + 2] = z;
  }
  return nrm;
}

// quads -> triangles along the shorter diagonal
export function triangulate(pos, quads) {
  const out = new Uint32Array(quads.length / 4 * 6);
  const d2 = (a, b) => { const x = pos[a * 3] - pos[b * 3], y = pos[a * 3 + 1] - pos[b * 3 + 1], z = pos[a * 3 + 2] - pos[b * 3 + 2]; return x * x + y * y + z * z; };
  for (let q = 0, o = 0; q < quads.length; q += 4) {
    const [a, b, c, d] = [quads[q], quads[q + 1], quads[q + 2], quads[q + 3]];
    if (d2(a, c) < d2(b, d)) { out[o++] = a; out[o++] = b; out[o++] = c; out[o++] = a; out[o++] = c; out[o++] = d; }
    else { out[o++] = a; out[o++] = b; out[o++] = d; out[o++] = b; out[o++] = c; out[o++] = d; }
  }
  return out;
}

// ------------------------------------------------------------------ skin weights + wrinkle zones
function segDist(p, a, b) {
  const ab = sub(b, a), t = clamp(dot(sub(p, a), ab) / dot(ab, ab), 0, 1);
  return { d: len(sub(p, add(a, mul(ab, t)))), t };
}
// joints whose bend drives creases: 0-3 MCP, 4-7 PIP, 8-11 DIP, 12 thumb MCP, 13 thumb IP, 14 wrist
export function skin(pos, nrm, sk) {
  const n = pos.length / 3, B = sk.bones;
  const sIdx = new Uint16Array(n * 4), sW = new Float32Array(n * 4);
  const zone = new Float32Array(n * 4);           // joint id, axial offset (m), side (+1 back, -1 palm), region
  const joints = [];
  FINGERS.forEach((f, i) => joints[i] = { p: f.mcp, dir: B[2 + i * 3].dir, child: 2 + i * 3 });
  FINGERS.forEach((f, i) => { joints[4 + i] = { p: B[3 + i * 3].a, dir: B[3 + i * 3].dir, child: 3 + i * 3 }; joints[8 + i] = { p: B[4 + i * 3].a, dir: B[4 + i * 3].dir, child: 4 + i * 3 }; });
  joints[12] = { p: B[15].a, dir: B[15].dir, child: 15 };
  joints[13] = { p: B[16].a, dir: B[16].dir, child: 16 };
  joints[14] = { p: [0, 0, 0], dir: [0, 0, -1], child: 1 };
  const d = new Float32Array(B.length);
  for (let v = 0; v < n; v++) {
    const p = [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]], nn = [nrm[v * 3], nrm[v * 3 + 1], nrm[v * 3 + 2]];
    // distance of this surface point to each bone's own shape
    d[0] = Math.max(0, 0.014 - p[2]) * 0.7;                                     // the forearm owns the cuff past the wrist
    d[1] = Math.max(0, palmSDF(p[0], p[1], p[2])) * 0.8 + Math.max(0, p[2]) * 0.6;
    for (let b = 2; b < B.length; b++) {
      const s = segDist(p, B[b].a, B[b].b);
      d[b] = Math.max(0, s.d - (B[b].r + (B[b].r2 - B[b].r) * s.t));
    }
    // the thenar pad and the web follow the thumb's first bone part of the way
    const thenar = ellipsoid(p[0], p[1], p[2], THENAR.c, THENAR.r);
    if (thenar < 0.002) d[14] = Math.min(d[14], Math.max(0, thenar) + 0.0015);
    let dmin = 1e9;
    for (let b = 0; b < B.length; b++) dmin = Math.min(dmin, d[b]);
    const top = [];
    for (let b = 0; b < B.length; b++) {
      const sig = b <= 1 ? 0.004 : 0.0022;
      const w = Math.exp(-(d[b] - dmin) / sig);
      if (w > 0.01) top.push([b, w]);
    }
    top.sort((a, b) => b[1] - a[1]);
    let sum = 0;
    for (let k = 0; k < Math.min(4, top.length); k++) sum += top[k][1];
    for (let k = 0; k < 4; k++) {
      if (k < top.length) { sIdx[v * 4 + k] = top[k][0]; sW[v * 4 + k] = top[k][1] / sum; }
      else { sIdx[v * 4 + k] = 0; sW[v * 4 + k] = 0; }
    }
    // nearest crease joint
    let bj = -1, bd = 1e9, bax = 0;
    for (let j = 0; j < joints.length; j++) {
      const J = joints[j], r = sub(p, J.p), ax = dot(r, J.dir), rad = len(sub(r, mul(J.dir, ax)));
      const lim = j === 14 ? 0.05 : j >= 12 ? 0.022 : 0.016;
      if (rad > lim) continue;
      const dd = Math.abs(ax) + rad * 0.15;
      if (dd < bd) { bd = dd; bj = j; bax = ax; }
    }
    const primary = sIdx[v * 4];
    const region = primary === 0 ? 3 : primary === 1 ? 0 : primary >= 14 ? 2 : 1;
    zone[v * 4] = bj; zone[v * 4 + 1] = bax; zone[v * 4 + 2] = nn[1] >= 0 ? Math.min(1, nn[1] * 1.5) : Math.max(-1, nn[1] * 1.5); zone[v * 4 + 3] = region;
  }
  return { sIdx, sW, zone };
}

// everything for one hand
export function buildHand({ h = 0.0011 } = {}) {
  const sk = restSkeleton();
  const f = makeGloveSDF(sk);
  const bmin = [-0.105, -0.048, -0.215], bmax = [0.052, 0.040, 0.074];
  const { pos, quads } = surfaceNets(f, bmin, bmax, h);
  const nrm = refine(f, pos);
  const index = triangulate(pos, quads);
  const { sIdx, sW, zone } = skin(pos, nrm, sk);
  return { sk, pos, nrm, index, sIdx, sW, zone, sdf: f };
}
