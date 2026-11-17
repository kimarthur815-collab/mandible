import * as THREE from 'three';
import { Tube } from './tube.js';
import { sstep } from './textures.js';
import { buildShell, colorize, smoothSeams } from './roach.js';
import { buildHead } from './heads.js';

const V3 = THREE.Vector3;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const UPV = new V3(0, 1, 0);
export const N_SEG = 40;
export const SP = 0.12;    // spacing between trunk segments (m)
const BODY_Y = 0.36;       // trunk height above the floor (m)

// ------------------------------------------------------------ geometry
function tergiteR(phi) {
  const s = Math.sin(phi), c = Math.cos(phi);
  const a = 0.21, b = s >= 0 ? 0.08 : 0.072, n = 3.2;
  return Math.pow(Math.pow(Math.abs(c / a), n) + Math.pow(Math.abs(s / b), n), -1 / n);
}
const TBBOX = { minx: -0.21, maxx: 0.21, minz: -0.072, maxz: 0.08 };

function unitCyl(radial = 10, taper = 0.8, rows = 6) {
  const g = new THREE.CylinderGeometry(1, 1, 1, radial, rows, false);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = lerp(1, taper, p.getY(i));
    p.setX(i, p.getX(i) * r); p.setZ(i, p.getZ(i) * r);
  }
  g.computeVertexNormals();
  return g;
}

// an arm bone's flesh along +y from 0 to 1: radius 1 at the start, shaped by prof (radius at even steps)
function limbCyl(radial, prof) {
  const g = new THREE.CylinderGeometry(1, 1, 1, radial, prof.length - 1, true);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const r = prof[Math.round(p.getY(i) * (prof.length - 1))];
    p.setX(i, p.getX(i) * r); p.setZ(i, p.getZ(i) * r);
  }
  g.computeVertexNormals();
  return g;
}

function forcipuleGeom(side) {
  const g = new THREE.ConeGeometry(0.018, 0.13, 10, 8);
  g.rotateX(Math.PI / 2);        // tip toward +z
  g.translate(0, 0, 0.065);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i);
    p.setX(i, p.getX(i) - side * 5.5 * z * z);   // hook inward
    p.setY(i, p.getY(i) - 1.5 * z * z);
  }
  g.computeVertexNormals();
  colorize(g, (c, x, y, z) => c.set('#5a4636').lerp(new THREE.Color('#0e0a0a'), sstep(0.05, 0.12, z)));
  return g;
}

const _x = new V3(), _y = new V3(), _z = new V3();
function segMatrix(out, p0, p1, up, r) {
  _y.subVectors(p1, p0);
  const L = _y.length() || 1e-5;
  _y.divideScalar(L);
  _z.copy(up).addScaledVector(_y, -up.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0).addScaledVector(_y, -_y.x);
  _z.normalize();
  _x.crossVectors(_y, _z);
  out.makeBasis(_x.multiplyScalar(r), _y.multiplyScalar(L), _z.multiplyScalar(r));
  out.setPosition(p0);
  return out;
}

