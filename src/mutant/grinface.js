import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { noise3 } from './face.js';
import { skinNormal } from './skin.js';

// A bald head like something wearing a man's face and getting it wrong: a tall egg of a skull, the face
// narrowing to a pointed chin, two big slanted almond hollows for eyes with nothing in them, a small narrow
// nose, and a smile far too wide, its corners up under the cheekbones, deep lines bracketing it.
// Unit height (crown to chin = 1), facing +z. setOpen(0..1): the smile parts into a black crescent
// (a morph target: the inside of the mouth is real surface, laid out open and squeezed shut).
const V3 = THREE.Vector3;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (x, y, cx, cy, rx, ry) => Math.exp(-(((x - cx) / rx) ** 2) - (((y - cy) / ry) ** 2));
const EYE = { x: 0.155, y: -0.03, hw: 0.118, hh: 0.07, tilt: 0.34 };       // half width / height of each almond; the outer corner up
const M = { cy: -0.3, w: 0.28, hc: 0.012, hu: 0.016, hl: 0.09, drop: 0.03, smile: 0.1, depth: 0.12 };

// how far (x, y) is from an eye's middle in units of its almond (1 on the rim), and which side of it
function almond(x, y) {
  const s = x < 0 ? -1 : 1, px = (x - s * EYE.x) * s, py = y - EYE.y, c = Math.cos(EYE.tilt), sn = Math.sin(EYE.tilt);
  const u = px * c + py * sn, v = -px * sn + py * c;
  return { q: Math.sqrt(Math.pow(Math.abs(u) / EYE.hw, 1.5) + (v / EYE.hh) ** 2), u, v };
}

