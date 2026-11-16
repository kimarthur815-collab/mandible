// The map: not a HUD, but the floor plan team 2 sketched in ballpoint on a notebook page, held up in
// front of you. How much is on it depends on the difficulty:
//   easy   - generators circled, the lamps, the blocked passage, and a red dot where you are
//   normal - generators circled and the blocked passage; no dot, only the room you're in pencilled over
//   hard   - just rooms and names; generators get crossed off once you've started them, nothing else
// It needs light to read: with the flashlight off it goes dark (darker the harder the game).
const INK = '#1e2546', RED = '#b3261e', HAND = '"Nanum Pen Script", "Comic Sans MS", cursive';

export function createPaperMap({ canvas, ROOMS, DOORS, SPOTS, MB }) {
  const ctx = canvas.getContext('2d');
  const base = document.createElement('canvas'), bctx = base.getContext('2d');
  let diff = 'normal', W = 0, H = 0, s = 1, ox = 0, oy = 0;
  const X = (x) => ox + (MB.x1 - x) * s, Y = (z) => oy + (MB.z1 - z) * s;   // +x to the left, +z up: matches facing in at the start
  let seed = 1; const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);

  // a hand-drawn line: a little wobble, a second faint pass
  const pen = (c, pts, w = 2, col = INK, wob = 1.2) => {
    for (let pass = 0; pass < 2; pass++) {
      c.strokeStyle = col; c.globalAlpha = pass ? 0.35 : 0.9; c.lineWidth = pass ? w * 0.7 : w; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath();
      for (let i = 0; i < pts.length - 1; i++) {
        const [x0, y0] = pts[i], [x1, y1] = pts[i + 1], n = Math.max(2, Math.round(Math.hypot(x1 - x0, y1 - y0) / 14));
        for (let k = 0; k <= n; k++) {
          const t = k / n, j = k === 0 || k === n ? 0.3 : 1;
          const x = x0 + (x1 - x0) * t + (rnd() - 0.5) * wob * j * (pass ? 1.6 : 1), y = y0 + (y1 - y0) * t + (rnd() - 0.5) * wob * j * (pass ? 1.6 : 1);
          if (i === 0 && k === 0) c.moveTo(x, y); else c.lineTo(x, y);
        }
      }
      c.stroke();
    }
    c.globalAlpha = 1;
  };
  const write = (c, text, x, y, size, col = INK, rot = 0) => {
    c.save(); c.translate(x, y); c.rotate(rot + (rnd() - 0.5) * 0.05);
    c.fillStyle = col; c.font = `${size}px ${HAND}`; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(text, 0, 0); c.restore();
  };
  const circle = (c, x, y, r, col = RED, w = 2) => {
    c.strokeStyle = col; c.lineWidth = w; c.beginPath();
    for (let a = 0; a <= Math.PI * 2.25; a += 0.25) { const rr = r * (1 + (rnd() - 0.5) * 0.12); const px = x + Math.cos(a) * rr, py = y + Math.sin(a) * rr * 0.85; if (a === 0) c.moveTo(px, py); else c.lineTo(px, py); }
    c.stroke();
  };

  // the room walls with the doorways left open
  function walls(c) {
    for (const [key, r] of Object.entries(ROOMS)) {
      const edges = [
        { axis: 'z', at: r.z0, a: r.x0, b: r.x1 }, { axis: 'z', at: r.z1, a: r.x0, b: r.x1 },
        { axis: 'x', at: r.x0, a: r.z0, b: r.z1 }, { axis: 'x', at: r.x1, a: r.z0, b: r.z1 },
      ];
      for (const e of edges) {
        const gaps = DOORS.filter((d) => d.axis === e.axis && Math.abs(d.at - e.at) < 0.01 && (d.a === key || d.b === key) && !d.locked)
          .map((d) => [Math.max(e.a, Math.min(d.from, d.to)), Math.min(e.b, Math.max(d.from, d.to))]).sort((p, q) => p[0] - q[0]);
        let from = e.a;
        const seg = (u0, u1) => { if (u1 - u0 < 0.05) return; pen(c, e.axis === 'z' ? [[X(u0), Y(e.at)], [X(u1), Y(e.at)]] : [[X(e.at), Y(u0)], [X(e.at), Y(u1)]], 2.2); };
        for (const [g0, g1] of gaps) { seg(from, g0); from = g1; }
        seg(from, e.b);
      }
    }
  }

  function drawBase() {
    seed = 7;
    const c = bctx;
    c.clearRect(0, 0, W, H);
    // the paper: a page folded in four, grubby, the top edge torn
    c.save(); c.beginPath(); c.moveTo(0, H); c.lineTo(0, 10);
    for (let i = 0; i <= 30; i++) c.lineTo((i / 30) * W, 4 + rnd() * 12);
    c.lineTo(W, H); c.closePath(); c.clip();
    c.fillStyle = '#e4dcc4'; c.fillRect(0, 0, W, H);
    const g = c.createRadialGradient(W / 2, H / 2, W * 0.35, W / 2, H / 2, W * 0.95);
    g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(110,80,35,.38)'); c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) { c.fillStyle = `rgba(${90 + rnd() * 40},${70 + rnd() * 30},40,${rnd() * 0.06})`; c.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 3, 1 + rnd() * 3); }
    for (let i = 0; i < 4; i++) { const sx = rnd() * W, sy = rnd() * H, sr = 30 + rnd() * 70, sg = c.createRadialGradient(sx, sy, 0, sx, sy, sr); sg.addColorStop(0, 'rgba(70,55,35,.14)'); sg.addColorStop(1, 'rgba(70,55,35,0)'); c.fillStyle = sg; c.fillRect(sx - sr, sy - sr, sr * 2, sr * 2); }
    // fold creases
    for (const [x0, y0, x1, y1] of [[W / 2, 0, W / 2, H], [0, H / 2, W, H / 2]]) {
      c.lineWidth = 3; c.strokeStyle = 'rgba(255,255,255,.35)'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke();
      c.lineWidth = 1.2; c.strokeStyle = 'rgba(60,45,25,.22)'; c.beginPath(); c.moveTo(x0 + 2, y0 + 2); c.lineTo(x1 + 2, y1 + 2); c.stroke();
    }
    const u = s;                                       // pixels per metre
    write(c, 'D-7 약도', W * 0.5, H * 0.05, u * 4);
    walls(c);
    // room names
    for (const r of Object.values(ROOMS)) {
      if (!r.name) continue;
      const w = r.x1 - r.x0, h = r.z1 - r.z0, cx = X((r.x0 + r.x1) / 2), cy = Y((r.z0 + r.z1) / 2);
      if (w < 6) write(c, r.name, cx, cy, u * Math.min(3.6, w * 0.95), INK, -Math.PI / 2);
      else write(c, r.name, cx, cy + (r.name === '창고 A' ? -u * 4 : 0), u * Math.min(4.4, w * 0.36));
    }
    // the way in / out
    const sx = X(0), sy = Y(0);
    pen(c, [[sx - u * 2.5, sy], [sx + u * 2.5, sy]], 2.2, INK, 0.6);
    write(c, '셔터 (출구)', sx, sy + u * 2.4, u * 3);
    if (diff !== 'hard') {
      // generators circled in red; team 2 warning about the passage
      for (const gn of SPOTS.generators) { circle(c, X(gn.x), Y(gn.z), u * 1.7); write(c, '발전기', X(gn.x), Y(gn.z) + u * 3.2 * (gn.z > 60 ? -1 : 1), u * 2.6, RED); }
      const gx = X(-12), gy = Y(28.5);
      for (let i = 0; i < 6; i++) pen(c, [[gx - u * 1.2, gy - u * 1.6 + i * u * 0.6], [gx + u * 1.2, gy - u * 1.2 + i * u * 0.6]], 1.6, RED, 0.8);
      write(c, '거미!! 막힘', gx + u * 6.5, gy - u * 3, u * 2.8, RED, -0.08);
    }
    if (diff === 'easy') {
      // the lamps drawn as little bulbs
      for (const l of SPOTS.lamps) {
        const lx = X(l.x), ly = Y(l.z);
        c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.arc(lx, ly, u * 0.6, 0, Math.PI * 2); c.stroke();
        for (let a = 0; a < 6; a++) { const an = a / 6 * Math.PI * 2; pen(c, [[lx + Math.cos(an) * u * 0.9, ly + Math.sin(an) * u * 0.9], [lx + Math.cos(an) * u * 1.4, ly + Math.sin(an) * u * 1.4]], 1.2, INK, 0.3); }
      }
    }
    c.restore();
  }

  function resize() {
    const w = canvas.offsetWidth, h = canvas.offsetHeight, dpr = Math.min(2, window.devicePixelRatio || 1);   // layout size (the sheet is tilted)
    if (!w) return false;
    W = canvas.width = base.width = Math.round(w * dpr); H = canvas.height = base.height = Math.round(h * dpr);
    const padX = W * 0.08, padTop = H * 0.1, padBot = H * 0.07;
    s = Math.min((W - padX * 2) / (MB.x1 - MB.x0), (H - padTop - padBot) / (MB.z1 - MB.z0));
    ox = (W - (MB.x1 - MB.x0) * s) / 2; oy = padTop + ((H - padTop - padBot) - (MB.z1 - MB.z0) * s) / 2;
    drawBase();
    return true;
  }

  return {
    setDiff(d) { if (d !== diff) { diff = d; if (W) drawBase(); } },
    redraw() { if (W) drawBase(); },
    resize() { W = 0; },
    // st: { x, z, yaw, room, gens: [{x, z, on}] }
    draw(st) {
      if (!W && !resize()) return;
      ctx.clearRect(0, 0, W, H); ctx.drawImage(base, 0, 0);
      seed = 99;
      const u = s;
      if (diff === 'normal' && st.room && ROOMS[st.room]) {
        // "about here": the room you're in, pencilled over
        const r = ROOMS[st.room], x0 = X(r.x1), x1 = X(r.x0), y0 = Y(r.z1), y1 = Y(r.z0);
        ctx.save(); ctx.beginPath(); ctx.rect(x0 + 3, y0 + 3, x1 - x0 - 6, y1 - y0 - 6); ctx.clip();
        ctx.strokeStyle = 'rgba(70,70,80,.28)'; ctx.lineWidth = 1.4;
        for (let k = -(y1 - y0); k < x1 - x0; k += u * 0.9) { ctx.beginPath(); ctx.moveTo(x0 + k, y1); ctx.lineTo(x0 + k + (y1 - y0), y0); ctx.stroke(); }
        ctx.restore();
      }
      // generators you've started: crossed off
      for (const g of st.gens) if (g.on) {
        const gx = X(g.x), gy = Y(g.z), r = u * 1.3;
        if (diff === 'hard') circle(ctx, gx, gy, u * 1.5, INK, 1.6);
        pen(ctx, [[gx - r, gy - r], [gx + r, gy + r]], 2.4, INK, 0.5); pen(ctx, [[gx + r, gy - r], [gx - r, gy + r]], 2.4, INK, 0.5);
      }
      if (diff === 'easy') {
        // you are here: a red dot, a tick for which way you face
        const px = X(st.x), py = Y(st.z);
        ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(px, py, u * 0.75, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = RED; ctx.lineWidth = 2.2; ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px - Math.sin(st.yaw) * u * 2.6, py - Math.cos(st.yaw) * u * 2.6); ctx.stroke();
      }
    },
  };
}