// ============================================================ Centipede
export class Centipede {
  constructor(T, opt = {}) {
    const lite = !!opt.lite;          // in-game: far fewer triangles, thin parts cast no shadow
    this.group = new THREE.Group();
    this.time = 0;
    this.mode = 'idle';
    this.look = 0;                    // 0..1: head up, turning this way and that (waiting, peering about)
    this.obstacles = [];
    this.b = { sub: 'pause', timer: 0.5, target: new THREE.Vector2(), desired: 0, stun: false, hold: 0, curl: 0, curlSide: 1, prev: 'idle', immune: 0, hits: 0, lastHit: -99, lunge: 0, lt: 0, caught: false };
    this.wasLit = false;

    const m = this.mats = {
      terg: new THREE.MeshPhysicalMaterial({
        map: T.terg.map, roughnessMap: T.terg.roughnessMap, normalMap: T.terg.normalMap, normalScale: new THREE.Vector2(0.6, 0.6),
        roughness: 1, clearcoat: 0.45, clearcoatRoughness: 0.3, sheen: 0.5, sheenRoughness: 0.6, sheenColor: new THREE.Color('#8a7a64'),
      }),
      body: new THREE.MeshPhysicalMaterial({ vertexColors: true, roughness: 0.6, clearcoat: 0.3, clearcoatRoughness: 0.4, normalMap: T.chitin, normalScale: new THREE.Vector2(0.3, 0.3) }),
      leg: new THREE.MeshPhysicalMaterial({ map: T.band.map, normalMap: T.band.normalMap, roughness: 0.5, clearcoat: 0.35, clearcoatRoughness: 0.3, sheen: 0.4, sheenColor: new THREE.Color('#9a8a70'), sheenRoughness: 0.6 }),
      joint: new THREE.MeshPhysicalMaterial({ color: '#2a2230', roughness: 0.45, clearcoat: 0.4 }),
      eye: new THREE.MeshPhysicalMaterial({ color: '#141016', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.05, normalMap: T.eye, normalScale: new THREE.Vector2(0.45, 0.45), iridescence: 0.25, iridescenceIOR: 1.5 }),
      ant: new THREE.MeshPhysicalMaterial({ map: T.bandU.map, normalMap: T.bandU.normalMap, roughness: 0.5, clearcoat: 0.3 }),
      shadow: new THREE.MeshBasicMaterial({ map: T.contact, transparent: true, depthWrite: false, opacity: 0.5, color: 0x000000 }),
    };
    m.ant.map.repeat.set(160, 1);
    m.ant.normalMap.repeat.set(160, 1);

    const inst = (geo, mat, count, shadow = true) => {
      const im = new THREE.InstancedMesh(geo, mat, count);
      im.frustumCulled = false;
      im.castShadow = shadow; im.receiveShadow = true;
      im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.group.add(im);
      return im;
    };

    // trunk
    const top = (rho) => 0.045 * Math.pow(Math.max(0, 1 - rho * rho), 0.6) + 0.006 * sstep(0.85, 1, rho);
    const bottom = (rho) => top(rho) - 0.035 * Math.pow(Math.max(0, 1 - rho * rho), 0.7);
    this.terg = inst(buildShell(tergiteR, top, bottom, TBBOX, lite ? 8 : 16, lite ? 30 : 72), m.terg, N_SEG);
    const stern = lite ? new THREE.SphereGeometry(1, 12, 7) : new THREE.SphereGeometry(1, 22, 14);
    stern.scale(0.15, 0.06, 0.07);
    colorize(stern, (c, x, y) => c.set('#b9a684').lerp(new THREE.Color('#5a4a40'), sstep(0.06, 0.12, Math.abs(x)) * 0.6 + sstep(0.0, 0.05, y) * 0.3));
    this.stern = inst(stern, m.body, N_SEG);
    const col = new THREE.Color();
    for (let i = 0; i < N_SEG; i++) {
      col.setHSL(0.08, 0.2, 0.9 + 0.08 * Math.sin(i * 2.3));
      this.terg.setColorAt(i, col);
    }
    this.terg.instanceColor.needsUpdate = true;
    this.shadows = inst(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), m.shadow, N_SEG, false);
    this.shadows.receiveShadow = false;
    this.shadows.renderOrder = 1;

    // legs (instanced)
    const NL = N_SEG * 2;
    const cyl = lite ? unitCyl(5, 0.78, 1) : unitCyl(10, 0.78);
    this.iCoxa = inst(cyl, m.leg, NL);
    this.iFem = inst(cyl, m.leg, NL);
    this.iTib = inst(cyl, m.leg, NL, !lite);
    this.iT1 = inst(cyl, m.leg, NL, !lite);
    this.iT2 = inst(cyl, m.leg, NL, !lite);
    this.iT3 = inst(cyl, m.leg, NL, !lite);
    this.iJoint = inst(lite ? new THREE.SphereGeometry(1, 6, 4) : new THREE.SphereGeometry(1, 10, 8), m.joint, NL * 3, !lite);

    this.legs = [];
    for (let i = 0; i < N_SEG; i++) for (const s of [-1, 1]) {
      const k = i / (N_SEG - 1);
      const ult = i === N_SEG - 1;
      const rr = (n) => Math.abs((Math.sin(i * 12.9898 + s * 78.233 + n * 37.719) * 43758.5453) % 1);
      const jit = 0.86 + 0.28 * rr(0);
      const Lf = ult ? 0.8 : (0.42 + 0.3 * k) * jit;
      const Lt = ult ? 1.0 : (0.48 + 0.35 * k) * jit;
      const Lta = ult ? 1.25 : (0.55 + 0.5 * k) * jit;
      const fan = lerp(0.95, -1.25, Math.pow(k, 0.9));
      const reach = 0.17 + (Lf + Lt) * 0.88 + Lta * 0.55;
      this.legs.push({
        i, s, k, ult, Lc: 0.075, Lf, Lt, Lta,
        lat: Math.sqrt(Math.max(0.2, reach * reach - fan * fan)),
        fwd: fan + (i % 2 ? 0.06 : -0.06) * jit,
        foot: new V3(), from: new V3(), to: new V3(), stepping: false, t: 0, dur: 0.15, lift: 0.12,
        ph: Math.random() * 6.28, arch: 0.38 + 0.2 * rr(1), shade: 0.72 + 0.28 * rr(2),
      });
    }

