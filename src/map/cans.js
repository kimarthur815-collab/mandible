import * as THREE from 'three';

// Empty insecticide cans lying about: pick them up (up to 3) and throw one to make a noise somewhere else.
// A thrown can flies, bounces off walls and floors and comes to rest where it can be picked up again;
// its first knock is loud enough to draw roaches over and to send the centipede or the wolf spider to look.
export const CAN_SPOTS = [
  [3.8, 6.2], [-6.5, 26.0], [5.6, 13.0], [13.4, 15.6], [19.4, 25.6], [8.6, 47.6], [19.0, 52.0], [-10.8, 54.2], [-15.0, 44.0],
];
const R = 0.033, H = 0.13, G = 9.8;

function labelTexture() {
  const c = document.createElement('canvas'); c.width = 256; c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#e2bb1c'; x.fillRect(0, 0, 256, 128);
  x.fillStyle = '#141414'; x.fillRect(0, 0, 256, 20); x.fillRect(0, 112, 256, 16);
  for (const cx of [64, 192]) {
    x.fillStyle = '#c4231c'; x.beginPath(); x.arc(cx, 66, 30, 0, 6.29); x.fill();
    x.strokeStyle = '#fff'; x.lineWidth = 5; x.beginPath(); x.arc(cx, 66, 24, 0, 6.29); x.moveTo(cx - 17, 49); x.lineTo(cx + 17, 83); x.stroke();
    x.fillStyle = '#141414'; x.beginPath(); x.ellipse(cx, 66, 7, 12, 0, 0, 6.29); x.fill();
  }
  x.fillStyle = '#141414'; x.font = 'bold 18px sans-serif'; x.textAlign = 'center'; x.fillText('살충제', 128, 72);
  // scuffs and rust
  for (let i = 0; i < 220; i++) { x.fillStyle = `rgba(${90 + Math.random() * 60},${50 + Math.random() * 30},20,${Math.random() * 0.35})`; x.fillRect(Math.random() * 256, Math.random() * 128, 1 + Math.random() * 4, 1 + Math.random() * 3); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  return t;
}

export function createCans(scene, levelMeshes) {
  const label = new THREE.MeshStandardMaterial({ map: labelTexture(), metalness: 0.55, roughness: 0.45 });
  const metal = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: 0.85, roughness: 0.3 });
  const bodyG = new THREE.CylinderGeometry(R, R, H * 0.84, 18, 1, true);
  const domeG = new THREE.SphereGeometry(R, 18, 8, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, 0.55, 1).translate(0, H * 0.42, 0);
  const baseG = new THREE.CircleGeometry(R, 18).rotateX(Math.PI / 2).translate(0, -H * 0.42, 0);
  const ray = new THREE.Raycaster(), n = new THREE.Vector3(), d = new THREE.Vector3(), prev = new THREE.Vector3();
  const list = CAN_SPOTS.map(([x, z], i) => {
    const g = new THREE.Group();
    const body = new THREE.Mesh(bodyG, label), dome = new THREE.Mesh(domeG, metal), base = new THREE.Mesh(baseG, metal);
    body.castShadow = true;
    g.add(body, dome, base);
    scene.add(g);
    const c = { i, g, state: 'floor', pos: new THREE.Vector3(x, R, z), vel: new THREE.Vector3(), spin: new THREE.Vector3(), first: false, t: 0, home: [x, z] };
    rest(c, Math.random() * 6.28);
    return c;
  });
  // lying on its side on the floor
  function rest(c, yaw) {
    c.state = 'floor'; c.pos.y = R; c.vel.set(0, 0, 0);
    c.g.position.copy(c.pos); c.g.rotation.set(0, yaw, Math.PI / 2, 'YXZ'); c.g.visible = true;
  }
  return {
    list,
    // the closest can on the floor within reach
    nearest(p, range) {
      let best = null, bd = range;
      for (const c of list) if (c.state === 'floor') { const dd = Math.hypot(c.pos.x - p.x, c.pos.z - p.z); if (dd < bd) { bd = dd; best = c; } }
      return best;
    },
    take(c) { c.state = 'held'; c.g.visible = false; },
    // out of your hand: from (a point by your right hand), along dir, with some lift
    throw(from, dir) {
      const c = list.find((k) => k.state === 'held');
      if (!c) return null;
      c.state = 'fly'; c.first = true; c.t = 0;
      c.pos.copy(from);
      c.vel.copy(dir).multiplyScalar(9.5); c.vel.y += 2.4;
      c.spin.set(Math.random() * 18 - 9, Math.random() * 6 - 3, Math.random() * 18 - 9);
      c.g.visible = true; c.g.position.copy(c.pos);
      return c;
    },
    // onHit(x, y, z, first, hardness 0..1)
    update(dt, onHit) {
      for (const c of list) {
        if (c.state !== 'fly') continue;
        c.t += dt;
        const steps = Math.ceil(dt / (1 / 90));
        const h = dt / steps;
        for (let s = 0; s < steps && c.state === 'fly'; s++) {
          prev.copy(c.pos);
          c.vel.y -= G * h;
          c.pos.addScaledVector(c.vel, h);
          d.subVectors(c.pos, prev);
          const len = d.length();
          if (len < 1e-6) continue;
          ray.set(prev, d.divideScalar(len)); ray.far = len + R;
          const hit = ray.intersectObjects(levelMeshes, false)[0];
          let hitFloor = false;
          if (hit && hit.face) n.copy(hit.face.normal).transformDirection(hit.object.matrixWorld);
          else if (c.pos.y < R) { n.set(0, 1, 0); hitFloor = true; }
          if (!hit && !hitFloor) continue;
          if (hit) c.pos.copy(hit.point).addScaledVector(n, R + 0.002); else c.pos.y = R;
          const vn = c.vel.dot(n);
          if (vn < 0) c.vel.addScaledVector(n, -1.38 * vn);
          c.vel.multiplyScalar(0.7);
          c.spin.multiplyScalar(0.6);
          onHit && onHit(c.pos.x, c.pos.y, c.pos.z, c.first, Math.min(1, Math.abs(vn) / 7));
          c.first = false;
          if (n.y > 0.6 && c.vel.length() < 0.8) { rest(c, Math.atan2(c.vel.x, c.vel.z) + Math.random() - 0.5); break; }
        }
        if (c.state !== 'fly') continue;
        if (c.t > 6) { rest(c, 0); continue; }          // lost somewhere: just let it lie
        c.g.position.copy(c.pos);
        c.g.rotation.x += c.spin.x * dt; c.g.rotation.y += c.spin.y * dt; c.g.rotation.z += c.spin.z * dt;
      }
    },
    reset() { for (const c of list) { c.pos.set(c.home[0], R, c.home[1]); rest(c, Math.random() * 6.28); } },
  };
}
