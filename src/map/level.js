import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as S from './surface.js';

// All units are metres. +z runs from the loading dock (south) toward the hall (north).
export const ROOMS = {
  dock:     { name: '하역장',       x0: -7,  x1: 7,    z0: 0,  z1: 10, h: 6,   tint: '#b9b8b2' },
  ware:     { name: '창고 A',       x0: -12, x1: 12,   z0: 10, z1: 32, h: 7,   tint: '#b3b8c1' },
  machine:  { name: '기계실',       x0: 12,  x1: 22,   z0: 10, z1: 20, h: 4.5, tint: '#c2b9ab' },
  corridor: { name: '연결 복도',    x0: 16.5, x1: 20.5, z0: 20, z1: 46, h: 4,   tint: '#b1b0ad' },
  hall:     { name: '생산 라인 홀', x0: -6,  x1: 24,   z0: 46, z1: 70, h: 8,   tint: '#bdbbb4' },
  lab:      { name: '실험실',       x0: -20, x1: -6,   z0: 52, z1: 64, h: 4.5, tint: '#b1bdb5' },
  pass1:    { name: '비상 통로',    x0: -17, x1: -14,  z0: 27, z1: 52, h: 3.5, tint: '#aeaaa3' },
  pass2:    { name: '',             x0: -14, x1: -12,  z0: 27, z1: 30, h: 3.5, tint: '#aeaaa3' },
};

// openings in walls: axis 'z' = wall runs along x at z = at ; axis 'x' = wall runs along z at x = at
export const DOORS = [
  { a: 'dock', b: 'ware', axis: 'z', at: 10, from: -2.5, to: 2.5, h: 4.5 },
  { a: 'ware', b: 'machine', axis: 'x', at: 12, from: 14, to: 17, h: 3 },
  { a: 'machine', b: 'corridor', axis: 'z', at: 20, from: 17, to: 20, h: 3 },
  { a: 'corridor', b: 'hall', axis: 'z', at: 46, from: 16.5, to: 20.5, h: 4 },
  { a: 'hall', b: 'lab', axis: 'x', at: -6, from: 56, to: 59, h: 3 },
  { a: 'lab', b: 'pass1', axis: 'z', at: 52, from: -17, to: -14, h: 3, locked: 'emergency' },
  { a: 'pass1', b: 'pass2', axis: 'x', at: -14, from: 27, to: 30, h: 3.5 },
  { a: 'pass2', b: 'ware', axis: 'x', at: -12, from: 27, to: 30, h: 3 },
  { a: 'dock', b: null, axis: 'z', at: 0, from: -2.5, to: 2.5, h: 4.5, locked: 'shutter' },
];

export const SPOTS = {
  start: { x: 0, z: 3.0, yaw: 0 },
  generators: [
    { x: 19.6, z: 11.4, room: 'machine', yaw: Math.PI },
    { x: 2.5, z: 65.8, room: 'hall', yaw: 0 },
    { x: -18.6, z: 57.5, room: 'lab', yaw: -Math.PI / 2 },
  ],
  lamps: [
    { x: -2.5, z: 21.2, room: 'ware' },
    { x: 7.5, z: 52.5, room: 'hall' },
    { x: -9.5, z: 61.5, room: 'lab' },
    { x: -16.6, z: 40, room: 'pass1' },
  ],
  notes: [
    { x: 14.2, z: 18.6, y: 0.95, text: '[실험 일지 1]\nKX-7 노출 개체, 사멸하지 않음.\n오히려 크기 증가.' },
    { x: 20.5, z: 67.0, y: 0.95, text: '[실험 일지 2]\n개체들이 빛을 피한다.\n야간 근무자 전원 손전등 지참.' },
    { x: -12.0, z: 62.6, y: 0.95, text: '[실험 일지 3]\n지네 개체 탈출.\n3번 실험실 봉쇄.' },
  ],
  refill: { x: 18.5, z: 40.5 },
  redLights: { machine: { x: 17, y: 4.1, z: 19.6 }, hall: { x: 9, y: 7.4, z: 69.6 }, lab: { x: -13, y: 4.1, z: 63.6 } },
  // where each creature will live (greybox markers only)
  bugs: [
    { kind: 'roach', label: '바퀴 떼', x: -6.5, y: 0, z: 17.5, r: 1.6 },
    { kind: 'roach', label: '바퀴 떼', x: 5.5, y: 0, z: 28.5, r: 1.6 },
    { kind: 'roach', label: '바퀴 떼', x: 15.0, y: 0, z: 16.0, r: 1.3 },
    { kind: 'roach', label: '바퀴 떼', x: -15.5, y: 0, z: 34.5, r: 1.3 },
    { kind: 'ghost', label: '유령거미 (천장)', x: 18.5, y: 4, z: 30, r: 1.75 },
    { kind: 'web', label: '거미줄', x: 18.5, y: 0, z: 38, r: 0 },
    { kind: 'wolf', label: '늑대거미 (천장)', x: 12, y: 8, z: 57, r: 1.5 },
    { kind: 'centi', label: '지네 등장 환풍구', x: 15, y: 0, z: 69.6, r: 2.3 },
    { kind: 'eggs', label: '알집', x: -7.6, y: 4.5, z: 62.8, r: 0.9 },
  ],
};

