// Navigation grid for the bugs: which floor cells are free, which hug a wall,
// which are lit right now, and distance fields (Dijkstra) the bugs walk down.

const SQ2 = Math.SQRT2;
const NB = [[1, 0, 1], [-1, 0, 1], [0, 1, 1], [0, -1, 1], [1, 1, SQ2], [1, -1, SQ2], [-1, 1, SQ2], [-1, -1, SQ2]];

class Heap {
  constructor(cap) { this.k = new Float64Array(cap); this.v = new Int32Array(cap); this.n = 0; }
  clear() { this.n = 0; }
  push(key, val) {
    if (this.n >= this.k.length) {   // grow
      const k = new Float64Array(this.k.length * 2), v = new Int32Array(this.v.length * 2);
      k.set(this.k); v.set(this.v); this.k = k; this.v = v;
    }
    let i = this.n++;
    const K = this.k, V = this.v;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (K[p] <= key) break;
      K[i] = K[p]; V[i] = V[p]; i = p;
    }
    K[i] = key; V[i] = val;
  }
  pop() {   // returns val; key in this.lastKey
    const K = this.k, V = this.v;
    const topV = V[0]; this.lastKey = K[0];
    const n = --this.n;
    if (n > 0) {
      const key = K[n], val = V[n];
      let i = 0;
      for (;;) {
        let c = 2 * i + 1;
        if (c >= n) break;
        if (c + 1 < n && K[c + 1] < K[c]) c++;
        if (K[c] >= key) break;
        K[i] = K[c]; V[i] = V[c]; i = c;
      }
      K[i] = key; V[i] = val;
    }
    return topV;
  }
}

export class NavGrid {
  constructor(colliders, bounds = { x0: -21, x1: 25, z0: -3, z1: 71 }, cs = 0.25, pad = 0.1) {
    this.colliders = colliders;
    this.cs = cs; this.pad = pad;
    this.x0 = bounds.x0; this.z0 = bounds.z0;
    this.W = Math.ceil((bounds.x1 - bounds.x0) / cs);
    this.H = Math.ceil((bounds.z1 - bounds.z0) / cs);
    this.N = this.W * this.H;
    this.blocked = new Uint8Array(this.N);
    this.wall = new Uint8Array(this.N);
    this.lit = new Uint8Array(this.N);
    this.litList = [];
    this.heap = new Heap(1 << 16);
    this.build();
  }

  signature() { let s = this.colliders.length * 104729; this.colliders.forEach((c, i) => { if (c.off) s += (i + 1) * 7919; }); return s; }

