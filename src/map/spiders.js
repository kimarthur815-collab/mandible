// Ceiling spiders and web traps for the map.
// Ghost spider (3.5 m legs) rules the corridor, wolf spider (3 m) the production hall.
// They wait on the ceiling, drop when you pass beneath in the dark, and grab you.
// Webs across the corridor and the lab door slow you, shake, and call the nearest spider.
import * as THREE from 'three';
import { Spider } from '../spider.js';
import { Thread, makeDoorWeb } from '../silk.js';

const V3 = THREE.Vector3;

const ZONES = [
  { type: 'ghost', scale: 2.05, ceil: 4.0, bounds: { x0: 17.0, x1: 20.0, z0: 20.8, z1: 45.2 }, spots: [[18.5, 26.5, 0.2], [18.3, 31.0, 3.0], [18.7, 35.0, 1.4]] },
  { type: 'wolf', scale: 2.35, ceil: 8.0, bounds: { x0: -5.2, x1: 23.2, z0: 46.8, z1: 69.2 }, spots: [[7.2, 55.5, 0.4], [7.2, 61.0, 2.6], [-3.6, 58.0, 1.6], [12.4, 49.3, 4.2]] },
];

export class MapSpiders {
  constructor(scene, silk, T) {
    this.scene = scene;
    this.silk = silk;
    this.spiders = ZONES.map((z) => {
      const s = new Spider(z.type, T);
      s.root.scale.setScalar(z.scale);
      s.grabDist = z.type === 'wolf' ? 0.95 : 0.8;
      s.root.traverse((o) => { if (o.isMesh) o.castShadow = true; });
      scene.add(s.root);
      const th = new Thread(silk);
      scene.add(th.line);
      return { ...z, s, th, grabbed: false, fallT: 0 };
    });
    // webs: one across the corridor, one in the lab doorway
    this.webs = [
      this.makeWeb({ x: 18.5, z: 38.0, axis: 'z', halfW: 1.72, h: 3.95 }),
      this.makeWeb({ x: -6.0, z: 57.5, axis: 'x', halfW: 1.5, h: 3.0 }),
    ];
    this.reset();
  }

  makeWeb({ x, z, axis, halfW, h }) {
    const mat = this.silk.clone();
    const mesh = makeDoorWeb(0, h * 0.52, 0, halfW, h, mat);
    mesh.frustumCulled = false;
    mesh.position.set(x, 0, z);
    if (axis === 'x') mesh.rotation.y = Math.PI / 2;
    this.scene.add(mesh);
    return { mesh, mat, x, z, axis, halfW, h, state: 'whole', alpha: 1, shake: 0, seenLit: false };
  }

  reset() {
    for (const sp of this.spiders) {
      const [x, z, yaw] = sp.spots[Math.floor(Math.random() * sp.spots.length)];
      sp.s.caught = false; sp.grabbed = false;
      sp.s.placeOnCeiling(x, z, yaw, sp.ceil);
      sp.home = { x, z, yaw };
    }
    for (const w of this.webs) { w.state = 'whole'; w.alpha = 1; w.shake = 0; w.mesh.visible = true; w.mesh.scale.set(1, 1, 1); }
  }

  // the web whose plane you are walking through, if any
  webAt(p) {
    for (const w of this.webs) {
      if (w.state !== 'whole') continue;
      const across = w.axis === 'z' ? p.z - w.z : p.x - w.x, along = w.axis === 'z' ? p.x - w.x : p.z - w.z;
      if (Math.abs(across) < 0.38 && Math.abs(along) < w.halfW + 0.1) return w;
    }
    return null;
  }

  nearestSpider(x, z) {
    let best = null;
    for (const sp of this.spiders) {
      const p = sp.s.root.position, d = Math.hypot(p.x - x, p.z - z);
      if (d < 30 && (!best || d < best.d)) best = { sp, d };
    }
    return best && best.sp;
  }

