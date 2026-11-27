// The centipede in the map. Sleeps in the wall until generator 2 starts, then bursts out of
// the hall vent. Patrols, and once it sees or hears you it chases (4.5 m/s) round walls.
// Light on the head: curls up 2 s (1 s from the third time in one chase). Spray: 4 s, then it
// backs off. If you stand in a lit safe zone it circles the edge. A touch is death.
// Hide under a table (light off, still) and it loses you: it noses round where you went for a
// while, then wanders off on its patrol.
import * as THREE from 'three';
import { Centipede } from '../centipede.js';

const V3 = THREE.Vector3;
// chasing: slower up close (you can still outrun it), faster when far behind (it catches up)
// difficulty scales how fast the hunters run (set from the game's settings)
export const HUNT = { speed: 1 };
export const catchUp = (d) => { const t = Math.min(1, Math.max(0, (d - 3) / 13)); return HUNT.speed * (0.75 + 0.7 * t * t * (3 - 2 * t)); };

const VENT = { x: 15, z: 69.7, y: 0.55, dx: 0, dz: -1 };   // (dx, dz): the way out of the wall
const PATROL = [[20.5, 52], [12.5, 61], [7.2, 50], [18.5, 44], [18.5, 30], [17.5, 15], [18.5, 24], [18.5, 46.5], [14, 66]];

export class MapCentipede {
  constructor(scene, T, metalMat) {
    this.c = new Centipede(T, { lite: true });
    this.c.addTo(scene);
    this.c.obstacles = [];

    // the vent cover it bursts through
    this.cover = new THREE.Group();
    const add = (w, h, d, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalMat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; this.cover.add(m); };
    add(1.4, 0.05, 0.05, 0, 0.4, 0); add(1.4, 0.05, 0.05, 0, -0.4, 0); add(0.05, 0.8, 0.05, -0.7, 0, 0); add(0.05, 0.8, 0.05, 0.7, 0, 0);
    for (let k = 0; k < 7; k++) add(1.34, 0.012, 0.05, 0, -0.4 + (k + 0.5) * 0.8 / 7, 0, 0.7);
    scene.add(this.cover);
    this.reset();
  }

  reset() {
    this.state = 'dormant';
    this.c.group.visible = false;
    this.c.reset(VENT.x, VENT.z + 3, Math.PI);
    this.c.mode = 'idle';
    this.cover.position.set(VENT.x, VENT.y, VENT.z - 0.04); this.cover.rotation.set(0, 0, 0); this.cover.visible = true;
    this.coverV = null;
    this.wp = 0; this.wpField = null; this.lostT = 0; this.retreatT = 0; this.orbitA = 0; this.sprayStun = false;
    this.seenLit = false; this.shortTip = false; this.chases = 0;
    this.vent = VENT; this.burstDone = false; this.ram = null; this.poke = null;
  }

  get active() { return this.state !== 'dormant' && this.state !== 'gone'; }
  get head() { return this.c.headPos; }
  get speed() { return this.c.speed; }

  // you came back at a lamp: if it is out, it goes back to patrolling, starting far from you
  regroup(from) {
    if (this.state === 'dormant') return;
    if (!this.coverV) { this.coverV = { x: 0, vy: 0, z: 0, spin: 0 }; this.cover.position.set(VENT.x, 0.05, VENT.z - 1.6); this.cover.rotation.set(Math.PI / 2, 0, 0); }
    let best = 0, bd = -1;
    PATROL.forEach(([x, z], i) => { const d = Math.hypot(x - from.x, z - from.z); if (d > bd) { bd = d; best = i; } });
    const [x, z] = PATROL[best];
    this.c.group.visible = true; this.ram = null; this.poke = null;
    this.c.reset(x, z, Math.random() * Math.PI * 2);
    this.c.mode = 'drive'; this.c.driveSpeed = 0;
    this.state = 'patrol'; this.wp = best + 1; this.wpField = null; this.lostT = 0; this.retreatT = 0; this.sprayStun = false;
  }

