// The opening. The main screen is the cab of the pest-control truck driving a forest road at dusk, on
// and on, while the radio on the dash rings. Answering it plays the orders over the radio; then a fade
// to night: the truck stands in the yard, you climb out, walk to the dock shutter, it rolls up, and you
// step into the dark - where the game starts. It has its own scene (the outside, the truck, their own
// lights) so none of it weighs on the game once you are inside.
import * as THREE from 'three';
import { buildExterior, ROAD_PERIOD } from './exterior.js';
import { buildTruck } from './truck.js';

const V3 = THREE.Vector3;
const LANE_X = -2.0, SPEED = 9;
const LOOP_FROM = -340;              // the drive loops over one period of the roadside forest, far from the yard
const PARK = new V3(-1.6, 0, -12);   // where the truck stands at night, facing the dock
const DOOR_OUT = new V3(1.45, 1.62, 1.45);   // standing beside the driver's door (truck frame)
const SHUTTER_FRONT = new V3(0, 1.62, -3.4), INSIDE = new V3(0, 1.62, 1.0);
const WALK = 1.45;                   // m/s
const LINES = [
  ['본부', '치익— 방역 3조, 들리나. 여기는 본부.', 2.8],
  ['나', '3조. 잘 들립니다.', 1.9],
  ['본부', 'D-7 산업시설. 먼저 들어간 2조와 연락이 끊겼다.', 3.2],
  ['본부', '들어가서 발전기 세 개를 돌리고, 들어간 셔터로 나와라.', 3.4],
  ['본부', '...안에서 뭘 보든, 손전등은 끄지 마라.', 3.0],
  ['나', '...알겠습니다. 곧 도착합니다.', 2.4],
];
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ui: { fade(0..1), subtitle(who|null, text), radioButton(x, y) | radioButton(null), skip(bool) }
export function createIntro({ renderer, sfx, ui, onDone }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.05, 1200);
  const ext = buildExterior(scene, renderer);
  const truck = buildTruck();
  scene.add(truck.group);
  const g = truck.group;
  const sun = ext.sun, sunOff = new V3();
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24 }); sun.shadow.camera.updateProjectionMatrix();
  const setTime = (k) => {
    ext.setTime(k); truck.setTime(k);
    sunOff.subVectors(sun.position, sun.target.position);
    if (k === 'dusk') { scene.fog.near = 25; scene.fog.far = 210; renderer.toneMappingExposure = 1.3; }   // the yard stays out of sight down the road
  };
  setTime('dusk');
  g.position.set(LANE_X, 0, LOOP_FROM);
  truck.setRinging(true);

  // camera: in the seat (look relative to the truck) or standing (world position and yaw/pitch, yaw 0 = +z)
  const head = { yaw: -0.2, pitch: -0.1 }, want = { yaw: -0.2, pitch: -0.1 };
  const stand = { pos: new V3(), yaw: 0, pitch: 0 };
  let seated = true;
  const q = new THREE.Quaternion(), e3 = new THREE.Euler(0, 0, 0, 'YXZ'), tmp = new V3();
  const toWorld = (v) => { g.updateMatrixWorld(); return v.clone().applyMatrix4(g.matrixWorld); };

  let state = 'title', st = 0, time = 0, line = -1, lineT = 0, speed = SPEED, stepPhase = 0, fadeK = 0;
  let from = null, to = null, yaw0 = 0, yaw1 = 0;
  const go = (s) => { state = s; st = 0; };
  const showLine = (i) => {
    line = i; lineT = 0;
    if (i >= LINES.length) { ui.subtitle(null); return; }
    const [who, text, dur] = LINES[i];
    ui.subtitle(who, text);
    sfx.squelch();
    if (who === '본부') sfx.chatter(dur - 0.6);
  };

  const api = {
    active: true, scene, camera,
    // the radio was answered (the start button)
    answer() {
      if (state !== 'title') return;
      ui.radioButton(null); ui.skip(true);
      truck.setRinging(false);
      sfx.engine(true);
      go('call'); showLine(0);
    },
    // a tap: hurry the radio along
    tap() { if (state === 'call' && line < LINES.length && lineT > 0.35) showLine(line + 1); },
    skip() { if (state !== 'title' && state !== 'out') go('out'); },
    stop() {
      api.active = false;
      ui.subtitle(null); ui.skip(false); ui.radioButton(null); ui.fade(0);
      sfx.engine(false);
    },
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
    render() { renderer.render(scene, camera); },
    update(dt) {
      time += dt; st += dt;
      // ---- the truck
      if (state === 'title' || state === 'call' || state === 'fadeout') {
        g.position.z += speed * dt;
        if (g.position.z > LOOP_FROM + ROAD_PERIOD) g.position.z -= ROAD_PERIOD;
        g.rotation.z = Math.sin(time * 1.7) * 0.004; g.rotation.x = Math.sin(time * 2.3) * 0.003;
        g.position.y = Math.abs(Math.sin(time * 9)) * 0.006;
      }
      truck.update(dt, state === 'title' || state === 'call' || state === 'fadeout' ? speed : 0);
      sun.target.position.set(g.position.x, 0, g.position.z + 2); sun.position.copy(sun.target.position).add(sunOff);

      // ---- the story
      if (state === 'title') {
        want.yaw = -0.2 + Math.sin(time * 0.23) * 0.05; want.pitch = -0.1 + Math.sin(time * 0.31) * 0.02;
      } else if (state === 'call') {
        lineT += dt;
        // look at the radio while it's answered, then back at the road
        if (line <= 1) { want.yaw = -0.62; want.pitch = -0.36; } else { want.yaw = -0.06 + Math.sin(time * 0.3) * 0.04; want.pitch = -0.13; }
        if (line < LINES.length && lineT > LINES[line][2]) showLine(line + 1);
        if (line >= LINES.length && lineT > 0.6) go('fadeout');
      } else if (state === 'fadeout') {
        fadeK = ease(st / 1.4); speed = SPEED * (1 - fadeK * 0.5);
        if (st >= 1.6) {
          sfx.engine(false);
          setTime('night');
          g.position.copy(PARK); g.rotation.set(0, 0, 0);
          head.yaw = want.yaw = 0; head.pitch = want.pitch = -0.08;
          go('arrive');
        }
      } else if (state === 'arrive') {
        fadeK = 1 - ease((st - 0.3) / 1.4);
        if (st >= 2.6) { sfx.truckDoor(true); from = toWorld(truck.eye); to = toWorld(DOOR_OUT); go('exit'); }
      } else if (state === 'exit') {
        // turn to the door, climb out, then face the dock
        if (st < 0.9) { want.yaw = 1.1 * ease(st / 0.9); want.pitch = -0.05; }
        else {
          if (seated) { seated = false; stand.pos.copy(from); stand.yaw = head.yaw; stand.pitch = head.pitch; yaw0 = stand.yaw; }
          const k = ease((st - 0.9) / 1.5);
          stand.pos.lerpVectors(from, to, k); stand.pos.y = lerp(from.y, to.y, k) - Math.sin(k * Math.PI) * 0.18;
          const face = Math.atan2(SHUTTER_FRONT.x - to.x, SHUTTER_FRONT.z - to.z);
          stand.yaw = yaw0 + wrap(face - yaw0) * ease((st - 1.6) / 1.2); stand.pitch = lerp(-0.05, -0.02, k);
          if (st > 2.5 && !api._shut) { api._shut = true; sfx.truckDoor(false); }
        }
        if (st >= 2.9) { from = stand.pos.clone(); go('walk'); }
      } else if (state === 'walk') {
        const d = from.distanceTo(SHUTTER_FRONT), k = Math.min(1, (st * WALK) / d);
        stand.pos.lerpVectors(from, SHUTTER_FRONT, k);
        const face = Math.atan2(SHUTTER_FRONT.x - stand.pos.x, (SHUTTER_FRONT.z + 3) - stand.pos.z);
        stand.yaw += wrap(face - stand.yaw) * Math.min(1, dt * 3);
        stand.pitch += (0.05 - stand.pitch) * Math.min(1, dt * 2);
        const ph = stepPhase; stepPhase += dt * WALK / 0.7 * Math.PI;
        stand.pos.y = 1.62 + Math.abs(Math.sin(stepPhase)) * 0.035 - 0.02;
        if (Math.floor(stepPhase / Math.PI) !== Math.floor(ph / Math.PI) && k < 1) sfx.step('walk', Math.floor(stepPhase / Math.PI) % 2 === 0);
        if (k >= 1) { sfx.shutterRoll(2.4); go('open'); }
      } else if (state === 'open') {
        ext.dockShutter.position.y = ease(st / 2.4) * 4.35;
        stand.pitch += (0.12 - stand.pitch) * Math.min(1, dt * 1.5);
        if (st >= 2.9) { from = stand.pos.clone(); go('enter'); }
      } else if (state === 'enter') {
        const k = Math.min(1, st / 2.6);
        stand.pos.lerpVectors(from, INSIDE, k); stand.pos.y = 1.62 + Math.abs(Math.sin(st * 6.5)) * 0.03;
        stand.pitch += (0 - stand.pitch) * Math.min(1, dt * 2);
        fadeK = ease((st - 1.5) / 1.1);
        if (Math.floor(st * 4.2) !== Math.floor((st - dt) * 4.2)) sfx.step('walk', Math.floor(st * 4.2) % 2 === 0);
        if (st >= 2.6) { api.stop(); onDone(true); return; }
      } else if (state === 'out') {                       // skipped: a quick fade, then in
        fadeK = Math.min(1, fadeK + dt / 0.35);
        if (fadeK >= 1) { api.stop(); onDone(true); return; }
      }
      ui.fade(fadeK);

      // ---- camera
      if (seated) {
        const k = Math.min(1, dt * (state === 'call' ? 2.2 : 3));
        head.yaw += (want.yaw - head.yaw) * k; head.pitch += (want.pitch - head.pitch) * k;
        tmp.copy(truck.eye).applyMatrix4((g.updateMatrixWorld(), g.matrixWorld));
        camera.position.copy(tmp);
        e3.set(head.pitch, Math.PI + head.yaw, 0); q.setFromEuler(e3); camera.quaternion.copy(g.quaternion).multiply(q);
      } else {
        camera.position.copy(stand.pos);
        e3.set(stand.pitch, Math.PI + stand.yaw, 0); camera.quaternion.setFromEuler(e3);
      }
      // the start button hangs on the radio
      if (state === 'title') {
        camera.updateMatrixWorld();
        const p = toWorld(truck.radio).project(camera);
        if (p.z < 1) ui.radioButton((p.x + 1) / 2 * innerWidth, (1 - p.y) / 2 * innerHeight); else ui.radioButton(null);
      }
    },
  };
  return api;
}
