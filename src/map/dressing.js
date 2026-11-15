// Set dressing: everything that makes the greybox read as an abandoned pesticide factory.
// Detail types placed here (24):
//  1 pallet racking with loads      2 crumpled / open cardboard boxes   3 wooden pallets (some broken)
//  4 dented 200 L drums (4 kinds)   5 powder sacks                       6 pipes with flanges, brackets, valves
//  7 steel roof trusses / I-beams   8 dead fluorescent fixtures (some hanging loose)   9 hanging cables
// 10 chains and hooks              11 electrical panels and conduit      12 vent grilles
// 13 steel door frames             14 forklift                           15 conveyor lines with stuff on them
// 16 storage tanks with ladders    17 lab benches, glassware, specimen jars, shelves, fume hood, sink
// 18 floor stains, spills, puddles, cracks, boot prints, drag marks, squashed bugs, drains
// 19 wall cracks, rust, mould, handprint, scrawl   20 Korean safety signage and boards
// 21 paper, crumpled paper, cans, glass shards, plastic wrap, ceiling debris, rubble
// 22 cobwebs in the corners        23 dust in the flashlight beam        24 bollards, bumpers, extinguishers, lane paint
import * as THREE from 'three';
import { ROOMS, DOORS, TABLES } from './level.js';
import { rng, canvas, texFrom } from './surface.js';
import * as PT from './proptex.js';
import * as P from './props.js';
import { sagLine, segmentsGeometry } from '../silk.js';

const V3 = THREE.Vector3;
const C = (h) => new THREE.Color(h);

function laneLineTex() {
  const c = canvas(512, 32), g = c.getContext('2d'), R = rng(5);
  g.clearRect(0, 0, 512, 32);
  g.fillStyle = 'rgba(214,170,30,0.9)'; g.fillRect(0, 4, 512, 24);
  for (let i = 0; i < 260; i++) g.clearRect(R() * 512, R() * 32, 2 + R() * 14, 1 + R() * 6);       // worn through
  for (let i = 0; i < 40; i++) { g.fillStyle = `rgba(30,25,20,${R() * 0.5})`; g.fillRect(R() * 512, 4, 4 + R() * 30, 24); }
  return texFrom(c, true);
}

