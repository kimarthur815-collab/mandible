import * as THREE from 'three';

// Team 2 sprayed their way through the plant with glow paint: green toward the generators,
// orange where something waits, blue for the way out. The paint soaks up the flashlight and
// keeps glowing for a while after the beam moves on, so a sweep of the light shows the way.
const HAND = '"Nanum Pen Script", "Comic Sans MS", cursive';
const PAINT = { go: '#9dff5e', warn: '#ff8f3a', out: '#66e8ff' };

// wall: at [x, y, z] on a wall whose painted side faces n [nx, nz]
// floor: at [x, z], read by someone looking along view [fx, fz]
// to: which way the arrow points in the world ([dx, dy, dz] on walls, [dx, dz] on floors)
export const MARKS = [
  // loading dock: right where you come in
  { kind: 'go', wall: [4.75, 2.0, 9.7], n: [0, -1], to: [-1, 0, 0], text: '발전기 3대', sub: '— 2조' },
  // warehouse: along the front wall to the machine room door
  { kind: 'go', floor: [1.6, 11.9], view: [0, 1], to: [1, 0], text: '발전기' },
  { kind: 'go', floor: [9.6, 11.6], view: [1, 0], to: [0.45, 1], text: '발전기' },
  { kind: 'go', wall: [11.7, 1.8, 12.6], n: [-1, 0], to: [0, 0, 1], text: '발전기 1' },
  // the gate spider at the side passage
  { kind: 'warn', wall: [-11.7, 1.9, 25.6], n: [1, 0], sym: 'x', text: '거미!!', sub: '가지 마' },
  { kind: 'warn', floor: [-10.4, 25.4], view: [0, 1], sym: 'x', text: '거미' },
  // machine room
  { kind: 'go', wall: [21.7, 2.3, 13.7], n: [-1, 0], to: [0, -1, -1], text: '발전기 1' },
  { kind: 'go', wall: [15.5, 1.9, 19.7], n: [0, -1], to: [1, 0, 0], text: '발전기 2', sub: '복도' },
  // corridor: the threads
  { kind: 'warn', wall: [16.8, 1.7, 26.8], n: [1, 0], text: '실 조심!', sub: '앉아서 지나가' },
  // production hall: along the front, up the aisle, to the platform
  { kind: 'go', floor: [16.2, 48.3], view: [0, 1], to: [-1, 0], text: '발전기 2' },
  { kind: 'go', floor: [7.2, 48.5], view: [-1, 0], to: [0, 1], text: '발전기 2' },
  { kind: 'go', floor: [7.2, 64.4], view: [0, 1], to: [-1, 0.5], text: '발전기 2' },
  { kind: 'go', wall: [2.5, 3.1, 69.7], n: [0, -1], to: [0, -1, 0], text: '발전기 2' },
  { kind: 'go', wall: [-5.7, 1.8, 61.3], n: [1, 0], to: [0, 0, -1], text: '발전기 3', sub: '실험실' },
  // lab: the sacs over the door, the last generator, the emergency door
  { kind: 'warn', floor: [-8.4, 57.5], view: [-1, 0], text: '위에 알집!', sub: '조용히' },
  { kind: 'go', floor: [-12.2, 57.4], view: [-1, 0], to: [-1, 0], text: '발전기 3' },
  { kind: 'out', wall: [-12.3, 1.9, 52.3], n: [0, 1], to: [-1, 0, 0], text: '출구', sub: '비상 통로' },
  // emergency passage and back through the warehouse to the dock
  { kind: 'out', floor: [-15.5, 49.4], view: [0, -1], to: [0, -1], text: '출구' },
  { kind: 'out', floor: [-15.5, 31.3], view: [0, -1], to: [1, -0.6], text: '출구' },
  { kind: 'out', floor: [-10.3, 22.6], view: [0, -1], to: [0, -1], text: '출구' },
  { kind: 'out', floor: [-10.2, 12.3], view: [0, -1], to: [1, 0], text: '출구' },
  { kind: 'out', wall: [-4.7, 1.8, 10.3], n: [0, 1], to: [1, 0, 0], text: '출구', sub: '하역장' },
];

const rng = (seed) => { let s = (seed * 2654435761) >>> 0 || 1; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; };
const gauss = (R) => (R() + R() + R() - 1.5) / 1.5;
let scratch = null;

