// Ceiling spiders and web traps for the map.
// Ghost spider (3.5 m legs) rules the corridor, wolf spider (3 m) the production hall.
// They wait on the ceiling, drop when you pass beneath in the dark, and grab you.
// Webs across the corridor and the lab door slow you, shake, and call the nearest spider.
import * as THREE from 'three';
import { Spider } from '../spider.js';
import { Thread, makeDoorWeb, sagLine, makeSilkRibbon, ribbonGeometry } from '../silk.js';
import { eggSacGeometry } from './ghostlings.js';
import { catchUp, HUNT } from './centi.js';

const V3 = THREE.Vector3;

// The ghost spider no longer ambushes from above: it sleeps on the corridor ceiling and
// single, nearly invisible threads strung across the corridor at head height wake it.
// Crouch under them. Snap one and it comes down and chases you, flicking between the
// walls and the floor.
const CORR = { wx0: 16.8, wx1: 20.2, z0: 20.4, z1: 45.6, ceil: 4.0 };
const TRIP_Z = [23.6, 27.2, 30.8, 34.2, 37.6, 42.6];
const GR = 0.38;   // how far the ghost's body sits from an edge when it rolls around it
const CT = { x0: 16.8, x1: 17.6, z0: 38.6, z1: 40.4 };   // the table against the corridor's west wall (level.js TABLES)

