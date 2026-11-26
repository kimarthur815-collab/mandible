// Team 2's notebook: a page for each thing Lee Jeong-hun ran into. He drew them carefully, like field
// plates (fine pen, hatching, stippling, labels on leader lines, a scale bar), but the pages have been
// through it since: torn, burnt, soaked, stained with blood. A page turns up the first time you meet
// the same thing (see main_map.js: discover).
const INK = '#1b2140', RED = '#a3221a', HAND = '"Nanum Pen Script", "Comic Sans MS", cursive';

export const BUG_PAGES = [
  { id: 'roach', title: '바퀴 (변종?)', lines: ['몸길이 4~5cm. 수백 마리씩 무리 지음', '빛 → 흩어짐. 몇 초 뒤 다시 모인다', '발소리에 반응: 뛰면 몰려옴 → 웅크려 걸을 것', '몸에 오르면 흔들어 털어낼 것', '날개 있음. 얼굴로 날아드는 개체 있음'] },
  { id: 'ghost', title: '유령거미 (복도 천장)', lines: ['몸통 2cm, 다리 펼치면 1m 넘음', '머리 높이에 실을 친다 — 발목 높이에도 한 줄', '건드리면 쫓아옴 → 숙여서 통과 (발목 실은 서서 넘기)', '알집을 입에 물고 다님', '떨어뜨리면 새끼가 쏟아진다. 건드리지 말 것'] },
  { id: 'wolf', title: '늑대거미 (생산 홀 벽)', lines: ['몸길이 40cm 이상. 털이 빽빽함', '눈 8개: 뒷줄 둘이 크고 빛을 반사', '빛엔 잠깐 움찔할 뿐 (오래 비춰야 물러남)', '끝까지 쫓아옴 → 컨베이어 밑에 숨을 것', '불 끄고 가만히. 잡히면 스프레이!!'] },
  { id: 'gate', title: '통로 거미 (비상 통로 입구)', lines: ['가장 큰 개체. 다리 폭 3m 가량', '줄이 손가락만큼 두꺼움 — 스프레이로 안 녹음', '1.5m 안으로 들어가면 덮친다', '발전기를 모두 돌린 뒤 사라짐 (?)', '(확인 못함)'] },
  { id: 'eggs', title: '알집 (실험실 천장)', lines: ['3개. 지름 30cm 정도', '큰 소리에 터짐 → 새끼 수십 마리', '새끼에 닿으면 몸이 둔해진다', '스프레이 한 번에 쓸려 나감', '조용히. 웅크려서 지나갈 것'] },
  { id: 'centi', title: '지네 (환풍구, 벽 속)', lines: ['길이 5m 이상 추정. 다리 40쌍 이상', '머리에 빛을 받으면 잠시 굳는다', '불 켜진 전등 아래로는 들어오지 않음', '테이블 밑, 불 끄고 숨 죽일 것', '~~이제 소리가 가까이~~'] },
];

