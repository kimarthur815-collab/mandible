// Surfaces for the factory: concrete floors, painted block walls, raw concrete,
// ceramic tiles. Textures are painted procedurally on canvases; the material
// projects them in world space (no UVs needed) and adds large-scale variation,
// so nothing reads as a repeated square.
import * as THREE from 'three';
import { fbm } from '../textures.js';

// ---------------------------------------------------------------- helpers
export function rng(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
export function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
export function texFrom(c, srgb, repeat = true, aniso = 8) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
// tileable value-noise canvas (grey), computed small and stretched
export function noiseCanvas(N, freq, seed, oct = 4, lo = 0, hi = 255) {
  const c = canvas(N), g = c.getContext('2d'), img = g.createImageData(N, N), d = img.data;
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const v = fbm((x / N) * freq, (y / N) * freq, seed, oct, freq, freq);
    const k = lo + (hi - lo) * Math.min(1, Math.max(0, (v - 0.2) / 0.6));
    const i = (y * N + x) * 4;
    d[i] = d[i + 1] = d[i + 2] = k; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return c;
}
// draw a small canvas stretched over a big one, tiled seamlessly
function stretch(g, src, W, H, alpha, op) {
  g.save(); g.globalAlpha = alpha; g.globalCompositeOperation = op || 'source-over';
  g.imageSmoothingEnabled = true; g.drawImage(src, 0, 0, W, H); g.restore();
}
// wrap-around drawing so shapes crossing an edge reappear on the other side
function wrapDraw(W, H, x, y, r, fn) {
  for (const dx of [0, -W, W]) for (const dy of [0, -H, H]) {
    if (x + dx + r < 0 || x + dx - r > W || y + dy + r < 0 || y + dy - r > H) continue;
    fn(x + dx, y + dy);
  }
}
function blob(g, x, y, r, rnd, col, alpha, lobes = 7) {
  g.save(); g.globalAlpha = alpha; g.fillStyle = col;
  g.beginPath();
  for (let i = 0; i <= lobes * 4; i++) {
    const a = (i / (lobes * 4)) * Math.PI * 2;
    const rr = r * (0.65 + 0.35 * Math.sin(a * 3 + rnd() * 0.3) * (0.6 + rnd() * 0.4) + rnd() * 0.25);
    const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * (0.7 + rnd() * 0.1);
    i ? g.lineTo(px, py) : g.moveTo(px, py);
  }
  g.closePath(); g.fill(); g.restore();
}
function softSpot(g, x, y, r, col, alpha) {
  const gr = g.createRadialGradient(x, y, 0, x, y, r);
  gr.addColorStop(0, col.replace('A', alpha)); gr.addColorStop(1, col.replace('A', 0));
  g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
}

// height (grey canvas, 128 = flat) + roughness (grey canvas) -> data texture: RG normal, B roughness
function dataTexture(hC, rC, strength) {
  const W = hC.width, H = hC.height;
  const hd = hC.getContext('2d').getImageData(0, 0, W, H).data;
  const rd = rC.getContext('2d').getImageData(0, 0, W, H).data;
  const out = canvas(W, H), g = out.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const h = (x, y) => hd[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = -(h(x + 1, y) - h(x - 1, y)) * strength, ny = (h(x, y + 1) - h(x, y - 1)) * strength;
    const l = Math.hypot(nx, ny, 1);
    const i = (y * W + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = rd[i]; d[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  return out;
}

// A surface is painted three times from the same list of features: colour, height, roughness.
function surface(W, H, dW, dH, paint, strength) {
  const col = canvas(W, H), hgt = canvas(dW, dH), rough = canvas(dW, dH);
  paint(col.getContext('2d'), W, H, 'col');
  paint(hgt.getContext('2d'), dW, dH, 'h');
  paint(rough.getContext('2d'), dW, dH, 'r');
  return { color: texFrom(col, true), data: texFrom(dataTexture(hgt, rough, strength), false) };
}

// ---------------------------------------------------------------- concrete floor (one tile = 4 m)
export function concreteFloor(seed = 1) {
  const R0 = rng(seed);
  const stains = [], scuffs = [], cracks = [], pits = [];
  for (let i = 0; i < 26; i++) stains.push({ x: R0(), y: R0(), r: 0.02 + R0() * 0.09, a: 0.08 + R0() * 0.3, oil: R0() < 0.55, s: R0() * 1e6 });
  for (let i = 0; i < 260; i++) { const x = R0(), y = R0(), a = (R0() < 0.7 ? 0 : 1) * Math.PI / 2 + (R0() - 0.5) * 0.5, l = 0.01 + R0() * 0.09; scuffs.push({ x, y, a, l, w: 0.6 + R0() * 1.6, al: 0.04 + R0() * 0.12, dark: R0() < 0.5 }); }
  for (let i = 0; i < 3; i++) { const pts = []; let x = R0(), y = R0(), a = R0() * 6.28; for (let k = 0; k < 24; k++) { pts.push([x, y]); a += (R0() - 0.5) * 1.2; x += Math.cos(a) * 0.012; y += Math.sin(a) * 0.012; } cracks.push(pts); }
  for (let i = 0; i < 2600; i++) pits.push({ x: R0(), y: R0(), r: 0.4 + R0() * 1.4, l: R0() });
  const nBig = noiseCanvas(96, 3, seed + 1), nMid = noiseCanvas(160, 9, seed + 2), nFine = noiseCanvas(256, 40, seed + 3, 2);
  return surface(1024, 1024, 512, 512, (g, W, H, mode) => {
    const s = W / 1024;
    g.fillStyle = mode === 'col' ? '#8b877f' : mode === 'h' ? '#808080' : '#d2d2d2';
    g.fillRect(0, 0, W, H);
    if (mode === 'col') { stretch(g, nBig, W, H, 0.12, 'multiply'); stretch(g, nMid, W, H, 0.08, 'overlay'); stretch(g, nFine, W, H, 0.14, 'overlay'); }
    if (mode === 'h') { stretch(g, nMid, W, H, 0.25); stretch(g, nFine, W, H, 0.5); }
    if (mode === 'r') stretch(g, nMid, W, H, 0.25, 'multiply');
    // aggregate and pits
    for (const p of pits) {
      g.fillStyle = mode === 'col' ? (p.l < 0.5 ? 'rgba(40,36,30,0.35)' : 'rgba(220,214,200,0.25)') : mode === 'h' ? (p.l < 0.6 ? '#505050' : '#a0a0a0') : '#e8e8e8';
      g.fillRect(p.x * W, p.y * H, p.r * s * 2, p.r * s * 2);
    }
    // stains: oil (dark, glossy) and water/chemical rings
    for (const st of stains) {
      const R = rng(st.s);
      wrapDraw(W, H, st.x * W, st.y * H, st.r * W, (x, y) => {
        if (mode === 'col') {
          blob(g, x, y, st.r * W, R, st.oil ? '#1c1712' : '#4a4438', st.a, 6);
          blob(g, x + st.r * W * 0.2, y, st.r * W * 0.6, R, st.oil ? '#120e0a' : '#5a5245', st.a * 0.7, 5);
        } else if (mode === 'r') {
          blob(g, x, y, st.r * W, R, st.oil ? '#707070' : '#b0b0b0', 0.8, 6);
        }
      });
    }
    // scuffs and tyre rub marks
    g.lineCap = 'round';
    for (const c of scuffs) {
      g.strokeStyle = mode === 'col' ? (c.dark ? `rgba(25,22,18,${c.al})` : `rgba(230,225,210,${c.al})`) : mode === 'h' ? 'rgba(90,90,90,0.4)' : 'rgba(150,150,150,0.5)';
      g.lineWidth = c.w * s * (mode === 'col' ? 1 : 0.5);
      g.beginPath(); g.moveTo(c.x * W, c.y * H); g.lineTo(c.x * W + Math.cos(c.a) * c.l * W, c.y * H + Math.sin(c.a) * c.l * H); g.stroke();
    }
    // cracks
    for (const pts of cracks) {
      g.strokeStyle = mode === 'col' ? 'rgba(20,18,15,0.7)' : mode === 'h' ? '#202020' : '#f0f0f0';
      g.lineWidth = (mode === 'col' ? 1.6 : 1.2) * s * 2;
      g.beginPath(); pts.forEach(([x, y], i) => (i ? g.lineTo(x * W, y * H) : g.moveTo(x * W, y * H))); g.stroke();
    }
    // saw-cut joints at the tile edge (every 4 m)
    g.fillStyle = mode === 'col' ? 'rgba(25,22,18,0.75)' : mode === 'h' ? '#202020' : '#f0f0f0';
    const jw = Math.max(2, 5 * s);
    g.fillRect(0, 0, W, jw); g.fillRect(0, 0, jw, H);
    if (mode === 'col') { g.fillStyle = 'rgba(200,195,185,0.18)'; g.fillRect(0, jw, W, jw); g.fillRect(jw, 0, jw, H); }
  }, 2.2);
}

// ---------------------------------------------------------------- painted concrete block wall, upper part (one tile = 4 m x 4 m)
export function paintedWall(seed = 3) {
  const R0 = rng(seed);
  const streaks = [], peels = [], holes = [], grime = [];
  for (let i = 0; i < 70; i++) streaks.push({ x: R0(), y: R0() * 0.4, l: 0.1 + R0() * 0.7, w: 1 + R0() * 6, a: 0.03 + R0() * 0.12, rust: R0() < 0.3 });
  for (let i = 0; i < 8; i++) peels.push({ x: R0(), y: R0(), r: 0.01 + R0() * 0.035, s: R0() * 1e6 });
  for (let i = 0; i < 9; i++) holes.push({ x: R0(), y: R0() });
  for (let i = 0; i < 40; i++) grime.push({ x: R0(), y: R0(), r: 0.03 + R0() * 0.12, a: 0.03 + R0() * 0.08 });
  const nMid = noiseCanvas(128, 6, seed + 1), nFine = noiseCanvas(256, 48, seed + 2, 2);
  return surface(1024, 1024, 512, 512, (g, W, H, mode) => {
    const s = W / 1024;
    g.fillStyle = mode === 'col' ? '#dad6cc' : mode === 'h' ? '#8a8a8a' : '#c8c8c8';
    g.fillRect(0, 0, W, H);
    if (mode === 'col') { stretch(g, nMid, W, H, 0.18, 'multiply'); stretch(g, nFine, W, H, 0.12, 'overlay'); }
    if (mode === 'h') stretch(g, nFine, W, H, 0.35);
    // concrete blocks under the paint: 0.4 m x 0.2 m running bond (10 x 20 per tile)
    const bw = W / 10, bh = H / 20;
    g.fillStyle = mode === 'col' ? 'rgba(80,76,68,0.16)' : mode === 'h' ? '#5a5a5a' : '#d8d8d8';
    for (let r = 0; r < 20; r++) {
      g.fillRect(0, r * bh, W, Math.max(1.5, 3 * s));
      const off = r % 2 ? bw / 2 : 0;
      for (let c = 0; c <= 10; c++) g.fillRect(c * bw + off, r * bh, Math.max(1.5, 3 * s), bh);
    }
    // water and rust streaks running down
    for (const st of streaks) {
      const x = st.x * W, y0 = st.y * H, y1 = y0 + st.l * H;
      if (mode === 'col') {
        const gr = g.createLinearGradient(0, y0, 0, y1);
        const c = st.rust ? '110,60,25' : '70,64,52';
        gr.addColorStop(0, `rgba(${c},${st.a * 1.5})`); gr.addColorStop(0.7, `rgba(${c},${st.a})`); gr.addColorStop(1, `rgba(${c},0)`);
        g.fillStyle = gr; g.fillRect(x, y0, st.w * s, y1 - y0);
        g.fillRect(x + st.w * s * 0.3, y0, st.w * s * 0.25, (y1 - y0) * 1.15);
      } else if (mode === 'r') { g.fillStyle = 'rgba(150,150,150,0.4)'; g.fillRect(x, y0, st.w * s, y1 - y0); }
    }
    for (const gm of grime) if (mode === 'col') softSpot(g, gm.x * W, gm.y * H, gm.r * W, 'rgba(60,55,45,A)', gm.a);
    // peeling paint: patches of bare block with a lifted, lighter edge
    for (const p of peels) {
      const R = rng(p.s);
      wrapDraw(W, H, p.x * W, p.y * H, p.r * W * 1.4, (x, y) => {
        if (mode === 'col') {
          blob(g, x, y, p.r * W * 1.12, rng(p.s), '#f4f1ea', 0.8, 8);
          blob(g, x, y, p.r * W, rng(p.s), '#b6b1a6', 1, 8);
          blob(g, x + p.r * W * 0.15, y + p.r * W * 0.1, p.r * W * 0.55, R, '#a39e93', 0.45, 6);
        } else if (mode === 'h') {
          blob(g, x, y, p.r * W * 1.15, rng(p.s), '#b0b0b0', 1, 8);
          blob(g, x, y, p.r * W, rng(p.s), '#555555', 1, 8);
        } else blob(g, x, y, p.r * W, rng(p.s), '#f4f4f4', 1, 8);
      });
    }
    // anchor holes with a rust halo
    for (const h of holes) {
      if (mode === 'col') { softSpot(g, h.x * W, h.y * H, 18 * s, 'rgba(120,60,20,A)', 0.35); g.fillStyle = '#1a1612'; g.beginPath(); g.arc(h.x * W, h.y * H, 4 * s, 0, 7); g.fill(); }
      else if (mode === 'h') { g.fillStyle = '#101010'; g.beginPath(); g.arc(h.x * W, h.y * H, 4 * s, 0, 7); g.fill(); }
    }
  }, 2.0);
}

// ---------------------------------------------------------------- lower band of a painted wall (4 m x 1.25 m)
export function wallBand(seed = 5) {
  const R0 = rng(seed);
  const scuffs = [], chips = [], mold = [];
  for (let i = 0; i < 150; i++) scuffs.push({ x: R0(), y: 0.55 + R0() * 0.4, l: 0.01 + R0() * 0.08, a: (R0() - 0.5) * 0.4, al: 0.1 + R0() * 0.3, w: 1 + R0() * 3 });
  for (let i = 0; i < 26; i++) chips.push({ x: R0(), y: 0.2 + R0() * 0.75, r: 0.004 + R0() * 0.02, s: R0() * 1e6 });
  for (let i = 0; i < 500; i++) mold.push({ x: R0(), y: 0.82 + Math.pow(R0(), 2) * 0.18, r: 0.5 + R0() * 2.5 });
  const nMid = noiseCanvas(128, 6, seed + 1), nFine = noiseCanvas(256, 48, seed + 2, 2);
  return surface(1024, 320, 512, 160, (g, W, H, mode) => {
    const s = W / 1024;
    g.fillStyle = mode === 'col' ? '#bcc0bc' : mode === 'h' ? '#8a8a8a' : '#9a9a9a';
    g.fillRect(0, 0, W, H);
    if (mode === 'col') { stretch(g, nMid, W, H, 0.2, 'multiply'); stretch(g, nFine, W, H, 0.12, 'overlay'); }
    if (mode === 'h') stretch(g, nFine, W, H, 0.3);
    // block joints
    const bw = W / 10, bh = H / 6.25;
    g.fillStyle = mode === 'col' ? 'rgba(30,30,28,0.18)' : mode === 'h' ? '#5a5a5a' : '#aaaaaa';
    for (let r = 0; r < 7; r++) { g.fillRect(0, H - r * bh, W, Math.max(1.5, 3 * s)); const off = r % 2 ? bw / 2 : 0; for (let c = 0; c <= 10; c++) g.fillRect(c * bw + off, H - (r + 1) * bh, Math.max(1.5, 3 * s), bh); }
    // painted trim line along the top
    g.fillStyle = mode === 'col' ? '#2d302e' : mode === 'h' ? '#9a9a9a' : '#888888';
    g.fillRect(0, 0, W, 9 * s * 2);
    // dirt rising from the floor
    if (mode === 'col') {
      const gr = g.createLinearGradient(0, H * 0.55, 0, H);
      gr.addColorStop(0, 'rgba(40,34,26,0)'); gr.addColorStop(0.8, 'rgba(40,34,26,0.35)'); gr.addColorStop(1, 'rgba(25,20,15,0.6)');
      g.fillStyle = gr; g.fillRect(0, 0, W, H);
      for (const m of mold) { g.fillStyle = `rgba(${30 + R0() * 20},${40 + R0() * 20},${25},${0.25 + R0() * 0.3})`; g.beginPath(); g.arc(m.x * W, m.y * H, m.r * s * 2, 0, 7); g.fill(); }
    }
    // trolley and boot scuffs
    g.lineCap = 'round';
    for (const c of scuffs) {
      g.strokeStyle = mode === 'col' ? `rgba(15,14,12,${c.al})` : mode === 'h' ? 'rgba(100,100,100,0.4)' : 'rgba(120,120,120,0.4)';
      g.lineWidth = c.w * s * 2;
      g.beginPath(); g.moveTo(c.x * W, c.y * H); g.lineTo(c.x * W + Math.cos(c.a) * c.l * W, c.y * H + Math.sin(c.a) * c.l * W); g.stroke();
    }
    // chipped paint
    for (const c of chips) wrapDraw(W, H, c.x * W, c.y * H, c.r * W, (x, y) => {
      blob(g, x, y, c.r * W, rng(c.s), mode === 'col' ? '#a39d92' : mode === 'h' ? '#606060' : '#e0e0e0', 1, 6);
    });
  }, 2.0);
}

// ---------------------------------------------------------------- raw cast concrete (dock / passage): tie holes, form seams, damp
export function rawConcrete(seed = 7) {
  const R0 = rng(seed);
  const eff = [], wet = [];
  for (let i = 0; i < 50; i++) eff.push({ x: R0(), y: R0(), l: 0.05 + R0() * 0.3, a: 0.04 + R0() * 0.1, w: 2 + R0() * 8 });
  for (let i = 0; i < 12; i++) wet.push({ x: R0(), y: R0(), r: 0.05 + R0() * 0.15, s: R0() * 1e6 });
  const nBig = noiseCanvas(96, 3, seed + 1), nMid = noiseCanvas(160, 10, seed + 2), nFine = noiseCanvas(256, 56, seed + 3, 2);
  return surface(1024, 1024, 512, 512, (g, W, H, mode) => {
    const s = W / 1024;
    g.fillStyle = mode === 'col' ? '#bab6ae' : mode === 'h' ? '#808080' : '#d8d8d8';
    g.fillRect(0, 0, W, H);
    if (mode === 'col') { stretch(g, nBig, W, H, 0.1, 'multiply'); stretch(g, nMid, W, H, 0.07, 'overlay'); stretch(g, nFine, W, H, 0.12, 'overlay'); }
    if (mode === 'h') { stretch(g, nMid, W, H, 0.3); stretch(g, nFine, W, H, 0.55); }
    // formwork panel seams (1.2 m x 2.4 m)
    g.fillStyle = mode === 'col' ? 'rgba(60,56,50,0.35)' : mode === 'h' ? '#b0b0b0' : '#c0c0c0';
    for (let k = 0; k < 4; k++) g.fillRect((k * W) / 3.333, 0, 2 * s, H);
    g.fillRect(0, H * 0.4, W, 2 * s); g.fillRect(0, H * 0.9, W, 2 * s);
    // form tie holes on a grid, rust bleeding below some
    for (let i = 0; i < 6; i++) for (let j = 0; j < 6; j++) {
      const x = (i + 0.5) * W / 6, y = (j + 0.5) * H / 6;
      if (mode === 'col') {
        if (((i * 7 + j * 3) % 5) === 0) { const gr = g.createLinearGradient(0, y, 0, y + H * 0.12); gr.addColorStop(0, 'rgba(120,58,20,0.45)'); gr.addColorStop(1, 'rgba(120,58,20,0)'); g.fillStyle = gr; g.fillRect(x - 5 * s, y, 10 * s, H * 0.12); }
        g.fillStyle = '#3a3630'; g.beginPath(); g.arc(x, y, 9 * s, 0, 7); g.fill();
        g.fillStyle = '#1a1714'; g.beginPath(); g.arc(x, y, 5 * s, 0, 7); g.fill();
      } else if (mode === 'h') { g.fillStyle = '#303030'; g.beginPath(); g.arc(x, y, 8 * s, 0, 7); g.fill(); }
    }
    // white salt bloom (efflorescence)
    for (const e of eff) if (mode === 'col') {
      const gr = g.createLinearGradient(0, e.y * H, 0, (e.y + e.l) * H);
      gr.addColorStop(0, `rgba(235,232,222,${e.a})`); gr.addColorStop(1, 'rgba(235,232,222,0)');
      g.fillStyle = gr; g.fillRect(e.x * W, e.y * H, e.w * s, e.l * H);
    }
    // damp patches
    for (const w of wet) wrapDraw(W, H, w.x * W, w.y * H, w.r * W, (x, y) => {
      if (mode === 'col') blob(g, x, y, w.r * W, rng(w.s), '#5e5a52', 0.22, 7);
      else if (mode === 'r') blob(g, x, y, w.r * W, rng(w.s), '#808080', 0.7, 7);
    });
  }, 2.4);
}

// ---------------------------------------------------------------- tiles: square ceramic (walls 15 cm, floors 30 cm) - one tile = 2.4 m
export function tiles({ seed = 9, count = 16, base = '#e9e7e0', grout = '#9b978c', floor = false } = {}) {
  const R0 = rng(seed);
  const shade = [], broken = new Set(), missing = new Set(), stains = [];
  for (let i = 0; i < count * count; i++) shade.push(R0());
  for (let i = 0; i < count * count * 0.04; i++) broken.add(Math.floor(R0() * count * count));
  for (let i = 0; i < count * count * 0.008; i++) missing.add(Math.floor(R0() * count * count));
  for (let i = 0; i < 18; i++) stains.push({ x: R0(), y: R0(), r: 0.02 + R0() * 0.08, a: 0.06 + R0() * 0.18, rust: R0() < 0.4 });
  const nMid = noiseCanvas(128, 6, seed + 1), nFine = noiseCanvas(256, 64, seed + 2, 2);
  return surface(1024, 1024, 512, 512, (g, W, H, mode) => {
    const s = W / 1024, t = W / count, gw = Math.max(1.5, (floor ? 5 : 4) * s);
    g.fillStyle = mode === 'col' ? grout : mode === 'h' ? '#404040' : '#e6e6e6';
    g.fillRect(0, 0, W, H);
    for (let j = 0; j < count; j++) for (let i = 0; i < count; i++) {
      const k = j * count + i, x = i * t + gw / 2, y = j * t + gw / 2, w = t - gw;
      if (missing.has(k)) {
        // bare adhesive with trowel ridges
        if (mode === 'col') { g.fillStyle = '#7d7a70'; g.fillRect(x, y, w, w); g.strokeStyle = 'rgba(40,38,34,0.4)'; g.lineWidth = 2 * s; for (let q = 0; q < 6; q++) { g.beginPath(); g.moveTo(x, y + (q + 0.5) * w / 6); g.lineTo(x + w, y + (q + 0.5) * w / 6); g.stroke(); } }
        else if (mode === 'h') { g.fillStyle = '#303030'; g.fillRect(x, y, w, w); }
        continue;
      }
      const v = shade[k];
      if (mode === 'col') { const c = new THREE.Color(base).multiplyScalar(0.9 + v * 0.14); g.fillStyle = `#${c.getHexString()}`; }
      else g.fillStyle = mode === 'h' ? '#c8c8c8' : (floor ? '#8a8a8a' : '#4a4a4a');     // glazed: smooth
      g.fillRect(x, y, w, w);
      if (mode === 'h') { g.fillStyle = '#d4d4d4'; g.fillRect(x + w * 0.1, y + w * 0.1, w * 0.8, w * 0.8); }
      if (broken.has(k)) {
        g.strokeStyle = mode === 'col' ? 'rgba(40,36,30,0.8)' : mode === 'h' ? '#303030' : '#f0f0f0';
        g.lineWidth = 1.5 * s * 2;
        g.beginPath(); g.moveTo(x + w * shade[(k + 1) % shade.length], y); g.lineTo(x + w * 0.5, y + w * 0.5); g.lineTo(x + w, y + w * shade[(k + 2) % shade.length]); g.moveTo(x + w * 0.5, y + w * 0.5); g.lineTo(x + w * 0.3, y + w); g.stroke();
      }
    }
    if (mode === 'col') { stretch(g, nMid, W, H, 0.12, 'multiply'); stretch(g, nFine, W, H, 0.08, 'overlay'); }
    for (const st of stains) if (mode === 'col') softSpot(g, st.x * W, st.y * H, st.r * W, st.rust ? 'rgba(130,70,25,A)' : 'rgba(70,64,50,A)', st.a);
    for (const st of stains) if (mode === 'r') softSpot(g, st.x * W, st.y * H, st.r * W, 'rgba(160,160,160,A)', 0.6);
  }, 3.0);
}

// big soft variation that breaks tiling
export function macroNoise() { return texFrom(noiseCanvas(256, 4, 77, 5, 0, 255), false); }

// ---------------------------------------------------------------- world-projected material
// type: 'floor' | 'wall' | 'ceil'. Walls use the band texture below `split` metres and the
// upper texture above it; everything takes its uv from world position.
export function worldMaterial({ color, data, band = null, bandData = null, tile = 4, bandTile = 4, split = 1.25, tint = 0xffffff, bandTint = 0xffffff, rough = 1, normalK = 1, macro, macroK = 0.22, floorDirt = 0.35, wet = 0 }) {
  const m = new THREE.MeshStandardMaterial({ color: tint, roughness: rough, metalness: 0 });
  m.userData.uniforms = {
    tCol: { value: color }, tData: { value: data }, tBand: { value: band || color }, tBandData: { value: bandData || data },
    tMacro: { value: macro }, uTile: { value: tile }, uBandTile: { value: bandTile }, uSplit: { value: band ? split : -10 },
    uBandTint: { value: new THREE.Color(bandTint) }, uNormalK: { value: normalK }, uMacroK: { value: macroK }, uFloorDirt: { value: floorDirt }, uWet: { value: wet },
  };
  m.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, m.userData.uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm;')
      .replace('#include <worldpos_vertex>', '#include <worldpos_vertex>\nvWPos = (modelMatrix * vec4(transformed, 1.0)).xyz; vWNrm = normalize(mat3(modelMatrix) * objectNormal);');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec3 vWPos; varying vec3 vWNrm;
        uniform sampler2D tCol, tData, tBand, tBandData, tMacro;
        uniform float uTile, uBandTile, uSplit, uNormalK, uMacroK, uFloorDirt, uWet;
        uniform vec3 uBandTint;`)
      .replace('#include <map_fragment>', `
        vec3 wN = normalize(vWNrm), aN = abs(wN);
        vec2 wuv; vec3 wT, wB;
        if (aN.y > 0.7) { wuv = vec2(vWPos.x, -vWPos.z); wT = vec3(1.0, 0.0, 0.0); wB = vec3(0.0, 0.0, -1.0); }
        else if (aN.x > aN.z) { float s = sign(wN.x); wuv = vec2(-vWPos.z * s, vWPos.y); wT = vec3(0.0, 0.0, -s); wB = vec3(0.0, 1.0, 0.0); }
        else { float s = sign(wN.z); wuv = vec2(vWPos.x * s, vWPos.y); wT = vec3(s, 0.0, 0.0); wB = vec3(0.0, 1.0, 0.0); }
        vec4 wCol, wData;
        float isBand = (aN.y < 0.7 && vWPos.y < uSplit) ? 1.0 : 0.0;
        if (isBand > 0.5) {
          vec2 buv = vec2(wuv.x / uBandTile, clamp(vWPos.y / uSplit, 0.002, 0.998));
          wCol = texture2D(tBand, buv); wData = texture2D(tBandData, buv);
          wCol.rgb *= uBandTint;
        } else {
          vec2 tuv = wuv / uTile;
          wCol = texture2D(tCol, tuv); wData = texture2D(tData, tuv);
        }
        // large soft variation so the tile never repeats visibly
        float mac = texture2D(tMacro, wuv / 19.0).r * 0.6 + texture2D(tMacro, wuv / 6.7 + 0.37).r * 0.4;
        wCol.rgb *= mix(1.0, 0.72 + mac * 0.5, uMacroK);
        // walls get dirtier toward the floor; damp rooms darker still
        if (aN.y < 0.7) {
          float low = 1.0 - smoothstep(0.0, 0.45, vWPos.y);
          wCol.rgb *= 1.0 - low * uFloorDirt * (0.6 + mac * 0.6);
          wCol.rgb *= 1.0 - uWet * (1.0 - smoothstep(0.0, 1.2, vWPos.y)) * (0.3 + mac * 0.4);
        } else {
          wCol.rgb *= 1.0 - uWet * 0.25 * smoothstep(0.45, 0.75, mac);
        }
        diffuseColor.rgb *= wCol.rgb;`)
      .replace('#include <roughnessmap_fragment>', `float roughnessFactor = roughness * wData.b;
        if (aN.y > 0.7) roughnessFactor = mix(roughnessFactor, 0.18, uWet * smoothstep(0.55, 0.8, mac));`)
      .replace('#include <normal_fragment_maps>', `{
          vec2 nxy = (wData.rg * 2.0 - 1.0) * uNormalK;
          vec3 wn = normalize(wT * nxy.x + wB * nxy.y + wN * sqrt(max(0.0, 1.0 - dot(nxy, nxy))));
          normal = normalize((viewMatrix * vec4(wn, 0.0)).xyz);
        }`);
  };
  m.customProgramCacheKey = () => 'worldmat';
  return m;
}
