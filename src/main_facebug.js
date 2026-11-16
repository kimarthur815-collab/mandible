// Preview: three ways to show roaches crawling on you (pick one for the game).
// The bugs are the detailed roach (roach.js) walking on a sheet of glass right in front of your eyes:
// the camera sits on the face side of the glass and looks through it, so you see their undersides,
// legs gripping, mouthparts and antennae working, against a frame from the game behind them.
//   A  얼굴 위   — they crawl right across your view, the edges darken
//   B  방역 마스크 — the same, on your mask's visor: its frame, their foot smears on the glass, your breath fogging it
//   C  가장자리   — they keep to the edges (your hood, your shoulders), peeking in and pulling back
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as TX from './textures.js';
import { Roach, PRONOTUM } from './roach.js';

const $ = (s) => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const TEST = new URLSearchParams(location.search).has('test');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const rnd = (a, b) => a + Math.random() * (b - a);
const D = 10;           // camera to glass, in roach units (a roach is about 3.3 long)

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: TEST });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.75 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.15;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('#app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.08;
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.3, 60);
  camera.position.set(0, -D, 0); camera.up.set(0, 0, 1); camera.lookAt(0, 0, 0);
  // the visible patch of glass: half height / half width (x is screen right, z is screen up)
  const half = () => { const h = D * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)); return { h, w: h * camera.aspect }; };

  // ------------------------------------------------------------ lights
  // the flashlight's spill from below right, a cool rim from the room beyond, a little fill
  const spill = new THREE.PointLight(0xffe2c0, 2.4, 0, 0);
  spill.position.set(3.2, -D * 0.82, -3.4);
  const rim = new THREE.DirectionalLight(0xa9bdff, 1.3); rim.position.set(-3, 9, 5);
  const back = new THREE.DirectionalLight(0xffd9b0, 0.7); back.position.set(4, 7, -6);
  const hemi = new THREE.HemisphereLight(0x3a4252, 0x120a06, 0.35);
  scene.add(spill, rim, rim.target, back, back.target, hemi);

  // ------------------------------------------------------------ roaches
  const setLoad = (t) => { const el = $('#loading .msg'); if (el) el.textContent = t; };
  setLoad('바퀴 질감 만드는 중'); await nextFrame();
  const T = {};
  T.pronotum = TX.makePronotumTextures(PRONOTUM.R, PRONOTUM.bbox, coarse ? 512 : 768);
  await nextFrame();
  T.wing = TX.makeWingTextures(256, 512, 3);
  T.hind = TX.makeHindWingTexture(256);
  T.chitin = TX.makeChitinNormal(256);
  T.eye = TX.makeEyeNormal(); T.eye.repeat.set(2.2, 2.2);
  T.rings = TX.makeRingTextures();
  T.contact = TX.makeContactShadow(64);
  setLoad('바퀴 조립 중'); await nextFrame();

  const crawlers = [];
  for (let i = 0; i < 3; i++) {
    const r = new Roach(T);
    r.addTo(scene);
    r.contact.visible = false;
    r.walking = true;
    const c = { r, i, state: 'off', wait: 0.4 + i * 1.1, tx: 0, tz: 0, speed: 0, pause: 0, life: 0, trail: [] };
    // its own mind: we steer it
    r.think = () => { const b = r.behaviour; b.desired = c.speed; b.target.set(c.tx, c.tz); r.lit = false; };
    show(c, false);
    crawlers.push(c);
  }
  function show(c, on) { c.r.root.visible = on; c.r.extras.visible = on; }
  function place(c, x, z, yaw) {
    const r = c.r;
    r.root.position.set(x, 0, z); r.root.rotation.y = yaw; r.speed = 0;
    r.root.updateMatrixWorld(true);
    for (const l of r.legs) { l.foot.copy(l.home).applyMatrix4(r.root.matrixWorld); l.stepping = false; }
  }

  // where it may go, by candidate
  const S = { mode: 'A', count: 2, flash: true, shakeT: 0, blur: 0 };
  // a free spot: the best of a few tries, away from the others and where they're heading
  function spot(c) {
    let best = null, bestD = -1;
    for (let k = 0; k < 7; k++) {
      const q = spot1(c);
      let dmin = 99;
      for (const o of crawlers) {
        if (o === c || o.state === 'off') continue;
        const p = o.r.root.position;
        dmin = Math.min(dmin, Math.hypot(q[0] - p.x, q[1] - p.z), Math.hypot(q[0] - o.tx, q[1] - o.tz));
      }
      if (dmin > bestD) { bestD = dmin; best = q; }
    }
    return best;
  }
  function spot1(c) {
    const { h, w } = half();
    if (S.mode === 'C') {
      // along the edges: mostly the top (your hood), some the sides and bottom corners
      const e = Math.random();
      if (e < 0.5) return [rnd(-w * 0.85, w * 0.85), h + rnd(-1.4, 0.6)];
      if (e < 0.8) { const s = Math.random() < 0.5 ? -1 : 1; return [s * (w + rnd(-1.6, 0.4)), rnd(-h * 0.6, h * 0.8)]; }
      const s = Math.random() < 0.5 ? -1 : 1; return [s * rnd(w * 0.55, w * 0.95), -h + rnd(-0.6, 1.3)];
    }
    return [rnd(-w * 0.7, w * 0.7), rnd(-h * 0.62, h * 0.62)];
  }
  function spawn(c) {
    const { h, w } = half();
    // in from an edge (C: mostly the top)
    const e = S.mode === 'C' ? (Math.random() < 0.6 ? 0 : 1 + Math.floor(Math.random() * 3)) : Math.floor(Math.random() * 4);
    const m = 3.2;
    let x, z;
    if (e === 0) { x = rnd(-w * 0.7, w * 0.7); z = h + m; }
    else if (e === 1) { x = rnd(-w * 0.7, w * 0.7); z = -h - m; }
    else if (e === 2) { x = -w - m; z = rnd(-h * 0.6, h * 0.6); }
    else { x = w + m; z = rnd(-h * 0.6, h * 0.6); }
    [c.tx, c.tz] = spot(c);
    place(c, x, z, Math.atan2(c.tx - x, c.tz - z));
    c.state = 'move'; c.speed = rnd(3.5, 6); c.life = 0;
    show(c, true);
  }
  function shakeOff() {
    const { h, w } = half();
    for (const c of crawlers) {
      if (c.state === 'off' || c.state === 'flee') continue;
      const p = c.r.root.position;
      // scramble off the nearest edge
      const dx = p.x / w, dz = p.z / h;
      if (Math.abs(dx) > Math.abs(dz)) { c.tx = Math.sign(dx || 1) * (w + 6); c.tz = p.z + rnd(-2, 2); }
      else { c.tz = Math.sign(dz || 1) * (h + 6); c.tx = p.x + rnd(-2, 2); }
      c.state = 'flee'; c.speed = rnd(11, 15);
    }
    S.shakeT = 0.5;
  }
  function stepCrawler(c, dt) {
    const r = c.r, p = r.root.position;
    if (c.state === 'off') {
      if (c.i >= S.count) return;
      c.wait -= dt; if (c.wait <= 0) spawn(c);
      return;
    }
    c.life += dt;
    const { h, w } = half();
    const d = Math.hypot(c.tx - p.x, c.tz - p.z);
    if (c.state === 'move' && d < 0.6) { c.state = 'pause'; c.pause = S.mode === 'C' ? rnd(0.6, 2.2) : rnd(0.3, 1.5); c.speed = 0; }
    else if (c.state === 'pause') {
      c.pause -= dt;
      if (c.pause <= 0) {
        // creep a little or dart; C: sometimes pull back out of sight for a moment
        [c.tx, c.tz] = spot(c);
        const dart = Math.random() < 0.6;
        c.speed = dart ? rnd(4.5, 7.5) : rnd(1.2, 2.2);
        c.state = 'move';
      }
    }
    if (c.i >= S.count && c.state !== 'flee') { shakeOne(c); }
    // don't climb over each other: the later one turns off somewhere else
    if (c.state !== 'flee') for (const o of crawlers) {
      if (o.i >= c.i || o.state === 'off') continue;
      const q = o.r.root.position;
      if (Math.hypot(q.x - p.x, q.z - p.z) < 3.0) { [c.tx, c.tz] = spot(c); c.state = 'move'; c.speed = Math.max(c.speed, 3.5); break; }
    }
    if (c.state === 'flee' && (Math.abs(p.x) > w + 4.5 || Math.abs(p.z) > h + 4.5)) { c.state = 'off'; c.wait = rnd(1.5, 3); show(c, false); return; }
    r.update(dt, null);
  }
  function shakeOne(c) { const { h } = half(); c.tz = (c.r.root.position.z >= 0 ? 1 : -1) * (h + 6); c.tx = c.r.root.position.x; c.state = 'flee'; c.speed = 9; }

  // ------------------------------------------------------------ the visor (B): smears, fog
  const smear = $('#smear'), sctx = smear.getContext('2d');
  const fog = $('#fog');
  function sizeSmear() { smear.width = Math.round(innerWidth * 0.5); smear.height = Math.round(innerHeight * 0.5); }
  sizeSmear();
  const v = new THREE.Vector3();
  function stampSmears(dt) {
    if (S.mode !== 'B') return;
    // the glass slowly clears
    sctx.globalCompositeOperation = 'destination-out'; sctx.fillStyle = `rgba(0,0,0,${Math.min(1, dt * 0.02)})`; sctx.fillRect(0, 0, smear.width, smear.height);
    sctx.globalCompositeOperation = 'source-over';
    for (const c of crawlers) {
      if (c.state === 'off' || !c.r.root.visible) continue;
      for (const l of c.r.legs) {
        if (l.stepping) continue;
        v.copy(l.foot).project(camera);
        const x = (v.x * 0.5 + 0.5) * smear.width, y = (0.5 - v.y * 0.5) * smear.height;
        if (x < 0 || y < 0 || x > smear.width || y > smear.height) continue;
        sctx.fillStyle = 'rgba(78,64,44,0.11)'; sctx.beginPath(); sctx.arc(x, y, 1.9, 0, 6.29); sctx.fill();
      }
      // the belly drags a faint greasy streak
      v.set(0, 0, -1.2).applyMatrix4(c.r.root.matrixWorld).setY(0).project(camera);
      const x = (v.x * 0.5 + 0.5) * smear.width, y = (0.5 - v.y * 0.5) * smear.height;
      if (c.r.speed > 0.5) { sctx.fillStyle = 'rgba(130,110,80,0.035)'; sctx.beginPath(); sctx.arc(x, y, 6, 0, 6.29); sctx.fill(); }
    }
  }

  // ------------------------------------------------------------ UI
  function setMode(m) {
    S.mode = m;
    document.body.dataset.mode = m;
    document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
    $('#desc').innerHTML = DESC[m];
    if (m !== 'B') sctx.clearRect(0, 0, smear.width, smear.height);
    for (const c of crawlers) if (c.state !== 'off') { [c.tx, c.tz] = spot(c); }
  }
  const DESC = {
    A: '<b>A · 얼굴 위</b> — 진짜 바퀴 모델이 눈앞 유리판을 기어가는 걸 아래(배 쪽)에서 봐요. 다리 관절·입·더듬이가 움직이고, 가장자리가 어두워져요.',
    B: '<b>B · 방역 마스크</b> — 방역 마스크를 쓴 시점. 바퀴가 바이저 위를 기어가며 발자국·기름 자국을 남기고, 숨 쉴 때마다 김이 서려요.',
    C: '<b>C · 가장자리</b> — 바퀴가 모자·어깨 쪽 가장자리에 붙어 슬쩍 들어왔다 빠졌다 해요. 시야는 덜 가리고 더 찝찝하게.',
  };
  document.querySelectorAll('[data-m]').forEach((b) => b.addEventListener('click', () => setMode(b.dataset.m)));
  document.querySelectorAll('[data-n]').forEach((b) => b.addEventListener('click', () => {
    S.count = +b.dataset.n;
    document.querySelectorAll('[data-n]').forEach((x) => x.classList.toggle('on', x === b));
    for (const c of crawlers) if (c.i < S.count && c.state === 'off') c.wait = Math.min(c.wait, 0.3 + c.i * 0.4);
  }));
  $('#shake').addEventListener('click', shakeOff);
  $('#flash').addEventListener('click', () => { S.flash = !S.flash; $('#flash').classList.toggle('on', S.flash); document.body.classList.toggle('dark', !S.flash); });
  setMode('A');

  addEventListener('resize', () => {
    renderer.setSize(innerWidth, innerHeight);
    camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
    sizeSmear();
  });

  // ------------------------------------------------------------ loop
  const clock = new THREE.Clock();
  let t = 0;
  const stage = $('#stage'), bgEl = $('#bg');
  function frame(dtIn) {
    const dt = dtIn != null ? dtIn : Math.min(clock.getDelta(), 1 / 20);
    t += dt;
    for (const c of crawlers) stepCrawler(c, dt);
    const on = crawlers.filter((c) => c.state !== 'off' && c.r.root.visible).length;
    // lighting follows the flashlight
    spill.intensity += ((S.flash ? 2.4 : 0.25) - spill.intensity) * Math.min(1, dt * 6);
    hemi.intensity = S.flash ? 0.35 : 0.12;
    // head sway, and the itch while they're on you; a hard jolt when you shake
    S.shakeT = Math.max(0, S.shakeT - dt);
    const j = S.shakeT > 0 ? 9 * S.shakeT : on ? 0.8 : 0;
    const sx = Math.sin(t * 0.7) * 6 + Math.sin(t * 31) * j, sy = Math.sin(t * 1.1) * 3 + Math.cos(t * 27) * j;
    stage.style.transform = `translate(${sx.toFixed(1)}px, ${sy.toFixed(1)}px) rotate(${(Math.sin(t * 0.5) * 0.4).toFixed(2)}deg) scale(1.04)`;
    document.body.style.setProperty('--n', on);
    S.blur += ((S.mode === 'C' ? 0.4 : 1.6) * Math.min(on, 2) - S.blur) * Math.min(1, dt * 2);
    bgEl.style.filter = S.flash ? `blur(${S.blur.toFixed(2)}px)` : `blur(${S.blur.toFixed(2)}px) brightness(.22) saturate(.7)`;
    // breath on the visor: in and out, a little quicker with bugs on you
    const br = Math.sin(t * (on ? 2.6 : 1.8));
    fog.style.opacity = (S.mode === 'B' ? 0.12 + Math.max(0, br) * (0.6 + 0.15 * on) : 0).toFixed(3);
    stampSmears(dt);
    renderer.render(scene, camera);
  }
  function loop() { frame(); requestAnimationFrame(loop); }
  $('#loading').classList.add('done');
  if (TEST) {
    window.__F = { frame, setMode, S, crawlers, shakeOff, spawn };
    window.__READY = true;
  } else loop();
}
init();