export const STATIC_PROPS = {
  racks: [
    [-8.5, 13, 21], [-8.5, 23.5, 30.6], [-4.5, 14.5, 25.5], [-0.5, 13.6, 19], [-0.5, 22.5, 30.6],
    [3.5, 15.8, 27.5], [7.5, 12.4, 20.2], [7.5, 23, 30.6],
  ],
};

// ---------------------------------------------------------------- materials
function gridTexture(tint) {
  const N = 256, c = document.createElement('canvas');
  c.width = c.height = N;
  const x = c.getContext('2d');
  x.fillStyle = tint; x.fillRect(0, 0, N, N);
  // faint noise so surfaces read under the flashlight
  const img = x.getImageData(0, 0, N, N), d = img.data;
  for (let i = 0; i < d.length; i += 4) { const n = (Math.random() - 0.5) * 14; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  x.putImageData(img, 0, 0);
  x.strokeStyle = 'rgba(0,0,0,0.10)'; x.lineWidth = 1;
  for (let k = 1; k < 4; k++) { x.beginPath(); x.moveTo((k * N) / 4, 0); x.lineTo((k * N) / 4, N); x.moveTo(0, (k * N) / 4); x.lineTo(N, (k * N) / 4); x.stroke(); }
  x.strokeStyle = 'rgba(0,0,0,0.32)'; x.lineWidth = 3;
  x.strokeRect(0, 0, N, N);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

const matCache = new Map();
export function greyMat(tint) {
  if (!matCache.has(tint)) matCache.set(tint, new THREE.MeshStandardMaterial({ map: gridTexture(tint), roughness: 0.9, metalness: 0 }));
  return matCache.get(tint);
}

// box with uvs in metres so the 1 m grid stays square on every face
export function boxGeom(w, h, d, x, y, z) {
  const g = new THREE.BoxGeometry(w, h, d);
  const uv = g.attributes.uv;
  const dims = [[d, h], [d, h], [w, d], [w, d], [w, h], [w, h]];
  for (let f = 0; f < 6; f++) for (let k = 0; k < 4; k++) {
    const i = f * 4 + k;
    uv.setXY(i, uv.getX(i) * dims[f][0], uv.getY(i) * dims[f][1]);
  }
  g.translate(x, y, z);
  return g;
}

function planeGeom(w, d, x, y, z, down) {
  const g = new THREE.PlaneGeometry(w, d);
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
  g.rotateX(down ? Math.PI / 2 : -Math.PI / 2);
  g.translate(x, y, z);
  return g;
}

function label(text, size = 0.9) {
  const c = document.createElement('canvas');
  const ctx = c.getContext('2d');
  ctx.font = '600 64px "Noto Sans KR", sans-serif';
  const w = Math.ceil(ctx.measureText(text).width) + 40;
  c.width = w; c.height = 96;
  ctx.font = '600 64px "Noto Sans KR", sans-serif';
  ctx.fillStyle = 'rgba(0,0,0,0.0)'; ctx.fillRect(0, 0, w, 96);
  ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'middle'; ctx.fillText(text, 20, 50);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, transparent: true, opacity: 0.55, depthWrite: false, fog: true }));
  s.scale.set((w / 96) * size, size, 1);
  return s;
}

