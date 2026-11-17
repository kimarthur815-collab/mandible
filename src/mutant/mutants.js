import * as THREE from 'three';
import { Spider } from '../spider.js';
import { Centipede } from '../centipede.js';
import { Tube } from '../tube.js';
import { makeFace } from './face.js';
import { Arm, HandGait, makeHand, skinMaterial } from './limbs.js';

// Hard mode's bugs: the radiation fused them with the people who came in before you. Each make(T)
// returns { group, update(dt, t, ctx), focus(near) -> world point to look at, view(near) -> camera offset }.
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);
const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// a spider walking round a circle on the floor (the preview's way of showing it moving)
function walker(sp, scale, R, speed) {
  sp.root.scale.setScalar(scale);
  sp.state = 'floor';
  let ang = 0, first = true;
  return (dt, walk) => {
    if (walk) ang += dt * speed / R;
    const yaw = Math.atan2(-Math.sin(ang), Math.cos(ang));
    sp.root.position.set(Math.cos(ang) * R, 0, Math.sin(ang) * R);
    sp.root.quaternion.setFromAxisAngle(UP, yaw);
    sp.yaw = yaw; sp.speed = walk ? speed / scale : 0; sp.time += dt;
    sp.body.position.set(0, sp.P.H + 0.004 * Math.sin(sp.time * 2.3), 0);
    sp.abdomen.scale.setScalar(1 + 0.02 * Math.sin(sp.time * 2.6));
    sp.root.updateMatrixWorld(true); sp.body.updateMatrix();
    if (first) { for (const l of sp.legs) sp.footTarget(l, 0, l.foot); first = false; }
    sp.updateGait(dt, false); sp.updateLegs(sp.time, false); sp.updatePalps(sp.time);
  };
}
// turn a head (in its parent's frame) toward a world point, within limits
function track(obj, wp, rest, maxYaw = 0.7, maxPitch = 0.45, k = 0.08) {
  const p = obj.parent.worldToLocal(wp.clone()).sub(obj.position);
  const yaw = THREE.MathUtils.clamp(Math.atan2(p.x, p.z), -maxYaw, maxYaw), pitch = THREE.MathUtils.clamp(-Math.atan2(p.y, Math.hypot(p.x, p.z)), -maxPitch, maxPitch);
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(rest.x + pitch, rest.y + yaw, rest.z, 'YXZ'));
  obj.quaternion.slerp(q, k);
}
const wp = (o, v = new V3()) => o.getWorldPosition(v);
// a camera offset in front of something (its local +z), a little up and to the side
function front(o, d, up = 0.08, side = 0.18) {
  o.updateWorldMatrix(true, false);
  const z = new V3(0, 0, 1).transformDirection(o.matrixWorld); z.y = Math.max(z.y, -0.2); z.normalize();
  const x = new V3().crossVectors(UP, z).normalize();
  return z.multiplyScalar(d).addScaledVector(x, side * d).add(new V3(0, up * d + 0.05, 0));
}