    // head (style can be swapped)
    this.head = new THREE.Group();
    this.group.add(this.head);
    this.T = T;
    this.setHeadStyle('orig');

    // antennae
    const lc = new THREE.Color();
    this.legs.forEach((l, n) => {
      lc.setRGB(l.shade, l.shade * 0.97, l.shade * 0.93);
      for (const im of [this.iCoxa, this.iFem, this.iTib, this.iT1, this.iT2, this.iT3]) im.setColorAt(n, lc);
    });
    for (const im of [this.iCoxa, this.iFem, this.iTib, this.iT1, this.iT2, this.iT3]) im.instanceColor.needsUpdate = true;

    this.ants = [];
    for (const s of [-1, 1]) {
      const n = 90;
      const tube = new Tube(n, 6, m.ant);
      this.group.add(tube.mesh);
      this.ants.push({
        s, tube, n, len: 3.7, ph: s > 0 ? 0.4 : 2.2,
        P: Array.from({ length: n }, () => new V3()),
        R: Array.from({ length: n }, (_, i) => lerp(0.014, 0.0035, Math.pow(i / (n - 1), 0.6))),
      });
    }

    // working buffers
    this.segPos = Array.from({ length: N_SEG }, () => new V3());
    this.rPos = Array.from({ length: N_SEG }, () => new V3());
    this.tan = Array.from({ length: N_SEG }, () => new V3());
    this.right = Array.from({ length: N_SEG }, () => new V3());
    this.upv = Array.from({ length: N_SEG }, () => new V3());
    this.lift = new Float32Array(N_SEG);
    this.speed = 0;
    this.reset(0, 0, 0);
  }

  addTo(scene) { scene.add(this.group); }

  setHeadStyle(style) {
    if (this.headParts) {
      this.head.remove(this.headParts.group);
      this.headParts.group.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
    }
    this.headStyle = style;
    this.headParts = buildHead(style, this.mats, this.T);
    this.head.add(this.headParts.group);
  }
  get center() { return this.rPos[12]; }
  get headPos() { return this.rPos[0]; }

  reset(x, z, yaw) {
    this.headXZ = new THREE.Vector2(x, z);
    this.yaw = yaw;
    this.speed = 0;
    const dx = Math.sin(yaw), dz = Math.cos(yaw);
    this.path = [];
    for (let i = 0; i < 260; i++) this.path.push(new V3(x - dx * i * 0.02, 0, z - dz * i * 0.02));
    const b = this.b;
    b.stun = false; b.curl = 0; b.lunge = 0; b.caught = false; b.immune = 0.5; b.hits = 0;
    if (this.mode === 'lunge' || this.mode === 'kill') this.mode = 'idle';
    this.kill = null;
    this.computeSegments();
    this.applyPose(0);
    for (const l of this.legs) { this.homeOf(l, l.foot); l.stepping = false; }
  }

  setMode(mode) {
    if (this.mode === 'lunge' || this.mode === 'kill') return;
    if (this.b.stun) this.b.prev = mode; else this.mode = mode;
    if (mode === 'wander') { this.b.sub = 'pause'; this.b.timer = 0.2; }
  }

  // ------------------------------------------------------ path / body
  computeSegments() {
    const head = this.headXZ;
    const out = this.segPos;
    out[0].set(head.x, 0, head.y);
    let seg = 0, acc = 0, target = SP;
    let px = head.x, pz = head.y;
    const pts = this.path;
    let cut = pts.length;
    for (let j = 0; j < pts.length && seg < N_SEG - 1; j++) {
      const qx = pts[j].x, qz = pts[j].z;
      const len = Math.hypot(qx - px, qz - pz);
      while (len > 1e-6 && acc + len >= target && seg < N_SEG - 1) {
        const f = (target - acc) / len;
        out[++seg].set(px + (qx - px) * f, 0, pz + (qz - pz) * f);
        target += SP;
      }
      acc += len; px = qx; pz = qz;
      cut = j + 1;
    }
    while (seg < N_SEG - 1) {         // extend straight if the path is too short
      const a = out[seg], b = out[Math.max(0, seg - 1)];
      const d = new V3().subVectors(a, b);
      if (d.lengthSq() < 1e-8) d.set(-Math.sin(this.yaw), 0, -Math.cos(this.yaw)); else d.normalize();
      out[seg + 1].copy(a).addScaledVector(d, SP);
      seg++;
    }
    if (pts.length > cut + 20) pts.length = cut + 20;
  }

  applyPose(dt) {
    const b = this.b, t = this.time;
    const c = b.curl, g = b.lunge;
    const piv = this.segPos[14];
    for (let i = 0; i < N_SEG; i++) {
      const p = this.rPos[i].copy(this.segPos[i]);
      p.y = BODY_Y + 0.008 * Math.sin(t * 3 + i * 0.55) + (i === N_SEG - 1 ? -0.02 : 0);
      let lift = 0;
      if (i < 14 && (c > 0 || g > 0)) {
        const w = Math.pow(1 - i / 14, 2);
        // recoil: swing the front sideways around segment 14 and rear up
        const ang = b.curlSide * 1.1 * c * w;
        const dx = p.x - piv.x, dz = p.z - piv.z;
        p.x = piv.x + dx * Math.cos(ang) + dz * Math.sin(ang);
        p.z = piv.z - dx * Math.sin(ang) + dz * Math.cos(ang);
        lift = (0.55 * c + 0.95 * g) * w;
        p.y += lift + 0.06 * c * w * Math.sin(t * 21 + i);
      }
      this.lift[i] = lift;
    }
    // lunge pushes the raised front toward the target
    if (g > 0 && this.lungeDir && this.mode !== 'kill') {
      for (let i = 0; i < 14; i++) {
        const w = Math.pow(1 - i / 14, 2);
        this.rPos[i].addScaledVector(this.lungeDir, 0.55 * g * w);
      }
    }
    // caught: the front rears up into your face; then, as you go down, it drops onto you and coils right
    // round you on the floor, the head hanging over your face, lowering, until it strikes
    if (this.mode === 'kill' && this.kill) {
      const K = this.kill, cam = K.cam, NK = 28;
      const sm = (x) => { x = clamp(x, 0, 1); return x * x * (3 - 2 * x); };
      const rear = sm(K.t / 0.5), pin = sm((K.t - 0.55) / 0.6), lower = sm((K.t - 1.5) / 0.85), strike = sm((K.t - 2.35) / 0.18);
      // the rest of the body slides in after you (the whole trunk is recomputed from the path each frame)
      const b0 = this.rPos[NK], tc = new V3(cam.x - b0.x, 0, cam.z - b0.z), dC = tc.length() || 1;
      tc.divideScalar(dC);
      const pull = Math.max(0, dC - 1.1) * pin;
      for (let i = NK; i < N_SEG; i++) this.rPos[i].addScaledVector(tc, pull);
      const base = this.rPos[NK], base14 = this.rPos[14];
      const dir = new V3(cam.x - base14.x, 0, cam.z - base14.z); dir.divideScalar(dir.length() || 1);
      const head1 = new V3(cam.x - dir.x * 0.62, cam.y - 0.12 + 0.04 * Math.sin(t * 7), cam.z - dir.z * 0.62);
      // the coil: round you at r, starting next to where the body comes in, almost all the way round
      const r = 0.42, ab = Math.atan2(base.x - cam.x, base.z - cam.z), step = SP / r;
      const ring = (j) => { const a = ab + 0.4 + (j - 3) * step; return new V3(cam.x + Math.sin(a) * r, BODY_Y + 0.05 + 0.03 * Math.sin(t * 6 + j), cam.z + Math.cos(a) * r); };
      const r3 = ring(3), out = new V3(r3.x - cam.x, 0, r3.z - cam.z).normalize();
      const hover = 0.5 - 0.24 * lower - 0.2 * strike;
      const head2 = new V3(cam.x + out.x * 0.08 * (1 - strike), cam.y + hover + 0.03 * Math.sin(t * 9), cam.z + out.z * 0.08 * (1 - strike));
      const n1 = head2.clone().addScaledVector(out, 0.08); n1.y += 0.1;
      const n2 = n1.clone().lerp(r3, 0.5); n2.y += 0.12;
      for (let i = 0; i < NK; i++) {
        const u = i / 14;
        let tgt;
        if (i < 14) { tgt = head1.clone().lerp(base14, u); tgt.y = Math.max(BODY_Y, tgt.y + Math.sin(u * Math.PI) * 0.18); }
        else tgt = this.rPos[i].clone();
        if (pin > 0) {
          const c2 = i === 0 ? head2.clone() : i === 1 ? n1.clone() : i === 2 ? n2.clone() : i <= 21 ? ring(i) : ring(21).lerp(base, (i - 21) / (NK - 21));
          tgt.lerp(c2, pin);
        }
        const wr = i < 22 ? 1 - Math.min(1, i / 22) * 0.4 : 0.5;
        tgt.x += Math.sin(t * 9 + i * 0.8) * 0.03 * wr; tgt.z += Math.cos(t * 8 + i * 0.7) * 0.03 * wr;
        this.rPos[i].lerp(tgt, (i < 14 ? rear * (1 - u * 0.5) : pin) );
      }
    }
    for (let i = 0; i < N_SEG; i++) {
      const a = this.rPos[Math.max(0, i - 1)], bb = this.rPos[Math.min(N_SEG - 1, i + 1)];
      const T = this.tan[i].subVectors(a, bb);
      if (T.lengthSq() < 1e-9) T.set(Math.sin(this.yaw), 0, Math.cos(this.yaw));
      T.normalize();
      const R = this.right[i].crossVectors(UPV, T);
      if (R.lengthSq() < 1e-6) R.set(1, 0, 0);
      R.normalize();
      this.upv[i].crossVectors(T, R).normalize();
    }
  }

  homeOf(l, out) {
    const P = this.segPos[l.i], R = this.right[l.i], T = this.tan[l.i];
    out.set(P.x + R.x * l.s * l.lat + T.x * l.fwd, 0.006, P.z + R.z * l.s * l.lat + T.z * l.fwd);
    return out;
  }

  inCone(p, light) {
    const vx = p.x - light.pos.x, vy = p.y - light.pos.y, vz = p.z - light.pos.z;
    const d = Math.hypot(vx, vy, vz);
    return d < 22 && (vx * light.dir.x + vy * light.dir.y + vz * light.dir.z) / d > Math.cos(0.17);
  }

  // ------------------------------------------------------ behaviour
  think(dt, light, cam) {
    const b = this.b;
    if (this.mode === 'kill') { this.kill.t += dt; b.lunge = Math.min(1, b.lunge + dt * 3); b.curl = 0; b.stun = false; return 0; }
    const lit = !!(light && light.on && (this.inCone(this.rPos[0], light) || this.inCone(this.rPos[6], light)));
    if (this.time - b.lastHit > 12) b.hits = 0;
    let desired = 0;
    if (b.stun) {
      b.hold -= dt;
      if (b.hold > 0) b.curl = Math.min(1, b.curl + dt * 5);
      else {
        b.curl = Math.max(0, b.curl - dt * 2.2);
        if (b.curl <= 0.01) { b.stun = false; b.curl = 0; this.mode = b.prev; b.immune = 1.0; }
      }
    } else if (this.mode === 'lunge') {
      b.lt += dt;
      b.lunge = Math.min(1, b.lt / 0.35);
      if (b.lt > 0.5 && !b.caught) { b.caught = true; this.onCatch && this.onCatch(); }
    } else {
      b.immune -= dt;
      const moving = this.mode !== 'idle' || this.speed > 0.1;
      if (lit && b.immune <= 0 && (moving || !this.wasLit)) {
        b.stun = true; b.prev = this.mode;
        b.hold = b.hits < 2 ? 2.0 : 1.0;
        b.hits++; b.lastHit = this.time;
        b.curlSide = Math.random() < 0.5 ? -1 : 1;
        this.onStun && this.onStun(b.hits, b.hold);
      } else if (this.mode === 'drive') {
        desired = this.driveSpeed || 0;
      } else if (this.mode === 'chase' && cam) {
        b.target.set(cam.x, cam.z);
        desired = 3.3;
        if (Math.hypot(cam.x - this.headXZ.x, cam.z - this.headXZ.y) < 2.2) {
          this.mode = 'lunge'; b.lt = 0; b.caught = false;
          this.lungeDir = new V3(cam.x - this.headXZ.x, 0, cam.z - this.headXZ.y).normalize();
        }
      } else if (this.mode === 'wander') {
        b.timer -= dt;
        const reached = Math.hypot(b.target.x - this.headXZ.x, b.target.y - this.headXZ.y) < 0.8;
        if (b.timer <= 0 || (b.sub === 'go' && reached)) {
          if (b.sub === 'go') { b.sub = 'pause'; b.timer = 0.4 + Math.random() * 1.8; }
          else {
            b.sub = 'go'; b.timer = 1.2 + Math.random() * 2.2;
            b.speed = Math.random() < 0.7 ? 1.6 + Math.random() * 1.6 : 0.6;
            for (let tries = 0; tries < 12; tries++) {
              const a = this.yaw + (Math.random() - 0.5) * 2.6, d = 2.5 + Math.random() * 4;
              let x = this.headXZ.x + Math.sin(a) * d, z = this.headXZ.y + Math.cos(a) * d;
              const l = Math.hypot(x, z);
              if (l > 7.5) { x *= 5 / l; z *= 5 / l; }
              if (this.obstacles.every((o) => Math.hypot(x - o.x, z - o.z) > o.r + 1.5)) { b.target.set(x, z); break; }
            }
          }
        }
        desired = b.sub === 'go' ? b.speed : 0;
      }
    }
    this.wasLit = lit;
    this.lit = lit;
    return desired;
  }

  // ------------------------------------------------------ update
  update(dt, light, cam) {
    this.time += dt;
    const t = this.time, b = this.b;
    let desired = this.think(dt, light, cam);

    // steer the head (with obstacle avoidance), body follows the trail
    if (desired > 0) {
      let vx = b.target.x - this.headXZ.x, vz = b.target.y - this.headXZ.y;
      const vl = Math.hypot(vx, vz) || 1; vx /= vl; vz /= vl;
      for (const o of this.obstacles) {
        const ox = this.headXZ.x - o.x, oz = this.headXZ.y - o.z, d = Math.hypot(ox, oz);
        const rr = o.r + 1.2;
        if (d < rr) { vx += (ox / d) * (rr - d) * 2.5; vz += (oz / d) * (rr - d) * 2.5; }
      }
      const ty = Math.atan2(vx, vz);
      let dy = ty - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const tr = 2.4 + this.speed * 0.5;
      this.yaw += clamp(dy, -tr * dt, tr * dt);
      desired *= Math.max(this.mode === 'chase' || this.mode === 'drive' ? 0.45 : 0.15, Math.cos(dy));
    }
    this.speed += clamp(desired - this.speed, -9 * dt, 6 * dt);
    this.headXZ.x += Math.sin(this.yaw) * this.speed * dt;
    this.headXZ.y += Math.cos(this.yaw) * this.speed * dt;
    const p0 = this.path[0];
    if (Math.hypot(this.headXZ.x - p0.x, this.headXZ.y - p0.z) > 0.02) this.path.unshift(new V3(this.headXZ.x, 0, this.headXZ.y));

    this.computeSegments();
    this.applyPose(dt);
    this.updateTrunk();
    this.updateHead(t);
    this.updateLegs(dt, t);
    this.updateAntennae(t);
  }

  updateTrunk() {
    const M = new THREE.Matrix4(), S = new THREE.Matrix4(), q = new V3();
    for (let i = 0; i < N_SEG; i++) {
      const k = i / (N_SEG - 1);
      const w = 0.72 + 0.34 * Math.pow(Math.sin(Math.PI * Math.min(1, k * 1.08)), 0.6);
      const P = this.rPos[i], R = this.right[i], U = this.upv[i], T = this.tan[i];
      M.makeBasis(q.copy(R).multiplyScalar(w), U, T);
      M.setPosition(P.x + U.x * 0.03, P.y + U.y * 0.03, P.z + U.z * 0.03);
      this.terg.setMatrixAt(i, M);
      M.makeBasis(q.copy(R).multiplyScalar(w), U, T);
      M.setPosition(P.x - U.x * 0.035, P.y - U.y * 0.035, P.z - U.z * 0.035);
      this.stern.setMatrixAt(i, M);
      const hgt = P.y;
      const sc = 1 + hgt * 0.8;
      S.makeBasis(q.copy(R).multiplyScalar(0.6 * w * sc), UPV, new V3().copy(T).setY(0).normalize().multiplyScalar(0.34 * sc));
      S.setPosition(P.x, 0.004, P.z);
      this.shadows.setMatrixAt(i, S);
    }
    this.terg.instanceMatrix.needsUpdate = true;
    this.stern.instanceMatrix.needsUpdate = true;
    this.shadows.instanceMatrix.needsUpdate = true;
  }

  updateHead(t) {
    const P = this.rPos[0], R = this.right[0], U = this.upv[0], T = this.tan[0];
    const m = new THREE.Matrix4().makeBasis(R, U, T);
    this.head.quaternion.setFromRotationMatrix(m);
    const lk = this.look;
    const look = new THREE.Quaternion().setFromEuler(new THREE.Euler(0.12 - 0.35 * this.b.lunge + 0.08 * this.b.curl - 0.3 * lk, 0.12 * Math.sin(t * 0.9) + lk * 0.6 * Math.sin(t * 1.1 + 1.6 * Math.sin(t * 0.37)), 0));
    this.head.quaternion.multiply(look);
    this.head.position.copy(P).addScaledVector(T, 0.11).addScaledVector(U, 0.005);
    const open = this.mode === 'kill' ? (this.kill && this.kill.t < 1.5 ? 0.6 + 0.25 * Math.sin(t * 9) : 0.95 + 0.12 * Math.sin(t * 26)) : 0.25 + 0.5 * Math.max(this.b.lunge, this.b.curl * 0.6) + 0.06 * Math.sin(t * 2.3);
    this.headParts.animate(t, open);
    this.head.updateMatrixWorld(true);
  }

  updateLegs(dt, t) {
    const v = this.speed;
    const thr = v < 0.05 ? 0.1 : 0.12 + v * 0.085;
    const stepDur = clamp(0.2 - v * 0.035, 0.07, 0.2);
    const lift = 0.1 + 0.03 * v;
    const homeW = new V3(), tmp = new V3();
    const legs = this.legs;
    // idle fidget: random legs twitch
    if (v < 0.05 && Math.random() < dt * 7) {
      const l = legs[Math.floor(Math.random() * legs.length)];
      if (!l.stepping && !l.ult) {
        this.homeOf(l, homeW);
        l.from.copy(l.foot); l.to.copy(homeW).add(tmp.set((Math.random() - 0.5) * 0.12, 0, (Math.random() - 0.5) * 0.12));
        l.stepping = true; l.t = 0; l.dur = 0.22; l.lift = 0.07;
      }
    }
    for (let n = 0; n < legs.length; n++) {
      const l = legs[n];
      const T = this.tan[l.i], R = this.right[l.i];
      if (l.ult) {
        // trailing antenna-like last pair
        const P = this.rPos[l.i];
        l.foot.set(P.x - T.x * 1.9 + R.x * l.s * 0.75, 0.16 + 0.1 * Math.sin(t * 1.3 + l.s), P.z - T.z * 1.9 + R.z * l.s * 0.75);
        l.foot.addScaledVector(R, 0.2 * Math.sin(t * 0.9 + l.ph));
        continue;
      }
      this.homeOf(l, homeW);
      const lf = this.lift[l.i];
      if (lf > 0.1) {
        // raised segments: legs let go and flail
        tmp.copy(homeW).lerp(this.rPos[l.i], 0.35);
        tmp.y = this.rPos[l.i].y * 0.6 + 0.1 + 0.12 * Math.sin(t * 17 + l.ph);
        tmp.addScaledVector(T, 0.15 * Math.sin(t * 13 + l.ph * 2));
        l.foot.lerp(tmp, 1 - Math.exp(-dt * 14));
        l.stepping = false;
        continue;
      }
      if (l.stepping) {
        l.t = Math.min(1, l.t + dt / l.dur);
        const e = l.t * l.t * (3 - 2 * l.t);
        l.foot.lerpVectors(l.from, l.to, e);
        l.foot.y = 0.006 + l.lift * Math.sin(Math.PI * l.t);
        if (l.t >= 1) { l.stepping = false; l.foot.copy(l.to); }
        continue;
      }
      if (l.foot.y > 0.02) l.foot.y = Math.max(0.006, l.foot.y - dt * 3);
      const err = Math.hypot(l.foot.x - homeW.x, l.foot.z - homeW.z);
      if (err > thr) {
        const prev = legs[n - 2], next = legs[n + 2], opp = legs[n ^ 1];
        const blocked = (prev && prev.stepping) || (next && next.stepping) || (opp && opp.stepping);
        if (!blocked || err > thr * 1.9) {
          l.from.copy(l.foot);
          l.to.copy(homeW);
          if (v > 0.05) l.to.addScaledVector(T, thr * 0.7 + v * stepDur * 0.5);
          l.to.y = 0.006;
          l.stepping = true; l.t = 0; l.dur = stepDur * (0.9 + Math.random() * 0.2); l.lift = lift;
        }
      }
    }
    // pose every leg (2-bone IK + curved tarsus)
    const M = new THREE.Matrix4();
    const hip = new V3(), C = new V3(), K = new V3(), A = new V3(), h = new V3(), td = new V3();
    const q0 = new V3(), q1 = new V3(), q2 = new V3(), q3 = new V3(), b1 = new V3();
    const bez = (o, a, c, d, s) => o.set(
      (1 - s) * (1 - s) * a.x + 2 * (1 - s) * s * c.x + s * s * d.x,
      (1 - s) * (1 - s) * a.y + 2 * (1 - s) * s * c.y + s * s * d.y,
      (1 - s) * (1 - s) * a.z + 2 * (1 - s) * s * c.z + s * s * d.z);
    if (this.skipLegPose) return;                 // (someone else draws the legs)
    for (let n = 0; n < legs.length; n++) {
      const l = legs[n];
      const P = this.rPos[l.i], R = this.right[l.i], U = this.upv[l.i];
      hip.copy(P).addScaledVector(R, l.s * 0.15).addScaledVector(U, -0.02);
      C.copy(hip).addScaledVector(tmp.copy(R).multiplyScalar(l.s * 0.85).addScaledVector(U, -0.35).normalize(), l.Lc);
      const F = l.foot;
      h.set(F.x - C.x, 0, F.z - C.z);
      const hl = h.length() || 1; h.divideScalar(hl);
      A.copy(F).addScaledVector(h, -l.Lta * 0.62);
      A.y = Math.max(F.y + l.Lta * l.arch, 0.06);
      const dx = Math.hypot(A.x - C.x, A.z - C.z), dy = A.y - C.y;
      let D = Math.hypot(dx, dy);
      D = clamp(D, Math.abs(l.Lf - l.Lt) + 0.05, (l.Lf + l.Lt) * 0.995);
      const al = Math.atan2(dy, dx);
      const gm = Math.acos(clamp((l.Lf * l.Lf + D * D - l.Lt * l.Lt) / (2 * l.Lf * D), -1, 1));
      const th = al + gm;
      K.copy(C).addScaledVector(h, l.Lf * Math.cos(th)); K.y += l.Lf * Math.sin(th);
      const Aa = q0.copy(C).addScaledVector(h, D * Math.cos(al)); Aa.y += D * Math.sin(al);
      td.subVectors(Aa, K).normalize();
      b1.copy(Aa).addScaledVector(td, l.Lta * 0.38);
      bez(q1, Aa, b1, F, 1 / 3); bez(q2, Aa, b1, F, 2 / 3); q3.copy(F);
      const sc = 0.85 + 0.25 * l.k;
      this.iCoxa.setMatrixAt(n, segMatrix(M, hip, C, UPV, 0.03 * sc));
      this.iFem.setMatrixAt(n, segMatrix(M, C, K, UPV, 0.018 * sc));
      this.iTib.setMatrixAt(n, segMatrix(M, K, Aa, h, 0.0135 * sc));
      this.iT1.setMatrixAt(n, segMatrix(M, Aa, q1, h, 0.0095 * sc));
      this.iT2.setMatrixAt(n, segMatrix(M, q1, q2, h, 0.0075 * sc));
      this.iT3.setMatrixAt(n, segMatrix(M, q2, q3, h, 0.006 * sc));
      M.makeScale(0.028 * sc, 0.028 * sc, 0.028 * sc).setPosition(C); this.iJoint.setMatrixAt(n * 3, M);
      M.makeScale(0.018 * sc, 0.018 * sc, 0.018 * sc).setPosition(K); this.iJoint.setMatrixAt(n * 3 + 1, M);
      M.makeScale(0.012 * sc, 0.012 * sc, 0.012 * sc).setPosition(Aa); this.iJoint.setMatrixAt(n * 3 + 2, M);
    }
    for (const im of [this.iCoxa, this.iFem, this.iTib, this.iT1, this.iT2, this.iT3, this.iJoint]) im.instanceMatrix.needsUpdate = true;
  }

  updateAntennae(t) {
    const q = new THREE.Quaternion(), qt = new THREE.Quaternion(), e = new THREE.Euler(0, 0, 0, 'YXZ'), dir = new V3();
    const qh = this.head.quaternion;
    const c = this.b.curl, g = this.b.lunge, run = clamp(this.speed / 3, 0, 1);
    for (const a of this.ants) {
      a.P[0].copy(this.headParts.socket(a.s)).applyMatrix4(this.head.matrixWorld);
      const thrash = c * Math.sin(t * 14 + a.ph) * 0.5;
      const yawB = a.s * (0.38 + 0.45 * Math.sin(t * 0.7 + a.ph) * (1 - run * 0.6) + 0.12 * Math.sin(t * 2.9 + a.ph * 2)) + thrash - a.s * 0.25 * g;
      const pitB = -0.3 + 0.18 * Math.sin(t * 1.1 + a.ph) - 0.5 * c - 0.3 * g;
      q.copy(qh).multiply(qt.setFromEuler(e.set(pitB, yawB, 0)));
      const seg = a.len / (a.n - 1);
      for (let i = 1; i < a.n; i++) {
        const k = i / (a.n - 1);
        const bp = 0.016 * Math.pow(k, 0.5) * (1 - 0.6 * c) + 0.012 * Math.sin(t * 2.1 - k * 7 + a.ph) * k;
        const by = a.s * 0.004 + 0.016 * Math.sin(t * 3.1 - k * 8 + a.ph * 1.7) * k + 0.03 * c * Math.sin(t * 19 + k * 12);
        q.multiply(qt.setFromEuler(e.set(bp, by, 0)));
        dir.set(0, 0, 1).applyQuaternion(q);
        a.P[i].copy(a.P[i - 1]).addScaledVector(dir, seg);
        if (a.P[i].y < 0.008) a.P[i].y = 0.008;
      }
      a.tube.update(a.P, a.R);
    }
  }
}
