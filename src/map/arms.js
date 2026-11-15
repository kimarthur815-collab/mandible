// First-person arms: the gloved hands from the hands viewer (src/hands), in the game.
// Blue nitrile gloves, white suit sleeves, the flashlight in the right hand (held like the
// reference photo) and the insecticide can always in the left.
// Drawn in their own pass on top of the world so they never sink into walls, with their own
// camera at the viewer's 54-degree field of view so they look exactly as they do there.
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { Hand, frameQ, handData } from '../hands/handmodel.js';
import { gloveMaterial, sleeveMaterial, tyvekTextures } from '../hands/materials.js';
import { makeFlashlight, makeCan } from '../hands/props.js';
import { rightPoses, canGrip, nearer, forearmDir, VM_FOV } from '../hands/rig.js';
import { beamNear } from '../hands/beam.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
const clamp = THREE.MathUtils.clamp;

function copyState(s) { return { wrist: s.wrist.clone(), handQ: s.handQ.clone(), elbow: s.elbow.clone(), ang: s.ang.map((a) => a.slice()) }; }
function blendInto(s, A, B, a) {
  s.wrist.lerpVectors(A.wrist, B.wrist, a);
  s.elbow.lerpVectors(A.elbow, B.elbow, a);
  s.handQ.slerpQuaternions(A.handQ, B.handQ, a);
  for (let c = 0; c < 5; c++) for (let j = 0; j < 5; j++) s.ang[c][j] = A.ang[c][j] + (B.ang[c][j] - A.ang[c][j]) * a;
}

