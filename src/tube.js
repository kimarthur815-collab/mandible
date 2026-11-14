import * as THREE from 'three';

const UPV = new THREE.Vector3(0, 1, 0);
const XV = new THREE.Vector3(1, 0, 0);

// A tube whose centre line is rewritten every frame (antennae, cerci, palps).
export class Tube {
  constructor(n, m, material) {
    this.n = n; this.m = m;
    const vc = n * (m + 1);
    this.pos = new Float32Array(vc * 3);
    this.nor = new Float32Array(vc * 3);
    const uv = new Float32Array(vc * 2);
    for (let i = 0; i < n; i++) for (let j = 0; j <= m; j++) {
      const k = i * (m + 1) + j;
      uv[k * 2] = i / (n - 1);
      uv[k * 2 + 1] = j / m;
    }
    const idx = [];
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < m; j++) {
      const a = i * (m + 1) + j, b = a + 1, c = a + (m + 1), d = c + 1;
      idx.push(a, b, c, b, d, c);
    }
    const g = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage);
    this.norAttr = new THREE.BufferAttribute(this.nor, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('normal', this.norAttr);
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e4);
    this.geometry = g;
    this.mesh = new THREE.Mesh(g, material);
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = true;
    this.mesh.receiveShadow = true;
    this._T = new THREE.Vector3(); this._N = new THREE.Vector3(); this._B = new THREE.Vector3(); this._t = new THREE.Vector3();
  }

  update(P, R) {
    const { n, m } = this;
    const T = this._T, N = this._N, B = this._B, tmp = this._t;
    for (let i = 0; i < n; i++) {
      const pa = P[Math.max(0, i - 1)], pb = P[Math.min(n - 1, i + 1)];
      T.subVectors(pb, pa).normalize();
      if (i === 0) {
        N.crossVectors(T, Math.abs(T.y) < 0.9 ? UPV : XV).normalize();
      } else {
        tmp.copy(T).multiplyScalar(N.dot(T));
        N.sub(tmp).normalize();
      }
      B.crossVectors(T, N);
      const r = R[i];
      for (let j = 0; j <= m; j++) {
        const ang = (j / m) * Math.PI * 2;
        const c = Math.cos(ang), s = Math.sin(ang);
        const nx = N.x * c + B.x * s, ny = N.y * c + B.y * s, nz = N.z * c + B.z * s;
        const k = (i * (m + 1) + j) * 3;
        this.pos[k] = P[i].x + nx * r; this.pos[k + 1] = P[i].y + ny * r; this.pos[k + 2] = P[i].z + nz * r;
        this.nor[k] = nx; this.nor[k + 1] = ny; this.nor[k + 2] = nz;
      }
    }
    this.posAttr.needsUpdate = true;
    this.norAttr.needsUpdate = true;
  }
}