// ------------------------------------------------------------------ fine pen
function kit(c, seed) {
  let s = seed * 7919 + 17; const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const line = (pts, w = 1.5, col = INK) => { c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.lineJoin = 'round'; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); };
  // a smooth curve through the points
  const trace = (pts, close = false) => {
    const P = close ? [pts[pts.length - 1], ...pts, pts[0], pts[1]] : [pts[0], ...pts, pts[pts.length - 1]];
    c.moveTo(P[1][0], P[1][1]);
    for (let i = 1; i < P.length - 2; i++) {
      const [x0, y0] = P[i - 1], [x1, y1] = P[i], [x2, y2] = P[i + 1], [x3, y3] = P[i + 2];
      c.bezierCurveTo(x1 + (x2 - x0) / 6, y1 + (y2 - y0) / 6, x2 - (x3 - x1) / 6, y2 - (y3 - y1) / 6, x2, y2);
    }
  };
  const curve = (pts, w = 1.5, col = INK, close = false, fill = null) => { c.beginPath(); trace(pts, close); if (close) c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } c.strokeStyle = col; c.lineWidth = w; c.lineCap = 'round'; c.stroke(); };
  const ell = (cx, cy, rx, ry, rot = 0, w = 1.5, col = INK, fill = null) => { c.beginPath(); c.ellipse(cx, cy, rx, ry, rot, 0, Math.PI * 2); if (fill) { c.fillStyle = fill; c.fill(); } c.strokeStyle = col; c.lineWidth = w; c.stroke(); };
  // parallel hatching inside a clip shape (shape() builds the path)
  const hatch = (shape, box, ang = -0.8, gap = 4, w = 0.8, col = 'rgba(27,33,64,.75)') => {
    c.save(); c.beginPath(); shape(); c.clip();
    const [x0, y0, x1, y1] = box, cx = (x0 + x1) / 2, cy = (y0 + y1) / 2, R = Math.hypot(x1 - x0, y1 - y0) / 2 + 4;
    c.strokeStyle = col; c.lineWidth = w; c.beginPath();
    for (let d = -R; d <= R; d += gap) { const ox = Math.cos(ang + Math.PI / 2) * d, oy = Math.sin(ang + Math.PI / 2) * d; c.moveTo(cx + ox - Math.cos(ang) * R, cy + oy - Math.sin(ang) * R); c.lineTo(cx + ox + Math.cos(ang) * R, cy + oy + Math.sin(ang) * R); }
    c.stroke(); c.restore();
  };
  // stippling, denser toward one side (dir: toward the dark side)
  const stipple = (shape, box, n = 300, dir = [0, 1], col = INK) => {
    c.save(); c.beginPath(); shape(); c.clip(); c.fillStyle = col;
    const [x0, y0, x1, y1] = box;
    for (let i = 0; i < n; i++) {
      const u = rnd(), v = rnd(), x = x0 + u * (x1 - x0), y = y0 + v * (y1 - y0);
      const t = ((u - 0.5) * dir[0] + (v - 0.5) * dir[1]) + 0.5;
      if (rnd() > t * t) continue;
      c.beginPath(); c.arc(x, y, 0.7 + rnd() * 0.5, 0, Math.PI * 2); c.fill();
    }
    c.restore();
  };
  const write = (text, x, y, size, col = INK, rot = 0, align = 'center') => { c.save(); c.translate(x, y); c.rotate(rot); c.fillStyle = col; c.font = `${size}px ${HAND}`; c.textAlign = align; c.textBaseline = 'middle'; c.fillText(text, 0, 0); c.restore(); };
  // a label on a thin leader line ending in a dot on the part
  const label = (text, tx, ty, ax, ay, size = 25, col = INK) => {
    c.font = `${size}px ${HAND}`; const w = c.measureText(text).width, left = ax < tx;
    line([[left ? tx - w / 2 - 4 : tx + w / 2 + 4, ty], [ax, ay]], 0.9, col);
    c.fillStyle = col; c.beginPath(); c.arc(ax, ay, 2, 0, Math.PI * 2); c.fill();
    write(text, tx, ty, size, col);
  };
  const scale = (x, y, len, text) => {
    line([[x, y], [x + len, y]], 1.6); for (let i = 0; i <= 4; i++) line([[x + len * i / 4, y - (i % 4 ? 3 : 6)], [x + len * i / 4, y + (i % 4 ? 3 : 6)]], 1.2);
    write(text, x + len / 2, y + 16, 22);
  };
  // a jointed leg: [x, y, half width] points from the body to the tip; spines along it; banded if asked
  const leg = (pts, spines = 0, banded = false) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [x0, y0, w0] = pts[i], [x1, y1, w1] = pts[i + 1], a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a);
      c.beginPath(); c.moveTo(x0 + nx * w0, y0 + ny * w0); c.lineTo(x1 + nx * w1, y1 + ny * w1); c.lineTo(x1 - nx * w1, y1 - ny * w1); c.lineTo(x0 - nx * w0, y0 - ny * w0); c.closePath();
      c.fillStyle = banded && i % 2 ? 'rgba(27,33,64,.55)' : '#ece5cf'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.1; c.stroke();
      for (let q = 1; q <= spines; q++) { const t = q / (spines + 1), sx = x0 + (x1 - x0) * t, sy = y0 + (y1 - y0) * t, side = q % 2 ? 1 : -1; line([[sx + nx * w0 * side, sy + ny * w0 * side], [sx + nx * (w0 + 6) * side + Math.cos(a) * 4, sy + ny * (w0 + 6) * side + Math.sin(a) * 4]], 0.9); }
    }
    for (let i = 1; i < pts.length - 1; i++) { c.fillStyle = INK; c.beginPath(); c.arc(pts[i][0], pts[i][1], 1.2, 0, Math.PI * 2); c.fill(); }   // the joints
  };
  return { rnd, line, curve, ell, hatch, stipple, write, label, scale, leg };
}