export class Arms {
  constructor() {
    this.scene = new THREE.Scene();
    this.root = new THREE.Group();            // follows the camera
    this.root.matrixAutoUpdate = false;
    this.scene.add(this.root);
    this.vm = new THREE.PerspectiveCamera(VM_FOV, 1, 0.05, 140);
    this.overlays = [];                       // drawn with the game camera (bugs on your face)

    // lights (their strength is driven by what the player is standing in)
    this.hemi = new THREE.HemisphereLight(0x8090b0, 0x1a1816, 0);
    this.lampL = new THREE.DirectionalLight(0xffd29a, 0);
    this.fill = new THREE.PointLight(0xe6e0d6, 0, 1.6, 1.2);     // the beam coming back off what it hits
    this.fill.position.set(-0.05, 0.3, -0.75);
    this.top = new THREE.PointLight(0xdcd6cc, 0, 1.0, 1.5);
    this.top.position.set(0, 0.25, 0.05);
    this.scene.add(this.hemi, this.lampL, this.lampL.target);
    this.root.add(this.fill, this.top);

    // hands
    handData({ h: 0.0012 });
    const mats = { glove: (u) => gloveMaterial(u), sleeve: sleeveMaterial(tyvekTextures()) };
    this.R = new Hand('right', mats); this.L = new Hand('left', mats);
    for (const H of [this.R, this.L]) { H.mesh.castShadow = H.mesh.receiveShadow = false; H.sleeve.castShadow = H.sleeve.receiveShadow = false; }
    this.root.add(this.R.mesh, this.L.mesh);

    // the flashlight in the right hand
    const rp = rightPoses(this.R);
    this.flash = makeFlashlight();
    this.flash.position.copy(rp.fq.pos); this.flash.quaternion.copy(rp.fq.q);
    this.R.bones[1].add(this.flash);
    this.poseOn = nearer(rp.holding());
    this.poseOff = nearer(rp.off());

    // the can in the left hand: resting low on the left, and raised with the nozzle forward to spray
    const { cg, canAng } = canGrip(this.L);
    this.can = makeCan();
    this.can.position.copy(cg.pos); this.can.quaternion.copy(cg.q);
    this.L.bones[1].add(this.can);
    const elbowL = (st) => { st.elbow = st.wrist.clone().addScaledVector(forearmDir(st.handQ, -1), 0.27); return st; };
    {
      // at rest: as in the viewer's spray pose (can upright, label toward you), a little lower
      const handQ = frameQ(cg.axis, new V3(0, 1, 0), new V3(0.12, 1, -0.28), new V3(-0.9, 0.0, -0.1));
      const at = new V3(-0.165, -0.205, -0.41);
      this.canRest = elbowL({ wrist: at.clone().sub(cg.at.clone().applyQuaternion(handQ)), handQ, ang: canAng });
    }
    {
      // spraying: raised toward the middle, nozzle pointing where you look
      const Qc = frameQ(new V3(0, 0, 1), new V3(1, 0, 0), new V3(0.05, 1, -0.2), new V3(0.08, 0.02, -1));
      const handQ = Qc.clone().multiply(cg.q.clone().invert());
      const center = new V3(-0.1, -0.13, -0.42);
      this.canSpray = elbowL({ wrist: center.clone().sub(cg.pos.clone().applyQuaternion(handQ)), handQ, ang: canAng });
    }
    this.cur = { R: copyState(this.poseOn), L: copyState(this.canRest) };
    this.onK = 1;

    // ---- state
    this.bob = 0; this.sway = new THREE.Vector2(); this.swayV = new THREE.Vector2();
    this.click = 0; this.shake = 0; this.useK = 0; this.time = 0; this.sprayT = 0;
    this.envMats = [];
    this.flash.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) this.envMats.push([o.material, 0.55]); });
    this.can.traverse((o) => { if (o.material && o.material.isMeshStandardMaterial) this.envMats.push([o.material, 0.3]); });
    this.envMats.push([this.R.mesh.material, 0.1], [this.L.mesh.material, 0.1], [mats.sleeve, 0.06]);
    this.envK = 0;
    this._v = new V3();
  }

  toggleClick() { this.click = 1; }
  sprayPuff() { this.sprayT = 0.9; }

  // a point on the arms, moved to where it appears on screen for the game camera (the arms are
  // drawn with a narrower lens), at the same distance in front of the eye
  toGameView(camera, worldP, out) {
    const p = camera.worldToLocal(out.copy(worldP));
    const k = Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2) / Math.tan(THREE.MathUtils.degToRad(VM_FOV) / 2);
    p.x *= k; p.y *= k;
    return p;
  }

  // where the spray comes out (world space)
  nozzleWorld(camera, out) {
    this.root.updateMatrixWorld(true);
    const w = this.can.localToWorld(new V3(0.016, 0, 0.1105));
    return camera.localToWorld(this.toGameView(camera, w, out));
  }

  // s: { dt, camera, moving, running, crouch, speed, lookDX, lookDY, flashOn, flashK, aimWorld, hitDist, lamp:{dir,k}, adapt, bright, shake, using }
  update(s) {
    const dt = Math.min(0.05, s.dt);
    this.time += dt;
    const cam = s.camera;
    cam.updateMatrixWorld();
    this.root.matrix.copy(cam.matrixWorld);
    this.root.matrixWorldNeedsUpdate = true;

    // walk bob and breathing
    const stride = s.running ? 9.5 : s.crouch ? 5 : 7.5;
    if (s.moving) this.bob += dt * stride * Math.min(1.4, s.speed / 3 + 0.4);
    const amp = s.moving ? (s.running ? 0.016 : 0.0075) : 0;
    const breath = Math.sin(this.time * 1.6) * 0.0018;
    const bobY = -Math.abs(Math.sin(this.bob)) * amp + breath + (s.crouch ? -0.01 : 0) + (s.running ? -0.018 : 0);
    const bobX = Math.sin(this.bob) * amp * 0.6;

    // the arms lag a little behind fast looks
    this.swayV.x += (-s.lookDX * 0.9 - this.sway.x) * 60 * dt - this.swayV.x * 10 * dt;
    this.swayV.y += (s.lookDY * 0.9 - this.sway.y) * 60 * dt - this.swayV.y * 10 * dt;
    this.sway.x += this.swayV.x * dt; this.sway.y += this.swayV.y * dt;
    this.sway.clampScalar(-0.06, 0.06);

    // shaking bugs off / pressing the switch / using things
    this.shake = Math.max(0, Math.max(this.shake - dt * 3, s.shake || 0));
    this.click = Math.max(0, this.click - dt * 7);
    this.useK += ((s.using ? 1 : 0) - this.useK) * Math.min(1, dt * 8);
    const jx = (Math.sin(this.time * 47) + Math.sin(this.time * 31)) * 0.5 * this.shake * 0.03;
    const jy = (Math.cos(this.time * 43) + Math.sin(this.time * 27)) * 0.5 * this.shake * 0.025;

    // ---- right hand: the light-on and light-off holds, blended
    this.onK += ((s.flashOn ? 1 : 0) - this.onK) * Math.min(1, dt * 8);
    const R = this.cur.R;
    blendInto(R, this.poseOff, this.poseOn, this.onK);
    const dR = new V3(bobX + this.sway.x + jx, bobY + this.sway.y + jy - this.click * 0.004, -this.useK * 0.03);
    if (s.running) dR.add(new V3(0.015, -0.02, 0.02));
    const rRoll = s.running ? Math.sin(this.bob) * 0.08 : 0;

    // ---- left hand: the can at rest, raised to spray, swinging to swat bugs off
    this.sprayT = Math.max(0, this.sprayT - dt);
    const spr = this.sprayT > 0 ? Math.min(1, (0.9 - this.sprayT) * 9, this.sprayT * 5) : 0;
    const Ls = this.cur.L;
    blendInto(Ls, this.canRest, this.canSpray, spr * spr * (3 - 2 * spr));
    const swat = this.shake;
    const dL = new V3(-bobX * 0.8 - this.sway.x * 0.8 + Math.sin(this.time * 38) * swat * 0.04, bobY * 1.1 + this.sway.y + swat * 0.08, swat * -0.02);
    if (s.running) dL.add(new V3(0, -0.03 + Math.sin(this.bob + Math.PI) * 0.02, 0.02));

    // ---- pose the rigs
    const place = (H, st, d, qx) => {
      for (let c = 0; c < 5; c++) for (let j = 0; j < 5; j++) H.ang[c][j] = st.ang[c][j];
      H.applyAngles();
      const q = qx ? st.handQ.clone().premultiply(qx) : st.handQ;
      H.place(st.wrist.clone().add(d), q, st.elbow.clone().add(d));
    };
    const tremor = new Q().setFromEuler(new THREE.Euler(Math.sin(this.time * 7.3) * 0.0025 + Math.sin(this.time * 1.1) * 0.006, Math.sin(this.time * 5.9) * 0.002, rRoll + Math.sin(this.time * 0.8) * 0.005));
    place(this.R, R, dR, tremor);
    const swatQ = swat > 0 ? new Q().setFromEuler(new THREE.Euler(-swat * 0.3 + Math.sin(this.time * 41) * swat * 0.15, 0, Math.sin(this.time * 33) * swat * 0.2)) : null;
    place(this.L, Ls, dL, swatQ);

    // ---- light on the arms
    const k = s.flashOn ? s.flashK : 0;
    const near = beamNear(s.hitDist);
    this.fill.intensity = k * 0.77 * Math.min(1.3, near * 2.2 / Math.max(0.5, s.hitDist) + 0.2);
    this.top.intensity = k * 0.27;
    const lampK = s.lamp ? s.lamp.k : 0;
    this.lampL.intensity = lampK * 2.0;
    if (lampK > 0) {
      this.lampL.position.copy(cam.position).addScaledVector(s.lamp.dir, -3).add(new V3(0, 2.5, 0));
      this.lampL.target.position.copy(cam.position);
    }
    this.hemi.intensity = 0.03 + s.adapt * 0.14 + k * 0.28 + lampK * 0.6 + (s.bright ? 1.4 : 0);
    this.envK = Math.min(1, 0.05 + k * 0.95 + s.adapt * 0.15 + lampK + (s.bright ? 1 : 0));
    this.flash.userData.led.emissiveIntensity = k > 0 ? 2.6 * k : 0;
    // overheating: the head starts to glow dull red as it gets hot, brightest when it cuts out
    const hk = THREE.MathUtils.smoothstep(s.heat || 0, 0.6, 1);
    this.heatK = (this.heatK || 0) + (hk - (this.heatK || 0)) * Math.min(1, s.dt * 4);
    this.flash.userData.head.emissiveIntensity = this.heatK * this.heatK * 0.07 * (0.9 + 0.1 * Math.sin(performance.now() * 0.004));
  }

  // where the beam should start (world), pulled back if a wall is closer than the lens
  lensWorld(camera, hitDist, out) {
    this.root.updateMatrixWorld(true);
    const w = this.flash.localToWorld(new V3(0, 0, 0.0845));
    this.toGameView(camera, w, out);
    const maxZ = Math.max(0.06, hitDist - 0.14);
    if (-out.z > maxZ) out.multiplyScalar(maxZ / -out.z);
    return camera.localToWorld(out);
  }

  addOverlay(o) { this.overlays.push(o); this.scene.add(o); }

  render(renderer, camera) {
    if (!this.env) {
      // a faint reflection of a room, so the black flashlight and the can read in the dark
      const pm = new THREE.PMREMGenerator(renderer);
      this.env = pm.fromScene(new RoomEnvironment(), 0.04).texture;
      pm.dispose();
      for (const [m] of this.envMats) { m.envMap = this.env; m.needsUpdate = true; }
    }
    for (const [m, g] of this.envMats) m.envMapIntensity = g * this.envK;
    const vm = this.vm;
    vm.aspect = camera.aspect; vm.near = camera.near; vm.far = camera.far;
    vm.updateProjectionMatrix();
    camera.updateMatrixWorld();
    camera.matrixWorld.decompose(vm.position, vm.quaternion, vm.scale);
    const ac = renderer.autoClear;
    renderer.autoClear = false;
    renderer.clearDepth();
    const vis = this.overlays.map((o) => o.visible);
    for (const o of this.overlays) o.visible = false;
    renderer.render(this.scene, vm);
    this.root.visible = false;
    this.overlays.forEach((o, i) => { o.visible = vis[i]; });
    renderer.render(this.scene, camera);
    this.root.visible = true;
    renderer.autoClear = ac;
  }
}