// ---------------------------------------------------------------- surfaces per room
let SURF = null;
function surfaces() {
  if (SURF) return SURF;
  const macro = S.macroNoise();
  const cf = S.concreteFloor(1), pw = S.paintedWall(3), wb = S.wallBand(5), rc = S.rawConcrete(7);
  const tf = S.tiles({ seed: 11, count: 8, base: '#c8c2b2', grout: '#6c675d', floor: true });
  const tw = S.tiles({ seed: 13, count: 16, base: '#e6e4dc', grout: '#a29e93' });
  const W = (o) => S.worldMaterial({ macro, ...o });
  const painted = (tint, bandTint, extra = {}) => W({ color: pw.color, data: pw.data, band: wb.color, bandData: wb.data, tint, bandTint, ...extra });
  SURF = {
    floor: {
      dock: W({ color: cf.color, data: cf.data, tint: 0xd8d4cc }),
      ware: W({ color: cf.color, data: cf.data, tint: 0xe4e0d8 }),
      machine: W({ color: cf.color, data: cf.data, tint: 0xb8b2a6, wet: 0.5 }),
      corridor: W({ color: tf.color, data: tf.data, tile: 2.4, tint: 0xd6d0c4 }),
      hall: W({ color: cf.color, data: cf.data, tint: 0xd0cdc4, wet: 0.35 }),
      lab: W({ color: tf.color, data: tf.data, tile: 2.4, tint: 0xf0eee8 }),
      pass1: W({ color: cf.color, data: cf.data, tint: 0xa8a49c, wet: 0.9 }),
      pass2: W({ color: cf.color, data: cf.data, tint: 0xa8a49c, wet: 0.9 }),
    },
    wall: {
      dock: W({ color: rc.color, data: rc.data, band: wb.color, bandData: wb.data, bandTint: 0x8a8d90, tint: 0xd8d4cc }),
      ware: painted(0xeef2f4, 0x7393b4),
      machine: painted(0xece2d0, 0x6f8c68),
      corridor: painted(0xdde8d9, 0x5f8a6c, { floorDirt: 0.45 }),
      hall: painted(0xdcdcd8, 0x81878b),
      lab: W({ color: tw.color, data: tw.data, tile: 2.4, tint: 0xffffff, floorDirt: 0.25 }),
      pass1: W({ color: rc.color, data: rc.data, tint: 0xbcb8b0, wet: 0.8, floorDirt: 0.6 }),
      pass2: W({ color: rc.color, data: rc.data, tint: 0xbcb8b0, wet: 0.8, floorDirt: 0.6 }),
    },
    ceil: W({ color: cf.color, data: cf.data, tint: 0x55524c, macroK: 0.6 }),
  };
  return SURF;
}

