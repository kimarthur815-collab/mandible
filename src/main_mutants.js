// Preview: hard mode's bugs, fused with the people who came in before you (the radiation did it):
// the ghost spider and the centipede. Walk round them (drag), pinch / wheel to zoom, "얼굴 가까이" to
// go in on the face.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import * as TX from './textures.js';
import { makeFace } from './mutant/face.js';
import { makeGrinFace } from './mutant/grinface.js';
import { MUTANTS } from './mutant/mutants.js';

const $ = (s) => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const Q = new URLSearchParams(location.search);
const TEST = Q.has('test');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));
const setLoad = (t) => { const el = $('#loading .msg'); if (el) el.textContent = t; };

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: TEST });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.6 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.1;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('#app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x030303);
  scene.fog = new THREE.FogExp2(0x030303, 0.06);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.05;
  const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.02, 60);
  camera.position.set(1.6, 1.1, 2.4);
  const controls = new OrbitControls(camera, renderer.domElement);
  let dragging = false;
  controls.addEventListener('start', () => { dragging = true; }); controls.addEventListener('end', () => { setTimeout(() => { dragging = false; }, 1500); });
  controls.enableDamping = true; controls.target.set(0, 0.3, 0); controls.minDistance = 0.25; controls.maxDistance = 8;
  controls.maxPolarAngle = Math.PI * 0.495;

  // a dark factory floor, the flashlight from where you stand, a little cold light from behind
  const floor = new THREE.Mesh(new THREE.CircleGeometry(9, 48).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x3a3836, roughness: 0.92 }));
  floor.receiveShadow = true; scene.add(floor);
  const flash = new THREE.SpotLight(0xfff0dc, 5, 0, 0.5, 0.55, 2);
  flash.castShadow = true; flash.shadow.mapSize.set(1024, 1024); flash.shadow.bias = -0.0004; flash.shadow.camera.near = 0.05;
  scene.add(flash, flash.target);
  const rim = new THREE.DirectionalLight(0x8aa0d0, 0.6); rim.position.set(-3, 3, -4); scene.add(rim);
  const hemi = new THREE.HemisphereLight(0x404858, 0x100c0a, 0.25); scene.add(hemi);

  const T = { chitin: TX.makeChitinNormal(256), terg: TX.makeTergiteTextures(512), band: TX.makeBandTextures(), bandU: TX.makeBandTexturesU(), eye: TX.makeEyeNormal(), contact: TX.makeContactShadow() };
  T.eye.repeat.set(3, 3);

  // ---- just a face (for working on it): ?face=scream|grin|howl &eyes=hollow|void|human, or ?face=smile (the ghost's)
  if (Q.has('face')) {
    const f = Q.get('face') === 'smile' ? makeGrinFace({ h: 0.5 }) : makeFace({ h: 0.5, mouth: Q.get('face') || 'scream', eyes: Q.get('eyes') || 'hollow', tears: Q.has('tears') });
    f.group.position.set(0, 0.6, 0); scene.add(f.group);
    flash.intensity = 1.6;
    controls.target.set(0, 0.6, 0); camera.position.set(0.25, 0.7, 1.4);
    let t = 0;
    window.__face = f; window.__cam = camera; window.__ctl = controls;
    const loop = () => {
      t += 1 / 60;
      if (!Q.has('open')) f.setOpen(0.5 + 0.5 * Math.sin(t * 1.3)); else f.setOpen(+Q.get('open'));
      if (f.lookAt) f.lookAt(camera.position);
      flash.position.copy(camera.position).add(new THREE.Vector3(0.15, -0.1, 0));
      flash.target.position.copy(controls.target);
      controls.update(); renderer.render(scene, camera);
    };
    $('#loading').classList.add('done');
    if (TEST) { window.__step = (n) => { for (let i = 0; i < n; i++) loop(); }; window.__READY = true; } else renderer.setAnimationLoop(loop);
    return;
  }

  // ---- the candidates
  setLoad('벌레 만드는 중'); await nextFrame();
  const built = {};
  const state = { k: 'ghost', near: false, walk: true, flash: true };
  const desc = $('#desc');
  function pick(k) {
    state.k = k;
    for (const [key, m] of Object.entries(built)) m.group.visible = key === k;
    if (!built[k]) { built[k] = MUTANTS[k].make(T); scene.add(built[k].group); }
    built[k].group.visible = true;
    desc.innerHTML = MUTANTS[k].desc;
    document.querySelectorAll('#picks button').forEach((b) => b.classList.toggle('on', b.dataset.k === k));
    frameView();
  }
  // the view follows it round: the target tracks the creature (or its face), the camera keeps its offset
  function frameView() {
    const m = built[state.k];
    m.update(0, 0, ctxNow());
    const tg = m.focus(state.near);
    controls.target.copy(tg); camera.position.copy(tg).add(viewOf(m, state.near));
  }
  // (a tall phone screen sees less across, so stand further back)
  const viewOf = (m, near) => m.view(near).multiplyScalar(Math.max(1, 0.85 / camera.aspect));
  const ctxNow = () => ({ walk: state.walk, cam: camera.position, light: { on: state.flash, pos: flash.position, dir: controls.target.clone().sub(flash.position).normalize() } });
  document.querySelectorAll('#picks button').forEach((b) => b.addEventListener('click', () => pick(b.dataset.k)));
  $('#near').addEventListener('click', () => { state.near = !state.near; $('#near').classList.toggle('on', state.near); frameView(); });
  $('#walk').addEventListener('click', () => { state.walk = !state.walk; $('#walk').classList.toggle('on', state.walk); });
  $('#flash').addEventListener('click', () => { state.flash = !state.flash; $('#flash').classList.toggle('on', state.flash); });
  pick(Q.get('k') || 'ghost');
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });

  const clock = new THREE.Clock();
  let t = 0;
  function frame(dtIn) {
    const dt = dtIn || Math.min(clock.getDelta(), 1 / 20);
    t += dt;
    const m = built[state.k];
    const dist = camera.position.distanceTo(controls.target);
    flash.intensity = state.flash ? 5 * Math.min(1.6, Math.max(0.12, (dist / 3) ** 2)) : 0;     // (the same light on it near or far)
    flash.position.copy(camera.position).add(new THREE.Vector3(0.12, -0.12, 0).applyQuaternion(camera.quaternion));
    flash.target.position.copy(controls.target);
    m.update(dt, t, ctxNow());
    const tg = m.focus(state.near), dv = tg.clone().sub(controls.target).multiplyScalar(Math.min(1, dt * 6));
    controls.target.add(dv); camera.position.add(dv);
    // close up: the camera keeps to the front of the face as it turns and walks (drag to look round)
    if (state.near && !dragging) camera.position.lerp(tg.add(viewOf(m, true)), Math.min(1, dt * 1.5));
    controls.update();
    renderer.render(scene, camera);
  }
  $('#loading').classList.add('done');
  window.__M = { pick, built, state, camera, controls, frame, near: (v) => { state.near = v; frameView(); } };
  if (TEST) { window.__step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) frame(dt); }; window.__READY = true; } else renderer.setAnimationLoop(() => frame());
}
init();