  // generator 2: out of the wall
  wake() {
    if (this.state !== 'dormant') return false;
    this.state = 'emerge';
    this.c.group.visible = true;
    // the body starts inside the wall behind the vent and slides out along its trail
    this.c.reset(VENT.x, VENT.z + 1.2, Math.PI);
    this.c.mode = 'drive'; this.c.driveSpeed = 5.0;
    this.emergeT = 0; this.vent = VENT; this.burstDone = false;
    return true;
  }

  // ---- the air duct (see duct.js): too narrow for it, so the game takes it out of play while you crawl
  park() { this.state = 'gone'; this.c.group.visible = false; this.c.mode = 'idle'; this.c.driveSpeed = 0; this.ram = null; this.poke = null; }
  // you got into the duct ahead of it: if it was close it rams its head into the mouth, holds there
  // snapping, then backs out the way it came and is gone. mouth: { x, z, dx, dz } (dx, dz out into the room)
  blocked(mouth, nav) {
    if (this.state === 'gone' || this.state === 'ram' || this.state === 'poke') return false;
    const H = this.c.headXZ;
    if (this.state === 'dormant' || this.state === 'emerge' || this.c.mode === 'kill' || Math.hypot(H.x - mouth.x, H.y - mouth.z) > 11) { if (this.state !== 'dormant') this.park(); return false; }
    const k = nav.nearestFree(mouth.x + mouth.dx * 0.9, mouth.z + mouth.dz * 0.9, 6);
    this.state = 'ram'; this.c.b.lunge = 0; this.c.b.stun = false; this.c.b.curl = 0; this.c.mode = 'drive';
    this.ram = { t: 0, x: mouth.x - mouth.dx * 0.25, z: mouth.z - mouth.dz * 0.25, mx: mouth.x, mz: mouth.z, dx: mouth.dx, dz: mouth.dz, ax: k >= 0 ? nav.cx(k) : mouth.x, az: k >= 0 ? nav.cz(k) : mouth.z + 1, hit: false, ht: 0, go: false, gt: 0, f: null };
    return true;
  }
  // its head through a side grille of the duct at (x, z), coming in along (dx, dz)
  // (sx, sz: where its head starts, out of sight behind the metal)
  pokeAt(x, z, dx, dz, sx = x - dx * 2.4, sz = z - dz * 2.4) {
    this.state = 'poke'; this.c.group.visible = true;
    const tx = x + dx * 0.55, tz = z + dz * 0.55;
    this.c.reset(sx, sz, Math.atan2(tx - sx, tz - sz));
    this.c.mode = 'drive'; this.c.driveSpeed = 0; this.c.b.target.set(tx, tz);
    this.poke = { x, z, dx, dz, t: 0, back: false, litT: 0, out: false };
  }
  retract() { if (this.poke) this.poke.back = true; }
  // back the way it came along its own trail (a centipede can reverse)
  pullBack(d) {
    const P = this.c.path;
    let left = d;
    while (left > 0 && P.length > 3) {
      const a = P[0], b = P[1], l = Math.hypot(b.x - a.x, b.z - a.z);
      if (l <= left) { P.shift(); left -= l; } else { const f = left / l; a.x += (b.x - a.x) * f; a.z += (b.z - a.z) * f; left = 0; }
    }
    this.c.headXZ.set(P[0].x, P[0].z);
    return P.length > 3;
  }
  updatePoke(ctx) {
    const p = this.poke, c = this.c, H = c.headXZ, dt = ctx.dt;
    p.t += dt;
    c.b.immune = 9; c.b.stun = false;                 // (the beam is handled here: it backs off instead of curling)
    const along = (H.x - p.x) * p.dx + (H.y - p.z) * p.dz;
    p.out = along > 0.15;
    if (!p.back) {
      const L = ctx.light, h0 = c.rPos[0];
      const lv = L && L.on ? new V3(h0.x - L.pos.x, h0.y - L.pos.y, h0.z - L.pos.z) : null, ld = lv ? lv.length() : 99;
      if (lv && p.out && ld < 6 && lv.dot(L.dir) / ld > Math.cos(0.32)) p.litT += dt; else p.litT = Math.max(0, p.litT - dt * 0.5);
      if (p.litT > 0.9) { p.back = true; ctx.onPokeLit && ctx.onPokeLit(); }
      c.mode = 'drive'; c.driveSpeed = along < 0.5 ? 2.6 : 0;
      c.b.target.set(p.x + p.dx * 0.55, p.z + p.dz * 0.55);
      c.update(dt, null, null);
    } else {
      c.mode = 'idle'; c.driveSpeed = 0; c.speed = 0;
      const more = this.pullBack(dt * 3.2);
      c.update(dt, null, null);
      if (along < -1.8 || !more) this.park();
    }
  }
  // out of a wall vent somewhere else, and after you: v { x, z, dx, dz } (dx, dz: out into the room)
  ambush(v) {
    this.vent = v; this.burstDone = false; this.ram = null; this.poke = null;
    this.state = 'emerge'; this.c.group.visible = true;
    this.c.reset(v.x - v.dx * 1.2, v.z - v.dz * 1.2, Math.atan2(v.dx, v.dz));
    this.c.mode = 'drive'; this.c.driveSpeed = 5.0; this.emergeT = 0;
    this.lostT = 0; this.retreatT = 0; this.sprayStun = false;
  }