  // ctx: { dt, cam, light, safe, frozen, onFirstLit, onDrop, onCatch, onWebHit, onWebLit, onRetract }
  update(ctx) {
    const { dt } = ctx;
    for (const sp of this.spiders) {
      const s = sp.s;
      if (ctx.frozen && (s.state === 'ceiling' || s.state === 'crawl')) { s.cooldown = Math.max(s.cooldown, 0.3); }
      if (ctx.safe) s.cooldown = Math.max(s.cooldown, 0.25);           // nothing drops into a lit safe zone
      if (s.state === 'fallen') {
        // sprayed: on its back on the floor, legs kicking; then it climbs its line back up
        sp.fallT -= dt;
        const k = Math.min(1, (3 - sp.fallT) / 0.35);
        const p = sp.fallFrom.clone().lerp(sp.fallTo, k * k);
        s.setBodyAt(p, sp.fallQ);
        s.time += dt; s.root.updateMatrixWorld(true); s.body.updateMatrix();
        s.updateGait(dt, true); s.updateLegs(s.time, true);
        if (sp.fallT <= 0) { s.state = 'retract'; s.st = 0; s.retractFrom = s.bodyWorld; s.retractQ = s.root.quaternion.clone(); s.caught = false; }
        sp.th.set(s.anchor, s.spinneretWorld(), true);
        continue;
      }
      if (!s.onCatch) {
        s.onFirstLit = () => ctx.onFirstLit && ctx.onFirstLit(sp);
        s.onDrop = () => ctx.onDrop && ctx.onDrop(sp);
        s.onRetract = () => ctx.onRetract && ctx.onRetract(sp);
        s.onCatch = () => { sp.grabbed = true; sp.grabK = 0; ctx.onCatch && ctx.onCatch(sp); };
      }
      if (sp.grabbed) {
        // holding on to your face: pull itself into the middle of your view, legs clamped round you
        if (ctx.camFwd) {
          sp.grabK = Math.min(1, (sp.grabK || 0) + dt * 6);
          const tgt = ctx.cam.clone().addScaledVector(ctx.camFwd, s.grabDist || 0.8).add(new V3(0, -0.12, 0));
          const Y = ctx.camFwd.clone().setY(0).normalize(), Z = new V3(0, -1, 0), X = new V3().crossVectors(Y, Z);
          const q = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
          const cur = s.bodyWorld.lerp(tgt, sp.grabK * 0.5 + 0.1);
          s.setBodyAt(cur, s.root.quaternion.clone().slerp(q, sp.grabK * 0.5 + 0.1));
          s.root.position.y += Math.sin(s.time * 31) * 0.01;
        }
        s.time += dt; s.root.updateMatrixWorld(true); s.updateGait(dt, true); s.updateLegs(s.time, true); s.updatePalps(s.time);
      } else {
        s.update(dt, { light: ctx.light, cam: ctx.cam, bounds: sp.bounds });
      }
      sp.th.set(s.anchor, s.spinneretWorld(), s.threadVisible || sp.grabbed);
    }
    // webs: light them to see them, walk into them and they shake
    for (const w of this.webs) {
      if (w.state === 'melting') { w.alpha -= dt * 1.6; w.mesh.scale.y = 0.6 + 0.4 * Math.max(0, w.alpha); if (w.alpha <= 0) { w.state = 'gone'; w.mesh.visible = false; } }
      if (w.state === 'torn') w.alpha = Math.max(0.35, w.alpha - dt * 0.8);
      w.shake = Math.max(0, w.shake - dt);
      const j = w.shake > 0 ? Math.sin(performance.now() * 0.06) * 0.04 * w.shake : 0;
      w.mesh.position.y = j; w.mesh.rotation.z = j * 0.5;
      for (const k of ['uSpotPos', 'uSpotDir', 'uCosO', 'uCosI', 'uKey', 'uKeyOn']) w.mat.uniforms[k].value = this.silk.uniforms[k].value;
      w.mat.uniforms.uOn.value = this.silk.uniforms.uOn.value * w.alpha * (1 + w.shake * 2);
      w.mat.uniforms.uAmb.value = this.silk.uniforms.uAmb.value * w.alpha;
      if (w.state === 'whole' && !w.seenLit && ctx.light.on) {
        const v = new V3(w.x, 1.4, w.z).sub(ctx.light.pos), d = v.length();
        if (d < 9 && v.dot(ctx.light.dir) / d > Math.cos(0.3)) { w.seenLit = true; ctx.onWebLit && ctx.onWebLit(w); }
      }
    }
  }