export function dressLevel(scene, { colliders, T = 0.3, silkMat }) {
  const R = rng(20261115);
  const B = new P.Batch();
  const card = PT.cardboard(), signT = PT.signs(), decT = PT.decals();
  const metalT = PT.paintedMetal();
  const col = (x0, x1, z0, z1) => colliders.push({ x0, x1, z0, z1 });
  const inner = (room) => { const r = ROOMS[room]; return { x0: r.x0 + T, x1: r.x1 - T, z0: r.z0 + T, z1: r.z1 - T, h: r.h }; };

  // ---- flat helpers
  const floorDecal = (room, cell, x, z, s, rot = R() * 6.28, mat = 'decal', sy = s) => P.quad(B, mat, room, decT.cell(cell), s, sy, x, 0.004 + R() * 0.002, z, 'up', rot);
  // side: 'x0' | 'x1' | 'z0' | 'z1' wall of the room; along: coordinate along the wall
  const onWall = (room, side, along, y, off = 0.012) => {
    const r = inner(room);
    if (side === 'x0') return { x: r.x0 + off, z: along, face: '+x', ry: Math.PI / 2 };
    if (side === 'x1') return { x: r.x1 - off, z: along, face: '-x', ry: -Math.PI / 2 };
    if (side === 'z0') return { x: along, z: r.z0 + off, face: '+z', ry: 0 };
    return { x: along, z: r.z1 - off, face: '-z', ry: Math.PI };
  };
  const wallDecal = (room, side, along, y, cell, w, h = w, rot = 0) => { const p = onWall(room, side, along, y, 0.008 + R() * 0.004); P.quad(B, 'decal', room, decT.cell(cell), w, h, p.x, y, p.z, p.face, rot); };
  const sign = (room, side, along, y, cell, w, h = w, glow = false) => {
    const p = onWall(room, side, along, y, 0.03);
    P.quad(B, glow ? 'signGlow' : 'sign', room, signT.cell(cell), w, h, p.x, y, p.z, p.face, (R() - 0.5) * 0.04);
    const back = P.box(w + 0.04, h + 0.04, 0.015); back.applyMatrix4(P.mtx(p.x, y, p.z, p.ry)); back.translate(-Math.sin(p.ry) * 0.012, 0, -Math.cos(p.ry) * 0.012);
    B.add('metal', room, back, C('#3a3a38'));
  };
  const scatter = (room, n, x0, x1, z0, z1) => {
    for (let i = 0; i < n; i++) {
      const x = x0 + R() * (x1 - x0), z = z0 + R() * (z1 - z0), k = R();
      if (k < 0.35) P.paperSheet(B, room, x, 0, z, R() * 6, R);
      else if (k < 0.55) P.paperBall(B, room, x, 0, z, R);
      else if (k < 0.68) P.can(B, room, x, z, R);
      else if (k < 0.8) P.chunk(B, room, x, z, 0.03 + R() * 0.06, R);
      else if (k < 0.9) P.deadRoaches(B, room, x, z, R, 3 + Math.floor(R() * 5));
      else P.plasticWrap(B, room, x, z, R);
    }
  };
  const fluoroRow = (room, a, b, y, ry, step, dropChance = 0.2) => {
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    for (let t = step / 2; t < L; t += step) {
      const k = t / L;
      P.fluoro(B, room, a[0] + (b[0] - a[0]) * k, y, a[1] + (b[1] - a[1]) * k, ry, R, R() < dropChance ? 0.5 + R() * 0.6 : 0);
    }
  };
  const corners = [];   // for cobwebs: [x, y, z, dirx, dirz]
  const roomCorners = (room, n = 4) => { const r = inner(room); const list = [[r.x0, r.z0, 1, 1], [r.x1, r.z0, -1, 1], [r.x0, r.z1, 1, -1], [r.x1, r.z1, -1, -1]]; for (let i = 0; i < n; i++) { const [x, z, dx, dz] = list[i]; corners.push([x, r.h, z, dx, dz]); } };

  // ---- door frames on every opening, both sides
  for (const d of DOORS) {
    const mid = (d.from + d.to) / 2, w = d.to - d.from;
    for (const room of [d.a, d.b]) {
      if (!room) continue;
      const r = ROOMS[room];
      if (d.axis === 'z') { const inward = Math.abs(d.at - r.z0) < 1e-6 ? 1 : -1; P.doorFrame(B, room, mid, d.at + inward * (T + 0.03), 'z', w, Math.min(d.h, r.h - 0.2)); }
      else { const inward = Math.abs(d.at - r.x0) < 1e-6 ? 1 : -1; P.doorFrame(B, room, d.at + inward * (T + 0.03), mid, 'x', w, Math.min(d.h, r.h - 0.2)); }
    }
  }

  // ================================================================== OPEN TABLES (hiding places)
  for (const t of TABLES) if (t.room !== 'machine') P.steelTable(B, t.room, t.x, t.z, t.w, t.d, t.ry, R, t.inset);

  // ================================================================== DOCK
  {
    const rm = 'dock';
    // existing footprints: crate stacks and the forklift
    P.pallet(B, rm, P.mtx(-4.8, 0, 6.5, 0.1), R); P.boxStack(B, rm, card, -4.8, 0.145, 6.5, 0.1, R, 2, 1.25);
    P.pallet(B, rm, P.mtx(-5.2, 0, 3.0, -0.05), R); P.boxStack(B, rm, card, -5.2, 0.145, 3.0, 0, R, 3, 1.3);
    P.drum(B, rm, P.mtx(4.35, 0, 7.0, 1), R, 1, { dent: true }); P.drum(B, rm, P.mtx(4.9, 0, 7.45, 2), R, 1);
    P.forklift(B, rm, 5.0, 3.6, Math.PI, R);
    floorDecal(rm, 0, 5.0, 3.4, 1.8); floorDecal(rm, 7, 5.3, 4.4, 0.9);
    // shutter: bumpers, hazard paint, bollards, leveller plate
    for (const sx of [-1, 1]) {
      const bp = P.box(0.25, 0.45, 0.14); bp.translate(sx * 2.85, 0.75, 0.37); B.add('rubber', rm, bp, C('#111'));
      P.bollard(B, rm, sx * 3.05, 0.75); col(sx * 3.05 - 0.1, sx * 3.05 + 0.1, 0.65, 0.85);
    }
    for (let x = -2.5; x < 2.5; x += 1) floorDecal(rm, 12, x + 0.5, 1.45, 1.0, 0, 'decal', 0.3);
    const lev = P.box(4.6, 0.02, 1.4, 2); lev.translate(0, 0.255, 0.6); B.add('metal', rm, lev, C('#5c5e5c'));
    // pallets leaning on the east wall
    P.pallet(B, rm, new THREE.Matrix4().makeTranslation(6.5, 0.6, 6.1).multiply(new THREE.Matrix4().makeRotationZ(1.4)), R);
    P.pallet(B, rm, new THREE.Matrix4().makeTranslation(6.32, 0.6, 6.35).multiply(new THREE.Matrix4().makeRotationZ(1.38)), R, true);
    col(6.1, 6.7, 5.6, 6.8);
    sign(rm, 'z1', -4.2, 2.3, 14, 1.0); sign(rm, 'x0', 5.0, 2.6, 0, 1.1);
    P.extinguisher(B, rm, -6.66, 0.7, 8.6, Math.PI / 2); sign(rm, 'x0', 8.6, 1.55, 15, 0.32);
    P.elecPanel(B, rm, 6.68, 1.5, 1.6, -Math.PI / 2, ROOMS.dock.h, R);
    P.vent(B, rm, 3.5, 4.6, 9.69, Math.PI, 1.0, 0.6);
    for (const z of [2.5, 5.5, 8.5]) P.ibeam(B, rm, [-6.7, z], [6.7, z], 5.75, 0.35);
    fluoroRow(rm, [-4, 4], [4, 4], 5.2, 0, 4, 0.3); fluoroRow(rm, [-4, 7.5], [4, 7.5], 5.2, 0, 4, 0.3);
    for (let i = 0; i < 6; i++) floorDecal(rm, R() < 0.5 ? 15 : 1, -6 + R() * 12, 1.5 + R() * 7.5, 0.8 + R() * 1.4);
    floorDecal(rm, 6, -1.2, 6.5, 1.6, 0.2); floorDecal(rm, 6, 1.6, 7.5, 1.4, -0.1);
    floorDecal(rm, 8, -2.2, 8.9, 0.35);
    wallDecal(rm, 'x1', 8.5, 0.35, 11, 1.0, 0.7); wallDecal(rm, 'x0', 1.2, 2.2, 4, 1.4); wallDecal(rm, 'z1', 2.0, 3.2, 3, 0.8, 1.6);
    scatter(rm, 20, -6.3, 6.3, 1.5, 9.4);
    P.plasticWrap(B, rm, -3.4, 7.5, R); P.plasticWrap(B, rm, 2.8, 5.0, R);
    P.deadRoaches(B, rm, -6.3, 9.4, R, 12);
    roomCorners(rm);
  }

  // ================================================================== WAREHOUSE
  {
    const rm = 'ware';
    const racks = [[-8.5, 13, 21], [-8.5, 23.5, 30.6], [-4.5, 14.5, 25.5], [-0.5, 13.6, 19], [-0.5, 22.5, 30.6], [3.5, 15.8, 27.5], [7.5, 12.4, 20.2], [7.5, 23, 30.6]];
    for (const [x, z0, z1] of racks) P.rack(B, rm, card, x, z0, z1, R);
    // painted walkway lines
    for (const [x0, z0, x1, z1] of [[-11.1, 11.0, -11.1, 31.2], [11.1, 11.0, 11.1, 13.6], [11.1, 17.6, 11.1, 31.2], [-11.0, 11.4, 11.0, 11.4]]) {
      const L = Math.hypot(x1 - x0, z1 - z0), g = new THREE.PlaneGeometry(0.12, L).rotateX(-Math.PI / 2);
      const uv = g.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getY(i) * L / 2.5, uv.getX(i));
      g.rotateY(Math.atan2(x1 - x0, z1 - z0)); g.translate((x0 + x1) / 2, 0.005, (z0 + z1) / 2); B.add('line', rm, g);
    }
    // a toppled drum and its spill, a sack pile, boxes in the aisles
    P.drum(B, rm, P.mtx(-11.3, 0.29, 24.4, Math.PI / 2, 0, Math.PI / 2), R, 0, { dent: true }); floorDecal(rm, 2, -10.6, 25.0, 1.7);
    col(-11.62, -11.0, 24.3, 25.35);
    P.pallet(B, rm, P.mtx(10.9, 0, 25.0, Math.PI / 2), R); for (let s = 0; s < 7; s++) P.sack(B, rm, P.mtx(10.9 + (R() - 0.5) * 0.25, 0.15 + Math.floor(s / 2) * 0.13, 25.0 + ((s % 2) - 0.5) * 0.5, Math.PI / 2 + (R() - 0.5) * 0.4), R);
    col(10.3, 11.6, 24.3, 25.7); floorDecal(rm, 14, 10.1, 26.2, 1.2);
    P.pallet(B, rm, P.mtx(10.9, 0, 12.0, Math.PI / 2 + 0.1), R); P.boxStack(B, rm, card, 10.9, 0.145, 12.0, 0.1, R, 3, 1.25); col(10.3, 11.6, 11.3, 12.7);
    for (const [x, z] of [[-6.6, 21.8], [-2.4, 13.0], [1.6, 27.9], [5.6, 14.9], [-10.4, 15.6], [9.8, 21.5]]) P.crumpledBox(B, rm, card, 0.5 + R() * 0.2, 0.32 + R() * 0.15, 0.4 + R() * 0.2, P.mtx(x, 0.18, z, R() * 6, 0, R() < 0.3 ? 0.3 : 0), R, { open: R() < 0.5, crush: R() < 0.5 ? 0.45 : undefined });
    P.pallet(B, rm, P.mtx(-10.8, 0, 18.5, 0.3), R, true);
    // nests: squashed bugs, drag marks, droppings
    for (const [x, z] of [[-6.5, 17.5], [5.5, 28.5]]) { floorDecal(rm, 15, x, z, 2.6); floorDecal(rm, 8, x + 0.8, z - 1.2, 0.4); floorDecal(rm, 6, x + 0.3, z - 2.4, 1.5, 0.2); P.deadRoaches(B, rm, x, z, R, 14); }
    floorDecal(rm, 5, -10.4, 28.0, 1.2, 0.2); floorDecal(rm, 5, -10.6, 26.5, 1.2, 0.1);
    for (let i = 0; i < 14; i++) floorDecal(rm, [0, 1, 15, 15, 3, 7][Math.floor(R() * 6)], -11 + R() * 22, 11 + R() * 20, 0.7 + R() * 1.6);
    for (let i = 0; i < 5; i++) floorDecal(rm, 4, -11 + R() * 22, 11 + R() * 20, 1.2 + R());
    // structure overhead
    for (const z of [12, 16, 20, 24, 28]) P.ibeam(B, rm, [-11.7, z], [11.7, z], 6.6, 0.45);
    for (const x of [-6, 2, 10]) P.ibeam(B, rm, [x, 10.3], [x, 31.7], 6.25, 0.25);
    for (const x of [-6.5, -2.5, 1.5, 5.5, 9.5]) fluoroRow(rm, [x, 12], [x, 31], 5.8, Math.PI / 2, 4.5, 0.25);
    P.fluoro(B, rm, -6.5, 4.8, 18.2, 0.3, R, 1.1);
    P.cable(B, rm, [-6, 6.2, 14], [-6, 6.2, 22], 2.4); P.cable(B, rm, [2, 6.2, 20], [6, 6.2, 20], 1.5);
    // walls
    sign(rm, 'x0', 16, 3.0, 11, 1.4); sign(rm, 'x1', 26, 3.0, 12, 1.4, 1.4);
    sign(rm, 'x1', 18.4, 1.8, 1, 0.65); sign(rm, 'z1', -2, 3.4, 0, 1.6); sign(rm, 'z0', 4.2, 2.0, 6, 1.0);
    wallDecal(rm, 'x0', 26.0, 1.3, 10, 0.5); wallDecal(rm, 'z1', -6.0, 2.0, 9, 1.8, 1.8);
    wallDecal(rm, 'z1', 6.0, 0.4, 11, 1.4, 0.8); wallDecal(rm, 'x0', 12.5, 0.4, 11, 1.2, 0.7);
    for (let i = 0; i < 6; i++) wallDecal(rm, ['x0', 'x1', 'z1'][i % 3], 12 + R() * 18 - (i % 3 === 2 ? 15 : 0), 1 + R() * 4, i % 2 ? 4 : 3, 0.8 + R() * 0.8, 1 + R() * 1.4);
    P.extinguisher(B, rm, 3.4, 0.7, 10.32, 0); P.elecPanel(B, rm, -9.0, 1.5, 31.68, Math.PI, ROOMS.ware.h, R);
    P.vent(B, rm, 11.68, 5.2, 28, -Math.PI / 2, 1.2, 0.7);
    scatter(rm, 38, -11.4, 11.4, 10.8, 31.4);
    roomCorners(rm);
  }

  // ================================================================== MACHINE ROOM
  {
    const rm = 'machine';
    // pump skid at (15, 12)
    let g = P.box(2.3, 0.14, 1.5); g.translate(15, 0.07, 12); B.add('metal', rm, g, C('#3b4038'));
    g = P.cyl(0.36, 0.36, 1.0, 20); g.rotateZ(Math.PI / 2); g.translate(14.3, 0.6, 12); B.add('metal', rm, g, C('#2c5a3a'));
    for (let k = 0; k < 7; k++) { g = P.cyl(0.39, 0.39, 0.025, 20); g.rotateZ(Math.PI / 2); g.translate(13.9 + k * 0.12, 0.6, 12); B.add('metal', rm, g, C('#24452e')); }
    g = P.box(0.35, 0.3, 0.4); g.translate(14.95, 0.6, 12); B.add('metal', rm, g, C('#c9a21c'));
    g = P.cyl(0.46, 0.46, 0.32, 24); g.rotateX(Math.PI / 2); g.translate(15.65, 0.66, 12); B.add('metal', rm, g, C('#5a6266'));
    P.pipe(B, rm, [[15.65, 0.66, 12.2], [15.65, 0.66, 13.0], [15.65, 4.05, 13.0], [12.6, 4.05, 13.0]], 0.09, C('#6f7a7e'), R, { valve: [15.65, 1.5, 13.2] });
    P.pipe(B, rm, [[16.1, 0.66, 12], [16.6, 0.66, 12], [16.6, 0.06, 12]], 0.08, C('#6f7a7e'), R);
    P.quad(B, 'sign', rm, [0.25, 0.375, 0.125, 0.125], 0.22, 0.22, 15.9, 1.6, 13.12, '+z');
    floorDecal(rm, 0, 15.2, 12.4, 2.4); floorDecal(rm, 0, 16.6, 12.8, 0.9, 0, 'puddle');
    for (const [x, z, w, d] of [[15, 11.1, 2.6, 0.18], [15, 12.95, 2.6, 0.18]]) P.quad(B, 'decal', rm, decT.cell(12), w, d, x, 0.006, z, 'up');
    // vertical tank at (21, 16.5)
    P.tank(B, rm, 21.0, 16.5, 0.62, 2.6, R, -Math.PI / 2, C('#9aa39a'));
    P.quad(B, 'sign', rm, signT.cell(9), 0.35, 0.35, 20.36, 1.5, 16.5, '-x');
    // workbench at (14.2, 18.8): wood top, steel legs, vice, tools, rags
    g = P.box(2.2, 0.06, 0.8); g.translate(14.2, 0.88, 18.8); B.add('wood', rm, g, C('#ffffff'));
    for (const [x, z] of [[13.18, 18.48], [15.22, 18.48], [13.18, 19.12], [15.22, 19.12]]) { g = P.box(0.06, 0.85, 0.06); g.translate(x, 0.425, z); B.add('metal', rm, g, C('#3a3f44')); }
    g = P.box(0.2, 0.14, 0.18); g.translate(13.45, 0.98, 18.5); B.add('metal', rm, g, C('#2a4f8a'));
    g = P.box(0.32, 0.03, 0.05); g.translate(14.7, 0.93, 18.7); g.rotateY(0); B.add('metal', rm, g, C('#9a9a96'));
    g = P.cyl(0.07, 0.09, 0.2, 12); g.translate(15.0, 1.01, 19.0); B.add('metal', rm, g, C('#b8261c'));
    g = P.box(0.5, 0.25, 0.28); g.translate(16.0, 0.125, 19.35); B.add('metal', rm, g, C('#b8261c')); col(15.75, 16.25, 19.2, 19.5);      // the toolbox, out from under the bench
    for (const sx of [-1, 1]) { g = P.box(0.03, 0.03, 0.66); g.translate(14.2 + sx * 1.02, 0.18, 18.8); B.add('metal', rm, g, C('#3a3f44')); }
    P.plasticWrap(B, rm, 14.0, 18.2, R);
    // walls: control panel, gauges, electrical panel, pipes on the south wall
    g = P.box(1.0, 1.0, 0.25); g.translate(13.4, 1.3, 19.57); B.add('metal', rm, g, C('#7d8580'));
    P.quad(B, 'sign', rm, signT.cell(10), 0.9, 0.9, 13.4, 1.3, 19.43, '-z');
    sign(rm, 'x1', 12.6, 1.6, 9, 0.5); sign(rm, 'z0', 18.2, 1.8, 2, 0.6); sign(rm, 'x0', 18.5, 2.0, 5, 0.6);
    P.elecPanel(B, rm, 21.68, 1.4, 18.8, -Math.PI / 2, ROOMS.machine.h, R);
    P.pipe(B, rm, [[12.3, 3.6, 10.6], [21.7, 3.6, 10.6]], 0.11, C('#b0522a'), R, { wall: { axis: 'z', at: 10.3 } });
    P.pipe(B, rm, [[12.3, 3.9, 10.9], [18.2, 3.9, 10.9], [18.2, 3.9, 19.7]], 0.07, C('#557089'), R, { valve: [18.2, 3.6, 15.5] });
    P.drum(B, rm, P.mtx(12.72, 0, 18.65, 0.5), R, 3, { dent: true }); P.drum(B, rm, P.mtx(12.75, 0, 19.3, 1.4), R, 2);
    col(12.4, 13.05, 18.3, 19.6);
    for (let i = 0; i < 7; i++) floorDecal(rm, [0, 0, 7, 15, 3][Math.floor(R() * 5)], 12.8 + R() * 8.5, 10.8 + R() * 8.5, 0.7 + R() * 1.2);
    floorDecal(rm, 0, 19.0, 13.4, 1.1, 0, 'puddle'); floorDecal(rm, 13, 17.2, 15.0, 0.6, 0);
    wallDecal(rm, 'z0', 15, 2.6, 3, 0.9, 2.0); wallDecal(rm, 'x1', 13.5, 0.35, 11, 1.2, 0.7);
    fluoroRow(rm, [14, 15], [20, 15], 4.1, 0, 3, 0.3);
    scatter(rm, 14, 12.6, 21.4, 13.6, 19.4);
    roomCorners(rm);
  }

  // ================================================================== CORRIDOR
  {
    const rm = 'corridor';
    P.pipe(B, rm, [[17.05, 3.45, 20.3], [17.05, 3.45, 45.7]], 0.1, C('#7a8380'), R, { wall: { axis: 'x', at: 16.8 } });
    P.pipe(B, rm, [[19.95, 3.55, 20.3], [19.95, 3.55, 32.6], [19.95, 1.25, 32.6], [20.12, 1.25, 32.6]], 0.075, C('#a24b26'), R, { wall: { axis: 'x', at: 20.2 }, valve: [19.85, 1.4, 32.6] });
    P.pipe(B, rm, [[19.95, 3.55, 33.4], [19.95, 3.55, 45.7]], 0.075, C('#a24b26'), R, { wall: { axis: 'x', at: 20.2 } });
    // cable tray down the middle of the ceiling, with cables spilling out
    let g = P.box(0.4, 0.02, 25.4); g.translate(18.5, 3.82, 33); B.add('metal', rm, g, C('#8a8f8c'));
    for (const s of [-1, 1]) { g = P.box(0.02, 0.08, 25.4); g.translate(18.5 + s * 0.2, 3.86, 33); B.add('metal', rm, g, C('#8a8f8c')); }
    P.cable(B, rm, [18.4, 3.8, 26.5], [18.6, 3.8, 28.5], 1.3); P.cable(B, rm, [18.45, 3.8, 35.2], [18.55, 3.8, 36.4], 1.6, 0.016); P.cable(B, rm, [18.3, 3.8, 41], [18.7, 3.8, 43.5], 0.8);
    fluoroRow(rm, [18.5, 22], [18.5, 46], 3.55, Math.PI / 2, 4, 0.15);
    P.fluoro(B, rm, 18.1, 3.45, 35.0, Math.PI / 2 + 0.1, R, 0.95);
    // a fixture that came down, broken boards and tiles
    { const m = P.mtx(17.7, 0.04, 31.0, 0.7, 0, 0.12); let f = P.box(1.25, 0.07, 0.18); B.add('metal', rm, f, C('#cfd2cf'), m); f = P.cyl(0.013, 0.013, 1.0, 8); f.rotateZ(Math.PI / 2); f.translate(0.1, 0.05, 0.045); B.add('tube', rm, f, C('#ffffff'), m); }
    for (const [x, z] of [[18.0, 30.6], [18.9, 31.4], [17.6, 31.8], [19.3, 30.2]]) P.ceilingTile(B, rm, x, z, R);
    P.shards(B, rm, 18.3, 31.1, R, 12);
    sign(rm, 'x0', 24.0, 1.6, 3, 0.55); sign(rm, 'x1', 29.0, 1.6, 2, 0.55); sign(rm, 'x1', 44.2, 2.6, 13, 0.7);
    P.extinguisher(B, rm, 16.82, 0.7, 21.5, Math.PI / 2);
    wallDecal(rm, 'x1', 37.2, 1.3, 10, 0.45); wallDecal(rm, 'x1', 37.0, 1.0, 6, 0.6, 1.6, Math.PI / 2);
    for (let z = 23; z < 45; z += 3 + R() * 2) wallDecal(rm, R() < 0.5 ? 'x0' : 'x1', z, 2.6 + R() * 0.6, 3, 0.35 + R() * 0.3, 1.2 + R());
    for (let z = 22; z < 45; z += 4) wallDecal(rm, R() < 0.5 ? 'x0' : 'x1', z + R() * 2, 0.3, 11, 0.9 + R() * 0.6, 0.6);
    wallDecal(rm, 'x0', 33.0, 2.0, 4, 1.3);
    P.vent(B, rm, 20.18, 0.4, 33.6, -Math.PI / 2, 0.7, 0.4);
    floorDecal(rm, 1, 18.6, 26.2, 1.6, 0, 'puddle'); floorDecal(rm, 1, 18.1, 40.1, 1.3, 0, 'puddle');
    for (let i = 0; i < 6; i++) floorDecal(rm, 5, 18.0 + (i % 2) * 0.5, 22.5 + i * 0.85, 0.5, 0.05);
    floorDecal(rm, 8, 19.5, 30.0, 0.35); floorDecal(rm, 6, 17.6, 38.0, 1.4, 0);
    for (let i = 0; i < 8; i++) floorDecal(rm, [15, 15, 0, 3][Math.floor(R() * 4)], 17.2 + R() * 2.6, 21 + R() * 24, 0.6 + R());
    scatter(rm, 18, 17.0, 20.0, 20.5, 45.5);
    for (const z of [20.3, 33, 45.7]) corners.push([16.8, 4, z, 1, z > 40 ? -1 : 1], [20.2, 4, z, -1, z > 40 ? -1 : 1]);
  }

  // ================================================================== HALL
  {
    const rm = 'hall';
    P.tank(B, rm, -2.6, 49.6, 1.5, 5, R, Math.PI / 2, C('#8c9a8f'));
    P.tank(B, rm, -2.6, 66.4, 1.5, 5, R, Math.PI / 2, C('#9298a0'));
    P.tank(B, rm, 21.0, 66.4, 1.5, 5, R, -Math.PI / 2, C('#7d8c9e'));
    for (const [x, z, f] of [[-1.08, 49.6, '+x'], [-1.08, 66.4, '+x'], [19.48, 66.4, '-x']]) P.quad(B, 'sign', rm, signT.cell(2), 0.8, 0.8, x, 2.6, z, f);
    for (const [x, z] of [[-2.6, 49.6], [-2.6, 66.4], [21.0, 66.4]]) for (let a = 0; a < 16; a++) { const an = a / 16 * 6.28; P.quad(B, 'decal', rm, decT.cell(12), 0.6, 0.25, x + Math.sin(an) * 1.75, 0.006, z + Math.cos(an) * 1.75, 'up', an); }
    P.conveyor(B, rm, card, 3.8, 50, 65, R); P.conveyor(B, rm, card, 10.5, 50, 65, R); P.conveyor(B, rm, card, 17.5, 56, 65, R);
    // hopper over the middle line
    let g = new THREE.CylinderGeometry(0.95, 0.22, 1.3, 4, 1, true); g.rotateY(Math.PI / 4); g.translate(10.5, 2.45, 52.2); B.add('metal', rm, g, C('#8a8f7a'));
    for (const [sx, sz] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) { g = P.box(0.08, 3.2, 0.08); g.translate(10.5 + sx * 0.9, 1.6, 52.2 + sz * 0.7); B.add('metal', rm, g, C('#5b6b4f')); }
    for (const sx of [-1, 1]) col(10.5 + sx * 0.9 - 0.06, 10.5 + sx * 0.9 + 0.06, 51.44, 51.56), col(10.5 + sx * 0.9 - 0.06, 10.5 + sx * 0.9 + 0.06, 52.84, 52.96);
    // generator platform edge paint
    for (let x = 1.0; x < 4.1; x += 0.6) P.quad(B, 'decal', rm, decT.cell(12), 0.6, 0.2, x, 0.306, 65.4, 'up');
    // roof trusses
    for (const z of [49, 55, 61, 67]) {
      P.ibeam(B, rm, [-5.7, z], [23.7, z], 7.75, 0.3); P.ibeam(B, rm, [-5.7, z], [23.7, z], 6.95, 0.25);
      for (let x = -5; x < 23.5; x += 1.6) { const up = Math.round((x + 5) / 1.6) % 2; const a = new V3(x, 6.95, z), b = new V3(x + 1.6, 7.75, z); if (up) [a.y, b.y] = [b.y, a.y]; const L = a.distanceTo(b); const st = P.box(0.06, L, 0.06); st.applyMatrix4(new THREE.Matrix4().makeRotationZ(Math.atan2(b.y - a.y, b.x - a.x) - Math.PI / 2)); st.translate((a.x + b.x) / 2, (a.y + b.y) / 2, z); B.add('metal', rm, st, C('#4a4f55')); }
    }
    for (const x of [0, 9, 18]) P.ibeam(B, rm, [x, 46.3], [x, 69.7], 6.8, 0.25);
    for (const [x, z, l] of [[7.2, 55, 3.2], [13.8, 61, 2.4], [0.8, 61, 4.0], [14.5, 49, 1.8]]) P.chainHook(B, rm, x, 6.85, l, z);
    P.cable(B, rm, [2, 6.9, 55], [2, 6.9, 61], 1.8); P.cable(B, rm, [15, 6.9, 49], [15, 6.9, 55], 2.6, 0.018); P.cable(B, rm, [20, 6.9, 61], [23.5, 6.9, 61], 1.1);
    // high-bay lamps (dead)
    for (const [x, z] of [[1, 52], [7, 58], [13, 52], [19, 58], [7, 64], [13, 64]]) {
      g = new THREE.ConeGeometry(0.35, 0.4, 16, 1, true); g.translate(x, 5.6, z); B.add('metal', rm, g, C('#5a5f5a'));
      g = P.cyl(0.008, 0.008, 1.3, 4); g.translate(x, 6.45, z); B.add('metal', rm, g, C('#444'));
    }
    // drums along the east wall, sacks on the west
    for (let i = 0; i < 7; i++) P.drum(B, rm, P.mtx(23.1 - (i % 2) * 0.62, 0, 49.8 + Math.floor(i / 2) * 0.62 + (i % 2) * 0.3, R() * 6), R, Math.floor(R() * 4), { dent: R() < 0.5 });
    P.drum(B, rm, P.mtx(22.0, 0.29, 53.2, 2.2, 0, Math.PI / 2), R, 0, { dent: true }); floorDecal(rm, 2, 21.4, 53.6, 1.9);
    col(21.7, 23.7, 49.4, 54.0);
    P.pallet(B, rm, P.mtx(-4.9, 0, 53.5, Math.PI / 2), R); for (let s = 0; s < 8; s++) P.sack(B, rm, P.mtx(-4.9 + (R() - 0.5) * 0.25, 0.15 + Math.floor(s / 2) * 0.13, 53.5 + ((s % 2) - 0.5) * 0.5, Math.PI / 2 + (R() - 0.5) * 0.4), R);
    col(-5.6, -4.2, 52.8, 54.2); floorDecal(rm, 14, -4.0, 54.6, 1.4);
    P.pallet(B, rm, P.mtx(0.9, 0, 58.0, 2.1), R, true); P.pallet(B, rm, P.mtx(22.9, 0, 60.5, 1.2), R);
    P.boxStack(B, rm, card, 22.9, 0.145, 60.5, 1.2, R, 2, 1.2); col(22.3, 23.6, 59.9, 61.1);
    // centipede vent: big, slats bent
    { const g = P.box(1.4, 0.8, 0.02); g.translate(15, 0.55, 69.69); B.add('rubber', rm, g, C('#030303')); }   // the vent itself: its cover belongs to the centipede
    wallDecal(rm, 'z1', 15, 0.6, 3, 1.8, 1.2); wallDecal(rm, 'z1', 15.2, 0.25, 11, 2.6, 0.6);
    // boarded high windows
    for (const x of [0, 6, 18]) {
      g = P.box(2.0, 1.1, 0.02); g.translate(x, 5.6, 69.68); B.add('rubber', rm, g, C('#06080a'));
      for (let k = 0; k < 3; k++) { g = P.box(2.3, 0.18, 0.04); g.rotateZ((R() - 0.5) * 0.3); g.translate(x, 5.25 + k * 0.35, 69.64); B.add('wood', rm, g, C('#ffffff')); }
    }
    sign(rm, 'z0', 6.0, 3.6, 13, 2.2); sign(rm, 'z0', 0.0, 2.1, 6, 1.1); sign(rm, 'z1', 9.0, 4.2, 0, 1.6); sign(rm, 'x1', 60.0, 2.0, 5, 0.7);
    P.elecPanel(B, rm, 14.6, 1.5, 46.32, 0, ROOMS.hall.h, R); P.elecPanel(B, rm, 23.68, 1.5, 58.0, -Math.PI / 2, ROOMS.hall.h, R);
    P.extinguisher(B, rm, -5.68, 0.7, 60.6, Math.PI / 2);
    P.pipe(B, rm, [[-5.4, 4.6, 46.6], [23.4, 4.6, 46.6]], 0.14, C('#6f7a7e'), R, { wall: { axis: 'z', at: 46.3 } });
    P.pipe(B, rm, [[-2.6, 5.15, 51.1], [-2.6, 5.6, 51.6], [21, 5.6, 51.6], [21, 5.6, 64.9], [21, 5.15, 64.9]], 0.1, C('#557089'), R);
    // floor: drains, spills, stains, prints
    for (const [x, z] of [[7.2, 60.5], [14.1, 52.4], [0.6, 63.6]]) floorDecal(rm, 13, x, z, 0.7, 0);
    floorDecal(rm, 2, 0.6, 50.0, 2.4); floorDecal(rm, 2, -0.4, 64.6, 1.8); floorDecal(rm, 0, 17.6, 54.0, 2.2);
    for (let i = 0; i < 18; i++) floorDecal(rm, [0, 1, 15, 15, 3, 7, 4][Math.floor(R() * 7)], -5.4 + R() * 28.8, 46.6 + R() * 22.8, 0.8 + R() * 1.8);
    floorDecal(rm, 1, 7.4, 57.0, 2.0, 0, 'puddle'); floorDecal(rm, 1, 14.0, 63.0, 1.5, 0, 'puddle'); floorDecal(rm, 0, 20.0, 48.6, 1.8, 0, 'puddle');
    for (let i = 0; i < 8; i++) floorDecal(rm, 5, 16.6 + (i % 2) * 0.45 - i * 0.6, 47.5 + i * 0.9, 0.5, 0.6);
    floorDecal(rm, 8, 12.0, 57.0, 0.5); floorDecal(rm, 8, 11.6, 56.4, 0.3);
    for (let i = 0; i < 8; i++) wallDecal(rm, ['z0', 'z1', 'x1'][i % 3], i % 3 === 2 ? 48 + R() * 20 : -4 + R() * 26, 1.2 + R() * 4, i % 2 ? 4 : 3, 0.9 + R(), 1.2 + R() * 2);
    wallDecal(rm, 'x1', 64.0, 1.4, 10, 0.5);
    scatter(rm, 34, -5.3, 23.3, 46.8, 69.2);
    roomCorners(rm);
    corners.push([-5.7, 7.6, 58, 1, 0.3], [23.7, 7.6, 52, -1, 0.3]);
  }

  // ================================================================== LAB
  {
    const rm = 'lab';
    P.labBench(B, rm, -12.5, 56.4, 3.2, 1.0, 0, R); P.labBench(B, rm, -12.5, 60.0, 3.2, 1.0, Math.PI, R); P.labBench(B, rm, -12.0, 63.2, 2.4, 0.8, Math.PI, R);
    // CRT and microscope
    let g = P.box(0.42, 0.38, 0.42); g.translate(-13.4, 1.1, 60.1); B.add('metal', rm, g, C('#c9c3b2'));
    P.quad(B, 'glass', rm, [0, 0, 1, 1], 0.3, 0.24, -13.4, 1.12, 59.885, '-z');
    g = P.box(0.18, 0.04, 0.24); g.translate(-11.6, 0.92, 56.4); B.add('metal', rm, g, C('#ddd'));
    g = P.box(0.05, 0.26, 0.05); g.translate(-11.6, 1.05, 56.5); B.add('metal', rm, g, C('#ddd'));
    g = P.cyl(0.025, 0.03, 0.2, 10); g.rotateX(0.5); g.translate(-11.6, 1.18, 56.42); B.add('metal', rm, g, C('#222'));
    for (let i = 0; i < 4; i++) P.paperSheet(B, rm, -14 + R() * 3, 0.9, 56.2 + R() * 0.3, R() * 6, R);
    // metal shelving with bottles and binders
    for (const z of [60.05, 62.95]) for (const x of [-19.75, -19.05]) { g = P.box(0.04, 2.2, 0.04); g.translate(x, 1.1, z); B.add('metal', rm, g, C('#9ba0a0')); }
    for (const y of [0.15, 0.7, 1.25, 1.8, 2.15]) {
      g = P.box(0.72, 0.025, 2.92); g.translate(-19.4, y, 61.5); B.add('metal', rm, g, C('#a6abab'));
      if (y > 2) continue;
      for (let z = 60.2; z < 62.8; z += 0.12 + R() * 0.2) {
        const k = R();
        if (k < 0.45) { g = P.cyl(0.04, 0.045, 0.2 + R() * 0.1, 10); g.translate(-19.4 + (R() - 0.5) * 0.3, y + 0.13, z); B.add(R() < 0.6 ? 'amber' : 'glass', rm, g, C('#fff')); }
        else if (k < 0.75) { g = P.box(0.3, 0.3, 0.06); g.translate(-19.45, y + 0.16, z); g.rotateX(0); B.add('metal', rm, g, C(['#1d4f8a', '#8a1d1d', '#2f5a33', '#c9a21c'][Math.floor(R() * 4)])); }
      }
    }
    // fume hood and sink on the north wall
    g = P.box(1.6, 0.9, 0.8); g.translate(-16.5, 0.45, 63.3); B.add('metal', rm, g, C('#c9cbc5'));
    g = P.box(1.6, 1.0, 0.8); g.translate(-16.5, 1.95, 63.3); B.add('metal', rm, g, C('#d8dad4'));
    g = P.box(1.6, 0.3, 0.8); g.translate(-16.5, 2.35, 63.3); B.add('metal', rm, g, C('#b8bab4'));
    P.quad(B, 'glass', rm, [0, 0, 1, 1], 1.5, 0.9, -16.5, 1.4, 62.89, '+z');
    g = P.box(1.5, 0.02, 0.7); g.translate(-16.5, 0.92, 63.3); B.add('metal', rm, g, C('#1d1f20'));
    col(-17.3, -15.7, 62.9, 63.7);
    g = P.box(1.2, 0.85, 0.6); g.translate(-8.2, 0.43, 63.4); B.add('metal', rm, g, C('#c9cbc5'));
    g = P.box(0.6, 0.02, 0.4); g.translate(-8.2, 0.87, 63.4); B.add('metal', rm, g, C('#888'));
    g = P.cyl(0.015, 0.015, 0.35, 8); g.translate(-8.2, 1.05, 63.62); B.add('metal', rm, g, C('#bbb'));
    col(-8.8, -7.6, 63.1, 63.7);
    // overturned stool, broken glass, spills
    g = P.cyl(0.18, 0.18, 0.04, 16); g.rotateZ(1.4); g.translate(-9.3, 0.2, 57.4); B.add('rubber', rm, g, C('#222'));
    for (let k = 0; k < 3; k++) { g = P.cyl(0.015, 0.015, 0.6, 6); g.rotateZ(Math.PI / 2 + (k - 1) * 0.3); g.translate(-9.0, 0.2 + (k - 1) * 0.06, 57.4 + (k - 1) * 0.1); B.add('metal', rm, g, C('#999')); }
    P.shards(B, rm, -12.0, 58.2, R, 18); P.shards(B, rm, -14.8, 61.6, R, 10);
    floorDecal(rm, 2, -12.2, 58.3, 1.6); floorDecal(rm, 2, -15.6, 61.7, 1.1); floorDecal(rm, 13, -13.5, 58.2, 0.5, 0);
    for (let i = 0; i < 10; i++) floorDecal(rm, [15, 1, 3, 8][Math.floor(R() * 4)], -19.4 + R() * 13, 52.6 + R() * 10.8, 0.6 + R());
    sign(rm, 'x1', 61.3, 1.6, 8, 1.4); sign(rm, 'x1', 55.0, 1.7, 7, 0.6); sign(rm, 'z0', -15.5, 3.45, 4, 0.75, 0.5, true); sign(rm, 'z1', -10.0, 2.2, 3, 0.55);
    wallDecal(rm, 'x0', 54.0, 1.0, 10, 0.5); wallDecal(rm, 'z1', -18.5, 0.35, 11, 1.3, 0.7); wallDecal(rm, 'x1', 62.8, 2.6, 4, 1.0);
    P.vent(B, rm, -12, 3.7, 63.68, Math.PI, 0.9, 0.5);
    fluoroRow(rm, [-18, 58], [-8, 58], 4.1, 0, 3.4, 0.35);
    scatter(rm, 22, -19.4, -6.6, 52.6, 63.4);
    roomCorners(rm);
  }

  // ================================================================== EMERGENCY PASSAGE
  for (const rm of ['pass1', 'pass2']) {
    if (rm === 'pass1') {
      P.crumpledBox(B, rm, card, 1.0, 0.7, 1.0, P.mtx(-16.3, 0.35, 33.5, 0.2), R, { crush: 0.3 });
      P.drum(B, rm, P.mtx(-14.62, 0, 46.0, 1.2), R, 3, { dent: true }); col(-14.95, -14.3, 45.65, 46.35);
      P.pipe(B, rm, [[-14.55, 3.15, 27.3], [-14.55, 3.15, 51.7]], 0.08, C('#8a4a2a'), R, { wall: { axis: 'x', at: -14.3 } });
      P.pipe(B, rm, [[-16.45, 3.25, 27.3], [-16.45, 3.25, 51.7]], 0.05, C('#7a8380'), R, { wall: { axis: 'x', at: -16.7 } });
      sign(rm, 'z1', -15.5, 3.26, 4, 0.6, 0.4, true); sign(rm, 'x1', 29.6, 2.4, 4, 0.5, 0.33, true);
      for (const z of [36, 46]) { const g = P.box(0.35, 0.16, 0.12); g.translate(-14.36, 2.9, z); B.add('metal', rm, g, C('#d8d8d0')); }
      for (let z = 28; z < 51; z += 2 + R() * 2) { floorDecal(rm, 1, -15.5 + (R() - 0.5) * 1.2, z, 1.0 + R() * 1.2, 0, 'puddle'); }
      for (let z = 28; z < 51; z += 2.5) { wallDecal(rm, R() < 0.5 ? 'x0' : 'x1', z + R(), 0.4, 11, 1.2 + R(), 0.8); if (R() < 0.6) wallDecal(rm, R() < 0.5 ? 'x0' : 'x1', z + R(), 2.4, 3, 0.5, 1.5); }
      wallDecal(rm, 'x0', 41.0, 1.4, 9, 1.2); wallDecal(rm, 'x1', 44.0, 1.2, 10, 0.45);
      for (let i = 0; i < 12; i++) P.chunk(B, rm, -16.5 + R() * 2.2, 28 + R() * 23, 0.04 + R() * 0.1, R, '#7c7870');
      scatter(rm, 14, -16.5, -14.5, 27.5, 51.5);
      for (const z of [27.3, 40, 51.7]) corners.push([-16.7, 3.5, z, 1, z > 45 ? -1 : 1], [-14.3, 3.5, z, -1, z > 45 ? -1 : 1]);
    } else {
      floorDecal(rm, 1, -13.0, 28.5, 1.2, 0, 'puddle'); scatter(rm, 4, -13.7, -12.3, 27.4, 29.6);
    }
  }

  // ---------------------------------------------------------------- materials
  const woodT = PT.wood(), drumT = PT.drums(), sackT = PT.sack(), paperT = PT.paper(), wireT = PT.wireMesh();
  const std = (o) => new THREE.MeshStandardMaterial({ vertexColors: true, ...o });
  const materials = {
    card: std({ map: card.map, normalMap: card.normal, normalScale: new THREE.Vector2(0.8, 0.8), roughness: 0.93 }),
    wood: std({ map: woodT, roughness: 0.88 }),
    metal: std({ map: metalT.map, normalMap: metalT.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.5, metalness: 0.12 }),
    mesh: std({ map: wireT, alphaTest: 0.5, side: THREE.DoubleSide, roughness: 0.5, metalness: 0.5 }),
    drum: std({ map: drumT, roughness: 0.45, metalness: 0.12 }),
    sack: std({ map: sackT, roughness: 0.95 }),
    rubber: std({ roughness: 0.8 }),
    tube: std({ color: 0xe8ece8, roughness: 0.25 }),
    glass: std({ color: 0xc8dce4, transparent: true, opacity: 0.22, roughness: 0.05, depthWrite: false, side: THREE.DoubleSide }),
    amber: std({ color: 0x7a4310, transparent: true, opacity: 0.62, roughness: 0.08, depthWrite: false }),
    liquid: std({ transparent: true, opacity: 0.7, roughness: 0.2, depthWrite: false }),
    paper: std({ map: paperT, side: THREE.DoubleSide, roughness: 0.95 }),
    wrap: std({ color: 0xe8eef2, transparent: true, opacity: 0.32, roughness: 0.15, side: THREE.DoubleSide, depthWrite: false }),
    decal: std({ map: decT.map, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2, roughness: 0.85 }),
    puddle: std({ map: decT.map, color: 0x6a6a6a, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, roughness: 0.04, metalness: 0.0 }),
    line: std({ map: laneLineTex(), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1, roughness: 0.7 }),
    sign: std({ map: signT.map, roughness: 0.6, metalness: 0.05, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
    signGlow: std({ map: signT.map, emissive: 0xffffff, emissiveMap: signT.map, emissiveIntensity: 0.55, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -1, polygonOffsetUnits: -1 }),
  };
  const shadows = new Set(['card', 'metal', 'drum']);
  const group = new THREE.Group();
  group.name = 'dressing';
  const meshes = B.build(materials, group, shadows);
  for (const m of meshes) if (['glass', 'amber', 'liquid', 'wrap', 'decal', 'puddle', 'line'].includes(m.userData.dressMat)) m.renderOrder = 2;

  // ---------------------------------------------------------------- cobwebs in corners
  if (silkMat) {
    const segs = [];
    for (const [x, y, z, dx, dz] of corners) {
      const c = new V3(x, y - 0.02, z), n = 3 + Math.floor(R() * 4), size = 0.45 + R() * 0.7;
      const spokes = [];
      for (let k = 0; k < n + 3; k++) {
        const t = k / (n + 2), a = new V3(dx * size * (1 - t) * (0.6 + R() * 0.5), -size * (0.3 + R() * 0.8) * Math.sin(t * Math.PI * 0.5 + 0.2), dz * size * t * (0.6 + R() * 0.5));
        const end = c.clone().add(a);
        spokes.push(end); sagLine(c, end, 0.02, 3, segs);
      }
      for (let ring = 1; ring <= 4; ring++) {
        const f = ring / 5;
        for (let k = 0; k < spokes.length - 1; k++) if (R() < 0.85) sagLine(c.clone().lerp(spokes[k], f), c.clone().lerp(spokes[k + 1], f + (R() - 0.5) * 0.05), 0.015 + R() * 0.03, 2, segs);
      }
      if (R() < 0.5) { const tail = c.clone().add(new V3(dx * 0.2, -0.9 - R(), dz * 0.2)); sagLine(c.clone().lerp(spokes[1], 0.5), tail, 0.0, 2, segs); }
    }
    const webs = new THREE.LineSegments(segmentsGeometry(segs), silkMat);
    webs.frustumCulled = false;
    group.add(webs);
  }

  // ---------------------------------------------------------------- dust drifting in the beam
  const N = 900, pos = new Float32Array(N * 3), seed = new Float32Array(N);
  for (let i = 0; i < N; i++) { pos[i * 3] = (R() - 0.5) * 16; pos[i * 3 + 1] = R() * 5; pos[i * 3 + 2] = (R() - 0.5) * 16; seed[i] = R(); }
  const dg = new THREE.BufferGeometry();
  dg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); dg.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
  const dust = new THREE.Points(dg, new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCam: { value: new V3() }, uSpot: { value: new V3() }, uDir: { value: new V3(0, 0, -1) }, uOn: { value: 0 }, uTime: { value: 0 }, uPx: { value: 300 } },
    vertexShader: `
      attribute float aSeed; uniform vec3 uCam, uSpot, uDir; uniform float uOn, uTime, uPx; varying float vA;
      void main() {
        vec3 p = position;
        p.xz += vec2(sin(uTime * 0.13 + aSeed * 40.0), cos(uTime * 0.11 + aSeed * 31.0)) * 0.6;
        p.y += sin(uTime * 0.2 + aSeed * 17.0) * 0.3 - mod(uTime * 0.03 * (0.5 + aSeed), 5.0);
        // wrap the cloud round the camera so there is always dust near you
        p.xz = mod(p.xz - uCam.xz + 8.0, 16.0) - 8.0 + uCam.xz;
        p.y = mod(p.y, 5.0);
        vec3 v = p - uSpot; float d = length(v);
        float cone = smoothstep(0.86, 0.95, dot(v / d, uDir));
        vA = uOn * cone * (1.0 - smoothstep(2.0, 9.0, d)) * smoothstep(0.25, 0.8, d) * (0.4 + 0.6 * fract(aSeed * 13.0));
        vec4 mv = modelViewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uPx * (0.008 + 0.012 * aSeed) / -mv.z;
      }`,
    fragmentShader: `
      varying float vA;
      void main() { float r = length(gl_PointCoord - 0.5); if (vA < 0.01 || r > 0.5) discard; gl_FragColor = vec4(vec3(1.0, 0.95, 0.85) * vA * (1.0 - r * 2.0) * 0.9, 1.0); }`,
  }));
  dust.frustumCulled = false;
  group.add(dust);

  scene.add(group);
  return {
    group, meshes,
    metalMaterial: (hex) => new THREE.MeshStandardMaterial({ color: hex, map: metalT.map, normalMap: metalT.normal, normalScale: new THREE.Vector2(0.5, 0.5), roughness: 0.5, metalness: 0.12 }),
    update(dt, cam, spotPos, spotDir, on, pxScale) {
      const u = dust.material.uniforms;
      u.uTime.value += dt; u.uCam.value.copy(cam); u.uSpot.value.copy(spotPos); u.uDir.value.copy(spotDir); u.uOn.value = on; u.uPx.value = pxScale;
    },
  };
}
