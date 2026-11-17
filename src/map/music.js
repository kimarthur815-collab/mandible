// Background music, synthesised like the rest of the sound (no audio files).
//  dusk   — the title drive at sunset: warm, a little lonely; a shadow at the end of every turn round
//  night  — parked in the dark yard: crickets, wind, a low drone and glassy swells
//  inside — the factory: a machine somewhere in the building beating in 7/8 (3+2+2) over a low hum, a cold
//           vibraphone tune on top; as the night goes on it comes closer (clanks, steam, ticking, a low braam)
//  end    — the drive home: the dusk tune again, slower and darker
// The chase music lives in audio.js; while it plays this steps back.

const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rnd = (a, b) => a + Math.random() * (b - a);
const pick = (a) => a[Math.floor(Math.random() * a.length)];

// the drive: one chord a bar, [bass, voicing...]
const DUSK = [
  [41, 57, 60, 64, 67],   // Fmaj9
  [43, 59, 62, 64, 69],   // G6/9
  [40, 55, 59, 62, 67],   // Em7
  [45, 55, 59, 60, 64],   // Am9
  [38, 53, 57, 60, 64],   // Dm9
  [43, 53, 57, 60, 64],   // G11
  [36, 52, 55, 59, 62],   // Cmaj9
  [40, 56, 59, 62, 65],   // E7(b9): the shadow before it comes round again
];
// the tune, in eighths: [bar, eighth, note, length]
const TUNE = [
  [0, 0, 69, 3], [0, 3, 67, 1], [0, 4, 64, 4],
  [1, 0, 62, 2], [1, 2, 64, 2], [1, 4, 67, 4],
  [2, 0, 71, 3], [2, 3, 69, 1], [2, 4, 67, 2], [2, 6, 64, 2],
  [3, 0, 64, 8],
  [4, 0, 65, 3], [4, 3, 64, 1], [4, 4, 62, 2], [4, 6, 69, 2],
  [5, 0, 67, 6], [5, 6, 65, 1], [5, 7, 64, 1],
  [6, 0, 64, 2], [6, 2, 62, 2], [6, 4, 60, 4],
  [7, 0, 71, 4], [7, 4, 68, 4],
];
// inside: the vibraphone tune, in eighths, locked to the machine's 3+2+2: [bar of 8, eighth, note, length]
const MOTIF = [
  [0, 0, 74, 3], [0, 3, 69, 2], [0, 5, 70, 2], [1, 0, 73, 7],
  [4, 0, 77, 3], [4, 3, 76, 2], [4, 5, 74, 2], [5, 0, 69, 7],
];