  // you walked into a web: it shakes, you tear through slowly, the nearest spider comes
  hitWeb(w, playerPos) {
    w.state = 'torn'; w.shake = 1.5;
    const sp = this.nearestSpider(w.x, w.z);
    if (sp) sp.s.callTo(playerPos.x, playerPos.z, sp.bounds);
    return sp;
  }

  // spray cone from the can: melts webs, knocks down hanging spiders, frees you from a grab
  spray(origin, dir, range = 3.2, cosHalf = Math.cos(Math.PI / 6)) {
    const res = { webs: 0, spiders: [] };
    const inCone = (p) => { const v = p.clone().sub(origin), d = v.length(); return d < range && v.dot(dir) / d > cosHalf; };
    for (const w of this.webs) {
      if (w.state !== 'whole' && w.state !== 'torn') continue;
      // nearest point of the web to the nozzle
      const p = w.axis === 'z' ? new V3(THREE.MathUtils.clamp(origin.x, w.x - w.halfW, w.x + w.halfW), THREE.MathUtils.clamp(origin.y, 0.2, w.h), w.z)
        : new V3(w.x, THREE.MathUtils.clamp(origin.y, 0.2, w.h), THREE.MathUtils.clamp(origin.z, w.z - w.halfW, w.z + w.halfW));
      const v = p.clone().sub(origin), d = v.length();
      if (d < range && (d < 0.6 || v.dot(dir) / d > 0.5)) { w.state = 'melting'; res.webs++; }
    }
    for (const sp of this.spiders) {
      const s = sp.s;
      const hanging = sp.grabbed || ['drop', 'hang', 'swing', 'caught'].includes(s.state);
      if (!hanging) continue;
      if (sp.grabbed || inCone(s.bodyWorld)) { this.knockDown(sp, origin); res.spiders.push(sp); }
    }
    return res;
  }

  knockDown(sp, from) {
    const s = sp.s;
    const was = s.bodyWorld;
    sp.grabbed = false; s.caught = false;
    s.state = 'fallen'; sp.fallT = 3;
    const away = new V3(was.x - from.x, 0, was.z - from.z); if (away.lengthSq() < 1e-4) away.set(0, 0, 1); away.normalize();
    sp.fallFrom = was.clone();
    sp.fallTo = new V3(was.x + away.x * 0.9, 0.1 + s.P.H * s.root.scale.y * 0.4, was.z + away.z * 0.9);
    // belly up
    const Z = away.clone(), Y = new V3(0, -1, 0), X = new V3().crossVectors(Y, Z);
    sp.fallQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
    s.cooldown = 6;
  }

  // you broke free by struggling: it lets go and pulls itself back up
  release(sp) {
    sp.grabbed = false; sp.s.caught = false;
    sp.s.startRetract();
    sp.s.cooldown = 5;
  }

  // force a drop on whoever is closest (dev)
  dropNow(cam) {
    const sp = this.nearestSpider(cam.x, cam.z);
    if (!sp) return;
    const s = sp.s;
    if (s.state !== 'ceiling') s.placeOnCeiling(s.root.position.x, s.root.position.z, s.yaw, sp.ceil);
    s.root.position.x = cam.x + 0.6; s.root.position.z = cam.z + 0.6;
    s.startDrop(cam);
  }

  states() { return this.spiders.map((sp) => (sp.grabbed ? 'grab' : sp.s.state)); }
}
