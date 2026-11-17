import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SP } from '../centipede.js';
import { makeFace, noise3 } from './face.js';
import { handGeometry } from './limbs.js';
import { track } from './fuse.js';
import { skinMat } from './skin.js';

// Hard mode's centipede, all flesh: no shell left on it. A long body of bare, sinewy skin; where its head
// was, a bald man's head, the eyes two black hollows, the mouth hanging open in a howl; and down both
// sides, nine pairs of long thin human arms, elbows up, the hands splayed on the floor.
// It rides on a Centipede (which still does the moving and the stepping): fuseCentiFlesh(c).set(true)
// hides the shell, the legs and the head and puts all this on instead.
const V3 = THREE.Vector3;
const ss = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const NB = 30;                                  // trunk segments the body runs over (the rest of the trail is behind it)
const L = (NB - 1) * SP;                        // body length, m
const ARMS = [1, 4, 7, 10, 13, 16, 19, 22, 25]; // the segments with a pair of arms
const SKIN = new THREE.Color('#94737f'), CHEST = new THREE.Color('#a8949c'), BELLY = new THREE.Color('#a8929a'), GROOVE = new THREE.Color('#3e1220'), RAW = new THREE.Color('#7a2c40');

// half width and half height of the body z metres back from its front: a man's chest and shoulders,
// in at the waist, a long gut, thinning to a tail
function girth(z) {
  let w = 0.215 * Math.sqrt(ss(0, 0.16, z));                 // (rounded off at the front)
  w -= 0.06 * ss(0.22, 0.6, z);                               // waist
  w += 0.02 * Math.exp(-(((z - 1.3) / 0.6) ** 2));            // gut
  w *= 1 - 0.85 * ss(L * 0.45, L, z);                         // tail
  return { w, h: w * (z < 0.5 ? 0.7 : 0.76) };
}

