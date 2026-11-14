// Painted textures for props: cardboard, pallet wood, painted metal, drums, sacks,
// Korean factory signage, and a decal sheet of stains/cracks/marks.
import * as THREE from 'three';
import { rng, canvas, texFrom, noiseCanvas } from './surface.js';

const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function heightToData(hC, strength, roughFn) {
  const W = hC.width, H = hC.height, hd = hC.getContext('2d').getImageData(0, 0, W, H).data;
  const out = canvas(W, H), g = out.getContext('2d'), img = g.createImageData(W, H), d = img.data;
  const h = (x, y) => hd[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const nx = -(h(x + 1, y) - h(x - 1, y)) * strength, ny = (h(x, y + 1) - h(x, y - 1)) * strength, l = Math.hypot(nx, ny, 1);
    const i = (y * W + x) * 4;
    d[i] = (nx / l * 0.5 + 0.5) * 255; d[i + 1] = (ny / l * 0.5 + 0.5) * 255; d[i + 2] = 255; d[i + 3] = 255;
    if (roughFn) d[i + 1] = d[i + 1]; // (green kept as normal y)
  }
  g.putImageData(img, 0, 0);
  return out;
}
const grain = (g, W, H, n, a, light = false, R = Math.random) => {
  for (let i = 0; i < n; i++) { g.fillStyle = light ? `rgba(255,250,235,${a * R()})` : `rgba(20,15,10,${a * R()})`; g.fillRect(R() * W, R() * H, 1 + R() * 2, 1 + R() * 2); }
};
const soft = (g, x, y, r, rgb, a) => { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(${rgb},${a})`); gr.addColorStop(1, `rgba(${rgb},0)`); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); };

// ---------------------------------------------------------------- cardboard: 4 x 2 cells of 256
// cells: 0 plain, 1 '취급주의', 2 'KX-7 원료', 3 '↑↑ 화기엄금', 4 top with tape, 5 top tape cross, 6 water-damaged, 7 label sheet
export function cardboard() {
  const W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d'), R = rng(21);
  const hC = canvas(512, 256), hg = hC.getContext('2d');
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, 512, 256);
  for (let cell = 0; cell < 8; cell++) {
    const x0 = (cell % 4) * 256, y0 = Math.floor(cell / 4) * 256;
    const base = ['#b08a5c', '#a98455', '#b58f60', '#a7835a', '#ad895b', '#b28c5d', '#9a7a52', '#ab865a'][cell];
    g.fillStyle = base; g.fillRect(x0, y0, 256, 256);
    // corrugation shows as faint vertical lines; fibres
    for (let k = 0; k < 256; k += 4) { g.fillStyle = `rgba(80,55,30,${0.04 + R() * 0.03})`; g.fillRect(x0 + k, y0, 1.5, 256); }
    grain(g, 256, 256, 0, 0);
    for (let i = 0; i < 900; i++) { g.fillStyle = `rgba(${R() < 0.5 ? '60,40,20' : '220,190,150'},${R() * 0.12})`; g.fillRect(x0 + R() * 256, y0 + R() * 256, 1 + R() * 3, 1); }
    g.save(); g.translate(x0, y0); g.beginPath(); g.rect(0, 0, 256, 256); g.clip();
    g.textAlign = 'center'; g.textBaseline = 'middle';
    const ink = 'rgba(35,30,28,0.78)';
    if (cell === 1) { g.fillStyle = ink; g.font = `900 40px ${FONT}`; g.fillText('취급주의', 128, 92); g.lineWidth = 6; g.strokeStyle = ink; g.strokeRect(40, 140, 176, 70); g.font = `700 26px ${FONT}`; g.fillText('FRAGILE', 128, 175); }
    if (cell === 2) { g.fillStyle = ink; g.font = `900 46px ${FONT}`; g.fillText('KX-7', 128, 78); g.font = `700 24px ${FONT}`; g.fillText('살충제 원료', 128, 128); g.fillText('25 kg', 128, 160); g.font = `500 15px ${FONT}`; g.fillText('LOT 2019-0412', 128, 205); g.fillStyle = 'rgba(180,30,25,0.8)'; g.fillRect(28, 222, 200, 10); }
    if (cell === 3) {
      g.fillStyle = ink; g.strokeStyle = ink; g.lineWidth = 9;
      for (const ax of [96, 160]) { g.beginPath(); g.moveTo(ax, 150); g.lineTo(ax, 70); g.stroke(); g.beginPath(); g.moveTo(ax - 22, 92); g.lineTo(ax, 64); g.lineTo(ax + 22, 92); g.fill(); }
      g.font = `900 28px ${FONT}`; g.fillText('화기엄금', 128, 200);
    }
    if (cell === 4 || cell === 5) {
      // brown packing tape across the top
      g.fillStyle = 'rgba(150,100,45,0.85)'; g.fillRect(0, 104, 256, 48);
      g.fillStyle = 'rgba(255,230,180,0.18)'; g.fillRect(0, 108, 256, 6);
      if (cell === 5) { g.fillStyle = 'rgba(150,100,45,0.85)'; g.fillRect(104, 0, 48, 256); }
      g.fillStyle = 'rgba(40,25,10,0.35)'; g.fillRect(0, 127, 256, 2);       // the flap seam under the tape
    }
    if (cell === 6) { for (let i = 0; i < 6; i++) soft(g, R() * 256, 120 + R() * 140, 40 + R() * 70, '70,45,20', 0.35); g.strokeStyle = 'rgba(60,40,20,0.4)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 120 + R() * 30); for (let x = 0; x <= 256; x += 16) g.lineTo(x, 125 + Math.sin(x * 0.07) * 12); g.stroke(); }
    if (cell === 7) { g.fillStyle = '#efe9dc'; g.fillRect(52, 60, 152, 110); g.fillStyle = ink; g.font = `700 18px ${FONT}`; g.textAlign = 'left'; g.fillText('출고: 3동', 64, 84); g.fillText('수량: 40', 64, 110); g.fillText('보관: 냉암소', 64, 136); for (let i = 0; i < 22; i++) g.fillRect(64 + i * 6, 150, R() < 0.5 ? 2 : 4, 14); }
    // grime and scuffs on every face
    for (let i = 0; i < 4; i++) soft(g, R() * 256, R() * 256, 30 + R() * 80, '50,35,20', 0.08 + R() * 0.12);
    g.restore();
    // creases for the crumpled look (height)
    const hx = x0 / 2, hy = y0 / 2;
    hg.save(); hg.beginPath(); hg.rect(hx, hy, 128, 128); hg.clip();
    for (let i = 0; i < 7; i++) {
      const a = R() * Math.PI, cx = hx + R() * 128, cy = hy + R() * 128, L = 40 + R() * 90;
      hg.strokeStyle = R() < 0.5 ? 'rgba(40,40,40,0.8)' : 'rgba(200,200,200,0.8)'; hg.lineWidth = 1 + R() * 2;
      hg.beginPath(); hg.moveTo(cx - Math.cos(a) * L, cy - Math.sin(a) * L); hg.lineTo(cx + Math.cos(a) * L, cy + Math.sin(a) * L); hg.stroke();
    }
    hg.restore();
  }
  const map = texFrom(c, true, false); map.anisotropy = 4;
  const nrm = texFrom(heightToData(hC, 3), false, false);
  return { map, normal: nrm, cell: (i) => [(i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 2, 0.25, 0.5] };
}

// ---------------------------------------------------------------- pallet wood
export function wood() {
  const W = 512, c = canvas(W), g = c.getContext('2d'), R = rng(31);
  g.fillStyle = '#9c7d55'; g.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y += 2) { g.fillStyle = `rgba(${R() < 0.5 ? '70,50,30' : '190,160,120'},${0.05 + R() * 0.12})`; g.fillRect(0, y, W, 1 + R() * 2); }
  for (let i = 0; i < 18; i++) { const x = R() * W, y = R() * W; g.fillStyle = 'rgba(60,40,22,0.6)'; g.beginPath(); g.ellipse(x, y, 6 + R() * 8, 3 + R() * 3, 0, 0, 7); g.fill(); }
  const n = noiseCanvas(64, 4, 33); g.globalAlpha = 0.35; g.globalCompositeOperation = 'multiply'; g.drawImage(n, 0, 0, W, W); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  for (let i = 0; i < 10; i++) soft(g, R() * W, R() * W, 40 + R() * 90, '35,30,25', 0.25);
  return texFrom(c, true);
}

// ---------------------------------------------------------------- painted metal: neutral paint that vertex colour tints, scratches, rust
export function paintedMetal() {
  const W = 512, c = canvas(W), g = c.getContext('2d'), R = rng(41);
  const hC = canvas(256), hg = hC.getContext('2d');
  g.fillStyle = '#d8d8d8'; g.fillRect(0, 0, W, W);
  hg.fillStyle = '#808080'; hg.fillRect(0, 0, 256, 256);
  const n = noiseCanvas(64, 4, 43); g.globalAlpha = 0.25; g.globalCompositeOperation = 'multiply'; g.drawImage(n, 0, 0, W, W); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
  // rust patches (they break through the paint: drawn in rust colour, which vertex paint colour will darken)
  for (let i = 0; i < 7; i++) {
    const x = R() * W, y = R() * W, r = 4 + R() * 22;
    soft(g, x, y, r * 1.6, '120,70,40', 0.2);
    g.fillStyle = `rgba(${90 + R() * 40},${45 + R() * 20},${20},0.8)`;
    for (let k = 0; k < 30; k++) { g.beginPath(); g.arc(x + (R() - 0.5) * r, y + (R() - 0.5) * r, 1 + R() * r * 0.25, 0, 7); g.fill(); }
    hg.fillStyle = 'rgba(160,160,160,0.6)'; for (let k = 0; k < 12; k++) { hg.beginPath(); hg.arc((x + (R() - 0.5) * r) / 2, (y + (R() - 0.5) * r) / 2, 1 + R() * 3, 0, 7); hg.fill(); }
    // rust running down
    const gr = g.createLinearGradient(0, y, 0, y + r * 4); gr.addColorStop(0, 'rgba(110,55,20,0.25)'); gr.addColorStop(1, 'rgba(110,55,20,0)'); g.fillStyle = gr; g.fillRect(x - r * 0.2, y, r * 0.4, r * 4);
  }
  // scratches to bare metal
  for (let i = 0; i < 160; i++) {
    const x = R() * W, y = R() * W, a = R() * Math.PI, l = 4 + R() * 30;
    g.strokeStyle = `rgba(250,250,250,${0.2 + R() * 0.4})`; g.lineWidth = 0.8 + R();
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + Math.cos(a) * l, y + Math.sin(a) * l); g.stroke();
    hg.strokeStyle = 'rgba(60,60,60,0.7)'; hg.lineWidth = 0.8; hg.beginPath(); hg.moveTo(x / 2, y / 2); hg.lineTo((x + Math.cos(a) * l) / 2, (y + Math.sin(a) * l) / 2); hg.stroke();
  }
  for (let i = 0; i < 4; i++) soft(g, R() * W, R() * W, 50 + R() * 80, '40,36,30', 0.18);
  return { map: texFrom(c, true), normal: texFrom(heightToData(hC, 2), false) };
}

// ---------------------------------------------------------------- drums: 4 designs side by side, wrapped round a cylinder
export function drums() {
  const W = 1024, H = 512, c = canvas(W, H), g = c.getContext('2d'), R = rng(51);
  const designs = [
    { body: '#1f4f8a', label: '#f2f0e8', title: 'KX-7 원액', sub: '독성 · 취급주의', icon: 'skull' },
    { body: '#c9a21c', label: '#1b1b1b', title: '살충제', sub: '200 L', icon: 'flame', stripe: true },
    { body: '#2f5a33', label: '#f2f0e8', title: '중화제', sub: 'NEUTRALIZER', icon: 'drop' },
    { body: '#7a2a1c', label: '#f2f0e8', title: '폐기물', sub: '폐액 · 반출금지', icon: 'skull' },
  ];
  designs.forEach((d, k) => {
    const x0 = k * 256;
    g.fillStyle = d.body; g.fillRect(x0, 0, 256, H);
    // rolling hoops (raised bands drawn as shading at 1/3 and 2/3)
    for (const y of [H / 3, (2 * H) / 3]) { g.fillStyle = 'rgba(255,255,255,0.12)'; g.fillRect(x0, y - 6, 256, 4); g.fillStyle = 'rgba(0,0,0,0.3)'; g.fillRect(x0, y + 2, 256, 6); }
    if (d.stripe) { g.fillStyle = '#1b1b1b'; g.fillRect(x0, H * 0.12, 256, 26); g.fillRect(x0, H * 0.86, 256, 26); }
    // label on the "front" half
    g.save(); g.translate(x0, 0);
    g.fillStyle = d.label; g.fillRect(36, 190, 120, 130);
    g.fillStyle = d.label === '#1b1b1b' ? '#c9a21c' : '#1b1b1b';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = `900 24px ${FONT}`; g.fillText(d.title, 96, 220);
    g.font = `600 13px ${FONT}`; g.fillText(d.sub, 96, 246);
    // hazard diamond
    g.save(); g.translate(96, 288); g.rotate(Math.PI / 4); g.fillStyle = '#fff'; g.fillRect(-18, -18, 36, 36); g.strokeStyle = '#c4231c'; g.lineWidth = 4; g.strokeRect(-18, -18, 36, 36); g.restore();
    g.fillStyle = '#1b1b1b'; g.beginPath(); g.arc(96, 285, 7, 0, 7); g.fill(); g.fillRect(91, 290, 10, 6);
    g.restore();
    // rust and grime
    for (let i = 0; i < 20; i++) soft(g, x0 + R() * 256, R() * H, 10 + R() * 40, '110,55,22', 0.18 + R() * 0.3);
    for (let i = 0; i < 25; i++) { const x = x0 + R() * 256, y = R() * H * 0.5; const gr = g.createLinearGradient(0, y, 0, y + 80 + R() * 160); gr.addColorStop(0, 'rgba(90,50,20,0.35)'); gr.addColorStop(1, 'rgba(90,50,20,0)'); g.fillStyle = gr; g.fillRect(x, y, 2 + R() * 5, 240); }
    for (let i = 0; i < 120; i++) { g.strokeStyle = `rgba(230,230,225,${0.15 + R() * 0.3})`; g.lineWidth = 1; const x = x0 + R() * 256, y = R() * H; g.beginPath(); g.moveTo(x, y); g.lineTo(x + (R() - 0.5) * 20, y + (R() - 0.5) * 6); g.stroke(); }
    const gr = g.createLinearGradient(0, H * 0.8, 0, H); gr.addColorStop(0, 'rgba(30,25,20,0)'); gr.addColorStop(1, 'rgba(30,25,20,0.6)'); g.fillStyle = gr; g.fillRect(x0, 0, 256, H);
  });
  return texFrom(c, true, false);
}

// ---------------------------------------------------------------- woven sacks
export function sack() {
  const W = 512, c = canvas(W), g = c.getContext('2d'), R = rng(61);
  g.fillStyle = '#d9d4c4'; g.fillRect(0, 0, W, W);
  for (let y = 0; y < W; y += 3) { g.fillStyle = 'rgba(120,110,90,0.12)'; g.fillRect(0, y, W, 1); }
  for (let x = 0; x < W; x += 3) { g.fillStyle = 'rgba(120,110,90,0.08)'; g.fillRect(x, 0, 1, W); }
  g.fillStyle = 'rgba(40,70,140,0.85)'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = `900 64px ${FONT}`; g.fillText('살충제 원료', 256, 200);
  g.font = `700 40px ${FONT}`; g.fillText('KX-7 분말 · 20kg', 256, 280);
  g.fillStyle = 'rgba(190,40,30,0.85)'; g.fillRect(60, 330, 392, 18);
  for (let i = 0; i < 12; i++) soft(g, R() * W, R() * W, 30 + R() * 90, '80,70,50', 0.2);
  for (let i = 0; i < 5; i++) soft(g, R() * W, R() * W, 20 + R() * 40, '240,240,235', 0.5);   // powder dusted on it
  return texFrom(c, true);
}

// ---------------------------------------------------------------- signage sheet: 4 x 4 cells of 256
// 0 안전제일 · 1 관계자외 출입금지 · 2 독성물질 · 3 보호구 착용 · 4 비상구 · 5 화기엄금 · 6 무재해 판 · 7 실험실 3 (생물위해)
// 8 화이트보드 · 9 계기판 · 10 제어반 · 11 구역 A · 12 구역 B · 13 생산 2라인 · 14 하역장 · 15 소화기
export function signs() {
  const W = 1024, c = canvas(W), g = c.getContext('2d'), R = rng(71);
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 256, Math.floor(i / 4) * 256); g.beginPath(); g.rect(0, 0, 256, 256); g.clip(); fn(); g.restore(); };
  const center = () => { g.textAlign = 'center'; g.textBaseline = 'middle'; };
  const age = () => {
    for (let i = 0; i < 8; i++) soft(g, R() * 256, R() * 256, 20 + R() * 70, '60,50,35', 0.15 + R() * 0.2);
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.25})`; g.fillRect(R() * 256, R() * 256, 1 + R() * 4, 1 + R() * 2); }
    const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(90,60,30,0.0)'); gr.addColorStop(1, 'rgba(90,60,30,0.25)'); g.fillStyle = gr; g.fillRect(0, 0, 256, 256);
  };
  cell(0, () => { g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#1f8a3c'; g.fillRect(98, 40, 60, 140); g.fillRect(58, 80, 140, 60); center(); g.fillStyle = '#1b1b1b'; g.font = `900 40px ${FONT}`; g.fillText('안전제일', 128, 220); age(); });
  cell(1, () => { g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#c42a1e'; g.fillRect(0, 0, 256, 70); center(); g.fillStyle = '#fff'; g.font = `900 40px ${FONT}`; g.fillText('경 고', 128, 36); g.fillStyle = '#1b1b1b'; g.font = `900 34px ${FONT}`; g.fillText('관계자 외', 128, 130); g.fillText('출입금지', 128, 180); age(); });
  cell(2, () => { g.fillStyle = '#f0c419'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#1b1b1b'; g.beginPath(); g.moveTo(128, 22); g.lineTo(226, 176); g.lineTo(30, 176); g.closePath(); g.lineWidth = 12; g.strokeStyle = '#1b1b1b'; g.stroke(); center(); g.font = `900 70px ${FONT}`; g.fillText('!', 128, 120); g.font = `900 30px ${FONT}`; g.fillText('독성물질', 128, 214); age(); });
  cell(3, () => { g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#1d5fb0'; g.beginPath(); g.arc(128, 100, 72, 0, 7); g.fill(); g.fillStyle = '#fff'; g.beginPath(); g.arc(128, 86, 26, 0, 7); g.fill(); g.fillRect(96, 108, 64, 34); g.fillStyle = '#1d5fb0'; g.fillRect(104, 112, 48, 14); center(); g.fillStyle = '#1b1b1b'; g.font = `900 34px ${FONT}`; g.fillText('보호구 착용', 128, 214); age(); });
  cell(4, () => {
    g.fillStyle = '#138a3a'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#e8fff0';
    // running figure toward a door
    g.fillRect(170, 40, 60, 120); g.fillStyle = '#138a3a'; g.fillRect(178, 48, 44, 104);
    g.fillStyle = '#e8fff0'; g.beginPath(); g.arc(112, 52, 15, 0, 7); g.fill();
    g.lineWidth = 16; g.lineCap = 'round'; g.strokeStyle = '#e8fff0';
    g.beginPath(); g.moveTo(108, 72); g.lineTo(96, 120); g.lineTo(130, 150); g.moveTo(96, 120); g.lineTo(70, 150); g.moveTo(104, 84); g.lineTo(140, 96); g.moveTo(104, 84); g.lineTo(76, 100); g.stroke();
    center(); g.font = `900 46px ${FONT}`; g.fillText('비상구', 128, 210); age();
  });
  cell(5, () => { g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#c42a1e'; g.lineWidth = 16; g.beginPath(); g.arc(128, 100, 70, 0, 7); g.stroke(); g.fillStyle = '#e07a1a'; g.beginPath(); g.moveTo(128, 50); g.quadraticCurveTo(170, 110, 128, 150); g.quadraticCurveTo(86, 110, 128, 50); g.fill(); g.beginPath(); g.moveTo(78, 50); g.lineTo(178, 150); g.stroke(); center(); g.fillStyle = '#1b1b1b'; g.font = `900 38px ${FONT}`; g.fillText('화기엄금', 128, 214); age(); });
  cell(6, () => { g.fillStyle = '#1e3f74'; g.fillRect(0, 0, 256, 256); center(); g.fillStyle = '#fff'; g.font = `900 30px ${FONT}`; g.fillText('무재해 운동', 128, 40); g.fillStyle = '#111'; g.fillRect(28, 76, 200, 92); g.fillStyle = '#ff5a3a'; g.font = `700 60px ui-monospace, monospace`; g.fillText('1284', 128, 124); g.fillStyle = '#fff'; g.font = `700 22px ${FONT}`; g.fillText('일째 무사고', 128, 196); g.font = `500 15px ${FONT}`; g.fillText('2019. 04. 12 기준', 128, 228); age(); });
  cell(7, () => { g.fillStyle = '#f3f1ea'; g.fillRect(0, 0, 256, 256); g.fillStyle = '#e6b800'; g.fillRect(0, 0, 256, 90); center(); g.fillStyle = '#1b1b1b'; g.font = `900 26px ${FONT}`; g.fillText('생물위해', 128, 46); g.font = `900 34px ${FONT}`; g.fillText('실험실 3', 128, 140); g.font = `600 18px ${FONT}`; g.fillText('생물안전 2등급', 128, 180); g.fillText('승인자 외 출입금지', 128, 210); age(); });
  cell(8, () => {
    g.fillStyle = '#ecece6'; g.fillRect(0, 0, 256, 256); g.strokeStyle = '#8a8a8a'; g.lineWidth = 8; g.strokeRect(0, 0, 256, 256);
    g.fillStyle = '#22408a'; g.font = `700 17px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    g.fillText('KX-7 투여 4주차', 16, 34); g.fillText('개체 크기 +40% ??', 16, 60); g.fillText('빛 회피 ↑ / 소리 반응 ↑', 16, 86);
    g.fillStyle = '#b02020'; g.fillText('절대 단독 근무 금지', 16, 236);
    g.strokeStyle = '#22408a'; g.lineWidth = 2; g.beginPath(); g.ellipse(150, 160, 40, 22, 0.2, 0, 7); g.stroke();
    for (let i = 0; i < 3; i++) for (const s of [-1, 1]) { g.beginPath(); g.moveTo(150 + i * 18 - 18, 160 + s * 18); g.lineTo(150 + i * 22 - 26, 160 + s * 40); g.stroke(); }
    g.beginPath(); g.moveTo(190, 152); g.lineTo(236, 120); g.moveTo(190, 166); g.lineTo(238, 182); g.stroke();
    g.fillStyle = 'rgba(80,80,80,0.15)'; for (let i = 0; i < 6; i++) g.fillRect(R() * 200, R() * 200, 60 + R() * 60, 14);   // ghosts of erased writing
  });
  cell(9, () => { g.fillStyle = '#2a2a28'; g.fillRect(0, 0, 256, 256); for (const [cx, cy] of [[70, 80], [186, 80], [70, 190], [186, 190]]) { g.fillStyle = '#e8e4d8'; g.beginPath(); g.arc(cx, cy, 46, 0, 7); g.fill(); g.strokeStyle = '#111'; g.lineWidth = 2; for (let k = 0; k <= 10; k++) { const a = Math.PI * 0.75 + (k / 10) * Math.PI * 1.5; g.beginPath(); g.moveTo(cx + Math.cos(a) * 38, cy + Math.sin(a) * 38); g.lineTo(cx + Math.cos(a) * 44, cy + Math.sin(a) * 44); g.stroke(); } g.strokeStyle = '#c42a1e'; g.lineWidth = 3; const a = Math.PI * 0.75 + R() * Math.PI * 0.4; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * 36, cy + Math.sin(a) * 36); g.stroke(); g.fillStyle = 'rgba(255,255,255,0.25)'; g.beginPath(); g.ellipse(cx - 14, cy - 18, 20, 10, -0.5, 0, 7); g.fill(); } age(); });
  cell(10, () => { g.fillStyle = '#9ba3a6'; g.fillRect(0, 0, 256, 256); const cols = ['#c42a1e', '#1f8a3c', '#e6b800', '#1b1b1b']; for (let i = 0; i < 4; i++) for (let j = 0; j < 3; j++) { g.fillStyle = '#333'; g.fillRect(24 + i * 56, 30 + j * 64, 40, 40); g.fillStyle = cols[(i + j) % 4]; g.beginPath(); g.arc(44 + i * 56, 50 + j * 64, 13, 0, 7); g.fill(); g.fillStyle = '#eee'; g.fillRect(24 + i * 56, 74 + j * 64, 40, 8); } g.fillStyle = '#111'; g.fillRect(24, 226, 208, 18); g.fillStyle = '#5aff7a'; g.font = '12px ui-monospace, monospace'; g.textAlign = 'left'; g.fillText('ERR 07  PUMP-2 FAIL', 30, 239); age(); });
  cell(11, () => { g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, 256, 256); center(); g.fillStyle = '#e6b800'; g.font = `900 150px ${FONT}`; g.fillText('A', 128, 120); g.font = `900 34px ${FONT}`; g.fillText('구역 A-01', 128, 220); age(); });
  cell(12, () => { g.fillStyle = '#2a2a2a'; g.fillRect(0, 0, 256, 256); center(); g.fillStyle = '#e6b800'; g.font = `900 150px ${FONT}`; g.fillText('B', 128, 120); g.font = `900 34px ${FONT}`; g.fillText('구역 B-02', 128, 220); age(); });
  cell(13, () => { g.fillStyle = '#d8d4ca'; g.fillRect(0, 0, 256, 256); center(); g.fillStyle = '#1e3f74'; g.font = `900 52px ${FONT}`; g.fillText('생산', 128, 80); g.fillText('2라인', 128, 150); g.fillStyle = '#c42a1e'; g.fillRect(30, 200, 196, 12); age(); });
  cell(14, () => { g.fillStyle = '#f0c419'; g.fillRect(0, 0, 256, 256); for (let i = -4; i < 8; i++) { g.fillStyle = '#1b1b1b'; g.beginPath(); g.moveTo(i * 40, 256); g.lineTo(i * 40 + 20, 256); g.lineTo(i * 40 + 60, 200); g.lineTo(i * 40 + 40, 200); g.fill(); } center(); g.fillStyle = '#1b1b1b'; g.font = `900 46px ${FONT}`; g.fillText('하역장', 128, 80); g.font = `700 26px ${FONT}`; g.fillText('적재하중 2t', 128, 140); age(); });
  cell(15, () => { g.fillStyle = '#c42a1e'; g.fillRect(0, 0, 256, 256); center(); g.fillStyle = '#fff'; g.font = `900 48px ${FONT}`; g.fillText('소화기', 128, 128); g.lineWidth = 6; g.strokeStyle = '#fff'; g.strokeRect(20, 20, 216, 216); age(); });
  const t = texFrom(c, true, false); t.anisotropy = 8;
  return { map: t, cell: (i) => [(i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 4, 0.25, 0.25] };
}

// ---------------------------------------------------------------- decals: 4 x 4 cells, alpha
// 0 oil · 1 water ring · 2 green chemical · 3 rust · 4 crack · 5 boot prints · 6 drag marks · 7 burn
// 8 squashed bug · 9 scrawl '나가' · 10 handprint · 11 mould · 12 hazard stripes · 13 drain grate · 14 powder spill · 15 dirt
export function decals() {
  const W = 1024, c = canvas(W), g = c.getContext('2d'), R = rng(81);
  const cell = (i, fn) => { g.save(); g.translate((i % 4) * 256, Math.floor(i / 4) * 256); g.beginPath(); g.rect(2, 2, 252, 252); g.clip(); fn(); g.restore(); };
  const splotch = (cx, cy, r, rgb, a, n = 9) => { for (let k = 0; k < n; k++) { const x = cx + (R() - 0.5) * r, y = cy + (R() - 0.5) * r, rr = r * (0.2 + R() * 0.45); soft(g, x, y, rr, rgb, a); } };
  cell(0, () => { splotch(128, 128, 150, '12,10,8', 0.55, 14); splotch(128, 128, 70, '5,4,3', 0.5, 6); });
  cell(1, () => { for (let k = 0; k < 3; k++) { g.strokeStyle = `rgba(70,60,45,${0.35 - k * 0.08})`; g.lineWidth = 6 - k; g.beginPath(); for (let a = 0; a <= 6.3; a += 0.1) { const r = 80 + k * 18 + Math.sin(a * 5 + k) * 8 + (R() - 0.5) * 4; const x = 128 + Math.cos(a) * r, y = 128 + Math.sin(a) * r * 0.85; a ? g.lineTo(x, y) : g.moveTo(x, y); } g.stroke(); } splotch(128, 128, 120, '60,50,40', 0.12, 8); });
  cell(2, () => { splotch(128, 128, 160, '70,110,30', 0.4, 16); splotch(128, 128, 90, '120,160,40', 0.35, 8); for (let k = 0; k < 40; k++) { g.fillStyle = 'rgba(150,190,60,0.5)'; g.beginPath(); g.arc(128 + (R() - 0.5) * 220, 128 + (R() - 0.5) * 220, 1 + R() * 4, 0, 7); g.fill(); } });
  cell(3, () => { splotch(128, 128, 160, '120,58,22', 0.45, 18); splotch(128, 128, 60, '80,35,12', 0.4, 6); });
  cell(4, () => { g.strokeStyle = 'rgba(15,12,10,0.85)'; for (let b = 0; b < 3; b++) { let x = 128, y = 128, a = R() * 6.28; g.lineWidth = 3 - b * 0.7; g.beginPath(); g.moveTo(x, y); for (let k = 0; k < 16; k++) { a += (R() - 0.5) * 1.1; x += Math.cos(a) * 9; y += Math.sin(a) * 9; g.lineTo(x, y); } g.stroke(); } });
  cell(5, () => { for (let k = 0; k < 6; k++) { const x = 70 + (k % 2) * 90, y = 230 - k * 40; g.save(); g.translate(x, y); g.rotate(-0.15 + (k % 2) * 0.1); g.fillStyle = 'rgba(25,20,15,0.55)'; g.beginPath(); g.ellipse(0, -12, 16, 22, 0, 0, 7); g.fill(); g.beginPath(); g.ellipse(0, 18, 13, 12, 0, 0, 7); g.fill(); g.restore(); } });
  cell(6, () => { for (let k = 0; k < 7; k++) { g.strokeStyle = `rgba(30,22,15,${0.2 + R() * 0.3})`; g.lineWidth = 2 + R() * 6; const x = 40 + k * 28 + (R() - 0.5) * 10; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 20, 80, x - 20, 160, x + 10, 256); g.stroke(); } });
  cell(7, () => { splotch(128, 128, 150, '10,8,6', 0.6, 12); splotch(128, 128, 200, '40,30,20', 0.2, 10); });
  cell(8, () => { splotch(128, 128, 80, '50,30,12', 0.6, 8); g.fillStyle = 'rgba(30,18,8,0.9)'; g.beginPath(); g.ellipse(128, 128, 22, 36, 0.3, 0, 7); g.fill(); g.strokeStyle = 'rgba(30,18,8,0.8)'; g.lineWidth = 3; for (let k = 0; k < 6; k++) { const a = k / 6 * 6.28 + R() * 0.4; g.beginPath(); g.moveTo(128, 128); g.lineTo(128 + Math.cos(a) * (50 + R() * 30), 128 + Math.sin(a) * (50 + R() * 30)); g.stroke(); } for (let k = 0; k < 30; k++) soft(g, 128 + (R() - 0.5) * 200, 128 + (R() - 0.5) * 200, 4 + R() * 8, '160,150,60', 0.5); });
  cell(9, () => { g.fillStyle = 'rgba(120,20,15,0.85)'; g.font = `900 120px ${FONT}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.save(); g.translate(128, 120); g.rotate(-0.12); g.fillText('나가', 0, 0); g.restore(); for (let k = 0; k < 8; k++) { const x = 40 + R() * 180; const gr = g.createLinearGradient(0, 150, 0, 256); gr.addColorStop(0, 'rgba(120,20,15,0.7)'); gr.addColorStop(1, 'rgba(120,20,15,0)'); g.fillStyle = gr; g.fillRect(x, 140, 3, 110); } });
  cell(10, () => { g.fillStyle = 'rgba(30,22,16,0.65)'; g.beginPath(); g.ellipse(128, 150, 40, 48, 0, 0, 7); g.fill(); for (let k = 0; k < 5; k++) { const a = -2.4 + k * 0.38; g.save(); g.translate(128 + Math.cos(a) * 60, 140 + Math.sin(a) * 70); g.rotate(a + Math.PI / 2); g.beginPath(); g.ellipse(0, 0, 9, k === 0 ? 24 : 32, 0, 0, 7); g.fill(); g.restore(); } const gr = g.createLinearGradient(0, 180, 0, 256); gr.addColorStop(0, 'rgba(30,22,16,0.5)'); gr.addColorStop(1, 'rgba(30,22,16,0)'); g.fillStyle = gr; g.fillRect(96, 180, 64, 76); });
  cell(11, () => { for (let k = 0; k < 400; k++) { const r = Math.pow(R(), 0.6) * 120, a = R() * 6.28; g.fillStyle = `rgba(${30 + R() * 25},${45 + R() * 25},${20},${0.15 + R() * 0.4})`; g.beginPath(); g.arc(128 + Math.cos(a) * r, 128 + Math.sin(a) * r, 1 + R() * 5, 0, 7); g.fill(); } });
  cell(12, () => { g.fillStyle = 'rgba(230,190,20,0.9)'; g.fillRect(0, 0, 256, 256); g.fillStyle = 'rgba(20,20,20,0.92)'; for (let i = -4; i < 8; i++) { g.beginPath(); g.moveTo(i * 64, 256); g.lineTo(i * 64 + 32, 256); g.lineTo(i * 64 + 288, 0); g.lineTo(i * 64 + 256, 0); g.fill(); } for (let k = 0; k < 400; k++) { g.clearRect(R() * 256, R() * 256, 1 + R() * 6, 1 + R() * 3); } });
  cell(13, () => { g.fillStyle = 'rgba(40,40,42,0.95)'; g.fillRect(8, 8, 240, 240); g.fillStyle = 'rgba(5,5,5,1)'; for (let k = 0; k < 9; k++) g.fillRect(24 + k * 24, 20, 12, 216); g.strokeStyle = 'rgba(120,70,30,0.6)'; g.lineWidth = 4; g.strokeRect(8, 8, 240, 240); });
  cell(14, () => { for (let k = 0; k < 1500; k++) { const r = Math.pow(R(), 0.8) * 115, a = R() * 6.28; g.fillStyle = `rgba(235,232,220,${0.1 + R() * 0.4})`; g.fillRect(128 + Math.cos(a) * r * 1.2, 128 + Math.sin(a) * r * 0.7, 1 + R() * 3, 1 + R() * 2); } splotch(128, 128, 90, '235,232,220', 0.35, 8); });
  cell(15, () => { splotch(128, 128, 180, '40,34,26', 0.28, 22); for (let k = 0; k < 300; k++) { g.fillStyle = `rgba(30,25,20,${R() * 0.5})`; g.fillRect(28 + R() * 200, 28 + R() * 200, 1 + R() * 3, 1 + R() * 3); } });
  const t = texFrom(c, true, false); t.anisotropy = 8;
  return { map: t, cell: (i) => [(i % 4) / 4, 1 - (Math.floor(i / 4) + 1) / 4, 0.25, 0.25] };
}

// paper sheet with typed lines
export function paper() {
  const c = canvas(256, 320), g = c.getContext('2d'), R = rng(91);
  g.fillStyle = '#ece6d6'; g.fillRect(0, 0, 256, 320);
  g.fillStyle = 'rgba(40,40,50,0.7)';
  for (let y = 40; y < 300; y += 14) { const w = 140 + R() * 80; if (R() < 0.85) g.fillRect(24, y, w, 3); }
  g.fillRect(24, 18, 120, 8);
  for (let i = 0; i < 5; i++) soft(g, R() * 256, R() * 320, 30 + R() * 60, '120,100,60', 0.2);
  return texFrom(c, true, false);
}

// wire mesh deck for racks / grates: alpha-tested grid
export function wireMesh() {
  const c = canvas(128), g = c.getContext('2d');
  g.clearRect(0, 0, 128, 128);
  g.fillStyle = '#ffffff';
  for (let k = 0; k < 128; k += 16) { g.fillRect(k, 0, 3, 128); g.fillRect(0, k, 128, 2); }
  return texFrom(c, true);
}