// a hand-sprayed arrow: a slightly wobbly shaft and two strokes for the head
function arrow(g, x0, y0, x1, y1, w, R) {
  const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy), ux = dx / L, uy = dy / L, px = -uy, py = ux;
  g.lineWidth = w; g.beginPath();
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, j = (R() - 0.5) * w * 0.3 * Math.sin(Math.PI * t);
    const x = x0 + dx * t + px * j, y = y0 + dy * t + py * j;
    if (i) g.lineTo(x, y); else g.moveTo(x, y);
  }
  g.stroke();
  const hl = Math.min(L * 0.45, w * 3.3);
  for (const s of [-1, 1]) {
    const a = 2.5 * s, hx = Math.cos(a) * ux - Math.sin(a) * uy, hy = Math.sin(a) * ux + Math.cos(a) * uy;
    g.beginPath(); g.moveTo(x1 + ux * w * 0.15, y1 + uy * w * 0.15);
    g.lineTo(x1 + hx * hl + (R() - 0.5) * w * 0.4, y1 + hy * hl + (R() - 0.5) * w * 0.4); g.stroke();
  }
}
function cross(g, x, y, r, w, R) {
  g.lineWidth = w;
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(x - r + (R() - 0.5) * w, y - s * r + (R() - 0.5) * w);
    g.quadraticCurveTo(x + (R() - 0.5) * w, y + (R() - 0.5) * w, x + r + (R() - 0.5) * w, y + s * r + (R() - 0.5) * w); g.stroke();
  }
}
function words(g, lines, cx, cy, bw, bh) {
  // the big line and an optional small one under it, fitted into the box by the letters' real extents
  const [big, small] = lines;
  const ext = (t, s) => {
    g.font = `${s}px ${HAND}`; const k = g.measureText(t);
    return { w: k.width, a: k.actualBoundingBoxAscent || s * 0.75, d: k.actualBoundingBoxDescent || s * 0.2 };
  };
  const b = ext(big, 100), sm = small ? ext(small, 62) : null, gap = small ? 9 : 0;
  const tall = b.a + b.d + (sm ? gap + sm.a + sm.d : 0);
  const k = Math.min(bw / Math.max(b.w, sm ? sm.w : 0), bh / tall);
  g.textAlign = 'center'; g.textBaseline = 'alphabetic';
  const line = (t, s, y) => { g.font = `${s}px ${HAND}`; g.lineWidth = Math.max(3, s * 0.045); g.strokeText(t, cx, y); g.fillText(t, cx, y); };
  let y = cy - k * tall / 2;
  line(big, 100 * k, y + k * b.a);
  y += k * (b.a + b.d + gap);
  if (sm) line(small, 62 * k, y + k * sm.a);
}

