// The outside of the factory ("D-7") for the opening: buildings wrapped round the real floor plan, the
// fenced yard, the forest round it and a sky (dusk or night). Same coordinates as the map: the dock
// shutter is x -2.5..2.5 at z = 0 and the yard lies to the south (-z); the gate and the road are at x = 0.
import * as THREE from 'three';
import * as S from './surface.js';
import * as P from './props.js';
import * as PT from './proptex.js';

const V3 = THREE.Vector3;
const C = (h) => new THREE.Color(h);
const T = 0.3;                  // wall thickness
const RM = 'out';               // batch "room" key
const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const YARD = { x0: -34, x1: 36, z0: -28, z1: 82 };
const GATE = { x0: -5, x1: 5 };

// ---------------------------------------------------------------- buildings
// h = eave height; ridge = gable top (front and back walls get a gable); skip = walls hidden against another block.
// holes are in each wall's own frame: x from the left end as seen from outside, y up.
const win = (x, y, w, h, cols, rows) => ({ kind: 'win', x, y, w, h, cols, rows });
const door = (x, w = 1.1, h = 2.3) => ({ kind: 'door', x, y: 0, w, h });
const shut = (x, w, h) => ({ kind: 'shutter', x, y: 0, w, h });
const BUILDINGS = [
  // main hall over the dock and warehouse A
  { x0: -12.5, x1: 12.5, z0: -0.35, z1: 32.5, h: 8, ridge: 11.5, holes: {
    s: [shut(10, 5, 4.5), win(3, 5.9, 4.5, 1.3, 6, 2), win(17.5, 5.9, 4.5, 1.3, 6, 2), win(2.4, 1.5, 2.4, 1.8, 3, 2), win(20.2, 1.5, 2.4, 1.8, 3, 2)],
    e: [win(2, 6, 4, 1.2, 5, 1), win(9, 6, 4, 1.2, 5, 1), win(16, 6, 4, 1.2, 5, 1), win(23, 6, 4, 1.2, 5, 1)],
    w: [win(2, 6, 4, 1.2, 5, 1), win(8.5, 6, 4, 1.2, 5, 1), win(15, 6, 4, 1.2, 5, 1), win(21.5, 6, 4, 1.2, 5, 1), win(22, 1.4, 2.4, 1.6, 3, 2), win(27, 1.4, 2.4, 1.6, 3, 2)],
    n: [win(4, 5.6, 4, 1.4, 5, 2), win(16.5, 5.6, 4, 1.4, 5, 2), door(11.5, 1.6, 2.6)] } },
  // (from the yard +x is on your left) stair tower right of the dock, with a store block behind it
  { x0: -18, x1: -13, z0: 0.6, z1: 5.6, h: 15.5, skip: ['n'], holes: {
    s: [door(1.0, 1.2, 2.4), win(2.2, 6.2, 1.1, 1.3, 1, 2), win(2.2, 10.4, 1.1, 1.3, 1, 2)],
    w: [win(1.6, 4.2, 1.2, 1.4, 1, 2), win(1.6, 8.4, 1.2, 1.4, 1, 2), win(1.6, 12.6, 1.2, 1.4, 1, 2)],
    e: [win(1.6, 12.6, 1.2, 1.4, 1, 2)] } },
  { x0: -23, x1: -12.5, z0: 5.6, z1: 20.5, h: 5.5, skip: ['e'], holes: {
    s: [door(6.3, 1.2, 2.3), win(8.2, 1.4, 1.8, 1.4, 2, 2)],
    w: [win(2, 2.6, 3, 1.4, 4, 2), win(8, 2.6, 3, 1.4, 4, 2), door(12.3, 1.2, 2.3)],
    n: [] } },
  // lean-to over the machine room, left of the dock, high side against the main hall
  { x0: 12.5, x1: 23, z0: 1.5, z1: 20.5, h: 4.4, lean: 5.6, highAt: 'x0', skip: ['w'], holes: {
    s: [door(1.0, 1.2, 2.3), shut(3.4, 3.4, 3.0)], e: [win(2, 2.2, 3, 1.3, 4, 2), win(8, 2.2, 3, 1.3, 4, 2), win(14, 2.2, 3, 1.3, 4, 2)], n: [] } },
  // the blocks behind: connecting corridor, emergency passage, lab, production hall
  { x0: 16.2, x1: 20.8, z0: 20.5, z1: 45.5, h: 4.6, skip: ['s', 'n'], holes: { e: [win(4, 2.4, 2.4, 1.1, 3, 1), win(14, 2.4, 2.4, 1.1, 3, 1)], w: [win(6, 2.4, 2.4, 1.1, 3, 1)] } },
  { x0: -17.5, x1: -12.6, z0: 26.5, z1: 51.5, h: 4.2, skip: ['n'], holes: { s: [], w: [win(6, 2.2, 2, 1, 2, 1), win(16, 2.2, 2, 1, 2, 1)], e: [] } },
  { x0: -20.5, x1: -6.5, z0: 51.5, z1: 64.5, h: 5.4, skip: ['e'], holes: { s: [win(3, 2.4, 3, 1.4, 4, 2), win(8.5, 2.4, 3, 1.4, 4, 2)], w: [win(4, 2.4, 3, 1.4, 4, 2)], n: [win(5, 2.4, 3, 1.4, 4, 2)] } },
  { x0: -6.5, x1: 24.5, z0: 45.5, z1: 70.5, h: 10, holes: { s: [win(4, 6.5, 6, 2, 8, 2), win(20, 6.5, 6, 2, 8, 2)], e: [win(4, 6.5, 6, 2, 8, 2), win(15, 6.5, 6, 2, 8, 2)], w: [win(14, 6.5, 6, 2, 8, 2)], n: [win(8, 6.5, 6, 2, 8, 2), win(20, 6.5, 6, 2, 8, 2)] } },
];

// a wall's frame: origin at the outside bottom-left corner, local +z = outward normal, local +x = to the right seen from outside
function sides(b) {
  return {
    s: { m: new THREE.Matrix4().makeRotationY(Math.PI).setPosition(b.x1, 0, b.z0), len: b.x1 - b.x0, gable: true },
    n: { m: new THREE.Matrix4().makeRotationY(0).setPosition(b.x0, 0, b.z1), len: b.x1 - b.x0, gable: true },
    e: { m: new THREE.Matrix4().makeRotationY(Math.PI / 2).setPosition(b.x1, 0, b.z1 - T), len: b.z1 - b.z0 - 2 * T },
    w: { m: new THREE.Matrix4().makeRotationY(-Math.PI / 2).setPosition(b.x0, 0, b.z0 + T), len: b.z1 - b.z0 - 2 * T },
  };
}
function wallGeom(outline, holes) {
  const sh = new THREE.Shape(outline.map(([x, y]) => new THREE.Vector2(x, y)));
  for (const h of holes) {
    const p = new THREE.Path();
    p.moveTo(h.x, h.y); p.lineTo(h.x + h.w, h.y); p.lineTo(h.x + h.w, h.y + h.h); p.lineTo(h.x, h.y + h.h); p.closePath();
    sh.holes.push(p);
  }
  const g = new THREE.ExtrudeGeometry(sh, { depth: T, bevelEnabled: false, curveSegments: 1 });
  g.translate(0, 0, -T);
  return g;
}
// corrugated sheet in the xy plane, facing +z; ribs run along x when `ribsAlongX`, else along y. uv in metres / 2
function corrugated(w, h, pitch, depth, ribsAlongX) {
  const n = Math.ceil((ribsAlongX ? h : w) / pitch) * 6;
  const g = new THREE.PlaneGeometry(w, h, ribsAlongX ? 1 : n, ribsAlongX ? n : 1);
  const p = g.attributes.position, uv = g.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const t = ribsAlongX ? p.getY(i) : p.getX(i);
    p.setZ(i, depth * 0.5 * (1 - Math.cos((2 * Math.PI * t) / pitch)));
    uv.setXY(i, uv.getX(i) * w / 2, uv.getY(i) * h / 2);
  }
  g.computeVertexNormals();
  return g;
}

