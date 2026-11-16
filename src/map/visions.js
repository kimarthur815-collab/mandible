import * as THREE from 'three';
import { sleeveMaterial, tyvekTextures } from '../hands/materials.js';

// Things that may not be there. Rare, one-off scares that never hurt you:
//  · a whisper on the radio, '...뒤에...', and something small scurries behind you
//  · a protective suit stood up like a person, somewhere else each time you look back for it
//  · a tall figure at the end of your beam, there only while the flashlight stutters
const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);

// where the suit stands, in the order it turns up (each one facing the way you'd come)
const DUMMY = [
  { x: 1.5, z: 30.9, yaw: Math.PI },          // warehouse, the far end of the middle aisle
  { x: 21.0, z: 19.0, yaw: -Math.PI / 2 - 0.5 }, // machine room, the corner by the corridor door
  { x: 19.5, z: 44.6, yaw: Math.PI },          // the corridor's far end
  { x: 22.9, z: 47.4, yaw: -Math.PI / 2 - 0.6 }, // the hall, just past its door
  { x: -19.0, z: 63.0, yaw: Math.PI / 2 + 0.6 }, // the lab's back corner
];

function suit() {
  const g = new THREE.Group();
  const tyvek = sleeveMaterial(tyvekTextures(256, 33));
  const rubber = new THREE.MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.75 });
  const glove = new THREE.MeshPhysicalMaterial({ color: 0x1d48d4, roughness: 0.45, clearcoat: 0.3 });
  const add = (geo, mat, x, y, z, sx = 1, sy = 1, sz = 1) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.scale.set(sx, sy, sz); m.castShadow = true; g.add(m); return m; };
  add(new THREE.CapsuleGeometry(0.19, 0.5, 6, 14), tyvek, 0, 1.18, 0, 1.05, 1, 0.75);       // body
  add(new THREE.SphereGeometry(0.125, 20, 14), tyvek, 0, 1.68, 0, 1, 1.12, 1);              // hood
  add(new THREE.SphereGeometry(0.07, 16, 12), rubber, 0, 1.64, 0.09, 1, 0.9, 0.7);           // respirator
  const filt = new THREE.MeshStandardMaterial({ color: 0x8a2a5a, roughness: 0.6 });
  for (const s of [-1, 1]) { const f = add(new THREE.CylinderGeometry(0.034, 0.034, 0.026, 14), filt, s * 0.065, 1.61, 0.12); f.rotation.set(Math.PI / 2, 0, s * 0.6); }
  add(new THREE.SphereGeometry(0.05, 14, 10), new THREE.MeshPhysicalMaterial({ color: 0x1a2026, roughness: 0.1, clearcoat: 1 }), 0, 1.72, 0.1, 1.1, 0.6, 0.4);   // the eye piece
  for (const s of [-1, 1]) {
    add(new THREE.CylinderGeometry(0.06, 0.05, 0.62, 12), tyvek, s * 0.26, 1.17, 0.02).rotation.z = s * 0.06;   // arms hanging
    add(new THREE.SphereGeometry(0.05, 12, 10), glove, s * 0.28, 0.83, 0.03, 0.9, 1.3, 0.8);
    add(new THREE.CylinderGeometry(0.085, 0.075, 0.78, 12), tyvek, s * 0.1, 0.45, 0);         // legs
    add(new THREE.BoxGeometry(0.11, 0.09, 0.26), rubber, s * 0.1, 0.045, 0.04);               // boots
  }
  return g;
}

// a tall, thin figure: drawn black, soft at the edges
function figureTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 384;
  const x = c.getContext('2d');
  x.fillStyle = '#000'; x.filter = 'blur(2px)';
  x.beginPath(); x.ellipse(64, 46, 17, 23, 0, 0, 6.29); x.fill();                     // head
  x.beginPath(); x.moveTo(56, 64); x.lineTo(72, 64); x.lineTo(98, 96); x.lineTo(90, 210); x.lineTo(80, 380); x.lineTo(68, 380); x.lineTo(64, 230);
  x.lineTo(60, 380); x.lineTo(48, 380); x.lineTo(38, 210); x.lineTo(30, 96); x.closePath(); x.fill();   // body and legs
  x.lineWidth = 9; x.lineCap = 'round'; x.strokeStyle = '#000';
  x.beginPath(); x.moveTo(32, 96); x.quadraticCurveTo(18, 190, 22, 286); x.stroke();     // arms, too long
  x.beginPath(); x.moveTo(96, 96); x.quadraticCurveTo(112, 190, 104, 292); x.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// opts: { canSee(p), levelMeshes, colliders }
