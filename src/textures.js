import * as THREE from 'three';

// ---------- noise helpers ----------
export function hash2(ix, iy, seed) {
  let h = (Math.imul(ix | 0, 374761393) + Math.imul(iy | 0, 668265263) + Math.imul(seed | 0, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h = h ^ (h >>> 16);
  return (h >>> 0) / 4294967296;
}
const sm = (t) => t * t * (3 - 2 * t);
export const sstep = (a, b, x) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function vnoise(x, y, seed, px = 0, py = 0) {
  let ix = Math.floor(x), iy = Math.floor(y);
  const fx = x - ix, fy = y - iy;
  let ix1 = ix + 1, iy1 = iy + 1;
  if (px) { ix = ((ix % px) + px) % px; ix1 = ((ix1 % px) + px) % px; }
  if (py) { iy = ((iy % py) + py) % py; iy1 = ((iy1 % py) + py) % py; }
  const a = hash2(ix, iy, seed), b = hash2(ix1, iy, seed), c = hash2(ix, iy1, seed), d = hash2(ix1, iy1, seed);
  const ux = sm(fx), uy = sm(fy);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

export function fbm(x, y, seed, oct = 5, px = 0, py = 0) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) {
    s += a * vnoise(x * f, y * f, seed + i * 101, px * f, py * f);
    n += a; a *= 0.5; f *= 2;
  }
  return s / n;
}

// tileable grid of fbm values (freq = integer cells across)
export function fbmGrid(N, freq, seed, oct = 5, tile = true) {
  const out = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    out[y * N + x] = fbm((x / N) * freq, (y / N) * freq, seed, oct, tile ? freq : 0, tile ? freq : 0);
  }
  return out;
}

export function sampleGrid(G, N, u, v) {
  const x = u * N - 0.5, y = v * N - 0.5;
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const w = (i) => ((i % N) + N) % N;
  const X0 = w(x0), X1 = w(x0 + 1), Y0 = w(y0), Y1 = w(y0 + 1);
  const a = G[Y0 * N + X0], b = G[Y0 * N + X1], c = G[Y1 * N + X0], d = G[Y1 * N + X1];
  return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
}

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

