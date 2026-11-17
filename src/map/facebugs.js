import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as TX from '../textures.js';
import { Roach, PRONOTUM } from '../roach.js';

// Roaches on you, up close (picked from facebug.html: candidate A). The detailed roach walks on a sheet of
// glass right in front of your eyes and you look at it from the face side: undersides, legs gripping,
// mouthparts and feelers working. It has a canvas of its own over the game's, so the world behind it can
// go out of focus. One crawler for each roach on you (they climb up from below and wander over your view),
// one for the roach that flies into your face. Built the first time it's needed (or ahead, by prepare()).
const D = 10;            // eye to glass, in roach units (a roach is about 3.3 long)
const rnd = (a, b) => a + Math.random() * (b - a);

export function createFaceBugs(parent, { touch = false } = {}) {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;display:block;pointer-events:none';
  parent.appendChild(canvas);
  let R = null, failed = false, drawn = false;

  function build() {
    if (R || failed) return R;
    try {
      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, touch ? 1.25 : 1.5));
      renderer.setSize(innerWidth, innerHeight);
      renderer.setClearColor(0x000000, 0);
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.15;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      const scene = new THREE.Scene();
      const pmrem = new THREE.PMREMGenerator(renderer);
      scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
      scene.environmentIntensity = 0.08;
      pmrem.dispose();
      const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 60);
      camera.position.set(0, -D, 0); camera.up.set(0, 0, 1); camera.lookAt(0, 0, 0);
      // the flashlight's spill from below right, a cool rim and a warm back light from the room beyond
      const spill = new THREE.PointLight(0xffe2c0, 2.4, 0, 0); spill.position.set(3.2, -D * 0.82, -3.4);
      const rim = new THREE.DirectionalLight(0xa9bdff, 1.3); rim.position.set(-3, 9, 5);
      const back = new THREE.DirectionalLight(0xffd9b0, 0.7); back.position.set(4, 7, -6);
      const hemi = new THREE.HemisphereLight(0x3a4252, 0x120a06, 0.35);
      scene.add(spill, rim, rim.target, back, back.target, hemi);
      const T = {};
      T.pronotum = TX.makePronotumTextures(PRONOTUM.R, PRONOTUM.bbox, 512);
      T.wing = TX.makeWingTextures(256, 512, 3);
      T.hind = TX.makeHindWingTexture(256);
      T.chitin = TX.makeChitinNormal(256);
      T.eye = TX.makeEyeNormal(); T.eye.repeat.set(2.2, 2.2);
      T.rings = TX.makeRingTextures();
      T.contact = TX.makeContactShadow(64);
      const crawlers = [];
      for (let i = 0; i < 3; i++) {
        const r = new Roach(T);
        r.addTo(scene);
        r.contact.visible = false;
        r.walking = true;
        const c = { r, i, state: 'off', tx: 0, tz: 0, speed: 0, pause: 0, owner: null };
        r.think = () => { const b = r.behaviour; b.desired = c.speed; b.target.set(c.tx, c.tz); r.lit = false; };   // we steer it
        crawlers.push(c);
      }
      // compile the shaders now rather than when the first one lands on you
      renderer.compile(scene, camera);
      for (const c of crawlers) show(c, false);
      R = { renderer, scene, camera, crawlers, spill, hemi };
    } catch (e) {
      failed = true; canvas.remove(); R = null;
    }
    return R;
  }

  const half = () => { const h = D * Math.tan(THREE.MathUtils.degToRad(R.camera.fov / 2)); return { h, w: h * R.camera.aspect }; };
  function show(c, on) { c.r.root.visible = on; c.r.extras.visible = on; }
  function place(c, x, z, yaw) {
    const r = c.r;
    r.root.position.set(x, 0, z); r.root.rotation.y = yaw; r.speed = 0;
    r.root.updateMatrixWorld(true);
    for (const l of r.legs) { l.foot.copy(l.home).applyMatrix4(r.root.matrixWorld); l.stepping = false; }
  }
  // a free spot over your view: the best of a few tries, away from the others and where they're heading
  function spot(c) {
    const { h, w } = half();
    let best = null, bestD = -1;
    for (let k = 0; k < 7; k++) {
      const q = [rnd(-w * 0.7, w * 0.7), rnd(-h * 0.62, h * 0.62)];
      let dmin = 99;
      for (const o of R.crawlers) {
        if (o === c || o.state === 'off') continue;
        const p = o.r.root.position;
        dmin = Math.min(dmin, Math.hypot(q[0] - p.x, q[1] - p.z), Math.hypot(q[0] - o.tx, q[1] - o.tz));
      }
      if (dmin > bestD) { bestD = dmin; best = q; }
    }
    return best;
  }
  // climbing up from your body: in over the bottom edge, now and then up a side
  function enter(c) {
    const { h, w } = half(), m = 3.2, e = Math.random();
    let x, z;
    if (e < 0.6) { x = rnd(-w * 0.6, w * 0.6); z = -h - m; }
    else { const s = e < 0.8 ? -1 : 1; x = s * (w + m); z = rnd(-h * 0.7, -h * 0.1); }
    [c.tx, c.tz] = spot(c);
    place(c, x, z, Math.atan2(c.tx - x, c.tz - z));
    c.state = 'move'; c.speed = rnd(3.5, 6); show(c, true);
  }
  // the one that flew at you: smack in front of your eyes
  function slam(c) {
    const { h } = half();
    place(c, rnd(-1.5, 1.5), rnd(-h * 0.25, h * 0.15), rnd(-0.6, 0.6));
    c.tx = c.r.root.position.x; c.tz = c.r.root.position.z; c.state = 'pause'; c.pause = 99; c.speed = 0; show(c, true);
  }
  // shaken off: it scrambles off the nearest edge (down = it drops off)
  function flee(c, down = false) {
    const { h, w } = half(), p = c.r.root.position;
    const dx = p.x / w, dz = p.z / h;
    if (down) { c.tz = -(h + 6); c.tx = p.x + rnd(-2, 2); }
    else if (Math.abs(dx) > Math.abs(dz)) { c.tx = Math.sign(dx || 1) * (w + 6); c.tz = p.z + rnd(-2, 2); }
    else { c.tz = Math.sign(dz || 1) * (h + 6); c.tx = p.x + rnd(-2, 2); }
    c.state = 'flee'; c.speed = rnd(11, 15);
  }
  function step(c, dt) {
    if (c.state === 'off') return;
    const r = c.r, p = r.root.position, { h, w } = half();
    const d = Math.hypot(c.tx - p.x, c.tz - p.z);
    if (c.state === 'move' && d < 0.6) { c.state = 'pause'; c.pause = rnd(0.3, 1.5); c.speed = 0; }
    else if (c.state === 'pause') {
      c.pause -= dt;
      if (c.pause <= 0) { [c.tx, c.tz] = spot(c); c.speed = Math.random() < 0.6 ? rnd(4.5, 7.5) : rnd(1.2, 2.2); c.state = 'move'; }
    }
    // they don't climb over each other: the later one turns off somewhere else
    if (c.state !== 'flee' && c.owner !== 'face') for (const o of R.crawlers) {
      if (o.i >= c.i || o.state === 'off') continue;
      const q = o.r.root.position;
      if (Math.hypot(q.x - p.x, q.z - p.z) < 3.0) { [c.tx, c.tz] = spot(c); c.state = 'move'; c.speed = Math.max(c.speed, 3.5); break; }
    }
    if (c.state === 'flee' && (Math.abs(p.x) > w + 4.5 || Math.abs(p.z) > h + 4.5)) { c.state = 'off'; show(c, false); return; }
    // on your face it shivers all over, worst when it stops
    const shiver = c.state === 'pause' ? 1 : c.state === 'move' ? 0.55 : 0.2;
    r.shiver += (shiver - r.shiver) * Math.min(1, dt * 5);
    r.update(dt, null);
  }
  const free = () => R.crawlers.find((c) => !c.owner && c.state === 'off') || R.crawlers.find((c) => !c.owner);

  return {
    get ok() { return !failed; },
    prepare() { build(); },
    // list: the roaches on you (G.attached); face: one has just flown into your face;
    // light: how lit you are (0 dark .. 1 flashlight on); bright: the brightness setting.
    // Returns how many are on show, or -1 if this can't run here (no second WebGL context).
    update(dt, { list, face, light = 1, bright = 1 }) {
      if (!R) { if (failed) return -1; if (!list.length && !face) return 0; if (!build()) return -1; }
      for (const a of list) {
        if (a.fb && a.fb.owner === a) continue;
        const c = free();
        if (c) { c.owner = a; a.fb = c; enter(c); }
      }
      if (face && !R.crawlers.some((c) => c.owner === 'face')) { const c = free(); if (c) { c.owner = 'face'; slam(c); } }
      for (const c of R.crawlers) {
        if (c.owner === 'face' && !face) { c.owner = null; flee(c, true); }
        else if (c.owner && c.owner !== 'face' && !list.includes(c.owner)) { c.owner = null; flee(c); }
        step(c, dt);
      }
      R.spill.intensity += ((0.25 + 2.15 * light) - R.spill.intensity) * Math.min(1, dt * 6);
      R.hemi.intensity = 0.12 + 0.23 * light;
      R.renderer.toneMappingExposure = 1.15 * bright;
      return R.crawlers.reduce((n, c) => n + (c.state !== 'off' ? 1 : 0), 0);
    },
    render() {
      if (!R) return;
      const any = R.crawlers.some((c) => c.state !== 'off');
      if (!any && !drawn) return;
      R.renderer.render(R.scene, R.camera);      // (clears to see-through first)
      drawn = any;
    },
    resize() {
      if (!R) return;
      R.renderer.setSize(innerWidth, innerHeight);
      R.camera.aspect = innerWidth / innerHeight; R.camera.updateProjectionMatrix();
    },
    clear() {
      if (!R) return;
      for (const c of R.crawlers) { c.owner = null; c.state = 'off'; show(c, false); }
    },
  };
}
