// The posed hands shared by the viewer and the game: grips on the flashlight and the spray can,
// and the right hand's flashlight poses. Hand-frame placements are in camera space for a 54-degree
// vertical field of view (the game draws the arms with their own camera at that angle).
import * as THREE from 'three';
import { frameQ } from './handmodel.js';
import { flashSDF, canSDF } from './props.js';

const V3 = THREE.Vector3, Q = THREE.Quaternion;
export const VM_FOV = 54;

// ------------------------------------------------------------------ grips (hand-frame placements)
// right hand power grip on the flashlight: the barrel runs obliquely across the palm, head out
// past the thumb and index finger
export const GRIP = {
  axis: new V3(-0.87, 0, -0.5).normalize(),        // tail -> lens, in the right hand's frame (30 degrees: the barrel lies under all four fingers)
  at: new V3(0.004, -0.029, -0.074),              // barrel axis point, snug under the palm at the fingers' base
  zf: -0.03,                                       // where on the flashlight (its own z) that point is
};
export function gripFrame(mir, axisZ, at, zf) {
  // flashlight/can local -> hand frame
  const a = mir ? new V3(-axisZ.x, axisZ.y, axisZ.z) : axisZ.clone();
  const p = mir ? new V3(-at.x, at.y, at.z) : at.clone();
  const q = frameQ(new V3(0, 0, 1), new V3(0, 1, 0), a, new V3(0, 1, 0));
  const pos = p.clone().sub(new V3(0, 0, zf).applyQuaternion(q));
  return { q, pos, axis: a, at: p };
}

// ------------------------------------------------------------------ hand states
export function sdfIn(objQ, objPos, fn) {
  const iq = objQ.clone().invert();
  return (p) => fn(p.clone().sub(objPos).applyQuaternion(iq));
}
export function solveGrip(hand, objQ, objPos, fn, opt = {}) {
  const sdf = sdfIn(objQ, objPos, fn);
  const ang = [];
  const abd = opt.abd || [0.04, 0, -0.04, -0.1];
  for (let c = 0; c < 4; c++) {
    const t = Array.isArray(opt.tol) ? opt.tol[c] : (opt.tol ?? 0.0004);
    ang.push(hand.grasp(c, sdf, { abd: abd[c], start: opt.start || [0.15, 0.2, 0.1], tol: t, skip0: opt.skip0 ?? 0.45, ...(opt.rate ? { rate: opt.rate[c] } : {}) }));
  }
  const th = opt.thumb || {};
  // the thumb closes over the object, across the index and middle fingers
  const others = [...hand.capsules(0, ang[0]), ...hand.capsules(1, ang[1])];
  const tgt = th.target(objQ, objPos);
  ang.push(hand.thumbTo(tgt, sdf, { others, mcp: th.mcp ?? 0.4, ip: th.ip ?? 0.35 }));
  return ang;
}
export function presetAngles(kind) {
  if (kind === 'open') return [[0.06, 0.1, 0.06, 0.13, 0], [0.04, 0.08, 0.05, 0.02, 0], [0.06, 0.1, 0.06, -0.09, 0], [0.1, 0.12, 0.08, -0.2, 0], [0.05, 0.1, 0.05, 0.62, 0.25]];
  if (kind === 'relaxed') return [[0.12, 0.18, 0.1, -0.02, 0], [0.2, 0.28, 0.14, 0.0, 0], [0.26, 0.34, 0.18, 0.0, 0], [0.34, 0.4, 0.22, 0.02, 0], [0.25, 0.2, 0.15, 0.12, 0.35]];
  return null;
}


// thumb target: on the barrel's far side, a little toward the head, pressing over the index finger
export const barrelThumb = (zf, rr) => (q, pos) => {
  const axisP = new V3(0, 0, zf).applyQuaternion(q).add(pos);
  return axisP.addScaledVector(new V3(0, -1, 0), rr);
};

