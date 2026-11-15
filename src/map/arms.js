// First-person arms: white protective-suit sleeves, blue nitrile gloves,
// a flashlight in the right hand and the work insecticide can in the left.
// Drawn in their own pass on top of the world so they never sink into walls.
import * as THREE from 'three';
import { fbm, hash2, heightToNormal } from '../textures.js';
import { Tube } from '../tube.js';

const V3 = THREE.Vector3;
const D2R = Math.PI / 180;

// ------------------------------------------------------------------ textures
function canvasTex(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  return t;
}

// flash-spun suit fabric: soft creases plus a fine fibrous grain
function tyvekNormal(N = 256) {
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const crease = 1 - Math.abs(fbm(u * 6, v * 3, 11, 4, 6, 3) * 2 - 1);      // ridged = creases
    const crease2 = 1 - Math.abs(fbm(u * 11 + 3, v * 7, 23, 3, 11, 7) * 2 - 1);
    const grain = fbm(u * 64, v * 64, 5, 2, 64, 64);
    H[y * N + x] = Math.pow(crease, 3) * 0.7 + Math.pow(crease2, 4) * 0.35 + grain * 0.12;
  }
  return canvasTex(heightToNormal(H, N, N, 9), false);
}

// nitrile: very fine pebbling
function nitrileNormal(N = 128) {
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) H[y * N + x] = fbm(x / N * 32, y / N * 32, 7, 2, 32, 32);
  return canvasTex(heightToNormal(H, N, N, 2.5), false);
}

// anodised aluminium with a knurled grip band
function knurlNormal(N = 256) {
  const H = new Float32Array(N * N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    const a = Math.abs(((u * 24 + v * 24) % 1) - 0.5), b = Math.abs(((u * 24 - v * 24 + 100) % 1) - 0.5);
    const kn = Math.min(a, b);
    const band = v > 0.32 && v < 0.55 ? 1 : 0;   // knurl only on the grip part of the lathe
    H[y * N + x] = band * kn * 1.0 + hash2(x, y, 3) * 0.04;
  }
  return canvasTex(heightToNormal(H, N, N, 3), false);
}

