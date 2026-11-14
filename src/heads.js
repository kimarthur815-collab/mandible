import * as THREE from 'three';
import { Tube } from './tube.js';
import { sstep } from './textures.js';
import { colorize, smoothSeams } from './roach.js';

const V3 = THREE.Vector3;

function gradTex(stops) {
  const c = document.createElement('canvas');
  c.width = 128; c.height = 4;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 128, 0);
  stops.forEach(([o, col]) => g.addColorStop(o, col));
  x.fillStyle = g; x.fillRect(0, 0, 128, 4);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function headShape(kind) {
  const g = new THREE.SphereGeometry(1, 56, 40);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), y = p.getY(i), z = p.getZ(i);
    let X, Y, Z;
    if (kind === 'round') {
      X = x * 0.11 * (1 - 0.15 * Math.max(0, z)); Y = y * 0.065 * (y < 0 ? 0.8 : 1); Z = z * 0.1;
    } else if (kind === 'wedge') {
      const front = Math.max(0, z);
      X = x * 0.135 * (1 - 0.45 * front);
      Y = y * (y > 0 ? 0.06 : 0.045) * (1 - 0.35 * front);
      Z = z * 0.135;
      if (y > 0) {
        Y += 0.014 * Math.exp(-((Math.abs(X) - 0.065) ** 2) / 0.0003) * sstep(-0.5, 0.2, z);   // brow ridges
        Y += 0.008 * Math.exp(-(X * X) / 0.0004);                                             // central keel
      }
    } else {
      X = x * 0.125; Y = y * (y > 0 ? 0.075 : 0.05); Z = z * 0.115 * (z < 0 ? 1.1 : 1);
    }
    p.setXYZ(i, X, Y, Z);
  }
  g.computeVertexNormals();
  smoothSeams(g);
  const base = new THREE.Color(kind === 'round' ? '#a8977a' : '#4a3a2a'), dark = new THREE.Color('#141016'), pale = new THREE.Color(kind === 'round' ? '#d0bf9c' : '#7a6650');
  colorize(g, (c, x, y, z) => {
    c.copy(base);
    c.lerp(dark, Math.exp(-(x * x) / 0.0005) * sstep(0.0, 0.03, y) * 0.9);
    c.lerp(dark, Math.exp(-((Math.abs(x) - 0.075) ** 2) / 0.0006) * sstep(0.0, 0.03, y) * 0.6);
    c.lerp(pale, sstep(-0.005, -0.04, y) * 0.6);
  });
  return g;
}

// pincer centre-line in head space: reaches forward, bows out, hooks inward at the tip
function forcPts(P, s, len, open, t) {
  const n = P.length;
  for (let i = 0; i < n; i++) {
    const u = i / (n - 1);
    const out = (0.03 + 0.05 * open) * Math.sin(Math.PI * Math.min(1, u * 1.15)) * len / 0.3;
    const hook = 0.05 * Math.pow(Math.max(0, (u - 0.7) / 0.3), 2) * len / 0.3;
    P[i].set(
      s * Math.max(0.028, 0.045 + out - hook - 0.02 * u),
      -0.05 - 0.02 * u + 0.035 * u * u,
      0.01 + len * u * (1 - 0.12 * u),
    );
  }
}

