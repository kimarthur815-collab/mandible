// Looping buffers of pre-rendered music (see bake.js), started together so they stay in step, and
// crossfaded by intensity: the buffers are the same music made at different levels (levels[i] for bufs[i]).
export class LoopSet {
  // loopStart: where each loop goes back to (the start: 0)
  constructor(ctx, bufs, dest, { loopStart = 0 } = {}) {
    const t0 = ctx.currentTime + 0.05;
    this.ctx = ctx; this.src = []; this.g = [];
    for (const b of bufs) {
      const s = ctx.createBufferSource(); s.buffer = b; s.loop = true;
      if (loopStart) { s.loopStart = loopStart; s.loopEnd = b.duration; }
      const g = ctx.createGain(); g.gain.value = 0;
      s.connect(g); g.connect(dest); s.start(t0);
      this.src.push(s); this.g.push(g);
    }
  }
  // x: where it is between the levels; in between two, it's a mix of those two
  mix(x, levels, tc = 0.35) {
    const n = levels.length, w = new Array(n).fill(0);
    if (x <= levels[0]) w[0] = 1;
    else if (x >= levels[n - 1]) w[n - 1] = 1;
    else for (let i = 0; i < n - 1; i++) if (x < levels[i + 1]) { const f = (x - levels[i]) / (levels[i + 1] - levels[i]); w[i] = 1 - f; w[i + 1] = f; break; }
    const now = this.ctx.currentTime;
    this.g.forEach((g, i) => g.gain.setTargetAtTime(w[i], now, tc));
  }
  mute(tc = 0.3) { const now = this.ctx.currentTime; for (const g of this.g) g.gain.setTargetAtTime(0, now, tc); }
  stop(after = 0) { const t = this.ctx.currentTime + after; for (const s of this.src) { try { s.stop(t); } catch (e) { /* already */ } } }
}
