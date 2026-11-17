import * as THREE from 'three';
import { makeFace } from './face.js';
import { skinMaterial } from './limbs.js';
import { makeGrinFace } from './grinface.js';
import { skinMat } from './skin.js';

// Hard mode: the radiation fused the bugs with the people who came in before you. Each fuse*(bug)
// returns { set(on), update(dt, t, cam) }; the human parts are only built the first time they're on.
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

// the centipede: where its head was, a man's bald head and chest, grinning, his eyes on you; and every
// one of its legs a long human arm, the hands gripping the floor
export function fuseCenti(c, { seg = 72 } = {}) {
  let parts = null, body = null, f = null, on = false;
  const rest = new THREE.Euler(-0.15, 0, 0), facePos = new V3(0, 0.27, 0.15), away = new V3(), hp = new V3();
  const build = () => {
    const skin = skinMaterial('#a89a90');
    parts = new THREE.Group(); body = new THREE.Group(); parts.add(body);
    const chest = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 16), skin);
    chest.scale.set(0.17, 0.1, 0.17); chest.position.set(0, 0.05, -0.06);
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.065, 0.2, 12), skin);
    neck.position.set(0, 0.16, 0.06); neck.rotation.x = 0.9;
    body.add(chest, neck);
    for (let k = 0; k < 5; k++) {
      const r = new THREE.Mesh(new THREE.TorusGeometry(0.15 - k * 0.012, 0.008, 5, 16, Math.PI), skin);
      r.rotation.set(Math.PI / 2, 0, Math.PI); r.position.set(0, 0.03, -0.02 - k * 0.045); r.scale.set(1, 1.1, 0.75);
      body.add(r);
    }
    f = makeFace({ h: 0.25, mouth: 'grin', eyes: 'human', skin: '#a89a90', mottle: '#7a6470', seg });
    f.group.position.copy(facePos); f.group.rotation.copy(rest);
    parts.add(f.group);
    parts.traverse((o) => { if (o.isMesh) o.castShadow = true; });
    c.head.add(parts);
  };
  return {
    get face() { return f; },
    set(v) {
      on = !!v;
      if (on && !parts) build();
      if (parts) parts.visible = on;
      c.headParts.group.visible = !on;
      for (const a of c.ants) a.tube.mesh.visible = !on;
      c.setArms(on);
    },
    update(dt, t, cam) {
      if (!on || !c.group.visible) return;
      // (the grin opens as it lunges, wide when it has you)
      const wide = c.mode === 'kill' ? 1 : Math.max(c.b.lunge, c.b.curl * 0.6);
      f.setOpen(0.15 + 0.1 * Math.sin(t * 0.7) + 0.22 * wide + 0.03 * wide * Math.sin(t * 21));
      // when it has you the chest goes, and the face hangs right over yours, never quite touching
      const kill = c.mode === 'kill';
      body.visible = !kill;
      if (kill) {
        c.head.getWorldPosition(hp);
        away.subVectors(hp, cam); const d = away.length() || 1;
        hp.addScaledVector(away, Math.max(0, 0.34 - d) / d);
        f.group.position.lerp(c.head.worldToLocal(hp), 1 - Math.exp(-dt * 12));
        track(f.group, cam, rest, Math.PI, 1.5, 1 - Math.exp(-dt * 10));
      } else {
        f.group.position.lerp(facePos, 1 - Math.exp(-dt * 6));
        track(f.group, cam, rest, 0.8, 0.4, 1 - Math.exp(-dt * 4));
      }
      f.lookAt(cam);
    },
  };
}
