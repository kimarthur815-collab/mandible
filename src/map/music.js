// Background music, synthesised like the rest of the sound (no audio files).
//  dusk   — the title drive at sunset: warm, a little lonely; a shadow at the end of every turn round
//  night  — parked in the dark yard: crickets, wind, a low drone and glassy swells
//  inside — the factory: a machine somewhere in the building beating in 7/8 (3+2+2) over a low hum, a cold
//           vibraphone tune on top; as the night goes on it comes closer (clanks, steam, ticking, a low braam)
//  end    — the drive home: the dusk tune again, slower and darker
//  escape — the way out after the last generator, in phases: 'duct' (crawling: low tremolo strings, a hummed
//           choir, timpani swelling, a cello alone with the factory's tune), 'drop' (a timpani roll as you fall),
//           'run' (for the shutter: galloping 6/8 strings, timpani, a choir and a brass hymn), 'out' (the choir
//           lands on D major and rings on into the yard)
// The centipede's chase (centiStep, called from audio.js) is the factory's 7/8 machine running flat out,
// its tune in the brass.
// The chase music lives in audio.js; while it plays this steps back.

import { LoopSet } from './loops.js';
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
// the escape: [bass, chord] (Dm Bb Gm A), and the brass hymn over the run, in dotted quarters: [bar, half, note, halves]
const ESC_PROG = [[38, [62, 65, 69]], [34, [58, 62, 65]], [31, [55, 58, 62]], [33, [57, 61, 64]]];
const ESC_HYMN = [[0, 0, 74, 2], [1, 0, 76, 1], [1, 1, 77, 1], [2, 0, 74, 2], [3, 0, 70, 2], [4, 0, 67, 1], [4, 1, 70, 1], [5, 0, 74, 2], [6, 0, 73, 2], [7, 0, 76, 2]];
// the centipede's chase, in sixteenths of a 7/8 bar (3+2+2): the tune [bar of 4, sixteenth, note, length], the strings' figure
const CENTI_TUNE = [[0, 0, 74, 6], [0, 6, 69, 4], [0, 10, 70, 4], [1, 0, 73, 14], [2, 0, 77, 6], [2, 6, 76, 4], [2, 10, 74, 4], [3, 0, 69, 14]];
const CENTI_STR = [62, 69, 74, 69, 62, 69, 63, 70, 63, 70, 62, 69, 61, 69];
const AH = [[700, 5, 1], [1150, 7, 0.6], [2700, 9, 0.25]], MM = [[320, 6, 1], [900, 8, 0.25]];   // choir vowels: formants

