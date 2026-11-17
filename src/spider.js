import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { Tube } from './tube.js';
import { sstep } from './textures.js';
import { colorize, smoothSeams } from './roach.js';

const V3 = THREE.Vector3;
const lerp = THREE.MathUtils.lerp;
const clamp = THREE.MathUtils.clamp;
const UPV = new V3(0, 1, 0);

// Spiders are built standing on a surface at local y = 0, facing +Z.
// On the ceiling the whole root is flipped so local up points at the floor.
const PRESETS = {
  wolf: {
    H: 0.13,
    pro: { c: [0, 0, 0.07], r: [0.08, 0.05, 0.1] },
    abd: { c: [0, 0.02, -0.19], r: [0.09, 0.075, 0.13] },
    legLen: [0.68, 0.62, 0.58, 0.76], hipAng: [0.55, 1.15, 1.95, 2.55], footAng: [0.45, 1.12, 2.0, 2.68], footR: [0.57, 0.52, 0.48, 0.63],
    legR: 0.017, ka: 0.28, kh: 0.85, hair: true,
  },
  ghost: {
    H: 0.24,
    pro: { c: [0, 0, 0.03], r: [0.04, 0.03, 0.04] },
    abd: { c: [0, 0.035, -0.11], r: [0.033, 0.033, 0.095] },
    legLen: [1.1, 0.88, 0.76, 0.98], hipAng: [0.55, 1.15, 1.95, 2.55], footAng: [0.42, 1.1, 2.05, 2.75], footR: [0.86, 0.68, 0.6, 0.78],
    legR: 0.0058, ka: 0.5, kh: 0.78, hair: false,
  },
};
const SEG_F = [0.06, 0.28, 0.07, 0.22, 0.24, 0.13]; // coxa femur patella tibia metatarsus tarsus

function rng(seed) { let s = seed; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }

function legSeg({ len, r0, r1, c0, c1, joint, hairs = 0, hairLen = 0.02, hairCol, spines = 0, rand }) {
  const parts = [];
  const cyl = new THREE.CylinderGeometry(1, 1, len, 10, 6, true);
  cyl.translate(0, len / 2, 0);
  const p = cyl.attributes.position, n = cyl.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const f = p.getY(i) / len, r = lerp(r0, r1, f);
    p.setX(i, p.getX(i) * r); p.setZ(i, p.getZ(i) * r);
    const l = Math.hypot(n.getX(i), n.getZ(i)) || 1; n.setXYZ(i, n.getX(i) / l, 0, n.getZ(i) / l);
  }
  colorize(cyl, (c, x, y) => { const f = y / len; c.copy(c0).lerp(c1, f).lerp(joint, Math.max(1 - sstep(0, 0.12, f), sstep(0.88, 1, f)) * 0.6); });
  parts.push(cyl);
  const k = new THREE.SphereGeometry(1, 10, 8); k.scale(r0 * 1.06, r0 * 1.06, r0 * 1.06);
  colorize(k, (c) => c.copy(joint)); parts.push(k);
  const e = new THREE.SphereGeometry(1, 10, 6); e.scale(r1, r1 * 0.9, r1); e.translate(0, len, 0);
  colorize(e, (c) => c.copy(joint)); parts.push(e);
  const q = new THREE.Quaternion();
  const addCone = (f, ang, l, r, tilt, col) => {
    const cone = new THREE.ConeGeometry(r, l, 4, 1);
    cone.translate(0, l / 2, 0);
    const radial = new V3(Math.cos(ang), 0, Math.sin(ang));
    const dir = radial.clone().multiplyScalar(Math.cos(tilt)).add(new V3(0, Math.sin(tilt), 0)).normalize();
    q.setFromUnitVectors(UPV, dir); cone.applyQuaternion(q);
    const rr = lerp(r0, r1, f) * 0.9;
    cone.translate(Math.cos(ang) * rr, f * len, Math.sin(ang) * rr);
    colorize(cone, (c) => c.copy(col));
    parts.push(cone);
  };
  for (let h = 0; h < hairs; h++) addCone(rand(), rand() * 6.283, hairLen * (0.6 + rand() * 0.7), 0.0016, 1.15 + rand() * 0.25, hairCol);
  for (let h = 0; h < spines; h++) addCone(0.2 + rand() * 0.7, rand() * 6.283, hairLen * 2.2, 0.0035, 0.75, joint);
  return mergeGeometries(parts);
}