  // the final chase: wherever it is, it now knows where you are
  enrage(P) {
    if (this.state === 'dormant') { this.wake(); return; }
    if (this.state === 'emerge' || this.state === 'gone' || this.state === 'ram' || this.state === 'poke') return;          // it is coming out anyway, then it chases
    this.state = 'chase'; this.lostT = 0;
  }

  // the last generator: wherever it was, it's at the lab door when the power comes back (moved while it's
  // dark; not if it's already near it, or in the lab, or somewhere it can't be taken from)
  toDoor(x, z) {
    if (!this.active || this.state === 'emerge' || this.state === 'gone' || this.state === 'ram' || this.state === 'poke') return;
    const H = this.c.headXZ;
    if (H.x < x) return;
    this.pushT = 5.5;                                       // (and its head in at the doorway, wanting in)
    if (Math.hypot(H.x - x, H.y - z) < 8) return;
    this.c.reset(x + 1.0, z, -Math.PI / 2);
    this.c.mode = 'drive'; this.c.driveSpeed = 0;
    this.state = 'chase'; this.lostT = 0; this.pField = null; this.prowlP = null;
  }

  // it has you: the kill (see Centipede applyPose); cam is where your head is
  kill(cam) { this.c.mode = 'kill'; this.c.kill = { t: 0, cam: cam.clone() }; }

  // fought off (easy and normal): it lets go, recoils and backs off for a while
  release() {
    const c = this.c, b = c.b;
    c.mode = 'drive'; c.kill = null;
    b.lunge = 0; b.caught = false;
    b.stun = true; b.prev = 'drive'; b.hold = 3.0; b.curlSide = Math.random() < 0.5 ? -1 : 1; b.immune = 0;
    this.sprayStun = true;
    this.state = 'patrol'; this.lostT = 0; this.retreatT = 3; this.wpField = null;
  }

  spray(origin, dir, range = 3.4, cosHalf = Math.cos(Math.PI / 6)) {
    if (!this.active || this.c.mode === 'kill') return false;
    if (this.state === 'poke' || this.state === 'ram') {
      const v = this.c.rPos[0].clone().sub(origin), d = v.length();
      if (this.state === 'poke' && d < range && v.dot(dir) / (d || 1) > cosHalf) { this.retract(); return true; }
      return false;
    }
    const b = this.c.b;
    for (const p of [this.c.rPos[0], this.c.rPos[3]]) {
      const v = p.clone().sub(origin), d = v.length();
      if (d < range && v.dot(dir) / d > cosHalf) {
        if (this.c.mode === 'lunge') { this.c.mode = 'drive'; b.lunge = 0; b.caught = false; }
        b.stun = true; b.prev = 'drive'; b.hold = 4.0; b.curlSide = Math.random() < 0.5 ? -1 : 1; b.immune = 0;
        this.sprayStun = true;
        return true;
      }
    }
    return false;
  }