export class Music {
  constructor(snd) {
    this.s = snd;
    const ctx = this.ctx = snd.ctx;
    this.out = ctx.createGain(); this.out.gain.value = 0.9;
    this.out.connect(snd.master);
    const send = ctx.createGain(); send.gain.value = 0.55;
    this.out.connect(send); send.connect(snd.revIn);
    this.bus = {}; this.lvl = {};
    for (const k of ['dusk', 'night', 'inside', 'escape']) {
      const g = ctx.createGain(); g.gain.value = 0; g.connect(this.out);
      this.bus[k] = g; this.lvl[k] = 0;
    }
    this.mode = 'off';
    this.dq = { next: 0, i: 0, pass: 0 };
    this.nq = { next: 0, crick: [0, 0, 0], glass: 0 };
    this.iq = { t: 0, bar: 0, T: -1 };
    this.eq = { ph: null, at: 0, t: 0, bar: 0, b: null, bus: [] };
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
      const e = this.fixE || 60 / (92 + 18 * T) / 2, t = q.t, bar = q.bar % 8, cyc = Math.floor(q.bar / 8);
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

  // ------------------------------------------------------------ drums, brass, choir (the escape and the centipede's chase)
  taiko(t, d, g = 0.6, f0 = 110) { this.hit(t, d, f0, 45, 0.4, g); this.noise(t, d, { dur: 0.09, f: 320, q: 1, type: 'lowpass', gain: g * 0.4, buf: this.s.brown }); }
  snare(t, d, g = 0.3, pan = 0) { this.noise(t, d, { dur: 0.14, f: 1900, q: 0.7, gain: g, pan }); this.hit(t, d, 210, 150, 0.08, g * 0.7, 'triangle', pan); }
  hat(t, d, g = 0.05, pan = 0.2) { this.noise(t, d, { dur: 0.025, f: 7500, q: 0.8, type: 'highpass', gain: g, pan }); }
  crash(t, d, g = 0.15) { this.noise(t, d, { dur: 2.2, f: 5000, q: 0.5, type: 'highpass', gain: g, attack: 0.005 }); this.noise(t, d, { dur: 1.2, f: 3000, q: 0.6, gain: g * 0.6 }); }
  timp(t, m, d, g) { const f = mtof(m); this.hit(t, d, f * 1.04, f, 0.9, g); this.hit(t, d, f * 2, f * 1.98, 0.5, g * 0.3); this.noise(t, d, { dur: 0.06, f: 400, q: 1, type: 'lowpass', gain: g * 0.5, buf: this.s.brown }); }
  roll(t, dur, m, d, g0, g1) { for (let x = 0; x < dur; x += 0.055) this.timp(t + x, m, d, g0 + (g1 - g0) * x / dur); }
  // brass: a stack of saws, the filter snapping open then settling
  brass(t, notes, dur, d, { gain = 0.03, cut = 1600, pan = 0 } = {}) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.Q.value = 1.5;
    lp.frequency.setValueAtTime(180, t); lp.frequency.exponentialRampToValueAtTime(cut, t + 0.12); lp.frequency.exponentialRampToValueAtTime(cut * 0.55, t + Math.max(0.2, dur));
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.04);
    g.gain.setTargetAtTime(gain * 0.7, t + 0.1, 0.3); g.gain.setTargetAtTime(0, t + dur, 0.12);
    lp.connect(g); this.pan(g, pan, d);
    for (const m of notes) for (const dt of [-8, 0, 8]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt;
      o.connect(lp); o.start(t); o.stop(t + dur + 0.7);
    }
  }
  // tremolo strings
  trem(t, notes, dur, d, { gain = 0.02, cut = 700, rate = 11 } = {}) {
    const ctx = this.ctx, lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = cut;
    const am = ctx.createGain(); am.gain.value = 0.55;
    const lfo = ctx.createOscillator(); lfo.frequency.value = rate; const lg = ctx.createGain(); lg.gain.value = 0.45; lfo.connect(lg); lg.connect(am.gain);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + 0.4); g.gain.setValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + 0.5);
    lp.connect(am); am.connect(g); g.connect(d);
    const end = t + dur + 0.55; lfo.start(t); lfo.stop(end);
    for (const m of notes) for (const dt of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt; o.connect(lp); o.start(t); o.stop(end); }
  }
  // a choir: saws with vibrato through vowel formants ('ah' or a hummed 'mm')
  choir(t, notes, dur, d, { gain = 0.01, attack = 1.6, rel = 2.2, form = AH } = {}) {
    const ctx = this.ctx, g = ctx.createGain();
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.setValueAtTime(gain, t + dur); g.gain.linearRampToValueAtTime(0, t + dur + rel);
    g.connect(d);
    const mix = ctx.createGain();
    for (const [f, q, a] of form) { const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = f; bp.Q.value = q; const bg = ctx.createGain(); bg.gain.value = a * 3; mix.connect(bp); bp.connect(bg); bg.connect(g); }
    const end = t + dur + rel + 0.05;
    for (const m of notes) {
      const v = ctx.createOscillator(); v.frequency.value = rnd(4.6, 5.6); const vg = ctx.createGain(); vg.gain.value = mtof(m) * 0.006; v.connect(vg); v.start(t); v.stop(end);
      for (const dt of [-9, 0, 8]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = mtof(m); o.detune.value = dt + rnd(-3, 3); vg.connect(o.frequency); o.connect(mix); o.start(t); o.stop(end); }
    }
  }
  // high strings sliding, sul ponticello: thin, trembling
  gliss(t, m0, m1, dur, d, { gain = 0.006, pan = 0 } = {}) {
    const ctx = this.ctx, hp = ctx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 900;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + dur * 0.45); g.gain.linearRampToValueAtTime(0, t + dur);
    const tr = ctx.createGain(); tr.gain.value = 0.6;
    const lfo = ctx.createOscillator(); lfo.frequency.value = rnd(7, 9); const lg = ctx.createGain(); lg.gain.value = 0.4; lfo.connect(lg); lg.connect(tr.gain); lfo.start(t); lfo.stop(t + dur + 0.05);
    hp.connect(g); g.connect(tr); this.pan(tr, pan, d);
    for (const dt of [-7, 7]) { const o = ctx.createOscillator(); o.type = 'sawtooth'; o.detune.value = dt; o.frequency.setValueAtTime(mtof(m0), t); o.frequency.exponentialRampToValueAtTime(mtof(m1), t + dur); o.connect(hp); o.start(t); o.stop(t + dur + 0.05); }
  }
  bell(t, m, d, { vel = 1, pan = 0 } = {}) {
    const ctx = this.ctx, f = mtof(m), out = ctx.createGain(); out.gain.value = vel; this.pan(out, pan, d);
    for (const [r, g, dk] of [[1, 0.04, 3.5], [2.0, 0.014, 1.5], [3.0, 0.008, 0.8], [4.07, 0.005, 0.5]]) {
      const o = ctx.createOscillator(); o.frequency.value = f * r;
      const e = ctx.createGain(); e.gain.setValueAtTime(0, t); e.gain.linearRampToValueAtTime(g, t + 0.003); e.gain.exponentialRampToValueAtTime(0.0001, t + dk);
      o.connect(e); e.connect(out); o.start(t); o.stop(t + dk + 0.05);
    }
  }
  // noise sweeping up and a string glide climbing
  riser(t, dur, d, L = 1) {
    const ctx = this.ctx, s = ctx.createBufferSource(); s.buffer = this.s.white; s.loop = true;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.Q.value = 1.6;
    f.frequency.setValueAtTime(350, t); f.frequency.exponentialRampToValueAtTime(7000, t + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.12 * L, t + dur * 0.95); g.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    s.connect(f); f.connect(g); g.connect(d); s.start(t); s.stop(t + dur + 0.1);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.setValueAtTime(146.8, t); o.frequency.exponentialRampToValueAtTime(587.3, t + dur);
    const og = ctx.createGain(); og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.04 * L, t + dur * 0.95); og.gain.linearRampToValueAtTime(0, t + dur + 0.03);
    o.connect(og); og.connect(d); o.start(t); o.stop(t + dur + 0.1);
  }
  impact(t, d, g = 1) {
    this.taiko(t, d, g, 100); this.hit(t, d, 60, 28, 1.6, 0.8 * g); this.crash(t, d, 0.16 * g);
    this.brass(t, [26, 38, 45, 50], 1.6, d, { gain: 0.05 * g, cut: 1400 });
    this.noise(t, d, { dur: 1.0, f: 160, q: 0.8, type: 'lowpass', gain: 0.5 * g, buf: this.s.brown });
  }

  // ------------------------------------------------------------ the escape
  // ph: 'duct' | 'drop' | 'run' | 'out'; k 0..1: how close it is (outside the duct)
  escapeTo(until, ph, k) {
    const q = this.eq, E = 0.2, now = this.ctx.currentTime;   // E: an eighth (6/8: a bar is 1.2 s)
    if (q.ph !== ph) {
      // a new phase: what was playing fades out under it
      const at = now + 0.02, b = this.ctx.createGain(); b.connect(this.bus.escape);
      for (const o of q.bus) { o.gain.cancelScheduledValues(at); o.gain.setTargetAtTime(0, at, ph === 'drop' ? 0.8 : 0.1); }
      if (q.loop) { q.loop.stop(2); q.loop = null; }
      q.bus = [b]; q.b = b; q.ph = ph; q.at = at; q.t = at; q.bar = 0;
      // made already (bake.js)? then the duct and the run play from their loops
      const B = this.s.baked && this.s.baked.ready;
      if (ph === 'duct' && B && B.duct) q.loop = new LoopSet(this.ctx, B.duct, b);
      if (ph === 'run' && B && B.run) { q.loop = new LoopSet(this.ctx, B.run, b, { loopStart: this.s.baked.runLoop }); q.loop.mix(0, [0]); }
      if (ph === 'drop') { this.roll(at, 1.75, 38, b, 0.05, 0.45); this.riser(at, 1.75, b, 0.7); }
      if (ph === 'run') { this.impact(at, b, 0.9); this.choir(at, [50, 57, 62, 65, 69], 2.2, b, { gain: 0.018, attack: 0.05, rel: 1 }); }
      if (ph === 'out') {
        this.roll(at, 1.2, 38, b, 0.15, 0.4); this.timp(at + 1.2, 38, b, 0.8); this.crash(at + 1.2, b, 0.15);
        this.choir(at, [50, 57, 62, 66, 69, 74], 6.5, b, { gain: 0.016, attack: 0.6, rel: 3 });
        this.brass(at + 1.2, [38, 50, 57, 62, 66], 4, b, { gain: 0.026, cut: 1600 });
        [74, 81, 78, 86].forEach((m, i) => this.bell(at + 2 + i * 0.6, m, b, { vel: 0.7, pan: i % 2 ? 0.3 : -0.3 }));
      }
    }
    const b = q.b;
    if (q.loop) { if (ph === 'duct') q.loop.mix(k, this.s.baked.levels.duct, 1); return; }
    if (ph === 'duct') while (q.t < until) {
      // two bars at a time: low tremolo strings, a hummed choir, timpani swelling, a cello alone with the factory's tune
      const t = q.t, i = q.bar;
      this.trem(t, [38, 45], 2.4, b, { gain: 0.02 + 0.015 * k, cut: 500 + 400 * k });
      if (i % 2 === 0) this.choir(t, [50, 57, 62], 4.6, b, { gain: 0.012, form: MM, attack: 1.5, rel: 1.5 });
      if (i % 2 === 1) this.roll(t + 1.2, 1.1, 38, b, 0.02, 0.18 + 0.15 * k);
      const cel = [[50, 45], [46, 49], [53, 52], [50, 45]][i % 4];
      this.bow(t, cel[0], 1.1, b, { gain: 0.03, cut: 900, attack: 0.25, rel: 0.6, pan: -0.2 });
      this.bow(t + 1.2, cel[1], i % 4 === 1 ? 1.9 : 1.1, b, { gain: 0.03, cut: 900, attack: 0.25, rel: 0.6, pan: -0.2 });
      q.t += 2.4; q.bar++;
    }
    if (ph === 'run') while (q.t < until) {
      const t = q.t, i = q.bar % 8, again = q.bar >= 8, [r, ch] = ESC_PROG[i >> 1];
      [1, 0.5, 0.6, 1, 0.5, 0.6].forEach((a, e) => this.pluck(t + e * E, r + 12, E * 0.8, b, { gain: 0.05 * a, cut: 900, res: 2 }));   // the gallop
      [0, 1, 2, 1, 2, 1].forEach((n, e) => this.pluck(t + e * E, ch[n] + 12, E * 0.7, b, { gain: 0.012, cut: 2200, pan: e % 2 ? 0.35 : -0.35 }));
      this.timp(t, r + 12, b, 0.55); this.timp(t + 3 * E, r + 12, b, 0.4);
      if (again) { this.snare(t + 3 * E, b, 0.15); for (let s = 0; s < 6; s++) this.hat(t + s * E, b, 0.02, 0.3); }
      if (i === 0) this.crash(t, b, 0.1);
      if (i % 2 === 0) this.choir(t, again ? [...ch, ch[0] + 12] : ch, 2.2, b, { gain: 0.012, attack: 0.15, rel: 0.5 });
      for (const [bb, h, m, len] of ESC_HYMN) if (bb === i) this.brass(t + h * 3 * E, [m, m - 12], len * 3 * E - 0.05, b, { gain: 0.022 });
      if (i === 7) this.roll(t + 0.6, 0.6, 45, b, 0.1, 0.35);
      q.t += 6 * E; q.bar++;
    }
  }

  // ------------------------------------------------------------ the centipede's chase
  // one sixteenth of a 7/8 bar (3+2+2) at absolute time t; L 0..1: how close it is
  centiStep(t, i, bar, L, sd, d) {
    const grp = i === 0 || i === 6 || i === 10;
    if (grp && L > 0.15) this.taiko(t, d, (i === 0 ? 0.85 : 0.55) * (0.5 + 0.5 * L), i === 0 ? 115 : 95);
    if (L > 0.6 && i === 13) this.taiko(t, d, 0.35, 130);
    // the machine's bass, flat out: D D Eb (every fourth bar D C C#)
    if (grp) { const m = (bar % 4 === 3 ? [38, 36, 37] : [38, 38, 39])[i === 0 ? 0 : i === 6 ? 1 : 2]; this.pluck(t, m, (i === 0 ? 6 : 4) * sd * 0.9, d, { gain: 0.06, cut: 260 + 500 * L, res: 3 }); }
    if (L > 0.3) this.pluck(t, CENTI_STR[i] + 12, sd * 0.7, d, { gain: (grp ? 1.4 : 1) * (0.01 + 0.025 * (L - 0.3)), cut: 1500 + 1500 * L, pan: i % 2 ? 0.35 : -0.35 });
    // the factory's tune in the brass, then a braam, a choir and screeching strings as it closes in
    if (L > 0.45) for (const [bb, k, m, len] of CENTI_TUNE) if (bb === bar % 4 && k === i) this.brass(t, [m, m - 12], len * sd - 0.03, d, { gain: 0.022 + 0.02 * (L - 0.45), cut: 1700 });
    if (L > 0.55 && i === 0 && bar % 4 === 0) this.brass(t, [26, 38, 45], 1.3, d, { gain: 0.035 * L, cut: 1200 });
    if (L > 0.72 && i === 0 && bar % 2 === 0) this.choir(t, bar % 4 === 0 ? [62, 65, 69] : [57, 61, 64], 28 * sd - 0.2, d, { gain: 0.008 + 0.02 * (L - 0.72), attack: 0.2, rel: 0.6 });
    if (L > 0.78 && i === 0 && bar % 4 === 2) { this.gliss(t, 88, 86, 20 * sd, d, { gain: 0.006, pan: -0.5 }); this.gliss(t + 0.06, 89, 85, 20 * sd, d, { gain: 0.005, pan: 0.5 }); }
    if (L > 0.6 && i % 2 === 1) this.hat(t, d, 0.03 * L, 0.3);
  }

  // ------------------------------------------------------------ control
  // mode: 'dusk' | 'night' | 'inside' | 'escape' | 'end' | 'off'; o: { tension 0..1, duck 0..1, and for 'escape': phase, k 0..1 }
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
    // out of the escape (you died, say): it stops, and starts over from its phase next time. Coming out
    // through the shutter it isn't stopped: the last chord rings on into whatever plays next
    const eq = this.eq;
    if (mode !== 'escape' && eq.ph && (eq.ph !== 'out' || now - eq.at > 8)) {
      if (eq.ph !== 'out') for (const g of eq.bus) { g.gain.cancelScheduledValues(now); g.gain.setTargetAtTime(0, now, 0.4); }
      if (eq.loop) { eq.loop.stop(2); eq.loop = null; }
      eq.ph = null;
    }
    this.tension += ((o.tension ?? this.tension) - this.tension) * 0.02;
    const duck = o.duck ?? 1;
    const want = {
      dusk: mode === 'dusk' || mode === 'end' ? 0.85 * duck : 0, night: mode === 'night' ? 0.9 : 0, inside: mode === 'inside' ? 0.85 * duck : 0,
      escape: mode === 'escape' || eq.ph === 'out' ? 0.85 : 0,
    };
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
    if (eq.ph && eq.t < late) eq.t = now + 0.1;
    nq.crick = nq.crick.map((v) => (v < late ? now + rnd(0, 0.5) : v)); if (nq.glass < late) nq.glass = now + 1;
    const until = now + 1.0;          // a second ahead: a frame that stalls (a heavy moment on a phone) doesn't leave a hole
    if (want.dusk > 0 || this.lvl.dusk > 0.01) this.duskTo(until, this.bus.dusk, mode === 'end');
    if (want.night > 0 || this.lvl.night > 0.01) this.nightTo(until, this.bus.night);
    if (want.inside > 0 || this.lvl.inside > 0.01) {
      const B = this.s.baked && this.s.baked.ready;
      if (B && B.inside) {
        // made already (bake.js): the loops, crossfaded by the tension; the hum as before
        if (!this.iLoop) this.iLoop = new LoopSet(ctx, B.inside, this.iDest);
        this.iLoop.mix(this.tension, this.s.baked.levels.inside, 1.5);
        if (Math.abs(this.tension - this.iq.T) > 0.01) { this.iq.T = this.tension; this.iHum.gain.setTargetAtTime(0.02 + this.tension * 0.03, now, 2); }
      } else this.insideTo(until);
    }
    if (mode === 'escape' && o.phase) this.escapeTo(until, o.phase, o.k ?? 0.5);
  }
}
