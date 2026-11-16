import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { boxGeom } from './level.js';

// The way out once the last generator runs: the lab's air duct. Its grille falls off when the fans
// start; it runs south inside the solid block between the lab and the warehouse, turns east, and ends
// at a floor grille over the loading dock. Too narrow for the centipede, so it follows outside the
// metal, knocks on it, and pushes its head through a side grille. At the end the floor gives way and
// you drop through the dock's ceiling, right by the open shutter.
export const DUCT = {
  x0: -11.0, x1: -9.8,      // south leg (inside)
  z0: 39.0, z1: 40.2,       // east leg (inside)
  wallZ: 52.3,              // the lab-side face of the lab's south wall (the mouth)
  end: -2.0,                // the east end (inside)
  drop0: -3.2,              // the floor grille: drop0..end
  h: 0.95,
  grate: { x: -6.0, z: 40.2, y: 0.46, w: 1.2, h: 0.68 },   // side grille in the east leg's north wall
  land: { x: -2.4, z: 6.5 },                               // in the dock, under its ceiling vent
  dockVent: { x: -6.7, z: 5.0, y: 0.55, dx: 1, dz: 0 },    // where the centipede comes into the dock
};
DUCT.mouth = { x: (DUCT.x0 + DUCT.x1) / 2, z: DUCT.wallZ, dx: 0, dz: 1 };
DUCT.zc = (DUCT.z0 + DUCT.z1) / 2;
DUCT.len = (DUCT.wallZ - DUCT.zc) + (DUCT.end - DUCT.mouth.x);

// inside the duct (the mouth in the wall counts)
export function ductInside(x, z) {
  const D = DUCT, e = 0.05;
  return (x > D.x0 - e && x < D.x1 + e && z > D.z0 - e && z < D.wallZ) || (z > D.z0 - e && z < D.z1 + e && x > D.x0 - e && x < D.end + e);
}
// how far along it (m), from the mouth
export function ductS(x, z) {
  const D = DUCT;
  return z > D.zc && x < D.x1 ? D.wallZ - z : (D.wallZ - D.zc) + Math.max(0, x - D.mouth.x);
}