// ------------------------------------------------------------------ ghost spider
function ghostA(T) {
  const sp = new Spider('ghost', T), group = new THREE.Group();
  group.add(sp.root);
  // the head-thorax is a human head: the legs come out from under it; the eyes are just black
  sp.pro.scale.setScalar(0.8);
  for (const e of sp.eyeMeshes) e.visible = false;
  for (const j of sp.jaws) j.visible = false;
  for (const p of sp.palps) p.tube.mesh.visible = false;
  const f = makeFace({ h: 0.1, mouth: 'scream', eyes: 'black', tears: true, skin: '#dcd8d0', mottle: '#a0a0b0', seg: 80 });
  f.group.position.set(0, 0.038, 0.085);
  const rest = new THREE.Euler(-0.15, 0, 0);
  f.group.rotation.copy(rest);
  sp.body.add(f.group);
  const walk = walker(sp, 2.05, 1.3, 0.55);
  return {
    group,
    update(dt, t, ctx) {
      walk(dt, ctx.walk);
      f.setOpen(0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * 1.7)) + 0.04 * Math.sin(t * 23));
      track(f.group, ctx.cam, rest);
      const lit = ctx.light.on ? Math.max(0, wp(f.group).sub(ctx.light.pos).normalize().dot(ctx.light.dir)) : 0;
      f.shine(Math.pow(lit, 8));
    },
    focus: (near) => near ? wp(f.group) : wp(sp.body),
    view: (near) => near ? front(f.group, 0.6) : new V3(2.2, 1.7, 3.2),
  };
}
function ghostB(T) {
  const sp = new Spider('ghost', T), group = new THREE.Group();
  group.add(sp.root);
  for (const e of sp.eyeMeshes) e.visible = false;
  for (const j of sp.jaws) j.visible = false;
  for (const p of sp.palps) p.tube.mesh.visible = false;
  // a long thin human neck out of the top of it, the head held up on it, swaying, watching you.
  // (on the ceiling the same neck hangs down toward you)
  const skin = skinMaterial('#d6d0c6');
  const n = 16, neck = new Tube(n, 10, skin), P = Array.from({ length: n }, () => new V3()), R = Array.from({ length: n }, (_, i) => 0.0105 + 0.004 * Math.pow(i / (n - 1), 2) + (i === 0 ? 0.004 : 0));
  sp.body.add(neck.mesh);
  const f = makeFace({ h: 0.085, mouth: 'gasp', eyes: 'human', eyeColor: 'grey', skin: '#d6d0c6', mottle: '#9a8a96', seg: 80 });
  sp.body.add(f.group);
  const rest = new THREE.Euler(0.1, 0, 0);
  // two small human hands where its palps were, fingers working
  const hands = [-1, 1].map((s) => { const h = makeHand({ len: 0.05, mat: skin, mirror: s < 0 }); h.group.position.set(s * 0.018, -0.018, 0.07); h.group.rotation.set(0.9, s * 0.35, 0); sp.body.add(h.group); return h; });
  const walk = walker(sp, 2.05, 1.3, 0.5);
  const base = new V3(0, 0.025, 0.035), head = new V3(), c1 = new V3(), c2 = new V3();
  return {
    group,
    update(dt, t, ctx) {
      walk(dt, ctx.walk);
      head.set(0.06 * Math.sin(t * 0.8), 0.33 + 0.025 * Math.sin(t * 1.3), 0.16 + 0.04 * Math.sin(t * 0.6));
      c1.set(0, 0.12, 0.01); c2.set(head.x * 0.5, head.y - 0.02, head.z * 0.2);
      for (let i = 0; i < n; i++) {
        const u = i / (n - 1), a = (1 - u) ** 3, b = 3 * (1 - u) ** 2 * u, c = 3 * (1 - u) * u * u, d = u ** 3;
        P[i].set(base.x * a + c1.x * b + c2.x * c + head.x * d, base.y * a + c1.y * b + c2.y * c + head.y * d, base.z * a + c1.z * b + c2.z * c + head.z * d);
        P[i].x += 0.012 * Math.sin(t * 2.1 - u * 5) * u;
      }
      neck.update(P, R);
      f.group.position.copy(head).add(new V3(0, 0.035, 0.012));
      f.setOpen(0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.1)));
      track(f.group, ctx.cam, rest, 1.2, 0.7, 0.1);
      f.lookAt(ctx.cam);
      hands.forEach((h, i) => h.curl(0.5 + 0.4 * Math.sin(t * 3 + i * 1.7), t));
    },
    focus: (near) => near ? wp(f.group) : wp(sp.body),
    view: (near) => near ? front(f.group, 0.6) : new V3(2.2, 1.7, 3.2),
  };
}