  build() {
    const { W, H, cs, pad, blocked, wall } = this;
    blocked.fill(0); wall.fill(0);
    for (const c of this.colliders) {
      if (c.off) continue;
      const i0 = Math.max(0, Math.floor((c.x0 - pad - this.x0) / cs)), i1 = Math.min(W - 1, Math.floor((c.x1 + pad - this.x0) / cs));
      const j0 = Math.max(0, Math.floor((c.z0 - pad - this.z0) / cs)), j1 = Math.min(H - 1, Math.floor((c.z1 + pad - this.z0) / cs));
      for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) blocked[j * W + i] = 1;
    }
    // wall-hugging band: free cells within ~0.5 m of something solid
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = j * W + i;
      if (blocked[k]) continue;
      let near = 0;
      for (let dj = -2; dj <= 2 && !near; dj++) for (let di = -2; di <= 2; di++) {
        const ii = i + di, jj = j + dj;
        if (ii < 0 || jj < 0 || ii >= W || jj >= H || blocked[jj * W + ii]) { near = 1; break; }
      }
      wall[k] = near;
    }
    this.sig = this.signature();
  }

  refreshIfChanged() { if (this.signature() !== this.sig) { this.build(); return true; } return false; }

  idx(x, z) {
    const i = Math.floor((x - this.x0) / this.cs), j = Math.floor((z - this.z0) / this.cs);
    if (i < 0 || j < 0 || i >= this.W || j >= this.H) return -1;
    return j * this.W + i;
  }
  cx(k) { return this.x0 + ((k % this.W) + 0.5) * this.cs; }
  cz(k) { return this.z0 + (Math.floor(k / this.W) + 0.5) * this.cs; }
  free(x, z) { const k = this.idx(x, z); return k >= 0 && !this.blocked[k]; }
  isLit(x, z) { const k = this.idx(x, z); return k >= 0 && this.lit[k] > 0; }

  nearestFree(x, z, maxR = 8) {
    const k0 = this.idx(x, z);
    if (k0 >= 0 && !this.blocked[k0]) return k0;
    const i0 = Math.floor((x - this.x0) / this.cs), j0 = Math.floor((z - this.z0) / this.cs);
    for (let r = 1; r <= maxR; r++) for (let dj = -r; dj <= r; dj++) for (let di = -r; di <= r; di++) {
      if (Math.max(Math.abs(di), Math.abs(dj)) !== r) continue;
      const i = i0 + di, j = j0 + dj;
      if (i < 0 || j < 0 || i >= this.W || j >= this.H) continue;
      const k = j * this.W + i;
      if (!this.blocked[k]) return k;
    }
    return -1;
  }

  // walk the grid from (x0,z0) toward (x1,z1); false if something solid is in the way
  sees(x0, z0, x1, z1) {
    const dx = x1 - x0, dz = z1 - z0, L = Math.hypot(dx, dz), n = Math.ceil(L / (this.cs * 0.7));
    for (let s = 1; s < n; s++) {
      const k = this.idx(x0 + dx * s / n, z0 + dz * s / n);
      if (k < 0 || this.blocked[k]) return false;
    }
    return true;
  }

  // ---- light mask: flashlight cone by marching rays, lamps as discs
  updateLight(flash, lamps) {
    const { lit, litList, W, cs } = this;
    for (const k of litList) lit[k] = 0;
    litList.length = 0;
    const mark = (k, v) => { if (!lit[k]) litList.push(k); lit[k] = Math.max(lit[k], v); };
    if (flash && flash.on) {
      // the beam footprint on the floor: rays across the cone, stopped by walls
      const dx = flash.dir.x, dy = flash.dir.y, dz = flash.dir.z;
      const yaw = Math.atan2(dx, dz), half = flash.angle;
      const h = Math.max(0.3, flash.pos.y);
      const RAYS = 72;
      for (let a = 0; a <= RAYS; a++) {
        const ang = yaw - half * 1.15 + (2 * half * 1.15) * (a / RAYS);
        const sx = Math.sin(ang), sz = Math.cos(ang);
        for (let d = 0.15; d < flash.range; d += cs * 0.7) {
          const x = flash.pos.x + sx * d, z = flash.pos.z + sz * d;
          const k = this.idx(x, z);
          if (k < 0 || this.blocked[k]) break;
          // inside the 3D cone? (floor point vs beam axis)
          const vx = x - flash.pos.x, vy = -h + 0.05, vz = z - flash.pos.z, vl = Math.hypot(vx, vy, vz);
          if ((vx * dx + vy * dy + vz * dz) / vl > Math.cos(half)) mark(k, 1);
        }
      }
    }
    for (const l of lamps) {
      if (!l.on) continue;
      const r = l.r || 4.6, n = Math.ceil(r / cs);
      const i0 = Math.floor((l.x - this.x0) / cs), j0 = Math.floor((l.z - this.z0) / cs);
      for (let dj = -n; dj <= n; dj++) for (let di = -n; di <= n; di++) {
        if ((di * di + dj * dj) * cs * cs > r * r) continue;
        const i = i0 + di, j = j0 + dj;
        if (i < 0 || j < 0 || i >= W || j >= this.H) continue;
        const k = j * W + i;
        if (!this.blocked[k]) mark(k, 2);
      }
    }
  }

  // ---- Dijkstra from goal cells; walls are cheaper (bugs hug them), lit cells expensive
  field(goals, opts = {}, out = null) {
    const { N, W, H, blocked, wall, lit, heap, cs } = this;
    const dist = out && out.length === N ? out : new Float32Array(N);
    dist.fill(Infinity);
    const litCost = opts.litCost || 1, wallCost = opts.wallCost || 1, maxD = opts.maxDist || 1e9;
    heap.clear();
    for (const [x, z] of goals) {
      const k = this.nearestFree(x, z);
      if (k < 0) continue;
      dist[k] = 0; heap.push(0, k);
    }
    while (heap.n) {
      const k = heap.pop(), d = heap.lastKey;
      if (d > dist[k]) continue;
      if (d > maxD) break;
      const i = k % W, j = (k - i) / W;
      for (let n = 0; n < 8; n++) {
        const ii = i + NB[n][0], jj = j + NB[n][1];
        if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
        const kk = jj * W + ii;
        if (blocked[kk]) continue;
        if (n >= 4 && (blocked[j * W + ii] || blocked[jj * W + i])) continue;   // no cutting corners
        let c = NB[n][2] * cs;
        if (wall[kk]) c *= wallCost;
        if (lit[kk]) c *= litCost;
        const nd = Math.fround(d + c);
        if (nd < dist[kk]) { dist[kk] = nd; heap.push(nd, kk); }
      }
    }
    return dist;
  }

  // downhill direction on a field at (x,z); returns false where the field has no value
  descend(dist, x, z, out, sign = 1) {
    const { W, H, blocked } = this;
    const k = this.idx(x, z);
    if (k < 0 || !isFinite(dist[k])) return false;
    const d0 = dist[k], i = k % W, j = (k - i) / W;
    let vx = 0, vz = 0;
    for (let n = 0; n < 8; n++) {
      const ii = i + NB[n][0], jj = j + NB[n][1];
      if (ii < 0 || jj < 0 || ii >= W || jj >= H) continue;
      const kk = jj * W + ii;
      if (blocked[kk] || !isFinite(dist[kk])) continue;
      if (n >= 4 && (blocked[j * W + ii] || blocked[jj * W + i])) continue;
      const drop = sign * (d0 - dist[kk]) / NB[n][2];
      if (drop <= 0) continue;
      const w = drop * drop;
      vx += NB[n][0] / NB[n][2] * w; vz += NB[n][1] / NB[n][2] * w;
    }
    const l = Math.hypot(vx, vz);
    if (l < 1e-9) return false;
    out.x = vx / l; out.z = vz / l;
    return true;
  }

  at(dist, x, z) { const k = this.idx(x, z); return k < 0 ? Infinity : dist[k]; }
}