// galvanised sheet: mottled spangle, a brushed grain, grime that gathers low down
function steelTexture(floor) {
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = floor ? '#5e615f' : '#6f7578'; g.fillRect(0, 0, 256, 256);
  let s = floor ? 7 : 3; const R = () => (s = (s * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 260; i++) {
    const l = (R() - 0.5) * 30;
    g.fillStyle = `rgba(${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${l > 0 ? 255 : 0},${Math.abs(l) / 255 * 1.6})`;
    g.beginPath(); const x = R() * 256, y = R() * 256, r = 6 + R() * 18, n = 5 + Math.floor(R() * 3);
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.283 + R() * 0.6, rr = r * (0.6 + R() * 0.5); k ? g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr) : g.moveTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); }
    g.fill();
  }
  for (let i = 0; i < 180; i++) { g.fillStyle = `rgba(255,255,255,${R() * 0.05})`; g.fillRect(0, R() * 256, 256, 1); }
  if (floor) {
    // dust, a scuffed track down the middle, droppings
    for (let i = 0; i < 90; i++) { g.fillStyle = `rgba(70,58,44,${0.05 + R() * 0.12})`; g.beginPath(); g.ellipse(R() * 256, R() * 256, 10 + R() * 40, 6 + R() * 20, R() * 3, 0, 6.29); g.fill(); }
    const tr = g.createLinearGradient(0, 0, 256, 0); tr.addColorStop(0, 'rgba(60,50,40,.25)'); tr.addColorStop(0.35, 'rgba(255,255,255,.05)'); tr.addColorStop(0.65, 'rgba(255,255,255,.05)'); tr.addColorStop(1, 'rgba(60,50,40,.25)');
    g.fillStyle = tr; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 140; i++) { g.fillStyle = `rgba(20,14,10,${0.4 + R() * 0.5})`; g.beginPath(); g.ellipse(R() * 256, R() * 256, 1 + R() * 1.6, 0.6 + R(), R() * 3, 0, 6.29); g.fill(); }
  } else {
    for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(80,62,40,${0.04 + R() * 0.08})`; const x = R() * 256; g.fillRect(x, 0, 2 + R() * 6, 256); }
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  t.repeat.set(0.8, 0.8);
  return t;
}

// a slatted grille in the xy plane, facing +z (frame w x h, slats tilted)
function grille(mat, w, h, slats = 7, tilt = 0.7) {
  const g = new THREE.Group();
  const add = (bw, bh, bd, x, y, z, rx = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(bw, bh, bd), mat); m.position.set(x, y, z); m.rotation.x = rx; m.castShadow = true; m.receiveShadow = true; g.add(m); };
  add(w, 0.05, 0.05, 0, h / 2, 0); add(w, 0.05, 0.05, 0, -h / 2, 0); add(0.05, h, 0.05, -w / 2, 0, 0); add(0.05, h, 0.05, w / 2, 0, 0);
  for (let k = 0; k < slats; k++) add(w - 0.06, 0.012, 0.05, 0, -h / 2 + (k + 0.5) * h / slats, 0, tilt);
  return g;
}

export function createDuct(scene, { colliders, metalMat }) {
  const D = DUCT, T = 0.05, H = D.h, W = D.x1 - D.x0;
  const steel = new THREE.MeshStandardMaterial({ map: steelTexture(false), roughness: 0.55, metalness: 0.3 });
  const floorMat = new THREE.MeshStandardMaterial({ map: steelTexture(true), roughness: 0.7, metalness: 0.25 });
  const ribMat = new THREE.MeshStandardMaterial({ map: steel.map, color: 0x8a9095, roughness: 0.45, metalness: 0.35 });
  const shaftMat = new THREE.MeshStandardMaterial({ color: 0x3a3f44, roughness: 0.6, metalness: 0.3 });
  const black = new THREE.MeshBasicMaterial({ color: 0x020202 });
  const group = new THREE.Group(); scene.add(group);
  const meshes = [];
  const mesh = (list, mat, shadow = true) => { const m = new THREE.Mesh(mergeGeometries(list), mat); m.castShadow = shadow; m.receiveShadow = true; group.add(m); meshes.push(m); return m; };

  // ---- the sheet metal
  const S = [], F = [], Rb = [], Sh = [];
  const g0 = D.grate.x - D.grate.w / 2, g1 = D.grate.x + D.grate.w / 2, gy0 = D.grate.y - D.grate.h / 2, gy1 = D.grate.y + D.grate.h / 2;
  S.push(boxGeom(T, H, D.wallZ - D.z0 + T, D.x0 - T / 2, H / 2, (D.wallZ + D.z0 - T) / 2));      // west wall of the south leg (and the corner)
  S.push(boxGeom(T, H, D.wallZ - D.z1, D.x1 + T / 2, H / 2, (D.wallZ + D.z1) / 2));              // its east wall
  S.push(boxGeom(D.end + T - D.x1, H, T, (D.x1 + D.end + T) / 2, H / 2, D.z0 - T / 2));          // south wall of the east leg (the corner has the dent)
  S.push(boxGeom(g0 - (D.x1 + T), H, T, (g0 + D.x1 + T) / 2, H / 2, D.z1 + T / 2));              // north wall, either side of the side grille
  S.push(boxGeom(D.end + T - g1, H, T, (g1 + D.end + T) / 2, H / 2, D.z1 + T / 2));
  S.push(boxGeom(g1 - g0, gy0, T, D.grate.x, gy0 / 2, D.z1 + T / 2));                           // ...under and over it
  S.push(boxGeom(g1 - g0, H - gy1, T, D.grate.x, (H + gy1) / 2, D.z1 + T / 2));
  S.push(boxGeom(T, H, D.z1 - D.z0, D.end + T / 2, H / 2, D.zc));                                 // the end
  S.push(boxGeom(W + 2 * T, T, D.wallZ - D.z0 + T, D.mouth.x, H + T / 2, (D.wallZ + D.z0 - T) / 2));   // ceilings
  S.push(boxGeom(D.end + T - (D.x1 + T), T, D.z1 - D.z0 + 2 * T, (D.x1 + T + D.end + T) / 2, H + T / 2, D.zc));
  // the floor stands 6 mm proud of the lab's, into the mouth
  F.push(boxGeom(W, 0.024, D.wallZ - D.z0, D.mouth.x, -0.006, (D.wallZ + D.z0) / 2));
  F.push(boxGeom(D.drop0 - D.x1, 0.024, D.z1 - D.z0, (D.x1 + D.drop0) / 2, -0.006, D.zc));
  // standing seams every 1.2 m
  const ringZ = (z) => { Rb.push(boxGeom(0.024, H, 0.05, D.x0 + 0.012, H / 2, z), boxGeom(0.024, H, 0.05, D.x1 - 0.012, H / 2, z), boxGeom(W, 0.024, 0.05, D.mouth.x, H - 0.012, z), boxGeom(W, 0.012, 0.05, D.mouth.x, 0.012, z)); };
  const ringX = (x) => { Rb.push(boxGeom(0.05, H, 0.024, x, H / 2, D.z0 + 0.012), boxGeom(0.05, H, 0.024, x, H / 2, D.z1 - 0.012), boxGeom(0.05, 0.024, D.z1 - D.z0, x, H - 0.012, D.zc), boxGeom(0.05, 0.012, D.z1 - D.z0, x, 0.012, D.zc)); };
  for (let z = D.wallZ - 0.7; z > D.z1 + 0.3; z -= 1.2) ringZ(z);
  for (let x = D.x1 + 0.6; x < D.drop0 - 0.2; x += 1.2) if (Math.abs(x - D.grate.x) > 0.7) ringX(x);
  // the shaft under the floor grille, and the light of the dock coming up it
  const sx0 = D.drop0 - T, sx1 = D.end + T, sd = 2.4;
  Sh.push(boxGeom(T, sd, D.z1 - D.z0 + 2 * T, sx0 + T / 2, -sd / 2, D.zc), boxGeom(T, sd, D.z1 - D.z0 + 2 * T, sx1 - T / 2, -sd / 2, D.zc));
  Sh.push(boxGeom(sx1 - sx0 - 2 * T, sd, T, (sx0 + sx1) / 2, -sd / 2, D.z0 - T / 2), boxGeom(sx1 - sx0 - 2 * T, sd, T, (sx0 + sx1) / 2, -sd / 2, D.z1 + T / 2));
  mesh(S, steel); mesh(F, floorMat); mesh(Rb, ribMat); mesh(Sh, shaftMat, false);
  const glowC = document.createElement('canvas'); glowC.width = glowC.height = 64;
  { const g = glowC.getContext('2d'), gr = g.createRadialGradient(32, 32, 2, 32, 32, 34); gr.addColorStop(0, '#fff2dc'); gr.addColorStop(0.6, '#e0a46a'); gr.addColorStop(1, '#7a4a28'); g.fillStyle = gr; g.fillRect(0, 0, 64, 64); }
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(sx1 - sx0 - 2 * T, D.z1 - D.z0).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(glowC), color: 0x000000, toneMapped: false }));
  glow.position.set((D.drop0 + D.end) / 2, -sd + 0.01, D.zc); group.add(glow);
  const upLight = new THREE.PointLight(0xffb46a, 0, 3.6, 2);
  upLight.position.set((D.drop0 + D.end) / 2, -0.7, D.zc); group.add(upLight);
  // dust in the light coming up through the slats
  const beamC = document.createElement('canvas'); beamC.width = 8; beamC.height = 64;
  { const g = beamC.getContext('2d'), gr = g.createLinearGradient(0, 64, 0, 0); gr.addColorStop(0, 'rgba(255,200,140,.55)'); gr.addColorStop(1, 'rgba(255,200,140,0)'); g.fillStyle = gr; g.fillRect(0, 0, 8, 64); }
  const beamMat = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(beamC), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const beams = [];
  for (let k = 0; k < 4; k++) {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(0.09, 0.9), beamMat);
    b.position.set(D.drop0 + 0.25 + k * 0.27, 0.42, D.zc + (k % 2 ? 0.2 : -0.2)); b.rotation.y = k * 0.7;
    group.add(b); beams.push(b);
  }
  // the floor grille itself (it goes when you crawl onto it)
  const floorGrille = new THREE.Group();
  { const add = (w, h, d, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), metalMat); m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; floorGrille.add(m); };
    const L = D.end - D.drop0, Wd = D.z1 - D.z0;
    add(L, 0.03, 0.06, 0, 0, -Wd / 2 + 0.03); add(L, 0.03, 0.06, 0, 0, Wd / 2 - 0.03); add(0.06, 0.03, Wd, -L / 2 + 0.03, 0, 0); add(0.06, 0.03, Wd, L / 2 - 0.03, 0, 0);
    for (let k = 1; k < 8; k++) add(0.025, 0.03, Wd - 0.1, -L / 2 + k * L / 8, 0, 0); }
  floorGrille.position.set((D.drop0 + D.end) / 2, -0.006, D.zc);
  group.add(floorGrille);

  // ---- the dent: the corner wall where it hits from outside
  const dentG = new THREE.PlaneGeometry(W, H, 18, 14);
  dentG.translate(D.mouth.x, H / 2, D.z0);
  const dentBase = dentG.attributes.position.array.slice();
  { const uv = dentG.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * W, uv.getY(i) * H); }
  dentG.setAttribute('color', new THREE.BufferAttribute(new Float32Array(dentG.attributes.position.count * 3).fill(1), 3));
  const dentMat = steel.clone(); dentMat.vertexColors = true;
  const dent = new THREE.Mesh(dentG, dentMat); dent.receiveShadow = true; group.add(dent); meshes.push(dent);
  let dentA = 0, dentTo = 0;
  // where its claws went through the sheet on the second blow: torn black slits on the bulge
  const bulge = (x, y) => { x -= D.mouth.x; return Math.exp(-((x + 0.08) ** 2) / 0.05 - ((y - 0.46) ** 2) / 0.035) + 0.6 * Math.exp(-((x - 0.26) ** 2) / 0.015 - ((y - 0.3) ** 2) / 0.015); };
  const tearMat = new THREE.MeshBasicMaterial({ color: 0x050403, side: THREE.DoubleSide });
  const tears = [[-0.2, 0.55, 0.5], [-0.02, 0.6, -0.3], [0.08, 0.4, 0.9], [-0.14, 0.36, -0.7]].map(([x, y, r]) => {
    const g = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-0.05, 0, 0), new THREE.Vector3(0.0, 0.012, 0), new THREE.Vector3(0.06, 0, 0), new THREE.Vector3(0.0, -0.016, 0)]);
    g.setIndex([0, 1, 2, 0, 2, 3]);
    const m = new THREE.Mesh(g, tearMat); m.rotation.z = r; m.visible = false; m.userData.at = [D.mouth.x + x, y]; group.add(m); return m;
  });
  const setDent = (a) => {
    const p = dentG.attributes.position, cl = dentG.attributes.color;
    for (let i = 0; i < p.count; i++) {
      const x = dentBase[i * 3] - D.mouth.x, y = dentBase[i * 3 + 1];
      const edge = Math.min(1, (W / 2 - Math.abs(x)) / 0.12, y / 0.1, (H - y) / 0.1);
      const k = bulge(dentBase[i * 3], y) * Math.max(0, edge);
      p.setZ(i, dentBase[i * 3 + 2] + a * k);
      // the paint cracked and the zinc rubbed dark where it bulged, and scored by its claws
      const sc = Math.abs(Math.sin(x * 61 + y * 23)) > 0.96 ? 0.55 : 1;
      const v = 1 - Math.min(0.6, (a / 0.17) * k * 0.6) * (a > 0.01 ? sc * 1.1 : 1);
      cl.setXYZ(i, v, v * 0.97, v * 0.93);
    }
    p.needsUpdate = true; cl.needsUpdate = true; dentG.computeVertexNormals();
    for (const m of tears) { const [x, y] = m.userData.at; m.position.set(x, y, D.z0 + a * bulge(x, y) + 0.004); m.visible = a > 0.12; }
  };

  // ---- the grilles that come off: the mouth (fans start), the side one (its head), the dock's two
  const covers = [];
  const cover = (obj, x, y, z, ry) => { obj.position.set(x, y, z); obj.rotation.set(0, ry, 0); group.add(obj); obj.traverse((m) => m.isMesh && meshes.push(m)); const c = { obj, home: [x, y, z, ry], v: null }; covers.push(c); return c; };
  const mouthC = cover(grille(metalMat, W + 0.12, H + 0.06, 9), D.mouth.x, (H + 0.06) / 2, D.wallZ + 0.035, 0);
  const sideC = cover(grille(metalMat, D.grate.w, D.grate.h, 6, -0.6), D.grate.x, D.grate.y, D.z1 - 0.03, Math.PI);
  const dv = D.dockVent;
  const dockC = cover(grille(metalMat, 1.4, 0.8, 7), dv.x + 0.035, dv.y, dv.z, Math.PI / 2);
  dockC.obj.rotation.order = 'ZYX';            // (it tips over forwards: a turn about the world's z)
  const ceilC = cover(grille(metalMat, 1.0, 1.0, 8, 0.4), D.land.x, 5.95, D.land.z, 0);
  ceilC.obj.rotation.x = -Math.PI / 2; ceilC.home.push(-Math.PI / 2);
  // frames and the dark behind them
  { const fr = [];
    fr.push(boxGeom(0.08, H + 0.08, 0.05, D.x0 - T - 0.04, (H + 0.08) / 2, D.wallZ + 0.025), boxGeom(0.08, H + 0.08, 0.05, D.x1 + T + 0.04, (H + 0.08) / 2, D.wallZ + 0.025), boxGeom(W + 2 * T, 0.08, 0.05, D.mouth.x, H + T + 0.04, D.wallZ + 0.025));
    for (const s of [-1, 1]) fr.push(boxGeom(1.16, 0.04, 0.08, D.land.x, 5.975, D.land.z + s * 0.54), boxGeom(0.08, 0.04, 1.0, D.land.x + s * 0.54, 5.975, D.land.z));
    mesh(fr, metalMat);
    const hole = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0).rotateX(Math.PI / 2), black); hole.position.set(D.land.x, 5.99, D.land.z); group.add(hole);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 0.8).rotateY(Math.PI / 2), black); back.position.set(dv.x + 0.006, dv.y, dv.z); group.add(back); }

  // ---- collision: the walls always, the mouth's grille until it falls, crawl space once open
  const C = {
    walls: [
      { x0: D.x0 - 0.3, x1: D.x0, z0: D.z0 - 0.3, z1: D.wallZ },
      { x0: D.x1, x1: D.x1 + 0.3, z0: D.z1, z1: D.wallZ },
      { x0: D.x0 - 0.3, x1: D.end + 0.3, z0: D.z0 - 0.3, z1: D.z0 },
      { x0: D.x1, x1: D.end + 0.3, z0: D.z1, z1: D.z1 + 0.3 },
      { x0: D.end, x1: D.end + 0.3, z0: D.z0, z1: D.z1 },
    ],
    mouth: { x0: D.x0 - T, x1: D.x1 + T, z0: D.wallZ - 0.3, z1: D.wallZ + 0.1 },
    crawl: [
      { x0: D.x0, x1: D.x1, z0: D.z0, z1: D.wallZ + 0.15, under: H, y1: H, auto: true },     // (walk into it and you get down)
      { x0: D.x1, x1: D.end, z0: D.z0, z1: D.z1, under: H, y1: H, auto: true },
    ],
  };
  colliders.push(...C.walls, C.mouth, ...C.crawl);

  const st = { open: false, broken: false, popped: false, dock: false };
  function tumble(c, v) { c.v = { ...v }; }
  function reset() {
    for (const c of covers) { c.v = null; c.obj.visible = true; c.obj.position.set(c.home[0], c.home[1], c.home[2]); c.obj.rotation.set(c.home[4] || 0, c.home[3], 0); }
    C.mouth.off = false; for (const c of C.crawl) c.off = true;
    floorGrille.visible = true; floorGrille.position.y = -0.006; floorGrille.userData.vy = 0;
    dentA = dentTo = 0; setDent(0);
    upLight.intensity = 0; glow.material.color.setScalar(0); beamMat.opacity = 0;
    st.open = st.broken = st.popped = st.dock = false;
  }
  reset();

  return {
    group, meshes, D,
    get open() { return st.open; },
    // the last generator: the fans kick in and blow the mouth's grille off into the lab
    openVent() {
      if (st.open) return;
      st.open = true; C.mouth.off = true; for (const c of C.crawl) c.off = false;
      tumble(mouthC, { x: (Math.random() - 0.5) * 0.4, y: 1.4, z: 2.4, rx: -5, ry: 0, floor: 0.03, lie: -Math.PI / 2 });
      upLight.intensity = 1.2; glow.material.color.setScalar(1.3); beamMat.opacity = 0.16;
    },
    dent(a) { dentTo = Math.max(dentTo, a); },
    // its head knocks the side grille into the duct
    popSide() { if (st.popped) return; st.popped = true; tumble(sideC, { x: 0.3, y: 0.6, z: -1.5, rx: 3, ry: 0.8, floor: 0.03, lie: -Math.PI / 2, wall: D.z0 + 0.1 }); },
    // the floor grille gives way under you
    breakFloor() { st.broken = true; floorGrille.userData.vy = -0.5; },
    // you came down through the dock's ceiling: its grille is on the floor beside you
    landed() {
      ceilC.v = null; ceilC.obj.position.set(D.land.x + 0.7, 0.03, D.land.z + 0.35); ceilC.obj.rotation.set(-Math.PI / 2, 0, 0.35);
    },
    // the centipede through the dock's wall vent
    burstDock() { if (st.dock) return; st.dock = true; tumble(dockC, { x: 4.2, y: 2.0, z: (Math.random() - 0.5) * 1.2, rx: 0, ry: 0, rz: -9, floor: 0.04, lie: 0 }); },
    reset,
    update(dt, t) {
      for (const c of covers) {
        const v = c.v; if (!v) continue;
        v.y -= 9.8 * dt;
        const o = c.obj; o.position.x += v.x * dt; o.position.y += v.y * dt; o.position.z += v.z * dt;
        o.rotation.x += (v.rx || 0) * dt; o.rotation.y += (v.ry || 0) * dt; o.rotation.z += (v.rz || 0) * dt;
        if (v.wall != null && o.position.z < v.wall) { o.position.z = v.wall; v.z *= -0.3; }
        if (o.position.y < v.floor) {
          o.position.y = v.floor; v.y *= -0.25; v.x *= 0.5; v.z *= 0.5; v.rx = (v.rx || 0) * 0.3; v.ry = (v.ry || 0) * 0.3; v.rz = (v.rz || 0) * 0.3;
          if (Math.abs(v.y) < 0.4) {
            // settle flat
            if (v.rz) { o.rotation.z = Math.round(o.rotation.z / Math.PI) * Math.PI + Math.PI / 2; } else o.rotation.x = v.lie;
            o.rotation.z = v.rz ? o.rotation.z : o.rotation.z * 0.2;
            c.v = null;
          }
        }
      }
      if (st.broken && floorGrille.visible) {
        floorGrille.userData.vy -= 9.8 * dt; floorGrille.position.y += floorGrille.userData.vy * dt; floorGrille.rotation.z += dt * 0.8;
        if (floorGrille.position.y < -2.3) floorGrille.visible = false;
      }
      if (dentA < dentTo) { dentA = Math.min(dentTo, dentA + dt * 1.6); setDent(dentA); }
      if (st.open) {
        const f = 0.92 + 0.08 * Math.sin(t * 1.7) * Math.sin(t * 0.63);
        upLight.intensity = 1.2 * f; beamMat.opacity = 0.16 * f;
        for (let i = 0; i < beams.length; i++) beams[i].rotation.y += dt * (0.05 + i * 0.02);
      }
    },
  };
}