// ---------------------------------------------------------------- build
export function buildLevel(scene) {
  const T = 0.3;              // wall thickness
  const labels = new THREE.Group();
  labels.visible = false;
  scene.add(labels);
  const byMat = new Map();
  const colliders = [];       // xz AABBs { x0, x1, z0, z1, id? }
  const SF = surfaces();
  const add = (key, g) => { if (!byMat.has(key)) byMat.set(key, []); byMat.get(key).push(g); };
  const solid = (key, w, h, d, x, y, z, collide = true) => {
    if (key) add(key, boxGeom(w, h, d, x, y, z));
    if (collide) colliders.push({ x0: x - w / 2, x1: x + w / 2, z0: z - d / 2, z1: z + d / 2 });
  };

  for (const [key, r] of Object.entries(ROOMS)) {
    const w = r.x1 - r.x0, d = r.z1 - r.z0, cx = (r.x0 + r.x1) / 2, cz = (r.z0 + r.z1) / 2;
    add(`floor:${key}`, planeGeom(w, d, cx, 0, cz, false));
    add('ceil', planeGeom(w, d, cx, r.h, cz, true));
    const sides = [
      { axis: 'z', at: r.z0, a: r.x0, b: r.x1, inward: +1 },
      { axis: 'z', at: r.z1, a: r.x0, b: r.x1, inward: -1 },
      { axis: 'x', at: r.x0, a: r.z0, b: r.z1, inward: +1 },
      { axis: 'x', at: r.x1, a: r.z0, b: r.z1, inward: -1 },
    ];
    for (const s of sides) {
      const holes = DOORS.filter((dr) => (dr.a === key || dr.b === key) && dr.axis === s.axis && Math.abs(dr.at - s.at) < 1e-6)
        .map((dr) => ({ from: Math.max(dr.from, s.a), to: Math.min(dr.to, s.b), h: dr.h }))
        .filter((hh) => hh.to > hh.from)
        .sort((p, q) => p.from - q.from);
      const pieces = [];
      let cur = s.a;
      for (const hh of holes) { if (hh.from > cur) pieces.push([cur, hh.from]); cur = Math.max(cur, hh.to); }
      if (cur < s.b) pieces.push([cur, s.b]);
      const wallCenter = s.at + (s.inward * T) / 2;
      for (const [p0, p1] of pieces) {
        const len = p1 - p0, mid = (p0 + p1) / 2;
        if (s.axis === 'z') solid(`wall:${key}`, len, r.h, T, mid, r.h / 2, wallCenter);
        else solid(`wall:${key}`, T, r.h, len, wallCenter, r.h / 2, mid);
      }
      for (const hh of holes) {
        if (hh.h >= r.h) continue;
        const len = hh.to - hh.from, mid = (hh.from + hh.to) / 2, lh = r.h - hh.h;
        if (s.axis === 'z') solid(`wall:${key}`, len, lh, T, mid, hh.h + lh / 2, wallCenter, false);
        else solid(`wall:${key}`, T, lh, len, wallCenter, hh.h + lh / 2, mid, false);
      }
    }
    if (r.name) {
      const l = label(r.name, key === 'hall' || key === 'ware' ? 1.1 : 0.7);
      l.position.set(cx, Math.min(r.h - 0.6, 3.2), cz);
      labels.add(l);
    }
  }

  // ---- props: only their footprints live here; dressing.js draws them
  for (const [x, z0, z1] of STATIC_PROPS.racks) solid(null, 1.2, 3.2, z1 - z0, x, 1.6, (z0 + z1) / 2);
  solid(null, 1.2, 1.0, 1.0, -4.8, 0.5, 6.5); solid(null, 1.2, 1.6, 1.2, -5.2, 0.8, 3.0);
  solid(null, 1.0, 0.8, 1.0, 4.6, 0.4, 7.2); solid(null, 1.4, 2.0, 2.4, 5.0, 1.0, 3.6);
  add('dockLip', boxGeom(14, 0.25, 1.2, 0, 0.12, 0.6));
  solid(null, 2.4, 2.2, 1.6, 15.0, 1.1, 12.0); solid(null, 1.4, 3.0, 1.4, 21.0, 1.5, 16.5);
  solid(null, 2.2, 0.9, 0.8, 14.2, 0.45, 18.8);
  solid(null, 1.4, 1.0, 15, 3.8, 0.5, 57.5); solid(null, 1.4, 1.0, 15, 10.5, 0.5, 57.5);
  solid(null, 1.4, 1.0, 9, 17.5, 0.5, 60.5);
  for (const [x, z] of [[-2.6, 49.6], [-2.6, 66.4], [21.0, 66.4]]) colliders.push({ x0: x - 1.5, x1: x + 1.5, z0: z - 1.5, z1: z + 1.5 });
  add('platform', boxGeom(3.2, 0.3, 2.4, 2.5, 0.15, 66.6));
  solid(null, 2.0, 0.9, 0.8, 20.5, 0.45, 67.2);
  solid(null, 3.2, 0.9, 1.0, -12.5, 0.45, 56.4); solid(null, 3.2, 0.9, 1.0, -12.5, 0.45, 60.0);
  solid(null, 2.4, 0.9, 0.8, -12.0, 0.45, 63.2); solid(null, 0.8, 2.2, 3.0, -19.4, 1.1, 61.5);
  solid(null, 1.0, 0.7, 1.0, -16.3, 0.35, 33.5);

  const metalPlain = new THREE.MeshStandardMaterial({ color: 0x5f5d58, roughness: 0.7, metalness: 0.3, map: gridTexture('#8a8780') });
  const group = new THREE.Group();
  for (const [key, list] of byMat) {
    const [kind, room] = key.split(':');
    const mat = kind === 'floor' ? SF.floor[room] : kind === 'wall' ? SF.wall[room] : kind === 'ceil' ? SF.ceil : metalPlain;
    const m = new THREE.Mesh(mergeGeometries(list), mat);
    m.receiveShadow = true; m.castShadow = kind !== 'floor' && kind !== 'ceil';
    group.add(m);
  }
  scene.add(group);
  return { group, colliders, labels, T };
}

// ------------------------------------------------- bug markers (greybox)
export function buildBugMarkers(scene) {
  const g = new THREE.Group();
  const mat = new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.22, depthWrite: false, side: THREE.DoubleSide, fog: true });
  for (const b of SPOTS.bugs) {
    if (b.r > 0) {
      const ring = new THREE.Mesh(new THREE.RingGeometry(b.r * 0.85, b.r, 48), mat);
      ring.rotation.x = b.y > 0 ? Math.PI / 2 : -Math.PI / 2;
      ring.position.set(b.x, b.y > 0 ? b.y - 0.02 : 0.02, b.z);
      g.add(ring);
      const disc = new THREE.Mesh(new THREE.CircleGeometry(b.r * 0.85, 48), new THREE.MeshBasicMaterial({ color: 0xff2a1a, transparent: true, opacity: 0.06, depthWrite: false, side: THREE.DoubleSide }));
      disc.rotation.copy(ring.rotation); disc.position.copy(ring.position);
      g.add(disc);
    }
    const l = label(b.label, 0.45);
    l.material.color.set('#ff8a7a');
    l.material.opacity = 0.75;
    l.position.set(b.x, b.y > 0 ? b.y - 0.6 : 1.2, b.z);
    g.add(l);
  }
  scene.add(g);
  return g;
}
