import * as THREE from 'three';
import { Spider } from '../spider.js';
import { Centipede } from '../centipede.js';
import { fuseGhost, fuseCenti } from './fuse.js';

// The preview's hard-mode bugs (the same fused parts the game puts on them; see fuse.js). Each make(T)
// returns { group, update(dt, t, ctx), focus(near) -> world point to look at, view(near) -> camera offset }.
const V3 = THREE.Vector3;
const UP = new V3(0, 1, 0);

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
const wp = (o, v = new V3()) => o.getWorldPosition(v);
// a camera offset in front of something (its local +z), a little up and to the side
function front(o, d, up = 0.08, side = 0.18) {
  o.updateWorldMatrix(true, false);
  const z = new V3(0, 0, 1).transformDirection(o.matrixWorld); z.y = Math.max(z.y, -0.2); z.normalize();
  const x = new V3().crossVectors(UP, z).normalize();
  return z.multiplyScalar(d).addScaledVector(x, side * d).add(new V3(0, up * d + 0.05, 0));
}

function ghost(T) {
  const sp = new Spider('ghost', T), group = new THREE.Group();
  group.add(sp.root);
  const fu = fuseGhost(sp); fu.set(true);
  const walk = walker(sp, 2.05, 1.3, 0.55);
  return {
    group,
    update(dt, t, ctx) { walk(dt, ctx.walk); fu.update(dt, t, ctx.cam); },
    focus: (near) => near ? wp(fu.face.group) : wp(sp.body),
    view: (near) => near ? front(fu.face.group, 0.6) : new V3(2.2, 1.7, 3.2),
  };
}

function centi(T) {
  const c = new Centipede(T, { lite: false });
  const fu = fuseCenti(c, { seg: 96 }); fu.set(true);
  c.reset(2.2, 0, Math.PI / 2);
  const group = new THREE.Group(); group.add(c.group);
  return {
    group,
    update(dt, t, ctx) {
      // round a circle on the floor
      const H = c.headXZ, a = Math.atan2(H.y, H.x) + 0.7;
      c.mode = 'drive'; c.driveSpeed = ctx.walk ? 0.9 : 0;
      c.b.target.set(Math.cos(a) * 2.2, Math.sin(a) * 2.2);
      c.update(dt, null, null);
      fu.update(dt, t, ctx.cam);
    },
    focus: (near) => near ? wp(fu.face.group) : c.rPos[8].clone(),
    view: (near) => near ? front(fu.face.group, 1.0) : new V3(3.4, 2.6, 4.6),
  };
}

export const MUTANTS = {
  ghost: { make: ghost, desc: '<b>유령거미 · 머리가 사람 얼굴</b><br>몸 앞쪽이 창백한 사람 머리. 눈은 크게 파인 검은 구멍, 검은 눈물 자국, 입을 길게 찢어지게 벌렸다 닫았다 하며 비명. 고개가 당신 쪽으로 돌아감' },
  centi: { make: centi, desc: '<b>지네 · 사람 팔 다리</b><br>머리 자리에 사람 가슴과 대머리가 붙어 웃고 있고, 다리 80개가 전부 길고 마른 사람 팔. 손가락으로 바닥을 움켜쥐며 기어 옴. 눈이 당신을 따라옴' },
};