// ------------------------------------------------------------------ the plates (on a 600 x 800 page; the drawing in the top half)
const PLATE = {
  roach(c, k) {
    const cx = 300, cy = 235;
    // antennae: long, segmented, sweeping out and back
    for (const s of [-1, 1]) {
      const pts = [[cx + s * 8, cy - 112], [cx + s * 40, cy - 170], [cx + s * 110, cy - 196], [cx + s * 190, cy - 178], [cx + s * 240, cy - 120]];
      k.curve(pts, 1.1);
      for (let i = 0; i < 24; i++) { const t = i / 24, a = Math.floor(t * 4), u = t * 4 - a, p0 = pts[a], p1 = pts[a + 1]; const x = p0[0] + (p1[0] - p0[0]) * u, y = p0[1] + (p1[1] - p0[1]) * u; k.line([[x - 2, y - 2], [x + 2, y + 2]], 0.7); }
    }
    // legs: front pair forward, middle out, hind long and back; spined
    for (const s of [-1, 1]) {
      k.leg([[cx + s * 30, cy - 70, 5], [cx + s * 78, cy - 92, 4], [cx + s * 112, cy - 132, 2.5], [cx + s * 128, cy - 158, 1.2]], 3);
      k.leg([[cx + s * 42, cy - 20, 6], [cx + s * 112, cy - 12, 5], [cx + s * 160, cy + 26, 3], [cx + s * 186, cy + 40, 1.2]], 4);
      k.leg([[cx + s * 44, cy + 40, 7], [cx + s * 118, cy + 78, 6], [cx + s * 150, cy + 150, 3.5], [cx + s * 168, cy + 196, 1.3]], 5);
    }
    // the tip of the abdomen and the cerci, past the wings
    k.ell(cx, cy + 118, 34, 30, 0, 1.4, INK, '#e6dfc8');
    for (let i = 0; i < 4; i++) k.curve([[cx - 30 + i * 3, cy + 108 + i * 9], [cx, cy + 112 + i * 9], [cx + 30 - i * 3, cy + 108 + i * 9]], 0.8);
    for (const s of [-1, 1]) k.curve([[cx + s * 14, cy + 140], [cx + s * 24, cy + 168], [cx + s * 26, cy + 182]], 2.2);
    // the wing covers: long, overlapping, veined, stippled toward the edges
    for (const s of [-1, 1]) {
      const shape = () => { c.moveTo(cx, cy - 58); c.bezierCurveTo(cx + s * 70, cy - 52, cx + s * 74, cy + 60, cx + s * 30, cy + 128); c.bezierCurveTo(cx + s * 12, cy + 140, cx - s * 6, cy + 120, cx - s * 4, cy + 40); c.closePath(); };
      c.beginPath(); shape(); c.fillStyle = '#e8e1ca'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
      k.stipple(shape, [cx - 80, cy - 60, cx + 80, cy + 140], 520, [s * 0.9, 0.4]);
      for (let v = 0; v < 5; v++) k.curve([[cx + s * (4 + v * 9), cy - 50], [cx + s * (14 + v * 11), cy + 20], [cx + s * (12 + v * 6), cy + 110 - v * 6]], 0.6);
      for (let v = 0; v < 9; v++) { const y = cy - 30 + v * 15; k.line([[cx + s * (8 + v), y], [cx + s * (30 + v * 2), y + 6]], 0.5); }
    }
    // the shield over the head, with its two dark bands
    const pro = () => { c.ellipse(cx, cy - 78, 62, 36, 0, 0, Math.PI * 2); };
    c.beginPath(); pro(); c.fillStyle = '#e6dfc8'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke();
    for (const s of [-1, 1]) { const band = () => { c.ellipse(cx + s * 18, cy - 80, 12, 24, s * 0.15, 0, Math.PI * 2); }; k.hatch(band, [cx + s * 18 - 14, cy - 106, cx + s * 18 + 14, cy - 54], -0.9, 2.6, 0.9); c.beginPath(); band(); c.strokeStyle = INK; c.lineWidth = 1; c.stroke(); }
    k.stipple(pro, [cx - 62, cy - 114, cx + 62, cy - 42], 260, [0, 0.8]);
    k.ell(cx, cy - 112, 18, 10, 0, 1.4, INK, '#e6dfc8');                                   // the head peeping out
    k.label('더듬이 (몸보다 김)', 470, 48, cx + 190, cy - 178);
    k.label('앞가슴등판: 검은 줄 2개', 140, 72, cx - 30, cy - 92);
    k.label('날개 → 날 수 있음!', 128, 300, cx - 50, cy + 40);
    k.label('꼬리털', 470, 404, cx + 24, cy + 176);
    k.scale(64, 402, 100, '1cm (실제 4~5cm)');
  },

  ghost(c, k) {
    const cx = 300, cy = 196;
    for (let i = 0; i < 3; i++) k.line([[30, 34 + i * 7], [570, 40 + i * 5]], 0.5, 'rgba(27,33,64,.4)');          // the threads
    k.write('실 (머리 높이, 거의 안 보임)', 430, 22, 22, RED);
    // eight long legs: up to a knee higher than the body, then down and out
    for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1, j = i % 4, a = [0.55, 0.85, 1.25, 1.6][j];
      const kx = cx + s * (60 + j * 22), ky = cy - (120 - j * 18);
      const fx = cx + s * (150 + j * 40) * Math.sin(a), fy = cy + 60 + j * 52;
      k.leg([[cx + s * 6, cy, 2.2], [kx, ky, 1.6], [kx + s * 18, ky + 30, 1.2], [fx, fy, 0.7], [fx + s * 14, fy + 18, 0.5]]);
    }
    // body: round front, long cylindrical abdomen hanging back
    k.ell(cx, cy, 20, 17, 0, 1.6, INK, '#e6dfc8');
    k.stipple(() => c.ellipse(cx, cy, 20, 17, 0, 0, Math.PI * 2), [cx - 20, cy - 17, cx + 20, cy + 17], 120, [0, 1]);
    const ab = () => c.ellipse(cx, cy + 46, 13, 32, 0, 0, Math.PI * 2);
    c.beginPath(); ab(); c.fillStyle = '#e6dfc8'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke();
    k.hatch(ab, [cx - 14, cy + 14, cx + 14, cy + 78], 0.3, 3.2, 0.7);
    // the egg sac in its jaws, wrapped in silk
    const ex = cx, ey = cy - 30;
    k.ell(ex, ey, 15, 13, 0, 1.4, INK, '#efe9d6');
    for (let i = 0; i < 7; i++) k.curve([[ex - 14, ey - 8 + i * 3], [ex, ey - 13 + i * 4], [ex + 14, ey - 6 + i * 2.6]], 0.5);
    k.label('알집 (입에 물고 다님)', 140, 92, ex - 10, ey - 6, 24, RED);
    k.label('무릎이 몸보다 높다', 450, 120, cx + 104, cy - 86);
    k.label('몸통 ~2cm', 470, 250, cx + 14, cy + 50);
    k.line([[40, 420], [560, 420]], 1); for (const [x, d] of [[40, 1], [560, -1]]) k.line([[x + d * 10, 414], [x, 420], [x + d * 10, 426]], 1);
    k.write('다리 폭: 1m 넘음', 300, 404, 24);
  },

  wolf(c, k) {
    const cx = 290, cy = 230;
    // legs first (behind the body): thick, banded, bristly
    const L = [[150, -70], [168, -24], [168, 30], [150, 92]];
    for (const s of [-1, 1]) for (const [len, dy] of L) {
      const x0 = cx - 20 + s * 26, y0 = cy - 30 + dy * 0.25, kx = x0 + s * len * 0.45, ky = y0 + dy * 0.6 - 30, fx = x0 + s * len * 0.95, fy = y0 + dy * 1.1 + 6;
      k.leg([[x0, y0, 7], [kx, ky, 6], [kx + s * 22, ky + 26, 4.5], [fx, fy, 3], [fx + s * 16, fy + 16, 1.5]], 4, true);
    }
    // abdomen: the dark lance-shaped heart mark, chevrons, densely stippled hair
    const ab = () => c.ellipse(cx + 2, cy + 74, 58, 78, 0, 0, Math.PI * 2);
    c.beginPath(); ab(); c.fillStyle = '#e4dcc4'; c.fill();
    k.stipple(ab, [cx - 58, cy - 6, cx + 60, cy + 152], 1500, [0.5, 0.6]);
    c.beginPath(); ab(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke();
    const heart = () => { c.moveTo(cx + 2, cy + 6); c.quadraticCurveTo(cx + 22, cy + 46, cx + 2, cy + 96); c.quadraticCurveTo(cx - 18, cy + 46, cx + 2, cy + 6); };
    k.hatch(heart, [cx - 20, cy, cx + 24, cy + 100], -1.0, 2.2, 0.9);
    for (let i = 0; i < 4; i++) { const y = cy + 104 + i * 13; k.line([[cx - 30 + i * 5, y - 8], [cx + 2, y], [cx + 34 - i * 5, y - 8]], 1.2); }
    // carapace: grooves radiating from the middle, the eyes up front
    const ca = () => c.ellipse(cx, cy - 40, 50, 46, 0, 0, Math.PI * 2);
    c.beginPath(); ca(); c.fillStyle = '#e6dfc8'; c.fill();
    k.stipple(ca, [cx - 50, cy - 86, cx + 50, cy + 6], 520, [0, -0.6]);
    for (let i = 0; i < 10; i++) { const a = i / 10 * Math.PI * 2; k.line([[cx + Math.cos(a) * 8, cy - 36 + Math.sin(a) * 8], [cx + Math.cos(a) * 42, cy - 36 + Math.sin(a) * 38]], 0.8); }
    c.beginPath(); ca(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke();
    const eye = (x, y, r) => { k.ell(x, y, r, r, 0, 1, INK, '#1b2140'); c.fillStyle = '#efe9d6'; c.beginPath(); c.arc(x - r * 0.3, y - r * 0.3, r * 0.3, 0, Math.PI * 2); c.fill(); };
    for (let i = 0; i < 4; i++) eye(cx - 15 + i * 10, cy - 76, 2.6);
    eye(cx - 10, cy - 64, 5.5); eye(cx + 10, cy - 64, 5.5); eye(cx - 16, cy - 50, 3.6); eye(cx + 16, cy - 50, 3.6);
    for (const s of [-1, 1]) k.leg([[cx + s * 10, cy - 82, 4], [cx + s * 18, cy - 104, 3], [cx + s * 12, cy - 118, 2]]);   // palps
    // inset: the eyes, close up
    const ix = 488, iy = 96, ir = 62;
    k.line([[cx + 8, cy - 70], [ix - ir * 0.8, iy + ir * 0.5]], 0.8);
    k.ell(ix, iy, ir, ir, 0, 1.6, INK, '#ebe4ce');
    for (let i = 0; i < 4; i++) { const x = ix - 30 + i * 20; k.ell(x, iy - 26, 6, 6, 0, 1, INK, '#1b2140'); }
    for (const [x, y, r] of [[ix - 18, iy, 15], [ix + 18, iy, 15], [ix - 30, iy + 34, 9], [ix + 30, iy + 34, 9]]) { k.ell(x, y, r, r, 0, 1.2, INK, '#1b2140'); c.fillStyle = '#efe9d6'; c.beginPath(); c.arc(x - r * 0.35, y - r * 0.35, r * 0.28, 0, Math.PI * 2); c.fill(); }
    k.write('눈 배열 (확대)', ix, iy + ir + 18, 22);
    k.label('뒷줄 2개가 빛을 반사한다', 130, 44, cx - 10, cy - 64, 24, RED);
    k.label('다리: 줄무늬, 가시털', 112, 400, cx - 130, cy + 70);
    k.scale(388, 402, 120, '10cm (실제 40cm+)');
  },

  gate(c, k) {
    const cx = 300, cy = 220, R = 190;
    // the web: thick radial strands (drawn as tubes), a tight spiral
    for (let i = 0; i < 16; i++) { const a = i / 16 * Math.PI * 2; const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R * 0.95; k.line([[cx, cy], [x, y]], 2.6); k.line([[cx, cy], [x, y]], 0.9, '#e6dfc8'); }
    for (let r = 24; r < R; r += 15) { const pts = []; for (let i = 0; i <= 32; i++) { const a = i / 32 * Math.PI * 2; pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.95]); } k.line(pts, 0.8); }
    // the spider, head down in the middle
    for (let i = 0; i < 8; i++) {
      const s = i < 4 ? -1 : 1, j = i % 4, a = -1.1 + j * 0.55;
      const kx = cx + s * 70 * Math.cos(a * 0.6), ky = cy + 70 * Math.sin(a) - 20, fx = cx + s * 150 * Math.cos(a * 0.8), fy = cy + 150 * Math.sin(a) + 10;
      k.leg([[cx + s * 10, cy - 6 + j * 6, 5], [kx, ky, 4], [fx, fy, 2.2], [fx + s * 12, fy + 14, 1]], 3, true);
    }
    const ab = () => c.ellipse(cx, cy - 46, 36, 50, 0, 0, Math.PI * 2);
    c.beginPath(); ab(); c.fillStyle = '#e4dcc4'; c.fill(); k.stipple(ab, [cx - 36, cy - 96, cx + 36, cy + 4], 700, [0.4, -0.5]);
    for (let i = 0; i < 3; i++) k.curve([[cx - 24, cy - 70 + i * 18], [cx, cy - 62 + i * 18], [cx + 24, cy - 70 + i * 18]], 1.1);
    c.beginPath(); ab(); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke();
    k.ell(cx, cy + 14, 24, 20, 0, 1.8, INK, '#e6dfc8');
    k.label('줄 두께 = 손가락', 480, 46, cx + 132, cy - 64);
    k.label('스프레이 X (녹지 않음)', 130, 40, cx - 92, cy - 40, 25, RED);
    k.label('1.5m 안 = 덮침', 118, 418, cx - 30, cy + 30, 25, RED);
  },

  eggs(c, k) {
    k.line([[30, 40], [570, 42]], 2.4); k.hatch(() => c.rect(30, 22, 540, 18), [30, 22, 570, 40], -0.7, 5, 0.8);   // the ceiling
    // three sacs on their stalks: silk-wrapped teardrops
    for (const [x, len, sc] of [[130, 60, 0.85], [300, 96, 1.1], [462, 46, 0.75]]) {
      k.line([[x, 42], [x + 3, 42 + len]], 1.2);
      const y = 42 + len + 50 * sc;
      const sac = () => { c.moveTo(x, y - 52 * sc); c.bezierCurveTo(x + 52 * sc, y - 30 * sc, x + 50 * sc, y + 44 * sc, x, y + 50 * sc); c.bezierCurveTo(x - 50 * sc, y + 44 * sc, x - 52 * sc, y - 30 * sc, x, y - 52 * sc); };
      c.beginPath(); sac(); c.fillStyle = '#ece5cf'; c.fill();
      k.stipple(sac, [x - 52 * sc, y - 52 * sc, x + 52 * sc, y + 50 * sc], 380, [0.6, 0.5]);
      c.save(); c.beginPath(); sac(); c.clip();
      for (let i = 0; i < 9; i++) k.curve([[x - 60 * sc, y - 40 * sc + i * 11 * sc], [x, y - 52 * sc + i * 13 * sc], [x + 60 * sc, y - 30 * sc + i * 10 * sc]], 0.5);
      c.restore();
      c.beginPath(); sac(); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke();
    }
    // a cut-away: eggs packed inside
    const ix = 150, iy = 330, ir = 68;
    k.line([[300, 238], [ix + ir * 0.7, iy - ir * 0.7]], 0.8);
    k.ell(ix, iy, ir, ir, 0, 1.6, INK, '#ebe4ce');
    c.save(); c.beginPath(); c.arc(ix, iy, ir - 3, 0, Math.PI * 2); c.clip();
    for (let i = 0; i < 140; i++) { const a = k.rnd() * Math.PI * 2, r = Math.sqrt(k.rnd()) * (ir - 8), x = ix + Math.cos(a) * r, y = iy + Math.sin(a) * r; k.ell(x, y, 4.2, 4.2, 0, 0.8, INK, '#f1ead6'); c.fillStyle = INK; c.beginPath(); c.arc(x + 1, y - 1, 1, 0, Math.PI * 2); c.fill(); }
    c.restore();
    k.write('단면: 알 수백 개?', ix, iy + ir + 18, 23);
    // a spiderling
    const sx = 430, sy = 330;
    for (let i = 0; i < 8; i++) { const s = i < 4 ? -1 : 1, j = i % 4, a = -0.9 + j * 0.6; k.leg([[sx + s * 4, sy, 1.6], [sx + s * 26, sy + Math.sin(a) * 26 - 10, 1.2], [sx + s * 44, sy + Math.sin(a) * 44 + 8, 0.6]]); }
    k.ell(sx, sy, 9, 8, 0, 1.3, INK, '#e6dfc8'); k.ell(sx, sy + 17, 10, 13, 0, 1.3, INK, '#e6dfc8');
    k.hatch(() => c.ellipse(sx, sy + 17, 10, 13, 0, 0, Math.PI * 2), [sx - 10, sy + 4, sx + 10, sy + 30], -0.8, 2.4, 0.7);
    k.write('새끼 (2~3cm)', sx, sy + 56, 23);
    k.label('쾅! → 터짐', 520, 90, 480, 142, 25, RED);
  },

  centi(c, k) {
    // the body: plates along a slow S, a jointed pair of legs on every segment
    const P = []; for (let i = 0; i <= 26; i++) { const t = i / 26; P.push([150 + t * 400, 210 + Math.sin(t * Math.PI * 2.1 + 0.4) * 70 - t * 40]); }
    for (let i = 1; i < P.length - 1; i++) {
      const [x0, y0] = P[i], [x1, y1] = P[i + 1], a = Math.atan2(y1 - y0, x1 - x0), nx = -Math.sin(a), ny = Math.cos(a), w = 18 - i * 0.35;
      for (const s of [1, -1]) k.leg([[x0 + nx * w * s, y0 + ny * w * s, 2.2], [x0 + nx * (w + 22) * s - Math.cos(a) * 6, y0 + ny * (w + 22) * s - Math.sin(a) * 6, 1.6], [x0 + nx * (w + 34) * s - Math.cos(a) * 18, y0 + ny * (w + 40) * s - Math.sin(a) * 18, 0.7]]);
      const seg = () => { c.moveTo(x0 + nx * w, y0 + ny * w); c.lineTo(x1 + nx * (w - 0.35), y1 + ny * (w - 0.35)); c.lineTo(x1 - nx * (w - 0.35), y1 - ny * (w - 0.35)); c.lineTo(x0 - nx * w, y0 - ny * w); c.closePath(); };
      c.beginPath(); seg(); c.fillStyle = '#e6dfc8'; c.fill();
      k.hatch(seg, [Math.min(x0, x1) - w, Math.min(y0, y1) - w, Math.max(x0, x1) + w, Math.max(y0, y1) + w], a + 1.2, 3, 0.6, 'rgba(27,33,64,.45)');
      c.beginPath(); seg(); c.strokeStyle = INK; c.lineWidth = 1.3; c.stroke();
    }
    // the long last legs
    const [lx, ly] = P[P.length - 1];
    for (const s of [1, -1]) k.leg([[lx, ly + s * 6, 2], [lx + 30, ly + s * 30, 1.6], [lx + 48, ly + s * 62, 0.8]]);
    // the head: head plate, antennae, the red fangs
    const [hx, hy] = P[1];
    k.ell(hx - 18, hy, 24, 20, 0, 1.8, INK, '#e6dfc8');
    k.stipple(() => c.ellipse(hx - 18, hy, 24, 20, 0, 0, Math.PI * 2), [hx - 42, hy - 20, hx + 6, hy + 20], 160, [-0.6, 0]);
    for (const s of [-1, 1]) {
      k.curve([[hx - 30, hy + s * 10], [hx - 70, hy + s * 40], [hx - 92, hy + s * 92], [hx - 80, hy + s * 132]], 1.2);
      for (let i = 0; i < 12; i++) { const t = i / 12, x = hx - 30 - t * 60, y = hy + s * (10 + t * 100); k.line([[x - 3, y], [x + 3, y]], 0.6); }
      k.curve([[hx - 34, hy + s * 6], [hx - 58, hy + s * 18], [hx - 62, hy + s * 4]], 3.2, RED);
    }
    // inset: the fang, close up
    const ix = 128, iy = 380, ir = 54;
    k.line([[hx - 58, hy + 16], [ix + ir * 0.6, iy - ir * 0.8]], 0.8);
    k.ell(ix, iy, ir, ir, 0, 1.6, INK, '#ebe4ce');
    k.curve([[ix - 34, iy + 26], [ix - 4, iy + 6], [ix + 14, iy - 22], [ix + 2, iy - 36]], 5, RED);
    k.curve([[ix + 4, iy - 30], [ix + 12, iy - 24]], 1.4, INK);
    k.write('독니 (앞다리가 변한 것)', ix + 4, iy + ir + 16, 21, RED);
    k.label('마디마다 다리 1쌍', 470, 70, P[12][0], P[12][1] - 18);
    k.label('꼬리다리 (더 길다)', 470, 400, lx + 30, ly + 30);
    k.write('5m 넘음?!', 330, 380, 30);
  },
};

