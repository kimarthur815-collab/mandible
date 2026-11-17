import * as THREE from 'three';

// A human head sculpted from a sphere: skull, brow, sockets, nose, starved cheeks, a mouth that opens.
// Built at unit height (crown to chin = 1) facing +z; the group is scaled to the size asked for.
// mouth: 'scream' (stretched long, the jaw hanging), 'grin' (wide, corners up, teeth showing)
// eyes:  'hollow' (big sockets dug deep, nothing in them but black), 'human' (bloodshot, they turn to
//        follow you)
// The jaw is a morph target: setOpen(0..1).
const V3 = THREE.Vector3;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const g2 = (x, y, cx, cy, rx, ry) => Math.exp(-(((x - cx) / rx) ** 2) - (((y - cy) / ry) ** 2));
const hash = (x, y, z) => { const s = Math.sin(x * 127.1 + y * 311.7 + z * 74.7) * 43758.5453; return s - Math.floor(s); };
function noise3(x, y, z) {
  // cheap value noise, smooth enough for skin mottling
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const l = (a, b, t) => a + (b - a) * t;
  const c = (i, j, k) => hash(xi + i, yi + j, zi + k);
  return l(l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v), l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v), w);
}

const EYESETS = {
  human: [[-0.155, 0.055, 0.052], [0.155, 0.055, 0.052]],
  hollow: [[-0.15, 0.045, 0.09], [0.15, 0.045, 0.09]],
};
// the mouth, laid out open: hu / hl how far the lips part up / down, h the gap left when shut,
// drop how far the jaw hangs at full stretch, smile how far the corners pull up
const MOUTH = {
  scream: { cy: -0.27, w: 0.075, h: 0.01, hu: 0.035, hl: 0.17, drop: 0.07, smile: 0, depth: 0.2 },
  grin:   { cy: -0.25, w: 0.14, h: 0.012, hu: 0.024, hl: 0.05, drop: 0.015, smile: 0.06, depth: 0.1 },
};

