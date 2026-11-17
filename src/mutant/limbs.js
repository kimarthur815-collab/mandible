import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

// Human hands for the fused bugs: thin, long-fingered, the nails grown into claws.
const V3 = THREE.Vector3;

// One hand as a single geometry (vertex coloured: skin white, nails dark - tint it with the material
// or per instance). Wrist at the origin, fingers along +z, palm down (-y), thumb toward +x (a right
// hand; mirror for a left one). len: wrist to fingertip. curl 0..1: the fingers bent in and down,
// gripping the floor. lo: fewer triangles (for dozens of them in the game). spread: how far the fingers
// fan out; long: how long they are (both 1 for an ordinary hand).
export function handGeometry({ len = 1, curl = 0.6, mirror = false, lo = false, spread = 1, long = 1 } = {}) {
  const parts = [];
  const skin = new THREE.Color(1, 1, 1), nail = new THREE.Color('#3a2c24');
  const add = (g, m, col) => {
    g.deleteAttribute('uv');
    g.applyMatrix4(m);
    const n = g.attributes.position.count, c = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
    g.setAttribute('color', new THREE.BufferAttribute(c, 3));
    parts.push(g);
  };
  const S = lo ? { pw: 8, ph: 5, fr: 4, kn: 4, kh: 3, cl: 3 } : { pw: 16, ph: 10, fr: 8, kn: 8, kh: 6, cl: 6 };
  const M = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), one = new V3(1, 1, 1);
  const palmL = len * 0.42, fw = len * 0.075;
  add(new THREE.SphereGeometry(1, S.pw, S.ph), M.compose(new V3(0, 0, palmL * 0.5), q.identity(), new V3(len * 0.24, len * 0.07, palmL * 0.55)), skin);
  add(new THREE.SphereGeometry(1, S.pw, S.ph), M.compose(new V3(), q.identity(), new V3(len * 0.17, len * 0.08, len * 0.12)), skin);
  // (x across the knuckles, length of each finger, splay)
  const F = [[-0.15, 0.5, -0.12], [-0.05, 0.6, -0.04], [0.05, 0.63, 0.02], [0.15, 0.57, 0.1]];
  const finger = (base, flen, spl, thumb) => {
    const lens = [0.45, 0.32, 0.23].map((f) => f * flen * len);
    // walk down the finger: each joint bends it further in
    const W = new THREE.Matrix4().compose(base, q.setFromEuler(e.set(0, spl, thumb ? -0.5 : 0)), one);
    for (let k = 0; k < 3; k++) {
      W.multiply(new THREE.Matrix4().makeRotationX((thumb ? 0.25 : 0.35 + 0.25 * k) * curl));
      const r = fw * (1 - k * 0.18) * (thumb ? 1.15 : 1);
      const g = new THREE.CylinderGeometry(r * 0.86, r, lens[k], S.fr, 1, true);
      g.translate(0, lens[k] / 2, 0); g.rotateX(Math.PI / 2);
      add(g, W, skin);
      add(new THREE.SphereGeometry(r * 1.05, S.kn, S.kh), W, skin);
      W.multiply(new THREE.Matrix4().makeTranslation(0, 0, lens[k]));
    }
    const c = new THREE.ConeGeometry(fw * 0.7, fw * 3.2, S.cl);
    c.rotateX(Math.PI / 2 + 0.35); c.translate(0, -fw * 0.3, fw * 1.2);
    add(c, W, nail);
  };
  for (const [x, l, spl] of F) finger(new V3(x * len, 0, palmL * 0.95 - Math.abs(x) * len * 0.15), l * long, spl * spread, false);
  finger(new V3(0.2 * len, -0.01 * len, palmL * 0.25), 0.42 * long, 0.75 + 0.2 * (spread - 1), true);
  const g = mergeGeometries(parts);
  if (mirror) {
    g.scale(-1, 1, 1);
    const ix = g.index.array;
    for (let i = 0; i < ix.length; i += 3) { const t = ix[i + 1]; ix[i + 1] = ix[i + 2]; ix[i + 2] = t; }   // (keep the faces facing out)
  }
  g.computeVertexNormals();
  g.computeBoundingBox();
  return g;
}

export function skinMaterial(color = '#cfc6bc') {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.45, sheenRoughness: 0.5, sheenColor: new THREE.Color('#e6cccc') });
}