// ---------------------------------------------------------------- textures
function tex2d(W, H, paint, srgb = true) { const c = S.canvas(W, H); paint(c.getContext('2d'), W, H); return S.texFrom(c, srgb); }
const softSpot = (g, x, y, r, rgb, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
function sheetMetal(base, rust, seed) {
  const R = S.rng(seed);
  return tex2d(512, 512, (g, W, H) => {
    g.fillStyle = base; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.35; g.drawImage(S.noiseCanvas(96, 5, seed), 0, 0, W, H);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    // rust runs: streaks along u (the roof's slope / down a sheet)
    for (let i = 0; i < 40; i++) {
      const y = R() * H, x = R() * W, l = 60 + R() * 260, w = 2 + R() * 9;
      const gr = g.createLinearGradient(x, 0, x + l, 0); gr.addColorStop(0, `rgba(${rust},${0.25 + R() * 0.35})`); gr.addColorStop(1, `rgba(${rust},0)`);
      g.fillStyle = gr; g.fillRect(x, y, l, w);
    }
    for (let i = 0; i < 14; i++) softSpot(g, R() * W, R() * H, 20 + R() * 70, rust, 0.25);
    for (let i = 0; i < 10; i++) softSpot(g, R() * W, R() * H, 40 + R() * 90, '230,225,215', 0.08);
  });
}
function chainLink() {
  const c = S.canvas(128), g = c.getContext('2d');
  g.strokeStyle = '#d6d8d6'; g.lineWidth = 4; g.lineCap = 'round';
  for (let k = -128; k <= 256; k += 64) {
    g.beginPath(); g.moveTo(k, 0); g.lineTo(k + 128, 128); g.stroke();
    g.beginPath(); g.moveTo(k + 128, 0); g.lineTo(k, 128); g.stroke();
  }
  return S.texFrom(c, true);
}
function stencil(text) {
  const R = S.rng(17);
  const c = S.canvas(1024, 512), g = c.getContext('2d');
  g.fillStyle = 'rgba(32,30,28,0.82)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `700 400px "Oswald", Impact, "Arial Black", sans-serif`;
  g.fillText(text, 512, 270);
  // stencil bridges and wear: knock holes out of the paint
  g.globalCompositeOperation = 'destination-out';
  for (const x of [512 - 250, 512 + 160]) g.fillRect(x - 6, 0, 12, 512);
  for (let i = 0; i < 2600; i++) { g.fillStyle = `rgba(0,0,0,${0.3 + R() * 0.7})`; g.fillRect(R() * 1024, R() * 512, 1 + R() * 7, 1 + R() * 4); }
  for (let i = 0; i < 14; i++) { const x = R() * 1024, y = R() * 512; g.fillStyle = 'rgba(0,0,0,0.5)'; g.beginPath(); g.ellipse(x, y, 20 + R() * 60, 8 + R() * 20, R() * 3, 0, 7); g.fill(); }
  g.globalCompositeOperation = 'source-over';
  // paint runs below the letters
  for (let i = 0; i < 18; i++) { const x = 170 + R() * 680, y = 390 + R() * 40; const gr = g.createLinearGradient(0, y, 0, y + 50 + R() * 60); gr.addColorStop(0, 'rgba(32,30,28,0.5)'); gr.addColorStop(1, 'rgba(32,30,28,0)'); g.fillStyle = gr; g.fillRect(x, y, 3, 110); }
  return S.texFrom(c, true, false);
}
// grime running down from roof edges: dark streaks fading downward (alpha)
function streaks() {
  const R = S.rng(23);
  return tex2d(1024, 256, (g, W, H) => {
    for (let i = 0; i < 120; i++) {
      const x = R() * W, l = (0.3 + R() * 0.7) * H, w = 2 + R() * 14, a = 0.1 + R() * 0.35;
      const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, `rgba(22,18,14,${a})`); gr.addColorStop(1, 'rgba(22,18,14,0)');
      g.fillStyle = gr; g.fillRect(x, 0, w, l);
    }
    const gr = g.createLinearGradient(0, 0, 0, H * 0.35); gr.addColorStop(0, 'rgba(22,18,14,0.45)'); gr.addColorStop(1, 'rgba(22,18,14,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H);
  });
}
// two signs side by side: 출입금지 (red) and a biohazard plate (yellow)
function outSigns() {
  const R = S.rng(29);
  const c = S.canvas(512, 256), g = c.getContext('2d');
  g.fillStyle = '#b8231b'; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = '#f2eee6'; g.lineWidth = 8; g.strokeRect(14, 14, 228, 228);
  g.fillStyle = '#f6f2ea'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.font = `900 64px ${FONT}`;
  g.fillText('출입', 128, 92); g.fillText('금지', 128, 168);
  g.fillStyle = '#e8b90f'; g.fillRect(256, 0, 256, 256);
  g.save(); g.translate(384, 140);
  g.fillStyle = '#151515'; g.beginPath(); g.moveTo(0, -112); g.lineTo(108, 76); g.lineTo(-108, 76); g.closePath(); g.fill();
  g.fillStyle = '#e8b90f'; g.beginPath(); g.moveTo(0, -88); g.lineTo(86, 64); g.lineTo(-86, 64); g.closePath(); g.fill();
  g.translate(0, 12); g.fillStyle = '#151515';
  for (let k = 0; k < 3; k++) {
    const a = -Math.PI / 2 + (k * 2 * Math.PI) / 3;
    g.beginPath(); g.arc(Math.cos(a) * 18, Math.sin(a) * 18, 22, 0, 7); g.fill();
    g.save(); g.globalCompositeOperation = 'destination-out'; g.beginPath(); g.arc(Math.cos(a) * 24, Math.sin(a) * 24, 14, 0, 7); g.fill(); g.restore();
  }
  g.beginPath(); g.arc(0, 0, 7, 0, 7); g.fillStyle = '#e8b90f'; g.fill();
  g.restore();
  // age both
  for (let i = 0; i < 30; i++) softSpot(g, R() * 512, R() * 256, 10 + R() * 50, '90,55,25', 0.2 + R() * 0.25);
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.25})`; g.fillRect(R() * 512, R() * 256, 1 + R() * 3, 1 + R() * 2); }
  return S.texFrom(c, true, false);
}
function hazardStripes() {
  return tex2d(256, 64, (g, W, H) => {
    g.fillStyle = '#e8e2d6'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#d4561c';
    for (let x = -64; x < W + 64; x += 64) { g.beginPath(); g.moveTo(x, H); g.lineTo(x + 32, H); g.lineTo(x + 64, 0); g.lineTo(x + 32, 0); g.fill(); }
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.5; g.drawImage(S.noiseCanvas(64, 6, 31), 0, 0, W, H);
  });
}

// ---------------------------------------------------------------- sky (equirectangular canvas)
// three.js equirect: u = atan(dir.z, dir.x) / 2pi + 0.5, v = asin(dir.y) / pi + 0.5; canvas y = (1 - v) * H
function skyCanvas(mode, sunDir) {
  const W = 2048, H = 1024, c = S.canvas(W, H), g = c.getContext('2d'), R = S.rng(mode === 'dusk' ? 5 : 6), hz = H / 2;
  const su = (Math.atan2(sunDir.z, sunDir.x) / (2 * Math.PI) + 0.5) * W, sv = (0.5 - Math.asin(sunDir.y) / Math.PI) * H;
  const grad = (stops, y0, y1) => { const gr = g.createLinearGradient(0, y0, 0, y1); for (const [t, col] of stops) gr.addColorStop(t, col); g.fillStyle = gr; g.fillRect(0, y0, W, y1 - y0); };
  const wrapX = (x, r, fn) => { fn(x); if (x - r < 0) fn(x + W); if (x + r > W) fn(x - W); };
  if (mode === 'dusk') {
    grad([[0, '#17142a'], [0.45, '#33233f'], [0.68, '#6a2c43'], [0.82, '#b2433a'], [0.93, '#ec7536'], [1, '#ffb45c']], 0, hz);
    // the sun side burns brighter
    wrapX(su, 700, (x) => softSpot(g, x, hz, 700, '255,150,80', 0.55));
    wrapX(su, 260, (x) => softSpot(g, x, sv, 260, '255,200,120', 0.8));
    // broken cloud banks: clusters of small streaky puffs, violet bodies with undersides lit toward the sun
    const gauss = () => (R() + R() + R() - 1.5) / 1.5;
    for (let c = 0; c < 34; c++) {
      const cy = hz * (0.4 + R() * 0.54), cx = R() * W, cw = 120 + R() * 600, ch = 4 + 18 * (cy / hz);
      for (let i = 0; i < 26; i++) {
        const x = cx + gauss() * cw, y = cy + gauss() * ch * 1.6, w = 20 + R() * 110 * (cy / hz + 0.3), h = 2 + R() * ch * 0.6;
        let du = Math.abs(x - su); du = Math.min(du, W - du);
        const lit = Math.exp(-du / 520) * (0.35 + 0.65 * (y / hz));
        wrapX(x, w, (xx) => {
          g.globalAlpha = 0.18 + R() * 0.3;
          g.fillStyle = `rgb(${72 + lit * 60},${30 + lit * 26},${50 + lit * 6})`; g.beginPath(); g.ellipse(xx, y, w, h, 0, 0, 7); g.fill();
          g.globalAlpha = 0.15 + lit * 0.55;
          g.fillStyle = `rgb(255,${110 + lit * 80},${60 + lit * 40})`; g.beginPath(); g.ellipse(xx, y + h * 0.55, w * 0.85, h * 0.4, 0, 0, 7); g.fill();
        });
      }
    }
    g.globalAlpha = 1;
    if (sv < hz) { g.fillStyle = '#ffe6b0'; g.beginPath(); g.arc(su, sv, 20, 0, 7); g.fill(); }
    grad([[0, '#3a2228'], [1, '#120c10']], hz, H);
  } else {
    grad([[0, '#02030a'], [0.6, '#070c1c'], [0.9, '#111a30'], [1, '#1c2640']], 0, hz);
    for (let i = 0; i < 1400; i++) { const y = R() * hz * 0.92; g.fillStyle = `rgba(230,236,255,${R() * R() * (1 - y / hz) * 0.9})`; g.fillRect(R() * W, y, R() < 0.06 ? 2 : 1, R() < 0.06 ? 2 : 1); }
    for (let i = 0; i < 40; i++) {
      const y = hz * (0.45 + R() * 0.5), x = R() * W, w = 150 + R() * 500, h = 6 + R() * 18;
      wrapX(x, w, (xx) => { g.globalAlpha = 0.35 + R() * 0.3; g.fillStyle = '#0a0f1c'; g.beginPath(); g.ellipse(xx, y, w, h, 0, 0, 7); g.fill(); });
    }
    g.globalAlpha = 1;
    wrapX(su, 220, (x) => softSpot(g, x, sv, 220, '150,170,220', 0.35));
    g.fillStyle = '#e6e9f2'; g.beginPath(); g.arc(su, sv, 13, 0, 7); g.fill();
    grad([[0, '#0c1120'], [1, '#04060a']], hz, H);
  }
  // the forest on the horizon all round: jagged pine tops, with a few rises
  g.fillStyle = mode === 'dusk' ? '#140d12' : '#030407';
  g.beginPath(); g.moveTo(0, H);
  for (let x = 0; x <= W; x += 3) {
    const rise = 10 * Math.sin(x / W * Math.PI * 6) + 8 * Math.sin(x / W * Math.PI * 14 + 1);
    g.lineTo(x, hz - 14 - rise - (R() < 0.35 ? R() * 18 : R() * 6));
  }
  g.lineTo(W, H); g.closePath(); g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace; t.mapping = THREE.EquirectangularReflectionMapping;
  return t;
}

// ---------------------------------------------------------------- forest (instanced)
function treeGeometries() {
  const R = S.rng(41);
  const paint = (g, col) => { const n = g.index ? g.toNonIndexed() : g; const a = new Float32Array(n.attributes.position.count * 3); for (let i = 0; i < a.length; i += 3) { a[i] = col.r; a[i + 1] = col.g; a[i + 2] = col.b; } n.setAttribute('color', new THREE.BufferAttribute(a, 3)); n.deleteAttribute('uv'); return n; };
  const merge = (parts) => { const g = mergeAll(parts); g.computeVertexNormals(); return g; };
  // pine: three stacked cones on a thin trunk
  const pine = [paint(new THREE.CylinderGeometry(0.12, 0.2, 3, 6).translate(0, 1.5, 0), C('#2b2018'))];
  [[2.2, 4.2, 2.4], [1.7, 3.6, 4.6], [1.1, 3.0, 6.6]].forEach(([r, h, y], i) => pine.push(paint(new THREE.ConeGeometry(r, h, 7).translate(0, y + h / 2 - 0.6, 0).rotateY(i * 0.7), C(['#18241a', '#1c291c', '#203020'][i]))));
  // broadleaf: lumpy crown of a few blobs
  const leaf = [paint(new THREE.CylinderGeometry(0.15, 0.25, 3.4, 6).translate(0, 1.7, 0), C('#2e2318'))];
  for (let k = 0; k < 5; k++) { const a = (k / 5) * 6.28, r = k ? 1.2 : 0; leaf.push(paint(new THREE.IcosahedronGeometry(1.5 + R() * 0.6, 0).translate(Math.cos(a) * r, 4.6 + R() * 1.2 + (k ? 0 : 1), Math.sin(a) * r), C(['#232c19', '#29311b', '#2c351f'][k % 3]))); }
  return [merge(pine), merge(leaf)];
}
function mergeAll(list) {
  // positions, normals, colours only
  let n = 0; for (const g of list) n += g.attributes.position.count;
  const pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  let o = 0;
  for (const g of list) { pos.set(g.attributes.position.array, o * 3); col.set(g.attributes.color.array, o * 3); o += g.attributes.position.count; }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ---------------------------------------------------------------- build
export function buildExterior(scene, renderer) {
  const R = S.rng(20261116);
  const B = new P.Batch();
  const group = new THREE.Group(); group.name = 'exterior';
  scene.add(group);
  const add = (mat, g, col = 0xffffff, m = null) => B.add(mat, RM, g, col instanceof THREE.Color ? col : C(col), m);
  const boxAt = (mat, w, h, d, x, y, z, col, m = null, ry = 0) => { const g = P.box(w, h, d); if (ry) g.rotateY(ry); g.translate(x, y, z); add(mat, g, col, m); };
  const lamps = [];   // { pos, dir|null, kind }

  // ---- walls, windows, doors
  const winAt = (m, h) => {
    const fz = -0.12, cols = h.cols, rows = h.rows, cw = h.w / cols, ch = h.h / rows;
    const frame = C('#34383a');
    boxAt('metal', h.w, 0.07, 0.1, h.x + h.w / 2, h.y + h.h - 0.035, fz, frame, m);
    boxAt('metal', h.w, 0.07, 0.1, h.x + h.w / 2, h.y + 0.035, fz, frame, m);
    boxAt('metal', 0.07, h.h, 0.1, h.x + 0.035, h.y + h.h / 2, fz, frame, m);
    boxAt('metal', 0.07, h.h, 0.1, h.x + h.w - 0.035, h.y + h.h / 2, fz, frame, m);
    for (let i = 1; i < cols; i++) boxAt('metal', 0.04, h.h, 0.06, h.x + i * cw, h.y + h.h / 2, fz, frame, m);
    for (let j = 1; j < rows; j++) boxAt('metal', h.w, 0.04, 0.06, h.x + h.w / 2, h.y + j * ch, fz, frame, m);
    for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
      if (R() < 0.13) continue;                                   // broken pane: the dark shows through
      const g = new THREE.PlaneGeometry(cw - 0.03, ch - 0.03); g.translate(h.x + (i + 0.5) * cw, h.y + (j + 0.5) * ch, fz - 0.02);
      add('glass', g, C('#ffffff').multiplyScalar(0.55 + R() * 0.45), m);
    }
    boxAt('concrete', h.w + 0.24, 0.07, 0.2, h.x + h.w / 2, h.y - 0.035, 0.07, 0xffffff, m);   // sill
  };
  const doorAt = (m, h, lit) => {
    const cx = h.x + h.w / 2;
    boxAt('metal', h.w - 0.04, h.h - 0.02, 0.05, cx, (h.h - 0.02) / 2, -0.14, C('#46524b'), m);
    boxAt('metal', 0.06, h.h, 0.12, h.x + 0.03, h.h / 2, -0.04, C('#2e3230'), m);
    boxAt('metal', 0.06, h.h, 0.12, h.x + h.w - 0.03, h.h / 2, -0.04, C('#2e3230'), m);
    boxAt('metal', h.w, 0.06, 0.12, cx, h.h - 0.03, -0.04, C('#2e3230'), m);
    boxAt('metal', 0.12, 0.03, 0.06, h.x + h.w - 0.18, 1.0, -0.09, C('#9a9a94'), m);
    boxAt('metal', h.w + 0.6, 0.05, 0.7, cx, h.h + 0.4, 0.35, C('#3b3e3c'), m);        // little rain hood
    lampHousing(m, cx, h.h + 0.32, 0.2);
    if (lit) lamps.push({ pos: new V3(cx, h.h + 0.25, 0.2).applyMatrix4(m), kind: 'wall' });
  };
  const lampHousing = (m, x, y, z) => {
    const g = new THREE.CylinderGeometry(0.06, 0.2, 0.16, 12); g.translate(x, y, z); add('metal', g, C('#2b2d2c'), m);
    const b = new THREE.SphereGeometry(0.065, 10, 6); b.translate(x, y - 0.09, z); add('bulb', b, 0xffffff, m);
  };
  const shutterAt = (m, h) => {
    const g = corrugated(h.w, h.h, 0.11, 0.035, true); g.translate(h.x + h.w / 2, h.h / 2, -0.17); add('shutter', g, 0xffffff, m);
    boxAt('metal', h.w, 0.12, 0.08, h.x + h.w / 2, 0.06, -0.12, C('#3a3b3a'), m);                 // bottom bar
    for (const x of [h.x + 0.06, h.x + h.w - 0.06]) boxAt('metal', 0.14, h.h + 0.1, 0.16, x, (h.h + 0.1) / 2, -0.06, C('#4a4c4b'), m);   // guide rails
    boxAt('metal', h.w + 0.3, 0.32, 0.22, h.x + h.w / 2, h.h + 0.16, -0.04, C('#3f4241'), m);   // header
  };
  const blackBack = (m, h) => { const g = new THREE.PlaneGeometry(h.w, h.h); g.translate(h.x + h.w / 2, h.y + h.h / 2, -T + 0.03); add('black', g, 0x000000, m); };

  for (const b of BUILDINGS) {
    const sd = sides(b);
    for (const k of ['s', 'n', 'e', 'w']) {
      if (b.skip && b.skip.includes(k)) continue;
      const s = sd[k], holes = (b.holes && b.holes[k]) || [];
      let outline = [[0, 0], [s.len, 0], [s.len, b.h], [0, b.h]];
      if (b.ridge && s.gable) outline = [[0, 0], [s.len, 0], [s.len, b.h], [s.len / 2, b.ridge], [0, b.h]];
      if (b.lean) {
        const hi0 = k === 's' ? b.highAt === 'x1' : b.highAt === 'x0';     // is this wall's local x = 0 end the high one
        if (k === 's' || k === 'n') outline = hi0 ? [[0, 0], [s.len, 0], [s.len, b.h], [0, b.lean]] : [[0, 0], [s.len, 0], [s.len, b.lean], [0, b.h]];
        else if ((k === 'e') === (b.highAt === 'x1')) outline = [[0, 0], [s.len, 0], [s.len, b.lean], [0, b.lean]];
      }
      add('concrete', wallGeom(outline, holes), 0xffffff, s.m);
      for (const h of holes) {
        if (h.kind !== 'shutter') blackBack(s.m, h);
        if (h.kind === 'win') winAt(s.m, h);
        else if (h.kind === 'door') doorAt(s.m, h, k === 's');
        else shutterAt(s.m, h);
      }
      // grime running down from the top edge
      const top = Math.min(...outline.slice(2).map((v) => v[1]));
      const st = new THREE.PlaneGeometry(s.len, 2.6), su = st.attributes.uv; for (let i = 0; i < su.count; i++) su.setX(i, su.getX(i) * s.len / 8);
      st.translate(s.len / 2, top - 1.35, 0.012); add('streak', st, 0xffffff, s.m);
    }
    // roofs
    if (b.ridge) gableRoof(b);
    else if (b.lean) leanRoof(b);
    else flatRoof(b);
  }

  function gableRoof(b) {
    const ov = 0.5, run = (b.x1 - b.x0) / 2 + ov, rise = b.ridge - b.h, a = Math.atan2(rise, (b.x1 - b.x0) / 2);
    const L = run / Math.cos(a), D = b.z1 - b.z0 + 2 * ov, zc = (b.z0 + b.z1) / 2, xc = (b.x0 + b.x1) / 2, lift = 0.14;
    for (const sgn of [1, -1]) {
      const g = corrugated(L, D, 0.2, 0.045, true);
      g.rotateX(-Math.PI / 2); g.translate(sgn * L / 2, 0, 0); g.rotateZ(-sgn * a); g.translate(xc, b.ridge + lift, zc);
      add('roof', g);
      // barge boards along both gable edges, gutter along the eave
      for (const z of [b.z0 - ov, b.z1 + ov]) {
        const bb = P.box(L, 0.32, 0.06); bb.translate(sgn * L / 2, -0.12, 0); bb.rotateZ(-sgn * a); bb.translate(xc, b.ridge + lift, z); add('metal', bb, C('#2f3231'));
      }
      const ex = xc + sgn * run, ey = b.ridge + lift - Math.tan(a) * run - 0.12;
      const gt = P.box(0.18, 0.16, D); gt.translate(ex + sgn * 0.06, ey, zc); add('metal', gt, C('#3a3c3b'));
    }
    const cap = P.box(0.4, 0.12, D); cap.translate(xc, b.ridge + lift + 0.06, zc); add('metal', cap, C('#3a3c3b'));
    // downpipes at the front corners
    for (const x of [b.x0 - 0.14, b.x1 + 0.14]) P.pipe(B, RM, [[x, b.h + 0.1, b.z0 - 0.2], [x, 0.25, b.z0 - 0.2], [x, 0.05, b.z0 - 0.5]], 0.06, C('#4c4f4e'), R);
  }
  function leanRoof(b) {
    const dir = b.highAt === 'x0' ? 1 : -1, hiX = dir > 0 ? b.x0 : b.x1;            // dir: from the high side down, in x
    const ov = 0.4, span = b.x1 - b.x0, a = Math.atan2(b.lean - b.h, span), L = (span + ov) / Math.cos(a), D = b.z1 - b.z0 + 2 * ov;
    const g = corrugated(L, D, 0.2, 0.04, true);
    g.rotateX(-Math.PI / 2); g.translate(dir * L / 2, 0, 0); g.rotateZ(-dir * a); g.translate(hiX, b.lean + 0.12, (b.z0 + b.z1) / 2);
    add('roof', g);
    for (const z of [b.z0 - ov, b.z1 + ov]) { const bb = P.box(L, 0.26, 0.06); bb.translate(dir * L / 2, -0.1, 0); bb.rotateZ(-dir * a); bb.translate(hiX, b.lean + 0.12, z); add('metal', bb, C('#2f3231')); }
  }
  function flatRoof(b) {
    const w = b.x1 - b.x0, d = b.z1 - b.z0, xc = (b.x0 + b.x1) / 2, zc = (b.z0 + b.z1) / 2;
    boxAt('concrete', w + 0.2, 0.3, d + 0.2, xc, b.h + 0.15, zc, 0xffffff);
    if (w * d > 150) {   // big blocks: a low parapet
      for (const [pw, pd, px, pz] of [[w + 0.2, 0.25, xc, b.z0 - 0.0], [w + 0.2, 0.25, xc, b.z1], [0.25, d, b.x0, zc], [0.25, d, b.x1, zc]]) boxAt('concrete', pw, 0.8, pd, px, b.h + 0.7, pz, 0xffffff);
    } else railing([[b.x0 + 0.1, b.z0 + 0.1], [b.x1 - 0.1, b.z0 + 0.1], [b.x1 - 0.1, b.z1 - 0.1], [b.x0 + 0.1, b.z1 - 0.1], [b.x0 + 0.1, b.z0 + 0.1]], b.h + 0.3);
    // rooftop units
    const n = Math.max(1, Math.round(w * d / 120));
    for (let i = 0; i < n; i++) acUnit(xc + (R() - 0.5) * (w - 3), b.h + 0.3, zc + (R() - 0.5) * (d - 3), R() < 0.5 ? 0 : Math.PI / 2);
  }
  function acUnit(x, y, z, ry) {
    boxAt('metal', 1.4, 1.0, 1.0, x, y + 0.5, z, C('#9a9c96'), null, ry);
    const fan = new THREE.CylinderGeometry(0.38, 0.38, 0.04, 18); fan.translate(x, y + 1.02, z); add('metal', fan, C('#1c1d1d'));
    for (const s of [-0.5, 0.5]) boxAt('metal', 0.08, 0.12, 1.0, x + (ry ? 0 : s * 1.2), y + 0.06, z + (ry ? s * 1.2 : 0), C('#3a3a3a'), null, ry);
  }
  function railing(pts, y0, h = 1.05, col = C('#3d413f')) {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, az] = pts[i], [bx, bz] = pts[i + 1], len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bx - ax, bz - az);
      const n = Math.max(1, Math.round(len / 1.6));
      for (let k = 0; k <= n; k++) { const t = k / n, p = P.cyl(0.03, 0.03, h, 6); p.translate(ax + (bx - ax) * t, y0 + h / 2, az + (bz - az) * t); add('metal', p, col); }
      for (const yy of [h, h * 0.5]) { const r = P.cyl(0.025, 0.025, len, 6); r.rotateX(Math.PI / 2); r.rotateY(ry); r.translate((ax + bx) / 2, y0 + yy, (az + bz) / 2); add('metal', r, col); }
    }
  }
  function ladder(x, z, y0, y1, ry, cage = true, col = C('#4a4d4b')) {
    const m = P.mtx(x, 0, z, ry);
    for (const sx of [-0.22, 0.22]) boxAt('metal', 0.05, y1 - y0, 0.05, sx, (y0 + y1) / 2, 0, col, m);
    for (let y = y0 + 0.3; y < y1; y += 0.3) { const r = P.cyl(0.015, 0.015, 0.44, 6); r.rotateZ(Math.PI / 2); r.translate(0, y, 0); add('metal', r, col, m); }
    if (cage) for (let y = y0 + 2.4; y < y1; y += 0.8) { const hp = new THREE.TorusGeometry(0.36, 0.018, 4, 14, Math.PI); hp.rotateX(Math.PI / 2); hp.rotateY(Math.PI); hp.translate(0, y, 0.12); add('metal', hp, col, m); }
  }

  // ---- the dock front: canopy and lamp over the shutter, bumpers, bollards, D-7 on the gable
  const main = BUILDINGS[0];
  boxAt('metal', 7.8, 0.1, 2.7, 0, 5.32, -1.65, C('#3b3e3d'));                      // canopy plate
  boxAt('metal', 7.8, 0.3, 0.08, 0, 5.2, -3.0, C('#2d302f'));                        // fascia
  for (const sx of [-3.8, 3.8]) boxAt('metal', 0.08, 0.3, 2.7, sx, 5.2, -1.65, C('#2d302f'));
  for (const x of [-3.4, 0, 3.4]) {                                                  // tie rods up to the wall
    const a = new V3(x, 5.36, -2.9), b2 = new V3(x, 7.2, -0.36), d = b2.clone().sub(a), r = P.cyl(0.025, 0.025, d.length(), 6);
    r.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b2).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()), new V3(1, 1, 1))); add('metal', r, C('#2d302f'));
  }
  lampHousing(null, 0, 5.12, -1.5);
  lamps.push({ pos: new V3(0, 5.0, -1.5), dir: new V3(0, -1, -0.55), kind: 'canopy' });
  for (const x of [-2.85, 2.85]) boxAt('rubber', 0.3, 0.55, 0.18, x, 0.75, -0.44, C('#161616'));
  for (const x of [-3.3, 3.3]) P.bollard(B, RM, x, -0.9);
  P.quad(B, 'stencil', RM, [0, 0, 1, 1], 4.6, 2.3, 0, 9.35, main.z0 - 0.015, '-z');
  P.quad(B, 'stripes', RM, [0, 0, 4, 1], 5.4, 0.5, 0, 0.006, -0.6, 'up');
  P.quad(B, 'sign', RM, [0, 0, 0.5, 1], 0.6, 0.6, 4.4, 2.2, main.z0 - 0.02, '-z');
  // electrical cabinet and pipes on the right of the front
  boxAt('metal', 0.9, 1.6, 0.4, -11.2, 0.95, -0.56, C('#8c9089'));
  boxAt('metal', 1.0, 0.15, 0.5, -11.2, 0.08, -0.56, C('#3a3a3a'));
  P.pipe(B, RM, [[-12.0, 7.6, -0.55], [-12.0, 1.1, -0.55], [-11.65, 1.1, -0.55]], 0.09, C('#6f6a62'), R);
  P.pipe(B, RM, [[-12.3, 6.9, -0.75], [-5.2, 6.9, -0.75]], 0.07, C('#5f6461'), R);
  // tower: ladder up the front, a vent block on top (the railing comes with the flat roof)
  const tw = BUILDINGS[1];
  ladder(-17.4, tw.z0 - 0.25, 0.3, tw.h + 1.2, Math.PI);
  boxAt('metal', 1.2, 1.4, 1.2, -15.5, tw.h + 1.0, 3.1, C('#8f918b'));

  // ---- raised water tank east of the annex
  {
    const x = -27, z = 9, top = 5.6, r = 1.9, h = 3.4, col = C('#7d827f');
    for (const [dx, dz] of [[-1.4, -1.4], [1.4, -1.4], [1.4, 1.4], [-1.4, 1.4]]) boxAt('metal', 0.16, top, 0.16, x + dx, top / 2, z + dz, col);
    for (const [ax, az, bx, bz] of [[-1.4, -1.4, 1.4, -1.4], [1.4, -1.4, 1.4, 1.4], [1.4, 1.4, -1.4, 1.4], [-1.4, 1.4, -1.4, -1.4]]) for (const [y0, y1] of [[0.4, 2.9], [2.9, 0.4], [2.9, 5.4], [5.4, 2.9]]) {
      const a = new V3(x + ax, y0, z + az), b2 = new V3(x + bx, y1, z + bz), d = b2.clone().sub(a), g = P.cyl(0.035, 0.035, d.length(), 5);
      g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b2).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()), new V3(1, 1, 1))); add('metal', g, col);
    }
    boxAt('metal', 4.0, 0.15, 4.0, x, top, z, C('#4c4f4d'));
    const body = P.cyl(r, r, h, 32, false, 0.6); body.translate(x, top + h / 2, z); add('metal', body, C('#a3a59f'));
    for (let y = 0.6; y < h; y += 1.1) { const t = new THREE.TorusGeometry(r + 0.01, 0.03, 6, 40); t.rotateX(Math.PI / 2); t.translate(x, top + y, z); add('metal', t, C('#7d7f7a')); }
    const dome = new THREE.ConeGeometry(r + 0.08, 0.7, 32, 1, true); dome.translate(x, top + h + 0.35, z); add('metal', dome, C('#8a8c86'));
    railing([[x - 2, z - 2], [x + 2, z - 2], [x + 2, z + 2], [x - 2, z + 2], [x - 2, z - 2]], top + 0.08);
    ladder(x - 1.4, z - 2.15, 0.2, top + 0.9, Math.PI, true);
    P.pipe(B, RM, [[x + 0.6, top, z - 0.6], [x + 0.6, 0.6, z - 0.6], [-23.2, 0.6, z - 0.6]], 0.1, C('#6a6e6b'), R);
  }

  // ---- yard props
  const pallets = (x, z, n, ry = 0) => { for (let i = 0; i < n; i++) P.pallet(B, RM, P.mtx(x + (R() - 0.5) * 0.08, i * 0.145, z + (R() - 0.5) * 0.08, ry + (R() - 0.5) * 0.06), R, R() < 0.2); };
  const crate = (x, z, s, ry = R() * 0.4, y = 0) => boxAt('wood', s, s * 0.8, s, x, y + s * 0.4, z, C('#ffffff').multiplyScalar(0.7 + R() * 0.3), null, ry);
  pallets(-5.6, -1.2, 4, 0.05); crate(-6.9, -1.0, 0.9); crate(-6.9, -1.0, 0.7, 0.3, 0.72);
  pallets(5.8, -1.1, 2, -0.08); crate(6.0, -1.1, 0.8, 0.1, 0.29);
  for (const [x, z] of [[-19.6, -0.6], [-20.2, -0.3], [-19.9, -1.2]]) P.drum(B, RM, P.mtx(x, 0, z, R() * 6), R, Math.floor(R() * 4), { dent: R() < 0.5 });
  // fenced store yard in front of the lean-to
  pallets(14.4, -1.4, 5, 0.1); pallets(15.8, -1.2, 3, -0.15); pallets(22.2, -0.8, 2, 1.5);
  crate(21.4, -2.7, 1.0); crate(21.4, -2.7, 0.8, 0.5, 0.8); crate(16.9, 0.5, 0.7);
  for (const [x, z] of [[13.4, 0.7], [13.9, 1.0]]) P.drum(B, RM, P.mtx(x, 0, z, R() * 6), R, Math.floor(R() * 4));
  // jersey barriers in front of the tower and annex
  for (let i = 0; i < 5; i++) jersey(-15 - i * 2.1, -5.2, (R() - 0.5) * 0.08);
  for (let i = 0; i < 3; i++) jersey(26.5, 4 + i * 2.1, Math.PI / 2 + (R() - 0.5) * 0.1);
  function jersey(x, z, ry) {
    const sh = new THREE.Shape([[-0.3, 0], [0.3, 0], [0.3, 0.25], [0.1, 0.8], [-0.1, 0.8], [-0.3, 0.25]].map(([a, b2]) => new THREE.Vector2(a, b2)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 2.0, bevelEnabled: false }); g.translate(0, 0, -1.0); g.rotateY(Math.PI / 2 + ry); g.translate(x, 0, z); add('concrete', g);
    for (const s of [-1, 1]) {
      const q = new THREE.PlaneGeometry(1.96, 0.24); q.attributes.uv.array.forEach((v, i, arr) => { if (i % 2 === 0) arr[i] = v * 3; });
      if (s < 0) q.rotateY(Math.PI); q.translate(0, 0.13, s * 0.305); q.rotateY(ry); q.translate(x, 0, z); add('stripes', q);
    }
  }
  // guard booth by the gate
  {
    const x = 8.6, z = -25.2;
    boxAt('metal', 2.2, 1.0, 2.2, x, 0.5, z, C('#9a9a92'));
    for (const [w, d, px, pz] of [[2.2, 0.08, x, z - 1.06], [2.2, 0.08, x, z + 1.06], [0.08, 2.2, x - 1.06, z], [0.08, 2.2, x + 1.06, z]]) {
      for (const y of [1.0, 2.36]) boxAt('metal', w, 0.08, d, px, y, pz, C('#8a8a82'));
    }
    for (const [dx, dz] of [[-1.06, -1.06], [1.06, -1.06], [1.06, 1.06], [-1.06, 1.06]]) boxAt('metal', 0.1, 2.4, 0.1, x + dx, 1.2, z + dz, C('#8a8a82'));
    for (const [w, h2, px, pz, ry] of [[2.0, 1.3, x, z - 1.04, Math.PI], [2.0, 1.3, x - 1.04, z, -Math.PI / 2], [2.0, 1.3, x + 1.04, z, Math.PI / 2]]) {
      const g = new THREE.PlaneGeometry(w, h2); g.rotateY(ry); g.translate(px, 1.68, pz); add('glass', g, C('#8a8a8a'));
      const b2 = new THREE.PlaneGeometry(w, h2); b2.rotateY(ry + Math.PI); b2.translate(px, 1.68, pz); add('black', b2, 0x000000);
    }
    boxAt('metal', 2.0, 1.36, 2.0, x, 1.68, z + 0.0, C('#050505'));
    boxAt('metal', 2.9, 0.16, 2.9, x, 2.5, z, C('#5d605d'));
  }
  // street lamps
  streetLamp(-7, -26.6, 0); streetLamp(22, -12, Math.PI); streetLamp(-28, 24, 0);
  function streetLamp(x, z, ry) {
    const pole = P.cyl(0.09, 0.13, 7, 10); pole.translate(x, 3.5, z); add('metal', pole, C('#3c3f3e'));
    const dx = Math.cos(ry), dz = -Math.sin(ry);
    const arm = P.box(1.5, 0.08, 0.08); arm.rotateY(ry); arm.translate(x + dx * 0.7, 6.95, z + dz * 0.7); add('metal', arm, C('#3c3f3e'));
    const head = P.box(0.55, 0.14, 0.3); head.rotateY(ry); head.translate(x + dx * 1.45, 6.9, z + dz * 1.45); add('metal', head, C('#2e3130'));
    const bulb = new THREE.PlaneGeometry(0.42, 0.2); bulb.rotateX(Math.PI / 2); bulb.rotateY(ry); bulb.translate(x + dx * 1.45, 6.82, z + dz * 1.45); add('bulb', bulb);
    lamps.push({ pos: new V3(x + dx * 1.45, 6.75, z + dz * 1.45), dir: new V3(0, -1, 0), kind: 'street' });
  }

  // ---- perimeter fence with the gate open, signs on it
  const fence = (ax, az, bx, bz) => {
    const len = Math.hypot(bx - ax, bz - az), ry = Math.atan2(bz - az, bx - ax), n = Math.max(1, Math.round(len / 2.6));
    for (let k = 0; k <= n; k++) { const t = k / n, p = P.cyl(0.045, 0.045, 2.75, 8); p.translate(ax + (bx - ax) * t, 1.375, az + (bz - az) * t); add('metal', p, C('#6a6d6a')); }
    const rail = P.cyl(0.03, 0.03, len, 6); rail.rotateZ(Math.PI / 2); rail.rotateY(-ry); rail.translate((ax + bx) / 2, 2.25, (az + bz) / 2); add('metal', rail, C('#6a6d6a'));
    for (const y of [2.45, 2.62]) { const w = P.cyl(0.006, 0.006, len, 3); w.rotateZ(Math.PI / 2); w.rotateY(-ry); w.translate((ax + bx) / 2, y, (az + bz) / 2); add('metal', w, C('#555')); }
    const mesh = new THREE.PlaneGeometry(len, 2.2); const uv = mesh.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * len / 0.25, uv.getY(i) * 2.2 / 0.25);
    mesh.rotateY(-ry); mesh.translate((ax + bx) / 2, 1.15, (az + bz) / 2); add('chain', mesh, C('#a8aaa6'));
  };
  const Y = YARD;
  fence(Y.x0, Y.z0, GATE.x0, Y.z0); fence(GATE.x1, Y.z0, Y.x1, Y.z0);
  fence(Y.x1, Y.z0, Y.x1, Y.z1); fence(Y.x1, Y.z1, Y.x0, Y.z1); fence(Y.x0, Y.z1, Y.x0, Y.z0);
  fence(12.9, -3.8, 17.6, -3.8); fence(20.4, -3.8, 23.4, -3.8); fence(23.4, -3.8, 23.4, 1.5);   // store yard by the lean-to
  // gate leaves, swung in
  for (const [hx, s] of [[GATE.x0, 1], [GATE.x1, -1]]) {
    const ang = s * 1.15, m = new THREE.Matrix4().makeRotationY(-ang).setPosition(hx, 0, Y.z0);
    for (const [w, h2, x, y] of [[5, 0.08, s * 2.5, 2.3], [5, 0.08, s * 2.5, 0.15], [0.08, 2.2, s * 0.04, 1.22], [0.08, 2.2, s * 4.96, 1.22]]) boxAt('metal', w, h2, 0.06, x, y, 0, C('#6f726e'), m);
    const d = Math.hypot(4.9, 2.1), ang2 = Math.atan2(2.1, 4.9);
    for (const sg of [1, -1]) { const g = P.box(d, 0.06, 0.05); g.rotateZ(sg * ang2); g.translate(s * 2.5, 1.22, 0); add('metal', g, C('#6f726e'), m); }
    const mesh = new THREE.PlaneGeometry(4.9, 2.1); const uv = mesh.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 4.9 / 0.25, uv.getY(i) * 2.1 / 0.25);
    mesh.translate(s * 2.5, 1.22, 0); add('chain', mesh, C('#a8aaa6'), m);
  }
  for (const [x, cell] of [[-7.6, 0], [-9.2, 1], [7.4, 0]]) P.quad(B, 'sign', RM, [cell * 0.5, 0, 0.5, 1], 0.7, 0.7, x, 1.55, Y.z0 - 0.03, '-z');

  // ---- ground: wet asphalt yard and road, forest floor beyond
  const yard = new THREE.PlaneGeometry(Y.x1 - Y.x0 + 4, Y.z1 - Y.z0 + 4); yard.rotateX(-Math.PI / 2); yard.translate((Y.x0 + Y.x1) / 2, 0, (Y.z0 + Y.z1) / 2); add('ground', yard);
  const road = new THREE.PlaneGeometry(8, 380); road.rotateX(-Math.PI / 2); road.translate(0, 0.002, Y.z0 - 2 - 190); add('ground', road);
  const floor = new THREE.PlaneGeometry(900, 900); const fu = floor.attributes.uv; for (let i = 0; i < fu.count; i++) fu.setXY(i, fu.getX(i) * 60, fu.getY(i) * 60);
  floor.rotateX(-Math.PI / 2); floor.translate(0, -0.03, 0); add('dirt', floor);
  // painted bay lines and oil stains
  for (const x of [-2.7, 2.7]) { const l = new THREE.PlaneGeometry(0.14, 12); l.rotateX(-Math.PI / 2); l.translate(x, 0.004, -7); add('paint', l, C('#c9a227')); }
  for (let i = 0; i < 26; i++) { const x = (R() - 0.5) * 40, z = -2 - R() * 22; P.quad(B, 'decal', RM, decals.cell([0, 3, 15, 1][i % 4]), 1 + R() * 2.5, 1 + R() * 2.5, x, 0.005 + R() * 0.002, z, 'up', R() * 6); }

  // ---------------------------------------------------------------- materials
  // (decals come from the map's sheet; declared before use above via hoisting below)
  const macro = S.macroNoise(), rc = S.rawConcrete(7), cf = S.concreteFloor(1);
  const W = (o) => S.worldMaterial({ macro, ...o });
  const metalT = PT.paintedMetal();
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const dirtMap = S.macroNoise(); dirtMap.repeat.set(1, 1);
  const materials = {
    concrete: W({ color: rc.color, data: rc.data, tint: 0xa29d96, floorDirt: 0.55, macroK: 0.45 }),
    ground: W({ color: cf.color, data: cf.data, tint: 0x4a4949, wet: 0.6, macroK: 0.5, tile: 5 }),
    dirt: std({ map: dirtMap, color: 0x3d3b2c, roughness: 1 }),
    metal: std({ map: metalT.map, normalMap: metalT.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.55, metalness: 0.35 }),
    roof: std({ map: sheetMetal('#6c645c', '118,58,24', 51), roughness: 0.62, metalness: 0.45, side: THREE.DoubleSide }),
    shutter: std({ map: sheetMetal('#8e8f8a', '110,62,30', 53), roughness: 0.5, metalness: 0.5 }),
    wood: std({ map: PT.wood(), roughness: 0.9 }),
    drum: std({ map: PT.drums(), roughness: 0.45, metalness: 0.12 }),
    rubber: std({ roughness: 0.85 }),
    glass: std({ color: 0x6a7074, roughness: 0.12, metalness: 0.7, envMapIntensity: 1.6 }),
    black: new THREE.MeshBasicMaterial({ color: 0x000000 }),
    bulb: std({ color: 0xffffff, emissive: 0xffd49a, emissiveIntensity: 3 }),
    chain: std({ map: chainLink(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.6 }),
    stencil: std({ map: stencil('D-7'), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.9 }),
    streak: std({ map: streaks(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, roughness: 0.9 }),
    decal: std({ map: decals.map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.6 }),
    stripes: std({ map: hazardStripes(), roughness: 0.7, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    paint: std({ roughness: 0.6, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    sign: std({ map: outSigns(), roughness: 0.6, side: THREE.DoubleSide }),
  };
  materials.stripes.map.wrapS = THREE.RepeatWrapping;
  const meshes = B.build(materials, group, new Set(['concrete', 'metal', 'roof', 'shutter', 'wood', 'drum', 'chain', 'rubber']));
  for (const m of meshes) {
    const k = m.userData.dressMat;
    if (['stencil', 'streak', 'decal'].includes(k)) m.renderOrder = 2;
    if (k === 'dirt' || k === 'ground') m.castShadow = false;
  }

  // ---- forest round the fence and along the road
  const [pineG, leafG] = treeGeometries();
  const treeMat = new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 0.95 });
  const spots = [];
  for (let tries = 0; spots.length < 1100 && tries < 6000; tries++) {
    const x = (R() - 0.5) * 420, z = -230 + R() * 420;
    if (x > Y.x0 - 5 && x < Y.x1 + 5 && z > Y.z0 - 5 && z < Y.z1 + 5) continue;    // the yard
    if (Math.abs(x) < 7 + R() * 2 && z < Y.z0) continue;                            // the road
    const near = Math.max(0, 1 - (Math.min(Math.abs(x - 1) , Math.abs(z - 25)) - 30) / 120);
    if (R() > 0.35 + near) continue;                                                 // denser near the yard
    spots.push([x, z]);
  }
  const pines = spots.filter(() => R() < 0.62), leafs = spots.filter((s) => !pines.includes(s));
  for (const [geo, list] of [[pineG, pines], [leafG, leafs]]) {
    const im = new THREE.InstancedMesh(geo, treeMat, list.length);
    const m = new THREE.Matrix4(), q = new THREE.Quaternion();
    list.forEach(([x, z], i) => { const s = 0.8 + R() * 0.9; m.compose(new V3(x, -0.05, z), q.setFromAxisAngle(new V3(0, 1, 0), R() * 6.28), new V3(s, s * (0.85 + R() * 0.4), s)); im.setMatrixAt(i, m); });
    im.castShadow = true; im.receiveShadow = true;
    group.add(im);
  }

  // ---------------------------------------------------------------- light and sky
  const sunDir = new V3(-0.82, 0.07, -0.56).normalize();     // low in the west-southwest
  const moonDir = new V3(0.45, 0.42, -0.79).normalize();
  const sun = new THREE.DirectionalLight(0xffffff, 1);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -70, right: 70, top: 70, bottom: -70, near: 1, far: 420 });
  sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.04;
  sun.target.position.set(4, 0, 18);
  group.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xffffff, 0x000000, 1);
  group.add(hemi);
  // the lamps: spots for canopy and street lamps, small points by the doors
  const lampLights = [];
  for (const l of lamps) {
    let light;
    if (l.dir) {
      light = new THREE.SpotLight(0xffc888, l.kind === 'canopy' ? 150 : 200, l.kind === 'canopy' ? 16 : 24, l.kind === 'canopy' ? 1.0 : 0.85, 0.7, 1.6);
      light.position.copy(l.pos); light.target.position.copy(l.pos).add(l.dir.clone().multiplyScalar(4));
      group.add(light.target);
      if (l.kind === 'canopy') { light.castShadow = true; light.shadow.mapSize.set(1024, 1024); light.shadow.bias = -0.0008; }
    } else light = new THREE.PointLight(0xffc27a, 12, 8, 1.8), light.position.copy(l.pos);
    group.add(light); lampLights.push(light);
  }
  const pmrem = new THREE.PMREMGenerator(renderer);
  const skies = {
    dusk: { tex: skyCanvas('dusk', sunDir), dir: sunDir, col: 0xffb98a, k: 2.0, sky: 0x9d97a8, gnd: 0x35302e, hk: 1.1, env: 0.55, fog: 0x4a3338, lamp: 0.8, exp: 1.1 },
    night: { tex: skyCanvas('night', moonDir), dir: moonDir, col: 0x8ea8e0, k: 0.6, sky: 0x2a3a5c, gnd: 0x07080b, hk: 0.6, env: 0.35, fog: 0x0a0f1a, lamp: 1.0, exp: 1.15 },
  };
  for (const s of Object.values(skies)) s.env = { k: s.env, tex: pmrem.fromEquirectangular(s.tex).texture };
  pmrem.dispose();
  function setTime(mode) {
    const s = skies[mode];
    scene.background = s.tex;
    scene.environment = s.env.tex; scene.environmentIntensity = s.env.k;
    scene.fog = new THREE.Fog(s.fog, 70, 340);
    sun.color.set(s.col); sun.intensity = s.k;
    sun.position.copy(sun.target.position).addScaledVector(s.dir, 200);
    hemi.color.set(s.sky); hemi.groundColor.set(s.gnd); hemi.intensity = s.hk;
    for (const l of lampLights) l.intensity = (l.isSpotLight ? (l.distance < 20 ? 150 : 200) : 12) * s.lamp;
    renderer.toneMappingExposure = s.exp;
  }
  setTime('dusk');
  return { group, setTime, lamps: lampLights };
}
// the map's decal sheet (oil, rust, dirt), shared
const decals = { _t: null, get map() { return (this._t ||= PT.decals()).map; }, cell(i) { return (this._t ||= PT.decals()).cell(i); } };