// ---- the body: rings round the trail, rewritten every frame
class Body {
  constructor(c, mat, { sub = 10, radial = 36 } = {}) {
    this.c = c; this.sub = sub; this.radial = radial;
    const rings = this.rings = (NB - 1) * sub + 1, cols = radial + 1, n = rings * cols;
    this.off = new Float32Array(n * 2);                       // each vertex's place in the ring (along right, up)
    const pos = new Float32Array(n * 3), col = new Float32Array(n * 3), uv = new Float32Array(n * 2), idx = [];
    const cc = new THREE.Color();
    for (let r = 0; r < rings; r++) {
      const z = (r / sub) * SP, { w, h } = girth(z), torso = 1 - ss(0.35, 0.55, z);
      for (let j = 0; j < cols; j++) {
        const a = -Math.PI / 2 + (j / radial) * Math.PI * 2;  // (the seam runs under the belly)
        const ca = Math.cos(a), sa = Math.sin(a);
        // the folds between the segments, ropes of sinew twisting along it, the spine knuckled down the back,
        // ribs on the chest
        // (the folds wander a little round the body, so they don't read as rings)
        const ph = ((z / SP) + 0.25 * (noise3(ca * 1.5, sa * 1.5, z * 2) - 0.5)) % 1;
        const crease = Math.exp(-(((ph - 0.5) / 0.15) ** 2)) * (1 - 0.8 * torso);
        const rope = (Math.sin(a * 7 + z * 19 + 2.2 * noise3(ca * 2, sa * 2, z * 3)) * 0.6 + Math.sin(a * 5 - z * 13 + 1.7 * noise3(ca * 2 + 3, sa * 2, z * 2)) * 0.4) * (0.6 + 0.4 * noise3(ca * 3 + 5, sa * 3, z * 5));
        const lump = noise3(ca * 4 + 9, sa * 4, z * 7) - 0.5;
        const spine = Math.exp(-(((a - Math.PI / 2) / 0.2) ** 2)) * Math.pow(Math.abs(Math.sin((z * Math.PI) / 0.065)), 2);
        // ribs: ridges round the chest, down the sides, under the skin (none on the breastbone or the back)
        const ribs = torso * ss(0.06, 0.16, z) * ss(0.42, 0.32, z) * Math.pow(Math.max(0, Math.sin((z * Math.PI * 2) / 0.048)), 0.7) * ss(0.95, 0.55, Math.abs(sa));
        let d = -0.09 * crease + 0.06 * rope * (1 - torso * 0.8) + 0.11 * lump * (1 - 0.5 * torso) + 0.08 * spine + 0.09 * ribs - 0.03 * torso * ss(0.2, 0.05, Math.abs(ca)) * ss(0, -0.4, sa);
        const belly = sa < 0 ? 0.82 : 1;
        const k = r * cols + j;
        this.off[k * 2] = w * ca * (1 + d); this.off[k * 2 + 1] = h * sa * belly * (1 + d);
        uv[k * 2] = (z / 0.25); uv[k * 2 + 1] = (j / radial) * 2.5;
        // colour: grey-mauve skin, paler underneath, the grooves raw and dark
        cc.copy(SKIN).lerp(CHEST, torso).lerp(BELLY, ss(0.1, -0.7, sa) * 0.6);
        cc.lerp(RAW, (ss(0.0, 0.5, crease) * 0.5 + ss(-0.1, -0.6, rope) * 0.45) * (1 - torso));
        cc.lerp(GROOVE, ss(0.5, 0.95, crease) * 0.75 + ss(0.0, -0.25, d) * 0.4);
        cc.multiplyScalar(0.9 + 0.2 * noise3(ca * 6, sa * 6, z * 11));
        col[k * 3] = cc.r; col[k * 3 + 1] = cc.g; col[k * 3 + 2] = cc.b;
      }
    }
    for (let r = 0; r < rings - 1; r++) for (let j = 0; j < radial; j++) {
      const a = r * cols + j, b = a + 1, c2 = a + cols, d = c2 + 1;
      idx.push(a, c2, b, b, c2, d);
    }
    const g = this.geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', this.posAttr);
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.boundingSphere = new THREE.Sphere(new V3(), 1e4);
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false; this.mesh.castShadow = true; this.mesh.receiveShadow = true;
    this._p = [new V3(), new V3(), new V3(), new V3()]; this._R = new V3(); this._U = new V3(); this._P = new V3();
  }
  // a point on the trail f segments back from the head (Catmull-Rom between the segments), and the frame there
  frame(f, P, R, U) {
    const c = this.c, i = Math.min(NB - 2, Math.floor(f)), u = f - i;
    const p0 = c.rPos[Math.max(0, i - 1)], p1 = c.rPos[i], p2 = c.rPos[i + 1], p3 = c.rPos[Math.min(c.rPos.length - 1, i + 2)];
    const u2 = u * u, u3 = u2 * u;
    const b0 = -0.5 * u3 + u2 - 0.5 * u, b1 = 1.5 * u3 - 2.5 * u2 + 1, b2 = -1.5 * u3 + 2 * u2 + 0.5 * u, b3 = 0.5 * u3 - 0.5 * u2;
    P.set(0, 0, 0).addScaledVector(p0, b0).addScaledVector(p1, b1).addScaledVector(p2, b2).addScaledVector(p3, b3);
    R.lerpVectors(c.right[i], c.right[i + 1], u).normalize();
    U.lerpVectors(c.upv[i], c.upv[i + 1], u); U.addScaledVector(R, -U.dot(R)).normalize();
  }
  update() {
    const pos = this.posAttr.array, cols = this.radial + 1, P = this._P, R = this._R, U = this._U;
    for (let r = 0; r < this.rings; r++) {
      this.frame(r / this.sub, P, R, U);
      for (let j = 0; j < cols; j++) {
        const k = r * cols + j, ox = this.off[k * 2], oy = this.off[k * 2 + 1];
        pos[k * 3] = P.x + R.x * ox + U.x * oy; pos[k * 3 + 1] = P.y + R.y * ox + U.y * oy; pos[k * 3 + 2] = P.z + R.z * ox + U.z * oy;
      }
    }
    this.posAttr.needsUpdate = true;
    this.geo.computeVertexNormals();
  }
}

// an arm bone's flesh along +y from 0 to 1, radius 1 at the start, shaped by prof (radius at even steps)
// (cords: ridges of tendon along it, strongest toward the far end)
function limb(radial, prof, cords = 0) {
  const g = new THREE.CylinderGeometry(1, 1, 1, radial, (prof.length - 1) * 2, true);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position, n = prof.length - 1;
  for (let i = 0; i < p.count; i++) {
    const y = p.getY(i), f = y * n, a = Math.min(n - 1, Math.floor(f)), th = Math.atan2(p.getZ(i), p.getX(i));
    const r = (prof[a] + (prof[a + 1] - prof[a]) * (f - a)) * (1 + cords * Math.pow(Math.abs(Math.cos(th * 2.5)), 3) * ss(0.1, 0.8, y) - cords * 0.4);
    p.setX(i, p.getX(i) * r); p.setZ(i, p.getZ(i) * r);
  }
  g.computeVertexNormals();
  return g;
}
const _x = new V3(), _y = new V3(), _z = new V3();
function seg(out, p0, p1, up, r) {
  _y.subVectors(p1, p0); const len = _y.length() || 1e-5; _y.divideScalar(len);
  _z.copy(up).addScaledVector(_y, -up.dot(_y)); if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0); _z.normalize();
  _x.crossVectors(_y, _z);
  return out.makeBasis(_x.multiplyScalar(r), _y.multiplyScalar(len), _z.multiplyScalar(r)).setPosition(p0);
}

