// The pest-control truck: a white 1-ton cab-over with a box body (roach-in-crosshair logo, green and
// yellow sweep), an orange beacon, and a cab you can sit in (gauges, navigation, CB radio and mic,
// work order on the dash). Local frame: forward +z, the driver's side (left) +x, ground at y = 0.
// The cab shell is drawn front-side only, so from inside you see the trim and through the glass.
import * as THREE from 'three';
import * as S from './surface.js';
import * as P from './props.js';

const V3 = THREE.Vector3;
const C = (h) => new THREE.Color(h);
const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
const DIGIT = '"Oswald", "Arial Narrow", sans-serif';
export const DRIVER_EYE = new V3(0.40, 1.47, 1.32);
const WHEELS = [[0.72, 1.55], [-0.72, 1.55], [0.72, -1.1], [-0.72, -1.1]];
const WHEEL_R = 0.33;

// ---------------------------------------------------------------- textures
const canvasTex = (W, H, paint, srgb = true) => { const c = S.canvas(W, H), g = c.getContext('2d'); paint(g, W, H); const t = S.texFrom(c, srgb, false); t.userData.canvas = c; return t; };
const soft = (g, x, y, r, rgb, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); };
function grime(g, W, H, R, k = 1) {
  g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.22 * k; g.drawImage(S.noiseCanvas(96, 5, 77), 0, 0, W, H);
  g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
  for (let i = 0; i < 40 * k; i++) soft(g, R() * W, R() * H, 10 + R() * 60, '110,100,85', 0.08 + R() * 0.12);
  // run-off from the top edge
  for (let i = 0; i < 60 * k; i++) { const x = R() * W, l = (0.1 + R() * 0.5) * H; const gr = g.createLinearGradient(0, 0, 0, l); gr.addColorStop(0, `rgba(80,72,60,${0.1 + R() * 0.2})`); gr.addColorStop(1, 'rgba(80,72,60,0)'); g.fillStyle = gr; g.fillRect(x, 0, 1 + R() * 5, l); }
  // road dirt from below
  const gr = g.createLinearGradient(0, H, 0, H * 0.7); gr.addColorStop(0, `rgba(90,78,62,${0.5 * k})`); gr.addColorStop(1, 'rgba(90,78,62,0)'); g.fillStyle = gr; g.fillRect(0, H * 0.7, W, H * 0.3);
  for (let i = 0; i < 300 * k; i++) { g.fillStyle = `rgba(60,55,48,${R() * 0.25})`; g.fillRect(R() * W, R() * H, 1 + R() * 3, 1); }
}
function dirtyPaint() {
  const R = S.rng(61);
  const t = canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#e4e3dd'; g.fillRect(0, 0, W, H);
    g.globalCompositeOperation = 'multiply'; g.globalAlpha = 0.18; g.drawImage(S.noiseCanvas(64, 6, 62), 0, 0, W, H);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    for (let i = 0; i < 26; i++) soft(g, R() * W, R() * H, 15 + R() * 60, '120,110,95', 0.08 + R() * 0.1);
    for (let i = 0; i < 40; i++) { const x = R() * W, y = R() * H, l = 20 + R() * 120; g.fillStyle = `rgba(100,90,75,${0.06 + R() * 0.1})`; g.fillRect(x, y, 1 + R() * 3, l); }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(0.6, 0.6);
  return t;
}
// the logo: a roach inside a gun sight, a spray lance poking in from the top left
function logo(g, cx, cy, r, col) {
  g.save(); g.translate(cx, cy); g.strokeStyle = col; g.fillStyle = col; g.lineCap = 'round';
  g.lineWidth = r * 0.11; g.beginPath(); g.arc(0, 0, r, 0, 7); g.stroke();
  g.lineWidth = r * 0.09;
  for (let k = 0; k < 4; k++) { const a = (k * Math.PI) / 2; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.78, Math.sin(a) * r * 0.78); g.lineTo(Math.cos(a) * r * 1.3, Math.sin(a) * r * 1.3); g.stroke(); }
  g.rotate(0.45);
  // body, pronotum, head
  g.beginPath(); g.ellipse(0, r * 0.12, r * 0.3, r * 0.52, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(0, -r * 0.42, r * 0.24, r * 0.15, 0, 0, 7); g.fill();
  g.beginPath(); g.ellipse(0, -r * 0.6, r * 0.1, r * 0.08, 0, 0, 7); g.fill();
  g.lineWidth = r * 0.05;
  for (const s of [-1, 1]) {
    for (const [y0, a1, l1, a2, l2] of [[-0.3, -0.9, 0.35, -0.3, 0.3], [0.0, -0.1, 0.4, 0.5, 0.35], [0.3, 0.6, 0.45, 1.0, 0.4]]) {
      const x0 = s * r * 0.22, yy = r * y0, x1 = x0 + s * Math.cos(a1) * r * l1, y1 = yy + Math.sin(a1) * r * l1;
      g.beginPath(); g.moveTo(x0, yy); g.lineTo(x1, y1); g.lineTo(x1 + s * Math.cos(a2) * r * l2, y1 + Math.sin(a2) * r * l2); g.stroke();
    }
    g.lineWidth = r * 0.03; g.beginPath(); g.moveTo(s * r * 0.05, -r * 0.66); g.quadraticCurveTo(s * r * 0.35, -r * 1.0, s * r * 0.3, -r * 1.25); g.stroke(); g.lineWidth = r * 0.05;
  }
  g.restore();
  g.save(); g.translate(cx, cy); g.strokeStyle = col; g.lineCap = 'round';
  g.lineWidth = r * 0.06; g.beginPath(); g.moveTo(-r * 0.95, -r * 1.25); g.lineTo(-r * 0.25, -r * 0.35); g.stroke();
  g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(-r * 1.15, -r * 1.5); g.lineTo(-r * 0.92, -r * 1.22); g.stroke();
  g.restore();
}
const GREEN = '#3c4a3e', YELLOW = '#d8a238';
function boxSide() {
  const R = S.rng(63);
  return canvasTex(1024, 536, (g, W, H) => {
    g.fillStyle = '#dcdbd5'; g.fillRect(0, 0, W, H);
    // green sweep along the bottom rising to the rear (u = 0 is the cab end), a white line and the yellow stripe inside it
    const diag = (t) => [0.56 * W + t * W, 0.78 * H];
    const top = (t) => [0.98 * W + t * W, 0.08 * H];
    g.fillStyle = GREEN; g.beginPath(); g.moveTo(0, 0.78 * H); g.lineTo(...diag(0)); g.lineTo(...top(0)); g.lineTo(W, 0.08 * H); g.lineTo(W, H); g.lineTo(0, H); g.fill();
    const band = (a, b, col, yb = 0.78) => { g.fillStyle = col; g.beginPath(); g.moveTo(0.56 * W + a * W, yb * H); g.lineTo(0.98 * W + a * W, 0.08 * H); g.lineTo(0.98 * W + b * W, 0.08 * H); g.lineTo(0.56 * W + b * W, yb * H); g.fill(); };
    g.save(); g.beginPath(); g.rect(0, 0.08 * H, W, 0.72 * H); g.clip();
    band(0.07, 0.085, '#e8e6df'); band(0.085, 0.15, YELLOW);
    g.restore();
    logo(g, 0.62 * W, 0.36 * H, 0.17 * H, GREEN);
    grime(g, W, H, R, 0.55);
  });
}
function boxBack() {
  const R = S.rng(65);
  return canvasTex(512, 512, (g, W, H) => {
    g.fillStyle = '#d8d7d1'; g.fillRect(0, 0, W, H);
    g.fillStyle = GREEN; g.beginPath(); g.moveTo(0.42 * W, H); g.lineTo(W, 0.42 * H); g.lineTo(W, 0.56 * H); g.lineTo(0.56 * W, H); g.fill();
    g.fillStyle = '#e8e6df'; g.beginPath(); g.moveTo(0.56 * W, H); g.lineTo(W, 0.56 * H); g.lineTo(W, 0.58 * H); g.lineTo(0.58 * W, H); g.fill();
    g.fillStyle = YELLOW; g.beginPath(); g.moveTo(0.58 * W, H); g.lineTo(W, 0.58 * H); g.lineTo(W, 0.65 * H); g.lineTo(0.65 * W, H); g.fill();
    logo(g, 0.24 * W, 0.26 * H, 0.09 * W, GREEN);
    grime(g, W, H, R, 0.5);
    g.fillStyle = 'rgba(40,40,38,0.85)'; g.fillRect(W / 2 - 2, 0, 4, H);   // door seam
  });
}
// the gauge cluster: speedometer and tachometer, temperature and fuel
function gauges() {
  return canvasTex(512, 192, (g, W, H) => {
    g.fillStyle = '#0b0c0d'; g.fillRect(0, 0, W, H);
    const dial = (cx, cy, r, max, step, lab, needle) => {
      g.strokeStyle = '#3a3c3e'; g.lineWidth = 4; g.beginPath(); g.arc(cx, cy, r + 6, 0, 7); g.stroke();
      const a0 = Math.PI * 0.75, a1 = Math.PI * 2.25;
      for (let v = 0; v <= max; v += step / 2) {
        const a = a0 + (a1 - a0) * (v / max), big = Math.abs(v / step - Math.round(v / step)) < 1e-6;
        g.strokeStyle = v / max > 0.8 && lab === 'x1000r/min' ? '#e0452c' : '#f2efe6'; g.lineWidth = big ? 3 : 1.5;
        g.beginPath(); g.moveTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r * (big ? 0.84 : 0.9), cy + Math.sin(a) * r * (big ? 0.84 : 0.9)); g.stroke();
        if (big) { g.fillStyle = '#f2efe6'; g.font = `600 ${r * 0.2}px ${DIGIT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(v), cx + Math.cos(a) * r * 0.66, cy + Math.sin(a) * r * 0.66); }
      }
      g.fillStyle = '#9a9890'; g.font = `500 ${r * 0.13}px ${DIGIT}`; g.fillText(lab, cx, cy + r * 0.45);
      const a = a0 + (a1 - a0) * needle;
      g.strokeStyle = '#ff5a2a'; g.lineWidth = 4; g.beginPath(); g.moveTo(cx - Math.cos(a) * r * 0.12, cy - Math.sin(a) * r * 0.12); g.lineTo(cx + Math.cos(a) * r * 0.86, cy + Math.sin(a) * r * 0.86); g.stroke();
      g.fillStyle = '#222'; g.beginPath(); g.arc(cx, cy, r * 0.09, 0, 7); g.fill();
    };
    dial(140, 100, 78, 120, 20, 'km/h', 0.33); dial(372, 100, 78, 8, 1, 'x1000r/min', 0.24);
    // small temp / fuel gauge between them
    g.strokeStyle = '#f2efe6'; g.lineWidth = 2; g.beginPath(); g.arc(256, 160, 26, Math.PI * 1.15, Math.PI * 1.85); g.stroke();
    g.fillStyle = '#f2efe6'; g.font = `600 12px ${DIGIT}`; g.textAlign = 'center'; g.fillText('E', 232, 168); g.fillText('F', 280, 168);
    g.strokeStyle = '#ff5a2a'; g.lineWidth = 3; g.beginPath(); g.moveTo(256, 160); g.lineTo(256 - 14, 140); g.stroke();
  });
}
function climate() {
  return canvasTex(512, 192, (g, W, H) => {
    g.fillStyle = '#16171a'; g.fillRect(0, 0, W, H);
    // hazard button and four switches
    g.fillStyle = '#2a1414'; g.fillRect(40, 18, 70, 60);
    g.strokeStyle = '#ff4b38'; g.lineWidth = 5; g.beginPath(); g.moveTo(75, 30); g.lineTo(96, 66); g.lineTo(54, 66); g.closePath(); g.stroke();
    for (let i = 0; i < 4; i++) { g.fillStyle = '#202226'; g.fillRect(140 + i * 80, 22, 60, 52); g.fillStyle = '#5fbf7a'; g.fillRect(162 + i * 80, 40, 16, 6); }
    // three knobs: fan, temperature (blue to red), vents
    for (const [x, kind] of [[110, 'fan'], [256, 'temp'], [402, 'vent']]) {
      g.fillStyle = '#26282c'; g.beginPath(); g.arc(x, 132, 40, 0, 7); g.fill();
      if (kind === 'temp') { const gr = g.createLinearGradient(x - 40, 0, x + 40, 0); gr.addColorStop(0, '#3a7bd5'); gr.addColorStop(1, '#e0452c'); g.strokeStyle = gr; g.lineWidth = 5; g.beginPath(); g.arc(x, 132, 46, Math.PI * 0.8, Math.PI * 2.2); g.stroke(); }
      else for (let k = 0; k < 5; k++) { const a = Math.PI * 0.8 + k * Math.PI * 0.35; g.fillStyle = '#c9c6bd'; g.fillRect(x + Math.cos(a) * 48 - 2, 132 + Math.sin(a) * 48 - 2, 4, 4); }
      g.fillStyle = '#3a3d42'; g.beginPath(); g.arc(x, 132, 26, 0, 7); g.fill();
      g.strokeStyle = '#d8d4ca'; g.lineWidth = 4; g.beginPath(); g.moveTo(x, 132); g.lineTo(x, 110); g.stroke();
    }
  });
}
function navScreen(mode) {
  return canvasTex(512, 320, (g, W, H) => {
    g.fillStyle = '#0d1424'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(80,100,140,0.35)'; g.lineWidth = 2;
    const R = S.rng(71);
    for (let i = 0; i < 14; i++) { g.beginPath(); g.moveTo(R() * W, 60 + R() * 220); g.bezierCurveTo(R() * W, R() * H, R() * W, R() * H, R() * W, 60 + R() * 220); g.stroke(); }
    g.strokeStyle = '#3d7bff'; g.lineWidth = 10; g.lineCap = 'round';
    g.beginPath(); g.moveTo(250, 290); g.bezierCurveTo(250, 220, 300, 200, 280, 150); g.bezierCurveTo(262, 110, 300, 90, 310, 70); g.stroke();
    g.fillStyle = '#e8eefc'; g.beginPath(); g.moveTo(250, 228); g.lineTo(268, 270); g.lineTo(250, 260); g.lineTo(232, 270); g.closePath(); g.fill();
    g.fillStyle = 'rgba(8,12,22,0.92)'; g.fillRect(0, 0, W, 54); g.fillRect(0, H - 46, W, 46);
    g.fillStyle = '#ffffff'; g.font = `700 28px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'left';
    if (mode === 'night') { g.fillText('목적지 도착', 22, 28); g.textAlign = 'right'; g.fillText('0 m', W - 20, 28); }
    else { g.fillText('↱ D-7 산업시설', 18, 28); g.textAlign = 'right'; g.fillText('5.8 km', W - 20, 28); }
    g.textAlign = 'center'; g.font = `500 24px ${FONT}`;
    g.fillText(mode === 'night' ? 'D-7 산업시설' : '예상 도착: 19:12', W / 2, H - 23);
  });
}
function radioLcd() {
  const t = canvasTex(256, 64, () => {});
  t.userData.draw = (on) => {
    const g = t.userData.canvas.getContext('2d');
    g.fillStyle = on ? '#3a1d02' : '#1a1206'; g.fillRect(0, 0, 256, 64);
    g.fillStyle = on ? '#ffb03a' : '#5a3a12'; g.font = `600 44px ${DIGIT}`; g.textBaseline = 'middle'; g.textAlign = 'left'; g.fillText('CH.01', 20, 34);
    g.font = `600 16px ${DIGIT}`; g.fillText('RX', 200, 22); g.fillText(on ? '▮▮▮▮' : '▮', 196, 46);
    t.needsUpdate = true;
  };
  t.userData.draw(true);
  return t;
}
function workOrder() {
  return canvasTex(512, 680, (g, W, H) => {
    g.fillStyle = '#f2efe6'; g.fillRect(0, 0, W, H);
    const R = S.rng(73);
    for (let i = 0; i < 10; i++) soft(g, R() * W, R() * H, 30 + R() * 80, '150,135,110', 0.08);
    g.fillStyle = '#1d1d1d'; g.textAlign = 'center'; g.font = `700 54px ${FONT}`; g.fillText('작업 지시서', W / 2, 110);
    g.fillRect(60, 140, W - 120, 3);
    g.textAlign = 'left'; g.font = `500 30px ${FONT}`;
    [['작업 장소', 'D-7 산업시설'], ['요청 내용', '해충 방역 작업'], ['주의 사항', '외부 출입 금지'], ['담당', '방역팀 3조']].forEach(([k, v], i) => {
      g.fillText(`${k} : ${v}`, 60, 220 + i * 70);
    });
    g.strokeStyle = 'rgba(30,30,30,0.35)'; g.lineWidth = 2;
    for (let i = 0; i < 4; i++) { g.beginPath(); g.moveTo(60, 520 + i * 36); g.lineTo(W - 60 - R() * 120, 520 + i * 36); g.stroke(); }
    g.strokeStyle = '#b8231b'; g.lineWidth = 4; g.beginPath(); g.arc(W - 110, 610, 40, 0, 7); g.stroke();
    g.fillStyle = '#b8231b'; g.font = `700 22px ${FONT}`; g.textAlign = 'center'; g.fillText('긴급', W - 110, 618);
  });
}

// ---------------------------------------------------------------- geometry helpers
// a flat polygon given in (z, y) on the plane x = const
function sidePoly(pts, x) {
  const g = new THREE.ShapeGeometry(new THREE.Shape(pts.map(([z, y]) => new THREE.Vector2(z, y))));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const z = p.getX(i), y = p.getY(i); p.setXYZ(i, x, y, z); }
  g.computeVertexNormals();
  return g;
}
// a quad from four corners (any orientation)
function quad4(a, b, c, d) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...a, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1], 2));
  g.computeVertexNormals();
  return g;
}
function between(a, b, r, seg = 6) {
  const d = new V3().subVectors(b, a), g = P.cyl(r, r, d.length(), seg);
  g.applyMatrix4(new THREE.Matrix4().compose(a.clone().add(b).multiplyScalar(0.5), new THREE.Quaternion().setFromUnitVectors(new V3(0, 1, 0), d.normalize()), new V3(1, 1, 1)));
  return g;
}

