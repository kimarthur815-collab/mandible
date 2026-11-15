// A gloved hand + suit sleeve as a three.js rig: skinned glove mesh, 17 bones, rigid sleeve on
// the forearm bone. Poses are joint angles; a contact solver curls fingers around held objects.
import * as THREE from 'three';
import { buildHand, FINGERS, THUMB } from './handgen.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = THREE.MathUtils.clamp;

// ------------------------------------------------------------------ geometry (right, and a mirrored left)
let GEN = null;
export function handData(opt) { return GEN || (GEN = buildHand(opt)); }

function gloveGeometry(H, mirror) {
  const n = H.pos.length / 3;
  const pos = new Float32Array(H.pos), nrm = new Float32Array(H.nrm);
  if (mirror) for (let i = 0; i < n; i++) { pos[i * 3] *= -1; nrm[i * 3] *= -1; }
  const idx = new Uint32Array(H.index);
  if (mirror) for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  g.setAttribute('aRest', new THREE.BufferAttribute(new Float32Array(H.pos), 3));   // unmirrored, so both hands share a pattern space
  g.setAttribute('aZone', new THREE.BufferAttribute(H.zone, 4));
  g.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(H.sIdx, 4));
  g.setAttribute('skinWeight', new THREE.BufferAttribute(H.sW, 4));
  g.setIndex(new THREE.BufferAttribute(idx, 1));
  return g;
}