// ------------------------------------------------------------------ wolf spider
function wolfA(T) {
  const sp = new Spider('wolf', T), group = new THREE.Group();
  group.add(sp.root);
  // its head-thorax ends in a human face: eight human eyes set where a wolf spider's are, and a mouth
  // full of teeth under them where its fangs were
  for (const e of sp.eyeMeshes) e.visible = false;
  for (const j of sp.jaws) j.visible = false;
  const f = makeFace({ h: 0.15, mouth: 'grin', eyes: 'spider8', eyeColor: 'brown', skin: '#bfae9c', mottle: '#6e5a4a', seg: 96, ears: false });
  f.group.position.set(0, 0.035, 0.13);
  const rest = new THREE.Euler(-0.25, 0, 0);
  f.group.rotation.copy(rest);
  sp.body.add(f.group);
  const walk = walker(sp, 2.35, 1.5, 0.9);
  return {
    group,
    update(dt, t, ctx) {
      walk(dt, ctx.walk);
      f.setOpen(0.2 + 0.25 * (0.5 + 0.5 * Math.sin(t * 0.9)));
      track(f.group, ctx.cam, rest, 0.5, 0.3, 0.06);
      f.lookAt(ctx.cam);
    },
    focus: (near) => near ? wp(f.group) : wp(sp.body),
    view: (near) => near ? front(f.group, 0.85) : new V3(2.2, 1.6, 3.2),
  };
}
function wolfB(T) {
  const sp = new Spider('wolf', T, { furHole: { d: new V3(0, 1, -0.2).normalize(), c: 0.72 } }), group = new THREE.Group();
  group.add(sp.root);
  // a face coming up through the skin of its back, gasping, its eyes rolling round to you; and its
  // front legs end in human hands
  const f = makeFace({ h: 0.17, mouth: 'gasp', eyes: 'human', eyeColor: 'grey', skin: '#c4b4a2', mottle: '#7a6050', seg: 96, ears: false });
  f.group.position.set(0, 0.085, -0.21);
  const rest = new THREE.Euler(1.2, Math.PI, 0);       // lying on its back, looking up and back
  f.group.rotation.copy(rest);
  f.group.scale.set(1, 1, 0.75);
  sp.body.add(f.group);
  const skin = skinMaterial('#c4b4a2');
  const frontLegs = sp.legs.filter((l) => l.i === 0);
  const hands = frontLegs.map((l) => { const h = makeHand({ len: 0.075, mat: skin, mirror: l.s < 0 }); group.add(h.group); h.group.scale.multiplyScalar(2.35); return { l, h }; });
  for (const { l } of hands) l.meshes[5].visible = false;            // (the last joint is the hand now)
  const walk = walker(sp, 2.35, 1.5, 0.8);
  const tmp = new V3(), dir = new V3();
  return {
    group,
    update(dt, t, ctx) {
      walk(dt, ctx.walk);
      f.setOpen(0.55 + 0.45 * Math.abs(Math.sin(t * 0.8)));
      f.lookAt(ctx.cam);
      for (const { l, h } of hands) {
        const m = l.meshes[4].matrixWorld;
        tmp.setFromMatrixPosition(m);                                     // start of the metatarsus
        dir.subVectors(l.foot, tmp); dir.y = 0; dir.normalize();
        h.group.position.copy(l.foot).setY(Math.max(0.01, l.foot.y));
        const x = new V3().crossVectors(UP, dir).normalize(), y = new V3().crossVectors(dir, x);
        h.group.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, dir));
        h.group.position.addScaledVector(dir, -0.04);
        h.curl(l.stepping ? 0.7 : 0.15, t);
      }
    },
    focus: (near) => near ? wp(f.group) : wp(sp.body),
    view: (near) => near ? front(f.group, 0.8, 0.1, 0.1) : new V3(2.2, 1.6, 3.2),
  };
}