// paints one mark: solid shapes first, then the spray look (halo, patchy cover, overspray, drips)
function drawMark(c, m, ang) {
  const W = c.width, H = c.height, u = H / 192, R = rng(m.seed);
  if (!scratch) scratch = document.createElement('canvas');
  scratch.width = W; scratch.height = H;
  const g = scratch.getContext('2d', { willReadFrequently: true });
  g.clearRect(0, 0, W, H);
  g.strokeStyle = g.fillStyle = '#fff'; g.lineCap = g.lineJoin = 'round';
  const lines = [m.text, m.sub].filter(Boolean), w = 15 * u;
  let box = [W / 2, H / 2, W * 0.88, H * 0.8];
  if (m.sym === 'x') { cross(g, W * 0.2, H * 0.5, H * 0.3, w * 1.1, R); box = [W * 0.68, H * 0.5, W * 0.54, H * 0.74]; }
  else if (ang != null) {
    const ca = Math.cos(ang), sa = Math.sin(ang);
    if (Math.abs(ca) >= 0.6) {
      // pointing sideways: the arrow along the bottom, the words over it
      const L = Math.min(W * 0.36 / Math.abs(ca), H * 0.13 / Math.max(0.01, Math.abs(sa))), cx = W / 2, cy = H * 0.77;
      arrow(g, cx - ca * L, cy + sa * L, cx + ca * L, cy - sa * L, w, R);
      box = [W / 2, H * 0.29, W * 0.9, H * 0.5];
    } else {
      // up or down: the arrow stands at the side it leans to, the words beside it
      const right = ca >= 0, ax = right ? W * 0.8 : W * 0.2;
      const L = Math.min(H * 0.38 / Math.abs(sa), Math.abs(ca) > 0.01 ? W * 0.15 / Math.abs(ca) : 1e9);
      arrow(g, ax - ca * L, H / 2 + sa * L, ax + ca * L, H / 2 - sa * L, w, R);
      box = [right ? W * 0.37 : W * 0.63, H / 2, W * 0.6, H * 0.8];
    }
    if (!lines.length) box = null;
  }
  if (box && lines.length) words(g, lines, ...box);
  const A = g.getImageData(0, 0, W, H).data;
  g.globalCompositeOperation = 'source-in'; g.fillStyle = PAINT[m.kind]; g.fillRect(0, 0, W, H); g.globalCompositeOperation = 'source-over';

  const ctx = c.getContext('2d'), col = PAINT[m.kind];
  ctx.clearRect(0, 0, W, H);
  // the mist round every stroke (a shadow thrown from far off canvas, so only the blur lands)
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 16 * u; ctx.shadowOffsetX = W * 3; ctx.globalAlpha = 0.5;
  ctx.drawImage(scratch, -W * 3, 0); ctx.restore();
  ctx.save(); ctx.shadowColor = col; ctx.shadowBlur = 3 * u; ctx.drawImage(scratch, 0, 0); ctx.restore();
  // uneven cover: thinner here and there
  ctx.save(); ctx.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 26; i++) {
    const x = R() * W, y = R() * H, r = (10 + R() * 26) * u, gr = ctx.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, `rgba(0,0,0,${0.12 + R() * 0.22})`); gr.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = gr; ctx.fillRect(x - r, y - r, r * 2, r * 2);
  }
  for (let i = 0; i < 900; i++) { ctx.globalAlpha = 0.2 + R() * 0.4; ctx.fillRect(R() * W, R() * H, u, u); }   // grain
  if (m.floor) {     // scuffed by boots
    ctx.lineCap = 'round';
    for (let i = 0; i < 9; i++) { ctx.globalAlpha = 0.25 + R() * 0.35; ctx.lineWidth = (1 + R() * 3) * u; const x = R() * W, y = R() * H, a = R() * 6.28, l = (20 + R() * 60) * u; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); ctx.stroke(); }
  }
  ctx.restore();
  // overspray: fine dots flying off the edges
  const edges = [];
  for (let y = 3; y < H - 3; y += 2) for (let x = 3; x < W - 3; x += 2) {
    const i = (y * W + x) * 4 + 3;
    if (A[i] > 120 && (A[i + 12] < 30 || A[i - 12] < 30 || A[i + W * 12] < 30 || A[i - W * 12] < 30)) edges.push(x, y);
  }
  ctx.fillStyle = col;
  const nE = edges.length / 2, dots = Math.min(3200, nE * 1.2);
  for (let k = 0; k < dots && nE; k++) {
    const e = Math.floor(R() * nE) * 2, a = R() * 6.283, d = Math.abs(gauss(R)) * 9 * u + 1;
    ctx.globalAlpha = 0.25 + R() * 0.6; ctx.beginPath();
    ctx.arc(edges[e] + Math.cos(a) * d, edges[e + 1] + Math.sin(a) * d, (0.4 + R() * 1.1) * u, 0, 6.29); ctx.fill();
  }
  // drips run down from the lowest paint on a wall
  if (!m.floor) {
    const n = 3 + Math.floor(R() * 4);
    for (let k = 0; k < n; k++) {
      const x = Math.floor(W * (0.08 + R() * 0.84));
      let yb = -1; for (let y = H - 1; y >= 0; y--) if (A[(y * W + x) * 4 + 3] > 160) { yb = y; break; }
      if (yb < 0) continue;
      const len = (10 + R() * 40) * u, dw = (1.6 + R() * 1.8) * u;
      ctx.globalAlpha = 0.85;
      ctx.beginPath(); ctx.moveTo(x - dw / 2, yb - 2); ctx.lineTo(x - dw * 0.35, yb + len); ctx.lineTo(x + dw * 0.35, yb + len); ctx.lineTo(x + dw / 2, yb - 2); ctx.fill();
      ctx.beginPath(); ctx.arc(x, Math.min(H - dw, yb + len), dw * 0.75, 0, 6.29); ctx.fill();
    }
  }
  ctx.globalAlpha = 1;
}