// ------------------------------------------------------------------ the suit sleeve
// A baggy tube along +Z (toward the elbow) with soft lengthwise folds, gathered by an elastic band
// at the wrist; the edge rolls inward so it has thickness. In forearm-bone space.
export function sleeveGeometry(seed = 1) {
  const AR = 96, AL = 150;
  const zEdge = 0.014, zBand = 0.040, zEnd = 0.52;
  const pts = [];
  // profile along the sleeve: s -> [z, rx, ry, inner]
  const prof = [];
  const lip = 10;
  for (let i = 0; i <= AL; i++) {
    const u = i / AL;
    const z = zEnd + (zEdge - zEnd) * Math.pow(u, 0.85);
    prof.push({ z, inner: 0 });
  }
  for (let i = 1; i <= lip; i++) prof.push({ z: zEdge + 0.006 * (i / lip), inner: i / lip });
  const rnd = (a) => Math.sin(a * 12.9898 + seed * 78.233) * 43758.5453 % 1;
  const ph = [rnd(1), rnd(2), rnd(3), rnd(4)].map((x) => x * 6.28);
  const R = (z, a) => {
    // baggy over the forearm, puffed just behind the band, pulled in by the elastic
    const band = clamp((zBand - z) / (zBand - zEdge), 0, 1);      // 1 at the edge, 0 behind the band
    const blouse = Math.exp(-Math.pow((z - 0.062) / 0.022, 2));
    let rx = 0.0405 + (z - 0.06) * 0.028 + blouse * 0.005, ry = 0.0345 + (z - 0.06) * 0.022 + blouse * 0.005;
    rx = rx * (1 - band) + 0.0345 * band; ry = ry * (1 - band) + 0.0265 * band;
    // gathered pleats in the elastic band, fading into soft folds behind it
    const pleat = Math.sin(a * 23 + Math.sin(a * 5 + ph[0]) * 1.2) * (0.06 * band + 0.035 * blouse);
    const folds = Math.sin(a * 3 + ph[1] + z * 18) * 0.05 + Math.sin(a * 7 + ph[2] - z * 31) * 0.025 + Math.sin(a * 13 + ph[3] + z * 60) * 0.012;
    const k = 1 + pleat + folds * (1 - band) * clamp((z - 0.03) / 0.05, 0, 1);
    // the cloth sags toward the palm side
    const sag = Math.max(0, -Math.sin(a)) * 0.004 * (1 - band);
    return [rx * k, ry * k + sag];
  };
  for (let i = 0; i < prof.length; i++) {
    const { z, inner } = prof[i];
    for (let j = 0; j <= AR; j++) {
      const a = (j / AR) * Math.PI * 2;
      let [rx, ry] = R(inner > 0 ? zEdge : z, a);
      if (inner > 0) { const sh = 1 - 0.07 * Math.sin(inner * Math.PI * 0.5); rx *= sh; ry *= sh; }
      pts.push(Math.cos(a) * rx, Math.sin(a) * ry - (inner > 0 ? 0 : 0), z);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  const uv = [];
  for (let i = 0; i < prof.length; i++) for (let j = 0; j <= AR; j++) uv.push(j / AR * 1.6, prof[i].z / 0.16 + (prof[i].inner ? prof[i].inner * 0.05 : 0));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  const index = [];
  for (let i = 0; i < prof.length - 1; i++) for (let j = 0; j < AR; j++) {
    const a = i * (AR + 1) + j, b = a + AR + 1;
    index.push(a, a + 1, b, b, a + 1, b + 1);
  }
  g.setIndex(index);
  g.computeVertexNormals();
  return g;
}

// ------------------------------------------------------------------ a hand rig
// Joint axes are given for the right hand; the left uses the mirrored ones (axis -> -M axis).
export class Hand {
  constructor(side, mats) {
    this.side = side;
    const H = handData();
    this.H = H;
    const mir = side === 'left';
    this.mir = mir;
    this.uBend = { value: new Array(15).fill(0) };
    this.mesh = new THREE.SkinnedMesh(gloveGeometry(H, mir), mats.glove(this.uBend));
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    // bones
    const B = H.sk.bones;
    this.bones = B.map((b) => { const o = new THREE.Bone(); o.name = b.name; return o; });
    const M = (p) => new V3(mir ? -p[0] : p[0], p[1], p[2]);
    B.forEach((b, i) => {
      const o = this.bones[i];
      const pp = b.parent >= 0 ? M(B[b.parent].pos) : new V3();
      o.position.copy(M(b.pos)).sub(pp);
      if (b.parent >= 0) this.bones[b.parent].add(o);
    });
    this.root = this.bones[0];
    this.mesh.add(this.root);
    this.mesh.bind(new THREE.Skeleton(this.bones));
    // rest data in this hand's own (possibly mirrored) frame
    this.rest = B.map((b) => ({ pos: M(b.pos), a: b.a ? M(b.a) : null, b: b.b ? M(b.b) : null, r: b.r, r2: b.r2, dir: b.dir ? M(b.dir).normalize() : null }));
    this.chains = H.sk.chains.map((c) => ({ ids: c.ids, tip: M(c.tip), dir: M(c.dir).normalize() }));
    // joint axes (right-hand definitions; mirrored for the left)
    const ax = (v) => (mir ? new V3(v.x, -v.y, -v.z) : v.clone()).normalize();
    const palmN = new V3(0, -1, 0);
    this.axes = this.chains.map((c, ci) => {
      const d = new V3(...(ci < 4 ? FINGERS[ci].dir : THUMB.dir)).normalize();
      if (ci < 4) return { flex: ax(new V3().crossVectors(d, palmN)), abd: ax(new V3(0, 1, 0)) };
      // thumb: flexes across the palm toward the pinky, abducts away from the palm, rolls about itself
      const pad = new V3(0.62, -0.62, 0.15).normalize();
      return { flex: ax(new V3().crossVectors(d, pad)), abd: ax(new V3().crossVectors(d, new V3(0, -1, 0.25).normalize())), roll: ax(d) };
    });
    // sleeve
    this.sleeve = new THREE.Mesh(sleeveGeometry(mir ? 2 : 1), mats.sleeve);
    if (mir) this.sleeve.scale.x = -1;
    this.sleeve.castShadow = true; this.sleeve.receiveShadow = true;
    this.root.add(this.sleeve);
    // pose state
    this.ang = this.chains.map(() => [0, 0, 0, 0, 0]);   // per chain: [flex0, flex1, flex2, abd, roll]
    this.held = null;
  }

  // local quaternion of chain c, segment k for the given angles
  jointQ(c, k, a, out = new Q()) {
    const A = this.axes[c];
    out.setFromAxisAngle(A.flex, a[k]);
    if (k === 0) {
      out.premultiply(new Q().setFromAxisAngle(A.abd, a[3]));
      if (c === 4) out.multiply(new Q().setFromAxisAngle(A.roll, a[4]));
    }
    return out;
  }

  // forward kinematics in the hand frame: joint positions + segment radii for chain c
  fk(c, a) {
    const ids = this.chains[c].ids, R = this.rest;
    const pts = [R[ids[0]].pos.clone()], rads = [];
    const rot = new Q();
    for (let k = 0; k < 3; k++) {
      rot.multiply(this.jointQ(c, k, a));
      const from = R[ids[k]].pos, to = k < 2 ? R[ids[k + 1]].pos : R[ids[k]].b;
      pts.push(pts[k].clone().add(to.clone().sub(from).applyQuaternion(rot)));
      rads.push([R[ids[k]].r, R[ids[k]].r2]);
    }
    return { pts, rads };
  }

  // curl a chain until each segment touches `sdf` (hand-frame distance function), like closing a
  // hand around an object: joints stop when the link they move touches; the rest keep going
  grasp(c, sdf, { start = [0, 0, 0], max = [1.6, 1.85, 1.3], rate = [1, 1.15, 0.85], abd = 0, roll = 0, tol = 0.0004, skip0 = 0.45 } = {}) {
    const a = [start[0], start[1], start[2], abd, roll];
    const active = [true, true, true];
    const step = 0.02;
    const hits = (k0) => {
      const { pts, rads } = this.fk(c, a);
      for (let k = k0; k < 3; k++) {
        for (const s of [0.2, 0.45, 0.7, 0.95, 1.0]) {
          if (k === 0 && s < skip0) continue;
          const p = pts[k].clone().lerp(pts[k + 1], s);
          const r = rads[k][0] + (rads[k][1] - rads[k][0]) * s;
          if (sdf(p) < r - tol) return k;
        }
      }
      return -1;
    };
    if (hits(0) >= 0) return a;           // already in contact at the start
    for (let it = 0; it < 200 && active.some((x) => x); it++) {
      const prev = a.slice();
      for (let k = 0; k < 3; k++) if (active[k]) a[k] = Math.min(max[k], a[k] + step * rate[k]);
      const h = hits(0);
      if (h >= 0) {
        // undo, and freeze every joint that moves the touching link
        for (let k = 0; k < 3; k++) a[k] = prev[k];
        for (let k = 0; k <= h; k++) active[k] = false;
      }
      for (let k = 0; k < 3; k++) if (a[k] >= max[k]) active[k] = false;
    }
    return a;
  }

  // thumb: search the base joint (flex, abduction, roll) so the pad lands near `target` without
  // going into the object or the other fingers, then curl the last two joints onto the surface
  thumbTo(target, sdf, { mcp = 0.35, ip = 0.3, others = null } = {}) {
    const obst = (p) => {
      let d = sdf(p);
      if (others) for (const [a, b, r] of others) {
        const ab = b.clone().sub(a), t = clamp(p.clone().sub(a).dot(ab) / ab.lengthSq(), 0, 1);
        d = Math.min(d, p.distanceTo(a.clone().addScaledVector(ab, t)) - r);
      }
      return d;
    };
    let best = null;
    const cost = (a) => {
      const { pts, rads } = this.fk(4, a);
      // the pad is a little behind the tip, on the inside of the curl
      const pad = pts[3].clone().lerp(pts[2], 0.25);
      let c = pad.distanceTo(target);
      for (let k = 0; k < 3; k++) for (const s of [0.3, 0.6, 0.9, 1]) {
        if (k === 0 && s < 0.6) continue;
        const p = pts[k].clone().lerp(pts[k + 1], s), r = rads[k][0] + (rads[k][1] - rads[k][0]) * s;
        const pen = r - obst(p);
        if (pen > 0.0005) c += (pen - 0.0005) * 6;
      }
      return c;
    };
    for (let f = -0.4; f <= 1.21; f += 0.1) for (let b = -0.4; b <= 1.41; b += 0.1) for (let r = -0.8; r <= 1.21; r += 0.2) {
      const a = [f, mcp, ip, b, r], c = cost(a);
      if (!best || c < best.c) best = { a, c };
    }
    // local refine
    let a = best.a.slice(), c = best.c;
    for (const st of [0.05, 0.025, 0.012]) for (let it = 0; it < 30; it++) {
      let moved = false;
      for (const k of [0, 3, 4, 1, 2]) for (const d of [-st, st]) {
        const t = a.slice(); t[k] += d; const tc = cost(t);
        if (tc < c) { a = t; c = tc; moved = true; }
      }
      if (!moved) break;
    }
    return a;
  }

  // segment list of chain c at angles a (for use as obstacles)
  capsules(c, a) {
    const { pts, rads } = this.fk(c, a);
    return [0, 1, 2].map((k) => [pts[k], pts[k + 1], rads[k][0]]);
  }

  // apply angles to bones and crease uniforms
  applyAngles() {
    for (let c = 0; c < 5; c++) {
      const ids = this.chains[c].ids, a = this.ang[c];
      for (let k = 0; k < 3; k++) this.jointQ(c, k, a, this.bones[ids[k]].quaternion);
    }
    const b = this.uBend.value;
    for (let f = 0; f < 4; f++) { b[f] = this.ang[f][0] / 1.4; b[4 + f] = this.ang[f][1] / 1.6; b[8 + f] = this.ang[f][2] / 1.2; }
    b[12] = this.ang[4][1] / 1.0; b[13] = this.ang[4][2] / 1.2; b[14] = 0;
  }

  // place: forearm bone at the wrist, pointing to the elbow, rolled to match the hand (no candy-wrap)
  place(wrist, handQ, elbow) {
    const z = elbow.clone().sub(wrist).normalize();
    const up = new V3(0, 1, 0).applyQuaternion(handQ);
    const x = new V3().crossVectors(up, z).normalize();
    const y = new V3().crossVectors(z, x);
    const fq = new Q().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.root.position.copy(wrist);
    this.root.quaternion.copy(fq);
    this.bones[1].quaternion.copy(fq.clone().invert().multiply(handQ));
    // wrist bend for the cuff creases
    const fwdHand = new V3(0, 0, -1).applyQuaternion(handQ), fwdArm = z.clone().negate();
    this.uBend.value[14] = clamp(fwdHand.angleTo(fwdArm) / 0.8, 0, 1);
  }
}

// hand-frame rotation that sends hand axis `a` to world `A` and hand axis `u` (perpendicular) as close as possible to world `U`
export function frameQ(a, u, A, U) {
  const e1 = a.clone().normalize(), e2 = u.clone().sub(e1.clone().multiplyScalar(u.dot(e1))).normalize(), e3 = new V3().crossVectors(e1, e2);
  const f1 = A.clone().normalize(), f2 = U.clone().sub(f1.clone().multiplyScalar(U.dot(f1))).normalize(), f3 = new V3().crossVectors(f1, f2);
  const ME = new THREE.Matrix4().makeBasis(e1, e2, e3), MF = new THREE.Matrix4().makeBasis(f1, f2, f3);
  return new Q().setFromRotationMatrix(MF.multiply(ME.transpose()));
}