function ellipsoid(rx, ry, rz, seg, deform, colorFn) {
  const g = new THREE.SphereGeometry(1, seg, Math.round(seg * 0.75));
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const v = deform(p.getX(i), p.getY(i), p.getZ(i));
    p.setXYZ(i, v[0] * rx, v[1] * ry, v[2] * rz);
  }
  g.computeVertexNormals();
  smoothSeams(g);
  colorize(g, colorFn);
  return g;
}

// fur: many short cones scattered over an ellipsoid
function furOn(c, r, count, len, col, col2, rand, filter) {
  const parts = [];
  const q = new THREE.Quaternion();
  for (let i = 0; i < count; i++) {
    const d = new V3(rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1);
    if (d.lengthSq() < 0.01) continue;
    d.normalize();
    if (filter && !filter(d)) continue;
    const p = new V3(d.x * r[0], d.y * r[1], d.z * r[2]);
    const nrm = new V3(d.x / r[0], d.y / r[1], d.z / r[2]).normalize();
    const dir = nrm.clone().addScaledVector(new V3(0, 0.15, -1), 0.9).normalize(); // hairs lie back
    const l = len * (0.6 + rand() * 0.8);
    const cone = new THREE.ConeGeometry(0.0022, l, 3, 1);
    cone.translate(0, l / 2, 0);
    q.setFromUnitVectors(UPV, dir); cone.applyQuaternion(q);
    cone.translate(p.x + c[0], p.y + c[1], p.z + c[2]);
    colorize(cone, (cc) => cc.copy(rand() < 0.5 ? col : col2));
    parts.push(cone);
  }
  return mergeGeometries(parts);
}

const _x = new V3(), _y = new V3(), _z = new V3();
const _fa = new V3(), _fb = new V3(), _fc = new V3();
function placeSeg(mesh, p0, p1, up, len) {
  _y.subVectors(p1, p0);
  const d = _y.length() || 1e-6;
  _y.divideScalar(d);
  _z.copy(up).addScaledVector(_y, -up.dot(_y));
  if (_z.lengthSq() < 1e-8) _z.set(0, 0, 1).addScaledVector(_y, -_y.z);
  _z.normalize();
  _x.crossVectors(_y, _z);
  _y.multiplyScalar(d / len);
  mesh.matrix.makeBasis(_x, _y, _z);
  mesh.matrix.setPosition(p0);
  mesh.matrixWorldNeedsUpdate = true;
}