// ------------------------------------------------------------------ what happened to the pages since
function damage(c, id, W, H, k) {
  const R = k.rnd;
  const soot = (x, y, r) => { const g = c.createRadialGradient(x, y, r * 0.55, x, y, r * 1.25); g.addColorStop(0, 'rgba(25,14,6,.95)'); g.addColorStop(0.45, 'rgba(70,38,12,.65)'); g.addColorStop(1, 'rgba(110,70,25,0)'); c.fillStyle = g; c.beginPath(); c.arc(x, y, r * 1.25, 0, Math.PI * 2); c.fill(); };
  const hole = (pts) => { c.save(); c.globalCompositeOperation = 'destination-out'; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.closePath(); c.fill(); c.restore(); };
  const jag = (x, y, r, n = 22, rough = 0.35) => Array.from({ length: n }, (_, i) => { const a = i / n * Math.PI * 2, rr = r * (1 - rough / 2 + R() * rough); return [x + Math.cos(a) * rr, y + Math.sin(a) * rr]; });
  const outline = (pts) => { c.beginPath(); pts.forEach(([px, py], i) => (i ? c.lineTo(px, py) : c.moveTo(px, py))); c.closePath(); };
  // a burnt edge: the charred rim, then the hole
  const burn = (x, y, r) => { const pts = jag(x, y, r, 26, 0.5); soot(x, y, r); c.save(); outline(pts); c.lineWidth = 7; c.strokeStyle = 'rgba(15,8,3,.85)'; c.stroke(); c.restore(); hole(pts); };
  // a corner torn away
  const tear = (corner, size) => {
    const [x0, y0] = [[0, 0], [W, 0], [W, H], [0, H]][corner], sx = corner === 1 || corner === 2 ? -1 : 1, sy = corner >= 2 ? -1 : 1;
    const pts = [[x0, y0], [x0 + sx * size * (0.9 + R() * 0.3), y0]];
    for (let i = 1; i < 9; i++) { const t = i / 9; pts.push([x0 + sx * size * (1 - t) * (0.85 + R() * 0.3), y0 + sy * size * t * (0.85 + R() * 0.3)]); }
    pts.push([x0, y0 + sy * size * (0.9 + R() * 0.3)]);
    hole(pts);
  };
  // dried blood: a smear with a drip; a fingerprint
  const smear = (x, y, len, ang) => {
    c.save(); c.translate(x, y); c.rotate(ang);
    for (let i = 0; i < 9; i++) { c.fillStyle = `rgba(${90 + R() * 30},12,8,${0.08 + R() * 0.12})`; c.beginPath(); c.ellipse(R() * len, (R() - 0.5) * 10, len * 0.18 + R() * 20, 7 + R() * 8, 0, 0, Math.PI * 2); c.fill(); }
    for (let i = 0; i < 5; i++) { c.strokeStyle = `rgba(80,10,6,${0.2 + R() * 0.25})`; c.lineWidth = 1 + R() * 2; c.beginPath(); c.moveTo(R() * len * 0.2, (R() - 0.5) * 16); c.lineTo(len * (0.6 + R() * 0.4), (R() - 0.5) * 18); c.stroke(); }
    c.restore();
    c.fillStyle = 'rgba(90,12,8,.35)'; c.fillRect(x + len * 0.3 * Math.cos(ang), y + len * 0.3 * Math.sin(ang), 3, 26 + R() * 30);
  };
  const print = (x, y, ang) => { c.save(); c.translate(x, y); c.rotate(ang); c.strokeStyle = 'rgba(95,15,10,.45)'; c.lineWidth = 1.6; for (let r = 4; r < 26; r += 3.2) { c.beginPath(); c.ellipse(0, 0, r, r * 1.35, 0, R() * 0.6, Math.PI * 2 - R() * 0.8); c.stroke(); } c.restore(); };
  // water: a paler soaked patch with tide lines, and the ink run
  const water = (x, y, r) => { c.fillStyle = 'rgba(120,110,80,.10)'; outline(jag(x, y, r, 30, 0.25)); c.fill(); for (let q = 0; q < 2; q++) { c.strokeStyle = `rgba(110,85,45,${0.35 - q * 0.12})`; c.lineWidth = 2.2 - q; outline(jag(x, y, r * (1 - q * 0.08), 30, 0.2)); c.stroke(); } };
  const run = (x, y, w, h) => { c.save(); try { c.filter = 'blur(2.2px)'; if (c.filter !== 'blur(2.2px)') { c.restore(); return; } c.globalAlpha = 0.85; c.setTransform(1, 0, 0, 1, 0, 0); const sx = c.canvas.width / W, sy = c.canvas.height / H; c.drawImage(c.canvas, x * sx, y * sy, w * sx, h * sy, x * sx, (y + 3) * sy, w * sx, h * sy); } catch (e) { /* no canvas filters here: the ink stays sharp */ } c.restore(); };
  const tape = (x, y, w, h, ang) => { c.save(); c.translate(x, y); c.rotate(ang); c.fillStyle = 'rgba(240,226,160,.38)'; c.fillRect(-w / 2, -h / 2, w, h); c.strokeStyle = 'rgba(160,140,80,.4)'; c.lineWidth = 1; c.strokeRect(-w / 2, -h / 2, w, h); for (let i = 0; i < 4; i++) { c.strokeStyle = 'rgba(255,255,255,.25)'; c.beginPath(); const tx = -w / 2 + R() * w; c.moveTo(tx, -h / 2); c.lineTo(tx + (R() - 0.5) * 10, h / 2); c.stroke(); } c.restore(); };
  const crease = (x0, y0, x1, y1) => { c.lineWidth = 2.5; c.strokeStyle = 'rgba(255,255,255,.3)'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.lineWidth = 1; c.strokeStyle = 'rgba(60,45,25,.25)'; c.beginPath(); c.moveTo(x0 + 2, y0 + 2); c.lineTo(x1 + 2, y1 + 2); c.stroke(); };
  const mold = (x, y, n) => { for (let i = 0; i < n; i++) { const r = 2 + R() * 9; c.fillStyle = `rgba(${60 + R() * 30},${70 + R() * 20},40,${0.15 + R() * 0.2})`; c.beginPath(); c.arc(x + (R() - 0.5) * 90, y + (R() - 0.5) * 60, r, 0, Math.PI * 2); c.fill(); } };

  if (id === 'roach') { water(470, 640, 90); run(60, 560, 520, 120); smear(380, 160, 140, 0.4); crease(0, 520, W, 470); tear(2, 120); }
  else if (id === 'ghost') { water(140, 300, 150); run(30, 470, 300, 160); crease(W * 0.55, 0, W * 0.4, H); tear(1, 90); }
  else if (id === 'wolf') { print(470, 560, 0.4); print(500, 610, 0.1); burn(W + 30, 330, 120); burn(W - 10, 470, 60); crease(0, 300, W, 330); }
  else if (id === 'gate') { tear(0, 150); tape(120, 190, 190, 44, -0.6); tape(470, 760, 160, 40, 0.3); mold(460, 120, 16); crease(0, 610, W, 600); }
  else if (id === 'eggs') { water(320, 540, 170); mold(80, 700, 22); mold(520, 450, 10); tear(3, 110); run(40, 610, 560, 110); }
  else if (id === 'centi') { smear(80, 260, 380, -0.12); smear(260, 640, 300, 0.35); print(140, 720, -0.5); burn(-20, H + 10, 140); burn(W * 0.66, H + 30, 80); }
}

