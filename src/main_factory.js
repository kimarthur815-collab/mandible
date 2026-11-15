// Preview of the factory exterior (D-7): orbit round it at dusk or at night.
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { buildExterior } from './map/exterior.js';

const $ = (s) => document.querySelector(s);
const coarse = matchMedia('(pointer: coarse)').matches;
const TEST = new URLSearchParams(location.search).has('test');
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

// camera position, look-at target
const VIEWS = {
  hero: [[-30, 4.5, -34], [-2, 6.5, 6]],
  front: [[0, 2.4, -36], [0, 6.5, 4]],
  dock: [[4.5, 1.7, -10], [0, 3.4, 0]],
  gate: [[0, 2.6, -48], [0, 5, 0]],
  side: [[33, 6, -22], [4, 5, 10]],
  air: [[-55, 48, -60], [2, 0, 20]],
};

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
  const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.1, 1200);
  // the stencil font comes from the web font: wait for it (but not forever)
  if (document.fonts) await Promise.race([document.fonts.load('700 100px Oswald'), new Promise((r) => setTimeout(r, 2500))]).catch(() => {});
  $('#loading .msg').textContent = '공장 짓는 중';
  await nextFrame();
  const ext = buildExterior(scene, renderer);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.dampingFactor = 0.08;
  controls.minDistance = 3; controls.maxDistance = 160;
  controls.maxPolarAngle = Math.PI / 2 - 0.02;
  const setView = (k) => {
    const [p, t] = VIEWS[k];
    camera.position.set(...p); controls.target.set(...t); controls.update();
    document.querySelectorAll('[data-view]').forEach((b) => b.classList.toggle('on', b.dataset.view === k));
  };
  const setTime = (k) => { ext.setTime(k); document.querySelectorAll('[data-time]').forEach((b) => b.classList.toggle('on', b.dataset.time === k)); };
  document.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => setView(b.dataset.view)));
  document.querySelectorAll('[data-time]').forEach((b) => b.addEventListener('click', () => setTime(b.dataset.time)));
  setView('hero');

  addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
  $('#loading').classList.add('done');
  setTimeout(() => $('#hint').classList.add('show'), 600);
  setTimeout(() => $('#hint').classList.remove('show'), 6000);
  const render = () => { controls.update(); renderer.render(scene, camera); };
  window.__F = { setView, setTime, render, renderer, scene, camera };
  if (TEST) { window.__READY = true; return; }
  renderer.setAnimationLoop(render);
}
init();
