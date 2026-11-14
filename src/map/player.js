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
  }

  place(x, z, yaw) { this.pos.set(x, 0, z); this.yaw = yaw; this.pitch = 0; this.vel.set(0, 0, 0); }

  // input: { mx, mz (local move -1..1), run, crouch, lookX, lookY }
  update(dt, input) {
    this.yaw -= input.lookX;
    this.pitch = clamp(this.pitch - input.lookY, -1.35, 1.35);
    this.crouch = input.crouch;
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
    const top = (this.crouch ? 1.5 : wantRun ? 5.5 : 3.0) * this.speedMul * this.slowMul;
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

    const eye = 1.62 - 0.55 * this.crouchT;
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