export function buildHead(style, mats, T) {
  const group = new THREE.Group();
  // harder, wetter, bumpier shell than the trunk for the new heads
  const shell = mats.body.clone();
  shell.normalScale = new THREE.Vector2(1.4, 1.4);
  shell.roughness = 0.35; shell.clearcoat = 0.9; shell.clearcoatRoughness = 0.12;
  shell.color = new THREE.Color('#9a8a7a');
  const add = (o) => { o.castShadow = true; group.add(o); return o; };
  const parts = { group, socket: (s) => new V3(s * 0.045, 0.035, 0.095), animate: () => {} };

  if (style === 'orig') {
    add(new THREE.Mesh(headShape('round'), mats.body));
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20).scale(0.03, 0.042, 0.048), mats.eye);
      e.position.set(s * 0.082, 0.022, 0.03); e.rotation.y = s * 0.3; group.add(e);
    }
    return parts;
  }

  const sideEyes = () => {
    for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18).scale(0.02, 0.026, 0.034), mats.eye);
      e.position.set(s * 0.108, 0.018, -0.045); e.rotation.y = s * 0.5; group.add(e);
    }
  };
  const clawMat = new THREE.MeshPhysicalMaterial({
    map: gradTex([[0, '#3e2c20'], [0.45, '#2a1810'], [0.75, '#0e0806'], [1, '#030202']]),
    roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.08,
  });

  if (style === 'fang') {
    add(new THREE.Mesh(headShape('wedge'), shell));
    sideEyes();
    const plate = add(new THREE.Mesh(colorize(new THREE.SphereGeometry(1, 24, 16).scale(0.085, 0.016, 0.07), (c) => c.set('#2a2026')), shell));
    plate.position.set(0, -0.05, 0.04);
    const claws = [-1, 1].map((s) => {
      const n = 22;
      const tube = new Tube(n, 10, clawMat);
      tube.mesh.frustumCulled = false;
      group.add(tube.mesh);
      const P = Array.from({ length: n }, () => new V3());
      const R = Array.from({ length: n }, (_, i) => { const u = i / (n - 1); return 0.032 * Math.pow(1 - u, 0.7) + 0.003; });
      return { s, tube, P, R };
    });
    parts.socket = (s) => new V3(s * 0.04, 0.028, 0.1);
    parts.animate = (t, open) => {
      const snap = Math.pow(Math.max(0, Math.sin(t * 2.7)), 10) * 0.6;
      for (const c of claws) { forcPts(c.P, c.s, 0.32, open + 0.35 + snap, t); c.tube.update(c.P, c.R); }
    };
    parts.animate(0, 0.3);
    return parts;
  }

  if (style === 'eyes') {
    add(new THREE.Mesh(headShape('dome'), shell));
    const eyeMat = mats.eye.clone();
    eyeMat.emissive = new THREE.Color('#3a0400');
    eyeMat.emissiveIntensity = 0.9;
    let seed = 5;
    const rnd = () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    const bulbs = [];
    for (const s of [-1, 1]) {
      for (let k = 0; k < 22; k++) {
        const d = new V3(s * (0.75 + rnd() * 0.3), 0.15 + rnd() * 0.6, -0.2 + rnd() * 0.85).normalize();
        const p = new V3(d.x * 0.125, d.y * 0.075, d.z * 0.115);
        const r = 0.008 + Math.pow(rnd(), 2) * 0.018;
        const e = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), eyeMat);
        e.position.copy(p).addScaledVector(d, r * 0.45);
        group.add(e);
        bulbs.push(e);
      }
      // a second, larger pair staring forward
      const big = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 18).scale(0.026, 0.026, 0.026), eyeMat);
      big.position.set(s * 0.05, 0.05, 0.085);
      group.add(big);
    }
    const claws = [-1, 1].map((s) => {
      const n = 14;
      const tube = new Tube(n, 8, clawMat);
      group.add(tube.mesh);
      return { s, tube, P: Array.from({ length: n }, () => new V3()), R: Array.from({ length: n }, (_, i) => 0.02 * Math.pow(1 - i / (n - 1), 0.7) + 0.002) };
    });
    parts.socket = (s) => new V3(s * 0.035, 0.06, 0.09);
    parts.animate = (t, open) => {
      eyeMat.emissiveIntensity = 0.7 + 0.25 * Math.sin(t * 1.7);
      for (const c of claws) { forcPts(c.P, c.s, 0.16, open, t); c.tube.update(c.P, c.R); }
    };
    parts.animate(0, 0.3);
    return parts;
  }

  // style === 'mouth': a wet, working mouth with writhing palps and drool
  add(new THREE.Mesh(headShape('wedge'), shell));
  sideEyes();
  const flesh = new THREE.MeshPhysicalMaterial({ color: '#4a1218', roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.05, sheen: 0.4, sheenColor: new THREE.Color('#ff8a80') });
  const cavity = add(new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20).scale(0.05, 0.026, 0.03), flesh));
  cavity.position.set(0, -0.048, 0.085);
  const plateMat = new THREE.MeshPhysicalMaterial({ color: '#2a1e1a', roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.1 });
  const plates = [];
  for (let k = 0; k < 4; k++) {
    const a = (k / 4) * Math.PI * 2 + Math.PI / 4;
    const piv = new THREE.Group();
    piv.position.set(Math.cos(a) * 0.045, -0.048 + Math.sin(a) * 0.028, 0.085);
    piv.rotation.z = a - Math.PI / 2;
    const plate = new THREE.Mesh(new THREE.ConeGeometry(0.022, 0.07, 8).rotateX(Math.PI / 2).translate(0, 0, 0.03), plateMat);
    plate.castShadow = true;
    piv.add(plate);
    group.add(piv);
    plates.push({ piv, a });
  }
  const palpMat = new THREE.MeshPhysicalMaterial({ color: '#a6866a', roughness: 0.35, clearcoat: 0.8, clearcoatRoughness: 0.15 });
  const palps = [];
  for (let k = 0; k < 8; k++) {
    const n = 10;
    const tube = new Tube(n, 6, palpMat);
    group.add(tube.mesh);
    const a = (k / 8) * Math.PI * 2;
    palps.push({ tube, a, ph: k * 1.3, len: 0.09 + (k % 3) * 0.03, P: Array.from({ length: n }, () => new V3()), R: Array.from({ length: n }, (_, i) => 0.0075 * (1 - i / n) + 0.0015) });
  }
  const drool = new THREE.MeshPhysicalMaterial({ color: '#c9b6a0', roughness: 0.05, transparent: true, opacity: 0.55, clearcoat: 1, clearcoatRoughness: 0.02 });
  const strands = [];
  for (let k = 0; k < 3; k++) {
    const n = 14;
    const tube = new Tube(n, 5, drool);
    tube.mesh.castShadow = false;
    group.add(tube.mesh);
    strands.push({ tube, ph: k * 2.1, x: (k - 1) * 0.022, len: 0.12 + k * 0.07, P: Array.from({ length: n }, () => new V3()), R: Array.from({ length: n }, (_, i) => 0.0028 + 0.004 * Math.pow(i / (n - 1), 3)) });
  }
  parts.socket = (s) => new V3(s * 0.04, 0.028, 0.1);
  parts.animate = (t, open) => {
    const o = 0.35 + 0.35 * Math.max(0, Math.sin(t * 4.3)) + 0.4 * open;
    for (const p of plates) p.piv.rotation.x = -0.15 - 0.55 * o;
    cavity.scale.set(1 + 0.15 * o, 1 + 0.25 * o, 1);
    for (const p of palps) {
      const bx = Math.cos(p.a) * 0.05, by = -0.048 + Math.sin(p.a) * 0.032;
      for (let i = 0; i < p.P.length; i++) {
        const u = i / (p.P.length - 1);
        const w = Math.sin(t * 6 + p.ph - u * 5) * 0.03 * u;
        p.P[i].set(bx * (1 + 0.6 * u) + w * Math.sin(p.a), by * (1 + 0.3 * u) - 0.025 * u + w * Math.cos(p.a), 0.09 + p.len * u);
      }
      p.tube.update(p.P, p.R);
    }
    for (const s of strands) {
      const sway = 0.015 * Math.sin(t * 1.8 + s.ph);
      const stretch = s.len * (0.85 + 0.15 * Math.sin(t * 1.1 + s.ph));
      for (let i = 0; i < s.P.length; i++) {
        const u = i / (s.P.length - 1);
        s.P[i].set(s.x + sway * u * u, -0.06 - stretch * u, 0.1 + 0.02 * u + sway * 0.5 * u);
      }
      s.tube.update(s.P, s.R);
    }
  };
  parts.animate(0, 0.3);
  return parts;
}