export function heightToNormal(H, w, h, strength, wrap = true) {
  const c = canvas(w, h), ctx = c.getContext('2d');
  const img = ctx.createImageData(w, h), d = img.data;
  for (let y = 0; y < h; y++) {
    const yu = wrap ? (y - 1 + h) % h : Math.max(0, y - 1);
    const yd = wrap ? (y + 1) % h : Math.min(h - 1, y + 1);
    for (let x = 0; x < w; x++) {
      const xl = wrap ? (x - 1 + w) % w : Math.max(0, x - 1);
      const xr = wrap ? (x + 1) % w : Math.min(w - 1, x + 1);
      const du = (H[y * w + xr] - H[y * w + xl]) * strength;
      const dv = (H[yu * w + x] - H[yd * w + x]) * strength;
      let nx = -du, ny = -dv, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y * w + x) * 4;
      d[i] = (nx * 0.5 + 0.5) * 255;
      d[i + 1] = (ny * 0.5 + 0.5) * 255;
      d[i + 2] = (nz * 0.5 + 0.5) * 255;
      d[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

function tex(c, { srgb = false, wrap = true, aniso = 8 } = {}) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (wrap) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  t.anisotropy = aniso;
  t.needsUpdate = true;
  return t;
}

const mix3 = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex3 = (h) => { const c = parseInt(h.slice(1), 16); return [(c >> 16 & 255) / 255, (c >> 8 & 255) / 255, (c & 255) / 255]; };

// ---------- pronotum (head shield) ----------
export function makePronotumTextures(R, bbox, N = 1024) {
  const H = new Float32Array(N * N);
  const col = canvas(N, N), cctx = col.getContext('2d'), cimg = cctx.createImageData(N, N), cd = cimg.data;
  const rgh = canvas(N, N), rctx = rgh.getContext('2d'), rimg = rctx.createImageData(N, N), rd = rimg.data;
  const low = fbmGrid(128, 5, 11, 4, false);
  const spot = fbmGrid(256, 22, 23, 3, true);
  const fine = fbmGrid(256, 110, 37, 2, true);
  const pale = hex3('#a87a44'), paleD = hex3('#8e602e'), mid = hex3('#5a2610'), dark = hex3('#1a0904'), rim = hex3('#5e3214');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = 1 - (y + 0.5) / N;
    const X = bbox.minx + u * (bbox.maxx - bbox.minx);
    const Z = bbox.minz + v * (bbox.maxz - bbox.minz);
    const phi = Math.atan2(Z, X);
    const r = Math.hypot(X, Z) / R(phi);
    const n1 = sampleGrid(low, 128, u, v);
    const ns = sampleGrid(spot, 256, u, v);
    const nf = sampleGrid(fine, 256, u * 2, v * 2);
    // central dark blotch: wider band in front, two lobes at the rear
    let rm = r * (1 + 0.12 * Math.max(0, Math.sin(phi))) + (n1 - 0.5) * 0.12;
    rm *= 1 - 0.07 * Math.cos(2 * phi) * (Math.sin(phi) < 0 ? 1 : 0.3);
    const darkT = 1 - sstep(0.7, 0.82, rm);
    const midT = 1 - sstep(0.78, 0.92, rm);
    let c = mix3(pale, paleD, sstep(0.3, 0.8, n1));
    c = mix3(c, mid, midT);
    c = mix3(c, dark, darkT * 0.96);
    // dark freckles inside the pale margin
    const fr = sstep(0.7, 0.8, ns) * (1 - midT) * 0.45;
    c = mix3(c, mid, fr);
    // darker very edge
    c = mix3(c, rim, sstep(0.93, 1.0, r) * 0.7);
    const g = 0.86 + 0.24 * nf;
    const i = (y * N + x) * 4;
    cd[i] = Math.min(255, c[0] * g * 255);
    cd[i + 1] = Math.min(255, c[1] * g * 255);
    cd[i + 2] = Math.min(255, c[2] * g * 255);
    cd[i + 3] = 255;
    // height: fine pits, median groove, rim ridge
    const groove = Math.exp(-(X * X) / 0.0006) * (1 - sstep(0.35, 0.75, r));
    const ridge = sstep(0.88, 0.95, r) * (1 - sstep(0.96, 1.0, r));
    H[y * N + x] = 0.5 + 0.12 * (nf - 0.5) - 0.45 * groove + 0.35 * ridge;
    const rr = 0.24 + 0.1 * (1 - darkT) + 0.12 * (nf - 0.5) + 0.06 * fr;
    rd[i] = rd[i + 1] = rd[i + 2] = Math.max(0, Math.min(255, rr * 255));
    rd[i + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  const nrm = heightToNormal(H, N, N, 3.5, false);
  return {
    map: tex(col, { srgb: true, wrap: false }),
    roughnessMap: tex(rgh, { wrap: false }),
    normalMap: tex(nrm, { wrap: false }),
  };
}

// ---------- forewing (tegmen) ----------
export function makeWingTextures(W = 512, Hh = 1024, seed = 1) {
  const veins = canvas(W, Hh), vx = veins.getContext('2d');
  vx.fillStyle = '#000'; vx.fillRect(0, 0, W, Hh);
  const P = (u, v) => [u * W, (1 - v) * Hh];
  let rs = seed * 9301 + 49297;
  const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };

  const paths = [];
  const line = (pts, w) => paths.push({ pts, w });
  const curve = (f, v0, v1, steps = 40) => {
    const pts = [];
    for (let i = 0; i <= steps; i++) { const v = v0 + (v1 - v0) * (i / steps); pts.push([f(v), v]); }
    return pts;
  };
  // costal margin and subcosta
  line(curve((v) => 0.965 - 0.04 * v * v, 0.0, 0.9), 3.2);
  line(curve((v) => 0.86 + 0.1 * Math.pow(v / 0.5, 1.6), 0.0, 0.5), 2.2);
  // radius (main vein) with oblique branches running to the outer margin
  const radius = (v) => 0.66 - 0.06 * v + 0.04 * Math.sin(v * 2.4);
  line(curve(radius, 0.0, 0.97), 3.0);
  for (let k = 0; k < 18; k++) {
    const v0 = 0.12 + k * 0.047 + rnd() * 0.01;
    const u0 = radius(v0);
    const v1 = Math.min(0.99, v0 + 0.1 + 0.05 * k / 18);
    const u1 = Math.min(0.975 - 0.04 * v1 * v1, 0.99) - (k > 13 ? (k - 13) * 0.05 : 0);
    const pts = [];
    for (let i = 0; i <= 12; i++) {
      const t = i / 12;
      pts.push([u0 + (u1 - u0) * t, v0 + (v1 - v0) * Math.pow(t, 0.8)]);
    }
    line(pts, 1.6);
  }
  // media / cubitus fanning toward the tip and inner margin
  const fans = [
    [0.52, 0.0, 0.5, 0.98], [0.47, 0.0, 0.36, 0.97], [0.43, 0.02, 0.24, 0.94],
    [0.4, 0.05, 0.13, 0.88], [0.38, 0.1, 0.06, 0.78],
  ];
  for (const [ua, va, ub, vb] of fans) {
    const pts = [];
    for (let i = 0; i <= 30; i++) {
      const t = i / 30;
      pts.push([ua + (ub - ua) * Math.pow(t, 1.3) + 0.015 * Math.sin(t * 9 + ua * 10), va + (vb - va) * t]);
    }
    line(pts, 2.0);
    // forks
    for (let f = 0; f < 2; f++) {
      const t0 = 0.45 + f * 0.22 + rnd() * 0.05;
      const [fu, fv] = pts[Math.floor(t0 * 30)];
      line([[fu, fv], [fu - 0.05 - rnd() * 0.04, Math.min(0.99, fv + 0.14)]], 1.3);
    }
  }
  // claval furrow + anal veins near the inner base
  line(curve((v) => 0.34 - 0.75 * v, 0.0, 0.4), 2.4);
  for (let k = 0; k < 4; k++) {
    const a = 0.1 + k * 0.06;
    line(curve((v) => a - 0.55 * v, 0.0, a / 0.6), 1.3);
  }

  vx.lineCap = 'round'; vx.lineJoin = 'round';
  const drawAll = (wMul, alpha, blur) => {
    vx.filter = blur ? `blur(${blur}px)` : 'none';
    vx.strokeStyle = `rgba(255,255,255,${alpha})`;
    for (const p of paths) {
      vx.lineWidth = p.w * wMul;
      vx.beginPath();
      p.pts.forEach(([u, v], i) => { const [x, y] = P(u, v); if (i) vx.lineTo(x, y); else vx.moveTo(x, y); });
      vx.stroke();
    }
  };
  drawAll(3.2, 0.25, 3);
  drawAll(1.0, 0.95, 0.6);
  // reticulate cross-veins
  vx.filter = 'blur(0.5px)';
  vx.strokeStyle = 'rgba(255,255,255,0.35)';
  vx.lineWidth = 0.9;
  for (let k = 0; k < 900; k++) {
    const u = rnd(), v = rnd();
    const a = rnd() * Math.PI;
    const l = 0.008 + rnd() * 0.012;
    const [x, y] = P(u, v);
    vx.beginPath(); vx.moveTo(x, y); vx.lineTo(x + Math.cos(a) * l * W, y + Math.sin(a) * l * Hh); vx.stroke();
  }
  vx.filter = 'none';
  const vd = vx.getImageData(0, 0, W, Hh).data;

  const H = new Float32Array(W * Hh);
  const col = canvas(W, Hh), cctx = col.getContext('2d'), cimg = cctx.createImageData(W, Hh), cd = cimg.data;
  const rgh = canvas(W, Hh), rctx = rgh.getContext('2d'), rimg = rctx.createImageData(W, Hh), rd = rimg.data;
  const nlow = fbmGrid(128, 6, 77 + seed, 4, false);
  const nfine = fbmGrid(256, 48, 91 + seed, 2, true);
  const base0 = hex3('#2c1008'), base1 = hex3('#5e2812'), tip = hex3('#7a3e20'), costa = hex3('#8a5530'), veinC = hex3('#2a0e05');
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = 1 - (y + 0.5) / Hh;
    const i = y * W + x;
    const vein = vd[i * 4] / 255;
    const nl = sampleGrid(nlow, 128, u, v);
    const nf = sampleGrid(nfine, 256, u, v * 2);
    let c = mix3(base0, base1, sstep(0.0, 0.3, v));
    c = mix3(c, tip, sstep(0.65, 1.0, v) * 0.55);
    c = mix3(c, costa, sstep(0.8, 0.97, u) * 0.4 * (1 - sstep(0.7, 1.0, v)));
    c = mix3(c, base0, (1 - sstep(0.0, 0.1, u)) * 0.3);
    c = mix3(c, veinC, vein * 0.3);
    const g = 0.85 + 0.3 * nl * 0.6 + 0.12 * (nf - 0.5);
    const k = i * 4;
    cd[k] = Math.min(255, c[0] * g * 255);
    cd[k + 1] = Math.min(255, c[1] * g * 255);
    cd[k + 2] = Math.min(255, c[2] * g * 255);
    cd[k + 3] = 255;
    H[i] = vein * 0.75 + 0.1 * (nf - 0.5) + 0.06 * nl;
    const rr = 0.3 + 0.12 * vein + 0.08 * (nf - 0.5);
    rd[k] = rd[k + 1] = rd[k + 2] = Math.max(0, Math.min(255, rr * 255)); rd[k + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return {
    map: tex(col, { srgb: true, wrap: false }),
    roughnessMap: tex(rgh, { wrap: false }),
    normalMap: tex(heightToNormal(H, W, Hh, 5.0, false), { wrap: false }),
  };
}

// ---------- hind wing membrane (rgba) ----------
export function makeHindWingTexture(N = 512) {
  const c = canvas(N, N), x = c.getContext('2d');
  // membrane gradient
  const g = x.createLinearGradient(0, N, 0, 0);
  g.addColorStop(0, 'rgba(110,70,40,0.55)');
  g.addColorStop(0.6, 'rgba(150,108,72,0.36)');
  g.addColorStop(1, 'rgba(120,80,50,0.5)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  // sclerotized leading edge (u near 1)
  const lg = x.createLinearGradient(N * 0.82, 0, N, 0);
  lg.addColorStop(0, 'rgba(70,35,15,0)');
  lg.addColorStop(1, 'rgba(70,35,15,0.92)');
  x.fillStyle = lg; x.fillRect(N * 0.82, 0, N * 0.18, N);
  let rs = 12345;
  const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
  x.lineCap = 'round';
  const radial = [];
  for (let k = 0; k <= 16; k++) radial.push(k / 16 * 0.96 + 0.02);
  x.strokeStyle = 'rgba(50,25,10,0.95)';
  for (const u0 of radial) {
    x.lineWidth = 2.2;
    x.beginPath();
    for (let i = 0; i <= 40; i++) {
      const v = i / 40;
      const u = u0 + 0.01 * Math.sin(v * 7 + u0 * 20);
      const px = u * N, py = (1 - v) * N;
      if (i) x.lineTo(px, py); else x.moveTo(px, py);
    }
    x.stroke();
  }
  x.lineWidth = 1.1;
  x.strokeStyle = 'rgba(55,28,12,0.8)';
  for (let k = 0; k < 220; k++) {
    const i = Math.floor(rnd() * (radial.length - 1));
    const v = 0.15 + rnd() * 0.8;
    x.beginPath();
    x.moveTo(radial[i] * N, (1 - v) * N);
    x.lineTo(radial[i + 1] * N, (1 - v - (rnd() - 0.5) * 0.02) * N);
    x.stroke();
  }
  // darker outer margin
  const eg = x.createLinearGradient(0, N * 0.06, 0, 0);
  eg.addColorStop(0, 'rgba(60,30,12,0)');
  eg.addColorStop(1, 'rgba(60,30,12,0.7)');
  x.fillStyle = eg; x.fillRect(0, 0, N, N * 0.06);
  const t = tex(c, { srgb: true, wrap: false });
  return t;
}

// ---------- small tileable chitin micro-detail normal ----------
export function makeChitinNormal(N = 256) {
  const a = fbmGrid(N, 12, 501, 4, true), b = fbmGrid(N, 40, 777, 2, true);
  const H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) H[i] = a[i] * 0.55 + b[i] * 0.45;
  return tex(heightToNormal(H, N, N, 3.0, true));
}

// ---------- compound eye facets ----------
export function makeEyeNormal() {
  const cols = 16, a = 16, W = cols * a;
  const rowH = a * Math.sqrt(3);
  const Hh = Math.round(rowH * 8);
  const H = new Float32Array(W * Hh);
  const sy = (rowH * 8) / Hh;
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const px = x + 0.5, py = (y + 0.5) * sy;
    let best = 1e9;
    for (const [ox, oy] of [[0, 0], [a / 2, rowH / 2]]) {
      const gx = Math.round((px - ox) / a), gy = Math.round((py - oy) / rowH);
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
        const cx = (gx + dx) * a + ox, cy = (gy + dy) * rowH + oy;
        best = Math.min(best, Math.hypot(px - cx, py - cy));
      }
    }
    const r = best / (a * 0.58);
    H[y * W + x] = Math.max(0, 1 - r * r);
  }
  return tex(heightToNormal(H, W, Hh, 1.6, true));
}

// ---------- segmented rings (antennae, cerci, palps) ----------
export function makeRingTextures() {
  const W = 64, Hh = 16;
  const H = new Float32Array(W * Hh);
  const col = canvas(W, Hh), x = col.getContext('2d'), img = x.createImageData(W, Hh), d = img.data;
  const body = hex3('#6a3218'), joint = hex3('#4e2410');
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W;
    const h = sstep(0.0, 0.18, u) * (1 - sstep(0.82, 1.0, u));
    H[j * W + i] = h;
    const c = mix3(joint, body, sstep(0.0, 0.3, h));
    const k = (j * W + i) * 4;
    d[k] = c[0] * 255; d[k + 1] = c[1] * 255; d[k + 2] = c[2] * 255; d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return { map: tex(col, { srgb: true }), normalMap: tex(heightToNormal(H, W, Hh, 0.6, true)) };
}

// ---------- concrete floor ----------
export function makeFloorTextures(N = 1024) {
  const lowA = fbmGrid(256, 4, 1001, 5, true);
  const lowB = fbmGrid(256, 9, 1002, 4, true);
  const wet = fbmGrid(128, 3, 1003, 4, true);
  const grain = fbmGrid(512, 96, 1004, 2, true);
  const grit = fbmGrid(512, 220, 1005, 1, true);
  const H = new Float32Array(N * N);
  const col = canvas(N, N), cctx = col.getContext('2d'), cimg = cctx.createImageData(N, N), cd = cimg.data;
  const rgh = canvas(N, N), rctx = rgh.getContext('2d'), rimg = rctx.createImageData(N, N), rd = rimg.data;
  const c0 = hex3('#524d46'), c1 = hex3('#757067'), stain = hex3('#2e261e'), rust = hex3('#503420');

  // cracks + stains drawn on a canvas (wrapped for tiling)
  const deco = canvas(N, N), dx = deco.getContext('2d');
  dx.fillStyle = '#000'; dx.fillRect(0, 0, N, N);
  let rs = 4242;
  const rnd = () => { rs = (rs * 9301 + 49297) % 233280; return rs / 233280; };
  const wrapDraw = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { dx.save(); dx.translate(ox, oy); fn(); dx.restore(); } };
  // stains (green channel)
  for (let k = 0; k < 9; k++) {
    const cx = rnd() * N, cy = rnd() * N, r = 40 + rnd() * 140;
    wrapDraw(() => {
      const g = dx.createRadialGradient(cx, cy, r * 0.2, cx, cy, r);
      g.addColorStop(0, 'rgba(0,140,0,0.6)'); g.addColorStop(0.8, 'rgba(0,200,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)');
      dx.globalCompositeOperation = 'lighter';
      dx.fillStyle = g; dx.beginPath(); dx.ellipse(cx, cy, r, r * (0.6 + rnd() * 0.4), rnd() * 3, 0, Math.PI * 2); dx.fill();
    });
  }
  // cracks (red channel)
  dx.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 4; k++) {
    let x = rnd() * N, y = rnd() * N, a = rnd() * Math.PI * 2;
    const pts = [[x, y]];
    const steps = 30 + Math.floor(rnd() * 60);
    for (let s = 0; s < steps; s++) {
      a += (rnd() - 0.5) * 0.9; x += Math.cos(a) * 7; y += Math.sin(a) * 7; pts.push([x, y]);
    }
    wrapDraw(() => {
      dx.strokeStyle = 'rgba(255,0,0,0.7)'; dx.lineWidth = 0.8 + rnd() * 0.6;
      dx.beginPath(); pts.forEach(([px, py], i) => (i ? dx.lineTo(px, py) : dx.moveTo(px, py))); dx.stroke();
    });
  }
  const dd = dx.getImageData(0, 0, N, N).data;

  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = (y + 0.5) / N;
    const i = y * N + x, k = i * 4;
    const a = sampleGrid(lowA, 256, u, v), b = sampleGrid(lowB, 256, u, v);
    const w = sampleGrid(wet, 128, u, v);
    const gr = sampleGrid(grain, 512, u, v), gt = sampleGrid(grit, 512, u, v);
    const crack = dd[k] / 255, st = dd[k + 1] / 255;
    let c = mix3(c0, c1, sstep(0.3, 0.75, a));
    c = mix3(c, stain, st * 0.55);
    c = mix3(c, rust, sstep(0.62, 0.8, b) * 0.35);
    const wetT = sstep(0.56, 0.64, w);
    c = mix3(c, [c[0] * 0.55, c[1] * 0.55, c[2] * 0.55], wetT);
    c = mix3(c, [0.1, 0.09, 0.08], crack * 0.6);
    const g = 0.82 + 0.3 * gr + 0.12 * (gt - 0.5);
    cd[k] = Math.min(255, c[0] * g * 255); cd[k + 1] = Math.min(255, c[1] * g * 255); cd[k + 2] = Math.min(255, c[2] * g * 255); cd[k + 3] = 255;
    H[i] = (0.45 * gr + 0.25 * gt) * (1 - 0.7 * wetT) + 0.2 * a - 0.4 * crack;
    const rr = (0.88 - 0.1 * gr) * (1 - wetT * 0.68) + 0.04;
    rd[k] = rd[k + 1] = rd[k + 2] = Math.max(0, Math.min(255, rr * 255)); rd[k + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return {
    map: tex(col, { srgb: true }),
    roughnessMap: tex(rgh),
    normalMap: tex(heightToNormal(H, N, N, 2.6, true)),
  };
}

