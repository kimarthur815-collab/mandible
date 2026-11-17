import * as THREE from 'three';
import { makeFace } from './face.js';
import { skinMaterial } from './limbs.js';

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

// the ghost spider: where its head was, a man's head, screaming, the eyes dug out, black tears; the
// legs come out from under it
export function fuseGhost(sp, { seg = 80 } = {}) {
  let f = null, on = false;
  const rest = new THREE.Euler(-0.15, 0, 0);
  return {
    get face() { return f; },
    set(v) {
      on = !!v;
      if (on && !f) {
        f = makeFace({ h: 0.1, mouth: 'scream', eyes: 'hollow', tears: true, skin: '#c6c0b6', mottle: '#8e8e9e', seg });
        f.group.position.set(0, 0.038, 0.085); f.group.rotation.copy(rest);
        f.group.traverse((o) => { if (o.isMesh) o.castShadow = true; });
        sp.body.add(f.group);
      }
      if (f) f.group.visible = on;
      sp.pro.scale.setScalar(on ? 0.8 : 1);
      for (const e of sp.eyeMeshes) e.visible = !on;
      for (const j of sp.jaws) j.visible = !on;
      for (const p of sp.palps) p.tube.mesh.visible = !on;
    },
    update(dt, t, cam) {
      if (!on || !sp.root.visible) return;
      f.setOpen(0.62 + 0.38 * (0.5 + 0.5 * Math.sin(t * 1.7)) + 0.04 * Math.sin(t * 23));
      track(f.group, cam, rest, 0.7, 0.45, 1 - Math.exp(-dt * 5));
    },
  };
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