function sculpt(base, k, cols) {
  const n = base.length / 3, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = new THREE.Color(), skin = new THREE.Color('#cbc0cc'), mot = new THREE.Color('#9d8ea2'), flush = new THREE.Color('#9a7686'),
    crease = new THREE.Color('#6e5866'), smoke = new THREE.Color('#2a2026'), black = new THREE.Color(0, 0, 0),
    lip = new THREE.Color('#5a404e'), gum = new THREE.Color('#4a2230'), inside = new THREE.Color('#0e0608');
  for (let i = 0; i < n; i++) {
    let dx = base[i * 3], dy = base[i * 3 + 1], dz = base[i * 3 + 2];
    // first the mesh is slid over the sphere so its rows bend up at the sides round the mouth, the way the
    // smile does: the lips then run along the rows instead of cutting across them in steps
    // (and drawn in toward the lip line, so there are rows enough there for the inside of the mouth)
    // (solved a few times over: the curve is in terms of where the vertex ends up, which the warp moves)
    {
      const fr = ss(0.0, 0.4, dz), yp = dy * 0.5, h0 = Math.sqrt(Math.max(1e-9, 1 - dy * dy)), band = (1 - ss(0.07, 0.24, Math.abs(yp - M.cy - 0.02))) * fr;
      let ny = dy;
      for (let it = 0; it < 4; it++) {
        const xp = dx * (Math.sqrt(Math.max(0, 1 - ny * ny)) / h0) * 0.39 * (1 - 0.6 * ss(-0.1, -0.55, ny * 0.5));
        const curve = M.smile * Math.min(1.6, (xp / M.w) ** 2);
        let y = yp + curve * band;
        const W = 0.16, v = y - (M.cy + curve);
        if (Math.abs(v) < W && fr > 0) y -= v * (1 - (0.35 + 0.65 * (v / W) ** 2)) * fr;
        ny = Math.max(-1, Math.min(1, y * 2));
      }
      const kk = Math.sqrt(Math.max(0, 1 - ny * ny)) / h0;
      dx *= kk; dz *= kk; dy = ny;
    }
    // the skull: a tall egg, widest at the temples; below the cheekbones it closes in to a point at the
    // front (the chin), the underside running back to the neck
    let y = dy * 0.5, x = dx * 0.39, z = dz * (dz > 0 ? 0.42 : 0.47);
    const t = ss(-0.1, -0.55, y);
    x *= 1 - 0.6 * t;
    z = z * (1 - (dz > 0 ? 0.45 : 0.8) * t) + 0.15 * t;
    if (y > 0.15) x *= 1 + 0.03 * ss(0.15, 0.3, y);                    // (the crown full and round)
    const front = ss(0.05, 0.4, dz), r = Math.hypot(x, y, z);
    const x0 = x, y0 = y, ax = Math.abs(x0);
    let d = 0;
    // eyes: a broad shallow dish, the almond sunk deep in it, a crease under it
    const e = almond(x0, y0);
    d -= 0.04 * Math.exp(-((e.q / 1.7) ** 2)) * front;
    d -= 0.075 * ss(1.0, 0.45, e.q) * front;
    d -= 0.01 * Math.exp(-(((e.q - 1.45) / 0.12) ** 2)) * (e.v < 0 ? 1 : 0.3) * front;
    // brow, temples, cheekbones, the chin
    d += 0.012 * Math.exp(-(((y0 - 0.055) / 0.04) ** 2)) * ss(0.3, 0.12, ax) * front;
    d -= 0.016 * g2(ax, y0, 0.34, 0.06, 0.06, 0.09);
    d += 0.022 * g2(ax, y0, 0.255, -0.1, 0.07, 0.045) * front;
    d += 0.014 * g2(x0, y0, 0, -0.45, 0.045, 0.035) * front;
    // nose: a thin bridge down from between the eyes, a small tip, narrow wings, the nostrils
    const tip = ss(-0.05, -0.155, y0) * ss(-0.215, -0.172, y0), nw = 0.021 + 0.017 * ss(-0.06, -0.17, y0);
    d += (0.01 + 0.07 * tip) * Math.exp(-((x0 / nw) ** 2)) * ss(0.0, -0.05, y0) * front;
    d += 0.012 * g2(ax, y0, 0.03, -0.178, 0.016, 0.013) * front;
    const nostril = g2(ax, y0, 0.017, -0.19, 0.008, 0.005) * front;
    d -= 0.014 * nostril;
    // the mouth: a crescent on a curve whose ends turn up toward the cheekbones. Shut, it is a thin band
    // where the lips meet; opening, the band stretches into the gap (it is the inside of the mouth), the
    // lower lip and the chin drop and the upper lip lifts a little (most in the middle, none at the corners)
    const cyx = M.cy + M.smile * Math.min(1.6, (x0 / M.w) ** 2);
    const ux = Math.sqrt(Math.max(0, 1 - (x0 / M.w) ** 2)), mouth = front > 0.25 ? ss(M.w + 0.004, M.w - 0.012, ax) : 0;
    const v = y0 - cyx, hc = M.hc, gl = (M.hl + M.drop) * ux * k * mouth, gu = M.hu * ux * k * mouth;
    const band = Math.abs(v) < hc ? mouth : 0;                        // 1 inside the mouth
    const E = mouth > 0 ? Math.abs(v) / hc : 9;                       // 1 where the lips meet the band
    let back = 0;                                                     // (straight into the head, not toward its middle)
    if (band) {
      y = cyx + v * (1 + (v < 0 ? gl : gu) / hc);                    // (meets the lips' move at the band's edge)
      back = (0.01 + M.depth * k) * Math.sqrt(Math.max(0, 1 - E * E)) * Math.sqrt(ux) * mouth;
    } else if (v < 0) y = y0 - gl * (1 - ss(0.12, 0.4, -v));
    else y = y0 + gu * (1 - ss(0.0, 0.05, v - hc));
    d += 0.007 * Math.exp(-(((E - 1.9) / 0.6) ** 2)) * mouth;                     // thin lips
    d -= 0.012 * g2(ax, y0, M.w + 0.01, M.cy + M.smile + 0.005, 0.02, 0.022) * front;   // the corners dug in
    // the lines bracketing it: a deep fold above it from the nose wing out past the corner, the cheek
    // bunched up over the fold, and a shorter line down from each corner
    const fy = cyx + 0.075 + 0.02 * (ax / M.w);
    const along = ss(0.035, 0.08, ax) * ss(M.w + 0.06, M.w + 0.01, ax);
    const fold = Math.exp(-(((y0 - fy) / 0.017) ** 2)) * along * front;
    d -= 0.018 * fold;
    d += 0.009 * Math.exp(-(((y0 - fy - 0.035) / 0.035) ** 2)) * along * front;
    const mar = Math.exp(-(((ax - (M.w - 0.035 - (M.cy + M.smile - y0) * 0.35)) / 0.01) ** 2)) * ss(M.cy + M.smile - 0.02, M.cy + M.smile - 0.06, y0) * ss(M.cy - 0.1, M.cy - 0.02, y0) * front;
    d -= 0.012 * mar;
    // fine wrinkles and lumps
    d += 0.003 * (noise3(x0 * 45, y0 * 45, z * 45) - 0.5);
    const kk = (r + d) / r;
    pos[i * 3] = x * kk; pos[i * 3 + 1] = y * kk; pos[i * 3 + 2] = z * kk - back;
    if (!cols) continue;
    // colour: pale lilac skin, faintly mottled and flushed round the features; the eyes black, fading
    // out through smoky grey; the creases darker; thin dark lips; black inside
    const m1 = noise3(x0 * 8 + 3, y0 * 8, z * 8), m2 = noise3(x0 * 30, y0 * 30 + 7, z * 30);
    c.copy(skin).lerp(mot, ss(0.4, 0.85, m1) * 0.4).multiplyScalar(0.95 + 0.08 * m2);
    c.lerp(flush, (0.3 * g2(ax, y0, 0.2, -0.16, 0.1, 0.08) + 0.25 * Math.exp(-(((E - 1.3) / 0.4) ** 2)) + 0.3 * Math.exp(-((e.q / 2.2) ** 2))) * front);
    c.lerp(smoke, ss(2.0, 1.0, e.q) * 0.85 * front);
    c.lerp(black, ss(1.05, 0.8, e.q) * front);
    c.lerp(crease, (fold * 0.8 + mar * 0.6 + nostril * 0.8 + Math.exp(-(((e.q - 1.45) / 0.12) ** 2)) * 0.3 * front));
    c.lerp(lip, Math.exp(-(((E - 1.6) / 0.9) ** 2)) * 0.9 * mouth);
    if (band) { c.lerp(gum, ss(1.0, 0.97, E)); c.lerp(inside, ss(0.97, 0.9, E)); }
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  return { pos, col };
}

// a sphere's normals made smooth across its seam and at its poles (where it has a vertex per column)
function weld(nor, seg, rows) {
  const a = nor, w = seg + 1, v = new V3();
  for (let r = 0; r <= rows; r++) {
    const i0 = r * w, i1 = i0 + seg;
    if (r === 0 || r === rows) {
      v.set(0, 0, 0); for (let j = 0; j <= seg; j++) v.add(new V3(a[(i0 + j) * 3], a[(i0 + j) * 3 + 1], a[(i0 + j) * 3 + 2]));
      v.normalize(); for (let j = 0; j <= seg; j++) { a[(i0 + j) * 3] = v.x; a[(i0 + j) * 3 + 1] = v.y; a[(i0 + j) * 3 + 2] = v.z; }
    } else {
      v.set(a[i0 * 3] + a[i1 * 3], a[i0 * 3 + 1] + a[i1 * 3 + 1], a[i0 * 3 + 2] + a[i1 * 3 + 2]).normalize();
      a[i0 * 3] = a[i1 * 3] = v.x; a[i0 * 3 + 1] = a[i1 * 3 + 1] = v.y; a[i0 * 3 + 2] = a[i1 * 3 + 2] = v.z;
    }
  }
}

// an ear: a thin shell, the bowl dished into its outer face, a rim round it, drawn up to a point at the top
function earGeometry(side) {
  const g = new THREE.SphereGeometry(1, 28, 20), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    const out = x * side > 0 ? 1 : 0, rr = Math.hypot(y / 0.85, z / 0.8);
    let X = x * 0.34 - side * out * 0.42 * Math.exp(-((rr / 0.6) ** 2)) * Math.abs(x);
    let Y = y, Z = z * 0.58;
    if (y > 0.3) { Y += 0.35 * (y - 0.3) ** 2; Z -= 0.25 * (y - 0.3) ** 2; }     // (the tip, back a little)
    if (y < -0.5) Z += 0.1 * (y + 0.5);
    p.setXYZ(i, X, Y, Z);
  }
  g.scale(0.11, 0.115, 0.115);
  g.computeVertexNormals();
  return g;
}

