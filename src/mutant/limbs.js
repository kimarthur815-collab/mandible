import * as THREE from 'three';

// Human hands and arms for the fused bugs: thin, long-fingered, nails grown into claws.
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

export function skinMaterial(color = '#cfc6bc') {
  return new THREE.MeshPhysicalMaterial({ color, roughness: 0.55, clearcoat: 0.25, clearcoatRoughness: 0.5, sheen: 0.45, sheenRoughness: 0.5, sheenColor: new THREE.Color('#e6cccc') });
}
const nailMat = new THREE.MeshPhysicalMaterial({ color: '#4a3a30', roughness: 0.3, clearcoat: 0.8, clearcoatRoughness: 0.15 });

// a tapered segment along +y from 0 to 1 (scaled to length when placed)
function seg(r0, r1, radial = 8) {
  const g = new THREE.CylinderGeometry(r1, r0, 1, radial, 1, false);
  g.translate(0, 0.5, 0);
  return g;
}

// A hand at the wrist (origin), fingers along +z, palm down (-y), thumb toward +x (right hand;
// mirror for a left one). len: wrist to fingertip. curl(0..1) bends the fingers in.
export function makeHand({ len = 0.18, mat = skinMaterial(), claws = true, mirror = false } = {}) {
  const group = new THREE.Group();
  const palmL = len * 0.42, fw = len * 0.075;
  const palm = new THREE.Mesh(new THREE.SphereGeometry(1, 16, 10), mat);
  palm.scale.set(len * 0.24, len * 0.07, palmL * 0.55); palm.position.set(0, 0, palmL * 0.5);
  palm.castShadow = true; group.add(palm);
  const wristM = new THREE.Mesh(new THREE.SphereGeometry(1, 12, 8), mat);
  wristM.scale.set(len * 0.17, len * 0.08, len * 0.12); group.add(wristM);
  const fingers = [];
  // (x across the knuckles, length of each finger, splay)
  const F = [[-0.15, 0.5, -0.12], [-0.05, 0.6, -0.04], [0.05, 0.63, 0.02], [0.15, 0.57, 0.1]];
  const make = (base, flen, spl, thumb) => {
    const lens = [0.45, 0.32, 0.23].map((f) => f * flen * len);
    const parts = [];
    let parent = group;
    const root = new THREE.Group(); root.position.copy(base); root.rotation.y = spl; if (thumb) root.rotation.z = -0.5;
    group.add(root); parent = root;
    for (let k = 0; k < 3; k++) {
      const j = new THREE.Group();
      parent.add(j);
      const r = fw * (1 - k * 0.18) * (thumb ? 1.15 : 1);
      const m = new THREE.Mesh(seg(r, r * 0.86), mat); m.scale.set(1, lens[k], 1); m.rotation.x = Math.PI / 2; m.castShadow = true;
      j.add(m);
      const kn = new THREE.Mesh(new THREE.SphereGeometry(r * 1.05, 8, 6), mat); j.add(kn);
      const nxt = new THREE.Group(); nxt.position.set(0, 0, lens[k]); j.add(nxt);
      parts.push(j); parent = nxt;
    }
    if (claws) {
      const c = new THREE.Mesh(new THREE.ConeGeometry(fw * 0.7, fw * 3.2, 6), nailMat);
      c.rotation.x = Math.PI / 2 + 0.35; c.position.set(0, -fw * 0.3, fw * 1.2); c.castShadow = true;
      parent.add(c);
    }
    fingers.push({ parts, thumb });
  };
  for (const [x, l, spl] of F) make(new V3(x * len, 0, palmL * 0.95 - Math.abs(x) * len * 0.15), l, spl, false);
  make(new V3(0.2 * len, -0.01 * len, palmL * 0.25), 0.42, 0.75, true);
  if (mirror) group.scale.x = -1;
  return {
    group, fingers, len,
    curl(k, t = 0) {
      for (const f of fingers) f.parts.forEach((j, i) => { j.rotation.x = (f.thumb ? 0.25 : 0.35 + 0.25 * i) * k + 0.05 * Math.sin(t * 7 + i + f.parts.length); });
    },
  };
}

