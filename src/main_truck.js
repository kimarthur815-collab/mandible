// Preview of the pest-control truck: from the driver's seat it drives up the forest road toward the
// factory (the radio keeps ringing); the outside views park it on the road in front of the gate.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildExterior } from './map/exterior.js';
import { buildTruck } from './map/truck.js';

const $ = (s) => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const TEST = new URLSearchParams(location.search).has('test');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

const LANE_X = -1.6, ROAD_START = -170, PARK_Z = -40, SPEED = 8;
// outside views: camera offset and look-at, in the truck's frame
const VIEWS = { front: [[4.2, 1.5, 6.4], [0, 1.2, 0]], side: [[7, 1.5, -0.4], [0, 1.3, -0.4]], rear: [[-2.6, 1.7, -8], [0, 1.4, -0.6]] };

async function init() {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: TEST });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, coarse ? 1.5 : 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  $('#app').appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.05, 1200);
  if (document.fonts) await Promise.race([Promise.all([document.fonts.load('600 40px Oswald'), document.fonts.load('700 30px "Noto Sans KR"')]), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
  $('#loading .msg').textContent = '트럭 끌고 오는 중';
  await nextFrame();
  const ext = buildExterior(scene, renderer);
  const truck = buildTruck();
  scene.add(truck.group);
  truck.group.position.set(LANE_X, 0, PARK_Z);

  // keep the sun's shadow box tight round the truck
  const sun = ext.sun, sunOff = new THREE.Vector3();
  Object.assign(sun.shadow.camera, { left: -22, right: 22, top: 22, bottom: -22 }); sun.shadow.camera.updateProjectionMatrix();
  const setTime = (k) => {
    ext.setTime(k); truck.setTime(k);
    sunOff.subVectors(sun.position, sun.target.position);
    document.querySelectorAll('[data-time]').forEach((b) => b.classList.toggle('on', b.dataset.time === k));
  };

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08; controls.minDistance = 2.5; controls.maxDistance = 40; controls.maxPolarAngle = Math.PI / 2 - 0.03;
  let view = 'cab', driving = true, look = { yaw: 0, pitch: -0.2 };
  const setView = (k) => {
    view = k; driving = k === 'cab'; controls.enabled = k !== 'cab';
    if (k === 'cab') { look = { yaw: 0, pitch: -0.2 }; truck.group.position.z = ROAD_START; camera.fov = 66; }
    else {
      truck.group.position.z = PARK_Z; camera.fov = 45;
      const [o, t] = VIEWS[k], p = truck.group.position;
      camera.position.set(p.x + o[0], o[1], p.z + o[2]); controls.target.set(p.x + t[0], t[1], p.z + t[2]); controls.update();
    }
    camera.updateProjectionMatrix();
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === k));
  };
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => setTime(b.dataset.time)));

  // drag to look round from the seat
  let drag = null;
  renderer.domElement.addEventListener('pointerdown', (e) => { if (view === 'cab') drag = { x: e.clientX, y: e.clientY }; });
  addEventListener('pointerup', () => { drag = null; });
  addEventListener('pointermove', (e) => {
    if (!drag) return;
    look.yaw = THREE.MathUtils.clamp(look.yaw - (e.clientX - drag.x) * 0.004, -1.9, 1.9);
    look.pitch = THREE.MathUtils.clamp(look.pitch - (e.clientY - drag.y) * 0.004, -0.9, 0.6);
    drag = { x: e.clientX, y: e.clientY };
  });

  setTime('dusk'); setView('cab');
  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  $('#loading').classList.add('done');
  setTimeout(() => $('#hint').classList.add('show'), 600);
  setTimeout(() => $('#hint').classList.remove('show'), 6000);

  const eye = new THREE.Vector3(), q = new THREE.Quaternion(), e3 = new THREE.Euler(0, 0, 0, 'YXZ');
  let time = 0;
  const step = (dt) => {
    time += dt;
    const g = truck.group;
    if (driving) { g.position.z += SPEED * dt; if (g.position.z > PARK_Z - 6) g.position.z = ROAD_START; }
    // a little body roll from the road
    g.rotation.z = driving ? Math.sin(time * 1.7) * 0.004 : 0; g.rotation.x = driving ? Math.sin(time * 2.3) * 0.003 : 0;
    g.position.y = driving ? Math.abs(Math.sin(time * 9)) * 0.006 : 0;
    truck.update(dt, driving ? SPEED : 0);
    sun.target.position.set(g.position.x, 0, g.position.z + 2); sun.position.copy(sun.target.position).add(sunOff);
    if (view === 'cab') {
      g.updateMatrixWorld(); eye.copy(truck.eye).applyMatrix4(g.matrixWorld);
      camera.position.copy(eye);
      e3.set(look.pitch, Math.PI + look.yaw, 0); q.setFromEuler(e3); camera.quaternion.copy(g.quaternion).multiply(q);
    } else controls.update();
    renderer.render(scene, camera);
  };
  let last = performance.now();
  window.__T = { setView, setTime, step, truck, camera, setLook: (yaw, pitch) => { look = { yaw, pitch }; } };
  if (TEST) { window.__READY = true; return; }
  renderer.setAnimationLoop(() => { const now = performance.now(), dt = Math.min(0.05, (now - last) / 1000); last = now; step(dt); });
}
init();
