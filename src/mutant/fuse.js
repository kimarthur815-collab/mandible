import * as THREE from 'three';
import { makeGrinFace } from './grinface.js';
import { skinMat } from './skin.js';

// Hard mode: the radiation fused the bugs with the people who came in before you. Each fuse*(bug)
// returns { set(on), update(dt, t, cam) }; the human parts are only built the first time they're on.
// (The centipede's is in flesh.js.)
const V3 = THREE.Vector3;

// turn a head (in its parent's frame) toward a world point, within limits; k: how far this frame
export function track(obj, wp, rest, maxYaw = 0.7, maxPitch = 0.45, k = 0.08) {
  const p = obj.parent.worldToLocal(_p.copy(wp)).sub(obj.position);
  const yaw = THREE.MathUtils.clamp(Math.atan2(p.x, p.z), -maxYaw, maxYaw), pitch = THREE.MathUtils.clamp(-Math.atan2(p.y, Math.hypot(p.x, p.z)), -maxPitch, maxPitch);
  _q.setFromEuler(_e.set(rest.x + pitch, rest.y + yaw, rest.z, 'YXZ'));
  obj.quaternion.slerp(_q, k);
}
const _p = new V3(), _q = new THREE.Quaternion(), _e = new THREE.Euler();

// the ghost spider: where its head was, a pale bald head on a thin neck, egg-shaped, the eyes two black
// slanted hollows, smiling far too wide - then the smile opening into a black crescent (see grinface.js);
// it turns to watch you. The legs come out from under it
export function fuseGhost(sp, { seg = 160 } = {}) {
  let f = null, neck = null, on = false;
  const rest = new THREE.Euler(-0.12, 0, 0), base = new V3(0, 0.015, 0.035), top = new V3(), M = new THREE.Matrix4();
  return {
    get face() { return f; },
    set(v) {
      on = !!v;
      if (on && !f) {
        f = makeGrinFace({ h: 0.1, seg });
        f.group.position.set(0, 0.075, 0.1); f.group.rotation.copy(rest);
        sp.body.add(f.group);
        const g = new THREE.CylinderGeometry(0.8, 1, 1, 18, 3, true); g.translate(0, 0.5, 0);
        neck = new THREE.Mesh(g, skinMat({ color: new THREE.Color('#c4b8c4') }));
        neck.matrixAutoUpdate = false; neck.castShadow = true;
        sp.body.add(neck);
      }
      if (f) f.group.visible = neck.visible = on;
      sp.pro.scale.setScalar(on ? 0.8 : 1);
      for (const e of sp.eyeMeshes) e.visible = !on;
      for (const j of sp.jaws) j.visible = !on;
      for (const p of sp.palps) p.tube.mesh.visible = !on;
    },
    update(dt, t, cam) {
      if (!on || !sp.root.visible) return;
      // the smile, then slowly opening wide, then shut again
      const o = 0.5 + 0.5 * Math.sin(t * 0.8);
      f.setOpen(o * o * (3 - 2 * o) + 0.03 * Math.sin(t * 17) * o);
      track(f.group, cam, rest, 0.75, 0.5, 1 - Math.exp(-dt * 4));
      // the neck: from the front of the body up into the underside of the skull, wherever it has turned
      f.group.updateMatrix();
      top.copy(f.neckTop).applyMatrix4(f.group.matrix);
      neck.matrix.copy(segment(M, base, top, 0.016));
    },
  };
}
// a unit cylinder (along +y, from 0 to 1) placed from a to b, radius r
const _x = new V3(), _y = new V3(), _z = new V3();
function segment(out, a, b, r) {
  _y.subVectors(b, a); const len = _y.length() || 1e-5; _y.divideScalar(len);
  _z.set(0, 0, 1).addScaledVector(_y, -_y.z); if (_z.lengthSq() < 1e-8) _z.set(1, 0, 0); _z.normalize();
  _x.crossVectors(_y, _z);
  return out.makeBasis(_x.multiplyScalar(r), _y.multiplyScalar(len), _z.multiplyScalar(r)).setPosition(a);
}