// draws one notebook page into a canvas (any size, 3:4); everything is laid out on a 600 x 800 page
export function drawBugPage(canvas, page, seed = 1) {
  const c = canvas.getContext('2d'), PW = 600, PH = 800;
  c.setTransform(1, 0, 0, 1, 0, 0); c.clearRect(0, 0, canvas.width, canvas.height);
  c.setTransform(canvas.width / PW, 0, 0, canvas.height / PH, 0, 0);
  const k = kit(c, seed);
  // the page: notebook paper with its left edge ripped out of the spiral, grubby
  c.save(); c.beginPath(); c.moveTo(14, 0); for (let i = 0; i <= 30; i++) c.lineTo(6 + k.rnd() * 14, (i / 30) * PH); c.lineTo(PW, PH); c.lineTo(PW, 0); c.closePath(); c.clip();
  c.fillStyle = '#e6dfc8'; c.fillRect(0, 0, PW, PH);
  const g = c.createRadialGradient(PW / 2, PH / 2, PW * 0.3, PW / 2, PH / 2, PW * 0.9);
  g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(120,90,40,.35)'); c.fillStyle = g; c.fillRect(0, 0, PW, PH);
  for (let i = 0; i < 1100; i++) { c.fillStyle = `rgba(${90 + k.rnd() * 40},${70 + k.rnd() * 30},40,${k.rnd() * 0.06})`; c.fillRect(k.rnd() * PW, k.rnd() * PH, 1 + k.rnd() * 3, 1 + k.rnd() * 3); }
  // ruled lines below the drawing, the margin
  const top = PH * 0.6, gap = PH * 0.06;
  c.strokeStyle = 'rgba(90,120,170,.3)'; c.lineWidth = 1.4;
  for (let y = top; y < PH; y += gap) { c.beginPath(); c.moveTo(0, y); c.lineTo(PW, y); c.stroke(); }
  c.strokeStyle = 'rgba(190,70,70,.3)'; c.beginPath(); c.moveTo(PW * 0.1, top - gap); c.lineTo(PW * 0.1, PH); c.stroke();
  // the plate, the name underlined, the notes
  c.save(); PLATE[page.id](c, k); c.restore();
  k.write(page.title, PW * 0.12, top - gap * 0.5, gap, INK, 0, 'left');
  c.font = `${gap}px ${HAND}`; const tw = c.measureText(page.title).width;
  k.line([[PW * 0.11, top - gap * 0.08], [PW * 0.13 + tw, top - gap * 0.1]], 1.8);
  c.textBaseline = 'alphabetic';
  page.lines.forEach((ln, i) => {
    const y = top + gap * (i + 1) - gap * 0.2, room = PW * 0.84;
    c.font = `${gap * 0.86}px ${HAND}`;
    const full = c.measureText(ln.replace(/~~/g, '')).width;
    if (full > room) c.font = `${gap * 0.86 * room / full}px ${HAND}`;
    let x = PW * 0.13;
    c.save(); c.translate(0, y); c.rotate((k.rnd() - 0.5) * 0.012);
    ln.split('~~').forEach((part, j) => {
      c.fillStyle = INK; c.fillText(part, x, 0);
      const w = c.measureText(part).width;
      if (j % 2) { c.strokeStyle = INK; c.lineWidth = 2.2; c.beginPath(); c.moveTo(x - 3, -gap * 0.25); c.lineTo(x + w + 3, -gap * 0.3); c.moveTo(x - 2, -gap * 0.18); c.lineTo(x + w + 2, -gap * 0.24); c.stroke(); }
      x += w;
    });
    c.restore();
  });
  damage(c, page.id, PW, PH, k);
  c.restore();
  c.setTransform(1, 0, 0, 1, 0, 0);
}