  // ctx: { dt, player:{pos,noise,alive}, cam, light, nav, field, lamps, events, safe:{x,z,r}|null, frozen,
  //        onCatch, onStun(hits, hold), onSee }
  update(ctx) {
    if (this.coverV) {
      // the vent cover tumbling across the floor
      this.coverV.vy -= 9.8 * ctx.dt;
      this.cover.position.addScaledVector(new V3(this.coverV.x, this.coverV.vy, this.coverV.z), ctx.dt);
      this.cover.rotation.x += this.coverV.spin * ctx.dt;
      if (this.cover.position.y < 0.05) { this.cover.position.y = 0.05; this.coverV.vy *= -0.3; this.coverV.x *= 0.6; this.coverV.z *= 0.6; this.coverV.spin *= 0.5; this.cover.rotation.x = Math.round(this.cover.rotation.x / Math.PI) * Math.PI + Math.PI / 2; }
    }
    if (this.state === 'dormant' || this.state === 'gone') return;
    if (this.state === 'poke') { this.updatePoke(ctx); return; }
    const { dt } = ctx, c = this.c, b = c.b, P = ctx.player.pos, nav = ctx.nav;
    const H = c.headXZ, dP = Math.hypot(P.x - H.x, P.z - H.y);
    const D = { x: 0, z: 0 };
    let target = null, speed = 0;

    if (ctx.frozen || c.mode === 'kill') { c.driveSpeed = 0; c.update(dt, null, null); return; }

    if (this.state === 'emerge') {
      const V = this.vent, along = (H.x - V.x) * V.dx + (H.y - V.z) * V.dz;
      this.emergeT += dt;
      b.immune = 0.6;                              // no flinching while still half inside the wall
      target = new THREE.Vector2(V.x + V.dx * 4, V.z + V.dz * 4);
      speed = 5.0;
      if (!this.burstDone && along > -0.1) {
        this.burstDone = true;
        if (V === VENT && !this.coverV) this.coverV = { x: (Math.random() - 0.5) * 1.5, vy: 2.2, z: -4.5, spin: -9 };
        ctx.onBurst && ctx.onBurst(V);
      }
      if (along > 3.2) { this.state = 'chase'; this.chases++; this.lostT = 0; }
    } else if (this.state === 'ram') {
      const R = this.ram; R.t += dt;
      b.immune = 9; b.stun = false;
      if (!R.hit) {
        // it comes up to the opening and waits there; it lunges in only once you're 3 m down the duct (or after 6 s).
        // Its head no closer than ~1.4 m to you along the duct (it aims 2.2 m short: it carries on ~0.8 m after the
        // hit), so if you're still just inside by then it snaps at the opening
        const dep = -((P.x - R.mx) * R.dx + (P.z - R.mz) * R.dz), g = Math.min(0.25, dep - 2.2);
        if (!R.go && (dep >= 3 || R.t > 6)) { R.go = true; R.gt = R.t; }
        R.x = R.mx - R.dx * g; R.z = R.mz - R.dz * g;
        const dR = Math.hypot(R.x - H.x, R.z - H.y), far = Math.hypot(R.ax - H.x, R.az - H.y) > 1.6;
        if (far) {
          if (!R.f) R.f = nav.field([[R.ax, R.az]], { wallCost: 0.9, maxDist: 40 });
          target = nav.descend(R.f, H.x, H.y, D) ? new THREE.Vector2(H.x + D.x * 1.6, H.y + D.z * 1.6) : new THREE.Vector2(R.ax, R.az);
        } else target = R.go ? new THREE.Vector2(R.x, R.z) : new THREE.Vector2(R.ax, R.az);
        speed = far || R.go ? 4.5 : 0;
        if (R.go && (dR < 0.35 || R.t - R.gt > 3.5)) { R.hit = true; R.ht = R.t; ctx.onRam && ctx.onRam(); }
      } else if (R.t - R.ht < 1.7) speed = 0;
      else {
        // backs out the way it came, and off into the walls
        c.mode = 'idle'; c.speed = 0;
        const more = this.pullBack(dt * 2.6);
        c.update(dt, null, null);
        if (R.t - R.ht > 3.6 || !more) this.park();
        return;
      }
    } else {
      // can it sense you?
      const hid = ctx.player.hidden;
      const sees = !hid && dP < 11 && nav.sees(H.x, H.y, P.x, P.z);
      const hears = !hid && ctx.player.noise > 0 && dP < ctx.player.noise * 1.2;
      // you hid: it lost you
      if (this.state === 'chase' && hid && c.mode !== 'lunge') {
        const k = nav.nearestFree(P.x, P.z, 12);
        this.state = 'search'; this.searchT = 7 + Math.random() * 3; this.lostT = 0; this.sField = null;
        this.spt = new THREE.Vector2(k >= 0 ? nav.cx(k) : P.x, k >= 0 ? nav.cz(k) : P.z);
        this.orbitA = Math.atan2(H.x - this.spt.x, H.y - this.spt.y); this.orbitDir = Math.random() < 0.5 ? -1 : 1;
      }
      if (this.state === 'search') {
        this.searchT -= dt;
        if (!hid && ctx.player.alive && (sees || dP < 5)) { this.state = 'chase'; this.lostT = 0; ctx.onSee && ctx.onSee(); }   // there you are
        else if (this.searchT <= 0 || !ctx.player.alive) {
          // give up and wander off: carry on the patrol from the point furthest from here
          let best = 0, bd = -1;
          PATROL.forEach(([x, z], i) => { const d = Math.hypot(x - P.x, z - P.z); if (d > bd) { bd = d; best = i; } });
          this.state = 'patrol'; this.wp = best; this.wpField = null;
        }
      }
      const event = ctx.events.some((e) => Math.hypot(e.x - H.x, e.z - H.y) < e.r);
      if (this.state === 'patrol' && ctx.player.alive && (sees || hears || event)) { this.state = 'chase'; this.lostT = 0; this.chases++; ctx.onSee && ctx.onSee(); }
      if (this.state === 'chase') {
        this.lostT = sees || dP < 6 ? 0 : this.lostT + dt;
        if (this.lostT > 9 || !ctx.player.alive) { this.state = 'patrol'; this.wpField = null; }
      }
      // you're behind the lab door (fence: { inside, open, x, zc }): it won't come in while the door
      // stands open - it waits outside, pacing and looking in - and it presses up to it once it's shut
      const F = ctx.fence;
      if (F && F.inside && ctx.player.alive && (this.state === 'chase' || this.state === 'search') && H.x > F.x + 0.3) { this.state = 'prowl'; this.pField = null; this.prowlP = null; }
      if (this.state === 'prowl' && !(F && F.inside)) { this.state = 'chase'; this.lostT = 0; }
      if (this.sprayStun && !b.stun) { this.sprayStun = false; this.retreatT = 2.6; }
      if (this.retreatT > 0) {
        this.retreatT -= dt;
        if (nav.descend(ctx.field, H.x, H.y, D, -1)) target = new THREE.Vector2(H.x + D.x * 2, H.y + D.z * 2);
        speed = 3.2;
      } else if (this.state === 'prowl') {
        const front = new THREE.Vector2(F.x + 2.6, F.zc), dF = Math.hypot(front.x - H.x, front.y - H.y);
        if (dF > 4.5) {
          if (!this.pField) this.pField = nav.field([[front.x, front.y]], { wallCost: 0.9, maxDist: 70 });
          target = nav.descend(this.pField, H.x, H.y, D) ? new THREE.Vector2(H.x + D.x * 1.6, H.y + D.z * 1.6) : front;
          speed = 3.4;
        } else if (F.smash) { target = new THREE.Vector2(F.x + 0.3, F.zc); speed = 3.0; }
        else if (this.pushT > 0) { this.pushT -= dt; target = new THREE.Vector2(F.x + (F.open ? -0.4 : 0.75), F.zc + 0.4 * Math.sin(c.time * 3)); speed = 2.6; }     // (its head in at the doorway, wanting in)
        else if (!F.open) { target = new THREE.Vector2(F.x + 0.9, F.zc + 1.0 * Math.sin(c.time * 0.6)); speed = 0.9; }
        else {
          // to and fro outside the doorway, stopping to look in, never over the threshold
          this.prowlT = (this.prowlT || 0) - dt;
          if (this.prowlT <= 0 || !this.prowlP) {
            this.prowlT = 1.4 + Math.random() * 2.2;
            this.prowlP = new THREE.Vector2(F.x + 1.8 + Math.random() * 2.2, F.zc - 2.5 + Math.random() * 5);
            this.pause = Math.random() < 0.45 ? 0.6 + Math.random() * 1.2 : 0;
          }
          this.pause = Math.max(0, (this.pause || 0) - dt);
          target = this.prowlP; speed = this.pause > 0 ? 0 : 1.5;
          // (but come to the doorway and it has you)
          if (dP < 1.9 && c.mode !== 'lunge' && !b.stun && ctx.player.alive && !hid) {
            c.mode = 'lunge'; b.lt = 0; b.caught = false;
            c.lungeDir = new V3(P.x - H.x, 0, P.z - H.y).normalize();
            c.onCatch = () => ctx.onCatch && ctx.onCatch();
            ctx.onLunge && ctx.onLunge();
          }
        }
        if (target && !F.smash && !(this.pushT > 0)) target.x = Math.max(target.x, F.x + 0.8);
      } else if (this.state === 'chase' && ctx.safe) {
        // you are in a lamp's light: circle its edge and wait
        this.orbitA += dt * 0.35;
        const r = ctx.safe.r + 1.8, a0 = Math.atan2(H.x - ctx.safe.x, H.y - ctx.safe.z);
        const a = a0 + 0.5;
        target = new THREE.Vector2(ctx.safe.x + Math.sin(a) * r, ctx.safe.z + Math.cos(a) * r);
        if (!nav.free(target.x, target.y)) target.set(ctx.safe.x + Math.sin(a0 + 0.2) * r, ctx.safe.z + Math.cos(a0 + 0.2) * r);
        speed = 2.2;
      } else if (this.state === 'search') {
        // over to where it lost you, then slow loops round it, stopping to feel about with its antennae
        const S = this.spt, dS = Math.hypot(S.x - H.x, S.y - H.y);
        if (dS > 3.2) {
          if (!this.sField) this.sField = nav.field([[S.x, S.y]], { wallCost: 0.9, maxDist: 60 });
          if (nav.descend(this.sField, H.x, H.y, D)) target = new THREE.Vector2(H.x + D.x * 1.6, H.y + D.z * 1.6);
          else target = S.clone();
          speed = 3.0;
        } else {
          this.orbitA += dt * 0.55 * this.orbitDir;
          if (Math.random() < dt * 0.15) this.orbitDir *= -1;
          const r = 1.8 + Math.sin(c.time * 0.6) * 0.5;
          let tx = S.x + Math.sin(this.orbitA) * r, tz = S.y + Math.cos(this.orbitA) * r;
          if (!nav.free(tx, tz)) { this.orbitDir *= -1; this.orbitA += 0.3 * this.orbitDir; tx = S.x + Math.sin(this.orbitA) * r; tz = S.y + Math.cos(this.orbitA) * r; }
          target = new THREE.Vector2(tx, tz);
          this.pause = Math.max(0, (this.pause || 0) - dt);
          if (this.pause <= 0 && Math.random() < dt * 0.35) this.pause = 0.6 + Math.random() * 1.0;
          speed = this.pause > 0 ? 0 : 1.6;
        }
      } else if (this.state === 'chase') {
        if (nav.descend(ctx.field, H.x, H.y, D)) target = new THREE.Vector2(H.x + D.x * 1.6, H.y + D.z * 1.6);
        else target = new THREE.Vector2(P.x, P.z);
        speed = 4.5 * catchUp(dP);
        if (dP < 2.2 && c.mode !== 'lunge' && !b.stun && ctx.player.alive && !ctx.safe && !hid) {
          c.mode = 'lunge'; b.lt = 0; b.caught = false;
          c.lungeDir = new V3(P.x - H.x, 0, P.z - H.y).normalize();
          c.onCatch = () => ctx.onCatch && ctx.onCatch();
          ctx.onLunge && ctx.onLunge();
        }
      } else {
        // patrol between fixed points, pausing now and then
        const [wx, wz] = PATROL[this.wp % PATROL.length];
        if (!this.wpField) this.wpField = nav.field([[wx, wz]], { wallCost: 0.9, maxDist: 70 });
        if (Math.hypot(wx - H.x, wz - H.y) < 1.2) { this.wp++; this.wpField = null; this.pause = 0.8 + Math.random() * 1.6; }
        if (this.wpField && nav.descend(this.wpField, H.x, H.y, D)) target = new THREE.Vector2(H.x + D.x * 1.6, H.y + D.z * 1.6);
        this.pause = Math.max(0, (this.pause || 0) - dt);
        speed = this.pause > 0 ? 0 : 1.9 + 0.6 * Math.sin(c.time * 0.7);
      }
    }
    if (c.mode !== 'lunge') {
      c.mode = 'drive';
      c.driveSpeed = speed;
      if (target) b.target.copy(target);
    }
    // looking about while it waits at an open door
    c.look += ((this.state === 'prowl' && ctx.fence && ctx.fence.open && speed < 1.6 ? 1 : 0) - c.look) * Math.min(1, dt * 2);
    // stuns: only the beam on its head counts (handled inside), tips for the first one and the shorter ones
    const prevStun = b.stun;
    c.onStun = (hits, hold) => ctx.onStun && ctx.onStun(hits, hold);
    c.update(dt, ctx.light, ctx.cam);
    // keep it out of walls: if the head ended up in a solid cell, nudge it back along the field
    if (this.state !== 'emerge' && this.state !== 'ram' && !nav.free(H.x, H.y)) {
      const k = nav.nearestFree(H.x, H.y, 4);
      if (k >= 0) { H.x += (nav.cx(k) - H.x) * 0.5; H.y += (nav.cz(k) - H.y) * 0.5; }
    }
    // and through a shut door it doesn't go (until it has broken it down)
    const Fd = ctx.fence;
    if (Fd && !Fd.open && H.x < Fd.x + 0.45 && H.x > Fd.x - 1.2 && Math.abs(H.y - Fd.zc) < 1.9) H.x = Fd.x + 0.45;
    return prevStun;
  }

