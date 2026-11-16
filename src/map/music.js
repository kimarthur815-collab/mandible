// Background music, synthesised like the rest of the sound (no audio files).
//  dusk   — the title drive at sunset: warm, a little lonely; a shadow at the end of every turn round
//  night  — parked in the dark yard: crickets, wind, a low drone and glassy swells
//  inside — the factory: a low bowed drone, a slow chromatic line creeping down, stray piano notes and
//           bowed metal; tightens as the night goes on (ticking, a distant pulse)
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
// inside: the line that creeps down over the drone (D), and the notes the piano strays onto
const CREEP = [53, 52, 51, 50, 49, 50, 46, 45];
const STRAY = [50, 51, 53, 57, 58, 61, 62, 63, 65];

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
    this.iq = { next: 0, creep: 0, stray: 0, metal: 0, pulse: 0, tick: 0 };
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
  buildInside() {
    const ctx = this.ctx, dest = this.bus.inside;
    // low bowed drone on D, breathing
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 360; lp.Q.value = 0.9;
    const dg = ctx.createGain(); dg.gain.value = 0.07; lp.connect(dg); dg.connect(dest);
    for (const [f, d] of [[36.71, -6], [36.71, 7], [55.0, 3], [73.42, -4]]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = d;
      const g = ctx.createGain(); g.gain.value = f > 60 ? 0.25 : 0.5; o.connect(g); g.connect(lp); o.start();
    }
    const br = ctx.createOscillator(); br.frequency.value = 0.09; const bg = ctx.createGain(); bg.gain.value = 0.03;
    br.connect(bg); bg.connect(dg.gain); br.start();
    const sw = ctx.createOscillator(); sw.frequency.value = 0.05; const sg = ctx.createGain(); sg.gain.value = 120;
    sw.connect(sg); sg.connect(lp.frequency); sw.start();
  }
  insideTo(until, dest) {
    const q = this.iq, T = this.tension;
    // the creeping line: one long bowed note after another, a step down each time
    while (q.creep < until) {
      const m = CREEP[q.cI = ((q.cI || 0) + 1) % CREEP.length];
      this.bow(q.creep, m, 7.5, dest, { gain: 0.022 + T * 0.02, cut: 600 + T * 500, pan: rnd(-0.3, 0.3) });
      if (T > 0.55) this.bow(q.creep + 0.4, m + 13, 7, dest, { gain: 0.008 + (T - 0.55) * 0.02, cut: 1400, pan: rnd(-0.6, 0.6) });   // a minor ninth above, later on
      q.creep += 8;
    }
    // a stray piano note now and then (sometimes two, a half step apart)
    while (q.stray < until) {
      const t = q.stray, m = pick(STRAY), p = rnd(-0.7, 0.7);
      this.ep(t, m, 2.5, dest, { vel: rnd(0.5, 0.8), pan: p, ratio: 3.5, bite: 0.9, decay: 1.6 });
      if (Math.random() < 0.25) this.ep(t + rnd(0.15, 0.6), m + 1, 2.5, dest, { vel: 0.4, pan: -p, ratio: 3.5, bite: 0.8, decay: 1.6 });
      q.stray += rnd(5, 11) * (1 - T * 0.4);
    }
    // bowed metal somewhere in the dark
    while (q.metal < until) {
      this.metal(q.metal, pick([196, 207.7, 277.2, 311.1]), dest, { gain: 0.016 + T * 0.012, up: rnd(1.2, 2.5), down: rnd(3, 5), pan: rnd(-0.9, 0.9) });
      q.metal += rnd(11, 20);
    }
    // later on: a far pulse, like a machine's heart, then a clock ticking over it
    while (q.pulse < until) {
      if (T > 0.3) { this.hit(q.pulse, dest, 58, 34, 0.7, 0.16 + (T - 0.3) * 0.25); this.hit(q.pulse + 0.32, dest, 52, 32, 0.6, 0.1 + (T - 0.3) * 0.18); }
      q.pulse += 2.2 - T * 0.6;
    }
    while (q.tick < until) {
      if (T > 0.5) this.noise(q.tick, dest, { dur: 0.018, f: q.tk = !q.tk ? 2600 : 2100, q: 6, gain: 0.035 + (T - 0.5) * 0.08, attack: 0.001 });
      q.tick += 0.5;
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
      if (mode === 'inside' && from !== 'inside') { const q = this.iq; q.creep = now + 1; q.stray = now + 4; q.metal = now + 9; q.pulse = now + 3; q.tick = now + 3; }
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
    for (const k of ['creep', 'stray', 'metal', 'pulse', 'tick']) if (q[k] < late) q[k] = now + rnd(0, 1);
    nq.crick = nq.crick.map((v) => (v < late ? now + rnd(0, 0.5) : v)); if (nq.glass < late) nq.glass = now + 1;
    const until = now + 0.35;
    if (want.dusk > 0 || this.lvl.dusk > 0.01) this.duskTo(until, this.bus.dusk, mode === 'end');
    if (want.night > 0 || this.lvl.night > 0.01) this.nightTo(until, this.bus.night);
    if (want.inside > 0 || this.lvl.inside > 0.01) this.insideTo(until, this.bus.inside);
  }
}