export function fuseCentiFlesh(c, { lite = false } = {}) {
  let built = null, on = false;
  const rest = new THREE.Euler(-0.2, 0, 0), facePos = new V3(0, 0.21, 0.2);
  const legs = c.legs.filter((l) => ARMS.includes(l.i));
  // where those legs put their feet: the arms reach further (put back when it's a centipede again)
  const homes = (arms) => { for (const l of legs) { if (!l.home0) l.home0 = { lat: l.lat, fwd: l.fwd }; const h = arms ? l.armHome : l.home0; l.lat = h.lat; l.fwd = h.fwd; } };
  const build = () => {
    const mat = skinMat({ vertexColors: true });
    const body = new Body(c, mat, lite ? { sub: 4, radial: 22 } : {});
    c.group.add(body.mesh);
    // head and neck
    const head = new THREE.Group();
    const f = makeFace({ h: 0.34, mouth: 'howl', eyes: 'void', skin: '#a8939c', mottle: '#6a4258', seg: lite ? 72 : 128 });
    f.group.position.copy(facePos); f.group.rotation.copy(rest);
    f.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    head.add(f.group);
    const neckMat = skinMat(); neckMat.color.set('#a08e92');
    const neckFrom = new V3(0, 0.06, -0.2), neckTo = new V3(0, 0.13, 0.12), M = new THREE.Matrix4();
    const neckParts = [limb(14, [1, 0.86, 0.78, 0.8, 0.9]).applyMatrix4(seg(M, neckFrom, neckTo, new V3(0, 0, 1), 0.075))];
    for (const s of [-1, 1]) neckParts.push(limb(8, [1, 0.8, 0.7, 0.8, 1]).applyMatrix4(seg(M, new V3(s * 0.06, 0.07, -0.12), new V3(s * 0.05, 0.14, 0.12), new V3(0, 0, 1), 0.018)));   // (the cords down its sides)
    const neck = new THREE.Mesh(mergeGeometries(neckParts), neckMat);
    neck.castShadow = true; head.add(neck);
    c.head.add(head);
    // arms (one draw each for the upper arms, forearms, knuckled joints and the two hands)
    const armMat = skinMat(); armMat.color.set('#a48c96');
    const handMat = skinMat({ vertexColors: true, normalMap: null }); handMat.color.set('#a48c96');
    const n = legs.length, R = lite ? 8 : 14;
    const inst = (g, m, k) => { const im = new THREE.InstancedMesh(g, m, k); im.frustumCulled = false; im.castShadow = true; im.receiveShadow = true; im.instanceMatrix.setUsage(THREE.DynamicDrawUsage); c.group.add(im); return im; };
    const hg = [handGeometry({ lo: lite, curl: 0.45, spread: 2.6, long: 1.3 }), handGeometry({ lo: lite, curl: 0.45, spread: 2.6, long: 1.3, mirror: true })];
    const arms = {
      up: inst(limb(R, [1, 1.14, 1.18, 1.08, 0.92, 0.78, 0.76], lite ? 0 : 0.06), armMat, n),       // (shoulder, biceps, down to the elbow)
      fore: inst(limb(R, [0.92, 1.05, 1.0, 0.86, 0.72, 0.6, 0.56], lite ? 0 : 0.12), armMat, n),   // (thick under the elbow, thin at the wrist)
      knob: inst(new THREE.SphereGeometry(1, R, Math.round(R * 0.7)), armMat, n * 3),
      hands: hg.map((g) => inst(g, handMat, n)),
      rise: -hg[0].boundingBox.min.y,
    };
    const cc = new THREE.Color();
    legs.forEach((l, i) => {
      const front = l.i === ARMS[0], k = ARMS.indexOf(l.i) / (ARMS.length - 1);
      // where its hands go (for the stepping): the front pair reaching far ahead, the rest out to the sides
      l.armHome = { lat: front ? 0.95 : 1.05 - 0.2 * k, fwd: front ? 0.85 : 0.3 - 0.75 * k };
      l.arm = { Lu: front ? 0.62 : 0.55 - 0.08 * k, Lo: front ? 0.6 : 0.52 - 0.08 * k, Lh: front ? 0.42 : 0.37 - 0.05 * k };
      cc.set('#ffffff').multiplyScalar(0.88 + 0.12 * l.shade);
      arms.up.setColorAt(i, cc); arms.fore.setColorAt(i, cc); for (let j = 0; j < 3; j++) arms.knob.setColorAt(i * 3 + j, cc);
      arms.hands[0].setColorAt(i, cc); arms.hands[1].setColorAt(i, cc);
    });
    for (const im of [arms.up, arms.fore, arms.knob, ...arms.hands]) im.instanceColor.needsUpdate = true;
    built = { body, head, f, arms };
  };
  // the arms: shoulder -> elbow (two-bone IK, the elbow up and out) -> wrist, the hand splayed past it
  const S = new V3(), K = new V3(), W = new V3(), h = new V3(), hx = new V3(), up = new V3(0, 1, 0), M = new THREE.Matrix4(), Z = new THREE.Matrix4().makeScale(0, 0, 0);
  const hp = new V3(), fp = new V3(), away = new V3(), zero = new V3();
  const poseArms = () => {
    const A = built.arms;
    legs.forEach((l, i) => {
      const P = c.rPos[l.i], Rv = c.right[l.i], U = c.upv[l.i], F = l.foot, { Lu, Lo, Lh } = l.arm;
      const { w } = girth(l.i * SP), front = l.i === ARMS[0];
      S.copy(P).addScaledVector(Rv, l.s * w * 0.78).addScaledVector(U, front ? 0.06 : 0.02);
      h.set(F.x - S.x, 0, F.z - S.z); h.normalize();
      W.copy(F).addScaledVector(h, -Lh * 0.75); W.y = F.y + A.rise * Lh;
      const dx = Math.hypot(W.x - S.x, W.z - S.z), dy = W.y - S.y;
      const D = THREE.MathUtils.clamp(Math.hypot(dx, dy), Math.abs(Lu - Lo) + 0.05, (Lu + Lo) * 0.995), al = Math.atan2(dy, dx);
      const th = al + Math.acos(THREE.MathUtils.clamp((Lu * Lu + D * D - Lo * Lo) / (2 * Lu * D), -1, 1));
      K.copy(S).addScaledVector(h, Lu * Math.cos(th)); K.y += Lu * Math.sin(th);
      W.copy(S).addScaledVector(h, D * Math.cos(al)); W.y = S.y + D * Math.sin(al);
      A.up.setMatrixAt(i, seg(M, S, K, up, 0.047));
      A.fore.setMatrixAt(i, seg(M, K, W, h, 0.043));
      A.knob.setMatrixAt(i * 3, M.makeScale(0.054, 0.054, 0.054).setPosition(S));
      A.knob.setMatrixAt(i * 3 + 1, M.makeScale(0.04, 0.046, 0.04).setPosition(K));
      A.knob.setMatrixAt(i * 3 + 2, M.makeScale(0.026, 0.022, 0.03).setPosition(W));
      // (s = -1 a right hand, s = 1 a left one: either way the thumb toward its head)
      hx.crossVectors(up, h);
      A.hands[l.s > 0 ? 1 : 0].setMatrixAt(i, M.makeBasis(hx.multiplyScalar(Lh), _y.copy(up).multiplyScalar(Lh), _z.copy(h).multiplyScalar(Lh)).setPosition(W));
      A.hands[l.s > 0 ? 0 : 1].setMatrixAt(i, Z);
    });
    for (const im of [A.up, A.fore, A.knob, ...A.hands]) im.instanceMatrix.needsUpdate = true;
  };
  return {
    get face() { return built && built.f; },
    set(v) {
      on = !!v;
      if (on && !built) build();
      if (built) { built.body.mesh.visible = built.head.visible = on; for (const im of [built.arms.up, built.arms.fore, built.arms.knob, ...built.arms.hands]) im.visible = on; }
      for (const im of [c.terg, c.stern, c.shadows, c.iCoxa, c.iFem, c.iTib, c.iT1, c.iT2, c.iT3, c.iJoint]) im.visible = !on;
      c.headParts.group.visible = !on;
      for (const a of c.ants) a.tube.mesh.visible = !on;
      c.skipLegPose = on;
      if (built) homes(on);
    },
    // after the centipede's own update
    update(dt, t, cam) {
      if (!on || !c.group.visible) return;
      built.body.update();
      poseArms();
      const f = built.f, kill = c.mode === 'kill', wide = kill ? 1 : Math.max(c.b.lunge, c.b.curl * 0.6);
      f.setOpen(0.62 + 0.24 * (0.5 + 0.5 * Math.sin(t * 1.3)) * (1 - wide) + 0.38 * wide + 0.03 * Math.sin(t * 19));
      // when it has you, the head (neck and all) hangs right over your face, never quite into it
      const hd = built.head;
      if (kill) {
        hd.getWorldPosition(hp); f.group.getWorldPosition(fp);
        away.subVectors(fp, cam); const d = away.length() || 1;
        hp.addScaledVector(away, Math.max(0, 0.4 - d) / d);         // (moved by as much as the face must back off)
        hd.position.lerp(c.head.worldToLocal(hp), 1 - Math.exp(-dt * 12));
        track(f.group, cam, rest, Math.PI, 1.5, 1 - Math.exp(-dt * 10));
      } else {
        hd.position.lerp(zero, 1 - Math.exp(-dt * 6));
        track(f.group, cam, rest, 0.8, 0.45, 1 - Math.exp(-dt * 4));
      }
    },
  };
}
