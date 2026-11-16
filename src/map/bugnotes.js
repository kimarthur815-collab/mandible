// Team 2's notebook: a page for each thing Lee Jeong-hun ran into, a crude ballpoint sketch and a few
// scribbled lines. A page turns up the first time you meet the same thing (see main_map.js: discover).
const INK = '#1e2546', RED = '#b3261e', HAND = '"Nanum Pen Script", "Comic Sans MS", cursive';

export const BUG_PAGES = [
  { id: 'roach', title: '바퀴', lines: ['떼로 다님. 수백 마리', '빛 비추면 흩어짐. 근데 금방 옴', '뛰면 소리 듣고 몰려온다', '→ 웅크려서 걸을 것', '몸에 붙으면 마구 털어내', '가끔 날아서 얼굴로 옴!!'] },
  { id: 'ghost', title: '유령거미 (복도)', lines: ['복도 천장. 다리가 엄청 김', '머리 높이에 실 쳐놓음 — 거의 안 보임', '~~뛰어서~~ 숙여서 지나갈 것', '실 끊으면 내려와서 쫓아옴', '입에 알집 물고 다님. 건들지 마'] },
  { id: 'wolf', title: '늑대거미 (생산 홀)', lines: ['홀 벽에 붙어 있다. 털 많고 큼', '눈 여러 개가 불빛에 반짝임', '빛 비추면 벽으로 올라가 피함', '가까이 가면 내려와서 쫓아옴. 빠름', '잡히면 스프레이!!'] },
  { id: 'gate', title: '통로 막은 놈', lines: ['비상 통로 입구. 제일 큼', '두꺼운 줄. 스프레이도 안 녹음', '다가가면 튀어나와서 잡는다', '발전기 다 돌리면 사라진다?', '(확인 못함)'] },
  { id: 'eggs', title: '알집 (실험실)', lines: ['천장에 알집 3개', '큰 소리 나면 터진다', '→ 새끼 수십 마리. 닿으면 느려짐', '새끼는 스프레이 한 번이면 됨', '조용히. 웅크려서 지나가기'] },
  { id: 'centi', title: '지네??', lines: ['벽 속, 환풍구로 다님', '길이 5m 넘음?? 다리 못 셈', '머리에 불 비추면 잠깐 멈춤', '불 켜진 전등 밑으론 안 들어옴', '테이블 밑에서 불 끄고 숨 참을 것', '~~이제 소리가~~'] },
];

