// The map: a rugged tablet you hold up (M / 지도), its floor-plan app showing where you are like a minimap:
// centred on you and turned so ahead is up. Backlit, so it reads in the dark. What it marks depends on the
// difficulty:
//   easy   - generators (red off, green on), the lamps, the way out, and arrows to generators off the screen
//   normal - generators and the arrows to them
//   hard   - only the floor plan and you
const C = { bg: '#061012', grid: 'rgba(80,200,190,.06)', room: '#0d2427', roomHere: '#123438', wall: '#3fcfbf', text: 'rgba(170,240,230,.72)', you: '#ffd166', off: '#ff4d3a', on: '#4dff8a', lamp: '#ffb347', exit: '#5ab8ff', locked: '#ff4d3a' };

export function createPadMap({ canvas, ROOMS, DOORS, SPOTS }) {
  const ctx = canvas.getContext('2d');
  let diff = 'normal', W = 0, H = 0, dpr = 1;
  function resize() {
    const el = canvas.parentElement;
    const w = el.offsetWidth, h = el.offsetHeight;
    if (!w || !h) return false;
    dpr = Math.min(2, window.devicePixelRatio || 1);
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    W = canvas.width; H = canvas.height;
    return true;
  }
  return {
    setDiff(d) { diff = d; },
    redraw() {},
    resize() { W = 0; },
    // st: { x, z, yaw, room, gens: [{x, z, on, room}], lamps: [{x, z, on}], gensOn, emergency, t }
    draw(st) {
      if (!W && !resize()) return;
      const c = ctx, u = dpr;
      c.setTransform(1, 0, 0, 1, 0, 0);
      c.fillStyle = C.bg; c.fillRect(0, 0, W, H);
      // the app's top bar
      const bar = 26 * u;
      c.fillStyle = 'rgba(63,207,191,.12)'; c.fillRect(0, 0, W, bar);
      c.fillStyle = C.text; c.font = `${12 * u}px sans-serif`; c.textBaseline = 'middle';
      c.fillText(`공장 도면 · ${st.inDuct ? '환기 덕트' : st.room && ROOMS[st.room] ? ROOMS[st.room].name || '통로' : '—'}`, 10 * u, bar / 2);
      c.textAlign = 'right'; c.fillText(`발전기 ${st.gensOn}/3`, W - 44 * u, bar / 2); c.textAlign = 'left';
      c.strokeStyle = C.text; c.lineWidth = u; c.strokeRect(W - 36 * u, bar / 2 - 5 * u, 22 * u, 10 * u); c.fillStyle = C.on; c.fillRect(W - 34 * u, bar / 2 - 3 * u, 14 * u, 6 * u);
      // the view: you near the bottom, ahead is up, about 30 m from top to bottom
      c.save();
      c.beginPath(); c.rect(0, bar, W, H - bar); c.clip();
      const s = (H - bar) / 30, cx = W / 2, cy = bar + (H - bar) * 0.62;
      const fx = Math.sin(st.yaw), fz = Math.cos(st.yaw), rx = -fz, rz = fx;
      const P = (x, z) => { const dx = x - st.x, dz = z - st.z; return [cx + (dx * rx + dz * rz) * s, cy - (dx * fx + dz * fz) * s]; };
      // grid that turns with you
      c.strokeStyle = C.grid; c.lineWidth = u;
      for (let g = -60; g <= 60; g += 4) {
        const gx = Math.round(st.x / 4) * 4 + g, gz = Math.round(st.z / 4) * 4 + g;
        let a = P(gx, st.z - 60), b = P(gx, st.z + 60); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
        a = P(st.x - 60, gz); b = P(st.x + 60, gz); c.beginPath(); c.moveTo(a[0], a[1]); c.lineTo(b[0], b[1]); c.stroke();
      }
      const quad = (x0, x1, z0, z1) => { const p = [P(x0, z0), P(x1, z0), P(x1, z1), P(x0, z1)]; c.beginPath(); c.moveTo(p[0][0], p[0][1]); for (let i = 1; i < 4; i++) c.lineTo(p[i][0], p[i][1]); c.closePath(); };
      const doorRect = (d, k = 0.32) => d.axis === 'z' ? [d.from, d.to, d.at - k, d.at + k] : [d.at - k, d.at + k, d.from, d.to];
      // rooms filled, walls drawn, then the doorways cut back through the walls
      for (const [id, r] of Object.entries(ROOMS)) { c.fillStyle = id === st.room ? C.roomHere : C.room; quad(r.x0, r.x1, r.z0, r.z1); c.fill(); }
      c.strokeStyle = C.wall; c.lineWidth = 2 * u; c.lineJoin = 'round';
      for (const r of Object.values(ROOMS)) { quad(r.x0, r.x1, r.z0, r.z1); c.stroke(); }
      for (const d of DOORS) {
        if (!d.b) continue;
        const open = !d.locked || (d.locked === 'emergency' && st.emergency);
        c.fillStyle = C.room; const [x0, x1, z0, z1] = doorRect(d, 0.4); quad(x0, x1, z0, z1); c.fill();
        if (!open) { c.strokeStyle = C.locked; c.setLineDash([5 * u, 4 * u]); const [a0, a1, b0, b1] = doorRect(d, 0); quad(a0, a1, b0, b1); c.stroke(); c.setLineDash([]); }
      }
      // the air duct, once it's open: the crawl drawn solid, then on over the warehouse ceiling (dashed) to the dock
      if (st.duct) {
        const D = st.duct, path = [[D.mouth.x, D.wallZ], [D.mouth.x, D.zc], [D.end, D.zc]], over = [[D.end, D.zc], [D.land.x, D.zc - 4], [D.land.x, D.land.z]];
        const line = (pts) => { c.beginPath(); pts.forEach(([x, z], i) => { const [px, py] = P(x, z); i ? c.lineTo(px, py) : c.moveTo(px, py); }); c.stroke(); };
        c.lineCap = 'round';
        c.strokeStyle = C.wall; c.lineWidth = 7 * u; line(path);
        c.strokeStyle = C.room; c.lineWidth = 4.5 * u; line(path);
        c.strokeStyle = C.exit; c.lineWidth = 2 * u; c.setLineDash([4 * u, 4 * u]); line(over); c.setLineDash([]);
        c.lineCap = 'butt';
        const [mx, my] = P(D.mouth.x, D.wallZ), [lx, ly] = P(D.land.x, D.land.z);
        c.fillStyle = C.exit; c.font = `bold ${10 * u}px sans-serif`; c.textAlign = 'center';
        c.beginPath(); c.arc(mx, my, 3.5 * u, 0, 6.29); c.fill(); c.fillText('환기구', mx, my - 8 * u);
        c.beginPath(); c.arc(lx, ly, 3.5 * u, 0, 6.29); c.fill(); c.fillText('↓ 하역장', lx, ly - 8 * u);
        c.textAlign = 'left';
      }
      // the shutter: the way out
      if (diff === 'easy' || st.duct) {
        const d = DOORS.find((k) => k.locked === 'shutter');
        if (d) { c.strokeStyle = C.exit; c.lineWidth = 3 * u; const [a0, a1, b0, b1] = doorRect(d, 0); quad(a0, a1, b0, b1); c.stroke(); const [lx, ly] = P((d.from + d.to) / 2, d.at - 1.6); c.fillStyle = C.exit; c.textAlign = 'center'; c.font = `bold ${11 * u}px sans-serif`; c.fillText('출구', lx, ly); c.textAlign = 'left'; }
      }
      // room names, upright
      c.fillStyle = C.text; c.font = `${11 * u}px sans-serif`; c.textAlign = 'center';
      for (const r of Object.values(ROOMS)) if (r.name) { const [lx, ly] = P((r.x0 + r.x1) / 2, (r.z0 + r.z1) / 2); c.fillText(r.name, lx, ly); }
      c.textAlign = 'left';
      // lamps (easy)
      if (diff === 'easy') for (const l of st.lamps) { const [lx, ly] = P(l.x, l.z); c.fillStyle = C.lamp; c.globalAlpha = l.on ? 1 : 0.55; c.beginPath(); c.arc(lx, ly, 3.2 * u, 0, 6.29); c.fill(); c.globalAlpha = 1; }
      // generators
      if (diff !== 'hard') for (const g of st.gens) {
        const [gx, gy] = P(g.x, g.z), pulse = g.on ? 1 : 0.6 + 0.4 * Math.sin(st.t * 5);
        c.fillStyle = g.on ? C.on : C.off; c.globalAlpha = pulse;
        c.beginPath(); c.arc(gx, gy, 6 * u, 0, 6.29); c.fill(); c.globalAlpha = 1;
        c.fillStyle = C.bg; c.font = `bold ${9 * u}px sans-serif`; c.textAlign = 'center'; c.fillText('⚡', gx, gy + 0.5 * u); c.textAlign = 'left';
      }
      c.restore();
      // the nearest generator still off, if it's off the screen: an arrow on the edge
      if (diff !== 'hard') {
        let best = null;
        for (const g of st.gens) if (!g.on) { const d = Math.hypot(g.x - st.x, g.z - st.z); if (!best || d < best.d) best = { g, d }; }
        if (!best && st.duct && !st.inDuct && st.room !== 'dock') best = { g: { x: st.duct.mouth.x, z: st.duct.wallZ }, d: Math.hypot(st.duct.mouth.x - st.x, st.duct.wallZ - st.z), exit: true };
        if (best) {
          const [gx, gy] = P(best.g.x, best.g.z), m = 18 * u;
          if (gx < m || gx > W - m || gy < bar + m || gy > H - m) {
            const dx = gx - cx, dy = gy - cy, ang = Math.atan2(dy, dx);
            let k = Infinity;
            if (dx > 0) k = Math.min(k, (W - m - cx) / dx); if (dx < 0) k = Math.min(k, (m - cx) / dx);
            if (dy > 0) k = Math.min(k, (H - m - cy) / dy); if (dy < 0) k = Math.min(k, (bar + m - cy) / dy);
            const ax = cx + dx * k, ay = cy + dy * k;
            c.save(); c.translate(ax, ay); c.rotate(ang);
            c.fillStyle = best.exit ? C.exit : C.off; c.beginPath(); c.moveTo(9 * u, 0); c.lineTo(-6 * u, -6 * u); c.lineTo(-6 * u, 6 * u); c.closePath(); c.fill();
            c.restore();
            c.fillStyle = best.exit ? C.exit : C.off; c.font = `${10 * u}px sans-serif`; c.textAlign = 'center'; c.fillText(`${Math.round(best.d)}m`, ax - Math.cos(ang) * 16 * u, ay - Math.sin(ang) * 14 * u); c.textAlign = 'left';
          }
        }
      }
      // you: a view cone and an arrow
      const cone = c.createRadialGradient(cx, cy, 0, cx, cy, 70 * u); cone.addColorStop(0, 'rgba(255,209,102,.28)'); cone.addColorStop(1, 'rgba(255,209,102,0)');
      c.fillStyle = cone; c.beginPath(); c.moveTo(cx, cy); c.arc(cx, cy, 70 * u, -Math.PI / 2 - 0.5, -Math.PI / 2 + 0.5); c.closePath(); c.fill();
      c.fillStyle = C.you; c.beginPath(); c.moveTo(cx, cy - 9 * u); c.lineTo(cx + 6.5 * u, cy + 6 * u); c.lineTo(cx, cy + 3 * u); c.lineTo(cx - 6.5 * u, cy + 6 * u); c.closePath(); c.fill();
      // a screen: scan lines and a little glare
      c.fillStyle = 'rgba(0,0,0,.12)'; for (let y = 0; y < H; y += 3 * u) c.fillRect(0, y, W, u);
      const gl = c.createLinearGradient(0, 0, W, H); gl.addColorStop(0, 'rgba(255,255,255,.06)'); gl.addColorStop(0.4, 'rgba(255,255,255,0)'); c.fillStyle = gl; c.fillRect(0, 0, W, H);
    },
  };
}
