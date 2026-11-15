# find coplanar, same-facing, overlapping triangles in the static scene (z-fighting candidates)
from playwright.sync_api import sync_playwright
import json, sys
JS = r"""() => {
  window.__NORENDER = true; __M.start(); __M.step(2, 1/30);
  const V = __M.camera.position.constructor;
  const tris = [];       // [axis, sign, off, ax0, ay0, ax1, ay1, ax2, ay2, meshId]
  const meshes = [];
  const a = new V(), b = new V(), c = new V(), n = new V(), e1 = new V(), e2 = new V();
  __M.scene.updateMatrixWorld(true);
  __M.scene.traverse((m) => {
    if (!m.isMesh || m.isSkinnedMesh || m.isInstancedMesh || !m.visible) return;
    let vis = true; for (let p = m; p; p = p.parent) if (!p.visible) vis = false; if (!vis) return;
    const mat = Array.isArray(m.material) ? m.material[0] : m.material;
    if (!mat || mat.polygonOffset || (mat.transparent && !mat.depthWrite) || mat.isShaderMaterial) return;
    const g = m.geometry, pos = g.attributes.position; if (!pos) return;
    const idx = g.index ? g.index.array : null, N = idx ? idx.length : pos.count;
    const id = meshes.length; meshes.push({ name: m.name || '', mat: mat.name || mat.type, color: mat.color ? mat.color.getHexString() : '', side: mat.side, room: m.userData.dressMat || m.userData.room || '' });
    for (let i = 0; i < N; i += 3) {
      const i0 = idx ? idx[i] : i, i1 = idx ? idx[i + 1] : i + 1, i2 = idx ? idx[i + 2] : i + 2;
      a.fromBufferAttribute(pos, i0).applyMatrix4(m.matrixWorld); b.fromBufferAttribute(pos, i1).applyMatrix4(m.matrixWorld); c.fromBufferAttribute(pos, i2).applyMatrix4(m.matrixWorld);
      e1.subVectors(b, a); e2.subVectors(c, a); n.crossVectors(e1, e2);
      const L = n.length(); if (L < 1e-8) continue; n.divideScalar(L);
      let ax = -1;
      if (Math.abs(n.x) > 0.9995) ax = 0; else if (Math.abs(n.y) > 0.9995) ax = 1; else if (Math.abs(n.z) > 0.9995) ax = 2;
      if (ax < 0) continue;
      const sg = Math.sign([n.x, n.y, n.z][ax]);
      const off = ([a.x, a.y, a.z][ax] + [b.x, b.y, b.z][ax] + [c.x, c.y, c.z][ax]) / 3;
      const u = ax === 0 ? 'y' : 'x', v = ax === 2 ? 'y' : 'z';
      tris.push([ax, sg, off, a[u], a[v], b[u], b[v], c[u], c[v], id]);
    }
  });
  // bucket by plane
  const B = new Map();
  for (const t of tris) { const k = t[0] + ':' + t[1] + ':' + Math.round(t[2] * 2000); if (!B.has(k)) B.set(k, []); B.get(k).push(t); }
  const area = (P) => { let s = 0; for (let i = 0; i < P.length; i++) { const p = P[i], q = P[(i + 1) % P.length]; s += p[0] * q[1] - q[0] * p[1]; } return s / 2; };
  const clip = (subj, cl) => {
    // Sutherland-Hodgman, cl ccw
    let out = subj;
    for (let i = 0; i < cl.length && out.length; i++) {
      const A = cl[i], Bp = cl[(i + 1) % cl.length], inp = out; out = [];
      const side = (p) => (Bp[0] - A[0]) * (p[1] - A[1]) - (Bp[1] - A[1]) * (p[0] - A[0]);
      for (let j = 0; j < inp.length; j++) {
        const P = inp[j], Q = inp[(j + 1) % inp.length], sp = side(P), sq = side(Q);
        if (sp >= 0) out.push(P);
        if ((sp >= 0) !== (sq >= 0)) { const t = sp / (sp - sq); out.push([P[0] + (Q[0] - P[0]) * t, P[1] + (Q[1] - P[1]) * t]); }
      }
    }
    return out;
  };
  const ccw = (t) => { const P = [[t[3], t[4]], [t[5], t[6]], [t[7], t[8]]]; return area(P) < 0 ? P.reverse() : P; };
  const hits = [];
  for (const [k, L] of B) {
    if (L.length < 2) continue;
    // neighbouring buckets (offsets within 0.5 mm) also fight
    const [ax, sg, ko] = k.split(':').map(Number);
    const L2 = L.concat(B.get(ax + ':' + sg + ':' + (ko + 1)) || []);
    const P = L2.map(ccw), bb = P.map((p) => [Math.min(p[0][0], p[1][0], p[2][0]), Math.max(p[0][0], p[1][0], p[2][0]), Math.min(p[0][1], p[1][1], p[2][1]), Math.max(p[0][1], p[1][1], p[2][1])]);
    for (let i = 0; i < L.length; i++) for (let j = i + 1; j < L2.length; j++) {
      const A = bb[i], Bb = bb[j];
      if (A[1] <= Bb[0] + 1e-4 || Bb[1] <= A[0] + 1e-4 || A[3] <= Bb[2] + 1e-4 || Bb[3] <= A[2] + 1e-4) continue;
      const ar = Math.abs(area(clip(P[i], P[j])));
      if (ar > 2e-4) {
        const ti = L2[i], tj = L2[j];
        const cu = (P[i][0][0] + P[i][1][0] + P[i][2][0]) / 3, cv = (P[i][0][1] + P[i][1][1] + P[i][2][1]) / 3;
        hits.push({ ax, sg, off: +ti[2].toFixed(3), u: +cu.toFixed(2), v: +cv.toFixed(2), area: +ar.toFixed(4), m1: ti[9], m2: tj[9] });
      }
    }
  }
  return JSON.stringify({ tris: tris.length, meshes, hits });
}"""
with sync_playwright() as p:
    b = p.chromium.launch(executable_path='/usr/bin/google-chrome', args=['--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'])
    pg = b.new_page(viewport={'width': 320, 'height': 200})
    pg.route('**/*', lambda r: r.abort() if r.request.url.startswith('http') else r.continue_())
    pg.goto('file:///home/claude/mandible/dist/map.html?test')
    pg.wait_for_function('window.__READY === true', timeout=200000)
    r = json.loads(pg.evaluate(JS))
    json.dump(r, open('/home/claude/zf/hits.json', 'w'))
    print('tris', r['tris'], 'hits', len(r['hits']))
    b.close()
