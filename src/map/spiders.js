// Ceiling spiders and web traps for the map.
// Ghost spider (3.5 m legs) rules the corridor, wolf spider (3 m) the production hall.
// They wait on the ceiling, drop when you pass beneath in the dark, and grab you.
// Webs across the corridor and the lab door slow you, shake, and call the nearest spider.
import * as THREE from 'three';
import { Spider } from '../spider.js';
import { Thread, makeDoorWeb, sagLine, segmentsGeometry } from '../silk.js';
import { eggSacGeometry } from './ghostlings.js';

const V3 = THREE.Vector3;

// The ghost spider no longer ambushes from above: it sleeps on the corridor ceiling and
// single, nearly invisible threads strung across the corridor at head height wake it.
// Crouch under them. Snap one and it comes down and chases you, flicking between the
// walls and the floor.
const CORR = { wx0: 16.8, wx1: 20.2, z0: 20.4, z1: 45.6, ceil: 4.0 };
const TRIP_Z = [23.6, 27.2, 30.8, 34.2, 37.6, 42.6];
const GR = 0.38;   // how far the ghost's body sits from an edge when it rolls around it
const ZONES = [
  { type: 'ghost', mode: 'trip', scale: 2.05, ceil: 4.0, bounds: { x0: 17.0, x1: 20.0, z0: 20.8, z1: 45.2 }, spots: [[18.5, 29.0, 0.2], [18.3, 32.4, 3.0], [18.7, 35.8, 1.4]] },
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
      if (z.mode === 'trip') s.noAmbush = true;
      return { ...z, s, th, grabbed: false, fallT: 0, g: null };
    });
    this.ghost = this.spiders.find((sp) => sp.mode === 'trip');
    // the ghost carries its egg sac in its jaws, like a real pholcid
    if (this.ghost) {
      const geo = eggSacGeometry();
      const held = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.7 }));
      held.position.set(0, -0.04, 0.095);
      held.scale.setScalar(1.3);
      held.castShadow = true;
      this.ghost.s.body.add(held);
      this.ghost.sacHeld = held;
      const loose = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.75, side: THREE.DoubleSide }));
      loose.visible = false; loose.castShadow = true;
      this.scene.add(loose);
      this.sac = { m: loose, v: new V3(), st: 'off', spin: new V3() };
    }
    // the web in the lab doorway (wolf spider's alarm)
    this.webs = [this.makeWeb({ x: -6.0, z: 57.5, axis: 'x', halfW: 1.5, h: 3.0 })];
    // tripwire threads across the corridor
    this.trips = TRIP_Z.map((z) => {
      const mat = this.silk.clone();
      const mesh = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      return { z, mat, mesh, a: new V3(), b: new V3(), state: 'whole', seen: false };
    });
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
    // threads: a slightly different slant every run, always between a crouching and a standing head
    for (const t of this.trips) {
      const dz = (Math.random() - 0.5) * 0.9;
      t.a.set(CORR.wx0 + 0.02, 1.3 + Math.random() * 0.22, t.z - dz / 2);
      t.b.set(CORR.wx1 - 0.02, 1.3 + Math.random() * 0.22, t.z + dz / 2);
      t.state = 'whole'; t.seen = false;
      this.setThreadGeo(t);
    }
    const gh = this.ghost;
    if (gh) {
      gh.g = null; gh.s.state = 'ceiling';
      gh.hasSac = true; gh.sacHeld.visible = true;
      const L = this.sac; L.st = 'off'; L.m.visible = false; L.m.material.color.setScalar(1);
    }
  }

  // walls, floor, ceiling and anything standing in the corridor, for the ghost's feet to grab
  setColliders(cols) {
    const sp = this.ghost;
    if (!sp) return;
    const boxes = cols.filter((c) => c.x1 > CORR.wx0 - 2.5 && c.x0 < CORR.wx1 + 2.5 && c.z1 > CORR.z0 - 2.5 && c.z0 < CORR.z1 + 2.5);
    const floorY = 0, ceilY = CORR.ceil, UP = new V3(0, 1, 0), DN = new V3(0, -1, 0), NX = [new V3(-1, 0, 0), new V3(1, 0, 0)], NZ = [new V3(0, 0, -1), new V3(0, 0, 1)];
    // first surface the segment a -> b runs into (entering from outside), or null
    sp.s.surf = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      let bt = 1, bn = null;
      if (dy < 0 && a.y >= floorY) { const t = (floorY - a.y) / dy; if (t < bt) { bt = t; bn = UP; } }
      if (dy > 0 && a.y <= ceilY) { const t = (ceilY - a.y) / dy; if (t < bt) { bt = t; bn = DN; } }
      for (const c of boxes) {
        let t0 = 0, t1 = bt, nn = null, ok = true;
        for (const [o, d, lo, hi, N] of [[a.x, dx, c.x0, c.x1, NX], [a.z, dz, c.z0, c.z1, NZ]]) {
          if (Math.abs(d) < 1e-9) { if (o < lo || o > hi) { ok = false; break; } continue; }
          const ta = (lo - o) / d, tb = (hi - o) / d;
          const tin = Math.min(ta, tb), tout = Math.max(ta, tb);
          if (tin > t0) { t0 = tin; nn = d > 0 ? N[0] : N[1]; }
          if (tout < t1) t1 = tout;
          if (t0 > t1) { ok = false; break; }
        }
        if (ok && nn && t0 < bt) { bt = t0; bn = nn; }
      }
      return bn ? { p: new V3(a.x + dx * bt, a.y + dy * bt, a.z + dz * bt), n: bn, t: bt } : null;
    };
  }

  setThreadGeo(t) {
    const segs = [];
    if (t.state === 'whole') sagLine(t.a, t.b, 0.035, 14, segs);
    else {
      // snapped: two loose ends hanging from the walls
      for (const [p, q] of [[t.a, t.b], [t.b, t.a]]) {
        const end = p.clone().lerp(q, 0.22); end.y -= 0.85;
        sagLine(p, end, -0.05, 6, segs);
      }
    }
    t.mesh.geometry.dispose();
    t.mesh.geometry = segmentsGeometry(segs);
  }

  // does a body standing at (x, z) with its head at headY touch a thread?
  threadAt(p, headY) {
    for (const t of this.trips) {
      if (t.state !== 'whole') continue;
      const ax = t.a.x, az = t.a.z, bx = t.b.x - ax, bz = t.b.z - az;
      const u = THREE.MathUtils.clamp(((p.x - ax) * bx + (p.z - az) * bz) / (bx * bx + bz * bz), 0, 1);
      const cx = ax + bx * u, cz = az + bz * u;
      if (Math.hypot(p.x - cx, p.z - cz) > 0.3) continue;
      const y = t.a.y + (t.b.y - t.a.y) * u - 0.035 * 4 * u * (1 - u);
      if (headY > y) return t;
    }
    return null;
  }

  // the ghost lets go of its egg sac (first spray or struggle only); it falls and bursts on the floor
  dropSac(sp) {
    if (!sp || !sp.sacHeld || !sp.hasSac) return false;
    sp.hasSac = false;
    sp.sacHeld.visible = false;
    const L = this.sac, m = L.m, k = sp.s.root.scale.x;
    sp.s.root.updateMatrixWorld(true);
    sp.sacHeld.getWorldPosition(m.position);
    sp.sacHeld.getWorldQuaternion(m.quaternion);
    m.scale.setScalar(k * 1.3); m.visible = true; m.material.color.setScalar(1);
    L.v.set((Math.random() - 0.5) * 0.8, 0.5, (Math.random() - 0.5) * 0.8);
    L.spin.set(Math.random() * 6 - 3, Math.random() * 6 - 3, Math.random() * 6 - 3);
    L.st = 'fall';
    return true;
  }

  updateSac(dt) {
    const L = this.sac;
    if (!L || L.st !== 'fall') return;
    const m = L.m, r = 0.032 * m.scale.x;
    L.v.y -= 9.8 * dt;
    m.position.addScaledVector(L.v, dt);
    m.position.x = THREE.MathUtils.clamp(m.position.x, CORR.wx0 + 0.1, CORR.wx1 - 0.1);
    m.rotation.x += L.spin.x * dt; m.rotation.y += L.spin.y * dt; m.rotation.z += L.spin.z * dt;
    if (m.position.y <= r) {
      // splits open on the floor: what is left is a flattened, darker husk
      m.position.y = r * 0.4;
      m.scale.y *= 0.4;
      m.rotation.set(0, Math.random() * 6, 0);
      m.material.color.setScalar(0.6);
      L.st = 'burst';
      this.onSacBurst && this.onSacBurst(new V3(m.position.x, 0, m.position.z));
    }
  }

  snapThread(t) {
    t.state = 'snapped';
    this.setThreadGeo(t);
    if (this.ghost) this.wakeGhost(this.ghost);
  }

  // ---------------------------------------------------------------- the ghost spider's chase
  wakeGhost(sp) {
    const s = sp.s;
    if (sp.g && sp.g.phase !== 'sleep') { sp.g.chaseT = 0; return false; }
    if (s.state !== 'ceiling' && s.state !== 'crawl') return false;
    const top = s.bodyWorld;
    sp.g = { phase: 'descend', t: 0, top, anchor: s.root.position.clone(), ceilQ: s.root.quaternion.clone(), surf: 'floor', h: 0, hT: 1.4, switchT: 1.2, burst: 0, go: true, speed: 0,
      cowerT: 0, cowerCd: 0, hits: 0, hitDecay: 0, chaseT: 0, outT: 0, giveup: false, seed: Math.random() * 10, pos: new V3(top.x, 0, top.z), yaw: s.yaw || 0 };
    s.state = 'descend';
    s.anchor.copy(sp.g.anchor);
    this.onWake && this.onWake(sp);
    return true;
  }

  // surface frame: up = wall/floor normal, forward = heading on that surface
  surfQuat(n, f) {
    const Y = n.clone().normalize(), Z = f.clone().addScaledVector(Y, -f.dot(Y));
    if (Z.lengthSq() < 1e-6) Z.set(0, 0, 1).addScaledVector(Y, -Y.z);
    Z.normalize();
    const X = new V3().crossVectors(Y, Z);
    return new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z));
  }

  updateGhost(sp, ctx) {
    const s = sp.s, g = sp.g, dt = ctx.dt, P = ctx.player;
    g.t += dt;
    if (g.phase === 'descend') {
      // drops on its line, spinning, then lands on the floor
      const k = Math.min(1, g.t / 0.85), e = k * k;
      const floorBody = new V3(g.top.x, s.P.H * s.root.scale.y, g.top.z);
      const p = g.top.clone().lerp(floorBody, e);
      const hang = this.surfQuat(new V3(0, 1, 0), new V3(Math.sin(g.yaw), 0, Math.cos(g.yaw)));
      const q = g.ceilQ.clone().slerp(hang, Math.min(1, k * 1.6)).premultiply(new THREE.Quaternion().setFromAxisAngle(new V3(0, 1, 0), Math.PI * 3 * k * (1 - k)));
      s.setBodyAt(p, q);
      s.speed = 0;
      s.update(dt, { light: ctx.light, cam: ctx.cam, bounds: sp.bounds });
      sp.th.set(g.anchor, s.spinneretWorld(), true);
      if (k >= 1) { g.phase = 'chase'; g.surf = 'floor'; g.pos.set(THREE.MathUtils.clamp(g.top.x, CORR.wx0 + 0.02 + GR, CORR.wx1 - 0.02 - GR), 0, g.top.z); g.q = hang; s.state = 'chase'; }
      return;
    }
    sp.th.set(g.anchor, s.spinneretWorld(), false);
    const W0 = CORR.wx0 + 0.02, W1 = CORR.wx1 - 0.02;
    const inCorr = P.x > CORR.wx0 - 0.2 && P.x < CORR.wx1 + 0.2 && P.z > CORR.z0 - 0.3 && P.z < CORR.z1 + 0.3;
    const body = s.bodyWorld, dCam = body.distanceTo(ctx.cam), dP = Math.hypot(P.x - g.pos.x, P.z - g.pos.z);
    if (g.phase === 'chase') {
      g.chaseT += dt;
      g.outT = inCorr ? 0 : g.outT + dt;
      if (dP > 15 || g.chaseT > 15 || g.outT > 2 || !ctx.alive) { g.phase = 'giveup'; g.giveup = true; }
    }
    // the beam makes it flinch, a bit less each time
    g.cowerCd -= dt; g.hitDecay += dt;
    if (g.hitDecay > 6 && g.hits > 0) { g.hits--; g.hitDecay = 0; }
    let lit = false;
    if (ctx.light.on && g.phase === 'chase') { const v = body.clone().sub(ctx.light.pos), d = v.length(); lit = d < 14 && v.dot(ctx.light.dir) / d > Math.cos(0.32); }
    if (lit && g.cowerT <= 0 && g.cowerCd <= 0) {
      g.cowerT = [1.5, 1.1, 0.7, 0.5][Math.min(3, g.hits)]; g.hits++; g.hitDecay = 0; g.cowerCd = g.cowerT + 0.9; s.whirl = 1.2;
      this.onCower && this.onCower(sp);
    }
    g.cowerT -= dt;
    s.cower = THREE.MathUtils.lerp(s.cower, g.cowerT > 0 ? 1 : 0.15, 1 - Math.exp(-dt * 8));
    // jerky rhythm: bursts and dead stops
    g.burst -= dt;
    if (g.burst <= 0) { g.go = Math.random() < 0.8; g.burst = g.go ? 0.35 + Math.random() * 0.8 : 0.1 + Math.random() * 0.3; }
    let speed = g.cowerT > 0 ? 0 : g.go ? 4.4 : 0.3;
    if (g.giveup) speed = 3.2;
    // pick a surface: floor <-> walls
    g.switchT -= dt;
    const tz = THREE.MathUtils.clamp(P.z, CORR.z0 + 0.4, CORR.z1 - 0.4);
    if (g.giveup) { if (g.surf === 'floor') g.want = g.pos.x < 18.5 ? 'west' : 'east'; else g.want = g.surf; g.hT = 3.7; }
    else if (g.switchT <= 0) {
      g.switchT = 1.1 + Math.random() * 1.7;
      g.want = g.surf === 'floor' ? (Math.random() < 0.5 ? 'west' : 'east') : (Math.random() < 0.75 ? 'floor' : g.surf);
      g.hT = 0.9 + Math.random() * 1.6;
    }
    if (!g.want) g.want = 'floor';
    // close in: always come down for the last couple of metres
    if (!g.giveup && dP < 2.6) g.want = 'floor';
    // the body rolls around the inside of each edge (radius GR) instead of cutting through it
    const cl = THREE.MathUtils.clamp, R = GR, CE = CORR.ceil, top = CE - R;
    const n = new V3(0, 1, 0), fwd = new V3(), surfPt = new V3();
    let exact = false;
    if (g.surf === 'floor') {
      let tx = cl(P.x, W0 + R, W1 - R);
      if (g.want === 'west') tx = W0; else if (g.want === 'east') tx = W1;
      const dx = tx - g.pos.x, dzz = tz - g.pos.z, L = Math.hypot(dx, dzz) || 1;
      fwd.set(dx / L, 0, dzz / L);
      if (g.want !== 'floor') { fwd.x += Math.sign(dx) * 0.8; fwd.normalize(); }
      g.yaw = Math.atan2(fwd.x, fwd.z) + Math.sin(g.t * 9 + g.seed) * 0.25;
      fwd.set(Math.sin(g.yaw), 0, Math.cos(g.yaw));
      g.pos.addScaledVector(fwd, speed * dt);
      g.pos.x = cl(g.pos.x, W0 + R, W1 - R); g.pos.z = cl(g.pos.z, CORR.z0, CORR.z1);
      if (g.want !== 'floor' && Math.abs(g.pos.x - (g.want === 'west' ? W0 + R : W1 - R)) < 0.03) { g.cn = { side: g.want, dir: 1, th: 0, type: 'low' }; g.surf = 'corner'; }
      surfPt.set(g.pos.x, 0, g.pos.z);
    } else if (g.surf === 'corner') {
      const c = g.cn, sg = c.side === 'west' ? 1 : -1, wx = c.side === 'west' ? W0 : W1;
      const dzz = g.giveup ? 0 : cl(tz - g.pos.z, -1, 1) * 0.5;
      c.th = cl(c.th + c.dir * speed * 0.8 * dt / R, 0, Math.PI / 2);
      g.pos.z = cl(g.pos.z + dzz * speed * dt, CORR.z0, CORR.z1);
      const sn = Math.sin(c.th), cs = Math.cos(c.th);
      let tx, ty;
      if (c.type === 'low') {
        // floor <-> wall, around the bottom edge
        surfPt.set(wx + sg * (R - R * sn), R - R * cs, g.pos.z);
        n.set(sg * sn, cs, 0);
        tx = -sg * cs; ty = sn;
      } else {
        // wall -> ceiling, over the top edge
        surfPt.set(wx + sg * (R - R * cs), CE - R + R * sn, g.pos.z);
        n.set(sg * cs, -sn, 0);
        tx = sg * sn; ty = cs;
      }
      fwd.set(tx * c.dir, ty * c.dir, dzz).normalize();
      exact = true;
      if (c.type === 'low' && c.dir > 0 && c.th >= Math.PI / 2) { g.surf = c.side; g.h = R; g.pos.x = wx; }
      else if (c.type === 'low' && c.dir < 0 && c.th <= 0) { g.surf = 'floor'; g.pos.x = wx + sg * R; }
      else if (c.type === 'top' && c.th >= Math.PI / 2) {
        // up on the ceiling: crawl home and sleep
        s.placeOnCeiling(wx + sg * R, g.pos.z, sg * Math.PI / 2, sp.ceil);
        s.callTo(sp.home.x, sp.home.z, sp.bounds);
        sp.g = null;
        return;
      }
    } else {
      const side = g.surf, sg = side === 'west' ? 1 : -1, wx = side === 'west' ? W0 : W1;
      n.set(sg, 0, 0);
      const hT = g.want === 'floor' ? R : g.giveup ? top : cl(g.hT + Math.sin(g.t * 1.9 + g.seed) * 0.35, R, top);
      const dh = hT - g.h, dzz = g.giveup ? 0 : tz - g.pos.z, L = Math.hypot(dh, dzz);
      if (L > 1e-4) fwd.set(0, dh / L, dzz / L); else fwd.set(0, 1, 0);
      g.h = cl(g.h + fwd.y * speed * 0.9 * dt, R, top);
      g.pos.z = cl(g.pos.z + fwd.z * speed * 0.9 * dt, CORR.z0, CORR.z1);
      g.pos.x = wx;
      if (g.want === 'floor' && g.h <= R + 0.01) { g.cn = { side, dir: -1, th: Math.PI / 2, type: 'low' }; g.surf = 'corner'; }
      else if (g.giveup && g.h >= top - 0.01) { g.cn = { side, dir: 1, th: 0, type: 'top' }; g.surf = 'corner'; }
      surfPt.set(wx, g.h, g.pos.z);
    }
    const q = this.surfQuat(n, fwd.lengthSq() > 0 ? fwd : new V3(0, 0, 1));
    g.q = exact || !g.q ? q : g.q.clone().slerp(q, 1 - Math.exp(-dt * 10));
    s.root.position.copy(surfPt);
    s.root.quaternion.copy(g.q);
    s.speed = speed;
    s.state = 'chase';
    s.update(dt, { light: ctx.light, cam: ctx.cam, bounds: sp.bounds });
    if (!g.giveup && g.cowerT <= 0 && dCam < 1.3 && ctx.alive && !ctx.god && !ctx.safe) { s.caught = true; sp.grabbed = true; sp.grabK = 0; ctx.onCatch && ctx.onCatch(sp); }
  }

  // after a grab or a spray knock-down the ghost scurries off and climbs back to sleep
  ghostRetreat(sp) {
    const s = sp.s, b = s.bodyWorld;
    sp.grabbed = false; s.caught = false;
    const g = sp.g || {};
    sp.g = Object.assign(g, { phase: 'giveup', giveup: true, t: 0, surf: 'floor', pos: new V3(THREE.MathUtils.clamp(b.x, CORR.wx0 + 0.02 + GR, CORR.wx1 - 0.02 - GR), 0, THREE.MathUtils.clamp(b.z, CORR.z0, CORR.z1)), h: 0, hT: 3.7, burst: 0, go: true, cowerT: 0, cowerCd: 0, hits: 0, hitDecay: 0, chaseT: 0, outT: 0, seed: Math.random() * 10, yaw: 0, switchT: 9, want: b.x < 18.5 ? 'west' : 'east', q: null, anchor: g.anchor || s.root.position.clone() });
    s.state = 'chase';
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
    this.onWake = ctx.onWake; this.onCower = ctx.onCower; this.onSacBurst = ctx.onSacBurst;
    if (!ctx.frozen) this.updateSac(ctx.dt);
    for (const sp of this.spiders) {
      const s = sp.s;
      if (sp.mode === 'trip' && sp.g && !sp.grabbed && s.state !== 'fallen') {
        if (!ctx.frozen) this.updateGhost(sp, { ...ctx, player: ctx.playerPos });
        continue;
      }
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
        if (sp.fallT <= 0) {
          if (sp.mode === 'trip') { this.ghostRetreat(sp); continue; }
          s.state = 'retract'; s.st = 0; s.retractFrom = s.bodyWorld; s.retractQ = s.root.quaternion.clone(); s.caught = false;
        }
        sp.th.set(s.anchor, s.spinneretWorld(), sp.mode !== 'trip');
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
    for (const t of this.trips) {
      for (const k of ['uSpotPos', 'uSpotDir', 'uCosO', 'uCosI', 'uKey', 'uKeyOn']) t.mat.uniforms[k].value = this.silk.uniforms[k].value;
      t.mat.uniforms.uOn.value = this.silk.uniforms.uOn.value * (t.state === 'whole' ? 0.8 : 0.5);
      t.mat.uniforms.uAmb.value = this.silk.uniforms.uAmb.value;
      if (!t.seen && t.state === 'whole' && ctx.light.on) {
        const mid = t.a.clone().lerp(t.b, 0.5), v = mid.sub(ctx.light.pos), d = v.length();
        if (d < 6 && v.dot(ctx.light.dir) / d > Math.cos(0.3)) { t.seen = true; ctx.onThreadLit && ctx.onThreadLit(t); }
      }
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
      const hanging = sp.grabbed || ['drop', 'hang', 'swing', 'caught', 'chase', 'descend'].includes(s.state);
      if (!hanging) continue;
      if (sp.grabbed || inCone(s.bodyWorld)) { this.knockDown(sp, origin); res.spiders.push(sp); }
    }
    return res;
  }

  knockDown(sp, from) {
    const s = sp.s;
    if (sp.mode === 'trip') this.dropSac(sp);
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
    if (sp.mode === 'trip') { this.dropSac(sp); this.ghostRetreat(sp); return; }
    sp.grabbed = false; sp.s.caught = false;
    sp.s.startRetract();
    sp.s.cooldown = 5;
  }

  // force a drop on whoever is closest (dev)
  dropNow(cam) {
    const sp = this.nearestSpider(cam.x, cam.z);
    if (!sp) return;
    if (sp.mode === 'trip') { this.wakeGhost(sp); return; }
    const s = sp.s;
    if (s.state !== 'ceiling') s.placeOnCeiling(s.root.position.x, s.root.position.z, s.yaw, sp.ceil);
    s.root.position.x = cam.x + 0.6; s.root.position.z = cam.z + 0.6;
    s.startDrop(cam);
  }

  states() { return this.spiders.map((sp) => (sp.grabbed ? 'grab' : sp.mode === 'trip' && sp.g ? sp.g.phase : sp.s.state)); }
  // spiders crawling across the ceiling (for their footsteps)
  emitters(P) {
    const out = [];
    this.spiders.forEach((sp, i) => {
      const s = sp.s;
      if (s.state !== 'crawl' || !(s.speed > 0.05)) return;
      const p = s.root.position, d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < 16) out.push({ key: 's' + i, kind: 'big', x: p.x, y: p.y, z: p.z, d, sp: Math.min(1, 0.4 + s.speed) });
    });
    return out;
  }
  // where the chasing ghost is (for its footsteps)
  ghostInfo() { const g = this.ghost && this.ghost.g; return g && g.phase !== 'descend' ? { x: g.pos.x, y: g.surf === 'floor' ? 0.1 : g.h, z: g.pos.z, speed: this.ghost.s.speed || 0 } : null; }
}
