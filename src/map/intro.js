// The opening. The main screen is the cab of the pest-control truck driving a forest road at dusk, on
// and on, while the radio on the dash rings. Answering it plays the orders over the radio; then a fade
// to night: the truck stands in the yard, you climb out, go round to the back and open it up, kit up
// (suit zipped, flashlight, two cans of spray, the gas mask on), walk to the dock shutter, it rolls up,
// and you step into the dark - where the game starts. The same scene plays the ending: out through the shutter at
// night, back to the truck, and one last call on the radio. Then something stirs under the seat; you look
// up into the rear-view mirror, and it's in the cab with you. It has its own scene (the outside, the truck, their own
// lights) so none of it weighs on the game once you are inside.
import * as THREE from 'three';
import { buildExterior, ROAD_PERIOD } from './exterior.js';
import { buildTruck } from './truck.js';

const V3 = THREE.Vector3;
const LANE_X = -2.0, SPEED = 9;
const LOOP_FROM = -340;              // the drive loops over one period of the roadside forest, far from the yard
const PARK = new V3(-1.6, 0, -12);   // where the truck stands at night, facing the dock
// getting out of the driver's door (truck frame): down onto the step in the open door, then back from it
// far enough for it to swing shut (it is 1.1 m wide, hinged at x 0.85, z 2.2)
const DOOR_STEP = new V3(1.2, 1.56, 1.5), DOOR_OUT = new V3(1.55, 1.62, 0.72);
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
// the ending's call: tap-advanced like the opening
const END_LINES = [
  ['나', '본부, 3조. 발전기 세 대 다 돌리고 나왔습니다.', 2.8],
  ['본부', '치익————', 1.6],
  ['본부', '......3...조... 들리나... 여기... 2조...', 3.4],
  ['나', '...2조? 이정훈 씨? 살아 있어요?', 2.2],
  ['본부', '(사각사각사각— 무언가 마이크 위를 기어 다닌다)', 3.6],
];
// ...or, with Lee Jeong-hun's ID card in your pocket
const END_LINES_TRUE = [
  ['나', '본부, 3조. 발전기 세 대 다 돌리고 나왔습니다.', 2.8],
  ['나', '...2조 이정훈 씨는 안에서 찾았습니다. 사원증만 가지고 나왔어요.', 3.4],
  ['본부', '치익— ......수고했다, 3조.', 2.4],
  ['본부', '그 공장은 오늘 밤 안으로 봉쇄한다. 바로 복귀해라.', 3.0],
  ['나', '(사원증 뒤에 볼펜으로 꾹꾹 눌러 쓴 글씨가 있다)', 3.0],
  ['나', '\'3조에게 — 셔터 열리면 뒤돌아보지 마. 고맙다. 이정훈\'', 3.8],
];
const AROUND = new V3(0.9, 1.62, -8.6);          // past the truck's nose on the way to its door
// round to the back of the truck (truck frame), where you stand to kit up, and back past its side
const TO_BACK = [new V3(1.6, 1.62, -1.0), new V3(1.3, 1.62, -4.1)], REAR_STAND = new V3(0.1, 1.62, -3.85);
const FROM_BACK = [new V3(1.5, 1.62, -3.9), new V3(1.6, 1.62, 1.6)];
const ease = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
const lerp = THREE.MathUtils.lerp;
const wrap = (a) => Math.atan2(Math.sin(a), Math.cos(a));