// ---------------------------------------------------------------- build
export function buildTruck() {
  const R = S.rng(5150);
  const B = new P.Batch();
  const group = new THREE.Group(); group.name = 'truck';
  const add = (mat, g, col = 0xffffff) => B.add(mat, 'truck', g, col instanceof THREE.Color ? col : C(col));
  const box = (mat, w, h, d, x, y, z, col = 0xffffff, rx = 0, ry = 0, rz = 0) => { const g = P.box(w, h, d); if (rz) g.rotateZ(rz); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); add(mat, g, col); };
  const both = (fn) => { fn(1); fn(-1); };
  // a textured panel facing back toward the seats (-z); rx leans its top away, ry turns it toward +x when negative
  const panel = (mat, w, h, x, y, z, rx = 0, ry = 0) => { const g = new THREE.PlaneGeometry(w, h); g.rotateY(Math.PI); if (rx) g.rotateX(rx); if (ry) g.rotateY(ry); g.translate(x, y, z); add(mat, g); };

  // ---- cab shell: side profile (z, y) with the front wheel arch, extruded across and rounded
  const prof = [[0.92, 0.62], [1.246, 0.62]];
  for (let k = 0; k <= 10; k++) { const a = 2.38 - (k / 10) * (2.38 - 0.76); prof.push([1.55 + 0.42 * Math.cos(a), 0.33 + 0.42 * Math.sin(a)]); }
  prof.push([2.36, 0.62], [2.40, 1.10], [2.30, 1.22], [1.98, 1.88], [1.88, 1.97], [1.00, 1.98], [0.92, 1.92]);
  const shell = new THREE.ExtrudeGeometry(new THREE.Shape(prof.map(([z, y]) => new THREE.Vector2(z, y))), { depth: 1.62, bevelEnabled: true, bevelThickness: 0.04, bevelSize: 0.03, bevelSegments: 3, curveSegments: 4 });
  shell.translate(0, 0, -0.81); shell.rotateY(-Math.PI / 2);
  {   // road grime toward the bottom, as vertex colour
    const p = shell.attributes.position, col = new Float32Array(p.count * 3), lo = C('#8f897d'), hi = C('#ffffff'), c = new THREE.Color();
    for (let i = 0; i < p.count; i++) { const t = THREE.MathUtils.smoothstep(p.getY(i), 0.6, 1.1); c.copy(lo).lerp(hi, t); col.set([c.r, c.g, c.b], i * 3); }
    shell.setAttribute('color', new THREE.BufferAttribute(col, 3));
  }
  add('paint', shell);
  const SX = 0.84;   // outer face of the cab sides

  // ---- glass: windshield on the slope, door windows on both sides
  const ws0 = new THREE.Vector2(2.30, 1.22), ws1 = new THREE.Vector2(1.98, 1.88);
  const wsN = new THREE.Vector2(0.66, 0.32).normalize();   // outward normal of the windshield (z, y)
  const wsAt = (t, x, off = 0.036) => { const p = ws0.clone().lerp(ws1, t).addScaledVector(wsN, off); return [x, p.y, p.x]; };
  add('glass', quad4(wsAt(0.06, -0.74), wsAt(0.06, 0.74), wsAt(0.95, 0.72), wsAt(0.95, -0.72)));
  const winPts = [[1.14, 1.30], [2.14, 1.30], [1.90, 1.81], [1.14, 1.81]];
  both((s) => add('glass', sidePoly(winPts, s * (SX + 0.008))));
  // a dark rubber surround so the glass edge reads from outside
  both((s) => { for (const [a, b] of [[0, 1], [1, 2], [2, 3], [3, 0]]) { const [za, ya] = winPts[a], [zb, yb] = winPts[b]; add('plastic', between(new V3(s * (SX + 0.006), ya, za), new V3(s * (SX + 0.006), yb, zb), 0.018, 4), C('#1b1c1c')); } });
  for (const [ta, xa, tb, xb] of [[0.06, -0.75, 0.06, 0.75], [0.95, -0.73, 0.95, 0.73], [0.06, 0.75, 0.95, 0.73], [0.06, -0.75, 0.95, -0.73]]) add('plastic', between(new V3(...wsAt(ta, xa, 0.03)), new V3(...wsAt(tb, xb, 0.03)), 0.02, 4), C('#1b1c1c'));

  // ---- cab front: grille, lamps, bumper, wipers, beacon, mirrors, door seams and handles
  box('plastic', 0.74, 0.18, 0.03, 0, 0.92, 2.393, C('#2a2b2b'));
  for (let i = 0; i < 4; i++) box('chrome', 0.72, 0.018, 0.02, 0, 0.85 + i * 0.045, 2.425);
  box('chrome', 0.78, 0.025, 0.03, 0, 1.02, 2.42);
  both((s) => {
    box('chrome', 0.31, 0.19, 0.04, s * 0.585, 0.95, 2.395);
    box('headLens', 0.27, 0.15, 0.03, s * 0.585, 0.95, 2.415);
    box('amberLens', 0.07, 0.15, 0.03, s * 0.765, 0.95, 2.405);
  });
  box('bumper', 1.74, 0.27, 0.15, 0, 0.5, 2.44, C('#5e605d'));
  box('plastic', 1.0, 0.06, 0.02, 0, 0.47, 2.52, C('#1e1f1f'));
  both((s) => box('plastic', 0.16, 0.07, 0.02, s * 0.68, 0.47, 2.52, C('#1e1f1f')));
  box('plastic', 0.34, 0.1, 0.01, 0, 0.58, 2.522, C('#d8d6cf'));   // plate
  for (const x0 of [-0.66, 0.06]) add('plastic', between(new V3(...wsAt(0.05, x0, 0.07)), new V3(...wsAt(0.12, x0 + 0.6, 0.07)), 0.012, 4), C('#141515'));
  // beacon: base, amber dome; the reflector inside turns (kept separate below)
  box('plastic', 0.24, 0.05, 0.16, 0, 2.03, 1.62, C('#202121'));
  const dome = new THREE.CylinderGeometry(0.075, 0.08, 0.12, 20); dome.translate(0, 2.115, 1.62); add('beacon', dome);
  const domeTop = new THREE.SphereGeometry(0.075, 20, 8, 0, Math.PI * 2, 0, Math.PI / 2); domeTop.translate(0, 2.175, 1.62); add('beacon', domeTop);
  both((s) => {
    add('plastic', between(new V3(s * 0.85, 1.42, 2.1), new V3(s * 1.0, 1.5, 2.14), 0.016, 5), C('#1d1e1e'));
    add('plastic', between(new V3(s * 0.85, 1.25, 2.12), new V3(s * 1.0, 1.36, 2.14), 0.012, 5), C('#1d1e1e'));
    box('plastic', 0.07, 0.27, 0.15, s * 1.04, 1.43, 2.14, C('#1d1e1e'));
    box('mirror', 0.06, 0.24, 0.005, s * 1.04, 1.43, 2.064);
    // door: seams, handle, step
    box('plastic', 0.006, 1.2, 0.008, s * (SX + 0.004), 1.32, 1.08, C('#4a4844'));
    box('plastic', 0.006, 0.55, 0.008, s * (SX + 0.004), 0.98, 2.2, C('#4a4844'));
    box('plastic', 0.02, 0.035, 0.13, s * (SX + 0.01), 1.16, 1.3, C('#1e1f1f'));
    box('plastic', 0.2, 0.03, 0.34, s * 0.78, 0.55, 1.0, C('#2a2b2b'));
  });

  // ---- box body
  const bz0 = -2.62, bz1 = 0.86, by0 = 0.8, by1 = 2.6, bx = 0.92, bl = bz1 - bz0, bh = by1 - by0;
  both((s) => {
    const g = new THREE.PlaneGeometry(bl, bh); g.rotateY(s * Math.PI / 2);
    if (s < 0) { const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i)); }
    g.translate(s * bx, (by0 + by1) / 2, (bz0 + bz1) / 2); add('boxSide', g);
  });
  { const g = new THREE.PlaneGeometry(bx * 2, bh); g.rotateY(Math.PI); g.translate(0, (by0 + by1) / 2, bz0); add('boxBack', g); }
  { const g = new THREE.PlaneGeometry(bx * 2, bh); g.translate(0, (by0 + by1) / 2, bz1); add('paint', g, C('#cfcec8')); }
  { const g = new THREE.PlaneGeometry(bx * 2, bl); g.rotateX(-Math.PI / 2); g.translate(0, by1, (bz0 + bz1) / 2); add('paint', g, C('#bdbcb6')); }
  box('plastic', bx * 2, 0.1, bl, 0, by0 - 0.04, (bz0 + bz1) / 2, C('#232424'));
  // aluminium frame: corner posts, top and bottom rails, rear door frame
  both((s) => {
    for (const z of [bz0, bz1]) box('alu', 0.07, bh + 0.08, 0.07, s * bx, (by0 + by1) / 2, z);
    for (const y of [by1, by0 + 0.03]) box('alu', 0.07, y === by1 ? 0.07 : 0.11, bl + 0.07, s * bx, y, (bz0 + bz1) / 2);
  });
  for (const z of [bz0, bz1]) { box('alu', bx * 2 + 0.07, 0.07, 0.07, 0, by1, z); box('alu', bx * 2 + 0.07, 0.1, 0.07, 0, by0 + 0.03, z); }
  box('alu', 0.05, bh, 0.03, 0, (by0 + by1) / 2, bz0 - 0.03);                                   // centre seam
  both((s) => {
    for (const y of [1.05, 1.7, 2.35]) { box('alu', 0.12, 0.08, 0.04, s * (bx - 0.05), y, bz0 - 0.03); box('alu', 0.03, 0.05, 0.05, s * (bx - 0.01), y, bz0 - 0.02); }   // hinges
    for (const x of [0.28, 0.08]) {                                                                // lock rods with keepers
      add('alu', between(new V3(s * x, by0 + 0.05, bz0 - 0.05), new V3(s * x, by1 - 0.05, bz0 - 0.05), 0.016, 8));
      for (const y of [by0 + 0.08, by1 - 0.08]) box('alu', 0.07, 0.05, 0.05, s * x, y, bz0 - 0.04);
    }
    box('alu', 0.2, 0.03, 0.04, s * 0.18, 1.45, bz0 - 0.07);                                       // handle
  });
  // chassis, fuel tank, guards, rear bar, lamps, mud flaps
  both((s) => box('plastic', 0.07, 0.18, 5.0, s * 0.42, 0.52, -0.2, C('#1c1d1d')));
  box('plastic', 0.34, 0.3, 0.62, 0.62, 0.55, -0.15, C('#252626'));
  box('plastic', 0.3, 0.26, 0.4, -0.62, 0.55, -0.2, C('#3a3c3b'));
  both((s) => { for (const y of [0.5, 0.66]) box('alu', 0.04, 0.05, 1.2, s * 0.9, y, -0.2); });
  box('plastic', 1.7, 0.1, 0.1, 0, 0.42, bz0 - 0.08, C('#222323'));
  both((s) => {
    box('plastic', 0.36, 0.13, 0.07, s * 0.7, 0.66, bz0 - 0.05, C('#1e1f1f'));
    box('tailLens', 0.16, 0.1, 0.02, s * 0.76, 0.66, bz0 - 0.09);
    box('amberLens', 0.07, 0.1, 0.02, s * 0.63, 0.66, bz0 - 0.09);
    box('headLens', 0.07, 0.1, 0.02, s * 0.555, 0.66, bz0 - 0.09);
    box('plastic', 0.3, 0.36, 0.01, s * 0.74, 0.3, -1.52, C('#151616'));
    box('amberLens', 0.04, 0.05, 0.05, s * (bx + 0.02), 0.82, -0.9);
  });
  box('plastic', 0.32, 0.16, 0.01, 0, 0.6, bz0 - 0.1, C('#d8d6cf'));

  // ---- wheels: rounded tyre, steel rim, hub and nuts
  const tyreProf = [[0.2, -0.1], [0.29, -0.1], [0.318, -0.088], [0.33, -0.05], [0.33, 0.05], [0.318, 0.088], [0.29, 0.1], [0.2, 0.1]].map(([r, y]) => new THREE.Vector2(r, y));
  const wheelParts = [];
  for (const [x, z] of WHEELS) {
    const s = Math.sign(x), m = new THREE.Matrix4().makeRotationZ(-s * Math.PI / 2).setPosition(x, WHEEL_R, z);
    const parts = [];
    const tyre = new THREE.LatheGeometry(tyreProf, 28); parts.push(['rubber', tyre, C('#1c1c1c')]);
    const rim = new THREE.CylinderGeometry(0.205, 0.205, 0.16, 24); parts.push(['rim', rim, C('#a9aba7')]);
    const face = new THREE.CylinderGeometry(0.18, 0.2, 0.02, 24); face.translate(0, 0.08, 0); parts.push(['rim', face, C('#9fa19d')]);
    const hub = new THREE.CylinderGeometry(0.065, 0.075, 0.06, 16); hub.translate(0, 0.11, 0); parts.push(['rim', hub, C('#8d8f8b')]);
    for (let k = 0; k < 6; k++) { const a = (k / 6) * Math.PI * 2, n = new THREE.CylinderGeometry(0.014, 0.014, 0.03, 6); n.translate(Math.cos(a) * 0.1, 0.1, Math.sin(a) * 0.1); parts.push(['rim', n, C('#6c6e6a')]); }
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2 + 0.2, h = new THREE.CylinderGeometry(0.022, 0.022, 0.025, 10); h.translate(Math.cos(a) * 0.15, 0.085, Math.sin(a) * 0.15); parts.push(['plastic', h, C('#2a2b2a')]); }
    wheelParts.push({ x, z, s, parts });
  }

  // ---- cab interior (the shell is invisible from in here)
  const trim = C('#45474b'), dark = C('#26282b');
  // a flat panel given in 2D, with holes, mapped into 3D by fn(u, v)
  const flat = (outline, holes, fn) => {
    const sh = new THREE.Shape(outline.map(([u, v]) => new THREE.Vector2(u, v)));
    for (const h of holes) sh.holes.push(new THREE.Path(h.map(([u, v]) => new THREE.Vector2(u, v))));
    const g = new THREE.ShapeGeometry(sh), p = g.attributes.position;
    for (let i = 0; i < p.count; i++) p.setXYZ(i, ...fn(p.getX(i), p.getY(i)));
    g.computeVertexNormals(); return g;
  };
  // door/side trim with the window cut out (a 3 cm frame shows round the glass)
  const inset = (pts, d) => { const cz = pts.reduce((a, q) => a + q[0], 0) / pts.length, cy = pts.reduce((a, q) => a + q[1], 0) / pts.length; return pts.map(([z, y]) => [z + Math.sign(cz - z) * d, y + Math.sign(cy - y) * d]); };
  both((s) => add('trim', flat([[0.97, 0.8], [2.3, 0.8], [2.3, 1.22], [1.98, 1.88], [1.9, 1.92], [0.97, 1.92]], [winPts.map(([z, y]) => [z, y])], (z, y) => [s * 0.8, y, z]), trim));
  // windshield frame: the inside of the slope with the glass area cut out
  {
    const L = ws0.distanceTo(ws1), dir = ws1.clone().sub(ws0).normalize();
    const at = (x, u) => { const q = ws0.clone().addScaledVector(dir, u).addScaledVector(wsN, -0.03); return [x, q.y, q.x]; };
    add('trim', flat([[-0.8, -0.05], [0.8, -0.05], [0.8, L + 0.06], [-0.8, L + 0.06]], [[[-0.72, L * 0.06], [0.72, L * 0.06], [0.7, L * 0.95], [-0.7, L * 0.95]]], at), trim);
  }
  box('trim', 1.62, 0.02, 0.96, 0, 1.925, 1.44, C('#4b4b48'));                                         // headliner
  { const g = new THREE.PlaneGeometry(1.62, 1.12); g.translate(0, 1.36, 0.975); add('trim', g, trim); }  // back wall
  box('trim', 1.62, 0.02, 1.4, 0, 0.8, 1.6, C('#18191a'));                                             // floor
  both((s) => {
    box('trim', 0.06, 0.06, 0.34, s * 0.77, 1.1, 1.45, dark);                                          // arm rest
    box('trim', 0.42, 0.02, 0.18, s * 0.4, 1.89, 1.87, C('#45464a'), 0.3);                             // sun visor
  });
  add('trim', between(new V3(0.72, 1.52, 2.06), new V3(0.71, 1.7, 1.99), 0.012, 5), C('#2a2b2c'));    // grab handle on the pillar
  // dashboard: profile extruded across the cab, high and close like a cab-over
  {
    const sh = new THREE.Shape([[2.29, 1.21], [2.02, 1.25], [1.92, 1.25], [1.87, 1.2], [1.87, 0.95], [1.98, 0.8], [2.29, 0.8]].map(([z, y]) => new THREE.Vector2(z, y)));
    const g = new THREE.ExtrudeGeometry(sh, { depth: 1.56, bevelEnabled: true, bevelThickness: 0.01, bevelSize: 0.012, bevelSegments: 2 });
    g.translate(0, 0, -0.78); g.rotateY(-Math.PI / 2); add('trim', g, C('#3a3c40'));
  }
  box('trim', 0.52, 0.05, 0.16, 0.4, 1.27, 1.93, C('#1c1e20'), -0.12);                                // cluster hood
  panel('gauges', 0.44, 0.15, 0.4, 1.13, 1.852, 0.1);
  panel('climate', 0.34, 0.13, -0.12, 1.06, 1.853, 0.04);
  box('trim', 0.12, 0.08, 0.02, 0.86 - 0.15, 1.2, 1.88, dark);                                        // vent
  // steering wheel, column, stalks
  {
    const m = new THREE.Matrix4().compose(new V3(0.4, 1.17, 1.68), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.96, 0, 0)), new V3(1, 1, 1));
    const rim = new THREE.TorusGeometry(0.19, 0.022, 10, 40); rim.applyMatrix4(m); add('wheel', rim, C('#151617'));
    const hubG = new THREE.CylinderGeometry(0.06, 0.07, 0.05, 16); hubG.rotateX(Math.PI / 2); hubG.applyMatrix4(m); add('wheel', hubG, C('#1a1b1c'));
    for (const a of [Math.PI / 2 + Math.PI, 0.25, Math.PI - 0.25]) { const sp = P.box(0.18, 0.03, 0.015); sp.translate(0.1, 0, 0); sp.rotateZ(a); sp.applyMatrix4(m); add('wheel', sp, C('#1a1b1c')); }
    add('wheel', between(new V3(0.4, 1.15, 1.71), new V3(0.4, 1.0, 1.9), 0.04, 10), C('#18191a'));
    both((s) => box('wheel', 0.12, 0.018, 0.02, 0.4 + s * 0.11, 1.11, 1.77, C('#18191a')));
  }
  // seats
  both((s) => {
    const x = s * 0.4;
    box('fabric', 0.5, 0.12, 0.5, x, 0.98, 1.32, C('#2f343b'));
    box('fabric', 0.5, 0.62, 0.12, x, 1.33, 1.08, C('#2f343b'), -0.12);
    box('fabric', 0.28, 0.18, 0.1, x, 1.74, 1.03, C('#2f343b'), -0.12);
    box('trim', 0.46, 0.12, 0.42, x, 0.86, 1.32, dark);
  });
  box('fabric', 0.24, 0.1, 0.42, 0, 0.96, 1.3, C('#2b3037'));
  add('wheel', between(new V3(0.1, 0.82, 1.66), new V3(0.1, 1.06, 1.6), 0.012, 6), C('#222'));         // gear lever
  { const k = new THREE.SphereGeometry(0.035, 12, 8); k.translate(0.1, 1.08, 1.6); add('wheel', k, C('#121212')); }
  // rear-view mirror
  add('trim', between(new V3(0, 1.92, 1.93), new V3(0, 1.8, 1.95), 0.01, 5), dark);
  box('trim', 0.27, 0.08, 0.035, 0, 1.78, 1.95, dark);
  box('mirror', 0.25, 0.065, 0.004, 0, 1.78, 1.93);
  // navigation unit on the dash, turned a little toward the driver
  box('trim', 0.03, 0.06, 0.03, -0.06, 1.28, 2.0, dark);
  box('trim', 0.22, 0.145, 0.025, -0.06, 1.37, 1.985, C('#141516'), 0.12, -0.22);
  { const g = new THREE.PlaneGeometry(0.19, 0.118); g.rotateY(Math.PI); g.translate(0, 0, -0.019); g.rotateX(0.12); g.rotateY(-0.22); g.translate(-0.06, 1.37, 1.985); add('nav', g); }
  // CB radio and its mic on a hook, coiled cord between
  box('trim', 0.27, 0.075, 0.17, -0.4, 1.29, 2.02, C('#141516'));
  panel('lcd', 0.11, 0.034, -0.43, 1.295, 1.926);
  for (const [x, r] of [[-0.515, 0.016], [-0.33, 0.011], [-0.3, 0.011]]) { const kn = new THREE.CylinderGeometry(r, r, 0.016, 12); kn.rotateX(Math.PI / 2); kn.translate(x, 1.285, 1.93); add('wheel', kn, C('#3a3b3c')); }
  box('trim', 0.022, 0.045, 0.022, -0.6, 1.28, 1.96, dark);
  const micM = new THREE.Matrix4().compose(new V3(-0.6, 1.2, 1.955), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.08, 0, 0.1)), new V3(1, 1, 1));
  { const mic = new THREE.CapsuleGeometry(0.03, 0.07, 6, 12); mic.scale(1, 1, 0.55); mic.applyMatrix4(micM); add('wheel', mic, C('#1a1b1c')); }
  { const grill = P.box(0.04, 0.05, 0.004); grill.translate(0, 0.0, -0.017); grill.applyMatrix4(micM); add('trim', grill, C('#0a0a0a')); }
  {
    const pts = []; const a = new V3(-0.5, 1.26, 1.935), b = new V3(-0.6, 1.14, 1.955);
    for (let i = 0; i <= 160; i++) { const t = i / 160, p = a.clone().lerp(b, t); p.y -= Math.sin(t * Math.PI) * 0.1; const ang = t * 26 * Math.PI; p.x += Math.cos(ang) * 0.008; p.z += Math.sin(ang) * 0.008; pts.push(p); }
    add('wheel', new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 320, 0.0035, 5), C('#0d0d0d'));
  }
  // work order on a clipboard, leaning on the passenger side of the dash
  {
    const m = new THREE.Matrix4().compose(new V3(-0.6, 1.06, 1.83), new THREE.Quaternion().setFromEuler(new THREE.Euler(0.3, -0.25, 0.05)), new V3(1, 1, 1));
    const bd = P.box(0.25, 0.34, 0.008); bd.applyMatrix4(m); add('wood', bd, C('#7a5c3a'));
    const paper = new THREE.PlaneGeometry(0.22, 0.29); paper.rotateY(Math.PI); paper.translate(0, -0.015, -0.012); paper.applyMatrix4(m); add('paper', paper);
    const clip = P.box(0.1, 0.03, 0.02); clip.translate(0, 0.16, -0.008); clip.applyMatrix4(m); add('chrome', clip);
  }

  // ---------------------------------------------------------------- materials
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const lcd = radioLcd(), navT = { dusk: navScreen('dusk'), night: navScreen('night') };
  const materials = {
    paint: std({ map: dirtyPaint(), roughness: 0.42, metalness: 0.05 }),
    alu: std({ color: 0xb7b9b5, roughness: 0.38, metalness: 0.75 }),
    plastic: std({ roughness: 0.75 }),
    bumper: std({ roughness: 0.7 }),
    chrome: std({ color: 0xd8dad6, roughness: 0.22, metalness: 1 }),
    rubber: std({ roughness: 0.9 }),
    rim: std({ roughness: 0.5, metalness: 0.6 }),
    glass: std({ color: 0x22282c, transparent: true, opacity: 0.32, roughness: 0.05, metalness: 0.4, side: THREE.DoubleSide, depthWrite: false }),
    mirror: std({ color: 0x6a7276, roughness: 0.05, metalness: 1, envMapIntensity: 1.4 }),
    headLens: std({ color: 0xf4f2e8, emissive: 0xfff1d0, emissiveIntensity: 2.2, roughness: 0.15 }),
    amberLens: std({ color: 0xe08a1c, emissive: 0xff8a10, emissiveIntensity: 0.25, roughness: 0.2 }),
    tailLens: std({ color: 0x9a1a14, emissive: 0xff2a1a, emissiveIntensity: 0.9, roughness: 0.2 }),
    beacon: std({ color: 0xff8a10, emissive: 0xff7a00, emissiveIntensity: 0.6, transparent: true, opacity: 0.85, roughness: 0.15 }),
    boxSide: std({ map: boxSide(), roughness: 0.55, metalness: 0.15 }),
    boxBack: std({ map: boxBack(), roughness: 0.55, metalness: 0.15 }),
    trim: std({ roughness: 0.85, side: THREE.DoubleSide, envMapIntensity: 0.12 }),
    fabric: std({ roughness: 1, envMapIntensity: 0.12 }),
    wheel: std({ roughness: 0.6, envMapIntensity: 0.15 }),
    wood: std({ roughness: 0.8, envMapIntensity: 0.15 }),
    gauges: std({ map: gauges(), emissive: 0xffffff, emissiveMap: null, emissiveIntensity: 0.4, roughness: 0.3 }),
    climate: std({ map: climate(), emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.5 }),
    nav: std({ map: navT.dusk, emissive: 0xffffff, emissiveIntensity: 0.8, roughness: 0.3 }),
    lcd: std({ map: lcd, emissive: 0xffffff, emissiveIntensity: 1.0, roughness: 0.3 }),
    paper: std({ map: workOrder(), roughness: 0.95, envMapIntensity: 0.2 }),
  };
  for (const k of ['gauges', 'climate', 'nav', 'lcd']) materials[k].emissiveMap = materials[k].map;
  const meshes = B.build(materials, group, new Set(['paint', 'alu', 'plastic', 'bumper', 'boxSide', 'boxBack', 'trim', 'fabric', 'wheel']));
  for (const m of meshes) if (m.userData.dressMat === 'glass') { m.renderOrder = 3; m.castShadow = false; }

  // wheels as their own meshes so they can turn
  const wheels = wheelParts.map((w) => {
    const wb = new P.Batch();
    for (const [mat, g, col] of w.parts) wb.add(mat, 'w', g, col);
    const piv = new THREE.Group(); piv.position.set(w.x, WHEEL_R, w.z);      // rolls about x
    const axle = new THREE.Group(); axle.rotation.z = -w.s * Math.PI / 2; piv.add(axle);
    wb.build(materials, axle, new Set(['rubber', 'rim', 'plastic']));
    group.add(piv);
    return piv;
  });

  // beacon reflector and light
  const refl = new THREE.Mesh(new THREE.PlaneGeometry(0.1, 0.07), new THREE.MeshBasicMaterial({ color: 0xffb04a, side: THREE.DoubleSide, transparent: true, opacity: 0.9 }));
  refl.position.set(0, 2.12, 1.62); group.add(refl);
  const beaconLight = new THREE.PointLight(0xff8a20, 0, 9, 2); beaconLight.position.set(0, 2.2, 1.62); group.add(beaconLight);
  // headlamps
  const heads = [1, -1].map((s) => {
    const l = new THREE.SpotLight(0xfff0d6, 120, 55, 0.42, 0.55, 1.4);
    l.position.set(s * 0.585, 0.95, 2.45); l.target.position.set(s * 0.9, 0.0, 14); group.add(l, l.target);
    return l;
  });
  // a dim glow from the gauges and screens, so the cab isn't pitch black at night
  const glow = new THREE.PointLight(0xffb27a, 0, 1.6, 2); glow.position.set(0.05, 1.25, 1.75); group.add(glow);
  // at dusk, warm light bouncing round the cab from the low sun ahead
  const bounce = new THREE.PointLight(0xffb07a, 0, 2.6, 1.5); bounce.position.set(0.1, 1.75, 1.75); group.add(bounce);

  let t = 0, ringing = true;
  return {
    group, wheels, eye: DRIVER_EYE.clone(), heads, radio: new V3(-0.42, 1.33, 1.95),
    setTime(mode) {
      const night = mode === 'night';
      materials.gauges.emissiveIntensity = night ? 1.1 : 0.35;
      materials.climate.emissiveIntensity = night ? 0.5 : 0.1;
      materials.nav.map = materials.nav.emissiveMap = navT[mode]; materials.nav.emissiveIntensity = night ? 0.9 : 0.75; materials.nav.needsUpdate = true;
      glow.intensity = night ? 0.25 : 0; bounce.intensity = night ? 0 : 1.6;
      for (const h of heads) h.intensity = night ? 120 : 60;
    },
    setRinging(on) { ringing = on; },
    // dt in s, speed in m/s: turn wheels, spin the beacon, blink the radio while it rings
    update(dt, speed = 0) {
      t += dt;
      for (const w of wheels) w.rotation.x += (speed / WHEEL_R) * dt;
      refl.rotation.y = t * 7;
      const flash = Math.max(0, Math.cos(t * 7)) ** 4;
      beaconLight.intensity = 2.5 * flash; materials.beacon.emissiveIntensity = 0.5 + 1.2 * flash;
      const on = !ringing || Math.floor(t * 3) % 2 === 0;
      if (on !== lcd.userData.on) { lcd.userData.on = on; lcd.userData.draw(on); }
      materials.lcd.emissiveIntensity = on ? 1.4 : 0.4;
    },
  };
}