// skull + face surface with the mouth open k (0..1). The inside of the mouth is real surface: laid
// out open and squeezed shut into the line between the lips, so it's dark at any opening.
function sculpt(base, eyeset, hollow, M, k, skin, mottle, tears) {
  const n = base.length / 3, pos = new Float32Array(n * 3), col = new Float32Array(n * 3);
  const c = new THREE.Color(), cDark = new THREE.Color('#1c1614'), cBag = new THREE.Color('#5a4048'), cLip = new THREE.Color('#7a5a5c'),
    cIn = new THREE.Color('#100505'), cGum = new THREE.Color('#5a2224'), cVein = new THREE.Color('#5e6a80'), cMot = new THREE.Color(mottle), cBlack = new THREE.Color(0, 0, 0);
  const s = M.h / (M.hu + M.hl) + (1 - M.h / (M.hu + M.hl)) * k;     // how far apart the lips are
  const jawW = Math.max(M.w * 2.2, 0.2);
  for (let i = 0; i < n; i++) {
    const dx = base[i * 3], dy = base[i * 3 + 1], dz = base[i * 3 + 2];
    // skull: a tall cranium, the jaw narrowing to the chin, the back of the neck in
    let x = dx * 0.385, y = dy * 0.52, z = dz * 0.45;
    if (y < -0.08) { const t = ss(-0.08, -0.5, y); x *= 1 - 0.4 * t; if (z < 0) z *= 1 - 0.55 * t; }
    if (y > 0.2) { x *= 1 + 0.06 * ss(0.2, 0.42, y); }
    const front = ss(0.05, 0.4, dz), r = Math.hypot(x, y, z);
    const x0 = x, y0 = y;
    let d = 0;                                                                  // push along the radius
    // brow, temples, cheekbones, starved cheeks, chin
    d += 0.024 * Math.exp(-(((y - 0.14) / 0.034) ** 2)) * ss(0.3, 0.1, Math.abs(x)) * front;
    d -= 0.022 * g2(Math.abs(x), y, 0.3, 0.12, 0.06, 0.08) * ss(0.0, 0.3, dz);
    d += 0.034 * g2(Math.abs(x), y, 0.2, -0.04, 0.07, 0.045) * front;
    d -= 0.055 * g2(Math.abs(x), y, 0.18, -0.2, 0.075, 0.085) * front;
    d += 0.022 * g2(x, y, 0, -0.45, 0.07, 0.05) * front;
    // sockets
    let sock = 0, pit = 0;
    for (const [ex, ey, er] of eyeset) {
      const sk = g2(x, y, ex, ey, er * 1.7, er * 1.25);
      sock = Math.max(sock, sk);
      d -= 0.085 * (er / 0.052) * sk * front;
      // (hollow: a pit with steep sides in the middle of the socket)
      if (hollow) { const p = ss(1.0, 0.55, Math.hypot((x - ex) / (er * 1.2), (y - ey) / er)); pit = Math.max(pit, p); d -= 0.075 * p * front; }
    }
    // nose: bridge between the eyes down to a tip, wings, nostrils
    const tip = ss(0.07, -0.105, y) * ss(-0.15, -0.115, y);
    const nw = 0.022 + 0.03 * ss(0.02, -0.12, y);
    d += (0.012 + 0.1 * tip) * Math.exp(-((x / nw) ** 2)) * ss(0.12, 0.05, y) * front;
    d += 0.02 * g2(Math.abs(x), y, 0.038, -0.115, 0.022, 0.02) * front;
    d -= 0.02 * g2(Math.abs(x), y, 0.022, -0.137, 0.01, 0.008) * front;
    // the mouth (only on the face)
    const cyx = M.cy + M.smile * Math.min(1.6, (x0 / M.w) ** 2);
    const E = front > 0.3 ? Math.hypot(x0 / M.w, (y0 - cyx) / (y0 > cyx ? M.hu : M.hl)) : 9;
    const ux = Math.sqrt(Math.max(0, 1 - (x0 / M.w) ** 2));
    const dropX = M.drop * k * Math.sqrt(Math.max(0, 1 - (x0 / jawW) ** 2));
    if (E < 1) {
      // inside: squeezed to the lip line as it shuts, deeper as it opens, the lower half riding the jaw
      y = cyx + (y0 - cyx) * s - (y0 < cyx ? dropX : 0);
      d -= M.depth * Math.sqrt(1 - E * E) * (0.35 + 0.65 * k);
    } else if (y0 < cyx && front > 0.3) {
      // the jaw: the lower lip comes up to meet the upper as it shuts, the chin with it
      // (right under the lip it follows the lip's curve; further down, the whole chin, smoothly)
      const below = (cyx - M.hl * ux) - y0, fall = 1 - ss(0.16, 0.42, below);
      const uw = Math.sqrt(Math.max(0, 1 - (x0 / (M.w * 1.9)) ** 2)), prof = ux + (uw - ux) * ss(0, 0.07, below);
      // (never past the lower lip: nothing folds over)
      const up = Math.min((1 - s) * M.hl * prof, Math.max(0, (cyx - y0) - M.hl * ux * s - 0.004));
      y = y0 + (up - dropX) * fall;
    } else if (y0 > cyx && front > 0.3 && E < 2.5) {
      y = y0 - (1 - s) * M.hu * ux * (1 - ss(0, 0.06, y0 - (cyx + M.hu * ux)));
    }
    d += 0.014 * Math.exp(-(((E - 1.12) / 0.16) ** 2)) * front;                 // lips
    d -= (M.smile > 0 ? 0.02 : 0.012) * g2(Math.abs(x0), y0, M.w + 0.015, cyx, 0.02, 0.025) * front;   // corners
    // the fold from the nose to the corner of the mouth
    d += 0.012 * Math.exp(-(((Math.abs(x0) - (0.06 + (cyx + 0.12 - y0) * 0.6)) / 0.014) ** 2)) * ss(-0.12, -0.16, y0) * ss(cyx - 0.02, cyx + 0.02, y0) * front;
    // skin wrinkles and the odd lump
    d += 0.004 * (noise3(x0 * 40, y0 * 40, z * 40) - 0.5);
    const kk = (r + d) / r;
    pos[i * 3] = x * kk; pos[i * 3 + 1] = y * kk; pos[i * 3 + 2] = z * kk;
    // colour: pale skin, mottled, dark round the eyes, the lips bruised, the mouth black inside
    const m1 = noise3(x0 * 9 + 3, y0 * 9, z * 9), m2 = noise3(x0 * 25, y0 * 25 + 7, z * 25);
    c.set(skin).lerp(cMot, ss(0.45, 0.85, m1) * 0.45).multiplyScalar(0.94 + 0.1 * m2);
    const vein = Math.pow(1 - Math.abs(noise3(x0 * 14, y0 * 14, z * 14 + 9) * 2 - 1), 14);
    c.lerp(cVein, vein * 0.35 * ss(0.0, 0.3, Math.abs(x0) + Math.max(0, y0)));
    c.lerp(cBag, Math.min(1, sock * 1.4) * 0.6);
    c.lerp(cDark, Math.pow(sock, 0.45) * 0.9 * front);
    c.lerp(cBag, 0.35 * g2(Math.abs(x0), y0, 0.17, -0.12, 0.08, 0.05) * front);
    c.lerp(cLip, Math.exp(-(((E - 1.1) / 0.2) ** 2)) * 0.7 * front);
    if (tears) for (const [ex, ey] of eyeset) {
      for (const off of [-0.018, 0.012]) {
        const wob = 0.006 * Math.sin(y0 * 60 + ex * 40 + off * 300), tr = Math.exp(-(((x0 - ex - off - wob) / 0.009) ** 2)) * ss(ey - 0.02, ey - 0.05, y0) * ss(ey - 0.42 - off * 4, ey - 0.22, y0);
        c.lerp(cIn, tr * 0.95 * front);
      }
    }
    if (E < 1.02) { c.lerp(cGum, ss(1.02, 0.88, E)); c.lerp(cIn, ss(0.9, 0.6, E)); }
    if (pit > 0) c.lerp(cBlack, Math.min(1, pit * 1.6));
    col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
  }
  return { pos, col };
}

