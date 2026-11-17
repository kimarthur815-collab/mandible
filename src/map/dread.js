import * as THREE from 'three';

// More of the dark. None of it hurts you:
//  · his voice: once you've heard Lee's tapes, his voice calls from the hall's vent ('...여기야...'); go up to
//    it and the cover rattles and something clicks behind it. Once the centipede is out, now and then it calls
//    in his voice from wherever it is (out of sight): follow it and it's what you find
//  · while you hide: something comes past right outside, stops beside you to sniff (its shadow crosses the
//    glow stick), goes on
//  · the flashlight stutters when something big is near, seen or not
//  · before the centipede is out: something heavy crawls over the ceiling above you, dust sifting down
const V3 = THREE.Vector3;
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

const VOICE_VENT = [['(환풍구 안에서)', '...3조... 여기야... 여기...', 3.0, 'lee_vent_1'], ['(환풍구 안에서)', '...도와줘... 다리가... 안 움직여...', 3.4, 'lee_vent_2']];
const VOICE_ROAM = [
  ['(어디선가)', '...3조... 이쪽이야...', 2.8, 'lee_roam_1'],
  ['(어디선가)', '...살려 줘... 여기... 여기 있어...', 3.2, 'lee_roam_2'],
  ['(어디선가)', '...셔터... 이쪽... 이쪽으로 와...', 3.2, 'lee_roam_3'],
];
export const DREAD_CLIPS = [...VOICE_VENT, ...VOICE_ROAM].map((l) => l[3]);   // (recordings of his voice, docs/voice)