// The wolf spider lives on the walls of the production hall. It waits there, head down; light it or
// come within 6 m and it comes down and runs you down across the floor, now and then taking to a wall
// alongside you. Put the beam on it while it hunts and it bolts for the nearest wall, climbs out of
// reach for a few seconds, then comes back. Leave the hall (or get far away) and it goes back to a wall.
const HALL = { x0: -5.7, x1: 23.7, z0: 46.3, z1: 69.7, h: 8 };
const WR = 0.42;  // the wolf's body distance from an edge when it rolls between floor and wall
// the hall's walls: origin at floor level, T along the wall, N into the room; door gaps to stay off
const HALL_WALLS = [
  { name: 'W', O: new V3(HALL.x0, 0, HALL.z0), T: new V3(0, 0, 1), N: new V3(1, 0, 0), len: HALL.z1 - HALL.z0, gaps: [[56 - HALL.z0 - 0.6, 59 - HALL.z0 + 0.6]] },
  { name: 'E', O: new V3(HALL.x1, 0, HALL.z1), T: new V3(0, 0, -1), N: new V3(-1, 0, 0), len: HALL.z1 - HALL.z0, gaps: [] },
  { name: 'S', O: new V3(HALL.x1, 0, HALL.z0), T: new V3(-1, 0, 0), N: new V3(0, 0, 1), len: HALL.x1 - HALL.x0, gaps: [[HALL.x1 - 20.5 - 0.6, HALL.x1 - 16.5 + 0.6]] },
  { name: 'N', O: new V3(HALL.x0, 0, HALL.z1), T: new V3(1, 0, 0), N: new V3(0, 0, -1), len: HALL.x1 - HALL.x0, gaps: [[15 - HALL.x0 - 1.2, 15 - HALL.x0 + 1.2]] },
];
// where it waits: wall index, distance along the wall, height
const WOLF_PERCH = [[1, 13.5, 2.5], [3, 10.0, 2.7], [0, 6.0, 2.4], [1, 4.5, 2.6]];
const inHall = (p, m = 0) => p.x > HALL.x0 - m && p.x < HALL.x1 + m && p.z > HALL.z0 - m && p.z < HALL.z1 + m;
const ZONES = [
  { type: 'ghost', mode: 'trip', scale: 2.05, ceil: 4.0, bounds: { x0: 17.0, x1: 20.0, z0: 20.8, z1: 45.2 }, spots: [[18.5, 29.0, 0.2], [18.3, 32.4, 3.0], [18.7, 35.8, 1.4]] },
  { type: 'wolf', mode: 'wall', scale: 2.35, ceil: 8.0, bounds: { x0: -5.2, x1: 23.2, z0: 46.8, z1: 69.2 }, spots: [[7.2, 55.5, 0.4]] },
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
      const th = new Thread(silk, { ribbon: true });
      scene.add(th.line);
      if (z.mode === 'trip' || z.mode === 'wall') s.noAmbush = true;
      return { ...z, s, th, grabbed: false, fallT: 0, g: null };
    });
    this.ghost = this.spiders.find((sp) => sp.mode === 'trip');
    this.wolf = this.spiders.find((sp) => sp.mode === 'wall');
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
    // (drawn a few pixels wide so they can be found, the base brighter in the beam, dust beads glinting on them)
    this.trips = TRIP_Z.map((z) => {
      const mat = makeSilkRibbon(this.silk, { width: 2.6, base: 0.55, share: false });
      const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
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
    if (this.wolf) this.perchWolf(this.wolf, WOLF_PERCH[0]);
    const gh = this.ghost;
    if (gh) {
      gh.g = null; gh.s.state = 'ceiling';
      gh.hasSac = true; gh.sacHeld.visible = true;
      const L = this.sac; L.st = 'off'; L.m.visible = false; L.m.material.color.setScalar(1);
    }
  }

  // you came back at a lamp: both spiders let go and go back up to the ceiling. What has
  // happened stays happened: snapped threads, a dropped egg sac, melted webs.
  regroup() {
    for (const sp of this.spiders) {
      sp.s.caught = false; sp.grabbed = false; sp.g = null; sp.fallT = 0;
      sp.s.placeOnCeiling(sp.home.x, sp.home.z, sp.home.yaw, sp.ceil);
      sp.s.cooldown = 4;
      if (sp.mode === 'wall') this.perchWolf(sp, WOLF_PERCH[0]);
    }
  }

  // walls, floor, ceiling and anything standing in the corridor, for the ghost's feet to grab
  setColliders(cols) {
    if (this.ghost) this.setFeetSurfaces(this.ghost, cols, { x0: CORR.wx0, x1: CORR.wx1, z0: CORR.z0, z1: CORR.z1 }, CORR.ceil);
    if (this.wolf) this.setFeetSurfaces(this.wolf, cols, HALL, HALL.h);
  }
  setFeetSurfaces(sp, cols, R, ceil) {
    const boxes = cols.filter((c) => c.x1 > R.x0 - 2.5 && c.x0 < R.x1 + 2.5 && c.z1 > R.z0 - 2.5 && c.z0 < R.z1 + 2.5);
    const floorY = 0, ceilY = ceil, UP = new V3(0, 1, 0), DN = new V3(0, -1, 0), NX = [new V3(-1, 0, 0), new V3(1, 0, 0)], NZ = [new V3(0, 0, -1), new V3(0, 0, 1)], YN = [DN, UP];
    // first surface the segment a -> b runs into (entering from outside), or null
    sp.s.surf = (a, b) => {
      const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
      let bt = 1, bn = null;
      if (dy < 0 && a.y >= floorY) { const t = (floorY - a.y) / dy; if (t < bt) { bt = t; bn = UP; } }
      if (dy > 0 && a.y <= ceilY) { const t = (ceilY - a.y) / dy; if (t < bt) { bt = t; bn = DN; } }
      for (const c of boxes) {
        let t0 = 0, t1 = bt, nn = null, ok = true;
        // boxes with a top (tables, conveyors) can be stood on; the rest run up to the ceiling
        for (const [o, d, lo, hi, N] of c.y1 != null ? [[a.x, dx, c.x0, c.x1, NX], [a.z, dz, c.z0, c.z1, NZ], [a.y, dy, -1, c.y1, YN]] : [[a.x, dx, c.x0, c.x1, NX], [a.z, dz, c.z0, c.z1, NZ]]) {
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
    t.mesh.geometry = ribbonGeometry(segs);
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
      // you hid: it lost you, and paces up and down where you went
      else if (ctx.hidden) { g.phase = 'search'; g.searchT = 8 + Math.random() * 2; g.spz = THREE.MathUtils.clamp(P.z, CORR.z0 + 0.6, CORR.z1 - 0.6); g.want = 'floor'; }
    }
    if (g.phase === 'search') {
      g.searchT -= dt;
      g.outT = inCorr ? 0 : g.outT + dt;
      if (!ctx.hidden && ctx.alive && inCorr && dP < 6) g.phase = 'chase';          // there you are
      else if (g.searchT <= 0 || !ctx.alive || g.outT > 2) { g.phase = 'giveup'; g.giveup = true; }
    }
    const srch = g.phase === 'search';
    const tgt = srch ? new V3(18.5 + Math.sin(g.t * 0.9 + g.seed) * 1.1, 0, g.spz + Math.sin(g.t * 0.45 + g.seed) * 2.4) : P;
    // the beam makes it flinch, a bit less each time
    g.cowerCd -= dt; g.hitDecay += dt;
    if (g.hitDecay > 6 && g.hits > 0) { g.hits--; g.hitDecay = 0; }
    let lit = false;
    if (ctx.light.on && g.phase === 'chase') { const v = body.clone().sub(ctx.light.pos), d = v.length(); lit = d < 14 && v.dot(ctx.light.dir) / d > Math.cos(0.32); }
    if (lit && g.cowerT <= 0 && g.cowerCd <= 0) {
      g.cowerT = [1.5, 1.1, 0.7, 0.5][Math.min(3, g.hits)]; g.hits++; g.hitDecay = 0; g.cowerCd = g.cowerT + 0.9; s.whirl = 0.5;
      this.onCower && this.onCower(sp);
    }
    g.cowerT -= dt;
    s.cower = THREE.MathUtils.lerp(s.cower, g.cowerT > 0 ? 1 : 0.15, 1 - Math.exp(-dt * 8));
    // jerky rhythm: bursts and dead stops
    g.burst -= dt;
    if (g.burst <= 0) { g.go = Math.random() < (srch ? 0.55 : 0.8); g.burst = g.go ? 0.35 + Math.random() * 0.8 : srch ? 0.4 + Math.random() * 1.0 : 0.1 + Math.random() * 0.3; }
    let speed = g.cowerT > 0 ? 0 : srch ? (Math.abs(g.pos.z - g.spz) > 3 ? 3.4 : g.go ? 1.8 : 0) : g.go ? 4.4 * HUNT.speed : 0.3;
    if (g.giveup) speed = 3.2;
    // pick a surface: floor <-> walls
    g.switchT -= dt;
    const tz = THREE.MathUtils.clamp(tgt.z, CORR.z0 + 0.4, CORR.z1 - 0.4);
    if (g.giveup) { if (g.surf === 'floor') g.want = g.pos.x < 18.5 ? 'west' : 'east'; else g.want = g.surf; g.hT = 3.7; }
    else if (g.switchT <= 0) {
      g.switchT = 1.1 + Math.random() * 1.7;
      g.want = g.surf === 'floor' ? (Math.random() < 0.5 ? 'west' : 'east') : (Math.random() < 0.75 ? 'floor' : g.surf);
      g.hT = 0.9 + Math.random() * 1.6;
    }
    if (!g.want) g.want = 'floor';
    // close in: always come down for the last couple of metres
    if (!g.giveup && !srch && dP < 2.6) g.want = 'floor';
    // the table on the west wall: don't climb that wall beside it
    const byTable = (z, m) => z > CT.z0 - m && z < CT.z1 + m;
    if (g.surf === 'floor' && g.want === 'west' && byTable(g.pos.z, 1.0)) g.want = 'east';
    // the body rolls around the inside of each edge (radius GR) instead of cutting through it
    const cl = THREE.MathUtils.clamp, R = GR, CE = CORR.ceil, top = CE - R;
    const n = new V3(0, 1, 0), fwd = new V3(), surfPt = new V3();
    let exact = false;
    if (g.surf === 'floor') {
      let tx = cl(tgt.x, W0 + R, W1 - R);
      if (byTable(g.pos.z, 1.2) || byTable(tz, 0.3)) tx = Math.max(tx, CT.x1 + 0.35);
      if (g.want === 'west') tx = W0; else if (g.want === 'east') tx = W1;
      const dx = tx - g.pos.x, dzz = tz - g.pos.z, L = Math.hypot(dx, dzz) || 1;
      fwd.set(dx / L, 0, dzz / L);
      if (g.want !== 'floor') { fwd.x += Math.sign(dx) * 0.8; fwd.normalize(); }
      g.yaw = Math.atan2(fwd.x, fwd.z) + Math.sin(g.t * 9 + g.seed) * 0.25;
      fwd.set(Math.sin(g.yaw), 0, Math.cos(g.yaw));
      g.pos.addScaledVector(fwd, speed * dt);
      g.pos.x = cl(g.pos.x, W0 + R, W1 - R); g.pos.z = cl(g.pos.z, CORR.z0, CORR.z1);
      if (byTable(g.pos.z, 0.35)) g.pos.x = Math.max(g.pos.x, CT.x1 + 0.35);
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
      // low on the west wall it keeps off the table
      if (side === 'west' && g.h < 1.35 && byTable(g.pos.z, 0.45)) g.pos.z = g.pos.z < (CT.z0 + CT.z1) / 2 ? CT.z0 - 0.45 : CT.z1 + 0.45;
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
    if (!g.giveup && !srch && g.cowerT <= 0 && dCam < 1.3 && ctx.alive && !ctx.god && !ctx.safe) { s.caught = true; sp.grabbed = true; sp.grabK = 0; ctx.onCatch && ctx.onCatch(sp); }
  }

  // ---------------------------------------------------------------- the wolf spider on the walls
  wallPoint(w, u, h) { return w.O.clone().addScaledVector(w.T, u).addScaledVector(new V3(0, 1, 0), h); }
  // nearest usable spot on a hall wall to (x, z): { wi, u, d }
  nearestWall(x, z) {
    let best = null;
    HALL_WALLS.forEach((w, wi) => {
      const rx = x - w.O.x, rz = z - w.O.z;
      let u = THREE.MathUtils.clamp(rx * w.T.x + rz * w.T.z, 0.8, w.len - 0.8);
      for (const [a, b] of w.gaps) if (u > a && u < b) u = u - a < b - u ? a : b;
      const p = this.wallPoint(w, u, 0), d = Math.hypot(p.x - x, p.z - z);
      if (!best || d < best.d) best = { wi, u, d };
    });
    return best;
  }
  perchWolf(sp, [wi, u, h]) {
    const w = HALL_WALLS[wi], s = sp.s;
    sp.grabbed = false; s.caught = false; s.state = 'chase'; s.speed = 0;
    sp.g = { phase: 'perch', surf: wi, u, h, hT: h, t: 0, pos: new V3(), yaw: 0, q: null, holdT: 0, graceT: 0, chaseT: 0, outT: 0, burst: 0, go: true, wallRun: 0, cn: null, seed: Math.random() * 10, perch: [wi, u, h] };
    this.poseWolf(sp, 0);
  }
  // put the body where the state says, facing fwd (world), then run the leg rig
  poseWolf(sp, dt, ctx) {
    const s = sp.s, g = sp.g;
    let P, n, fwd;
    if (g.surf === 'floor') {
      P = new V3(g.pos.x, 0, g.pos.z); n = new V3(0, 1, 0); fwd = new V3(Math.sin(g.yaw), 0, Math.cos(g.yaw));
    } else if (g.surf === 'corner') {
      const c = g.cn, w = HALL_WALLS[c.wi], Y = new V3(0, 1, 0);
      const C = this.wallPoint(w, c.u, WR).addScaledVector(w.N, WR);
      const cs = Math.cos(c.th), sn = Math.sin(c.th);
      P = C.clone().addScaledVector(Y, -WR * cs).addScaledVector(w.N, -WR * sn);
      n = Y.clone().multiplyScalar(cs).addScaledVector(w.N, sn);
      fwd = Y.clone().multiplyScalar(sn * c.dir).addScaledVector(w.N, -cs * c.dir).normalize();
    } else {
      const w = HALL_WALLS[g.surf];
      P = this.wallPoint(w, g.u, g.h); n = w.N.clone();
      fwd = w.T.clone().multiplyScalar(Math.sin(g.yaw)).addScaledVector(new V3(0, 1, 0), Math.cos(g.yaw));
    }
    const q = this.surfQuat(n, fwd);
    g.q = !g.q || g.surf === 'corner' ? q : g.q.clone().slerp(q, 1 - Math.exp(-dt * 10));
    s.root.position.copy(P);
    s.root.quaternion.copy(g.q);
    s.state = 'chase';
    s.update(dt, { light: ctx ? ctx.light : { on: false }, cam: ctx ? ctx.cam : new V3(), bounds: sp.bounds });
    sp.th.set(s.root.position, s.root.position, false);
  }
  wakeWolf(sp) {
    const g = sp.g;
    if (!g || (g.phase !== 'perch' && g.phase !== 'home')) return false;
    g.phase = 'chase'; g.graceT = 2.2; g.chaseT = 0; g.hT = WR; g.want = 'floor';
    this.onWolfWake && this.onWolfWake(sp);
    return true;
  }
  lazyWolfFields(nav) {
    if (this._wolfNav === nav) return;
    this._wolfNav = nav;
    // a field that runs to the nearest stretch of wall (for bolting out of the light)
    const goals = [];
    HALL_WALLS.forEach((w) => {
      for (let u = 0.8; u < w.len - 0.8; u += 0.5) {
        if (w.gaps.some(([a, b]) => u > a && u < b)) continue;
        const p = this.wallPoint(w, u, 0).addScaledVector(w.N, WR + 0.15);
        if (nav.free(p.x, p.z)) goals.push([p.x, p.z]);
      }
    });
    this.fWall = nav.field(goals, {});
    this.fPerch = WOLF_PERCH.map(([wi, u]) => {
      const p = this.wallPoint(HALL_WALLS[wi], u, 0).addScaledVector(HALL_WALLS[wi].N, WR + 0.15);
      return nav.field([[p.x, p.z]], {});
    });
  }
  // step across the floor down a distance field (or straight at a point)
  wolfFloorStep(g, nav, field, target, speed, dt) {
    const D = { x: 0, z: 0 };
    if (!nav.free(g.pos.x, g.pos.z)) {
      // landed in the strip along a wall the nav grid keeps clear: step out to open floor first
      const k = nav.nearestFree(g.pos.x, g.pos.z, 24);
      if (k >= 0) {
        const tx = nav.cx(k), tz = nav.cz(k), dx = tx - g.pos.x, dz = tz - g.pos.z, L = Math.hypot(dx, dz) || 1;
        const st = Math.min(L, Math.max(1.5, speed) * dt);
        g.pos.x += dx / L * st; g.pos.z += dz / L * st;
        let dy = Math.atan2(dx, dz) - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
        g.yaw += THREE.MathUtils.clamp(dy, -9 * dt, 9 * dt);
        return;
      }
    }
    let ok = field ? nav.descend(field, g.pos.x, g.pos.z, D, 1) : false;
    if (!ok && target) { const dx = target.x - g.pos.x, dz = target.z - g.pos.z, L = Math.hypot(dx, dz) || 1; D.x = dx / L; D.z = dz / L; ok = true; }
    if (!ok) return;
    let want = Math.atan2(D.x, D.z) + Math.sin(g.t * 7 + g.seed) * 0.12;
    let dy = want - g.yaw; dy = Math.atan2(Math.sin(dy), Math.cos(dy));
    g.yaw += THREE.MathUtils.clamp(dy, -9 * dt, 9 * dt);
    const nx = g.pos.x + Math.sin(g.yaw) * speed * dt, nz = g.pos.z + Math.cos(g.yaw) * speed * dt;
    if (nav.free(nx, nz)) { g.pos.x = nx; g.pos.z = nz; }
    else if (nav.free(nx, g.pos.z)) g.pos.x = nx;
    else if (nav.free(g.pos.x, nz)) g.pos.z = nz;
    g.pos.x = THREE.MathUtils.clamp(g.pos.x, HALL.x0 + WR, HALL.x1 - WR); g.pos.z = THREE.MathUtils.clamp(g.pos.z, HALL.z0 + WR, HALL.z1 - WR);
  }
  // start climbing onto wall wi at u
  // keep a spot on the wall off the doorways
  wallU(w, u) {
    u = THREE.MathUtils.clamp(u, 0.6, w.len - 0.6);
    for (const [a, b] of w.gaps) if (u > a && u < b) u = u - a < b - u ? a : b;
    return u;
  }
  // the floor at the foot of the wall at u is open (not behind barrels or machines)
  footFree(nav, w, u) { const p = this.wallPoint(w, u, 0).addScaledVector(w.N, 0.8); return nav.free(p.x, p.z); }
  freeFootU(nav, w, u) {
    if (this.footFree(nav, w, u)) return u;
    for (let d = 0.5; d < 8; d += 0.5) for (const sg of [1, -1]) { const v = this.wallU(w, u + sg * d); if (this.footFree(nav, w, v)) return v; }
    return u;
  }
  wolfToWall(g, wi, hT) {
    const w = HALL_WALLS[wi];
    const rx = g.pos.x - w.O.x, rz = g.pos.z - w.O.z;
    const u = THREE.MathUtils.clamp(rx * w.T.x + rz * w.T.z, 0.6, w.len - 0.6), uT = this.wallU(w, u);
    if (Math.abs(uT - u) > 1.2) return false;     // that's a doorway
    g.cn = { wi, u, uT, th: 0, dir: 1 };          // (at the edge of one: it sidles off it as it goes up)
    g.surf = 'corner'; g.hT = hT;
    return true;
  }
  updateWolf(sp, ctx) {
    const s = sp.s, g = sp.g, dt = ctx.dt, P = ctx.player, nav = ctx.nav;
    if (!nav) { this.poseWolf(sp, dt, ctx); return; }
    this.lazyWolfFields(nav);
    g.t += dt; g.graceT -= dt; g.holdT -= dt;
    const body = s.bodyWorld, dCam = body.distanceTo(ctx.cam), dP = Math.hypot(P.x - body.x, P.z - body.z);
    const playerIn = inHall(P, 0.2);
    let lit = false;
    if (ctx.light.on) { const v = body.clone().sub(ctx.light.pos), d = v.length(); lit = d < 14 && v.dot(ctx.light.dir) / d > Math.cos(0.36); }
    // what it wants to do
    if (g.phase === 'perch') {
      g.yaw = Math.sin(g.t * 0.4 + g.seed) * 0.25;            // head down, swaying a little
      if (ctx.alive && playerIn && !ctx.safe && !ctx.hidden && g.wakeCd <= 0 && (lit || dP < 6)) this.wakeWolf(sp);
    }
    if (g.phase === 'chase') {
      g.chaseT += dt;
      g.outT = playerIn ? 0 : g.outT + dt;
      if (!ctx.alive || g.outT > 3 || dP > 18 || ctx.safe) g.phase = 'home';
      else if (lit && g.graceT <= 0) {
        // the beam: bolt for the nearest wall and get up out of reach
        g.phase = 'bolt'; g.holdT = 2.5 + Math.random() * 1.5;
        this.onWolfLit && this.onWolfLit(sp);
      }
    }
    // you hid: it lost you, and searches round the spot where you went
    if (g.phase === 'chase' && ctx.hidden) this.wolfSearch(g, nav, P);
    // after a grab it gives up for a while and goes back to its wall; otherwise it comes back for you
    if (g.phase === 'hold' && g.holdT <= 0) {
      if (g.afterGrab) { g.phase = 'home'; g.afterGrab = false; g.wakeCd = 6; }
      else if (ctx.hidden) this.wolfSearch(g, nav, P);
      else { g.phase = 'chase'; g.graceT = 1.6; g.want = 'floor'; g.hT = WR; }
    }
    if (g.phase === 'search') {
      g.searchT -= dt;
      g.outT = playerIn ? 0 : (g.outT || 0) + dt;
      if (!ctx.hidden && ctx.alive && playerIn && !ctx.safe && (dP < 6 || lit)) { g.phase = 'chase'; g.graceT = Math.min(g.graceT, 0.8); g.chaseT = 0; this.onWolfWake && this.onWolfWake(sp); }   // there you are
      else if (g.searchT <= 0 || !ctx.alive || g.outT > 3) { g.phase = 'home'; g.wakeCd = 4; }
    }
    g.wakeCd = (g.wakeCd || 0) - dt;
    // jerky rhythm
    g.burst -= dt;
    if (g.burst <= 0) { const srch = g.phase === 'search'; g.go = Math.random() < (srch ? 0.55 : 0.82); g.burst = g.go ? 0.5 + Math.random() * 0.9 : srch ? 0.5 + Math.random() * 1.2 : 0.12 + Math.random() * 0.3; }
    let speed = g.phase === 'perch' || g.phase === 'hold' ? 0 : g.phase === 'bolt' ? 5.2 : g.phase === 'home' ? 2.6 : g.phase === 'search' ? (g.go ? 1.9 : 0) : g.go ? 4.6 * catchUp(dP) : 0.4;

    if (g.surf === 'floor') {
      if (g.phase === 'chase') {
        // sometimes run along a wall beside you
        const nw = this.nearestWall(g.pos.x, g.pos.z), pw = this.nearestWall(P.x, P.z);
        if (g.wallRun <= 0 && nw.d < 1.2 && pw.wi === nw.wi && pw.d < 3 && dP > 3.5 && Math.random() < dt * 0.8 && this.wolfToWall(g, nw.wi, 1.1 + Math.random() * 0.8)) g.wallRun = 1;
        else this.wolfFloorStep(g, nav, ctx.field, P, speed, dt);
      } else if (g.phase === 'bolt' || g.phase === 'home') {
        const nw = g.phase === 'bolt' ? this.nearestWall(g.pos.x, g.pos.z) : null;
        const pi = g.perch ? WOLF_PERCH.indexOf(g.perch) : -1;
        const home = g.phase === 'home' ? WOLF_PERCH.reduce((b, pr, i) => { const p = this.wallPoint(HALL_WALLS[pr[0]], pr[1], 0); const d = Math.hypot(p.x - g.pos.x, p.z - g.pos.z); return !b || d < b.d ? { i, d, pr } : b; }, null) : null;
        const F = g.phase === 'bolt' ? this.fWall : this.fPerch[home.i];
        const left = nav.at(F, g.pos.x, g.pos.z);       // metres of floor still to cover (0 at the wall's foot)
        let up = false;
        if (g.phase === 'bolt' && (nw.d < 1.0 || (left < 0.6 && nw.d < 1.8))) up = this.wolfToWall(g, nw.wi, 2.4 + Math.random() * 0.6);
        else if (g.phase === 'home' && (home.d < 1.0 || (left < 0.6 && home.d < 1.8))) { up = this.wolfToWall(g, home.pr[0], home.pr[2]); if (up) g.perch = home.pr; }
        if (!up) {
          const x0 = g.pos.x, z0 = g.pos.z;
          this.wolfFloorStep(g, nav, F, null, speed, dt);
          // nothing to follow (in a doorway, or at the bottom of the field off to one side of the wall): head straight for the wall's foot
          if (g.pos.x === x0 && g.pos.z === z0 && speed > 0) {
            const [wi, u] = g.phase === 'bolt' ? [nw.wi, nw.u] : home.pr, w = HALL_WALLS[wi];
            this.wolfFloorStep(g, nav, null, this.wallPoint(w, u, 0).addScaledVector(w.N, WR + 0.15), speed, dt);
          }
        }
      } else if (g.phase === 'search') {
        // feeling about: short runs between spots near where you went
        g.seekT -= dt;
        if (!g.seek || g.seekT <= 0 || Math.hypot(g.seek.x - g.pos.x, g.seek.z - g.pos.z) < 0.4) {
          g.seekT = 1.2 + Math.random() * 1.6;
          for (let k = 0; k < 8; k++) { const a = Math.random() * 6.28, d = 0.7 + Math.random() * 2.6, x = g.spt.x + Math.sin(a) * d, z = g.spt.z + Math.cos(a) * d; if (nav.free(x, z)) { g.seek = new V3(x, 0, z); break; } }
        }
        const far = Math.hypot(g.spt.x - g.pos.x, g.spt.z - g.pos.z) > 3.5;
        this.wolfFloorStep(g, nav, far ? ctx.field : null, far ? g.spt : (g.seek || g.spt), far ? 3.2 : speed, dt);
      }
      if (g.phase === 'chase' && g.surf === 'floor' && g.graceT < 1.5 && dCam < 1.35 && ctx.alive && !ctx.god) {
        s.caught = true; sp.grabbed = true; sp.grabK = 0; ctx.onCatch && ctx.onCatch(sp); return;
      }
    } else if (g.surf === 'corner') {
      const c = g.cn;
      c.th = THREE.MathUtils.clamp(c.th + c.dir * Math.max(2.2, speed) * 0.8 * dt / WR, 0, Math.PI / 2);
      if (c.uT != null) c.u += (c.uT - c.u) * Math.min(1, dt * 8);
      if (c.dir > 0 && c.th >= Math.PI / 2) { g.surf = c.wi; g.u = c.uT ?? c.u; g.h = WR; g.yaw = 0; }
      else if (c.dir < 0 && c.th <= 0) {
        const w = HALL_WALLS[c.wi], p = this.wallPoint(w, c.u, 0).addScaledVector(w.N, WR);
        g.surf = 'floor'; g.pos.set(p.x, 0, p.z); g.yaw = Math.atan2(w.N.x, w.N.z);
      }
    } else {
      // on a wall: (u, h) with yaw 0 = straight up
      const w = HALL_WALLS[g.surf];
      let uT = g.u, hT = g.hT;
      if (g.phase === 'chase') {
        const rx = P.x - w.O.x, rz = P.z - w.O.z;
        uT = this.wallU(w, rx * w.T.x + rz * w.T.z);
        g.wallRun -= dt * 0.35;
        // come down for the last few metres, or when the run is over, somewhere the floor is open
        if (Math.abs(uT - g.u) < 2.5 || g.wallRun <= 0) {
          uT = this.freeFootU(nav, w, Math.abs(uT - g.u) < 2.5 ? uT : g.u);
          hT = Math.abs(uT - g.u) < 0.3 ? WR : Math.max(g.h, 1.2);
        }
      } else if (g.phase === 'search') {
        const rx = g.spt.x - w.O.x, rz = g.spt.z - w.O.z;
        uT = this.freeFootU(nav, w, this.wallU(w, rx * w.T.x + rz * w.T.z));
        hT = Math.abs(uT - g.u) < 0.3 ? WR : Math.max(g.h, 1.2);
        speed = 2.6;
      } else if (g.phase === 'down') hT = WR;
      else if (g.phase === 'perch' || g.phase === 'hold') hT = g.h;
      const du = uT - g.u, dh = hT - g.h, L = Math.hypot(du, dh);
      if (L > 0.02 && speed > 0) {
        const st = Math.min(L, speed * 0.85 * dt);
        g.u += du / L * st; g.h += dh / L * st;
        g.yaw = Math.atan2(du, dh);
      } else if (g.phase !== 'perch') g.yaw *= 1 - Math.min(1, dt * 4);
      if (g.phase === 'perch') g.yaw = Math.PI + Math.sin(g.t * 0.4 + g.seed) * 0.3;          // head down
      if (g.phase === 'bolt' && L <= 0.05) { g.phase = 'hold'; g.yaw = Math.PI; }
      if (g.phase === 'home' && L <= 0.05) { g.phase = 'perch'; }
      if (g.phase === 'hold') g.yaw = Math.PI + Math.sin(g.t * 3) * 0.15;
      // back down to the floor
      if ((g.phase === 'chase' || g.phase === 'down' || g.phase === 'search') && hT <= WR && g.h <= WR + 0.02) { g.cn = { wi: g.surf, u: g.u, th: Math.PI / 2, dir: -1 }; g.surf = 'corner'; }
      if (g.phase === 'chase' && dCam < 1.35 && g.graceT < 1.5 && ctx.alive && !ctx.god) { s.caught = true; sp.grabbed = true; sp.grabK = 0; ctx.onCatch && ctx.onCatch(sp); return; }
    }
    if (g.phase === 'chase' && g.surf !== 'floor' && g.surf !== 'corner' && g.h > WR + 0.05 && g.wallRun <= 0 && g.hT > WR) g.hT = WR;
    s.speed = speed;
    this.poseWolf(sp, dt, ctx);
  }
  wolfSearch(g, nav, P) {
    const k = nav.nearestFree(P.x, P.z, 16);
    g.phase = 'search'; g.searchT = 7 + Math.random() * 3; g.seek = null; g.seekT = 0; g.outT = 0;
    g.spt = new V3(k >= 0 ? nav.cx(k) : P.x, 0, k >= 0 ? nav.cz(k) : P.z);
    g.want = 'floor'; g.hT = WR; g.wallRun = 0;
  }
  // a noise in the hall (a thrown can): the wolf comes down off its wall, or leaves off a chase it's losing, to look
  lureWolf(x, z, P) {
    const sp = this.wolf, nav = this._wolfNav;
    if (!sp || !sp.g || !nav || !inHall({ x, z }, -0.3)) return false;
    const g = sp.g;
    if (g.phase === 'perch' || g.phase === 'home') { if (!this.wakeWolf(sp)) return false; }
    else if (g.phase === 'chase') { if (Math.hypot(g.pos.x - P.x, g.pos.z - P.z) < 5) return false; }
    else if (g.phase !== 'search') return false;
    this.wolfSearch(g, nav, new V3(x, 0, z));
    return true;
  }
  // after a grab or a spray it puts its body on the floor and bolts for a wall
  wolfRetreat(sp) {
    const s = sp.s, b = s.bodyWorld, g = sp.g;
    sp.grabbed = false; s.caught = false;
    g.surf = 'floor'; g.pos.set(THREE.MathUtils.clamp(b.x, HALL.x0 + WR, HALL.x1 - WR), 0, THREE.MathUtils.clamp(b.z, HALL.z0 + WR, HALL.z1 - WR));
    g.phase = 'bolt'; g.holdT = 3; g.afterGrab = true; g.q = null; g.yaw = Math.random() * 6.28;
    if (this._wolfNav && !this._wolfNav.free(g.pos.x, g.pos.z)) { const k = this._wolfNav.nearestFree(g.pos.x, g.pos.z); if (k >= 0) g.pos.set(this._wolfNav.cx(k), 0, this._wolfNav.cz(k)); }
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
    this.onWake = ctx.onWake; this.onCower = ctx.onCower; this.onSacBurst = ctx.onSacBurst; this.onWolfWake = ctx.onWolfWake; this.onWolfLit = ctx.onWolfLit;
    if (!ctx.frozen) this.updateSac(ctx.dt);
    for (const sp of this.spiders) {
      const s = sp.s;
      if (sp.mode === 'trip' && sp.g && !sp.grabbed && s.state !== 'fallen') {
        if (!ctx.frozen) this.updateGhost(sp, { ...ctx, player: ctx.playerPos });
        continue;
      }
      if (sp.mode === 'wall' && sp.g && !sp.grabbed && s.state !== 'fallen') {
        if (!ctx.frozen) this.updateWolf(sp, { ...ctx, player: ctx.playerPos });
        else this.poseWolf(sp, 0, ctx);
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
          if (sp.mode === 'wall') { this.wolfRetreat(sp); continue; }
          s.state = 'retract'; s.st = 0; s.retractFrom = s.bodyWorld; s.retractQ = s.root.quaternion.clone(); s.caught = false;
        }
        sp.th.set(s.anchor, s.spinneretWorld(), !sp.mode);
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
      // (a wider cone than the beam's: the edge of the light finds them too)
      for (const k of ['uSpotPos', 'uSpotDir', 'uKey', 'uKeyOn']) t.mat.uniforms[k].value = this.silk.uniforms[k].value;
      t.mat.uniforms.uCosO.value = Math.cos(0.6); t.mat.uniforms.uCosI.value = Math.cos(0.28);
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
    if (sp && sp.mode === 'wall') this.wakeWolf(sp);
    else if (sp) sp.s.callTo(playerPos.x, playerPos.z, sp.bounds);
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

  // a camera flash: the ghost cowers for a good while, the wolf bolts for a wall. Returns who it caught.
  flash(origin, dir, range = 9, cosHalf = Math.cos(0.62)) {
    const out = [];
    for (const sp of this.spiders) {
      const s = sp.s, b = s.bodyWorld, v = b.clone().sub(origin), d = v.length();
      if (!sp.grabbed && (d > range || v.dot(dir) / (d || 1) < cosHalf)) continue;
      const g = sp.g;
      if (sp.mode === 'trip' && g && !g.giveup) { g.cowerT = Math.max(g.cowerT || 0, 2.6); g.cowerCd = g.cowerT + 0.9; s.whirl = 0.5; out.push(sp); }
      else if (sp.mode === 'wall' && g && (g.phase === 'chase' || g.phase === 'search' || sp.grabbed)) { this.wolfRetreat(sp); out.push(sp); }
    }
    return out;
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
    if (sp.mode === 'wall') { this.wolfRetreat(sp); return; }
    sp.grabbed = false; sp.s.caught = false;
    sp.s.startRetract();
    sp.s.cooldown = 5;
  }

  // force a drop on whoever is closest (dev)
  dropNow(cam) {
    const sp = this.nearestSpider(cam.x, cam.z);
    if (!sp) return;
    if (sp.mode === 'trip') { this.wakeGhost(sp); return; }
    if (sp.mode === 'wall') { this.wakeWolf(sp); return; }
    const s = sp.s;
    if (s.state !== 'ceiling') s.placeOnCeiling(s.root.position.x, s.root.position.z, s.yaw, sp.ceil);
    s.root.position.x = cam.x + 0.6; s.root.position.z = cam.z + 0.6;
    s.startDrop(cam);
  }

  states() { return this.spiders.map((sp) => (sp.grabbed ? 'grab' : sp.s.state === 'fallen' ? 'fallen' : sp.g ? sp.g.phase : sp.s.state)); }
  // spiders crawling across the ceiling (for their footsteps)
  emitters(P) {
    const out = [];
    this.spiders.forEach((sp, i) => {
      const s = sp.s;
      if (!(s.state === 'crawl' || (sp.mode === 'wall' && s.state === 'chase')) || !(s.speed > 0.05)) return;
      const p = s.root.position, d = Math.hypot(p.x - P.x, p.z - P.z);
      if (d < 16) out.push({ key: 's' + i, kind: 'big', x: p.x, y: p.y, z: p.z, d, sp: Math.min(1, 0.4 + s.speed) });
    });
    return out;
  }
  // spiders after you right now: running at you or dropping on you (for the chase music)
  chasers() {
    const out = [];
    for (const sp of this.spiders) {
      if (sp.grabbed) continue;
      const ph = sp.g ? sp.g.phase : sp.s.state;
      if (ph === 'chase' || ph === 'drop' || ph === 'hang' || ph === 'swing') { const p = sp.s.bodyWorld; out.push({ x: p.x, z: p.z }); }
    }
    return out;
  }
  // spiders searching for you where you hid
  searchers() {
    const out = [];
    for (const sp of this.spiders) if (sp.g && sp.g.phase === 'search' && !sp.grabbed) { const p = sp.s.bodyWorld; out.push({ x: p.x, z: p.z }); }
    return out;
  }
  // where the chasing ghost is (for its footsteps)
  ghostInfo() { const g = this.ghost && this.ghost.g; return g && g.phase !== 'descend' ? { x: g.pos.x, y: g.surf === 'floor' ? 0.1 : g.h, z: g.pos.z, speed: this.ghost.s.speed || 0 } : null; }
}
