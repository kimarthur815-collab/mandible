import { Music } from './music.js';

// Pre-rendered music. The music is synthesised note by note, and its heavy parts (the factory's machine, the
// chases, the escape) can cost a phone's audio more than it can spare while the game is busy drawing (a
// centipede on screen): then the sound breaks up. So once sound is on, each of them is rendered here in the
// background (an OfflineAudioContext: a loop of a few bars, at a few intensities, all in step) and from
// then on plays as looping buffers crossfaded by intensity (loops.js), which costs next to nothing.
// Until a loop is ready, the live synthesis plays as before.
//   inside  the machine heart, 8 bars of 7/8 at T 0.2 / 0.5 / 0.85 (its tempo held, its hum stays live)
//   centi   the centipede's chase, 4 bars at L 0.35 / 0.65 / 0.95;  spider  the spiders' chase, likewise
//   duct    the escape in the duct, 4 blocks at k 0.3 / 0.9;  run  the run for the shutter, 16 bars
//           (it goes back to bar 9: the second time round, with the snare and the higher choir)
const SR = 32000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const LEVELS = { inside: [0.2, 0.5, 0.85], centi: [0.35, 0.65, 0.95], spider: [0.35, 0.65, 0.95], duct: [0.3, 0.9] };
export const INSIDE_E = 60 / 101 / 2;                       // its eighth note, held
export const CENTI_SD = 60 / (148 + 30 * 0.65) / 4, SPIDER_SD = 60 / (134 + 36 * 0.65) / 4;
export const RUN_LOOP = 9.6;

export class Baked {
  constructor(snd) { this.s = snd; this.ready = {}; this.busy = false; this.levels = LEVELS; this.runLoop = RUN_LOOP; }

  // a loop len s long; what rings on past its end is folded back onto its start (from loopFrom), so it joins up
  async render(len, tail, fn, loopFrom = 0) {
    const S = this.s;
    let ctx;
    try { ctx = new OfflineAudioContext(2, Math.ceil((len + tail) * SR), SR); } catch (e) { ctx = new OfflineAudioContext(2, Math.ceil((len + tail) * 44100), 44100); }
    const sr = ctx.sampleRate;
    // a Sound on the offline context: its instruments, none of its graph
    const f = Object.create(Object.getPrototypeOf(S));
    f.ctx = ctx; f.white = S.white; f.brown = S.brown;
    f.master = ctx.createGain(); f.master.connect(ctx.destination); f.sfx = f.mus = f.master; f.revIn = ctx.createGain();
    const out = ctx.createGain(); out.connect(ctx.destination);
    fn(f, out, ctx);
    const buf = await ctx.startRendering();
    const n = Math.round(len * sr), a = Math.round(loopFrom * sr), res = S.ctx.createBuffer(2, n, sr);
    for (let c = 0; c < 2; c++) {
      const d = buf.getChannelData(c), o = d.slice(0, n);
      for (let i = n; i < d.length; i++) o[a + ((i - n) % (n - a))] += d[i];
      res.copyToChannel(o, c);
    }
    return res;
  }

  inside(T) {
    const len = 56 * INSIDE_E;
    return this.render(len, 3, (f, out, ctx) => {
      const mu = new Music(f); mu.fixE = INSIDE_E; mu.tension = T; mu.iDest = out;
      const P = ctx.createBiquadFilter(); P.type = 'lowpass'; P.Q.value = 0.7; P.frequency.value = 260 + Math.pow(T, 1.6) * 5200; P.connect(out); mu.iDist = P;
      mu.iq = { t: 0, bar: 0, T };
      mu.insideTo(len - 0.001);
    });
  }
  centi(L) {
    const len = 56 * CENTI_SD;
    return this.render(len, 3, (f, out) => {
      const mu = new Music(f);
      for (let bar = 0; bar < 4; bar++) for (let i = 0; i < 14; i++) mu.centiStep((bar * 14 + i) * CENTI_SD, i, bar, L, CENTI_SD, out);
    });
  }
  spider(L) {
    const len = 64 * SPIDER_SD;
    return this.render(len, 3, (f, out, ctx) => {
      f.chBus = out;
      f.chLP = ctx.createBiquadFilter(); f.chLP.type = 'lowpass'; f.chLP.frequency.value = 300 + L * 900; f.chLP.Q.value = 2.5; f.chLP.connect(out);
      f.chStr = ctx.createBiquadFilter(); f.chStr.type = 'bandpass'; f.chStr.frequency.value = 1400; f.chStr.Q.value = 0.7; f.chStr.connect(out);
      for (let bar = 0; bar < 4; bar++) for (let i = 0; i < 16; i++) f.chaseStep((bar * 16 + i) * SPIDER_SD, i, bar, L, SPIDER_SD);
    });
  }
  duct(k) {
    const len = 4 * 2.4;
    return this.render(len, 3, (f, out) => {
      const mu = new Music(f); mu.bus.escape = out;
      mu.escapeTo(len - 0.001, 'duct', k);
    });
  }
  run() {
    const len = 2 * RUN_LOOP;
    return this.render(len, 3, (f, out) => {
      const mu = new Music(f);
      mu.eq = { ph: 'run', at: 0, t: 0, bar: 0, b: out, bus: [] };       // (already in it: no crash and choir at the top)
      mu.escapeTo(len - 0.001, 'run', 0.5);
    }, RUN_LOOP);
  }

  // in the background, one after another, most needed first
  async run_() {
    if (this.busy || typeof OfflineAudioContext === 'undefined') return;
    this.busy = true;
    const jobs = [['inside', LEVELS.inside.map((T) => () => this.inside(T))], ['centi', LEVELS.centi.map((L) => () => this.centi(L))],
      ['spider', LEVELS.spider.map((L) => () => this.spider(L))], ['run', [() => this.run()]], ['duct', LEVELS.duct.map((k) => () => this.duct(k))]];
    for (const [name, makers] of jobs) {
      try {
        const bufs = [];
        for (const mk of makers) { bufs.push(await mk()); await sleep(250); }
        this.ready[name] = bufs;
      } catch (e) { console.warn('music bake failed:', name, e); }
    }
  }
  start() { setTimeout(() => this.run_(), 1500); }
}