// ------------------------------------------------------------------ centipede
function centipedeBase(T, hideLegs) {
  const c = new Centipede(T, { lite: false });
  c.hideLegs = hideLegs;
  c.headParts.group.visible = false;
  for (const a of c.ants) a.tube.mesh.visible = false;
  c.reset(2.2, 0, Math.PI / 2);
  let ang = 0;
  const drive = (dt, walk) => {
    const H = c.headXZ, a = Math.atan2(H.y, H.x) + 0.7;
    c.mode = 'drive'; c.driveSpeed = walk ? 0.9 : 0;
    c.b.target.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2);
    c.update(dt, null, null);
  };
  return { c, drive };
}
function centiA(T) {
  const { c, drive } = centipedeBase(T, 3);
  const group = new THREE.Group(); group.add(c.group);
  const skin = skinMaterial('#cbbdb0');
  // a man's chest and shoulders where its head was, his head up, grinning; and his arms out in front,
  // long, dragging the rest of it along
  const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 28, 20), skin);
  chest.scale.set(0.17, 0.1, 0.17); chest.position.set(0, 0.05, -0.06); chest.castShadow = true;
  const neckM = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.2, 14), skin);
  neckM.position.set(0, 0.16, 0.06); neckM.rotation.x = 0.9; neckM.castShadow = true;
  const ribs = new THREE.Group();
  for (let k = 0; k < 5; k++) { const r = new THREE.Mesh(new THREE.TorusGeometry(0.15 - k * 0.012, 0.008, 6, 20, Math.PI), skin); r.rotation.set(Math.PI / 2, 0, Math.PI); r.position.set(0, 0.03, -0.02 - k * 0.045); r.scale.set(1, 1.1, 0.75); ribs.add(r); }
  c.head.add(chest, neckM, ribs);
  const f = makeFace({ h: 0.25, mouth: 'grin', eyes: 'human', eyeColor: 'grey', skin: '#cbbdb0', mottle: '#8a7480', seg: 96 });
  f.group.position.set(0, 0.27, 0.15);
  const rest = new THREE.Euler(-0.15, 0, 0);
  f.group.rotation.copy(rest);
  c.head.add(f.group);
  const arms = [-1, 1].map((s) => { const a = new Arm({ upper: 0.4, fore: 0.38, hand: 0.19, r: 0.036, mat: skin, mirror: s < 0 }); group.add(a.group); return { s, a }; });
  const gait = new HandGait(2), homes = [new V3(), new V3()];
  const S = new V3(), fwd = new V3(), right = new V3(), pole = new V3();
  return {
    group,
    update(dt, t, ctx) {
      drive(dt, ctx.walk);
      f.setOpen(0.15 + 0.3 * (0.5 + 0.5 * Math.sin(t * 0.7)));
      track(f.group, ctx.cam, rest, 0.8, 0.4, 0.06);
      f.lookAt(ctx.cam);
      c.head.updateMatrixWorld(true);
      fwd.set(0, 0, 1).transformDirection(c.head.matrixWorld).setY(0).normalize();
      right.crossVectors(fwd, UP).normalize();
      arms.forEach(({ s, a }, i) => {
        homes[i].copy(c.rPos[0]).addScaledVector(fwd, 0.5).addScaledVector(right, s * 0.42).setY(0.015);
      });
      gait.update(dt, homes, fwd, c.speed, 0.22, 0.14, 1);
      arms.forEach(({ s, a }, i) => {
        S.set(s * 0.19, 0.1, 0.0).applyMatrix4(c.head.matrixWorld);
        pole.copy(S).addScaledVector(right, s * 0.6).addScaledVector(fwd, -0.3).add(new V3(0, 0.4, 0));
        a.solve(S, gait.feet[i].p, pole, fwd, gait.feet[i].t < 1 ? 0.75 : 0.25, t);
      });
    },
    focus: (near) => near ? wp(f.group) : c.rPos[6].clone(),
    view: (near) => near ? front(f.group, 1.0) : new V3(3.0, 2.2, 4.2),
  };
}
function centiB(T) {
  const { c, drive } = centipedeBase(T, 4);
  const group = new THREE.Group(); group.add(c.group);
  const skin = skinMaterial('#c8b8aa');
  // a man's head on it, upside down, screaming, its poison claws coming out of his mouth; and four
  // pairs of human arms instead of its first legs
  const f = makeFace({ h: 0.24, mouth: 'scream', eyes: 'black', tears: true, skin: '#c8b8aa', mottle: '#8a7076', seg: 96 });
  f.group.position.set(0, 0.04, 0.06);
  const rest = new THREE.Euler(0.25, 0, Math.PI);
  f.group.rotation.copy(rest);
  c.head.add(f.group);
  const clawMat = new THREE.MeshPhysicalMaterial({ color: '#2a1810', roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.1 });
  const claws = [-1, 1].map((s) => {
    const g = new THREE.ConeGeometry(0.016, 0.16, 10, 8); g.rotateX(Math.PI / 2); g.translate(0, 0, 0.08);
    const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const z = p.getZ(i); p.setX(i, p.getX(i) - s * 4 * z * z); } g.computeVertexNormals();
    const m = new THREE.Mesh(g, clawMat); m.castShadow = true; f.head.add(m); return { s, m };
  });
  const arms = [];
  for (let i = 0; i < 4; i++) for (const s of [-1, 1]) { const a = new Arm({ upper: 0.24, fore: 0.24, hand: 0.13, r: 0.024, mat: skin, mirror: s < 0 }); group.add(a.group); arms.push({ i, s, a }); }
  const gait = new HandGait(8), homes = arms.map(() => new V3());
  const S = new V3(), pole = new V3();
  return {
    group,
    update(dt, t, ctx) {
      drive(dt, ctx.walk);
      const o = 0.75 + 0.25 * Math.sin(t * 2.2);
      f.setOpen(o);
      // the claws: out of the mouth, opening and closing (in the face's frame: unit head, mouth ~-0.3)
      for (const { s, m } of claws) { m.position.set(s * 0.03, -0.3 - 0.06 * o, 0.25); m.rotation.y = s * (0.35 + 0.25 * Math.sin(t * 5)); m.scale.setScalar(1 / f.h * 0.25); }
      const fwd0 = c.tan[0];
      arms.forEach(({ i, s }, k) => {
        const T = c.tan[i], R = c.right[i];
        homes[k].copy(c.rPos[i]).addScaledVector(R, s * 0.48).addScaledVector(T, 0.12).setY(0.015);
      });
      gait.update(dt, homes, new V3(fwd0.x, 0, fwd0.z).normalize(), c.speed, 0.16, 0.1, 3);
      arms.forEach(({ i, s, a }, k) => {
        const R = c.right[i], U = c.upv[i], T = c.tan[i];
        S.copy(c.rPos[i]).addScaledVector(R, s * 0.16).addScaledVector(U, 0.0);
        pole.copy(S).addScaledVector(R, s * 0.5).addScaledVector(T, -0.25).add(new V3(0, 0.35, 0));
        a.solve(S, gait.feet[k].p, pole, new V3(R.x * s * 0.6 + T.x, 0, R.z * s * 0.6 + T.z).normalize(), gait.feet[k].t < 1 ? 0.7 : 0.3, t + k);
      });
    },
    focus: (near) => near ? wp(f.group) : c.rPos[6].clone(),
    view: (near) => near ? front(c.head, 1.0, 0.1) : new V3(3.0, 2.2, 4.2),
  };
}