// ---------- flashlight cookie ----------
export function makeCookie(N = 512) {
  const c = canvas(N, N), x = c.getContext('2d'), img = x.createImageData(N, N), d = img.data;
  const smudge = fbmGrid(128, 5, 31337, 4, false);
  for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
    const px = (i + 0.5) / N * 2 - 1, py = (j + 0.5) / N * 2 - 1;
    const r = Math.hypot(px, py);
    const edge = 1 - sstep(0.62, 1.0, r);
    const hot = Math.exp(-(r * r) / 0.05) * 0.55;
    const ring = 0.07 * Math.sin(r * 46) * sstep(0.2, 0.7, r) + 0.18 * Math.exp(-((r - 0.72) ** 2) / 0.003);
    const darkRing = -0.14 * Math.exp(-((r - 0.34) ** 2) / 0.0025);
    const sm = (sampleGrid(smudge, 128, (px + 1) / 2, (py + 1) / 2) - 0.5) * 0.35;
    let val = Math.max(0, edge * (0.62 + hot + ring + darkRing + sm));
    val = Math.min(1, val);
    const warm = sstep(0.2, 0.95, r);
    const k = (j * N + i) * 4;
    d[k] = 255 * val;
    d[k + 1] = 255 * val * (1 - 0.07 * warm);
    d[k + 2] = 255 * val * (1 - 0.2 * warm);
    d[k + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  const t = tex(c, { srgb: true, wrap: false });
  return t;
}

// ---------- soft contact shadow ----------
export function makeContactShadow(N = 256) {
  const c = canvas(N, N), x = c.getContext('2d');
  const g = x.createRadialGradient(N / 2, N / 2, 0, N / 2, N / 2, N / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.85)');
  g.addColorStop(0.45, 'rgba(0,0,0,0.5)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  x.fillStyle = g; x.fillRect(0, 0, N, N);
  return tex(c, { srgb: false, wrap: false });
}

// ---------- house-centipede tergite (dorsal plate) ----------
export function makeTergiteTextures(N = 512) {
  const H = new Float32Array(N * N);
  const col = canvas(N, N), cctx = col.getContext('2d'), cimg = cctx.createImageData(N, N), cd = cimg.data;
  const rgh = canvas(N, N), rctx = rgh.getContext('2d'), rimg = rctx.createImageData(N, N), rd = rimg.data;
  const low = fbmGrid(128, 6, 2101, 4, false);
  const mot = fbmGrid(256, 26, 2102, 3, true);
  const fine = fbmGrid(256, 90, 2103, 2, true);
  const base = hex3('#8a7652'), pale = hex3('#a48f68'), stripe = hex3('#231d2a'), stripe2 = hex3('#3a3040'), edge = hex3('#2e262c');
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = (x + 0.5) / N, v = 1 - (y + 0.5) / N;
    const nl = sampleGrid(low, 128, u, v), nm = sampleGrid(mot, 256, u, v), nf = sampleGrid(fine, 256, u, v);
    let c = mix3(base, pale, sstep(0.45, 0.8, nm) * 0.6);
    // three dark longitudinal stripes, slightly broken
    const wob = (nl - 0.5) * 0.05;
    const s0 = Math.exp(-((u - 0.5 - wob * 0.5) ** 2) / 0.004);
    const s1 = Math.exp(-((u - 0.25 - wob) ** 2) / 0.007) * (0.75 + 0.25 * sstep(0.3, 0.6, nm));
    const s2 = Math.exp(-((u - 0.75 + wob) ** 2) / 0.007) * (0.75 + 0.25 * sstep(0.3, 0.6, 1 - nm));
    const st = Math.min(1, s0 + s1 + s2);
    c = mix3(c, mix3(stripe, stripe2, nm), st * 0.97);
    // darker rear margin with the spiracle slit, pale front
    c = mix3(c, edge, (1 - sstep(0.04, 0.2, v)) * 0.75);
    const slit = Math.exp(-((u - 0.5) ** 2) / 0.0004) * (1 - sstep(0.05, 0.22, v));
    c = mix3(c, [0.05, 0.04, 0.05], slit * 0.9);
    c = mix3(c, pale, sstep(0.86, 1.0, v) * 0.35);
    const g = 0.88 + 0.22 * nf;
    const k = (y * N + x) * 4;
    cd[k] = Math.min(255, c[0] * g * 255); cd[k + 1] = Math.min(255, c[1] * g * 255); cd[k + 2] = Math.min(255, c[2] * g * 255); cd[k + 3] = 255;
    H[y * N + x] = 0.12 * (nf - 0.5) + 0.06 * (nm - 0.5) - 0.5 * slit + 0.25 * sstep(0.0, 0.1, v) * (1 - sstep(0.1, 0.2, v));
    const rr = 0.5 + 0.12 * (nf - 0.5) - 0.08 * st;
    rd[k] = rd[k + 1] = rd[k + 2] = Math.max(0, Math.min(255, rr * 255)); rd[k + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0);
  rctx.putImageData(rimg, 0, 0);
  return {
    map: tex(col, { srgb: true, wrap: false }),
    roughnessMap: tex(rgh, { wrap: false }),
    normalMap: tex(heightToNormal(H, N, N, 3.0, false), { wrap: false }),
  };
}

// ---------- banded legs / antennae ----------
export function makeBandTextures() {
  const W = 16, Hh = 256;
  const H = new Float32Array(W * Hh);
  const col = canvas(W, Hh), x = col.getContext('2d'), img = x.createImageData(W, Hh), d = img.data;
  const pale = hex3('#9a865f'), dark = hex3('#221a26'), mid = hex3('#5e4c3a');
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const v = (j + 0.5) / Hh;
    // one dark band near each joint, a thin one in the middle
    const band = Math.max(1 - sstep(0.0, 0.18, v), sstep(0.8, 1.0, v), Math.exp(-((v - 0.5) ** 2) / 0.003) * 0.9);
    let c = mix3(pale, mid, Math.exp(-((v - 0.3) ** 2) / 0.01) * 0.3);
    c = mix3(c, dark, band);
    const k = (j * W + i) * 4;
    d[k] = c[0] * 255; d[k + 1] = c[1] * 255; d[k + 2] = c[2] * 255; d[k + 3] = 255;
    H[j * W + i] = 1 - band * 0.6;
  }
  x.putImageData(img, 0, 0);
  return { map: tex(col, { srgb: true }), normalMap: tex(heightToNormal(H, W, Hh, 0.8, true)) };
}

// ---------- rusty oil drum ----------
export function makeDrumTextures(W = 512, Hh = 512) {
  const col = canvas(W, Hh), cctx = col.getContext('2d'), cimg = cctx.createImageData(W, Hh), cd = cimg.data;
  const rgh = canvas(W, Hh), rctx = rgh.getContext('2d'), rimg = rctx.createImageData(W, Hh), rd = rimg.data;
  const H = new Float32Array(W * Hh);
  const a = fbmGrid(256, 8, 3101, 5, true), b = fbmGrid(256, 30, 3102, 3, true);
  const paint = hex3('#2f4a5a'), paintD = hex3('#22343f'), rust = hex3('#6a3a1c'), rustD = hex3('#3a1d0e');
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = (x + 0.5) / W, v = (y + 0.5) / Hh;
    const na = sampleGrid(a, 256, u, v), nb = sampleGrid(b, 256, u, v);
    const streak = sampleGrid(a, 256, u * 3, v * 0.3);
    const rustT = sstep(0.52, 0.66, na * 0.7 + streak * 0.4 + (v > 0.85 ? 0.25 : 0));
    let c = mix3(paint, paintD, nb);
    c = mix3(c, mix3(rust, rustD, nb), rustT);
    const k = (y * W + x) * 4;
    cd[k] = c[0] * 255; cd[k + 1] = c[1] * 255; cd[k + 2] = c[2] * 255; cd[k + 3] = 255;
    const rib = Math.exp(-((v - 0.33) ** 2) / 0.0004) + Math.exp(-((v - 0.66) ** 2) / 0.0004);
    H[y * W + x] = rib * 0.8 + rustT * 0.15 * nb;
    const rr = lerpN(0.45, 0.92, rustT);
    rd[k] = rd[k + 1] = rd[k + 2] = rr * 255; rd[k + 3] = 255;
  }
  cctx.putImageData(cimg, 0, 0); rctx.putImageData(rimg, 0, 0);
  return { map: tex(col, { srgb: true }), roughnessMap: tex(rgh), normalMap: tex(heightToNormal(H, W, Hh, 3, true)) };
}
const lerpN = (a, b, t) => a + (b - a) * t;

// bands running along u (for tubes whose u follows the length)
export function makeBandTexturesU() {
  const W = 256, Hh = 8;
  const H = new Float32Array(W * Hh);
  const col = canvas(W, Hh), x = col.getContext('2d'), img = x.createImageData(W, Hh), d = img.data;
  const pale = hex3('#a08e6c'), dark = hex3('#2e2630');
  for (let j = 0; j < Hh; j++) for (let i = 0; i < W; i++) {
    const u = (i + 0.5) / W;
    const band = Math.max(1 - sstep(0.0, 0.2, u), sstep(0.8, 1.0, u));
    const c = mix3(pale, dark, band * 0.8);
    const k = (j * W + i) * 4;
    d[k] = c[0] * 255; d[k + 1] = c[1] * 255; d[k + 2] = c[2] * 255; d[k + 3] = 255;
    H[j * W + i] = 1 - band * 0.5;
  }
  x.putImageData(img, 0, 0);
  return { map: tex(col, { srgb: true }), normalMap: tex(heightToNormal(H, W, Hh, 0.5, true)) };
}