export class Spider {
  constructor(type, T) {
    this.type = type;
    const P = this.P = PRESETS[type];
    const rand = rng(type === 'wolf' ? 17 : 29);
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.body.position.y = P.H;
    this.root.add(this.body);
    this.time = 0;
    const wolf = type === 'wolf';

    this.mats = {
      body: new THREE.MeshPhysicalMaterial({
        vertexColors: true, roughness: wolf ? 0.62 : 0.38, clearcoat: wolf ? 0.25 : 0.7, clearcoatRoughness: 0.3,
        normalMap: T.chitin, normalScale: new THREE.Vector2(0.5, 0.5),
        sheen: wolf ? 0.8 : 0.5, sheenRoughness: 0.5, sheenColor: new THREE.Color(wolf ? '#8a7258' : '#f0e4d0'),
      }),
      eye: new THREE.MeshPhysicalMaterial({
        color: '#060507', roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.02,
        emissive: new THREE.Color(wolf ? '#cfffe0' : '#ffe0b0'), emissiveIntensity: 0,
      }),
    };
    const shadowed = (m) => { m.castShadow = true; m.receiveShadow = true; return m; };

    // ---- prosoma (head-thorax)
    const pc = P.pro.c, pr = P.pro.r, ac = P.abd.c, ar = P.abd.r;
    const carD = new THREE.Color(wolf ? '#33241a' : '#bfb19a'), carP = new THREE.Color(wolf ? '#8c7254' : '#e2d7c2'), carG = new THREE.Color(wolf ? '#1c130c' : '#8e8070');
    const pro = ellipsoid(pr[0], pr[1], pr[2], 48, (x, y, z) => {
      const up = y > 0 ? 1 + 0.45 * Math.max(0, z) * (wolf ? 1 : 0.3) : 0.7;   // raised eye region in front
      return [x * (1 - 0.15 * Math.max(0, z)), y * up, z];
    }, (c, x, y, z) => {
      c.copy(carD);
      if (y > 0) {
        const a = Math.atan2(x, z - pc[2] * 0);
        c.lerp(carP, Math.exp(-(x * x) / (wolf ? 0.00035 : 0.0002)) * 0.9);                  // pale median band
        if (wolf) c.lerp(carP, Math.exp(-((Math.abs(x) - pr[0] * 0.8) ** 2) / 0.0003) * 0.6); // lateral bands
        c.lerp(carG, Math.pow(Math.abs(Math.sin(a * 4)), 30) * 0.5 * sstep(0.02, 0.06, Math.hypot(x, z)));
      } else c.lerp(carP, 0.25);
    });
    const proMesh = shadowed(new THREE.Mesh(pro, this.mats.body));
    proMesh.position.set(pc[0], pc[1], pc[2]);
    this.body.add(proMesh);
    this.pro = proMesh; this.jaws = [];

    // ---- opisthosoma (abdomen)
    const abD = new THREE.Color(wolf ? '#3e2c1c' : '#c4b8a2'), abK = new THREE.Color(wolf ? '#1e140c' : '#8a7e70'), abP = new THREE.Color(wolf ? '#9a8064' : '#ece2d0');
    const abd = ellipsoid(ar[0], ar[1], ar[2], 56, (x, y, z) => [x * (1 - 0.15 * Math.max(0, -z)), y * (y < 0 ? 0.85 : 1), z], (c, x, y, z) => {
      c.copy(abD);
      const zz = z / ar[2];
      if (y > 0) {
        c.lerp(abK, Math.exp(-(x * x) / 0.0005) * sstep(-0.1, 0.4, zz) * 0.85);              // cardiac mark
        const chev = Math.abs(Math.sin((zz + Math.abs(x) / ar[0] * 0.6) * 9));
        c.lerp(abK, Math.pow(chev, 6) * sstep(0.2, -0.3, zz) * 0.6);                           // chevrons
        c.lerp(abP, Math.pow(Math.abs(Math.sin(x * 120) * Math.sin(z * 90)), 12) * 0.5);      // pale flecks
      } else c.lerp(abP, 0.3);
    });
    const abdMesh = shadowed(new THREE.Mesh(abd, this.mats.body));
    abdMesh.position.set(ac[0], ac[1], ac[2]);
    this.body.add(abdMesh);
    this.abdomen = abdMesh;
    // pedicel
    const ped = shadowed(new THREE.Mesh(colorize(new THREE.CylinderGeometry(0.012, 0.012, 0.06, 8).rotateX(Math.PI / 2), (c) => c.copy(carG)), this.mats.body));
    ped.position.set(0, 0.005, (pc[2] - pr[2] + ac[2] + ar[2]) / 2);
    this.body.add(ped);
    if (P.hair) {
      const furCol = new THREE.Color('#6e5a44'), furCol2 = new THREE.Color('#a48c6c');
      const f1 = shadowed(new THREE.Mesh(furOn(ac, ar, 1400, 0.03, furCol, furCol2, rand, (d) => d.y > -0.3), this.mats.body));
      const f2 = shadowed(new THREE.Mesh(furOn(pc, pr, 500, 0.02, furCol, furCol2, rand, (d) => d.y > -0.1), this.mats.body));
      this.body.add(f1, f2);
    }
    // spinnerets
    const sp = shadowed(new THREE.Mesh(colorize(new THREE.ConeGeometry(wolf ? 0.016 : 0.008, 0.03, 8).rotateX(-Math.PI / 2), (c) => c.copy(carG)), this.mats.body));
    sp.position.set(0, ac[1] - ar[1] * 0.2, ac[2] - ar[2] - 0.006);
    this.body.add(sp);
    this.spinneret = new V3(0, ac[1] - ar[1] * 0.2, ac[2] - ar[2] - 0.02);

    // ---- eyes
    const eyes = wolf
      ? [[0.022, 0.044, 0.135, 0.017], [0.012, 0.022, 0.158, 0.008], [0.03, 0.018, 0.153, 0.007], [0.045, 0.05, 0.105, 0.012]]
      : [[0.016, 0.028, 0.06, 0.006], [0.022, 0.026, 0.055, 0.005], [0.012, 0.03, 0.054, 0.005], [0.006, 0.03, 0.064, 0.004]];
    this.eyeMeshes = [];
    for (const [x, y, z, r] of eyes) for (const s of [-1, 1]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), this.mats.eye);
      e.position.set(s * x, y + pc[1], z - (wolf ? 0.07 : 0.03) + pc[2]);
      this.body.add(e);
      this.eyeMeshes.push(e);
    }

    // ---- chelicerae and fangs
    for (const s of [-1, 1]) {
      const ch = shadowed(new THREE.Mesh(colorize(new THREE.SphereGeometry(1, 16, 12).scale(wolf ? 0.022 : 0.008, wolf ? 0.032 : 0.012, wolf ? 0.02 : 0.008), (c) => c.set(wolf ? '#24170e' : '#a89880')), this.mats.body));
      ch.position.set(s * (wolf ? 0.019 : 0.008), pc[1] - (wolf ? 0.025 : 0.012), pc[2] + pr[2] * 0.85);
      this.body.add(ch); this.jaws.push(ch);
      const fang = shadowed(new THREE.Mesh(colorize(new THREE.ConeGeometry(wolf ? 0.007 : 0.003, wolf ? 0.03 : 0.012, 6).rotateX(Math.PI).rotateZ(-s * 0.6), (c) => c.set('#080506')), this.mats.body));
      fang.position.set(s * (wolf ? 0.016 : 0.007), pc[1] - (wolf ? 0.06 : 0.024), pc[2] + pr[2] * 0.9);
      this.body.add(fang); this.jaws.push(fang);
    }

    // ---- pedipalps (short front "arms")
    this.palps = [];
    for (const s of [-1, 1]) {
      const n = 9;
      const palpMat = new THREE.MeshPhysicalMaterial({ color: wolf ? '#4a3626' : '#c2b49c', roughness: 0.5, sheen: 0.6, sheenColor: new THREE.Color('#8a7258') });
      const tube = new Tube(n, 7, palpMat);
      this.body.add(tube.mesh);
      this.palps.push({ s, tube, n, P: Array.from({ length: n }, () => new V3()), R: Array.from({ length: n }, (_, i) => (wolf ? 0.012 : 0.004) * (1 - 0.35 * i / n) * (i === n - 1 ? 1.3 : 1)) });
    }

    // ---- legs
    const legCols = wolf
      ? { c0: new THREE.Color('#4a3828'), c1: new THREE.Color('#3a2a1c'), joint: new THREE.Color('#1e150e'), hair: new THREE.Color('#6a5640') }
      : { c0: new THREE.Color('#bcae96'), c1: new THREE.Color('#a89a84'), joint: new THREE.Color('#3a3030'), hair: new THREE.Color('#d8ccb8') };
    this.legs = [];
    for (let i = 0; i < 4; i++) for (const s of [-1, 1]) {
      const L = P.legLen[i];
      const lens = SEG_F.map((f) => f * L);
      const ha = P.hipAng[i], fa = P.footAng[i];
      const leg = {
        i, s, group: (i + (s > 0 ? 1 : 0)) % 2, lens,
        hip: new V3(pc[0] + s * Math.sin(ha) * pr[0] * 0.82, pc[1] - 0.012, pc[2] + Math.cos(ha) * pr[2] * 0.82),
        home: new V3(s * Math.sin(fa) * P.footR[i], 0, pc[2] + Math.cos(fa) * P.footR[i]),
        foot: new V3(), from: new V3(), to: new V3(), stepping: false, t: 0, dur: 0.15, lift: 0.08, ph: rand() * 6.28,
        meshes: [],
      };
      for (let k = 0; k < 6; k++) {
        const r0 = P.legR * (k === 0 ? 1.4 : 1.15 - k * 0.12), r1 = P.legR * (k === 0 ? 1.2 : 1.05 - k * 0.13);
        let c0 = legCols.c0, c1 = legCols.c1;
        if (!wolf && k === 2) { c0 = legCols.joint; c1 = legCols.joint; }                           // dark knee band
        if (!wolf && k === 3) { c1 = new THREE.Color('#efe6d6'); }                                   // pale ring
        const g = legSeg({
          len: lens[k], r0: Math.max(0.0025, r0), r1: Math.max(0.002, r1), c0, c1, joint: legCols.joint,
          hairs: wolf ? Math.round(lens[k] * 260) : 0, hairLen: 0.022, hairCol: legCols.hair,
          spines: wolf && (k === 1 || k === 3 || k === 4) ? 4 : 0, rand,
        });
        const m = shadowed(new THREE.Mesh(g, this.mats.body));
        m.matrixAutoUpdate = false;
        this.root.add(m);
        leg.meshes.push(m);
      }
      this.legs.push(leg);
    }

    this.state = 'ceiling';
    this.litTime = 0; this.cower = 0; this.whirl = 0; this.cooldown = 0; this.seenLit = false;
    this.anchor = new V3();
    this.hangQ = new THREE.Quaternion();
    this.ceilQ = new THREE.Quaternion();
  }

  dispose() {
    this.root.traverse((o) => { if (o.geometry) o.geometry.dispose(); });
  }

  ceilingQuat(yaw, out = new THREE.Quaternion()) {
    const Z = new V3(Math.sin(yaw), 0, Math.cos(yaw)), Y = new V3(0, -1, 0), X = new V3().crossVectors(Y, Z);
    return out.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  }

  placeOnCeiling(x, z, yaw, ceilY) {
    this.ceilY = ceilY;
    this.yaw = yaw;
    this.root.position.set(x, ceilY, z);
    this.ceilingQuat(yaw, this.root.quaternion);
    this.root.updateMatrixWorld(true);
    for (const l of this.legs) { this.footTarget(l, 0, l.foot); l.stepping = false; }
    this.state = 'ceiling'; this.litTime = 0; this.cower = 0; this.cooldown = 1.5;
  }

  get bodyWorld() { return this.body.getWorldPosition(new V3()); }

  isLit(light) {
    if (!light || !light.on) return false;
    const p = this.bodyWorld;
    const v = p.sub(light.pos);
    const d = v.length();
    return d < 16 && v.dot(light.dir) / d > Math.cos(0.2);
  }

  // ------------------------------------------------------------------ update
  update(dt, ctx) {
    this.time += dt;
    const t = this.time, wolf = this.type === 'wolf';
    const lit = this.isLit(ctx.light);
    if (lit && !this.seenLit && this.state === 'ceiling') { this.seenLit = true; this.onFirstLit && this.onFirstLit(); }
    this.cooldown -= dt;
    const cam = ctx.cam;

    if (this.state === 'ceiling') {
      this.litTime = lit ? this.litTime + dt : Math.max(0, this.litTime - dt * 2);
      this.cower = lerp(this.cower, lit ? 1 : 0, 1 - Math.exp(-dt * 6));
      if (!wolf && lit && this.whirl <= 0 && this.litTime < 0.1) this.whirl = 0.7;
      if (this.litTime > 3) this.startCrawl(ctx);
      else if (!lit && this.cooldown <= 0 && !this.noAmbush) {
        const p = this.root.position;
        if (Math.hypot(cam.x - p.x, cam.z - p.z) < 2.0 && cam.y < this.ceilY - 0.6) this.startDrop(cam);
      }
    } else if (this.state === 'crawl') {
      this.cower = lerp(this.cower, 0.3, 1 - Math.exp(-dt * 4));
      const p = this.root.position, tg = this.crawlTarget;
      const dx = tg.x - p.x, dz = tg.y - p.z, dist = Math.hypot(dx, dz);
      let dy = Math.atan2(dx, dz) - this.yaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      this.yaw += clamp(dy, -5 * dt, 5 * dt);
      const sp = (wolf ? 1.6 : 1.3) * Math.max(0, Math.cos(dy)) * sstep(0, 0.3, dist);
      p.x += Math.sin(this.yaw) * sp * dt; p.z += Math.cos(this.yaw) * sp * dt;
      this.ceilingQuat(this.yaw, this.root.quaternion);
      this.speed = sp;
      if (dist < 0.08) { this.state = 'ceiling'; this.litTime = 0; this.cooldown = 1.0; this.speed = 0; }
    } else if (this.state === 'drop' || this.state === 'hang' || this.state === 'swing' || this.state === 'retract') {
      this.updateHanging(dt, lit, cam);
    }
    if (this.whirl > 0) this.whirl -= dt;

    // body pose
    const air = this.state === 'drop' || this.state === 'hang' || this.state === 'swing' || this.state === 'retract' || this.state === 'fallen' || this.state === 'descend';
    const wh = Math.max(0, this.whirl) > 0 ? sstep(0, 0.3, this.whirl) : 0;
    // lit: a short shiver (it used to shake hard for over a second; now small and brief)
    this.body.position.set(
      0.008 * wh * Math.sin(t * 38),
      this.P.H * (1 - 0.35 * this.cower) + 0.004 * Math.sin(t * 2.3),
      0.008 * wh * Math.cos(t * 38),
    );
    this.body.rotation.set(0.05 * this.cower, 0, 0);
    this.abdomen.scale.setScalar(1 + 0.02 * Math.sin(t * 2.6));
    this.root.updateMatrixWorld(true);
    this.body.updateMatrix();

    this.updateGait(dt, air);
    this.updateLegs(t, air);
    this.updatePalps(t);

    // eyeshine: bright only when the flashlight (held at the eye) hits eyes that face the camera
    const ew = new V3(0, 0.6, 1).normalize().applyQuaternion(this.root.quaternion);
    const toCam = cam.clone().sub(this.bodyWorld).normalize();
    const f = lit ? Math.pow(Math.max(0, ew.dot(toCam)), 2) : 0;
    this.mats.eye.emissiveIntensity = lerp(this.mats.eye.emissiveIntensity, (wolf ? 1.8 : 1.0) * f, 1 - Math.exp(-dt * 10));
  }

  startCrawl(ctx) {
    const p = this.root.position;
    let best = null;
    for (let k = 0; k < 16; k++) {
      const a = Math.random() * Math.PI * 2, d = 1.4 + Math.random() * 1.8;
      const x = clamp(p.x + Math.sin(a) * d, ctx.bounds.x0, ctx.bounds.x1), z = clamp(p.z + Math.cos(a) * d, ctx.bounds.z0, ctx.bounds.z1);
      const q = new V3(x, this.ceilY, z);
      const v = q.clone().sub(ctx.light.pos);
      const score = -v.dot(ctx.light.dir) / v.length() + Math.random() * 0.1;
      if (!best || score > best.s) best = { s: score, x, z };
    }
    this.crawlTarget = new THREE.Vector2(best.x, best.z);
    this.state = 'crawl';
    this.onCrawl && this.onCrawl();
  }

  startDrop(cam) {
    this.state = 'drop';
    this.st = 0;
    this.anchor.copy(this.root.position);
    this.ceilQ.copy(this.root.quaternion);
    this.dropFrom = this.bodyWorld;
    this.hangY = Math.max(1.0, cam.y + 0.15);
    // hang head-down with the belly and legs toward the camera
    const toCam = new V3(cam.x - this.anchor.x, 0, cam.z - this.anchor.z).normalize();
    const Z = new V3(0, -1, 0), Y = toCam.clone().negate(), X = new V3().crossVectors(Y, Z);
    this.hangQ.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    this.spin = 0;
    this.camAtDrop = cam.clone();
    this.onDrop && this.onDrop();
  }

  setBodyAt(world, q) {
    // place root so that the body centre lands on `world`
    this.root.quaternion.copy(q);
    const off = new V3(0, this.P.H * this.root.scale.y, 0).applyQuaternion(q);
    this.root.position.copy(world).sub(off);
  }

  updateHanging(dt, lit, cam) {
    this.st += dt;
    const top = this.dropFrom, P = new V3(), q = new THREE.Quaternion();
    const spinQ = (a) => new THREE.Quaternion().setFromAxisAngle(UPV, a);
    if (this.state === 'drop') {
      const u = clamp(this.st / 0.6, 0, 1);
      const e = u < 1 ? 1 - Math.pow(1 - u, 3) + 0.06 * Math.sin(u * Math.PI) : 1;
      P.set(this.anchor.x, lerp(top.y, this.hangY, e), this.anchor.z);
      this.spin = Math.PI * 2 * sstep(0, 1, u);
      q.copy(this.ceilQ).slerp(this.hangQ, sstep(0, 0.6, u)).premultiply(spinQ(this.spin * (1 - sstep(0.85, 1, u))));
      this.setBodyAt(P, q);
      if (lit && this.st > 0.12) this.startRetract();
      else if (u >= 1) { this.state = 'hang'; this.st = 0; }
    } else if (this.state === 'hang') {
      P.set(this.anchor.x + 0.04 * Math.sin(this.st * 9), this.hangY + 0.03 * Math.sin(this.st * 14), this.anchor.z);
      this.setBodyAt(P, this.hangQ);
      if (lit) this.startRetract();
      else if (this.st > 0.4) { this.state = 'swing'; this.st = 0; }
    } else if (this.state === 'swing') {
      const u = clamp(this.st / 0.32, 0, 1);
      const e = u * u;
      const from = new V3(this.anchor.x, this.hangY, this.anchor.z);
      // stop just in front of the face (grabDist), so its fangs and eyes fill the view
      const toFrom = from.clone().sub(cam), stop = this.grabDist || 0.12;
      const target = cam.clone().add(toFrom.setLength(Math.min(toFrom.length(), stop))).add(new V3(0, -0.05, 0));
      P.lerpVectors(from, target, this.grabDist ? e : e * 0.88);
      P.y += 0.25 * Math.sin(Math.PI * e) * (1 - e);
      this.setBodyAt(P, this.hangQ);
      if (u >= 1 && !this.caught) { this.caught = true; this.state = 'caught'; this.onCatch && this.onCatch(); }
    } else if (this.state === 'retract') {
      const u = clamp(this.st / 0.75, 0, 1);
      const e = u * u * (3 - 2 * u);
      P.lerpVectors(this.retractFrom, this.dropFrom, e);
      q.copy(this.retractQ).slerp(this.ceilQ, sstep(0.3, 1, u));
      this.setBodyAt(P, q);
      if (u >= 1) {
        this.root.position.copy(this.anchor);
        this.root.quaternion.copy(this.ceilQ);
        this.root.updateMatrixWorld(true);
        for (const l of this.legs) { this.footTarget(l, 0, l.foot); l.stepping = false; }
        this.state = 'ceiling'; this.cooldown = 3.5; this.litTime = 0;
      }
    }
  }

  // crawl across the ceiling to a spot (e.g. a web that was touched)
  callTo(x, z, bounds) {
    if (this.state !== 'ceiling' && this.state !== 'crawl') return false;
    this.crawlTarget = new THREE.Vector2(clamp(x, bounds.x0, bounds.x1), clamp(z, bounds.z0, bounds.z1));
    this.state = 'crawl';
    return true;
  }

  startRetract() {
    this.state = 'retract'; this.st = 0;
    this.retractFrom = this.bodyWorld;
    this.retractQ = this.root.quaternion.clone();
    this.onRetract && this.onRetract();
  }

  get threadVisible() { return this.state === 'drop' || this.state === 'hang' || this.state === 'swing' || this.state === 'retract' || this.state === 'caught'; }
  spinneretWorld() { return this.spinneret.clone().applyMatrix4(this.body.matrixWorld); }

  // where a foot wants to go: its rest spot under the body; but if a wall, the floor or a box is
  // in the way (or the rest spot hangs in the air, e.g. while rounding an edge) it grabs that
  // surface instead, so legs reach onto a wall before the body gets there and never go through it
  footTarget(l, cw, out, lead) {
    out.copy(l.home).multiplyScalar(1 - 0.35 * cw).applyMatrix4(this.root.matrixWorld);
    if (lead) out.add(lead);
    if (!this.surf) return out;
    const hipW = _fa.copy(l.hip).applyMatrix4(this.body.matrixWorld);
    _fb.subVectors(out, hipW).multiplyScalar(1.15).add(hipW);
    let hit = this.surf(hipW, _fb);
    if (!hit) {
      const up = _fc.set(0, 1, 0).applyQuaternion(this.root.quaternion);
      _fa.copy(out).addScaledVector(up, 0.3); _fb.copy(out).addScaledVector(up, -0.9);
      hit = this.surf(_fa, _fb);
    }
    if (hit) out.copy(hit.p).addScaledVector(hit.n, 0.012);
    return out;
  }

  updateGait(dt, air) {
    const sp = this.speed || 0;
    const homeW = new V3(), lift = new V3(0, 1, 0).applyQuaternion(this.root.quaternion);
    if (air || this.state === 'caught') {
      // legs splay out and grab at the air
      const t = this.time, onBack = this.state === 'fallen';
      for (const l of this.legs) {
        // on its back (root flipped, so local -y is up): legs drawn in over the belly, kicking
        if (onBack) homeW.set(l.home.x * 0.5, -(0.16 + 0.07 * Math.sin(t * 13 + l.ph)), l.home.z * 0.55);
        else homeW.set(l.home.x * 0.95, 0.12 + 0.05 * Math.sin(t * 11 + l.ph), l.home.z * 0.85 + 0.12);
        homeW.applyMatrix4(this.root.matrixWorld);
        l.foot.lerp(homeW, 1 - Math.exp(-dt * 14));
        l.stepping = false;
      }
      return;
    }
    const cw = this.cower;
    const thr = sp > 0.05 ? 0.1 + sp * 0.08 : 0.07;
    const stepDur = clamp(0.18 - sp * 0.04, 0.07, 0.18);
    const busy = [false, false], want = [false, false];
    for (const l of this.legs) if (l.stepping) busy[l.group] = true;
    const errs = [];
    for (const l of this.legs) {
      this.footTarget(l, cw, homeW);
      const e = l.foot.distanceTo(homeW);
      errs.push(e);
      if (!l.stepping && e > thr) want[l.group] = true;
    }
    const fwd = new V3(0, 0, 1).applyQuaternion(this.root.quaternion);
    for (const g of [0, 1]) {
      if (want[g] && !busy[0] && !busy[1] && !(want[1 - g] && this.lastGroup === g)) {
        this.lastGroup = g;
        this.legs.forEach((l, k) => {
          if (l.group !== g) return;
          this.footTarget(l, cw, homeW, sp > 0.05 ? fwd.clone().multiplyScalar(thr * 0.8) : null);
          l.from.copy(l.foot); l.to.copy(homeW);
          l.stepping = true; l.t = 0; l.dur = stepDur; l.lift = 0.06 + sp * 0.02;
        });
        break;
      }
    }
    for (const l of this.legs) {
      if (!l.stepping) continue;
      l.t = Math.min(1, l.t + dt / l.dur);
      const e = l.t * l.t * (3 - 2 * l.t);
      l.foot.lerpVectors(l.from, l.to, e).addScaledVector(lift, l.lift * Math.sin(Math.PI * l.t));
      if (l.t >= 1) { l.stepping = false; l.foot.copy(l.to); }
    }
    // occasional twitch while waiting
    if (sp < 0.05 && Math.random() < dt * 1.5) {
      const l = this.legs[Math.floor(Math.random() * 8)];
      if (!l.stepping) {
        this.footTarget(l, cw, homeW);
        l.from.copy(l.foot); l.to.copy(homeW);
        l.stepping = true; l.t = 0; l.dur = 0.25; l.lift = 0.05;
      }
    }
  }

  updateLegs(t, air) {
    const P = this.P;
    const hip = new V3(), C = new V3(), F = new V3(), A = new V3(), K = new V3(), Pt = new V3(), M = new V3(), h = new V3(), td = new V3(), b1 = new V3();
    const up = UPV;
    // normally the knees arch up (local +y); on its back that is down into the floor, so arch them the other way
    const kf = this.state === 'fallen' ? -1 : 1;
    for (const l of this.legs) {
      const [Lc, Lf, Lp, Lt, Lm, Lta] = l.lens;
      hip.copy(l.hip).applyMatrix4(this.body.matrix);
      F.copy(l.foot); this.root.worldToLocal(F);
      h.set(F.x - hip.x, 0, F.z - hip.z);
      const hl = h.length() || 1; h.divideScalar(hl);
      C.copy(hip).addScaledVector(h, Lc * 0.9); C.y -= kf * Lc * 0.3;
      const Ld = Lm + Lta;
      A.copy(F).addScaledVector(h, -Ld * P.ka); A.y = F.y + kf * Ld * P.kh;
      const L1 = Lf, L2 = Lp + Lt;
      const dx = Math.hypot(A.x - C.x, A.z - C.z), dy = A.y - C.y;
      let D = clamp(Math.hypot(dx, dy), Math.abs(L1 - L2) + 0.01, (L1 + L2) * 0.995);
      const al = Math.atan2(dy, dx);
      const gm = Math.acos(clamp((L1 * L1 + D * D - L2 * L2) / (2 * L1 * D), -1, 1));
      K.copy(C).addScaledVector(h, L1 * Math.cos(al + kf * gm)); K.y += L1 * Math.sin(al + kf * gm);
      const Aa = new V3().copy(C).addScaledVector(h, D * Math.cos(al)); Aa.y += D * Math.sin(al);
      Pt.lerpVectors(K, Aa, Lp / L2);
      td.subVectors(Aa, K).normalize();
      b1.copy(Aa).addScaledVector(td, Ld * 0.35);
      const s = 0.62, s1 = 1 - s;
      M.set(s1 * s1 * Aa.x + 2 * s1 * s * b1.x + s * s * F.x, s1 * s1 * Aa.y + 2 * s1 * s * b1.y + s * s * F.y, s1 * s1 * Aa.z + 2 * s1 * s * b1.z + s * s * F.z);
      const m = l.meshes;
      placeSeg(m[0], hip, C, up, Lc);
      placeSeg(m[1], C, K, up, Lf);
      placeSeg(m[2], K, Pt, h, Lp);
      placeSeg(m[3], Pt, Aa, h, Lt);
      placeSeg(m[4], Aa, M, h, Lm);
      placeSeg(m[5], M, F, h, Lta);
    }
  }

  updatePalps(t) {
    const pc = this.P.pro.c, pr = this.P.pro.r, wolf = this.type === 'wolf';
    for (const p of this.palps) {
      const base = new V3(p.s * pr[0] * 0.45, pc[1] - pr[1] * 0.4, pc[2] + pr[2] * 0.7);
      const tap = Math.max(0, Math.sin(t * 2.4 + p.s));
      const L = wolf ? 0.16 : 0.09;
      for (let i = 0; i < p.n; i++) {
        const u = i / (p.n - 1);
        p.P[i].set(base.x + p.s * L * 0.35 * Math.sin(u * 2.2), base.y + L * (0.25 * Math.sin(u * 3) - 0.55 * u * u * (0.6 + 0.4 * tap)), base.z + L * u * 0.9);
      }
      p.tube.update(p.P, p.R);
    }
  }
}