export class Music {
  constructor(snd) {
    this.s = snd;
    const ctx = this.ctx = snd.ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0.9;
    this.out.connect(snd.master);
    const send = ctx.createGain(); send.gain.value = 0.55;
    this.out.connect(send); send.connect(snd.revIn);
    this.bus = {}; this.lvl = {};
    for (const k of ['dusk', 'night', 'inside']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.out);
      this.bus[k] = g; this.lvl[k] = 0;
    }
    this.mode = 'off';
    this.dq = { next: 0, i: 0, pass: 0 };
    this.nq = { next: 0, crick: [0, 0, 0], glass: 0 };
    this.iq = { t: 0, bar: 0, T: -1 };
    this.tension = 0.2;
    this.built = {};
  }

  // ------------------------------------------------------------ instruments
  at(when) { return Math.max(0, when - this.ctx.currentTime); }
  pan(node, p, dest) {
    if (this.ctx.createStereoPanner && p) { const sp = this.ctx.createStereoPanner(); sp.pan.value = p; node.connect(sp); sp.connect(dest); }
    else node.connect(dest);
  }
  // soft string pad: two detuned saws a note, one filter sweeping open and closing again
  pad(when, notes, dur, dest, { cut = 1100, gain = 0.03, attack = 1.0, rel = 1.8, spread = 0.7 } = {}) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 0.5;
    lp.frequency.setValueAtTime(cut * 0.55, when); lp.frequency.linearRampToValueAtTime(cut, when + dur * 0.6); lp.frequency.linearRampToValueAtTime(cut * 0.7, when + dur + rel);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + attack); g.gain.setValueAtTime(gain, when + dur); g.gain.linearRampToValueAtTime(0, when + dur + rel);
    lp.connect(g); g.connect(dest);
    notes.forEach((m, i) => {
      for (const d of [-7, 6]) {
        const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d + rnd(-2, 2);
        this.pan(o, ((i + 0.5) / notes.length - 0.5) * spread * (d < 0 ? 1 : -1), lp);
        o.start(when); o.stop(when + dur + rel + 0.05);
      }
    });
  }
  // electric piano: a sine carrier, a sine modulator whose bite dies away, and a faint tine
  ep(when, m, dur, dest, { vel = 1, pan = 0, ratio = 1, bite = 1.6, decay = 1.1 } = {}) {
    const ctx = this.ctx, f = mtof(m);
    const car = ctx.createOscillator(); car.frequency.value = f;
    const mod = ctx.createOscillator(); mod.frequency.value = f * ratio;
    const mg = ctx.createGain();
    mg.gain.setValueAtTime(f * bite * vel, when); mg.gain.exponentialRampToValueAtTime(f * 0.08 + 1, when + decay);
    mod.connect(mg); mg.connect(car.frequency);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(0.13 * vel, when + 0.006);
    g.gain.setTargetAtTime(0.05 * vel, when + 0.01, 0.35); g.gain.setTargetAtTime(0, when + dur, 0.4);
    car.connect(g); this.pan(g, pan, dest);
    const tine = ctx.createOscillator(); tine.frequency.value = f * 7.1;
    const tg = ctx.createGain(); tg.gain.setValueAtTime(0.012 * vel, when); tg.gain.exponentialRampToValueAtTime(0.0001, when + 0.12);
    tine.connect(tg); this.pan(tg, pan, dest);
    for (const o of [car, mod, tine]) { o.start(when); o.stop(when + dur + 2.2); }
  }
  // a bowed note: saws through a dark filter, slow in and out, a little vibrato
  bow(when, m, dur, dest, { gain = 0.03, cut = 700, attack = 2, rel = 3, pan = 0 } = {}) {
    const ctx = this.ctx;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut; lp.Q.value = 0.7;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + attack); g.gain.setValueAtTime(gain, when + dur); g.gain.linearRampToValueAtTime(0, when + dur + rel);
    lp.connect(g); this.pan(g, pan, dest);
    const vib = ctx.createOscillator(); vib.frequency.value = rnd(4.5, 5.5);
    const vg = ctx.createGain(); vg.gain.value = mtof(m) * 0.004; vib.connect(vg);
    for (const d of [-5, 5]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = d;
      vg.connect(o.frequency); o.connect(lp); o.start(when); o.stop(when + dur + rel + 0.05);
    }
    vib.start(when); vib.stop(when + dur + rel + 0.05);
  }
  // bowed metal / glass: a few inharmonic partials swelling up and fading, a slow beat between two of them
  metal(when, f, dest, { gain = 0.02, up = 1.6, down = 4, pan = 0, parts = [1, 1.004, 2.76, 5.4] } = {}) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + up); g.gain.exponentialRampToValueAtTime(0.0001, when + up + down);
    this.pan(g, pan, dest);
    parts.forEach((r, i) => {
      const o = ctx.createOscillator(); o.frequency.value = f * r;
      const og = ctx.createGain(); og.gain.value = 1 / (1 + i * 1.6); o.connect(og); og.connect(g);
      o.start(when); o.stop(when + up + down + 0.1);
    });
  }
  hit(when, dest, f0, f1, dur, gain, type = 'sine', pan = 0) { this.s.tone({ dest, t: this.at(when), f0, f1, dur, gain, type, attack: 0.004, pan }); }
  noise(when, dest, o) { this.s.burst({ dest, t: this.at(when), ...o }); }

  // ------------------------------------------------------------ dusk (and the drive home)
  duskTo(until, dest, home) {
    const q = this.dq, e8 = 60 / (home ? 64 : 74) / 2;
    while (q.next < until) {
      const t = q.next, bar = Math.floor(q.i / 8), e = q.i % 8, ch = DUSK[bar], tune = q.pass % 2 === 0;
      const cut = home ? 650 : 1150;
      if (e === 0) {
        this.pad(t, ch.slice(1), e8 * 8, dest, { cut, gain: home ? 0.026 : 0.03 });
        this.hit(t, dest, mtof(ch[0]), mtof(ch[0]) * 0.995, e8 * 5, 0.22, 'triangle');
      }
      if (e === 5) this.hit(t, dest, mtof(ch[0] + 12), mtof(ch[0] + 12) * 0.995, e8 * 2.5, 0.09, 'triangle');
      if (tune) { for (const n of TUNE) if (n[0] === bar && n[1] === e) this.ep(t, n[2], e8 * n[3], dest, { vel: home ? 0.75 : 0.95, pan: -0.1 }); }
      else if (e % 2 === 0 || Math.random() < 0.3) {
        // in between: a few chord notes falling from above
        if (Math.random() < 0.55) this.ep(t, pick(ch.slice(1)) + 12, e8 * 2, dest, { vel: rnd(0.35, 0.6), pan: rnd(-0.5, 0.5), bite: 1.1 });
      }
      // the road: a soft shaker
      if (!home) this.noise(t, dest, { dur: 0.05, f: 7200, q: 0.9, type: 'bandpass', gain: e % 2 ? 0.018 : 0.03, attack: 0.008 });
      q.next += e8 * (e % 2 ? 0.93 : 1.07);           // laid back
      q.i = (q.i + 1) % 64; if (q.i === 0) q.pass++;
    }
  }

  // ------------------------------------------------------------ night yard
  buildNight() {
    const ctx = this.ctx, dest = this.bus.night;
    // a low drone that beats slowly against itself
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260;
    const dg = ctx.createGain(); dg.gain.value = 0.065; lp.connect(dg); dg.connect(dest);
    for (const [f, type, gn] of [[73.42, 'sawtooth', 0.35], [73.7, 'sawtooth', 0.35], [55, 'sine', 0.8], [110.2, 'triangle', 0.12]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f; const g = ctx.createGain(); g.gain.value = gn; o.connect(g); g.connect(lp); o.start();
    }
    // wind in the trees
    const w = this.s.loop(this.s.brown, dest, 0.045);
    const wf = ctx.createBiquadFilter(); wf.type = 'bandpass'; wf.frequency.value = 500; wf.Q.value = 0.6;
    w.s.disconnect(); w.s.connect(wf); wf.connect(w.g);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.07; const lg = ctx.createGain(); lg.gain.value = 260; lfo.connect(lg); lg.connect(wf.frequency); lfo.start();
    const lfo2 = ctx.createOscillator(); lfo2.frequency.value = 0.11; const lg2 = ctx.createGain(); lg2.gain.value = 0.025; lfo2.connect(lg2); lg2.connect(w.g.gain); lfo2.start();
  }
  nightTo(until, dest) {
    const q = this.nq;
    // crickets: short trains of chirps, each from its own spot
    q.crick.forEach((tn, k) => {
      while (tn < until) {
        const f = 4300 + k * 260, pan = [-0.7, 0.55, 0.1][k], n = 3 + Math.floor(Math.random() * 2);
        for (let j = 0; j < n; j++) this.hit(tn + j * 0.045, dest, f, f * 0.98, 0.022, 0.035 * (k === 2 ? 0.5 : 1), 'sine', pan);
        tn += rnd(0.55, 1.0) * (k === 2 ? 1.6 : 1);
      }
      q.crick[k] = tn;
    });
    while (q.glass < until) {
      const t = q.glass;
      const f = pick([587.3, 622.3, 830.6, 880, 932.3]);
      this.metal(t, f, dest, { gain: 0.016, up: 2.2, down: 4.5, pan: rnd(-0.8, 0.8), parts: [1, 1.0045, 2.01] });
      if (Math.random() < 0.35) this.hit(t + 1.5, dest, 49, 30, 2.2, 0.18);        // something heavy, far off
      q.glass += rnd(5, 9);
    }
  }

  // ------------------------------------------------------------ inside the factory
  // vibraphone: a sine with its 4th partial, a motor tremolo
  vib(when, m, dur, dest, { vel = 1, pan = 0, trem = 0.5 } = {}) {
    const ctx = this.ctx, f = mtof(m);
    const am = ctx.createGain(); am.gain.value = 1 - trem / 2; this.pan(am, pan, dest);
    const lfo = ctx.createOscillator(); lfo.frequency.value = 4.6; const lg = ctx.createGain(); lg.gain.value = trem / 2;
    lfo.connect(lg); lg.connect(am.gain); lfo.start(when); lfo.stop(when + dur + 0.1);
    for (const [r, g, dk] of [[1, 0.075, dur], [4.0, 0.02, 0.3], [1.003, 0.02, dur * 0.8]]) {
      const o = ctx.createOscillator(); o.frequency.value = f * r;
      const e = ctx.createGain(); e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(g * vel, when + 0.004); e.gain.exponentialRampToValueAtTime(0.0001, when + 0.004 + dk);
      o.connect(e); e.connect(am); o.start(when); o.stop(when + dk + 0.05);
    }
    this.noise(when, am, { dur: 0.012, f: 2200, q: 2, gain: 0.012 * vel });
  }
  // a short plucked string: two saws through a filter that closes after the bite
  pluck(when, m, dur, dest, { gain = 0.03, cut = 600, pan = 0, res = 1 } = {}) {
    const ctx = this.ctx, f = mtof(m);
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = res;
    lp.frequency.setValueAtTime(cut * 3, when); lp.frequency.exponentialRampToValueAtTime(cut, when + 0.15);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(gain, when + 0.008);
    g.gain.setTargetAtTime(gain * 0.45, when + 0.01, Math.max(0.03, dur * 0.4)); g.gain.setTargetAtTime(0, when + dur, 0.05);
    lp.connect(g); this.pan(g, pan, dest);
    for (const d of [-6, 6]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      o.connect(lp); o.start(when); o.stop(when + dur + 0.4);
    }
  }
  // struck metal: a few inharmonic partials ringing out, the knock of the hit
  clank(when, dest, { f = 380, gain = 0.03, pan = 0 } = {}) {
    const ctx = this.ctx, out = ctx.createGain(); out.gain.value = gain; this.pan(out, pan, dest);
    for (const [r, g, dk] of [[1, 1, 0.7], [2.76, 0.6, 0.4], [5.4, 0.4, 0.25], [8.93, 0.25, 0.14]]) {
      const o = ctx.createOscillator(); o.frequency.value = f * r * rnd(0.995, 1.005);
      const e = ctx.createGain(); e.gain.setValueAtTime(0, when); e.gain.linearRampToValueAtTime(g, when + 0.002); e.gain.exponentialRampToValueAtTime(0.0001, when + 0.002 + dk);
      o.connect(e); e.connect(out); o.start(when); o.stop(when + dk + 0.05);
    }
    this.noise(when, out, { dur: 0.03, f: 2400, q: 1.5, gain: 0.8 });
  }
  buildInside() {
    const ctx = this.ctx;
    this.iDest = ctx.createGain(); this.iDest.gain.value = 0.85; this.iDest.connect(this.bus.inside);
    // everything the machine does goes through this: far away (muffled) early on, right here later
    const dist = this.iDist = ctx.createBiquadFilter(); dist.type = 'lowpass'; dist.frequency.value = 280; dist.Q.value = 0.7; dist.connect(this.iDest);
    // its hum, on D
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 150;
    const hum = this.iHum = ctx.createGain(); hum.gain.value = 0.02; lp.connect(hum); hum.connect(this.iDest);
    for (const [f, type, a] of [[36.71, 'sawtooth', 0.6], [73.42, 'sine', 0.5]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = a; o.connect(og); og.connect(lp); o.start();
    }
  }
  insideTo(until) {
    const q = this.iq, T = this.tension, now = this.ctx.currentTime, dest = this.iDest, P = this.iDist;
    if (Math.abs(T - q.T) > 0.01) {
      q.T = T;
      P.frequency.setTargetAtTime(260 + Math.pow(T, 1.6) * 5200, now, 1.5);
      this.iHum.gain.setTargetAtTime(0.02 + T * 0.03, now, 2);
    }
    while (q.t < until) {
      const e = 60 / (92 + 18 * T) / 2, t = q.t, bar = q.bar % 8, cyc = Math.floor(q.bar / 8);
      // the pistons: heavy on 1, lighter on the 2s
      this.hit(t, P, 72, 36, 0.45, 0.32 + 0.12 * T);
      this.noise(t, P, { dur: 0.14, f: 180, q: 0.8, type: 'lowpass', gain: 0.22, buf: this.s.brown });
      this.hit(t + 3 * e, P, 64, 36, 0.3, 0.2 + 0.08 * T);
      this.hit(t + 5 * e, P, 64, 36, 0.3, 0.17 + 0.08 * T);
      if (T > 0.25) this.clank(t + (bar % 2 ? 4 : 2) * e, P, { f: bar % 2 ? 410 : 340, gain: 0.03 + (T - 0.25) * 0.06, pan: bar % 2 ? 0.4 : -0.4 });
      if (T > 0.45) this.noise(t + 6 * e, P, { dur: 0.22, f: 4500, q: 0.7, type: 'highpass', gain: 0.03 + (T - 0.45) * 0.08, attack: 0.06 });
      if (T > 0.65) { const n = T > 0.82 ? 14 : 7; for (let i = 0; i < n; i++) this.noise(t + i * (7 * e / n), P, { dur: 0.008, f: 6500, q: 5, gain: (i % (n / 7 * 3) === 0 ? 0.03 : 0.015) * (T - 0.4), attack: 0.001, pan: 0.3 }); }
      // the bass under it: D D Eb, and every fourth bar D C C# back home
      const BS = bar % 4 === 3 ? [[0, 38, 3], [3, 36, 2], [5, 37, 2]] : [[0, 38, 3], [3, 38, 2], [5, 39, 2]];
      for (const [k, m, len] of BS) this.pluck(t + k * e, m, len * e * 0.85, dest, { gain: 0.04 + T * 0.035, cut: 150 + T * 450, res: 2 });
      // the tune, every other time round early on, every time later; an octave above it, then a wrong ghost of it
      if (cyc % 2 === 0 || T > 0.45) {
        for (const [bb, k, m, len] of MOTIF) if (bb === bar) {
          this.vib(t + k * e, m, Math.max(1.6, len * e * 1.6), dest, { vel: 0.9, pan: -0.15 });
          if (T > 0.6) this.vib(t + k * e + 0.01, m + 12, len * e * 1.4, dest, { vel: 0.35 + (T - 0.6), pan: 0.3, trem: 0.7 });
          if (T > 0.8) this.vib(t + k * e + e, m + 13, len * e, dest, { vel: 0.3, pan: 0.6 });
        }
      }
      // a low braam at the top of the cycle, late on
      if (bar === 0 && T > 0.7) this.pad(t, [26, 38, 45], 7 * e * 1.6, dest, { cut: 650, gain: 0.03 + (T - 0.7) * 0.08, attack: 0.5, rel: 2.5 });
      q.t += 7 * e; q.bar++;
    }
  }

  // ------------------------------------------------------------ control
  // mode: 'dusk' | 'night' | 'inside' | 'end' | 'off'; o: { tension 0..1, duck 0..1 }
  update(mode, o = {}) {
    const ctx = this.ctx, now = ctx.currentTime;
    if (mode !== this.mode) {
      const from = this.mode; this.mode = mode;
      if ((mode === 'dusk' || mode === 'end') && from !== 'dusk' && from !== 'end') { this.dq.next = now + 0.1; this.dq.i = 0; }
      if (mode === 'night' && !this.built.night) { this.built.night = true; this.buildNight(); }
      if (mode === 'night') { this.nq.crick = [now + 0.5, now + 1.3, now + 2.4]; this.nq.glass = now + 2; }
      if (mode === 'inside' && !this.built.inside) { this.built.inside = true; this.buildInside(); }
      if (mode === 'inside' && from !== 'inside') this.iq.t = now + 0.4;
    }
    this.tension += ((o.tension ?? this.tension) - this.tension) * 0.02;
    const duck = o.duck ?? 1;
    const want = { dusk: mode === 'dusk' || mode === 'end' ? 0.85 * duck : 0, night: mode === 'night' ? 0.9 : 0, inside: mode === 'inside' ? 0.85 * duck : 0 };
    for (const k in this.bus) {
      const tc = want[k] > this.lvl[k] ? 1.2 : 0.9;
      this.bus[k].gain.setTargetAtTime(want[k], now, tc);
      // follow the fade in JS too, so a part stops making notes once it can't be heard
      this.lvl[k] += (want[k] - this.lvl[k]) * Math.min(1, (o.dt || 0.016) / tc);
    }
    // after a stall (a hidden tab) skip what was missed rather than play it all at once
    const late = now - 0.3, q = this.iq, nq = this.nq;
    if (this.dq.next < late) this.dq.next = now;
    if (q.t < late) q.t = now + 0.1;
    nq.crick = nq.crick.map((v) => (v < late ? now + rnd(0, 0.5) : v)); if (nq.glass < late) nq.glass = now + 1;
    const until = now + 0.35;
    if (want.dusk > 0 || this.lvl.dusk > 0.01) this.duskTo(until, this.bus.dusk, mode === 'end');
    if (want.night > 0 || this.lvl.night > 0.01) this.nightTo(until, this.bus.night);
    if (want.inside > 0 || this.lvl.inside > 0.01) this.insideTo(until);
  }
}