// ------------------------------------------------------------------ crude drawing helpers
function kit(c, seed) {
  let s = seed * 7919 + 17; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const pen = (pts, w = 2.4, col = INK, wob = 1.6) => {
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = col; c.globalAlpha = pass ? 0.35 : 0.92; c.lineWidth = pass ? w * 0.6 : w; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      pts.forEach(([x, y], i) => { const j = i === 0 || i === pts.length - 1 ? 0.3 : 1; const px = x + (rnd() - 0.5) * wob * j * (pass ? 2 : 1), py = y + (rnd() - 0.5) * wob * j * (pass ? 2 : 1); if (i) c.lineTo(px, py); else c.moveTo(px, py); });
      c.stroke();
    }
    c.globalAlpha = 1;
  };
  const line = (x0, y0, x1, y1, w, col) => { const n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 12)); pen(Array.from({ length: n + 1 }, (_, k) => [x0 + (x1 - x0) * k / n, y0 + (y1 - y0) * k / n]), w, col); };
  const ell = (cx, cy, rx, ry, rot = 0, w = 2.4, col = INK, turns = 1.08) => {
    const pts = [];
    for (let a = 0; a <= Math.PI * 2 * turns; a += 0.18) { const r = 1 + (rnd() - 0.5) * 0.06; const x = Math.cos(a) * rx * r, y = Math.sin(a) * ry * r; pts.push([cx + x * Math.cos(rot) - y * Math.sin(rot), cy + x * Math.sin(rot) + y * Math.cos(rot)]); }
    pen(pts, w, col, 0.8);
  };
  // scribbled shading inside an ellipse
  const hatch = (cx, cy, rx, ry, rot = 0, n = 14, col = 'rgba(30,37,70,.55)') => {
    c.save(); c.translate(cx, cy); c.rotate(rot); c.beginPath(); c.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); c.clip();
    c.strokeStyle = col; c.lineWidth = 1.3;
    for (let i = 0; i < n; i++) { const t = (i / n) * 2 - 1; c.beginPath(); c.moveTo(-rx + t * rx * 0.3, -ry * 1.2 + t * ry); c.lineTo(rx + t * rx * 0.3, ry * 0.4 + t * ry * 1.3); c.stroke(); }
    c.restore();
  };
  const write = (text, x, y, size, col = INK, rot = 0, align = 'center') => {
    c.save(); c.translate(x, y); c.rotate(rot + (rnd() - 0.5) * 0.04); c.fillStyle = col; c.font = `${size}px ${HAND}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(text, 0, 0); c.restore();
  };
  const arrow = (x0, y0, x1, y1, col = INK) => {
    line(x0, y0, x1, y1, 2, col);
    const a = Math.atan2(y1 - y0, x1 - x0);
    for (const d of [2.6, -2.6]) line(x1, y1, x1 + Math.cos(a + d) * 14, y1 + Math.sin(a + d) * 14, 2, col);
  };
  // a leg as a bent polyline, with optional bristles
  const leg = (pts, w = 2, hair = 0) => {
    pen(pts, w);
    if (hair) for (let i = 0; i < pts.length - 1; i++) for (let k = 0; k < hair; k++) {
      const t = (k + 0.5) / hair, [x0, y0] = pts[i], [x1, y1] = pts[i + 1], x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t, a = Math.atan2(y1 - y0, x1 - x0) + Math.PI / 2;
      line(x, y, x + Math.cos(a) * 6, y + Math.sin(a) * 6, 1.2);
    }
  };
  return { rnd, pen, line, ell, hatch, write, arrow, leg };
}

const SKETCH = {
  roach(c, k, W, H) {
    const cx = W * 0.5, cy = H * 0.3, R = W * 0.16;
    k.ell(cx, cy, R * 1.25, R * 0.72, -0.1, 3);              // body
    k.hatch(cx, cy, R * 1.2, R * 0.68, -0.1, 10);
    k.line(cx - R * 1.15, cy + R * 0.12, cx + R * 1.1, cy - R * 0.1, 2);   // wing seam
    k.ell(cx - R * 1.45, cy + R * 0.12, R * 0.38, R * 0.32, 0, 2.6);         // head
    k.pen([[cx - R * 1.75, cy + R * 0.05], [cx - R * 2.3, cy - R * 0.5], [cx - R * 2.6, cy - R * 1.1]], 1.6);   // antennae
    k.pen([[cx - R * 1.75, cy + R * 0.2], [cx - R * 2.4, cy + R * 0.1], [cx - R * 2.9, cy - R * 0.3]], 1.6);
    for (const [ox, sgn] of [[-0.6, 1], [0, 1], [0.6, 1], [-0.6, -1], [0, -1], [0.6, -1]]) {
      const x0 = cx + ox * R, y0 = cy + sgn * R * 0.6;
      k.leg([[x0, y0], [x0 + ox * R * 0.4 - R * 0.1, y0 + sgn * R * 0.55], [x0 + ox * R * 0.9 + R * 0.25, y0 + sgn * R * 1.0]], 2, 2);
    }
    k.arrow(cx + R * 2.3, cy - R * 1.3, cx + R * 1.3, cy - R * 0.6);
    k.write('엄지만 함??', cx + R * 2.3, cy - R * 1.65, 34);
    k.write('x 수백', cx + R * 2.0, cy + R * 1.3, 38, RED, -0.1);
  },
  ghost(c, k, W, H) {
    const cx = W * 0.5, cy = H * 0.31, R = W * 0.05;
    for (let i = 0; i < 4; i++) k.line(W * 0.08, H * 0.1 + i * 9, W * 0.92, H * 0.12 + i * 7, 1, 'rgba(30,37,70,.35)');   // the threads
    k.write('실!! (머리 높이)', W * 0.78, H * 0.07, 30, RED);
    k.ell(cx, cy, R * 1.1, R * 0.9, 0, 2.6); k.ell(cx + R * 1.9, cy + R * 0.2, R * 1.3, R * 0.85, 0.2, 2.6); k.hatch(cx + R * 1.9, cy + R * 0.2, R * 1.2, R * 0.8, 0.2, 8);
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, j = i % 4, a = -2.2 + j * 0.55;
      const kx = cx + Math.cos(a) * R * 6 * side * -1, ky = cy - R * (4.5 - j * 0.6);
      const fx = cx + Math.cos(a) * R * 11 * side * -1, fy = cy + R * (2.4 + j * 0.45);
      k.leg([[cx, cy], [kx, ky], [fx, fy]], 1.4);
    }
    k.ell(cx - R * 1.3, cy + R * 0.9, R * 0.75, R * 0.7, 0, 2, RED);
    k.arrow(cx - R * 6.2, cy + R * 2.2, cx - R * 2.1, cy + R * 1.1, RED);
    k.write('알집', cx - R * 7.4, cy + R * 2.4, 32, RED);
    k.write('다리 길이 1m??', W * 0.78, H * 0.45, 30, INK, -0.05);
  },
  wolf(c, k, W, H) {
    const cx = W * 0.47, cy = H * 0.3, R = W * 0.08;
    k.ell(cx + R * 1.8, cy + R * 0.2, R * 1.7, R * 1.2, 0.1, 3); k.hatch(cx + R * 1.8, cy + R * 0.2, R * 1.6, R * 1.1, 0.1, 16);   // abdomen
    k.ell(cx - R * 0.5, cy, R * 1.0, R * 0.85, 0, 3); k.hatch(cx - R * 0.5, cy, R * 0.9, R * 0.8, 0, 8);
    for (let i = 0; i < 8; i++) {                                                                           // eyes
      const ex = cx - R * 1.25 + (i % 4) * R * 0.16, ey = cy - R * 0.35 + Math.floor(i / 4) * R * 0.22;
      c.fillStyle = INK; c.beginPath(); c.arc(ex, ey, i % 4 === 1 || i % 4 === 2 ? 5 : 3, 0, Math.PI * 2); c.fill();
    }
    for (let i = 0; i < 8; i++) {
      const side = i < 4 ? -1 : 1, j = i % 4, bx = cx - R * 0.5 + (j - 1.5) * R * 0.4, by = cy + side * R * 0.6;
      const kx = bx + (j - 1.5) * R * 1.1, ky = by + side * R * 1.4, fx = kx + (j - 1.5) * R * 0.9, fy = ky + side * R * 0.6;
      k.leg([[bx, by], [kx, ky], [fx, fy]], 3.2, 3);
    }
    k.arrow(cx - R * 3.4, cy - R * 2.6, cx - R * 1.3, cy - R * 0.6);
    k.write('눈 8개', cx - R * 3.6, cy - R * 3.0, 32);
    k.write('털 엄청 많음', cx + R * 3.2, cy - R * 2.4, 32);
    k.write('빠름!!', cx + R * 3.8, cy + R * 2.6, 38, RED, -0.12);
  },
  gate(c, k, W, H) {
    const cx = W * 0.5, cy = H * 0.27, R = H * 0.17;
    for (let i = 0; i < 12; i++) { const a = i / 12 * Math.PI * 2; k.line(cx, cy, cx + Math.cos(a) * R, cy + Math.sin(a) * R * 0.95, 1.3); }   // web
    for (let r = R * 0.25; r < R; r += R * 0.17) { const pts = []; for (let i = 0; i <= 12; i++) { const a = i / 12 * Math.PI * 2; pts.push([cx + Math.cos(a) * r * (0.92 + k.rnd() * 0.1), cy + Math.sin(a) * r * 0.95]); } k.pen(pts, 1.1, INK, 1); }
    k.ell(cx, cy + R * 0.1, R * 0.22, R * 0.28, 0, 3); k.hatch(cx, cy + R * 0.1, R * 0.2, R * 0.26, 0, 10);
    k.ell(cx, cy - R * 0.25, R * 0.13, R * 0.12, 0, 3);
    for (let i = 0; i < 8; i++) { const side = i < 4 ? -1 : 1, j = i % 4, a = (j - 1.5) * 0.45; k.leg([[cx, cy - R * 0.1], [cx + side * R * 0.45, cy - R * 0.1 + Math.sin(a) * R * 0.6 - R * 0.25], [cx + side * R * 0.8, cy + Math.sin(a) * R * 0.9]], 2.2); }
    k.write('스프레이 X', cx + R * 1.05, cy - R * 0.85, 34, RED, 0.08);
    k.write('여기로 못 감', cx - R * 1.15, cy - R * 0.95, 32, INK, -0.06);
  },
  eggs(c, k, W, H) {
    k.line(W * 0.06, H * 0.08, W * 0.94, H * 0.09, 3);                                // the ceiling
    k.write('천장', W * 0.1, H * 0.05, 28, INK, 0, 'left');
    for (const [x, len] of [[0.25, 0.12], [0.5, 0.16], [0.74, 0.1]]) {
      const sx = W * x, top = H * 0.085, cy = top + H * len + H * 0.05;
      k.line(sx, top, sx + 4, top + H * len, 1.4);
      k.pen([[sx, cy - H * 0.06], [sx + W * 0.06, cy], [sx + W * 0.04, cy + H * 0.05], [sx, cy + H * 0.065], [sx - W * 0.04, cy + H * 0.05], [sx - W * 0.06, cy], [sx, cy - H * 0.06]], 2.6);
      k.hatch(sx, cy + H * 0.005, W * 0.05, H * 0.05, 0, 6);
    }
    for (let i = 0; i < 26; i++) { const x = W * (0.15 + k.rnd() * 0.7), y = H * (0.355 + k.rnd() * 0.07); c.fillStyle = INK; c.beginPath(); c.arc(x, y, 3 + k.rnd() * 2, 0, Math.PI * 2); c.fill(); for (let l = 0; l < 4; l++) k.line(x, y, x + (k.rnd() - 0.5) * 14, y + (k.rnd() - 0.5) * 12, 1); }
    k.arrow(W * 0.86, H * 0.25, W * 0.8, H * 0.34, RED);
    k.write('쾅! 하면 터짐', W * 0.83, H * 0.21, 32, RED);
    k.write('새끼 x 수십', W * 0.2, H * 0.455, 30);
  },
  centi(c, k, W, H) {
    const pts = []; for (let i = 0; i <= 22; i++) { const t = i / 22; pts.push([W * (0.12 + t * 0.78), H * (0.3 + Math.sin(t * Math.PI * 2.2) * 0.09)]); }
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a), wd = 14 - i * 0.35;
      k.pen([[x0 + nx * wd, y0 + ny * wd], [x1 + nx * wd, y1 + ny * wd]], 2.2); k.pen([[x0 - nx * wd, y0 - ny * wd], [x1 - nx * wd, y1 - ny * wd]], 2.2);
      k.line(x1 + nx * wd, y1 + ny * wd, x1 - nx * wd, y1 - ny * wd, 1.6);
      for (const sg of [1, -1]) k.leg([[x1 + nx * wd * sg, y1 + ny * wd * sg], [x1 + nx * (wd + 16) * sg - Math.cos(a) * 6, y1 + ny * (wd + 16) * sg - Math.sin(a) * 6], [x1 + nx * (wd + 22) * sg - Math.cos(a) * 16, y1 + ny * (wd + 26) * sg]], 1.4);
    }
    const [hx, hy] = pts[0];
    k.ell(hx - 8, hy, 20, 16, 0, 2.6); k.hatch(hx - 8, hy, 18, 14, 0, 6);
    k.pen([[hx - 22, hy - 6], [hx - 40, hy - 18], [hx - 48, hy - 6]], 2.4, RED); k.pen([[hx - 22, hy + 6], [hx - 40, hy + 18], [hx - 48, hy + 6]], 2.4, RED);   // fangs
    k.pen([[hx - 24, hy - 10], [hx - 50, hy - 50], [hx - 40, hy - 80]], 1.4); k.pen([[hx - 20, hy - 12], [hx - 30, hy - 60], [hx - 10, hy - 85]], 1.4);
    k.write('5m 넘음??', W * 0.62, H * 0.13, 36);
    k.write('독니!!', hx + 30, hy + 50, 32, RED, 0.1);
    k.write('불 → 멈춤', W * 0.78, H * 0.47, 32);
  },
};

// draws one notebook page into a canvas (any size, 3:4)
export function drawBugPage(canvas, page, seed = 1) {
  const c = canvas.getContext('2d'), W = canvas.width, H = canvas.height;
  const k = kit(c, seed);
  c.clearRect(0, 0, W, H);
  // the page: notebook paper with a torn left edge (ripped out of the spiral), grubby
  c.save(); c.beginPath(); c.moveTo(14, 0); for (let i = 0; i <= 30; i++) c.lineTo(6 + k.rnd() * 14, (i / 30) * H); c.lineTo(W, H); c.lineTo(W, 0); c.closePath(); c.clip();
  c.fillStyle = '#e6dfc8'; c.fillRect(0, 0, W, H);
  const g = c.createRadialGradient(W / 2, H / 2, W * 0.3, W / 2, H / 2, W * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,90,40,.35)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
  for (let i = 0; i < 1100; i++) { c.fillStyle = `rgba(${90 + k.rnd() * 40},${70 + k.rnd() * 30},40,${k.rnd() * 0.07})`; c.fillRect(k.rnd() * W, k.rnd() * H, 1 + k.rnd() * 3, 1 + k.rnd() * 3); }
  { const sx = W * (0.15 + k.rnd() * 0.7), sy = H * (0.15 + k.rnd() * 0.7), sr = W * 0.18, sg = c.createRadialGradient(sx, sy, 0, sx, sy, sr); sg.addColorStop(0, 'rgba(70,55,35,.18)'); sg.addColorStop(1, 'rgba(70,55,35,0)'); c.fillStyle = sg; c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
  // ruled lines in the lower half, the margin
  const top = H * 0.56, gap = H * 0.062;
  c.strokeStyle = 'rgba(90,120,170,.33)'; c.lineWidth = 1.5;
  for (let y = top; y < H; y += gap) { c.beginPath(); c.moveTo(0, y); c.lineTo(W, y); c.stroke(); }
  c.strokeStyle = 'rgba(190,70,70,.33)'; c.beginPath(); c.moveTo(W * 0.1, top - gap); c.lineTo(W * 0.1, H); c.stroke();
  // the sketch, the name underlined, the notes
  SKETCH[page.id](c, k, W, H);
  k.write(page.title, W * 0.12, top - gap * 0.55, gap * 1.1, INK, 0, 'left');
  c.font = `${gap * 1.1}px ${HAND}`; const tw = c.measureText(page.title).width;
  k.line(W * 0.11, top - gap * 0.1, W * 0.13 + tw, top - gap * 0.12, 2.2);
  c.font = `${gap * 0.92}px ${HAND}`; c.textBaseline = 'alphabetic';
  page.lines.forEach((ln, i) => {
    const y = top + gap * (i + 1) - gap * 0.2;
    let x = W * 0.13;
    c.save(); c.translate(0, y); c.rotate((k.rnd() - 0.5) * 0.015);
    const full = c.measureText(ln.replace(/~~/g, '')).width, room = W * 0.84;
    if (full > room) { c.font = `${gap * 0.92 * room / full}px ${HAND}`; }
    ln.split('~~').forEach((part, j) => {
      c.fillStyle = INK; c.fillText(part, x, 0);
      const w = c.measureText(part).width;
      if (j % 2) { c.strokeStyle = INK; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x - 3, -gap * 0.25); c.lineTo(x + w + 3, -gap * 0.3); c.moveTo(x - 2, -gap * 0.18); c.lineTo(x + w + 2, -gap * 0.24); c.stroke(); }
      x += w;
    });
    c.font = `${gap * 0.92}px ${HAND}`;
    c.restore();
  });
  c.restore();
}
