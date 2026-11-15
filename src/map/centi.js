// The centipede in the map. Sleeps in the wall until generator 2 starts, then bursts out of
// the hall vent. Patrols, and once it sees or hears you it chases (4.5 m/s) round walls.
// Light on the head: curls up 2 s (1 s from the third time in one chase). Spray: 4 s, then it
// backs off. If you stand in a lit safe zone it circles the edge. A touch is death.
import * as THREE from 'three';
import { Centipede } from '../centipede.js';

const V3 = THREE.Vector3;

const VENT = { x: 15, z: 69.7, y: 0.55 };
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
  }

  get active() { return this.state !== 'dormant'; }
  get head() { return this.c.headPos; }
  get speed() { return this.c.speed; }

  // generator 2: out of the wall
  wake() {
    if (this.state !== 'dormant') return false;
    this.state = 'emerge';
    this.c.group.visible = true;
    // the body starts inside the wall behind the vent and slides out along its trail
    this.c.reset(VENT.x, VENT.z + 1.2, Math.PI);
    this.c.mode = 'drive'; this.c.driveSpeed = 5.0;
    this.emergeT = 0;
    return true;
  }

  // the final chase: wherever it is, it now knows where you are
  enrage(P) {
    if (this.state === 'dormant') { this.wake(); return; }
    if (this.state === 'emerge') return;          // it is coming out anyway, then it chases
    this.state = 'chase'; this.lostT = 0;
  }

  spray(origin, dir, range = 3.4, cosHalf = Math.cos(Math.PI / 6)) {
    if (!this.active) return false;
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
    if (this.state === 'dormant') return;
    const { dt } = ctx, c = this.c, b = c.b, P = ctx.player.pos, nav = ctx.nav;
    const H = c.headXZ, dP = Math.hypot(P.x - H.x, P.z - H.y);
    const D = { x: 0, z: 0 };
    let target = null, speed = 0;

    if (ctx.frozen) { c.driveSpeed = 0; c.update(dt, null, null); return; }

    if (this.state === 'emerge') {
      this.emergeT += dt;
      b.immune = 0.6;                              // no flinching while still half inside the wall
      target = new THREE.Vector2(VENT.x, VENT.z - 4);
      speed = 5.0;
      if (!this.coverV && H.y < VENT.z + 0.1) { this.coverV = { x: (Math.random() - 0.5) * 1.5, vy: 2.2, z: -4.5, spin: -9 }; ctx.onBurst && ctx.onBurst(); }
      if (H.y < VENT.z - 3.2) { this.state = 'chase'; this.chases++; }
    } else {
      // can it sense you?
      const sees = dP < 11 && nav.sees(H.x, H.y, P.x, P.z);
      const hears = ctx.player.noise > 0 && dP < ctx.player.noise * 1.2;
      const event = ctx.events.some((e) => Math.hypot(e.x - H.x, e.z - H.y) < e.r);
      if (this.state === 'patrol' && ctx.player.alive && (sees || hears || event)) { this.state = 'chase'; this.lostT = 0; this.chases++; ctx.onSee && ctx.onSee(); }
      if (this.state === 'chase') {
        this.lostT = sees || dP < 6 ? 0 : this.lostT + dt;
        if (this.lostT > 9 || !ctx.player.alive) { this.state = 'patrol'; this.wpField = null; }
      }
      if (this.sprayStun && !b.stun) { this.sprayStun = false; this.retreatT = 2.6; }
      if (this.retreatT > 0) {
        this.retreatT -= dt;
        if (nav.descend(ctx.field, H.x, H.y, D, -1)) target = new THREE.Vector2(H.x + D.x * 2, H.y + D.z * 2);
        speed = 3.2;
      } else if (this.state === 'chase' && ctx.safe) {
        // you are in a lamp's light: circle its edge and wait
        this.orbitA += dt * 0.35;
        const r = ctx.safe.r + 1.8, a0 = Math.atan2(H.x - ctx.safe.x, H.y - ctx.safe.z);
        const a = a0 + 0.5;
        target = new THREE.Vector2(ctx.safe.x + Math.sin(a) * r, ctx.safe.z + Math.cos(a) * r);
        if (!nav.free(target.x, target.y)) target.set(ctx.safe.x + Math.sin(a0 + 0.2) * r, ctx.safe.z + Math.cos(a0 + 0.2) * r);
        speed = 2.2;
      } else if (this.state === 'chase') {
        if (nav.descend(ctx.field, H.x, H.y, D)) target = new THREE.Vector2(H.x + D.x * 1.6, H.y + D.z * 1.6);
        else target = new THREE.Vector2(P.x, P.z);
        speed = 4.5;
        if (dP < 2.2 && c.mode !== 'lunge' && !b.stun && ctx.player.alive && !ctx.safe) {
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
    // stuns: only the beam on its head counts (handled inside), tips for the first one and the shorter ones
    const prevStun = b.stun;
    c.onStun = (hits, hold) => ctx.onStun && ctx.onStun(hits, hold);
    c.update(dt, ctx.light, ctx.cam);
    // keep it out of walls: if the head ended up in a solid cell, nudge it back along the field
    if (this.state !== 'emerge' && !nav.free(H.x, H.y)) {
      const k = nav.nearestFree(H.x, H.y, 4);
      if (k >= 0) { H.x += (nav.cx(k) - H.x) * 0.5; H.y += (nav.cz(k) - H.y) * 0.5; }
    }
    return prevStun;
  }

  info() { return this.state === 'dormant' ? '잠듦' : this.c.b.stun ? '경직' : this.c.mode === 'lunge' ? '덮침' : ({ emerge: '등장', patrol: '순찰', chase: '추격' })[this.state]; }
}