// A long arm: shoulder -> elbow -> wrist by two-bone IK, then the hand flat on whatever it reaches
export class Arm {
  constructor({ upper = 0.34, fore = 0.32, hand = 0.17, r = 0.032, mat = skinMaterial(), mirror = false } = {}) {
    this.upper = upper; this.fore = fore; this.mat = mat;
    this.group = new THREE.Group();
    this.uMesh = new THREE.Mesh(seg(r, r * 0.72, 10), mat);
    this.fMesh = new THREE.Mesh(seg(r * 0.72, r * 0.5, 10), mat);
    for (const m of [this.uMesh, this.fMesh]) { m.matrixAutoUpdate = false; m.castShadow = true; m.receiveShadow = true; this.group.add(m); }
    this.elbowM = new THREE.Mesh(new THREE.SphereGeometry(r * 0.8, 10, 8), mat); this.elbowM.castShadow = true; this.group.add(this.elbowM);
    this.shoulderM = new THREE.Mesh(new THREE.SphereGeometry(r * 1.25, 12, 10), mat); this.shoulderM.castShadow = true; this.group.add(this.shoulderM);
    this.hand = makeHand({ len: hand, mat, mirror });
    this.group.add(this.hand.group);
    this.S = new V3(); this.E = new V3(); this.W = new V3();
  }
  // shoulder S, wrist target W, pole (where the elbow points), palm-forward direction fwd
  solve(S, W, pole, fwd, curl = 0.3, t = 0) {
    const a = this.upper, b = this.fore;
    const d = new V3().subVectors(W, S);
    let L = d.length();
    L = Math.min(L, (a + b) * 0.995); L = Math.max(L, Math.abs(a - b) + 1e-3);
    d.normalize();
    const w = S.clone().addScaledVector(d, L);
    const ca = (a * a + L * L - b * b) / (2 * a * L), sa = Math.sqrt(Math.max(0, 1 - ca * ca));
    const pn = pole.clone().sub(S); pn.addScaledVector(d, -pn.dot(d)).normalize();
    const E = S.clone().addScaledVector(d, a * ca).addScaledVector(pn, a * sa);
    this.S.copy(S); this.E.copy(E); this.W.copy(w);
    place(this.uMesh, S, E); place(this.fMesh, E, w);
    this.elbowM.position.copy(E); this.shoulderM.position.copy(S);
    // hand: fingers forward along fwd (flattened onto the ground), palm down
    const z = fwd.clone().setY(Math.min(0, fwd.y)).normalize(), x = new V3().crossVectors(UP, z).normalize(), y = new V3().crossVectors(z, x);
    this.hand.group.matrixAutoUpdate = true;
    this.hand.group.position.copy(w);
    this.hand.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, z));
    this.hand.curl(curl, t);
  }
}
const _y = new V3(), _x = new V3(), _z = new V3();
function place(mesh, p0, p1) {
  _y.subVectors(p1, p0); const L = _y.length() || 1e-5; _y.divideScalar(L);
  _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-6) _z.set(1, 0, 0).addScaledVector(_y, -_y.x); _z.normalize();
  _x.crossVectors(_y, _z);
  mesh.matrix.makeBasis(_x, _y.clone().multiplyScalar(L), _z).setPosition(p0);
  mesh.matrixWorldNeedsUpdate = true;
}

// Hands walking: plant, and when the body has moved on too far, lift and reach forward again
export class HandGait {
  constructor(n) { this.feet = Array.from({ length: n }, () => ({ p: new V3(), from: new V3(), to: new V3(), t: 1, init: false })); }
  update(dt, homes, fwd, speed, reach = 0.18, lift = 0.1, maxSteps = 1) {
    let busy = this.feet.filter((f) => f.t < 1).length;
    this.feet.forEach((f, i) => {
      const h = homes[i];
      if (!f.init) { f.p.copy(h); f.to.copy(h); f.init = true; }
      if (f.t < 1) {
        f.t = Math.min(1, f.t + dt / Math.max(0.12, 0.3 - speed * 0.06));
        const e = f.t * f.t * (3 - 2 * f.t);
        f.p.lerpVectors(f.from, f.to, e); f.p.y += lift * Math.sin(Math.PI * f.t);
      } else if (busy < maxSteps && f.p.distanceTo(h) > reach && !(this.feet[i ^ 1] && this.feet[i ^ 1].t < 1)) {
        f.from.copy(f.p); f.to.copy(h).addScaledVector(fwd, reach * 0.7); f.t = 0; busy++;
      }
    });
  }
}