// a photo from the disposable camera, taped onto a page (top right, over the drawing's corner)
export function tapePhoto(canvas, photo, seed = 1) {
  const c = canvas.getContext('2d'), PW = 600, PH = 800;
  let s = seed * 7919 + 13; const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  c.save(); c.setTransform(canvas.width / PW, 0, 0, canvas.height / PH, 0, 0);
  c.translate(470, 118); c.rotate(0.05 + rnd() * 0.07);
  const w = 212, h = 172, b = 9;
  c.shadowColor = 'rgba(0,0,0,.35)'; c.shadowBlur = 10; c.shadowOffsetX = 3; c.shadowOffsetY = 5;
  c.fillStyle = '#f2efe6'; c.fillRect(-w / 2, -h / 2, w, h + 10);
  c.shadowColor = 'transparent';
  c.drawImage(photo, -w / 2 + b, -h / 2 + b, w - 2 * b, h - 2 * b);
  // two strips of tape, a bit crooked
  c.fillStyle = 'rgba(214,200,160,.62)';
  for (const sx of [-1, 1]) { c.save(); c.translate(sx * (w / 2 - 14), -h / 2 - 2); c.rotate(sx * (0.5 + rnd() * 0.3)); c.fillRect(-26, -9, 52, 18); c.restore(); }
  c.restore();
}