export const MUTANTS = {
  ghostA: { make: ghostA, desc: '<b>유령거미 A · 머리가 사람 얼굴</b><br>참고 사진처럼 몸 앞쪽이 창백한 사람 머리. 까만 눈(손전등에 번들거림)에 검은 눈물 자국, 입을 길게 찢어지게 벌렸다 닫았다 하며 비명. 고개가 당신 쪽으로 돌아감' },
  ghostB: { make: ghostB, desc: '<b>유령거미 B · 긴 목 위의 얼굴</b><br>몸 위로 가느다란 사람 목이 길게 솟아 그 끝에 얼굴이 흔들리며 당신을 계속 쳐다봄(천장에 있으면 목이 당신 쪽으로 축 늘어짐). 눈이 따라오고, 더듬이발 자리에 작은 사람 손 두 개가 꼼지락' },
  wolfA: { make: wolfA, desc: '<b>늑대거미 A · 눈 여덟 개 달린 얼굴</b><br>머리가슴 앞이 사람 얼굴인데, 눈이 늑대거미처럼 여덟 개(큰 눈 둘, 그 아래 넷, 위에 둘) 전부 사람 눈이라 당신을 따라 굴러감. 독니 자리엔 이빨 드러낸 웃는 입' },
  wolfB: { make: wolfB, desc: '<b>늑대거미 B · 등에서 올라오는 얼굴</b><br>털 난 배 위로 사람 얼굴이 살가죽을 밀고 올라와 헐떡이며, 눈이 뒤로 굴러 당신을 봄(도망갈 때 등 뒤의 얼굴이 쳐다봄). 앞다리 두 개 끝이 사람 손이라 바닥을 짚고 걸음' },
  centiA: { make: centiA, desc: '<b>지네 A · 사람 상반신</b><br>참고 사진처럼 지네 머리 자리에 사람 가슴·어깨와 대머리가 붙어 고개를 들고 웃고 있음. 긴 사람 팔 두 개로 앞을 짚으며 몸뚱이를 끌고 옴. 눈이 당신을 따라옴' },
  centiB: { make: centiB, desc: '<b>지네 B · 거꾸로 달린 머리</b><br>지네 머리 자리에 사람 머리가 뒤집혀 붙어 비명 지르는 입에서 독발톱이 튀어나와 벌렸다 오므림. 앞다리 네 쌍이 전부 사람 팔이라 손바닥으로 바닥을 짚으며 기어 옴' },
};