function eyeTexture(kind) {
  const C = document.createElement('canvas'); C.width = C.height = 256;
  const g = C.getContext('2d');
  // the ball unwrapped: +z (u = .5, v = .5) is the front
  g.fillStyle = '#d8d0c0'; g.fillRect(0, 0, 256, 256);
  const cx = 128, cy = 128;
  // bloodshot: veins running in from the edges
  g.strokeStyle = 'rgba(150,30,30,.55)';
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * 6.283; let x = cx + Math.cos(a) * 120, y = cy + Math.sin(a) * 120;
    g.lineWidth = 0.6 + Math.random() * 1.4; g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 6; s++) { x += (cx - x) * 0.14 + (Math.random() - 0.5) * 10; y += (cy - y) * 0.14 + (Math.random() - 0.5) * 10; g.lineTo(x, y); }
    g.stroke();
  }
  const ir = kind === 'grey' ? 30 : 26;
  const gr = g.createRadialGradient(cx, cy, 4, cx, cy, ir);
  gr.addColorStop(0, '#000'); gr.addColorStop(0.32, '#000'); gr.addColorStop(0.36, kind === 'grey' ? '#6c7478' : '#5a4632');
  gr.addColorStop(0.85, kind === 'grey' ? '#9aa4a6' : '#8a6a44'); gr.addColorStop(1, '#2a2622');
  g.fillStyle = gr; g.beginPath(); g.arc(cx, cy, ir, 0, 6.283); g.fill();
  for (let i = 0; i < 60; i++) { const a = Math.random() * 6.283; g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx + Math.cos(a) * ir * 0.4, cy + Math.sin(a) * ir * 0.4); g.lineTo(cx + Math.cos(a) * ir, cy + Math.sin(a) * ir); g.stroke(); }
  const t = new THREE.CanvasTexture(C); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