// ui: { fade(0..1), subtitle(who|null, text), radioButton(x, y) | radioButton(null), skip(bool), mask(bool) (the gas mask's view) }
export function createIntro({ renderer, sfx, ui, onDone }) {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(66, innerWidth / innerHeight, 0.05, 1200);
  const ext = buildExterior(scene, renderer);
  const truck = buildTruck();
  scene.add(truck.group);
  const g = truck.group;

  // ---- the ending's last thing: it came out from under the seat and rises between the seats, beside you.
  // Only its eyes catch the light. You see it in the rear-view mirror (a camera behind the glass, rendered
  // into the mirror's face while it lasts; flipped, as a mirror is)
  const thing = new THREE.Group(); thing.visible = false; g.add(thing);
  const fur = new THREE.MeshStandardMaterial({ color: 0x1c1610, roughness: 1 });
  const eyeMat = new THREE.MeshStandardMaterial({ color: 0x050302, emissive: 0xcfe8b0, emissiveIntensity: 0, roughness: 0.2 });
  { const h = new THREE.Mesh(new THREE.SphereGeometry(0.1, 20, 14), fur); h.scale.set(1, 0.85, 1.15); thing.add(h);
    const b = new THREE.Mesh(new THREE.SphereGeometry(0.13, 16, 12), fur); b.position.set(0, -0.06, -0.16); b.scale.set(1, 0.8, 1.3); thing.add(b);
    // eight eyes: four small in front, two big over them, two looking out to the sides
    for (const [x, y, z, r] of [[-0.06, -0.02, 0.1, 0.009], [-0.022, -0.025, 0.112, 0.009], [0.022, -0.025, 0.112, 0.009], [0.06, -0.02, 0.1, 0.009],
      [-0.032, 0.022, 0.104, 0.017], [0.032, 0.022, 0.104, 0.017], [-0.066, 0.045, 0.06, 0.012], [0.066, 0.045, 0.06, 0.012]]) {
      const e = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 8), eyeMat); e.position.set(x, y, z); thing.add(e);
    }
    // fangs under the eyes, and the palps either side of them
    const band = new THREE.MeshStandardMaterial({ color: 0x3a2f22, roughness: 1 });
    for (const sd of [1, -1]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 8), new THREE.MeshStandardMaterial({ color: 0x0c0907, roughness: 0.35 })); f.position.set(sd * 0.025, -0.075, 0.085); f.rotation.set(Math.PI - 0.3, 0, sd * 0.15); thing.add(f);
      const pp = new THREE.Mesh(new THREE.CapsuleGeometry(0.014, 0.06, 4, 8), fur); pp.position.set(sd * 0.065, -0.06, 0.1); pp.rotation.set(1.1, 0, -sd * 0.4); thing.add(pp);
    }
    // legs hooked over the seat cushions on either side: hairy, banded at the joints
    const leg = (pts) => {
      for (let i = 1; i < pts.length; i++) {
        const a = new V3(...pts[i - 1]), b = new V3(...pts[i]), r = 0.022 - i * 0.004;
        const m = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.8, r, a.distanceTo(b), 7), fur); m.position.copy(a).lerp(b, 0.5); m.quaternion.setFromUnitVectors(new V3(0, 1, 0), b.clone().sub(a).normalize()); thing.add(m);
        const j = new THREE.Mesh(new THREE.SphereGeometry(r * 1.1, 8, 6), band); j.position.copy(a); thing.add(j);
      }
    };
    for (const sd of [1, -1]) { leg([[sd * 0.07, 0, 0.02], [sd * 0.2, 0.12, 0.08], [sd * 0.26, -0.2, 0.2]]); leg([[sd * 0.08, -0.03, -0.05], [sd * 0.24, 0.08, -0.06], [sd * 0.3, -0.25, 0.02]]); }
    // bristles all over the head and body
    const br = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.0015, 0.003, 0.03, 3), fur, 220), M4 = new THREE.Matrix4(), Q = new THREE.Quaternion(), up = new V3(0, 1, 0);
    for (let i = 0; i < 220; i++) {
      const onBody = i >= 110, n = new V3(Math.random() - 0.5, Math.random() - 0.3, Math.random() - 0.5).normalize();
      const c = onBody ? new V3(0, -0.06, -0.16) : new V3(0, 0, 0), sc = onBody ? new V3(0.13, 0.104, 0.169) : new V3(0.1, 0.085, 0.115);
      const p = c.clone().add(n.clone().multiply(sc)).addScaledVector(n, 0.012);
      Q.setFromUnitVectors(up, n); M4.compose(p, Q, new V3(1, 0.6 + Math.random() * 0.9, 1)); br.setMatrixAt(i, M4);
    }
    thing.add(br);
  }
  const glim = new THREE.PointLight(0x8a96aa, 0, 1.2, 1.5); glim.position.set(0, 0.25, 0.35); thing.add(glim);   // the dash's glow on it
  const mirrorRT = new THREE.WebGLRenderTarget(512, 134);
  const mirrorCam = new THREE.PerspectiveCamera(17, 0.25 / 0.065, 0.05, 40);
  const mirror = (() => {
    const geo = new THREE.PlaneGeometry(0.25, 0.065), uv = geo.attributes.uv;
    for (let i = 0; i < uv.count; i++) uv.setX(i, 1 - uv.getX(i));
    geo.rotateY(Math.PI); geo.translate(0, 1.78, 1.918);        // (just proud of the glass box's face)
    const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ map: mirrorRT.texture })); m.visible = false; g.add(m);
    return m;
  })();
  const MIRROR = new V3(0, 1.78, 1.92), MIRROR_AIM = new V3(0.05, 1.3, 1.15);
  const sun = ext.sun, sunOff = new V3();
  Object.assign(sun.shadow.camera, { left: -24, right: 24, top: 24, bottom: -24 }); sun.shadow.camera.updateProjectionMatrix();
  const setTime = (k) => {
    ext.setTime(k); truck.setTime(k);
    sunOff.subVectors(sun.position, sun.target.position);
    if (k === 'dusk') { scene.fog.near = 25; scene.fog.far = 210; renderer.toneMappingExposure = 1.4; }   // the yard stays out of sight down the road
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

  let state = 'title', st = 0, st0 = 0, time = 0, line = -1, lineT = 0, speed = SPEED, stepPhase = 0, fadeK = 0, ringT = 0;
  let from = null, to = null, yaw0 = 0, yaw1 = 0;
  let lines = LINES, finish = () => onDone(true), path = null, pathI = 0;
  const go = (s) => { state = s; st = 0; };
  const showLine = (i) => {
    line = i; lineT = 0;
    if (i >= lines.length) { ui.subtitle(null); return; }
    const [who, text, dur] = lines[i];
    ui.subtitle(who, text);
    if (who === '본부') { sfx.squelch(); if (/사각|기어/.test(text)) sfx.radioSkitter(dur); else sfx.chatter(dur - 0.6); }
    else if (!/^[('"]/.test(text)) sfx.mumble(Math.min(2.2, 0.5 + text.length * 0.06));   // (not for what you read or what happens)
  };
  // a footstep each half stride while walking
  const stepSound = (dt, speedK = 1) => {
    const ph = stepPhase; stepPhase += dt * WALK * speedK / 0.7 * Math.PI;
    if (Math.floor(stepPhase / Math.PI) !== Math.floor(ph / Math.PI)) sfx.step('walk', Math.floor(stepPhase / Math.PI) % 2 === 0);
    return 1.62 + Math.abs(Math.sin(stepPhase)) * 0.035 - 0.02;
  };

  // walk the path (world points), turning to face along it; true once at its end
  const walkPath = (dt, speedK = 1.15) => {
    const p = path[pathI], d = tmp.subVectors(p, stand.pos).setY(0), len = d.length(), stepLen = WALK * speedK * dt;
    if (len <= stepLen) { stand.pos.x = p.x; stand.pos.z = p.z; pathI++; } else stand.pos.addScaledVector(d, stepLen / len);
    const next = path[Math.min(pathI, path.length - 1)];
    stand.yaw += wrap(Math.atan2(next.x - stand.pos.x, next.z - stand.pos.z) - stand.yaw) * Math.min(1, dt * 2.6);
    stand.pitch += (-0.04 - stand.pitch) * Math.min(1, dt * 2);
    stand.pos.y = stepSound(dt, speedK);
    return pathI >= path.length;
  };
  // the gear in the crate: taking a thing flies it up to you (under your chin, or for the mask onto your face) and it's gone
  const cargo = truck.cargo, crate = cargo.items.mask.parent;
  const home = Object.fromEntries(Object.entries(cargo.items).map(([k, o]) => [k, o.position.clone()]));
  const resetCargo = () => { for (const [k, o] of Object.entries(cargo.items)) { o.position.copy(home[k]); o.visible = true; o.scale.setScalar(1); } cargo.light.intensity = 0; cargo.bulb.material.emissiveIntensity = 0; cargo.group.visible = false; truck.setRear(0); };
  const take = (o, k, onFace = false) => {
    if (k <= 0 || !o.visible) return;
    camera.updateMatrixWorld();
    const f = new V3(0, 0, -1).applyQuaternion(camera.quaternion), to = camera.position.clone().addScaledVector(f, onFace ? 0.12 : 0.3);
    if (!onFace) to.y -= 0.15;
    crate.updateMatrixWorld(); crate.worldToLocal(to);
    o.position.lerpVectors(o.userData.from || (o.userData.from = o.position.clone()), to, ease(k));
    if (k >= 1) { o.visible = false; o.userData.from = null; }
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
    // a tap or Enter: the next line (the talk waits for it)
    tap() {
      if ((state === 'call' || state === 'outTalk') && lineT > 0.35) {
        if (line < lines.length - 1) showLine(line + 1);
        else { showLine(lines.length); go(state === 'call' ? 'fadeout' : 'outTwist'); }
      }
    },
    skip() { if (state !== 'title' && state !== 'out') go('out'); },
    // the ending: out of the shutter at night, back to the truck, one more call. done() when it fades out
    ending(x, done, withId = false) {
      api.active = true; api.isEnding = true; api.trueEnd = withId; lines = withId ? END_LINES_TRUE : END_LINES; finish = done; api._shut = false;
      setTime('night'); renderer.toneMappingExposure = 1.4;
      g.position.copy(PARK); g.rotation.set(0, 0, 0); truck.setRinging(false);
      ext.dockShutter.position.y = 4.35;
      seated = false; fadeK = 1; line = -1; ui.skip(true); ui.radioButton(null);
      thing.visible = false; mirror.visible = false; camera.fov = 66; camera.updateProjectionMatrix();
      resetCargo(); ui.mask(false);                    // (out in the open air, the mask comes off)
      stand.pos.set(THREE.MathUtils.clamp(x, -2, 2), 1.62, -0.6); stand.yaw = Math.PI; stand.pitch = 0;
      path = [SHUTTER_FRONT.clone(), AROUND.clone(), toWorld(DOOR_OUT)]; pathI = 0;
      go('outWalk');
    },
    // which background music goes with what's happening (see music.js), and how far it steps back for talk
    musicMode() {
      if (state === 'title' || state === 'call') return 'dusk';
      if (state === 'fadeout') return 'off';
      if (state === 'outTwist') return 'off';
      if (state === 'outTalk' || (state === 'out' && api.isEnding)) return 'end';
      if (state === 'enter' || state === 'out') return 'inside';
      return 'night';
    },
    musicDuck() { return state === 'call' || state === 'outTalk' ? 0.55 : 1; },
    stop() {
      api.active = false;
      thing.visible = false; mirror.visible = false; camera.fov = 66; camera.updateProjectionMatrix();
      ui.subtitle(null); ui.skip(false); ui.radioButton(null); ui.fade(0);
      sfx.engine(false);
    },
    resize() { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); },
    render() {
      if (mirror.visible) {
        g.updateMatrixWorld();
        mirrorCam.position.copy(MIRROR).applyMatrix4(g.matrixWorld); mirrorCam.lookAt(MIRROR_AIM.clone().applyMatrix4(g.matrixWorld));
        mirror.visible = false; renderer.setRenderTarget(mirrorRT); renderer.render(scene, mirrorCam); renderer.setRenderTarget(null); mirror.visible = true;
      }
      renderer.render(scene, camera);
    },
    update(dt) {
      time += dt; st0 = st; st += dt;
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
        // once sound is allowed (any tap), the engine runs and the radio calls
        if (sfx.ctx && sfx.ctx.state === 'running') { sfx.engine(true); ringT -= dt; if (ringT <= 0) { ringT = 1.6; sfx.radioBeep(); } }
        want.yaw = -0.2 + Math.sin(time * 0.23) * 0.05; want.pitch = -0.1 + Math.sin(time * 0.31) * 0.02;
      } else if (state === 'call') {
        lineT += dt;
        // look at the radio while it's answered, then back at the road
        if (line <= 1) { want.yaw = -0.62; want.pitch = -0.36; } else { want.yaw = -0.06 + Math.sin(time * 0.3) * 0.04; want.pitch = -0.13; }
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
        // turn to the door as it swings open, climb down onto the step, back off, shove it shut, face the dock
        truck.setDoor(Math.min(ease(st / 0.8), 1 - ease((st - 2.6) / 0.4)));
        if (st < 0.9) { want.yaw = 1.1 * ease(st / 0.9); want.pitch = -0.05; }
        else {
          if (seated) { seated = false; stand.pos.copy(from); stand.yaw = head.yaw; stand.pitch = head.pitch; yaw0 = stand.yaw; }
          const a = ease((st - 0.9) / 1.1), b = ease((st - 1.9) / 0.8), step = toWorld(DOOR_STEP);
          stand.pos.lerpVectors(from, step, a).lerp(to, b);
          stand.pos.y = lerp(lerp(from.y, step.y, a), to.y, b) - Math.sin(a * Math.PI) * 0.18;
          const face = Math.atan2(SHUTTER_FRONT.x - to.x, SHUTTER_FRONT.z - to.z);
          stand.yaw = yaw0 + wrap(face - yaw0) * ease((st - 2.7) / 1.0); stand.pitch = lerp(-0.05, -0.02, a);
          if (st > 2.95 && !api._shut) { api._shut = true; sfx.truckDoor(false); }
        }
        if (st >= 3.7) { path = [...TO_BACK, REAR_STAND].map(toWorld); pathI = 0; resetCargo(); go('toBack'); }
      } else if (state === 'toBack') {
        if (walkPath(dt)) go('gear');
      } else if (state === 'gear') {
        // at the back: open it up, the bulb inside stutters on; zip the suit up; flashlight, two cans, the mask on
        const T = (a) => st >= a && st0 < a;          // (did st just pass a)
        const look = st < 5.4 ? [0, st < 1.6 ? -0.1 : -0.38] : [0, -0.38 + 0.3 * ease((st - 5.4) / 0.6)];
        stand.yaw += wrap(look[0] - stand.yaw) * Math.min(1, dt * 3); stand.pitch += (look[1] - stand.pitch) * Math.min(1, dt * 3);
        if (T(0.5)) { sfx.truckDoor(true); cargo.group.visible = true; }
        if (T(0.6)) sfx.hinge(); if (T(0.85)) sfx.hinge(0.9);
        truck.setRear(ease((st - 0.6) / 1.1), ease((st - 0.85) / 1.1));
        if (st > 1.4) { const on = st > 1.95 || Math.random() < 0.5; cargo.light.intensity = on ? 2.2 : 0.3; cargo.bulb.material.emissiveIntensity = on ? 3 : 0.5; }
        if (T(1.4)) sfx.click(true);
        if (T(2.0)) { ui.subtitle('나', '(방역복 지퍼를 끝까지 올린다)'); sfx.zip(); }
        if (T(3.1)) ui.subtitle(null);
        if (T(3.2)) sfx.gearTake();
        take(cargo.items.flashlight, (st - 3.2) / 0.35);
        if (T(4.0)) sfx.canRattle();
        take(cargo.items.spray1, (st - 4.0) / 0.35);
        if (T(4.6)) sfx.gearTake();
        take(cargo.items.spray2, (st - 4.6) / 0.35);
        take(cargo.items.mask, (st - 5.4) / 0.65, true);
        if (st > 5.95 && st < 6.5) fadeK = 1 - Math.abs(st - 6.2) / 0.3;            // the mask goes over your eyes
        else fadeK = 0;
        if (T(6.2)) { ui.mask(true); sfx.maskOn(); }
        if (T(7.0)) { ui.subtitle('나', '...좋아. 들어가자.'); sfx.mumble(0.9); }
        if (st >= 8.2) { ui.subtitle(null); path = [...FROM_BACK.map(toWorld), SHUTTER_FRONT.clone()]; pathI = 0; go('toShutter'); }
      } else if (state === 'toShutter') {
        if (walkPath(dt)) { sfx.shutterRoll(2.4); go('open'); }
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
      } else if (state === 'outWalk') {
        // out into the yard and around the truck's nose to the driver's door
        fadeK = 1 - ease(st / 1.2);
        const p = path[pathI], d = tmp.subVectors(p, stand.pos).setY(0), len = d.length();
        const stepLen = WALK * 1.15 * dt;
        if (len <= stepLen) { stand.pos.x = p.x; stand.pos.z = p.z; pathI++; }
        else stand.pos.addScaledVector(d, stepLen / len);
        const next = path[Math.min(pathI, path.length - 1)];
        const face = pathI >= path.length ? -Math.PI / 2 : Math.atan2(next.x - stand.pos.x, next.z - stand.pos.z);
        stand.yaw += wrap(face - stand.yaw) * Math.min(1, dt * 2.6);
        stand.pitch += (-0.04 - stand.pitch) * Math.min(1, dt * 2);
        stand.pos.y = stepSound(dt, 1.15);
        if (pathI >= path.length) { sfx.truckDoor(true); from = stand.pos.clone(); to = toWorld(truck.eye); yaw0 = stand.yaw; go('outIn'); }
      } else if (state === 'outIn') {
        // turn to the door, pull it open, up onto the step, climb in, pull it shut, settle facing the road
        truck.setDoor(Math.min(ease(st / 0.7), 1 - ease((st - 2.3) / 0.4)));
        if (!seated) {
          stand.yaw = yaw0 + wrap(-Math.PI / 2 - yaw0) * ease(st / 0.6);
          const a = ease((st - 0.6) / 0.6), b = ease((st - 1.1) / 1.0), step = toWorld(DOOR_STEP);
          stand.pos.lerpVectors(from, step, a).lerp(to, b); stand.pos.y = lerp(lerp(from.y, step.y, a), to.y, b) + Math.sin(b * Math.PI) * 0.12;
          if (st >= 2.1) { seated = true; head.yaw = stand.yaw; head.pitch = stand.pitch; want.yaw = 0; want.pitch = -0.08; }
        }
        if (st >= 2.65 && !api._shut) { api._shut = true; sfx.truckDoor(false); }
        if (st >= 3.4) { sfx.engine(true); go('outTalk'); showLine(0); }
      } else if (state === 'outTalk') {
        lineT += dt;
        // the radio, then the last line: a start, staring at it
        if (api.trueEnd && line >= lines.length - 2) { want.yaw = 0.05; want.pitch = -0.62; }      // reading the back of his card
        else if (line >= lines.length - 1) { want.yaw = -0.66 + Math.sin(time * 37) * 0.01; want.pitch = -0.4; }
        else if (line >= 1) { want.yaw = -0.62; want.pitch = -0.36; }
        else { want.yaw = -0.3; want.pitch = -0.2; }
      } else if (state === 'outTwist') {
        // quiet; something under the seat; a look up into the mirror; it rises between the seats; it comes
        const T = (a) => st >= a && st0 < a;          // (did st just pass a)
        if (st < 2.6) { want.yaw = -0.1; want.pitch = -0.1; }
        if (T(0.8)) sfx.seatRustle();
        if (T(1.9)) { ui.subtitle('나', '...?'); sfx.mumble(0.4); }
        if (T(2.6)) { ui.subtitle(null); thing.visible = true; mirror.visible = true; thing.position.set(0.02, 0.95, 1.14); thing.rotation.set(0.15, 0.5, 0); }
        if (st >= 2.6) {
          want.yaw = -0.58; want.pitch = 0.4;                                            // up into the mirror
          camera.fov += (22 - camera.fov) * Math.min(1, dt * 1.6); camera.updateProjectionMatrix();
          const up = ease((st - 3.2) / 1.4);
          if (st < 5.0) thing.position.y = 0.95 + 0.37 * up;
          eyeMat.emissiveIntensity = st > 3.9 && st < 4.02 ? 0 : 1.3 * ease((st - 3.4) / 0.6);   // (a blink)
          glim.intensity = 0.25 * up;
        }
        if (T(4.2)) sfx.clicks(8, 0.25);
        if (T(5.0)) sfx.lunge();
        if (st >= 5.0 && st < 5.2) { const k = (st - 5.0) / 0.18; thing.position.lerpVectors(new V3(0.02, 1.32, 1.14), new V3(0.3, 1.45, 1.3), Math.min(1, k)); want.yaw = -0.58 + (Math.random() - 0.5) * 0.1; }
        if (T(5.18)) { fadeK = 1; sfx.engine(false); }
        if (st >= 5.18) fadeK = 1;
        if (st >= 6.8) { api.stop(); finish(); return; }
      } else if (state === 'out') {                       // skipped: a quick fade, then on
        fadeK = Math.min(1, fadeK + dt / 0.35);
        if (fadeK >= 1) { api.stop(); finish(); return; }
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