// the right hand on the flashlight: { fq, rightAng, holding(), off() } (wrist/elbow before NEAR scaling)
export function rightPoses(R) {
  const fq = gripFrame(false, GRIP.axis, GRIP.at, GRIP.zf);
  // the fingers close round the barrel until each part of them touches it
  // (fingers press in a little, as a gloved hand squeezing would, so there's no air between them and the barrel)
  // the ring and little fingers squeeze harder and close in toward the middle finger, like a real fist
  const rightAng = solveGrip(R, fq.q, fq.pos, flashSDF, {
    tol: [0.002, 0.002, 0.004, 0.005], skip0: 0.15, abd: [0.04, 0, 0.01, 0.0],
    // the knuckle joints close first (as a hand really grips), so each finger's first segment lies along
    // the barrel and there is no hollow under the ring and little fingers
    rate: [[1, 1.15, 0.85], [1.4, 1.0, 0.8], [1.7, 0.9, 0.7], [1.8, 0.9, 0.7]], thumb: { target: barrelThumb(GRIP.zf + 0.03, 0.0135 + 0.0105) } });
  // The right hand holds the flashlight like the reference photo: the back of the hand faces right,
  // the fingers wrap round the barrel toward you, the thumb is on top and the head stands up out of
  // the fist. The forearm comes up from the lower right and runs straight into the hand.
  const ARM_R = new V3(-0.02, -0.06, 1).normalize();          // where the forearm runs, in the hand's frame
  const FPS_R = new V3(0.9, -0.4, 0.15).normalize();       // the right arm comes in from the side, reaching forward
  const rightHand = (grip, long, back, lift = 0.14, maxTip = 40) => {
    const q0 = frameQ(new V3(0, 0, -1), new V3(0, 1, 0), long.clone().normalize(), back.clone().normalize());
    const wrist = grip.clone().sub(GRIP.at.clone().applyQuaternion(q0));
    // the forearm runs straight into the untipped hand
    const arm = forearmDir(q0, 1);
    // then the wrist tips down (toward the little finger) until the flashlight points ahead
    const axis = new V3(0, 1, 0).applyQuaternion(q0);
    let best = null;
    for (let d = 0; d <= maxTip; d += 1) for (const sg of [-1, 1]) {
      const q = new Q().setFromAxisAngle(axis, sg * THREE.MathUtils.degToRad(d)).multiply(q0);
      const beam = GRIP.axis.clone().applyQuaternion(q);
      const c = Math.abs(beam.y - lift) + (beam.z > 0 ? 2 : 0) + d * 0.002;
      if (!best || c < best.c) best = { c, q, d };
    }
    return { wrist, handQ: best.q, elbow: wrist.clone().addScaledVector(arm, 0.27), held: 'flash', ang: rightAng, tip: best.d };
  };
  const REACH = 1.3;
  const holding = () => rightHand(new V3(0.145, -0.175, -0.42).multiplyScalar(REACH), new V3(-0.08, -0.5, -1), new V3(0.95, 0.25, 0.25), -0.3, 30);
  const off = () => rightHand(new V3(0.15, -0.19, -0.415).multiplyScalar(REACH), new V3(-0.08, -0.6, -1), new V3(0.95, 0.25, 0.25), -0.4, 30);
  return { fq, rightAng, holding, off };
}

// where the forearm runs from the wrist (camera space) for a hand turned by handQ: its natural line,
// half swung toward the lower outside corner, then turned in toward the body with the elbow a little
// low. side 1 = right, -1 = left (mirrored).
export const INWARD = 0.45;
export function forearmDir(handQ, side) {
  const own = new V3(-0.02 * side, -0.06, 1).normalize().applyQuaternion(handQ);
  const out = new V3(0.9 * side, -0.4, 0.15).normalize();
  const arm = own.lerp(out, 0.5).normalize();
  arm.x -= INWARD * side; arm.y -= 0.2;
  return arm.normalize();
}

// the left hand's grip on the spray can
export function canGrip(L) {
  const cg = gripFrame(true, GRIP.axis, new V3(0.004, -0.0505, -0.066), 0.0);
  const canAng = solveGrip(L, cg.q, cg.pos, canSDF, { abd: [0.08, 0.0, -0.06, -0.14], start: [0.1, 0.15, 0.1], thumb: { target: barrelThumb(0.03, 0.0333 + 0.0105), mcp: 0.25, ip: 0.2 } });
  return { cg, canAng };
}

// pull a pose toward the eye a little (bigger on screen); the flashlight hand's elbow moves with it
export const NEAR = 0.9;
export function nearer(st) {
  const d = st.wrist.clone().multiplyScalar(NEAR - 1);
  st.wrist.add(d); st.elbow.add(d);
  return st;
}