  // a camera flash in its face: it stops dead and curls for a moment (shorter than the spray)
  flashStun(origin, dir, range = 9, cosHalf = Math.cos(0.62)) {
    if (!this.active || this.c.mode === 'kill' || this.state === 'dormant' || this.state === 'ram') return false;
    if (this.state === 'poke') { const v = this.c.rPos[0].clone().sub(origin), d = v.length(); if (d < range && v.dot(dir) / (d || 1) > cosHalf) { this.retract(); return true; } return false; }
    const b = this.c.b, v = this.c.rPos[0].clone().sub(origin), d = v.length();
    if (d > range || v.dot(dir) / (d || 1) < cosHalf) return false;
    if (this.c.mode === 'lunge') { this.c.mode = 'drive'; b.lunge = 0; b.caught = false; }
    b.stun = true; b.prev = 'drive'; b.hold = 2.2; b.curlSide = Math.random() < 0.5 ? -1 : 1; b.immune = 0;
    this.sprayStun = true;
    return true;
  }
  // a noise somewhere else (a thrown can): unless it has you in sight, it goes over there to feel about
  lure(x, z, nav) {
    if (!this.active || this.state === 'dormant' || this.state === 'emerge' || this.state === 'ram' || this.state === 'poke') return false;
    if (this.state === 'chase' && this.lostT < 1.5) return false;
    const k = nav.nearestFree(x, z, 12);
    this.state = 'search'; this.searchT = 6 + Math.random() * 3; this.lostT = 0; this.sField = null;
    this.spt = new THREE.Vector2(k >= 0 ? nav.cx(k) : x, k >= 0 ? nav.cz(k) : z);
    this.orbitA = Math.atan2(this.head.x - this.spt.x, this.head.z - this.spt.y); this.orbitDir = Math.random() < 0.5 ? -1 : 1;
    return true;
  }
  info() { return this.state === 'dormant' ? '잠듦' : this.c.b.stun ? '경직' : this.c.mode === 'lunge' ? '덮침' : ({ emerge: '등장', patrol: '순찰', chase: '추격', search: '수색', gone: '벽 속', ram: '환기구', poke: '덕트', prowl: '문 밖' })[this.state]; }
}