export function createDread(scene, { sfx, voice, canSee }) {
  // ---- dust sifting down from the ceiling
  const N = 160, pos = new Float32Array(N * 3).fill(-100), vel = new Float32Array(N * 3), life = new Float32Array(N);
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const dustMat = new THREE.PointsMaterial({ color: 0x8c867a, size: 0.025, transparent: true, opacity: 0.7, depthWrite: false });
  const dust = new THREE.Points(geo, dustMat); dust.frustumCulled = false; scene.add(dust);
  let nextP = 0;
  const spawnDust = (x, y, z) => {
    const i = nextP; nextP = (nextP + 1) % N;
    pos[i * 3] = x + rnd(-0.5, 0.5); pos[i * 3 + 1] = y - rnd(0, 0.1); pos[i * 3 + 2] = z + rnd(-0.5, 0.5);
    vel[i * 3] = rnd(-0.05, 0.05); vel[i * 3 + 1] = -rnd(0.1, 0.4); vel[i * 3 + 2] = rnd(-0.05, 0.05); life[i] = rnd(3, 5);
  };
  const updateDust = (dt, lit) => {
    let any = false;
    for (let i = 0; i < N; i++) {
      if (life[i] <= 0) continue;
      any = true; life[i] -= dt;
      vel[i * 3 + 1] = Math.max(-0.9, vel[i * 3 + 1] - 0.25 * dt);
      for (let k = 0; k < 3; k++) pos[i * 3 + k] += vel[i * 3 + k] * dt;
      if (life[i] <= 0 || pos[i * 3 + 1] < 0.02) { life[i] = 0; pos[i * 3 + 1] = -100; }
    }
    if (any) geo.attributes.position.needsUpdate = true;
    dustMat.opacity = lit ? 0.75 : 0.25;         // (it only shows in the beam, really)
  };

  const q = {};
  const reset = () => {
    Object.assign(q, {
      pf: 0, pT: 0,                                          // flashlight: flicker left, time to the next
      oh: null, ohN: 0, ohCd: 0,                             // overhead
      pr: null, wasHidden: false, hideAt: 0, hideRolled: false, snCd: 0,   // outside the hiding place
      mv: null, mvDone: false, mrN: 0, mrCd: 40,             // his voice: at the vent, then roaming
    });
    for (let i = 0; i < N; i++) { life[i] = 0; pos[i * 3 + 1] = -100; }
    geo.attributes.position.needsUpdate = true;
  };
  reset();
  const at = (path, t) => {          // where something on a path [[t, x, y, z], ...] is at time t
    for (let i = 1; i < path.length; i++) if (t <= path[i][0] || i === path.length - 1) {
      const [t0, ...a] = path[i - 1], [t1, ...b] = path[i], k = Math.min(1, Math.max(0, (t - t0) / Math.max(0.001, t1 - t0)));
      return new V3(a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k);
    }
    return new V3(...path[0].slice(1));
  };
  let cover = null;
  const stopRattle = () => { if (cover) { cover.rotation.z = 0; cover = null; } };

  const api = {
    fl: 1, glowK: 1, shake: 0,
    reset() { stopRattle(); reset(); },
    // ctx: { dt, live, calm, hidden, hiddenT, hideIn (collider), glowAt ({x, z} | null), P (player pos), room,
    //        roomH, flashOn, centi, spiders, tapesHeard, leeDead, time }
    update(c) {
      const { dt, P } = c;
      api.fl = 1; api.glowK = 1; api.shake = 0;
      q.ohCd -= dt; q.snCd -= dt; q.mrCd -= dt;
      if (!c.live) { q.oh = null; q.pr = null; if (q.mv) { q.mv = null; q.mvDone = true; stopRattle(); } updateDust(dt, false); return api; }
      const busy = !!(q.oh || q.pr || q.mv);

      // ---- 5: something over the ceiling (while the centipede is still in the walls)
      if (!q.oh && !busy && c.centi.state === 'dormant' && q.ohN < 2 && c.time > 50 && q.ohCd <= 0 && c.calm && c.room && !voice.busy && Math.random() < dt / 30) {
        const a = Math.random() * Math.PI * 2, dx = Math.sin(a), dz = Math.cos(a), y = c.roomH - 0.2, dur = 5.5, pts = [];
        for (let i = 0; i <= 6; i++) { const k = i / 6, s = -9 + 18 * k; pts.push([k * dur, P.x + dx * s, y, P.z + dz * s]); }
        q.oh = { t: 0, dur, pts, y }; q.ohN++; q.ohCd = 120;
        sfx.overhead(pts);
      }
      let over = null;
      if (q.oh) {
        const o = q.oh; o.t += dt;
        over = at(o.pts, o.t);
        const dH = Math.hypot(over.x - P.x, over.z - P.z);
        if (dH < 3.5 && Math.random() < dt * 40) spawnDust(over.x, o.y, over.z);
        api.shake = Math.max(0, 1 - dH / 4) * 0.006;
        if (o.t > o.dur) { q.oh = null; if (!voice.busy) voice.say([['나', '...위에... 뭐가 지나갔어.', 2.2]]); }
      }

      // ---- 3: right outside where you hide
      if (c.hidden && !q.wasHidden) { q.hideAt = rnd(3.5, 6); q.hideRolled = false; }
      q.wasHidden = c.hidden;
      if (c.hidden && c.hideIn && !q.hideRolled && c.hiddenT > q.hideAt && !busy) {
        q.hideRolled = true;
        if (q.snCd <= 0 && Math.random() < 0.7) {
          // along the side of the hiding place with the glow stick (so its shadow crosses it), past you
          const h = c.hideIn, G = c.glowAt || P;
          const sides = [['x', h.x0 - 0.55, Math.abs(G.x - h.x0)], ['x', h.x1 + 0.55, Math.abs(G.x - h.x1)], ['z', h.z0 - 0.55, Math.abs(G.z - h.z0)], ['z', h.z1 + 0.55, Math.abs(G.z - h.z1)]];
          const [ax, v] = sides.sort((a, b) => a[2] - b[2])[0], s = Math.random() < 0.5 ? 1 : -1;
          const pt = (u) => (ax === 'x' ? [v, 0.15, P.z + u] : [P.x + u, 0.15, v]);
          const pts = [[0, ...pt(-3.5 * s)], [2.2, ...pt(0)], [3.8, ...pt(0.15 * s)], [6.0, ...pt(3.5 * s)]];
          q.pr = { t: 0, pts }; q.snCd = 45;
          sfx.prowlBy(pts, [2.2, 3.8]);
        }
      }
      if (q.pr) {
        const o = q.pr; o.t += dt;
        const w = at(o.pts, o.t);
        if (c.glowAt) { const d = Math.hypot(w.x - c.glowAt.x, w.z - c.glowAt.z); if (d < 1.1) api.glowK = 0.12 + 0.88 * (d / 1.1); }
        if (o.t > 6.2) q.pr = null;
      }

      // ---- 1: his voice
      const cen = c.centi;
      if (!q.mv && !q.mvDone && !busy && cen.state === 'dormant' && c.tapesHeard > 0 && c.room === 'hall' && c.calm && !voice.busy) {
        const V = cen.vent, d = Math.hypot(V.x - P.x, V.z - P.z);
        if (d > 5 && d < 16) { q.mv = { t: 0, stage: 1 }; voice.say([VOICE_VENT[0]], 'mimic', { x: V.x, y: V.y, z: V.z, muffle: true }); }
      }
      if (q.mv) {
        const m = q.mv, V = cen.vent; m.t += dt;
        const d = Math.hypot(V.x - P.x, V.z - P.z);
        if (cen.state !== 'dormant') { q.mv = null; q.mvDone = true; stopRattle(); }
        else if (m.stage < 3 && d < 3.2 && m.t > 1) {
          // you came: it stops. The cover rattles, something clicks and hisses behind it
          m.stage = 3; m.t = 0; voice.clear(); cover = cen.cover;
          sfx.clicks(10, 0.4); sfx.centiHiss(V.x, V.z); sfx.ductBang(V.x, V.y, V.z);
        } else if (m.stage === 1 && m.t > 7) { m.stage = 2; if (!voice.busy) voice.say([VOICE_VENT[1]], 'mimic', { x: V.x, y: V.y, z: V.z, muffle: true }); }
        else if (m.stage === 2 && m.t > 30) { q.mv = null; q.mvDone = true; }
        if (q.mv && m.stage === 3) {
          if (cover) cover.rotation.z = Math.sin(m.t * 55) * 0.05 * Math.max(0, 1 - m.t / 1.3);
          if (m.t > 1.4) {
            stopRattle(); q.mv = null; q.mvDone = true;
            voice.say([['나', c.leeDead ? '...이정훈 씨는... 저기 죽어 있었는데.' : '...방금 그건... 사람 목소리가 아니었어.', 2.8]]);
          }
        }
      }
      if (q.mrCd <= 0 && q.mrN < 3 && cen.state === 'patrol' && c.calm && !voice.busy && !busy) {
        const H = cen.head, hv = new V3(H.x, 0.6, H.z), d = Math.hypot(H.x - P.x, H.z - P.z);
        if (d > 9 && d < 24 && !canSee(hv)) {
          voice.say([pick(VOICE_ROAM)], 'mimic', { x: H.x, y: 0.6, z: H.z, muffle: false });
          q.mrN++; q.mrCd = rnd(70, 130);
        } else q.mrCd = 3;
      }

      // ---- 4: the flashlight stutters when something big is near
      let dn = 99;
      const near = (x, y, z) => { dn = Math.min(dn, Math.hypot(x - P.x, y - 1.6, z - P.z)); };
      for (const sp of c.spiders) if (!sp.grabbed) { const b = sp.s.bodyWorld; near(b.x, b.y, b.z); }
      if (cen.active) { const H = cen.head; near(H.x, 0.5, H.z); }
      if (over) near(over.x, over.y, over.z);
      const k = Math.max(0, Math.min(1, (10 - dn) / 7));
      if (c.flashOn && k > 0) {
        q.pT -= dt;
        if (q.pT <= 0) { q.pf = rnd(0.18, 0.4) * (0.6 + 0.6 * k); q.pT = (4.5 - 3.8 * k) * rnd(0.7, 1.3); sfx.flashCrackle(); }
      }
      if (q.pf > 0) { q.pf -= dt; api.fl = Math.random() < 0.5 ? rnd(0.05, 0.25) : rnd(0.6, 0.9); }

      updateDust(dt, c.flashOn);
      return api;
    },
  };
  return api;
}