export function createVisions(scene, { canSee, levelMeshes, colliders }) {
  const dummy = suit(); dummy.visible = false; scene.add(dummy);
  const col = { x0: 0, x1: 0, z0: 0, z1: 0, off: true }; colliders.push(col);     // you can't walk through it
  const fig = new THREE.Mesh(new THREE.PlaneGeometry(0.75, 2.25), new THREE.MeshBasicMaterial({ map: figureTexture(), transparent: true, depthWrite: false, color: 0x000000, opacity: 0.92 }));
  fig.visible = false; scene.add(fig);
  const ray = new THREE.Raycaster(), tmp = new V3(), ndc = new V3();
  const S = {};
  const reset = () => Object.assign(S, {
    dIdx: -1, dSeen: false, dLastMove: -99, dNear: false, dTimes: 0,
    whisperT: rnd(90, 150), whispers: 0, behindT: -1,
    figT: rnd(70, 130), figs: 0, flickT: 0,
  });
  reset();
  function inView(cam, p, maxD) {
    const d = p.distanceTo(cam.position);
    if (d > maxD) return false;
    ndc.copy(p).project(cam);
    if (ndc.z > 1 || Math.abs(ndc.x) > 1.05 || Math.abs(ndc.y) > 1.05) return false;
    return canSee(p);
  }
  function placeDummy(i) {
    const s = DUMMY[i];
    dummy.position.set(s.x, 0, s.z); dummy.rotation.y = s.yaw; dummy.visible = true;
    Object.assign(col, { x0: s.x - 0.25, x1: s.x + 0.25, z0: s.z - 0.25, z1: s.z + 0.25, off: false });
    S.dIdx = i; S.dSeen = false;
  }
  return {
    reset() { reset(); dummy.visible = false; fig.visible = false; col.off = true; },
    get state() { return S; }, dummy, fig,
    // ctx: { dt, t, cam, fwd, flashOn, calm, gens, live, voiceBusy, onWhisper(), onBehind(x, z), tip(text, key), look(p) }
    // returns a multiplier for the flashlight (it stutters while the figure is there)
    update(ctx) {
      const { dt, cam } = ctx;
      if (!ctx.live) { fig.visible = false; return 1; }
      // ---- the suit: shows up once you're in, moves on when neither where it is nor where it's going is in sight
      if (S.dIdx < 0) placeDummy(0);
      if (dummy.visible) {
        const head = tmp.set(dummy.position.x, 1.5, dummy.position.z);
        const seen = inView(cam, head, 16);
        const near = Math.hypot(cam.position.x - dummy.position.x, cam.position.z - dummy.position.z) < 2.6;
        if (seen && !S.dSeen) {
          S.dSeen = true; S.dTimes++;
          if (S.dTimes === 1) ctx.tip('...방역복? 저기 누가 서 있다', 'dummy1');
          else if (S.dTimes === 2) ctx.tip('아까... 저건 다른 데 있지 않았나?', 'dummy2');
          else if (S.dTimes === 3) ctx.tip('...따라오고 있어', 'dummy3');
        }
        if (near && !S.dNear) { S.dNear = true; ctx.tip('...빈 방역복이다. 누가 세워 둔 거지?', 'dummyNear'); }
        // on to the next spot, unseen (and not too often)
        if (S.dSeen && !seen && ctx.t - S.dLastMove > 18) {
          const n = S.dIdx + 1;
          if (n >= DUMMY.length) { if (Math.hypot(cam.position.x - dummy.position.x, cam.position.z - dummy.position.z) > 8) { dummy.visible = false; col.off = true; } }
          else {
            const p = tmp.set(DUMMY[n].x, 1.5, DUMMY[n].z);
            const far = Math.hypot(cam.position.x - p.x, cam.position.z - p.z) > 7;
            if (far && !inView(cam, p, 30)) { placeDummy(n); S.dLastMove = ctx.t; S.dNear = false; }
          }
        }
      }
      // ---- the whisper
      if (ctx.calm && ctx.gens >= 1 && S.whispers < 2 && !ctx.voiceBusy) {
        S.whisperT -= dt;
        if (S.whisperT <= 0) {
          S.whispers++; S.whisperT = rnd(120, 200);
          ctx.onWhisper();
          S.behindT = 1.6;
        }
      }
      if (S.behindT > 0 && (S.behindT -= dt) <= 0) {
        const f = ctx.fwd, b = tmp.set(cam.position.x - f.x * 2.4, 0, cam.position.z - f.z * 2.4);
        ctx.onBehind(b.x, b.z);
        if (S.whispers === 1) setTimeout(() => ctx.tip('...방금 무전에서 뭐라고 했지?', 'whisper'), 2600);
      }
      // ---- the figure in the beam: needs a long clear stretch ahead, and the light on
      let flick = 1;
      if (S.flickT > 0) {
        S.flickT -= dt;
        const on = Math.sin(ctx.t * 70) > -0.1 && Math.random() > 0.15;
        flick = on ? 1 : 0.08;
        fig.visible = on && S.flickT > 0.12;
        fig.quaternion.copy(cam.quaternion);
        if (S.flickT <= 0) { fig.visible = false; ctx.tip('...방금 저기 뭐가 있었나?', 'figure'); }
      } else if (ctx.calm && ctx.flashOn && ctx.gens >= 1 && S.figs < 2) {
        S.figT -= dt;
        if (S.figT <= 0) {
          const f = ctx.fwd;
          ray.set(cam.position, tmp.set(f.x, 0, f.z).normalize()); ray.far = 30;
          const hit = ray.intersectObjects(levelMeshes, false)[0];
          if (!hit || hit.distance > 10) {
            const d = 7.5, dir = tmp.set(f.x, 0, f.z).normalize();
            fig.position.set(cam.position.x + dir.x * d, 1.12, cam.position.z + dir.z * d);
            S.flickT = 0.95; S.figs++; S.figT = rnd(90, 160);
          } else S.figT = 4;      // try again in a bit
        }
      }
      return flick;
    },
  };
}