export function createMarks(scene) {
  const list = [], v = new THREE.Vector3();
  MARKS.forEach((m, i) => {
    m.seed = 17 + i * 31;
    const floor = !!m.floor;
    // which way the arrow points on the painted surface, as the reader sees it (0 right, π/2 up)
    let ang = null, n3, pos, rotY;
    if (floor) {
      const [fx, fz] = m.view, l = Math.hypot(fx, fz), f = [fx / l, fz / l];
      if (m.to) { const [dx, dz] = m.to; ang = Math.atan2(dx * f[0] + dz * f[1], -dx * f[1] + dz * f[0]); }
      n3 = new THREE.Vector3(0, 1, 0); pos = new THREE.Vector3(m.floor[0], 0.012 + i * 0.0004, m.floor[1]); rotY = Math.atan2(-f[0], -f[1]);
    } else {
      const [nx, nz] = m.n;
      if (m.to) { const [dx, dy, dz] = m.to; ang = Math.atan2(dy, dx * nz - dz * nx); }
      n3 = new THREE.Vector3(nx, 0, nz); pos = new THREE.Vector3(m.wall[0] + nx * 0.016, m.wall[1], m.wall[2] + nz * 0.016); rotY = Math.atan2(nx, nz);
    }
    const c = document.createElement('canvas'); c.width = 384; c.height = 192;
    drawMark(c, m, ang);
    const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 4;
    // what you see is the paint's own glow (unlit, kept clear of the tone curve so it stays vivid);
    // its strength is the material colour, set every frame
    const mat = new THREE.MeshBasicMaterial({
      map: tex, color: new THREE.Color().setScalar(0.03), transparent: true, depthWrite: false,
      polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, toneMapped: false,
    });
    // floor marks are stretched along the way you look at them, like road markings, so they read from further off
    const w = m.w || 1.8, h = floor ? 1.3 : w / 2;
    const mesh = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
    if (floor) mesh.rotation.set(-Math.PI / 2, rotY, 0, 'YXZ'); else mesh.rotation.y = rotY;
    mesh.position.copy(pos);
    mesh.renderOrder = 2;
    scene.add(mesh);
    list.push({ m, mesh, mat, tex, c, ang, n: n3, charge: 0, lit: 0 });
  });
  const redraw = () => { for (const o of list) { drawMark(o.c, o.m, o.ang); o.tex.needsUpdate = true; } };
  if (document.fonts && document.fonts.load) document.fonts.load(`60px ${HAND}`, MARKS.map((m) => m.text + (m.sub || '')).join('')).then(redraw).catch(() => {});
  return {
    list, redraw,
    reset() { for (const o of list) { o.charge = 0; o.lit = 0; o.mat.color.setScalar(0.03); } },
    // spot: where the beam starts and where it points; k: how strong it is (0 off)
    // returns the mark the beam is on most, if any
    update(dt, spotPos, spotDir, k) {
      let best = null;
      for (const o of list) {
        v.copy(o.mesh.position).sub(spotPos);
        const d = v.length(); v.divideScalar(d || 1);
        const c = v.dot(spotDir), cone = c <= 0.87 ? 0 : c >= 0.97 ? 1 : ((c - 0.87) / 0.1) ** 2 * (3 - 2 * (c - 0.87) / 0.1);
        const face = Math.min(1, Math.max(0, -v.dot(o.n)) * 2.5);
        const lit = k * cone * face / (1 + (d / 9) ** 2);
        // glow paint: charges up fast in the beam, fades slowly once it moves on
        o.charge = lit > o.charge ? o.charge + (lit - o.charge) * Math.min(1, dt * 2.5) : o.charge * Math.exp(-dt / 9);
        o.lit = lit;
        o.mat.color.setScalar(0.03 + 0.95 * o.charge + 0.55 * lit);
        if (lit > 0.3 && (!best || lit > best.lit)) best = { kind: o.m.kind, lit, d };
      }
      return best;
    },
  };
}