// sphere UVs that put the texture's centre on the +z pole
function frontUV(geo) {
  const p = geo.attributes.position, uv = geo.attributes.uv;
  for (let i = 0; i < p.count; i++) {
    const v = new V3(p.getX(i), p.getY(i), p.getZ(i)).normalize();
    const a = Math.acos(Math.max(-1, Math.min(1, v.z))) / Math.PI;      // 0 at the front
    const ang = Math.atan2(v.y, v.x);
    uv.setXY(i, 0.5 + Math.cos(ang) * a * 0.95, 0.5 + Math.sin(ang) * a * 0.95);
  }
  return geo;
}

export function makeFace(opt = {}) {
  const { h = 0.24, skin = '#d8d2ca', mottle = '#9a8a96', eyes = 'hollow', mouth = 'scream', seg = 96, teeth = true, eyeColor = 'grey', tears = false } = opt;
  const M = MOUTH[mouth], hollow = eyes === 'hollow', eyeset = EYESETS[hollow ? 'hollow' : 'human'];
  const group = new THREE.Group(), head = new THREE.Group();
  head.scale.setScalar(h); group.add(head);
  const sphere = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const base = sphere.attributes.position.array.slice();
  const A = sculpt(base, eyeset, hollow, M, 0, skin, mottle, tears), B = sculpt(base, eyeset, hollow, M, 1, skin, mottle, tears);
  const geo = sphere;
  geo.setAttribute('position', new THREE.BufferAttribute(A.pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(A.col, 3));
  geo.computeVertexNormals();
  const nA = geo.attributes.normal.array.slice();
  const gB = geo.clone(); gB.setAttribute('position', new THREE.BufferAttribute(B.pos, 3)); gB.computeVertexNormals();
  const dP = new Float32Array(A.pos.length), dN = new Float32Array(A.pos.length);
  for (let i = 0; i < dP.length; i++) { dP[i] = B.pos[i] - A.pos[i]; dN[i] = gB.attributes.normal.array[i] - nA[i]; }
  geo.morphAttributes.position = [new THREE.BufferAttribute(dP, 3)];
  geo.morphAttributes.normal = [new THREE.BufferAttribute(dN, 3)];
  geo.morphTargetsRelative = true;
  gB.dispose();
  const skinMat = new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.52, clearcoat: 0.35, clearcoatRoughness: 0.45, sheen: 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color('#e8d0d0') });
  const face = new THREE.Mesh(geo, skinMat);
  face.morphTargetInfluences = [0];
  face.castShadow = true; face.receiveShadow = true;
  head.add(face);
  // ears
  for (const s of [-1, 1]) {
    const e = new THREE.SphereGeometry(1, 14, 10); e.scale(0.025, 0.075, 0.05);
    const p = e.attributes.position; for (let i = 0; i < p.count; i++) if (p.getX(i) * s < 0) p.setX(i, p.getX(i) * 0.3);   // flat against the head
    e.computeVertexNormals();
    const em = new THREE.Mesh(e, new THREE.MeshPhysicalMaterial({ color: skin, roughness: 0.55, sheen: 0.4, sheenColor: new THREE.Color('#e8c8c8') }));
    em.position.set(s * 0.385, -0.02, -0.04); em.rotation.y = s * 0.25; em.castShadow = true; head.add(em);
  }
  // eyes: human ones in their sockets; hollow ones are pits with only black at the bottom
  // (unlit, so no light ever comes back out of them)
  const eyeMeshes = [];
  const surfZ = (ex, ey) => Math.sqrt(Math.max(0, 0.45 * 0.45 * (1 - (ex / 0.4) ** 2 - (ey / 0.5) ** 2)));
  if (hollow) {
    const black = new THREE.MeshBasicMaterial({ color: 0x000000 });
    for (const [ex, ey, er] of eyeset) {
      const m = new THREE.Mesh(new THREE.SphereGeometry(er * 0.95, 16, 12), black);
      m.position.set(ex, ey, surfZ(ex, ey) - 0.085 * (er / 0.052) - 0.075 + er * 0.35);
      m.scale.z = 0.7;
      head.add(m);
    }
  } else {
    const eyeMat = new THREE.MeshPhysicalMaterial({ map: eyeTexture(eyeColor), roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.03 });
    for (const [ex, ey, er] of eyeset) {
      const r = er * 0.9;
      const m = new THREE.Mesh(frontUV(new THREE.SphereGeometry(r, 28, 20)), eyeMat);
      // sit it in the socket: find the surface there and set it back into it
      m.position.set(ex, ey, surfZ(ex, ey) - 0.085 * (er / 0.052) + r * 0.55);
      head.add(m); eyeMeshes.push(m);
    }
  }
  // teeth: an upper and a lower row inside the lips, following them as the mouth opens (one draw)
  const toothList = [];
  let teethMesh = null;
  if (teeth) {
    const tMat = new THREE.MeshPhysicalMaterial({ color: '#d8ccb0', roughness: 0.35, clearcoat: 0.6, clearcoatRoughness: 0.2 });
    const tGeo = new THREE.CylinderGeometry(0.0055, 0.009, 0.034, 6, 1); tGeo.translate(0, -0.017, 0);
    const N = mouth === 'grin' ? 14 : 10;
    for (const sgn of [1, -1]) for (let k = 0; k < N; k++) {
      const u = (k + 0.5) / N * 2 - 1;                                         // -1..1 across the mouth
      const x = u * M.w * 0.9;
      const len = (mouth === 'scream' ? 1.3 : 1) * (0.75 + 0.5 * Math.random()) * (1 - 0.35 * Math.abs(u));
      toothList.push({
        x, u, sgn, len, z: Math.sqrt(Math.max(0, 0.45 * 0.45 * (1 - (x / 0.385) ** 2) - (M.cy / 0.52) ** 2 * 0.45 * 0.45)) - 0.035,
        q: new THREE.Quaternion().setFromEuler(new THREE.Euler(0, -u * 0.6, sgn < 0 ? Math.PI : 0, 'YXZ')),     // the lower ones point up
      });
    }
    teethMesh = new THREE.InstancedMesh(tGeo, tMat, toothList.length);
    teethMesh.castShadow = true; teethMesh.frustumCulled = false;
    head.add(teethMesh);
  }
  const mtx = new THREE.Matrix4(), tp = new V3(), tsc = new V3();
  let open = 0;
  const api = {
    group, head, face, h,
    setOpen(k) {
      open = Math.max(0, Math.min(1, k));
      face.morphTargetInfluences[0] = open;
      if (!teethMesh) return;
      const s = M.h / (M.hu + M.hl) + (1 - M.h / (M.hu + M.hl)) * open, jawW = Math.max(M.w * 2.2, 0.2);
      toothList.forEach((T, i) => {
        const ux = Math.sqrt(Math.max(0, 1 - T.u * T.u * 0.81)), cyx = M.cy + M.smile * (T.x / M.w) ** 2;
        const y = T.sgn > 0 ? cyx + M.hu * ux * s * 0.85 + 0.004 : cyx - M.hl * ux * s * 0.85 - 0.004 - M.drop * open * Math.sqrt(Math.max(0, 1 - (T.x / jawW) ** 2));
        teethMesh.setMatrixAt(i, mtx.compose(tp.set(T.x, y, T.z), T.q, tsc.set(1, T.len, 1)));
      });
      teethMesh.instanceMatrix.needsUpdate = true;
    },
    // human eyes follow you; wp: world point
    lookAt(wp) {
      for (const e of eyeMeshes) {
        const local = head.worldToLocal(wp.clone()).sub(e.position);
        local.z = Math.max(local.z, 0.15 * local.length());                   // they can't roll round to the back
        e.quaternion.setFromUnitVectors(new V3(0, 0, 1), local.normalize());
      }
    },
  };
  api.setOpen(0);
  return api;
}
