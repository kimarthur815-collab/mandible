// All sound is synthesised here with Web Audio: no audio files.
// Ambience (factory drone, room tone, creaks, drips) + a chase layer (heartbeat, strings)
// + effects (steps, flashlight switch, roach skitter, wings, generators, lamps, doors).

const rnd = (a, b) => a + Math.random() * (b - a);

export class Sound {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.intensity = 0;
    this.nextEvent = 3;
    this.nextBeat = 0;
    this.swarmSrc = [];
    this.genSrc = new Map();
    this.lampSrc = new Map();
    this.flyerSrc = null;
    this.t = 0;
  }

  // must be called from a tap/click (browsers only allow audio after one)
  start() {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (this.ctx) { if (this.ctx.state !== 'running') this.ctx.resume(); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) { /* iOS 17+: play even with the silent switch on */ }
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : 0.9;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.004; comp.release.value = 0.25;
    this.master.connect(comp); comp.connect(ctx.destination);
    // one big concrete hall reverb shared by everything
    this.rev = ctx.createConvolver(); this.rev.buffer = this.makeIR(2.8);
    this.revIn = ctx.createGain(); this.revIn.gain.value = 0.5;
    this.revIn.connect(this.rev); this.rev.connect(this.master);
    this.sfx = this.bus(1.0, 0.35);
    this.amb = this.bus(0.9, 0.5);
    this.mus = this.bus(0.8, 0.3);
    // shared noise
    this.white = this.noiseBuf(2, 'white');
    this.brown = this.noiseBuf(4, 'brown');
    this.skitBufs = [0, 1, 2].map((i) => this.makeSkitter(2.4, 140 + i * 40, i));
    this.crinkleBuf = this.makeCrinkle(2.0);
    this.buzzBuf = this.makeBuzz(1.0);
    this.genBuf = this.makeGenerator(2.0);
    this.lampBuf = this.makeLampHum(2.0);
    this.tapBuf = this.makeTaps(2.0);
    // one bug's own feet, by size
    this.stepBufs = {
      roach: this.makeLegSteps(2.2, { stride: 9, legs: 3, f0: 2600, f1: 4200, len: 0.0025, scrape: 0.3 }),
      ling: this.makeLegSteps(2.2, { stride: 6, legs: 4, f0: 900, f1: 1800, len: 0.005, scrape: 0.2 }),
      big: this.makeLegSteps(2.6, { stride: 2.6, legs: 4, f0: 320, f1: 760, len: 0.012, scrape: 0.45 }),
      tiny: this.makeLegSteps(1.8, { stride: 15, legs: 4, f0: 4800, f1: 7200, len: 0.0012, scrape: 0.08 }),
    };
    this.startAmbience();
    this.startTension();
  }

  setMuted(m) {
    this.muted = m;
    if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
  }

  bus(gain, send) {
    const g = this.ctx.createGain(); g.gain.value = gain;
    g.connect(this.master);
    const s = this.ctx.createGain(); s.gain.value = send;
    g.connect(s); s.connect(this.revIn);
    return g;
  }

  // ------------------------------------------------------------ buffers
  noiseBuf(sec, kind) {
    const ctx = this.ctx, n = Math.floor(sec * ctx.sampleRate), b = ctx.createBuffer(1, n, ctx.sampleRate), d = b.getChannelData(0);
    let last = 0;
    for (let i = 0; i < n; i++) {
      const w = Math.random() * 2 - 1;
      if (kind === 'brown') { last = (last + 0.02 * w) / 1.02; d[i] = last * 3.5; } else d[i] = w;
    }
    return b;
  }

  makeIR(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = b.getChannelData(c);
      for (let i = 0; i < n; i++) {
        const t = i / sr;
        // dense tail + a few hard early reflections off concrete
        d[i] = (Math.random() * 2 - 1) * Math.pow(1 - t / sec, 2.2) * Math.exp(-t * 1.4);
      }
      for (const e of [0.011, 0.023, 0.037, 0.052, 0.071]) d[Math.floor((e + c * 0.003) * sr)] += rnd(0.3, 0.6) * (Math.random() < 0.5 ? -1 : 1);
    }
    return b;
  }

  // chitin feet on concrete: thousands of tiny dry clicks
  makeSkitter(sec, rate, seed) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let t = 0;
    while (t < sec) {
      const burst = Math.sin(t * (1.7 + seed)) * 0.5 + 0.5;        // the crowd surges and pauses
      t += -Math.log(1 - Math.random()) / (rate * (0.35 + burst));
      const i0 = Math.floor(t * sr), len = Math.floor(rnd(0.0008, 0.003) * sr), amp = rnd(0.2, 1) * (0.5 + burst * 0.5);
      let lp = 0;
      for (let k = 0; k < len && i0 + k < n; k++) {
        const w = Math.random() * 2 - 1;
        lp = lp * 0.25 + w * 0.75;                                    // keep it bright
        d[i0 + k] += (w - lp * 0.6) * amp * Math.exp(-k / (len * 0.25));
      }
    }
    // a faint rustle under the clicks
    for (let i = 0; i < n; i++) d[i] = d[i] * 0.55 + (Math.random() * 2 - 1) * 0.015;
    this.loopFade(d, sr);
    return b;
  }

  // a single bug walking: tripod gait, so groups of quick leg ticks. Sharp transients are
  // what the ear uses to place a sound, so these localise far better than a wash of noise.
  makeLegSteps(sec, { stride, legs, f0, f1, len, scrape }) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let t = 0.01;
    while (t < sec - 0.03) {
      for (let k = 0; k < legs; k++) {
        const i0 = Math.floor((t + k * rnd(0.003, 0.009)) * sr), L = Math.floor(rnd(len * 0.7, len * 1.3) * sr), amp = rnd(0.45, 1) * (k ? 0.7 : 1);
        const w = 2 * Math.PI * rnd(f0, f1) / sr;
        let ph = Math.random() * 6;
        for (let j = 0; j < L && i0 + j < n; j++) { const env = Math.exp(-j / (L * 0.22)); d[i0 + j] += (Math.sin(ph += w) * 0.6 + (Math.random() * 2 - 1) * 0.5) * env * amp; }
      }
      if (Math.random() < scrape) {
        // a leg dragging a little
        const i0 = Math.floor((t + 0.01) * sr), L = Math.floor(0.025 * sr);
        let lp = 0;
        for (let j = 0; j < L && i0 + j < n; j++) { const wv = Math.random() * 2 - 1; lp = lp * 0.5 + wv * 0.5; d[i0 + j] += (wv - lp) * 0.15 * Math.sin(Math.PI * j / L); }
      }
      t += rnd(0.8, 1.2) / (stride * 2);
      if (Math.random() < 0.06) t += rnd(0.05, 0.15);     // stop-start
    }
    this.loopFade(d, sr);
    let pk = 0;
    for (let i = 0; i < n; i++) pk = Math.max(pk, Math.abs(d[i]));
    for (let i = 0; i < n; i++) d[i] /= pk || 1;
    return b;
  }

  // the suit's plastic crinkle when something crawls on it
  makeCrinkle(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let env = 0, hp = 0, prev = 0;
    for (let i = 0; i < n; i++) {
      if (Math.random() < 120 / sr) env = rnd(0.3, 1);
      env *= 0.9992;
      const w = Math.random() * 2 - 1;
      hp = 0.9 * (hp + w - prev); prev = w;
      d[i] = hp * env * (Math.random() < 0.3 ? 1 : 0.4) * 0.6;
    }
    this.loopFade(d, sr);
    return b;
  }

  // a big roach's wings: a rough 80-100 Hz buzz with flutter
  makeBuzz(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let ph = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr, f = 88 + Math.sin(t * 13) * 6 + Math.sin(t * 31) * 3;
      ph += f / sr;
      const saw = (ph % 1) * 2 - 1;
      const flap = Math.pow(Math.abs(Math.sin(Math.PI * ph)), 3);
      d[i] = (saw * 0.5 + (Math.random() * 2 - 1) * 0.35) * (0.3 + flap * 0.9) * 0.5;
    }
    this.loopFade(d, sr);
    return b;
  }

  makeGenerator(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    let p1 = 0, lp = 0;
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      p1 += 24.5 / sr;                                   // 1470 rpm two-stroke-ish thump
      const firing = Math.pow(Math.max(0, Math.sin(Math.PI * 2 * p1)), 8);
      const w = Math.random() * 2 - 1; lp = lp * 0.97 + w * 0.03;
      const hum = Math.sin(2 * Math.PI * 49 * t) * 0.3 + Math.sin(2 * Math.PI * 98 * t) * 0.18 + Math.sin(2 * Math.PI * 147 * t) * 0.06;
      const rattle = (Math.random() * 2 - 1) * Math.pow(Math.max(0, Math.sin(2 * Math.PI * 12.25 * t)), 6) * 0.12;
      d[i] = (hum * 0.6 + firing * 0.7 + lp * 4 + rattle) * 0.45;
    }
    this.loopFade(d, sr);
    return b;
  }

  // a centipede's feet: hard, rhythmic ticks in waves running down the body
  makeTaps(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    const rate = 16;                        // waves per second at playbackRate 1
    for (let w = 0; w < sec * rate; w++) {
      const t0 = w / rate;
      for (let k = 0; k < 5; k++) {           // each wave is several feet landing in quick succession
        const i0 = Math.floor((t0 + k * 0.009 + Math.random() * 0.003) * sr), len = Math.floor(0.004 * sr), amp = (0.5 + Math.random() * 0.5) * (k === 0 ? 1 : 0.6);
        let lp = 0;
        for (let j = 0; j < len && i0 + j < n; j++) { const wv = Math.random() * 2 - 1; lp = lp * 0.4 + wv * 0.6; d[i0 + j] += lp * amp * Math.exp(-j / (len * 0.3)); }
      }
    }
    this.loopFade(d, sr);
    return b;
  }

  makeLampHum(sec) {
    const ctx = this.ctx, sr = ctx.sampleRate, n = Math.floor(sec * sr), b = ctx.createBuffer(1, n, sr), d = b.getChannelData(0);
    for (let i = 0; i < n; i++) {
      const t = i / sr;
      const buzz = Math.sin(2 * Math.PI * 120 * t) * 0.5 + Math.sin(2 * Math.PI * 240 * t) * 0.2 + Math.sign(Math.sin(2 * Math.PI * 60 * t)) * 0.05;
      const crackle = Math.random() < 3 / sr ? 1 : 0;
      d[i] = buzz * 0.25 + (Math.random() * 2 - 1) * 0.02 + crackle * 0.6;
    }
    this.loopFade(d, sr);
    return b;
  }

  loopFade(d, sr) {
    const f = Math.floor(0.02 * sr), n = d.length;
    for (let i = 0; i < f; i++) { const k = i / f; d[i] = d[i] * k + d[n - f + i] * (1 - k); }
  }

  // ------------------------------------------------------------ helpers
  panner(x, y, z, ref = 1.2, roll = 1.3) {
    const p = this.ctx.createPanner();
    p.panningModel = 'HRTF'; p.distanceModel = 'inverse';
    p.refDistance = ref; p.rolloffFactor = roll; p.maxDistance = 60;
    this.setPos(p, x, y, z);
    return p;
  }
  // a positioned source with a front/back cue: things behind you sound duller.
  // (HRTF alone places left/right well, but front and back are easy to confuse on earphones.)
  spot(x, y, z, ref = 1.2, roll = 1.3, dest = this.sfx) {
    const lp = this.ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 9000; lp.Q.value = 0.5;
    const p = this.panner(x, y, z, ref, roll);
    lp.connect(p); p.connect(dest);
    const sp = { in: lp, lp, p };
    this.place(sp, x, y, z, true);
    return sp;
  }
  place(sp, x, y, z, snap = false) {
    const t = this.ctx.currentTime, P = sp.p;
    if (snap && P.positionX) { P.positionX.cancelScheduledValues(t); P.positionY.cancelScheduledValues(t); P.positionZ.cancelScheduledValues(t); P.positionX.setValueAtTime(x, t); P.positionY.setValueAtTime(y, t); P.positionZ.setValueAtTime(z, t); }
    else this.setPos(P, x, y, z);
    const L = this._lis;
    if (!L) return;
    const dx = x - L.x, dz = z - L.z, d = Math.hypot(dx, dz);
    const ahead = d > 0.3 ? (dx * L.fx + dz * L.fz) / d : 1;
    const behind = Math.max(0, -ahead);
    sp.lp.frequency.setTargetAtTime(9000 - 6400 * behind, t, snap ? 0.005 : 0.05);
  }
  setPos(p, x, y, z) {
    if (p.positionX) { const t = this.ctx.currentTime; p.positionX.setTargetAtTime(x, t, 0.03); p.positionY.setTargetAtTime(y, t, 0.03); p.positionZ.setTargetAtTime(z, t, 0.03); }
    else p.setPosition(x, y, z);
  }
  loop(buf, dest, gain = 0, rate = 1) {
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.playbackRate.value = rate;
    const g = this.ctx.createGain(); g.gain.value = gain;
    s.connect(g); g.connect(dest);
    s.start(0, Math.random() * buf.duration);
    return { s, g };
  }
  // one-shot noise burst through a filter with an envelope
  burst({ dest = this.sfx, t = 0, dur = 0.1, f = 1000, q = 1, type = 'bandpass', gain = 0.5, attack = 0.002, buf = this.white, rate = 1, pan = 0 }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const s = ctx.createBufferSource(); s.buffer = buf; s.playbackRate.value = rate;
    const fl = ctx.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(gain, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + attack + dur);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    s.connect(fl); fl.connect(g); out.connect(dest);
    s.start(now, Math.max(0, Math.random() * (buf.duration - dur - attack - 0.1))); s.stop(now + attack + dur + 0.05);
    return fl;
  }
  tone({ dest = this.sfx, t = 0, f0 = 100, f1 = 50, dur = 0.2, gain = 0.4, type = 'sine', attack = 0.003, pan = 0 }) {
    const ctx = this.ctx, now = ctx.currentTime + t;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, now); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), now + dur);
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(gain, now + attack); g.gain.exponentialRampToValueAtTime(0.0001, now + attack + dur);
    let out = g;
    if (pan && ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = pan; g.connect(p); out = p; }
    o.connect(g); out.connect(dest);
    o.start(now); o.stop(now + attack + dur + 0.05);
  }

  // ------------------------------------------------------------ the drive in (no positions: it all happens round you)
  // while in the truck the factory's drone and the tension music stay silent
  introMode(on) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    for (const [b, v] of [[this.amb, 0.9], [this.mus, 0.8]]) { b.gain.cancelScheduledValues(t); b.gain.setTargetAtTime(on ? 0 : v, t, on ? 0.01 : 1.5); }
  }
  engine(on) {
    if (!this.ctx) return;
    const ctx = this.ctx, t = ctx.currentTime;
    if (on && !this.eng) {
      const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 190;
      const g = ctx.createGain(); g.gain.value = 0; lp.connect(g); g.connect(this.sfx);
      const rumble = this.loop(this.brown, lp, 0.8);
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 33; const og = ctx.createGain(); og.gain.value = 0.22; o.connect(og); og.connect(lp); o.start();
      const lfo = ctx.createOscillator(); lfo.frequency.value = 0.27; const lg = ctx.createGain(); lg.gain.value = 1.6; lfo.connect(lg); lg.connect(o.frequency); lfo.start();
      const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 0.5; bp.connect(g);   // tyres on the road
      const road = this.loop(this.white, bp, 0.045);
      g.gain.setTargetAtTime(0.4, t, 0.4);
      this.eng = { g, srcs: [rumble.s, o, lfo, road.s] };
    } else if (!on && this.eng) {
      const e = this.eng; this.eng = null;
      e.g.gain.setTargetAtTime(0, t, 0.35);
      setTimeout(() => e.srcs.forEach((s) => { try { s.stop(); } catch (er) { /* already stopped */ } }), 2000);
    }
  }
  // keying the radio: a burst of static and the roger beep
  squelch() {
    if (!this.ctx) return;
    this.burst({ dur: 0.22, f: 1800, q: 0.7, gain: 0.22, attack: 0.005 });
    this.tone({ t: 0.2, f0: 1250, f1: 1250, dur: 0.07, gain: 0.05, type: 'square' });
  }
  // a voice over the radio, as garble: syllables of band-limited noise under a hiss
  chatter(dur) {
    if (!this.ctx) return;
    this.burst({ dur, f: 2200, q: 0.4, gain: 0.03, attack: 0.05 });
    for (let x = 0; x < dur - 0.15; x += rnd(0.09, 0.2)) {
      if (Math.random() < 0.12) { x += 0.15; continue; }
      this.burst({ t: x, dur: rnd(0.05, 0.13), f: rnd(450, 1500), q: rnd(2, 5), gain: rnd(0.12, 0.26), attack: 0.012 });
    }
  }
  truckDoor(open) {
    if (!this.ctx) return;
    this.burst({ dur: 0.05, f: 2400, q: 4, gain: 0.2 });
    this.tone({ t: 0.03, f0: open ? 140 : 110, f1: 60, dur: 0.18, gain: 0.45, attack: 0.004 });
    this.burst({ t: 0.03, dur: 0.2, f: 300, q: 1, gain: 0.35, buf: this.brown });
  }
  shutterRoll(dur = 2.4) {
    if (!this.ctx) return;
    const f = this.burst({ dur, f: 140, q: 1.5, gain: 0.8, attack: 0.25, buf: this.brown });
    f.frequency.linearRampToValueAtTime(230, this.ctx.currentTime + dur);
    for (let i = 0; i < dur * 7; i++) this.burst({ t: i / 7 + rnd(0, 0.08), dur: 0.05, f: rnd(700, 1500), q: 6, gain: 0.14 });
    this.tone({ t: dur, f0: 90, f1: 45, dur: 0.35, gain: 0.5 });
  }
  // the shutter coming down behind you
  slam() {
    if (!this.ctx) return;
    this.shutterRoll(0.7);
    this.tone({ t: 0.75, f0: 75, f1: 30, dur: 0.9, gain: 1.0, attack: 0.004 });
    this.burst({ t: 0.75, dur: 0.6, f: 220, q: 0.8, gain: 0.7, buf: this.brown });
    this.burst({ t: 0.76, dur: 0.25, f: 1800, q: 2, gain: 0.25 });
  }

  // ------------------------------------------------------------ ambience
  startAmbience() {
    const ctx = this.ctx;
    // low factory drone, slowly breathing
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 170; lp.Q.value = 0.8;
    const dg = ctx.createGain(); dg.gain.value = 0.065;
    lp.connect(dg); dg.connect(this.amb);
    for (const [f, type, g] of [[41.2, 'sawtooth', 0.5], [41.55, 'sawtooth', 0.5], [55, 'sine', 0.6], [82.4, 'triangle', 0.15]]) {
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = f;
      const og = ctx.createGain(); og.gain.value = g; o.connect(og); og.connect(lp); o.start();
    }
    const lfo = ctx.createOscillator(); lfo.frequency.value = 0.045;
    const lg = ctx.createGain(); lg.gain.value = 70; lfo.connect(lg); lg.connect(lp.frequency); lfo.start();
    // room tone
    const rt = this.loop(this.brown, this.amb, 0.035);
    const rf = ctx.createBiquadFilter(); rf.type = 'lowpass'; rf.frequency.value = 380;
    rt.s.disconnect(); rt.s.connect(rf); rf.connect(rt.g);
    // distant ventilation hiss
    const vh = this.loop(this.white, this.amb, 0.006);
    const vf = ctx.createBiquadFilter(); vf.type = 'bandpass'; vf.frequency.value = 2400; vf.Q.value = 0.5;
    vh.s.disconnect(); vh.s.connect(vf); vf.connect(vh.g);
  }

  // random sounds of the building around you
  ambientEvent(listener) {
    const k = Math.random();
    const ang = Math.random() * Math.PI * 2, d = rnd(4, 14);
    const x = listener.x + Math.cos(ang) * d, z = listener.z + Math.sin(ang) * d;
    if (k < 0.3) {
      // metal groan: resonant noise sweeping down
      const p = this.panner(x, 4, z, 3, 0.6); p.connect(this.amb);
      const f = this.burst({ dest: p, dur: rnd(1.2, 2.4), f: rnd(300, 700), q: 18, gain: 0.5, attack: 0.4, buf: this.brown, rate: 1 });
      f.frequency.exponentialRampToValueAtTime(rnd(120, 260), this.ctx.currentTime + 2);
    } else if (k < 0.6) {
      // water drip
      const p = this.panner(x, 0.2, z, 1.5, 1); p.connect(this.amb);
      const f0 = rnd(900, 1600);
      this.tone({ dest: p, f0, f1: f0 * 2.2, dur: 0.06, gain: 0.25 });
      if (Math.random() < 0.5) this.tone({ dest: p, t: rnd(0.3, 0.6), f0: f0 * 1.1, f1: f0 * 2.4, dur: 0.05, gain: 0.15 });
    } else if (k < 0.78) {
      // a far clank
      const p = this.panner(x, 2, z, 4, 0.5); p.connect(this.amb);
      this.burst({ dest: p, dur: 0.5, f: rnd(500, 1200), q: 12, gain: 0.4 });
      this.tone({ dest: p, f0: rnd(140, 220), f1: 60, dur: 0.4, gain: 0.2 });
    } else {
      // something small scuttling somewhere
      const p = this.panner(x, 0.1, z, 1, 1.2); p.connect(this.amb);
      const s = this.ctx.createBufferSource(); s.buffer = this.skitBufs[Math.floor(Math.random() * 3)];
      const g = this.ctx.createGain(), now = this.ctx.currentTime, dur = rnd(0.6, 1.4);
      g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.25, now + 0.1); g.gain.linearRampToValueAtTime(0, now + dur);
      s.connect(g); g.connect(p); s.start(now, Math.random() * 1.5); s.stop(now + dur + 0.05);
    }
  }

  // ------------------------------------------------------------ chase layer
  startTension() {
    const ctx = this.ctx;
    this.tenGain = ctx.createGain(); this.tenGain.gain.value = 0; this.tenGain.connect(this.mus);
    // dissonant string-ish cluster: detuned saws through a moving band-pass, with tremolo
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 900; bp.Q.value = 1.2;
    const trem = ctx.createGain(); trem.gain.value = 0.7;
    bp.connect(trem); trem.connect(this.tenGain);
    for (const f of [110, 116.5, 164.8, 174.6, 233.1]) for (const det of [-6, 7]) {
      const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.detune.value = det;
      const g = ctx.createGain(); g.gain.value = 0.05; o.connect(g); g.connect(bp); o.start();
    }
    const tl = ctx.createOscillator(); tl.frequency.value = 6.5;
    const tlg = ctx.createGain(); tlg.gain.value = 0.3; tl.connect(tlg); tlg.connect(trem.gain); tl.start();
    const sweep = ctx.createOscillator(); sweep.frequency.value = 0.11;
    const sg = ctx.createGain(); sg.gain.value = 500; sweep.connect(sg); sg.connect(bp.frequency); sweep.start();
    // high glassy harmonics
    this.highGain = ctx.createGain(); this.highGain.gain.value = 0; this.highGain.connect(this.mus);
    for (const f of [2637, 2794, 3136]) {
      const o = ctx.createOscillator(); o.frequency.value = f;
      const g = ctx.createGain(); g.gain.value = 0.012; o.connect(g); g.connect(this.highGain); o.start();
      const v = ctx.createOscillator(); v.frequency.value = rnd(4, 7); const vg = ctx.createGain(); vg.gain.value = 9; v.connect(vg); vg.connect(o.frequency); v.start();
    }
  }

  heartbeat(level) {
    const g = 0.35 + level * 0.5;
    this.tone({ dest: this.mus, f0: 62, f1: 38, dur: 0.16, gain: g, attack: 0.008 });
    this.tone({ dest: this.mus, t: 0.22, f0: 55, f1: 34, dur: 0.2, gain: g * 0.7, attack: 0.01 });
  }

  // ------------------------------------------------------------ effects
  step(kind, side) {
    if (!this.ctx) return;
    const g = (kind === 'run' ? 0.55 : kind === 'crouch' ? 0.12 : 0.32) * rnd(0.85, 1.1);
    const pan = (side ? 0.12 : -0.12) + rnd(-0.03, 0.03);
    // rubber boot on concrete: a soft heel thud, then the sole rolling and scuffing off
    this.tone({ f0: rnd(70, 85) * (kind === 'run' ? 1.15 : 1), f1: 42, dur: 0.11, gain: g * 0.7, attack: 0.012, pan });
    this.burst({ dur: 0.09, f: rnd(380, 520), q: 0.8, gain: g * 0.55, attack: 0.012, buf: this.brown, pan });
    this.burst({ t: rnd(0.03, 0.05), dur: kind === 'run' ? 0.1 : 0.13, f: rnd(900, 1300), q: 0.6, gain: g * 0.22, attack: 0.025, pan });
    // the suit rustles with each step
    if (kind !== 'crouch') this.burst({ dur: 0.14, f: 3200, q: 0.6, gain: g * 0.07, t: 0.03, attack: 0.03, buf: this.white, pan: -pan });
  }

  click(on) {
    if (!this.ctx) return;
    this.burst({ dur: 0.012, f: 3800, q: 3, gain: 0.35, pan: 0.3 });
    this.tone({ f0: 3200, f1: 2600, dur: 0.03, gain: 0.05, pan: 0.3 });
    this.burst({ t: 0.06, dur: 0.01, f: on ? 4300 : 3500, q: 3, gain: 0.25, pan: 0.3 });
  }

  shakeOff() {
    if (!this.ctx) return;
    this.burst({ dur: 0.35, f: 3500, q: 0.6, gain: 0.32, attack: 0.02 });
    this.burst({ t: 0.08, dur: 0.25, f: 5200, q: 0.8, gain: 0.18, attack: 0.01 });
    this.tone({ t: 0.32, f0: 160, f1: 70, dur: 0.06, gain: 0.25 });
    this.burst({ t: 0.33, dur: 0.05, f: 2500, q: 2, gain: 0.25 });
  }

  attach() {
    if (!this.ctx) return;
    this.burst({ dur: 0.18, f: 4500, q: 0.8, gain: 0.25, attack: 0.005 });
    this.tone({ f0: 220, f1: 90, dur: 0.08, gain: 0.16 });
  }

  // something flew at your face
  scareLaunch(x, y, z) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime;
    // stinger: low boom + screeching cluster
    this.tone({ dest: this.mus, f0: 70, f1: 30, dur: 1.2, gain: 0.9, attack: 0.01 });
    for (const f of [740, 784, 1046, 1108]) this.tone({ dest: this.mus, f0: f, f1: f * 0.94, dur: 1.1, gain: 0.07, type: 'sawtooth', attack: 0.02 });
    this.burst({ dest: this.mus, dur: 0.6, f: 2000, q: 0.5, gain: 0.5, attack: 0.005 });
    // the wings
    const p = this.panner(x, y, z, 0.6, 1.4); p.connect(this.sfx);
    const l = this.loop(this.buzzBuf, p, 0, 1);
    l.g.gain.setValueAtTime(0, now); l.g.gain.linearRampToValueAtTime(0.7, now + 0.15);
    this.flyerSrc = { ...l, p };
  }
  flyerAt(x, y, z) { if (this.flyerSrc) this.setPos(this.flyerSrc.p, x, y, z); }
  scareHit() {
    if (!this.ctx) return;
    this.tone({ f0: 140, f1: 50, dur: 0.18, gain: 0.7 });
    this.burst({ dur: 0.25, f: 3000, q: 0.7, gain: 0.6 });
    if (this.flyerSrc) {
      const now = this.ctx.currentTime, f = this.flyerSrc;
      f.g.gain.setTargetAtTime(0, now + 0.4, 0.08); f.s.stop(now + 1);
      this.flyerSrc = null;
    }
  }

  generatorStart(x, z) {
    if (!this.ctx) return;
    const p = this.panner(x, 1, z, 2, 1); p.connect(this.sfx);
    // starter cranks, coughs, catches
    for (let i = 0; i < 3; i++) {
      this.tone({ dest: p, t: i * 0.45, f0: 60, f1: 140, dur: 0.35, gain: 0.35, type: 'sawtooth' });
      this.burst({ dest: p, t: i * 0.45 + 0.3, dur: 0.12, f: 400, q: 1, gain: 0.4, buf: this.brown });
    }
    const now = this.ctx.currentTime;
    const l = this.loop(this.genBuf, p, 0, 1);
    l.g.gain.setValueAtTime(0, now + 1.3); l.g.gain.linearRampToValueAtTime(0.9, now + 2.2);
    this.genSrc.set(`${x},${z}`, l);
  }

  lampOn(x, z) {
    if (!this.ctx) return;
    const p = this.panner(x, 2.6, z, 1.5, 1.2); p.connect(this.sfx);
    this.tone({ dest: p, f0: 180, f1: 70, dur: 0.12, gain: 0.5 });
    this.burst({ dest: p, dur: 0.06, f: 1800, q: 4, gain: 0.4 });
    const l = this.loop(this.lampBuf, p, 0.0, 1);
    l.g.gain.setTargetAtTime(0.35, this.ctx.currentTime + 0.1, 0.1);
    this.lampSrc.set(`${x},${z}`, { ...l, p });
  }
  lampLevel(x, z, k) {
    const l = this.lampSrc.get(`${x},${z}`);
    if (l) l.g.gain.setTargetAtTime(0.35 * k, this.ctx.currentTime, 0.01);
  }
  lampPop(x, z) {
    if (!this.ctx) return;
    const l = this.lampSrc.get(`${x},${z}`);
    const p = this.panner(x, 2.6, z, 1.5, 1.1); p.connect(this.sfx);
    this.burst({ dest: p, dur: 0.08, f: 2500, q: 0.6, gain: 0.9, attack: 0.001 });
    for (let i = 0; i < 6; i++) this.tone({ dest: p, t: 0.05 + Math.random() * 0.4, f0: rnd(3000, 6000), f1: rnd(2500, 5000), dur: 0.04, gain: 0.06 });
    if (l) { l.g.gain.setTargetAtTime(0, this.ctx.currentTime, 0.02); l.s.stop(this.ctx.currentTime + 0.3); this.lampSrc.delete(`${x},${z}`); }
  }

  doorRumble(x, z, dur = 2.5) {
    if (!this.ctx) return;
    const p = this.panner(x, 2, z, 3, 0.8); p.connect(this.sfx);
    const f = this.burst({ dest: p, dur, f: 140, q: 1.5, gain: 0.9, attack: 0.2, buf: this.brown });
    f.frequency.linearRampToValueAtTime(220, this.ctx.currentTime + dur);
    for (let i = 0; i < dur * 6; i++) this.burst({ dest: p, t: i / 6 + rnd(0, 0.1), dur: 0.05, f: rnd(700, 1400), q: 6, gain: 0.15 });
    this.tone({ dest: p, t: dur, f0: 90, f1: 40, dur: 0.4, gain: 0.6 });
  }

  paper() {
    if (!this.ctx) return;
    for (let i = 0; i < 4; i++) this.burst({ t: i * 0.07, dur: 0.08, f: rnd(2500, 5000), q: 0.8, gain: 0.25 });
  }

  spray(empty = false) {
    if (!this.ctx) return;
    if (empty) { for (let i = 0; i < 3; i++) this.burst({ t: i * 0.09, dur: 0.05, f: 4000, q: 1, gain: 0.2, type: 'highpass' }); this.tone({ f0: 300, f1: 260, dur: 0.05, gain: 0.08 }); return; }
    this.burst({ dur: 0.012, f: 2500, q: 2, gain: 0.3, pan: -0.3 });                       // valve click
    const f = this.burst({ t: 0.01, dur: 0.75, f: 5200, q: 0.5, gain: 0.55, attack: 0.03, pan: -0.25 });
    f.frequency.setValueAtTime(5200, this.ctx.currentTime); f.frequency.linearRampToValueAtTime(3800, this.ctx.currentTime + 0.8);
    this.burst({ t: 0.02, dur: 0.6, f: 9000, q: 0.7, gain: 0.25, attack: 0.04, type: 'highpass', pan: -0.25 });
  }

  // a roach taking off and flying away: a short whirr of wings
  wingTakeoff(x, z, dur) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, p = this.panner(x, 0.6, z, 1.2, 1.2); p.connect(this.sfx);
    const l = this.loop(this.buzzBuf, p, 0, 1.25);
    l.g.gain.setValueAtTime(0, now); l.g.gain.linearRampToValueAtTime(0.4, now + 0.08);
    l.g.gain.setValueAtTime(0.4, now + dur * 0.6); l.g.gain.linearRampToValueAtTime(0, now + dur + 0.1);
    l.s.stop(now + dur + 0.2);
    this.burst({ dest: p, dur: 0.06, f: 3000, q: 0.8, gain: 0.15 });
  }

  threadSnap(x, y, z) {
    if (!this.ctx) return;
    const p = this.panner(x, y, z, 1, 1); p.connect(this.sfx);
    this.tone({ dest: p, f0: 2600, f1: 1900, dur: 0.18, gain: 0.25 });
    this.tone({ dest: p, f0: 5200, f1: 3800, dur: 0.08, gain: 0.08 });
    this.burst({ dest: p, dur: 0.02, f: 6000, q: 2, gain: 0.25 });
  }

  creak(x, y, z) {
    if (!this.ctx) return;
    const ctx = this.ctx, now = ctx.currentTime, p = this.panner(x, y, z, 2, 0.9); p.connect(this.sfx);
    // a silk line stretching: a thin, grinding squeal that bends in pitch
    const o = ctx.createOscillator(); o.type = 'sawtooth';
    o.frequency.setValueAtTime(240, now); o.frequency.linearRampToValueAtTime(310, now + 0.25); o.frequency.linearRampToValueAtTime(200, now + 0.6);
    const vib = ctx.createOscillator(); vib.frequency.value = 23; const vg = ctx.createGain(); vg.gain.value = 18; vib.connect(vg); vg.connect(o.frequency);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1500; bp.Q.value = 9;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(0.5, now + 0.05); g.gain.linearRampToValueAtTime(0.3, now + 0.45); g.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
    o.connect(bp); bp.connect(g); g.connect(p);
    o.start(now); vib.start(now); o.stop(now + 0.75); vib.stop(now + 0.75);
  }

  // ---- sounds that were missing
  // taking damage: a dull blow, the suit crumpling, a caught breath
  hurt() {
    if (!this.ctx) return;
    this.tone({ f0: 95, f1: 38, dur: 0.22, gain: 0.75, attack: 0.004 });
    this.burst({ dur: 0.16, f: 700, q: 0.7, gain: 0.45, buf: this.brown });
    this.burst({ t: 0.02, dur: 0.22, f: 3600, q: 0.6, gain: 0.16, attack: 0.01 });
    this.burst({ t: 0.12, dur: 0.32, f: 1400, q: 2.2, gain: 0.16, attack: 0.04 });   // gasp
  }
  // getting up again under the lamp: a deep, shaky breath in and out
  respawn() {
    if (!this.ctx) return;
    this.burst({ dur: 0.9, f: 1100, q: 1.4, gain: 0.2, attack: 0.35 });
    this.burst({ t: 1.1, dur: 1.0, f: 800, q: 1.2, gain: 0.16, attack: 0.08 });
    this.tone({ dest: this.mus, f0: 110, f1: 104, dur: 2.2, gain: 0.18, attack: 0.4 });
  }
  // shaking the new can: the mixing ball rattling
  canRattle() {
    if (!this.ctx) return;
    for (let i = 0; i < 7; i++) {
      const t = i * 0.085 + rnd(-0.01, 0.01);
      this.tone({ t, f0: rnd(2300, 2700), f1: rnd(1900, 2200), dur: 0.035, gain: 0.12 });
      this.burst({ t, dur: 0.03, f: 5200, q: 3, gain: 0.1 });
    }
    this.burst({ t: 0.65, dur: 0.12, f: 900, q: 1, gain: 0.12, buf: this.brown });
  }
  // tearing loose from a spider: a shove, legs scraping off the suit, it lands and scuttles away
  escape(x, y, z) {
    if (!this.ctx) return;
    this.tone({ f0: 150, f1: 60, dur: 0.12, gain: 0.45 });
    this.burst({ dur: 0.25, f: 4200, q: 0.8, gain: 0.25, attack: 0.01 });
    const p = this.panner(x, y, z, 1.5, 1); p.connect(this.sfx);
    this.tone({ dest: p, t: 0.25, f0: 110, f1: 50, dur: 0.1, gain: 0.4 });
    for (let i = 0; i < 12; i++) this.burst({ dest: p, t: 0.3 + i * 0.045, dur: 0.012, f: rnd(700, 1400), q: 2, gain: 0.22 * (1 - i / 14) });
  }
  // a big spider waking: legs scraping against the wall, then a dry, rising chitter
  spiderWake(x, y, z) {
    if (!this.ctx) return;
    const p = this.panner(x, y, z, 2.2, 0.9); p.connect(this.sfx);
    for (let i = 0; i < 9; i++) this.burst({ dest: p, t: i * 0.06 + rnd(0, 0.02), dur: 0.05, f: rnd(500, 1100), q: 1.5, gain: 0.3, buf: this.brown });
    const ctx = this.ctx, now = ctx.currentTime;
    const o = ctx.createOscillator(); o.type = 'square';
    o.frequency.setValueAtTime(38, now + 0.4); o.frequency.linearRampToValueAtTime(70, now + 1.1);
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2400; bp.Q.value = 3;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, now + 0.4); g.gain.linearRampToValueAtTime(0.22, now + 0.7); g.gain.exponentialRampToValueAtTime(0.001, now + 1.3);
    o.connect(bp); bp.connect(g); g.connect(p);
    o.start(now + 0.4); o.stop(now + 1.35);
    this.tone({ dest: this.mus, f0: 62, f1: 48, dur: 1.4, gain: 0.35, attack: 0.05 });
  }
  // a spider recoiling from the beam: a sharp hiss and a burst of steps
  spiderFlinch(x, y, z) {
    if (!this.ctx) return;
    const p = this.panner(x, y, z, 2, 1); p.connect(this.sfx);
    this.burst({ dest: p, dur: 0.35, f: 5200, q: 0.7, gain: 0.3, attack: 0.008, type: 'highpass' });
    for (let i = 0; i < 8; i++) this.burst({ dest: p, t: 0.05 + i * 0.04, dur: 0.012, f: rnd(800, 1500), q: 2, gain: 0.2 });
  }
  // roaches caught in the spray: little crackles and a wet hiss
  roachDie(n = 1) {
    if (!this.ctx) return;
    for (let i = 0; i < Math.min(6, n * 2); i++) this.burst({ t: 0.15 + Math.random() * 0.5, dur: 0.015, f: rnd(2500, 4500), q: 3, gain: 0.12 });
  }
  // the egg sac hitting the floor
  sacDrop(x, z) {
    if (!this.ctx) return;
    const p = this.panner(x, 0.2, z, 1.5, 1); p.connect(this.sfx);
    this.tone({ dest: p, f0: 140, f1: 70, dur: 0.12, gain: 0.35 });
    this.burst({ dest: p, dur: 0.18, f: 1200, q: 1.2, gain: 0.3, buf: this.brown });
  }
  // the flashlight: a faint electrical crackle when it stutters, and a dying fizzle when it gives out
  flashCrackle() { if (this.ctx) for (let i = 0; i < 3; i++) this.burst({ t: i * 0.03 + Math.random() * 0.02, dur: 0.008, f: rnd(5000, 8000), q: 2, gain: 0.07, pan: 0.3 }); }
  // the flashlight overheats: crackle, a pop as the thermal cut-out trips, a short hiss
  overheat() {
    if (!this.ctx) return;
    this.tone({ f0: 1900, f1: 600, dur: 0.35, gain: 0.05, type: 'sawtooth', pan: 0.3 });
    for (let i = 0; i < 5; i++) this.burst({ t: i * 0.06, dur: 0.01, f: 6000, q: 2, gain: 0.08, pan: 0.3 });
    this.burst({ t: 0.32, dur: 0.012, f: 3200, q: 3, gain: 0.25, pan: 0.3 });
    this.burst({ t: 0.36, dur: 0.6, f: 5200, q: 0.7, gain: 0.05, attack: 0.04, pan: 0.3 });
  }
  // the power dies: a relay clunk, everything electrical winding down, the building's hum gone
  blackout() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    this.burst({ dur: 0.06, f: 180, q: 1.2, gain: 0.8, buf: this.brown });
    this.burst({ t: 0.02, dur: 0.02, f: 2600, q: 4, gain: 0.25 });
    this.tone({ f0: 120, f1: 28, dur: 1.5, gain: 0.22, type: 'sawtooth' });
    this.tone({ f0: 3400, f1: 240, dur: 1.0, gain: 0.025 });
    this.amb.gain.cancelScheduledValues(now); this.amb.gain.setTargetAtTime(0.12, now, 0.15); this.amb.gain.setTargetAtTime(0.9, now + 3.0, 0.4);
  }
  // and comes back: a thump, the tubes ticking and buzzing on
  powerBack() {
    if (!this.ctx) return;
    this.burst({ dur: 0.07, f: 140, q: 1, gain: 0.6, buf: this.brown });
    for (let i = 0; i < 5; i++) this.burst({ t: 0.04 + i * 0.07 + Math.random() * 0.05, dur: 0.012, f: rnd(3600, 5200), q: 3, gain: 0.09 });
    this.tone({ t: 0.05, f0: 100, f1: 100, dur: 0.6, gain: 0.05, type: 'sawtooth' });
  }
  // finding something you didn't want to: a low swell that won't resolve
  sting() {
    if (!this.ctx) return;
    for (const [f, d] of [[73.4, 0], [77.8, 0.05], [110, 0.1], [155.6, 0.2]]) this.tone({ dest: this.mus, t: d, f0: f, f1: f * 0.985, dur: 2.6, gain: 0.12, type: 'sawtooth', attack: 0.6 });
    this.burst({ dest: this.mus, dur: 2.2, f: 900, q: 0.6, gain: 0.05, attack: 0.8, buf: this.brown });
  }
  // the metal ticking as it cools
  coolTick() { if (this.ctx) this.burst({ dur: 0.006, f: rnd(3800, 5600), q: 6, gain: rnd(0.03, 0.06), pan: 0.3 }); }
  // crouching / standing: the suit rustling
  rustle(down) {
    if (!this.ctx) return;
    this.burst({ dur: 0.28, f: down ? 2600 : 3200, q: 0.6, gain: 0.09, attack: 0.05 });
    this.burst({ t: 0.05, dur: 0.12, f: 500, q: 0.8, gain: 0.08, buf: this.brown });
  }
  // out through the shutter: wind and open air swell in
  win() {
    if (!this.ctx) return;
    this.burst({ dest: this.mus, dur: 4.0, f: 500, q: 0.5, gain: 0.35, attack: 1.5, buf: this.brown });
    this.burst({ dest: this.mus, t: 0.5, dur: 3.5, f: 2200, q: 0.4, gain: 0.08, attack: 1.2 });
    for (const [f, t] of [[220, 0.4], [277, 0.9], [330, 1.4]]) this.tone({ dest: this.mus, t, f0: f, f1: f, dur: 3.2, gain: 0.05, attack: 0.6, type: 'triangle' });
  }

  grab() {
    if (!this.ctx) return;
    this.tone({ f0: 120, f1: 45, dur: 0.3, gain: 0.8 });
    this.burst({ dur: 0.5, f: 3200, q: 0.8, gain: 0.6, attack: 0.005 });
    this.burst({ dest: this.mus, dur: 1.2, f: 600, q: 6, gain: 0.35, attack: 0.02, buf: this.brown });
  }
  struggle() { if (this.ctx) this.burst({ dur: 0.08, f: 2600 + Math.random() * 1500, q: 1, gain: 0.25 }); }

  webTear(x, z) {
    if (!this.ctx) return;
    const p = this.panner(x, 1.4, z, 1.5, 1); p.connect(this.sfx);
    for (let i = 0; i < 14; i++) this.burst({ dest: p, t: i * 0.035 + Math.random() * 0.02, dur: 0.03, f: 3000 + Math.random() * 4000, q: 4, gain: 0.25 });
  }
  webMelt(x, z) {
    if (!this.ctx) return;
    const p = this.panner(x, 1.4, z, 1.5, 1); p.connect(this.sfx);
    this.burst({ dest: p, dur: 1.0, f: 7000, q: 0.6, gain: 0.3, attack: 0.05, type: 'highpass' });
    for (let i = 0; i < 18; i++) this.burst({ dest: p, t: Math.random() * 0.9, dur: 0.02, f: 5000, q: 2, gain: 0.15 });
  }

  eggBurst(x, y, z) {
    if (!this.ctx) return;
    const p = this.panner(x, y, z, 2, 0.9); p.connect(this.sfx);
    this.tone({ dest: p, f0: 90, f1: 40, dur: 0.25, gain: 0.7 });
    this.burst({ dest: p, dur: 0.35, f: 900, q: 1.5, gain: 0.6, buf: this.brown });
    this.burst({ dest: p, t: 0.05, dur: 1.4, f: 4500, q: 0.7, gain: 0.35, attack: 0.1 });
  }

  // the centipede bursting out of the vent: silence first, then this
  ventBurst(x, z) {
    if (!this.ctx) return;
    const p = this.panner(x, 0.6, z, 3, 0.7); p.connect(this.sfx);
    this.burst({ dest: p, dur: 0.4, f: 1800, q: 10, gain: 0.9, attack: 0.001 });
    this.tone({ dest: p, f0: 420, f1: 300, dur: 0.6, gain: 0.25, type: 'square' });
    this.tone({ dest: this.mus, f0: 60, f1: 28, dur: 1.6, gain: 1.0, attack: 0.01 });
    for (const f of [622, 659, 932, 988]) this.tone({ dest: this.mus, f0: f, f1: f * 0.9, dur: 1.4, gain: 0.07, type: 'sawtooth', attack: 0.02 });
    this.centiScreech(x, z, 0.1);
  }
  centiScreech(x, z, t = 0) {
    if (!this.ctx) return;
    const p = this.panner(x, 0.5, z, 2, 0.9); p.connect(this.sfx);
    const f = this.burst({ dest: p, t, dur: 0.7, f: 2200, q: 8, gain: 0.6, attack: 0.02 });
    f.frequency.setValueAtTime(2200, this.ctx.currentTime + t); f.frequency.exponentialRampToValueAtTime(900, this.ctx.currentTime + t + 0.7);
  }
  centiHiss(x, z) { if (this.ctx) { const p = this.panner(x, 0.5, z, 2, 0.9); p.connect(this.sfx); this.burst({ dest: p, dur: 0.6, f: 3500, q: 1.2, gain: 0.45, attack: 0.03 }); } }

  // a beat of near-silence before something big
  silence(sec) {
    if (!this.ctx || this.muted) return;
    const now = this.ctx.currentTime;
    for (const bus of [this.amb, this.mus, this.sfx]) { bus.gain.cancelScheduledValues(now); bus.gain.setTargetAtTime(0.03, now, 0.08); bus.gain.setTargetAtTime(bus === this.amb ? 0.9 : bus === this.mus ? 0.8 : 1.0, now + sec, 0.02); }
  }
  death() { if (this.ctx) { this.tone({ dest: this.mus, f0: 55, f1: 25, dur: 2.0, gain: 1.0 }); this.burst({ dest: this.mus, dur: 0.8, f: 300, q: 1, gain: 0.5, buf: this.brown }); } }

  // a restart: silence everything that was running in the level
  resetWorld() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    for (const l of [...this.genSrc.values(), ...this.lampSrc.values()]) { l.g.gain.setTargetAtTime(0, now, 0.05); l.s.stop(now + 0.4); }
    this.genSrc.clear(); this.lampSrc.clear();
    if (this.flyerSrc) { this.flyerSrc.s.stop(now + 0.1); this.flyerSrc = null; }
    this.intensity = 0;
  }

  // ------------------------------------------------------------ individual bugs
  // the closest few moving bugs each get a voice that follows them; a voice keeps its bug
  // as long as it stays among the closest, and only fully silent voices are handed on.
  updateVoices(emit, dt, now) {
    const N = 6, GAIN = { roach: 1.1, ling: 1.0, big: 1.5, tiny: 0.6 };
    if (!this.voices) { this.voices = []; for (let i = 0; i < N; i++) this.voices.push({ sp: this.spot(0, 0.1, 0, 1.0, 1.4), src: null, g: null, kind: null, key: null, c: null, idle: 1 }); }
    const cands = emit.slice().sort((a, b) => a.d - b.d).slice(0, N);
    const taken = new Set();
    for (const v of this.voices) {
      const c = v.key ? cands.find((c) => c.key === v.key) : null;
      if (c) { v.c = c; taken.add(c.key); } else { if (v.key) { v.key = null; v.idle = 0; } v.c = null; }
    }
    for (const c of cands) {
      if (taken.has(c.key)) continue;
      const v = this.voices.find((v) => !v.key && v.idle > 0.15);
      if (!v) break;
      if (v.kind !== c.kind) {
        if (v.src) { v.src.stop(); v.g.disconnect(); }
        const l = this.loop(this.stepBufs[c.kind], v.sp.in, 0, 1);
        v.src = l.s; v.g = l.g; v.kind = c.kind;
      }
      v.key = c.key; v.c = c; taken.add(c.key);
      this.place(v.sp, c.x, c.y, c.z, true);
    }
    for (const v of this.voices) {
      if (v.c) {
        this.place(v.sp, v.c.x, v.c.y, v.c.z);
        v.g.gain.setTargetAtTime(GAIN[v.kind] * v.c.sp, now, 0.04);
        v.src.playbackRate.setTargetAtTime(0.7 + 0.5 * v.c.sp, now, 0.1);
      } else {
        v.idle += dt;
        if (v.g) v.g.gain.setTargetAtTime(0, now, 0.04);
      }
    }
  }

  // ------------------------------------------------------------ per frame
  // s: { dt, camera, swarms:[{x,z,moving}], near:{x,z,d}|null, attached, intensity, gens:[{x,z,on}], pounce }
  update(s) {
    if (!this.ctx || this.ctx.state !== 'running') return;
    const ctx = this.ctx, now = ctx.currentTime, L = ctx.listener;
    this.t += s.dt;
    // the listener is the camera
    const c = s.camera, p = c.position, f = this._f || (this._f = { x: 0, y: 0, z: 0 });
    const e = c.matrixWorld.elements;
    f.x = -e[8]; f.y = -e[9]; f.z = -e[10];
    if (L.positionX) {
      L.positionX.setTargetAtTime(p.x, now, 0.02); L.positionY.setTargetAtTime(p.y, now, 0.02); L.positionZ.setTargetAtTime(p.z, now, 0.02);
      L.forwardX.setTargetAtTime(f.x, now, 0.02); L.forwardY.setTargetAtTime(f.y, now, 0.02); L.forwardZ.setTargetAtTime(f.z, now, 0.02);
      L.upX.setTargetAtTime(e[4], now, 0.02); L.upY.setTargetAtTime(e[5], now, 0.02); L.upZ.setTargetAtTime(e[6], now, 0.02);
    } else { L.setPosition(p.x, p.y, p.z); L.setOrientation(f.x, f.y, f.z, e[4], e[5], e[6]); }
    { const fl = Math.hypot(f.x, f.z) || 1; this._lis = { x: p.x, z: p.z, fx: f.x / fl, fz: f.z / fl }; }

    // swarm skitter, one positional loop per swarm
    s.swarms.forEach((w, i) => {
      if (!this.swarmSrc[i]) {
        const sp = this.spot(w.x, 0.15, w.z, 1.2, 1.25);
        const l = this.loop(this.skitBufs[i % 3], sp.in, 0, 0.9 + (i % 3) * 0.12);
        this.swarmSrc[i] = { ...l, sp };
      }
      const src = this.swarmSrc[i];
      this.place(src.sp, w.x, 0.15, w.z);
      src.g.gain.setTargetAtTime(Math.min(1, w.moving / 6) * 0.24 + (w.moving > 0 ? 0.015 : 0), now, 0.12);
    });
    // every bug close by gets its own footsteps on its own voice
    this.updateVoices(s.emit || [], s.dt, now);
    // crawling on you
    if (!this.onMe) {
      this.onMe = { crinkle: this.loop(this.crinkleBuf, this.sfx, 0, 1), skit: this.loop(this.skitBufs[2], this.sfx, 0, 1.4) };
    }
    const a = Math.min(3, s.attached);
    this.onMe.crinkle.g.gain.setTargetAtTime(a ? 0.18 + a * 0.07 : 0, now, 0.05);
    this.onMe.skit.g.gain.setTargetAtTime(a ? 0.1 + a * 0.05 : 0, now, 0.05);
    if (s.pounce) this.burst({ dur: 0.3, f: 5000, q: 0.7, gain: 0.1, attack: 0.03 });
    // the centipede: faster ticks the faster it runs, so you can hear how close it is
    if (!this.tapSrc) { const sp = this.spot(0, 0.3, 0, 1.6, 1.0); this.tapSrc = { ...this.loop(this.tapBuf, sp.in, 0, 0.6), sp }; }
    if (s.centi) {
      this.place(this.tapSrc.sp, s.centi.x, 0.3, s.centi.z);
      const v = Math.min(1, s.centi.speed / 4.5);
      this.tapSrc.g.gain.setTargetAtTime(s.centi.speed > 0.2 ? 0.35 + v * 0.75 : 0, now, 0.08);
      this.tapSrc.s.playbackRate.setTargetAtTime(0.45 + v * 0.9, now, 0.1);
    } else this.tapSrc.g.gain.setTargetAtTime(0, now, 0.1);
    // the ghost spider running at you: long legs ticking fast on concrete and tiles
    if (!this.ghostSrc) { const sp = this.spot(0, 0.1, 0, 1.4, 1.1); this.ghostSrc = { ...this.loop(this.tapBuf, sp.in, 0, 1.4), sp }; }
    if (s.ghost) { this.place(this.ghostSrc.sp, s.ghost.x, s.ghost.y, s.ghost.z); this.ghostSrc.g.gain.setTargetAtTime(Math.min(1, s.ghost.speed / 4) * 0.35, now, 0.05); }
    else this.ghostSrc.g.gain.setTargetAtTime(0, now, 0.1);
    // the ghost's brood pouring past: a light, dry patter
    if (!this.broodSrc) { const sp = this.spot(0, 0.05, 0, 1.0, 1.3); this.broodSrc = { ...this.loop(this.skitBufs[2], sp.in, 0, 1.9), sp }; }
    if (s.brood && s.brood.moving) { this.place(this.broodSrc.sp, s.brood.cx, 0.05, s.brood.cz); this.broodSrc.g.gain.setTargetAtTime(Math.min(0.22, s.brood.moving / 60), now, 0.08); }
    else this.broodSrc.g.gain.setTargetAtTime(0, now, 0.15);
    if (!this.lingSrc) { const sp = this.spot(0, 0.1, 0, 1.2, 1.2); this.lingSrc = { ...this.loop(this.skitBufs[0], sp.in, 0, 1.5), sp }; }
    if (s.lings && s.lings.moving) { this.place(this.lingSrc.sp, s.lings.cx, 0.1, s.lings.cz); this.lingSrc.g.gain.setTargetAtTime(Math.min(0.45, s.lings.moving / 20), now, 0.1); }
    else this.lingSrc.g.gain.setTargetAtTime(0, now, 0.15);

    // chase music follows how close the hunt is
    this.intensity += (s.intensity - this.intensity) * Math.min(1, s.dt * (s.intensity > this.intensity ? 2.5 : 0.5));
    const I = this.intensity;
    // hiding: the music drops away and leaves the heartbeat
    const hush = s.hush ? 0.2 : 1;
    this.tenGain.gain.setTargetAtTime(Math.pow(I, 1.4) * 0.5 * hush, now, s.hush ? 0.6 : 0.2);
    this.highGain.gain.setTargetAtTime(Math.max(0, I - 0.4) * 0.6 * hush, now, 0.3);
    if (I > 0.08) {
      this.nextBeat -= s.dt;
      if (this.nextBeat <= 0) { this.heartbeat(I); this.nextBeat = 60 / (58 + I * 70); }
    } else this.nextBeat = 0.2;

    // the building
    this.nextEvent -= s.dt;
    if (this.nextEvent <= 0) { this.ambientEvent(p); this.nextEvent = rnd(3.5, 10); }
  }
}