// the work insecticide can label
function canLabel() {
  const W = 512, Hh = 256, c = document.createElement('canvas');
  c.width = W; c.height = Hh;
  const g = c.getContext('2d');
  g.fillStyle = '#e9c43a'; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#1b1b1b'; g.fillRect(0, 0, W, 54); g.fillRect(0, Hh - 30, W, 30);
  // hazard stripes on the lower band
  g.save(); g.beginPath(); g.rect(0, Hh - 30, W, 30); g.clip();
  g.fillStyle = '#e9c43a';
  for (let x = -40; x < W + 40; x += 28) { g.beginPath(); g.moveTo(x, Hh); g.lineTo(x + 14, Hh); g.lineTo(x + 44, Hh - 30); g.lineTo(x + 30, Hh - 30); g.fill(); }
  g.restore();
  g.fillStyle = '#e9c43a';
  g.font = 'bold 30px sans-serif'; g.textBaseline = 'middle';
  g.fillText('방역용 살충제', 18, 28);
  g.fillStyle = '#1b1b1b';
  g.font = 'bold 44px sans-serif'; g.fillText('KILL·X', 20, 98);
  g.font = '18px sans-serif';
  g.fillText('전문 방역업체 전용 · 바퀴 / 거미 / 지네', 20, 142);
  g.fillText('직접 분사 금지 · 환기 필수', 20, 170);
  // warning diamond with a bug
  g.save(); g.translate(400, 128); g.rotate(Math.PI / 4);
  g.fillStyle = '#fff'; g.fillRect(-46, -46, 92, 92);
  g.strokeStyle = '#c4231c'; g.lineWidth = 9; g.strokeRect(-46, -46, 92, 92);
  g.restore();
  g.fillStyle = '#1b1b1b';
  g.beginPath(); g.ellipse(400, 132, 12, 20, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.ellipse(400, 106, 8, 7, 0, 0, Math.PI * 2); g.fill();
  g.strokeStyle = '#1b1b1b'; g.lineWidth = 3;
  for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.moveTo(400 + s * 8, 122 + i * 10); g.lineTo(400 + s * 26, 114 + i * 16); g.stroke(); }
  // wear
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * W, y = Math.random() * Hh;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '255,255,255' : '40,30,20'},${Math.random() * 0.08})`;
    g.fillRect(x, y, 1 + Math.random() * 3, 1 + Math.random() * 2);
  }
  return canvasTex(c, true, false);
}

// ------------------------------------------------------------------ geometry helpers
function tubeGeom(P, R, radial = 12) {
  const t = new Tube(P.length, radial, null);
  t.update(P, R);
  const g = t.geometry;
  g.boundingSphere = null; g.computeBoundingSphere();
  return g;
}
function ball(r, at, sx = 1, sy = 1, sz = 1, w = 14, h = 10) {
  const g = new THREE.SphereGeometry(r, w, h);
  g.scale(sx, sy, sz); g.translate(at.x, at.y, at.z);
  return g;
}
function merge(list) {
  // light-weight merge (all non-indexed -> indexed), keeps position/normal/uv
  let vc = 0, ic = 0;
  const parts = list.map((g) => { const gi = g.index ? g : g.toNonIndexed(); return gi; });
  for (const g of parts) { vc += g.attributes.position.count; ic += g.index ? g.index.count : g.attributes.position.count; }
  const pos = new Float32Array(vc * 3), nor = new Float32Array(vc * 3), uv = new Float32Array(vc * 2), idx = new Uint32Array(ic);
  let vo = 0, io = 0;
  for (const g of parts) {
    const n = g.attributes.position.count;
    pos.set(g.attributes.position.array, vo * 3);
    nor.set(g.attributes.normal.array, vo * 3);
    if (g.attributes.uv) uv.set(g.attributes.uv.array, vo * 2);
    if (g.index) { const a = g.index.array; for (let i = 0; i < a.length; i++) idx[io + i] = a[i] + vo; io += a.length; }
    else { for (let i = 0; i < n; i++) idx[io + i] = vo + i; io += n; }
    vo += n;
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
  out.setIndex(new THREE.BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}

// A gloved fist closed round a cylinder of radius rb lying along local z (front = -z).
// Knuckles on +x, fingers wrap down and round to -x, thumb along the top.
function fistGeometry(rb, opt = {}) {
  const parts = [];
  const zs = opt.zs || [-0.026, -0.006, 0.013, 0.031];
  const fr = opt.fr || [0.0098, 0.0103, 0.0097, 0.0083];
  const ends = opt.ends || [-208, -212, -205, -190];
  for (let f = 0; f < 4; f++) {
    const r = fr[f], R = rb + r * 0.92, z = zs[f];
    const P = [], RR = [];
    // knuckle -> wrapped finger
    P.push(new V3(Math.cos(48 * D2R) * (R + 0.019), Math.sin(48 * D2R) * (R + 0.019), z + 0.004)); RR.push(r * 1.12);
    P.push(new V3(Math.cos(28 * D2R) * (R + 0.012), Math.sin(28 * D2R) * (R + 0.012), z + 0.002)); RR.push(r * 1.08);
    const a0 = 8, a1 = ends[f], n = 12;
    for (let i = 0; i <= n; i++) {
      const t = i / n, a = (a0 + (a1 - a0) * t) * D2R;
      const joint = Math.exp(-Math.pow((t - 0.36) / 0.06, 2)) + Math.exp(-Math.pow((t - 0.72) / 0.06, 2));   // knuckle bulges
      const rr = r * (1.04 - 0.16 * t) * (1 + joint * 0.07);
      const lift = joint * 0.0012;
      P.push(new V3(Math.cos(a) * (R + lift), Math.sin(a) * (R + lift), z - t * 0.003)); RR.push(rr);
    }
    parts.push(tubeGeom(P, RR, 10));
    parts.push(ball(RR[RR.length - 1] * 1.0, P[P.length - 1]));     // fingertip
    parts.push(ball(RR[0], P[0]));                                   // knuckle cap
  }
  // back of the hand, from the knuckle row to the wrist
  const bh = opt.backScale || 1;
  parts.push(ball(1, new V3((rb + 0.016) * 0.95, (rb + 0.01) * 0.5, 0.03), 0.017 * bh, 0.025 * bh, 0.05));
  // heel of the palm and the base of the thumb
  parts.push(ball(1, new V3(-rb * 0.55, rb * 1.05, 0.042), 0.017, 0.014, 0.03));
  parts.push(ball(1, new V3(rb * 0.3, -rb * 0.6, 0.05), 0.022, 0.02, 0.03));
  // thumb along the top-left of the barrel
  const T = [new V3(-rb * 0.25, rb + 0.014, 0.04), new V3(-rb * 0.7, rb + 0.012, 0.012), new V3(-rb * 0.78, rb + 0.008, -0.018), new V3(-rb * 0.62, rb + 0.006, -0.04)];
  const TR = [0.0125, 0.0115, 0.0105, 0.0094];
  parts.push(tubeGeom(T, TR, 10));
  parts.push(ball(0.0094, T[3]));
  const g = merge(parts);
  const n = g.attributes.normal, p = g.attributes.position, col = new Float32Array(p.count * 3);
  for (let i = 0; i < p.count; i++) {
    const nz = n.getZ(i), ny = n.getY(i);
    const r = Math.hypot(p.getX(i), p.getY(i));
    let ao = 1 - 0.5 * nz * nz;                       // finger sides face their neighbours
    ao *= r < rb + 0.012 ? 0.55 + 0.45 * (r - rb) / 0.012 : 1;   // tucked against the barrel
    ao *= 0.85 + 0.15 * (ny * 0.5 + 0.5);
    col[i * 3] = col[i * 3 + 1] = col[i * 3 + 2] = Math.max(0.25, ao);
  }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}

// ------------------------------------------------------------------ the arms
export class Arms {
  constructor() {
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();            // follows the camera
    this.root.matrixAutoUpdate = false;
    this.scene.add(this.root);

    // lights (their strength is driven by what the player is standing in)
    this.hemi = new THREE.HemisphereLight(0xd6e0ff, 0x2a2622, 0);
    this.bounce = new THREE.DirectionalLight(0xfff0dc, 0);   // light coming back off what the beam hits
    this.lampL = new THREE.DirectionalLight(0xffd29a, 0);
    this.lensL = new THREE.PointLight(0xfff2dc, 0, 0.3, 2);  // the beam's own glow on the fingers
    this.faceL = new THREE.PointLight(0xffe6cc, 0, 0.6, 2);           // so a roach on your face is just readable
    this.scene.add(this.hemi, this.bounce, this.bounce.target, this.lampL, this.lampL.target, this.lensL, this.faceL);

    const glove = new THREE.MeshPhysicalMaterial({ vertexColors: true, color: 0x4568c4, roughness: 0.4, clearcoat: 0.3, clearcoatRoughness: 0.45, sheen: 0.35, sheenColor: new THREE.Color(0x8aa8ff), sheenRoughness: 0.5, normalMap: nitrileNormal(), normalScale: new THREE.Vector2(0.4, 0.4) });
    glove.normalMap.repeat.set(3, 3);
    const tyvek = new THREE.MeshStandardMaterial({ color: 0xe6eaee, roughness: 0.93, normalMap: tyvekNormal(), normalScale: new THREE.Vector2(0.9, 0.9) });
    tyvek.normalMap.repeat.set(1, 2);
    const alu = new THREE.MeshStandardMaterial({ color: 0x17181b, roughness: 0.4, metalness: 0.65, normalMap: knurlNormal(), normalScale: new THREE.Vector2(0.6, 0.6) });
    const bezel = new THREE.MeshStandardMaterial({ color: 0x5a5d63, roughness: 0.28, metalness: 0.9 });
    const rubber = new THREE.MeshStandardMaterial({ color: 0x0c0c0d, roughness: 0.8 });
    this.lensMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.1, metalness: 0.2, emissive: 0xfff3df, emissiveIntensity: 0 });
    this.mats = { glove, tyvek };

    // ---- right hand + flashlight (local frame: barrel along z, lens at -z)
    this.rHand = new THREE.Group();
    const prof = [[0, -0.079], [0.008, -0.079], [0.0155, -0.077], [0.0165, -0.072], [0.0165, -0.062], [0.0172, -0.06], [0.0172, 0.03], [0.0168, 0.033], [0.0172, 0.036],
      [0.0175, 0.045], [0.022, 0.07], [0.024, 0.078], [0.024, 0.097], [0.0255, 0.099], [0.0255, 0.106], [0.0215, 0.107], [0.02, 0.104]];
    const lathe = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 32);
    lathe.rotateX(-Math.PI / 2);
    const body = new THREE.Mesh(lathe, alu);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.0247, 0.0016, 8, 40), bezel); ring.position.z = -0.1025;
    const lens = new THREE.Mesh(new THREE.CircleGeometry(0.0205, 32), this.lensMat); lens.position.z = -0.1045; lens.rotation.y = Math.PI;
    const tailBtn = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.008, 0.006, 20).rotateX(Math.PI / 2), rubber); tailBtn.position.z = 0.081;
    this.flashlight = new THREE.Group();
    this.flashlight.add(body, ring, lens, tailBtn);
    this.lens = lens;
    this.rFist = new THREE.Mesh(fistGeometry(0.0172), glove);
    this.rHand.add(this.flashlight, this.rFist);
    this.root.add(this.rHand);

    // ---- left hand + insecticide can (local frame: can along z, nozzle at -z)
    this.lHand = new THREE.Group();
    const canR = 0.031;
    const canProf = [[0, 0.085], [0.026, 0.085], [0.0305, 0.081], [canR, 0.076], [canR, -0.066], [0.029, -0.071], [0.024, -0.079], [0.016, -0.083], [0.011, -0.085], [0, -0.086]];
    const canGeo = new THREE.LatheGeometry(canProf.map(([r, y]) => new THREE.Vector2(r, -y)), 36);
    canGeo.rotateX(-Math.PI / 2);
    const canMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, map: canLabel(), roughness: 0.35, metalness: 0.25, clearcoat: 0.6, clearcoatRoughness: 0.25 });
    // keep the label on the straight body only: use a separate cylinder for it, chrome for the rest
    const chrome = new THREE.MeshStandardMaterial({ color: 0xb8bcc2, roughness: 0.25, metalness: 1 });
    const canShell = new THREE.Mesh(canGeo, chrome);
    const labelCyl = new THREE.Mesh(new THREE.CylinderGeometry(canR + 0.0004, canR + 0.0004, 0.138, 40, 1, true).rotateX(Math.PI / 2), canMat);
    labelCyl.position.z = 0.004;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.0125, 0.0135, 0.018, 20).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.45 }));
    cap.position.z = -0.093;
    const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.006, 10), new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.6 }));
    nozzle.position.set(0, 0.012, -0.095);
    this.can = new THREE.Group();
    this.can.add(canShell, labelCyl, cap, nozzle);
    const lFist = new THREE.Mesh(fistGeometry(canR, { zs: [-0.02, 0.003, 0.025, 0.046], fr: [0.0102, 0.0107, 0.01, 0.0087], ends: [-160, -165, -160, -150], backScale: 1.15 }), glove);
    this.lHand.add(this.can, lFist);
    this.lMirror = new THREE.Group();      // a left hand is a mirrored right hand
    this.lMirror.scale.x = -1;
    this.lMirror.add(this.lHand);
    this.root.add(this.lMirror);

    // ---- forearms: sleeve + glove cuff, rebuilt each frame between wrist and elbow
    const mk = (m) => { const t = new Tube(9, 18, m); t.mesh.castShadow = t.mesh.receiveShadow = false; this.root.add(t.mesh); return t; };
    const cuffMat = glove.clone(); cuffMat.vertexColors = false;
    this.rSleeve = mk(tyvek); this.rCuff = mk(cuffMat);
    this.lSleeve = mk(tyvek); this.lCuff = mk(cuffMat);
    // the left forearm lives inside the mirrored frame too
    this.root.remove(this.lSleeve.mesh, this.lCuff.mesh); this.lMirror.add(this.lSleeve.mesh, this.lCuff.mesh);

    // ---- state
    this.bob = 0; this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2();
    this.aimQ = new THREE.Quaternion(); this.aimInit = false;
    this.click = 0; this.shake = 0; this.useK = 0; this.time = 0;
    this.rGrip = new V3(0.15, -0.128, -0.35);
    this.lGrip = new V3(0.2, -0.215, -0.34);    // in the mirrored frame (= x -0.205 on screen)
    this._m = new THREE.Matrix4(); this._q = new THREE.Quaternion(); this._v = new V3(); this._w = new V3();
    this.lensLocal = new V3();
  }

  toggleClick() { this.click = 1; }
  sprayPuff() { this.sprayT = 0.9; }

  // where the spray comes out (world space)
  nozzleWorld(camera, out) {
    out.set(0, 0.012, -0.102).applyMatrix4(this.lHand.matrix);
    out.x = -out.x;                              // the left hand lives in a mirrored frame
    return camera.localToWorld(out);
  }

  // s: { dt, camera, moving, running, crouch, speed, lookDX, lookDY, flashOn, flashK, aimWorld, hitDist, lamp:{dir,k}, adapt, bright, shake, using }
  update(s) {
    const dt = Math.min(0.05, s.dt);
    this.time += dt;
    const cam = s.camera;
    cam.updateMatrixWorld();
    this.root.matrix.copy(cam.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;

    // walk bob and breathing
    const stride = s.running ? 9.5 : s.crouch ? 5 : 7.5;
    if (s.moving) this.bob += dt * stride * Math.min(1.4, s.speed / 3 + 0.4);
    const amp = s.moving ? (s.running ? 0.016 : 0.0075) : 0;
    const breath = Math.sin(this.time * 1.6) * 0.0018;
    const bobY = -Math.abs(Math.sin(this.bob)) * amp + breath + (s.crouch ? -0.01 : 0) + (s.running ? -0.018 : 0);
    const bobX = Math.sin(this.bob) * amp * 0.6;

    // the arms lag a little behind fast looks
    this.swayV.x += (-s.lookDX * 0.9 - this.sway.x) * 60 * dt - this.swayV.x * 10 * dt;
    this.swayV.y += (s.lookDY * 0.9 - this.sway.y) * 60 * dt - this.swayV.y * 10 * dt;
    this.sway.x += this.swayV.x * dt; this.sway.y += this.swayV.y * dt;
    this.sway.clampScalar(-0.06, 0.06);

    // shaking bugs off / pressing the switch
    this.shake = Math.max(0, Math.max(this.shake - dt * 3, s.shake || 0));
    this.click = Math.max(0, this.click - dt * 7);
    this.useK += ((s.using ? 1 : 0) - this.useK) * Math.min(1, dt * 8);
    const jx = (Math.sin(this.time * 47) + Math.sin(this.time * 31)) * 0.5 * this.shake * 0.03;
    const jy = (Math.cos(this.time * 43) + Math.sin(this.time * 27)) * 0.5 * this.shake * 0.025;

    // ---- right hand: aim the flashlight at what the beam is lighting
    const rp = this.rGrip.clone().add(new V3(bobX + this.sway.x + jx, bobY + this.sway.y + jy - this.click * 0.003, -this.useK * 0.03));
    if (s.running) rp.add(new V3(0.02, -0.02, 0.03));
    const aimL = cam.worldToLocal(this._v.copy(s.aimWorld));
    const dir = aimL.sub(rp).normalize();
    // keep it natural: no more than ~20 degrees off straight ahead
    const fwd = new V3(0, 0, -1);
    const ang = dir.angleTo(fwd);
    if (ang > 0.35) dir.lerp(fwd, 1 - 0.35 / ang).normalize();
    const look = new THREE.Matrix4().lookAt(new V3(), dir, new V3(0, 1, 0));    // local -z -> dir
    const q = new THREE.Quaternion().setFromRotationMatrix(look);
    q.multiply(this._q.setFromEuler(new THREE.Euler(0, 0, -0.32 + (s.running ? Math.sin(this.bob) * 0.12 : 0))));   // wrist roll
    if (!this.aimInit) { this.aimQ.copy(q); this.aimInit = true; }
    this.aimQ.slerp(q, 1 - Math.exp(-dt * 14));
    this.rHand.position.copy(rp);
    this.rHand.quaternion.copy(this.aimQ);
    this.rHand.updateMatrix();
    this.lensLocal.set(0, 0, -0.112).applyMatrix4(this.rHand.matrix);

    // ---- left hand: can held low, comes up to swat when bugs are on you, raised and aimed to spray
    const swat = this.shake;
    this.sprayT = Math.max(0, (this.sprayT || 0) - dt);
    const spr = this.sprayT > 0 ? Math.min(1, (0.9 - this.sprayT) * 9, this.sprayT * 5) : 0;
    const lp = this.lGrip.clone().add(new V3(-bobX * 0.8 - this.sway.x * 0.8, bobY * 1.1 + this.sway.y + swat * 0.11, swat * -0.02));
    lp.x += Math.sin(this.time * 38) * swat * 0.05;
    if (s.running) lp.add(new V3(0.0, -0.03 + Math.sin(this.bob + Math.PI) * 0.02, 0.02));
    lp.lerp(new V3(0.12, -0.105, -0.43), spr);
    this.lHand.position.copy(lp);
    this.lHand.quaternion.setFromEuler(new THREE.Euler(1.25 - swat * 0.5 - spr * 1.05, 0.25 - spr * 0.45, 0.35 + Math.sin(this.time * 41) * swat * 0.3 - spr * 0.2, 'XYZ'));
    this.lHand.updateMatrix();

    // ---- forearms
    this.forearm(this.rHand, this.rSleeve, this.rCuff, new V3(0.035, -0.012, 0.1), new V3(0.3 + bobX, -0.42 + bobY, 0.02), 1);
    this.forearm(this.lHand, this.lSleeve, this.lCuff, new V3(0.045, -0.02, 0.11), new V3(0.33 - bobX, -0.5 + bobY, 0.05), 1.08);

    // ---- light on the arms
    const k = s.flashOn ? s.flashK : 0;
    const bounceK = k * Math.min(1.5, Math.max(0.12, 1.8 / (s.hitDist + 0.4)));
    this.bounce.intensity = bounceK * 1.6;
    this.bounce.position.copy(cam.localToWorld(this._v.set(0.05, 0.25, -1.2)));
    this.bounce.target.position.copy(cam.localToWorld(this._w.set(0.12, -0.2, -0.35)));
    this.lensL.position.copy(cam.localToWorld(this._v.copy(this.lensLocal).add(new V3(0, 0.02, 0.02))));
    this.lensL.intensity = k * 0.06;
    this.lensMat.emissiveIntensity = k * 9;
    const lampK = s.lamp ? s.lamp.k : 0;
    this.lampL.intensity = lampK * 2.2;
    if (s.lamp && s.lamp.k > 0) {
      this.lampL.position.copy(cam.position).addScaledVector(s.lamp.dir, -3).add(new V3(0, 2.5, 0));
      this.lampL.target.position.copy(cam.position);
    }
    this.hemi.intensity = 0.04 + s.adapt * 0.1 + lampK * 0.6 + (s.bright ? 1.6 : 0);
    const fT = s.faceLit ? 0.03 + (s.flashOn ? 0.015 : 0) : 0;
    this.faceL.intensity += (fT - this.faceL.intensity) * Math.min(1, dt * 6);
    this.faceL.position.copy(cam.localToWorld(this._v.set(0.02, 0.12, -0.08)));
  }

  // sleeve from elbow to wrist, glove cuff pulled over the end of it
  forearm(hand, sleeve, cuff, wristLocal, elbow, thick) {
    const W = wristLocal.clone().applyMatrix4(hand.matrix);
    const E = elbow;
    const dir = new V3().subVectors(W, E).normalize();
    const Ws = W.clone().addScaledVector(dir, -0.028);          // the sleeve ends inside the cuff
    const P = [], R = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;
      const p = new V3().lerpVectors(E, Ws, t);
      p.y -= Math.sin(t * Math.PI) * 0.015;
      P.push(p);
      // the suit bunches up behind the glove: a few soft rolls near the wrist
      const roll = t > 0.55 && t < 0.92 ? Math.sin((t - 0.55) * 34) * 0.0035 : 0;
      R.push((0.064 - 0.022 * t + roll) * thick);
    }
    sleeve.update(P, R);
    const C = [], CR = [];
    for (let i = 0; i < 9; i++) {
      const t = i / 8;                                         // 0 = open end of the cuff, 1 = at the hand
      C.push(W.clone().addScaledVector(dir, -0.058 * (1 - t) + 0.004));
      CR.push((0.0485 - 0.011 * t + (t < 0.12 ? 0.0025 : 0)) * thick);
    }
    cuff.update(C, CR);
  }

  // where the beam should start (world), pulled back if a wall is closer than the lens
  lensWorld(camera, hitDist, out) {
    out.copy(this.lensLocal);
    const maxZ = Math.max(0.12, hitDist - 0.08);
    if (-out.z > maxZ) out.z = -maxZ;
    return camera.localToWorld(out);
  }

  render(renderer, camera) {
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    renderer.render(this.scene, camera);
    renderer.autoClear = ac;
  }
}
