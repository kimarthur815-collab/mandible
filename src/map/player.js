import * as THREE from 'three';

const clamp = THREE.MathUtils.clamp;

// First-person body: circle vs axis-aligned boxes on the floor plane.
export class Player {
  constructor(camera, colliders) {
    this.camera = camera;
    this.colliders = colliders;
    this.pos = new THREE.Vector3();
    this.vel = new THREE.Vector3();
    this.yaw = 0; this.pitch = 0;
    this.radius = 0.32;
    this.crouch = false; this.crouchT = 0;
    this.stamina = 1; this.restT = 0; this.exhausted = false;
    this.bob = 0; this.speed = 0;
    this.moved = false;
    this.speedMul = 1;
    this.slowMul = 1;     // bugs on you
    this.noclip = false;
    this.under = null;    // the crawl space (table, conveyor) the body is in or touching
    this.inside = null;   // ...and all the way under it
  }

  // the crawl space nearest the body: { c, depth } with depth > 0 inside (distance to its edge), < 0 outside
  underInfo() {
    let best = null;
    for (const c of this.colliders) {
      if (!c.under || c.off) continue;
      const ox = Math.max(c.x0 - this.pos.x, 0, this.pos.x - c.x1), oz = Math.max(c.z0 - this.pos.z, 0, this.pos.z - c.z1);
      const depth = ox === 0 && oz === 0 ? Math.min(this.pos.x - c.x0, c.x1 - this.pos.x, this.pos.z - c.z0, c.z1 - this.pos.z) : -Math.hypot(ox, oz);
      if (!best || depth > best.depth) best = { c, depth };
    }
    return best;
  }

  place(x, z, yaw) { this.pos.set(x, 0, z); this.yaw = yaw; this.pitch = 0; this.vel.set(0, 0, 0); }

  // input: { mx, mz (local move -1..1), run, crouch, lookX, lookY }
  update(dt, input) {
    this.yaw -= input.lookX;
    this.pitch = clamp(this.pitch - input.lookY, -1.35, 1.35);
    // under a table you can't stand up
    const ui = this.underInfo();
    const touching = !!ui && ui.depth > -this.radius + 0.03;     // (standing against one doesn't count)
    this.crouch = input.crouch || touching;
    this.crouchT += ((this.crouch ? 1 : 0) - this.crouchT) * (1 - Math.exp(-dt * 10));

    let mx = input.mx, mz = input.mz;
    const ml = Math.hypot(mx, mz);
    if (ml > 1) { mx /= ml; mz /= ml; }
    const moving = ml > 0.05;
    const wantRun = input.run && moving && !this.crouch && !this.exhausted && mz > 0.2;
    this.moving = moving;
    if (wantRun) { this.stamina = Math.max(0, this.stamina - dt / 6); this.restT = 0; if (this.stamina <= 0) this.exhausted = true; }
    else {
      this.restT += dt;
      this.stamina = Math.min(1, this.stamina + dt / 4);
      if (this.exhausted && this.stamina > 0.35) this.exhausted = false;
    }
    const top = (this.crouch ? (touching ? 1.1 : 1.5) : wantRun ? 5.5 : 3.0) * this.speedMul * this.slowMul;
    const fx = Math.sin(this.yaw), fz = Math.cos(this.yaw);   // forward on the floor
    const rx = -fz, rz = fx;                                  // right
    const tx = (fx * mz + rx * mx) * top, tz = (fz * mz + rz * mx) * top;
    const k = 1 - Math.exp(-dt * (moving ? 10 : 12));
    this.vel.x += (tx - this.vel.x) * k;
    this.vel.z += (tz - this.vel.z) * k;
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    if (!this.noclip) this.resolve();
    this.speed = Math.hypot(this.vel.x, this.vel.z);
    this.running = wantRun;
    if (this.speed > 0.2) this.moved = true;
    this.bob += dt * this.speed * (wantRun ? 2.4 : 2.9);

    // crouched, the head goes down further on the way under a table, all the way once under it
    const u2 = this.underInfo();
    this.under = u2 && u2.depth > -this.radius + 0.03 ? u2.c : null;
    this.inside = u2 && u2.depth > 0.22 ? u2.c : null;
    const e0 = 1.62 - 0.55 * this.crouchT;
    const crawl = u2 ? 0.5 + 0.57 * clamp(-u2.depth / 0.35, 0, 1) : 9;
    const eye = e0 + (Math.min(e0, crawl) - e0) * this.crouchT;
    const bobY = Math.abs(Math.sin(this.bob)) * 0.045 * clamp(this.speed / 3, 0, 1.6);
    const bobX = Math.cos(this.bob) * 0.025 * clamp(this.speed / 3, 0, 1.6);
    this.camera.position.set(this.pos.x + rx * bobX, eye + bobY, this.pos.z + rz * bobX);
    const e = new THREE.Euler(this.pitch, this.yaw + Math.PI, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(e);
  }

  resolve() {
    const r = this.radius;
    for (let pass = 0; pass < 3; pass++) {
      for (const c of this.colliders) {
        if (c.off) continue;
        if (c.under && this.crouchT > 0.6) continue;       // crouched: you fit underneath
        const qx = clamp(this.pos.x, c.x0, c.x1), qz = clamp(this.pos.z, c.z0, c.z1);
        const dx = this.pos.x - qx, dz = this.pos.z - qz;
        const d2 = dx * dx + dz * dz;
        if (d2 >= r * r) continue;
        if (d2 > 1e-9) {
          const d = Math.sqrt(d2), push = r - d;
          this.pos.x += (dx / d) * push; this.pos.z += (dz / d) * push;
        } else {
          // centre inside the box: leave by the nearest face
          const l = this.pos.x - c.x0, rr = c.x1 - this.pos.x, b = this.pos.z - c.z0, t = c.z1 - this.pos.z;
          const m = Math.min(l, rr, b, t);
          if (m === l) this.pos.x = c.x0 - r; else if (m === rr) this.pos.x = c.x1 + r; else if (m === b) this.pos.z = c.z0 - r; else this.pos.z = c.z1 + r;
        }
      }
    }
  }

  forward(out = new THREE.Vector3()) { return out.set(0, 0, -1).applyQuaternion(this.camera.quaternion); }
}