export function makeGrinFace({ h = 0.24, seg = 192, ears = true } = {}) {
  const group = new THREE.Group(), head = new THREE.Group();
  head.scale.setScalar(h); group.add(head);
  const geo = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75)).rotateY(-Math.PI / 2);     // (its seam round the back)
  const base = geo.attributes.position.array.slice();
  const A = sculpt(base, 0, true), B = sculpt(base, 1, false);
  geo.setAttribute('position', new THREE.BufferAttribute(A.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(A.col, 3));
  const rows = Math.round(seg * 0.75);
  geo.computeVertexNormals(); weld(geo.attributes.normal.array, seg, rows);
  const nA = geo.attributes.normal.array.slice();
  const gB = geo.clone(); gB.setAttribute('position', new THREE.BufferAttribute(B.pos, 3)); gB.computeVertexNormals(); weld(gB.attributes.normal.array, seg, rows);
  const dP = new Float32Array(A.pos.length), dN = new Float32Array(A.pos.length);
  for (let i = 0; i < dP.length; i++) { dP[i] = B.pos[i] - A.pos[i]; dN[i] = gB.attributes.normal.array[i] - nA[i]; }
  geo.morphAttributes.position = [new THREE.BufferAttribute(dP, 3)];
  geo.morphAttributes.normal = [new THREE.BufferAttribute(dN, 3)];
  geo.morphTargetsRelative = true;
  gB.dispose();
  const nm = skinNormal().clone(); nm.repeat.set(5, 3); nm.needsUpdate = true;
  const mat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.5, clearcoat: 0.08, clearcoatRoughness: 0.5, sheen: 0.5, sheenRoughness: 0.45, sheenColor: new THREE.Color('#f0dce6'), normalMap: nm, normalScale: new THREE.Vector2(0.35, 0.35) });
  // where the skin is painted black (the eyes, the inside of the mouth) it gives back no light at all,
  // not even a glint
  mat.onBeforeCompile = (sh) => { sh.fragmentShader = sh.fragmentShader.replace('#include <opaque_fragment>', 'outgoingLight *= smoothstep(0.015, 0.12, dot(vColor.rgb, vec3(0.3333)));\n#include <opaque_fragment>'); };
  const face = new THREE.Mesh(geo, mat);
  face.morphTargetInfluences = [0];
  face.castShadow = true; face.receiveShadow = true;
  head.add(face);
  if (ears) {                                                       // (both in one mesh)
    const parts = [-1, 1].map((s) => earGeometry(s).applyMatrix4(new THREE.Matrix4().compose(new V3(s * 0.375, -0.07, -0.05), new THREE.Quaternion().setFromEuler(new THREE.Euler(0, s * 0.42, s * -0.08)), new V3(1, 1, 1))));
    const em = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshPhysicalMaterial({ color: '#c8b8c2', roughness: 0.5, sheen: 0.5, sheenColor: new THREE.Color('#f0d0dc'), side: THREE.DoubleSide }));
    em.castShadow = true; head.add(em);
  }
  let open = 0;
  const api = {
    group, head, face, h,
    // where a neck would join it, in the group's frame
    neckTop: new V3(0, -0.3, -0.1).multiplyScalar(h),
    setOpen(k) { open = Math.max(0, Math.min(1, k)); face.morphTargetInfluences[0] = open; },
  };
  return api;
}
