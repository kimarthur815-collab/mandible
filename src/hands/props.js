// Held props: a black tactical flashlight and an aerosol insecticide can.
// Both are built along +Z (flashlight: tail -> lens, can: base -> nozzle).
import * as THREE from 'three';
import { anodisedMaterial, knurlTextures, canLabelTexture } from './materials.js';

const V2 = THREE.Vector2;
function lathe(pts, seg = 64) {
  const g = new THREE.LatheGeometry(pts.map(([r, z]) => new V2(r, z)), seg);
  g.rotateX(Math.PI / 2);
  return g;
}

// radius of the flashlight body at z (for the grasp solver)
export const FLASH_PROFILE = [
  [0.0118, -0.0868], [0.0130, -0.0858], [0.0131, -0.0800], [0.0137, -0.0790], [0.0137, -0.0770], [0.0129, -0.0760], [0.0129, -0.0730],
  [0.0135, -0.0720], [0.0135, 0.0280], [0.0129, 0.0290],
  [0.0141, 0.0320], [0.0143, 0.0380], [0.0137, 0.0392], [0.0137, 0.0408], [0.0151, 0.0420], [0.0151, 0.0440], [0.0144, 0.0452], [0.0144, 0.0470],
  [0.0163, 0.0490], [0.0170, 0.0570], [0.0187, 0.0640], [0.0193, 0.0700], [0.0193, 0.0828], [0.0187, 0.0850], [0.0174, 0.0852],
];
export function flashRadius(z) {
  const P = FLASH_PROFILE;
  if (z < P[0][1] || z > P[P.length - 1][1]) return 0;
  for (let i = 1; i < P.length; i++) if (z <= P[i][1]) { const t = (z - P[i - 1][1]) / (P[i][1] - P[i - 1][1] || 1); return P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t; }
  return 0;
}
// signed distance to the flashlight (approximate: a solid of revolution), in its own frame
export function flashSDF(p) {
  const z = THREE.MathUtils.clamp(p.z, -0.0868, 0.0852), r = Math.hypot(p.x, p.y);
  const R = flashRadius(z);
  const dr = r - R, dz = Math.max(-0.0868 - p.z, p.z - 0.0852, 0);
  return dz > 0 ? Math.hypot(Math.max(dr, 0), dz) : dr;
}

export function makeFlashlight() {
  const g = new THREE.Group();
  const body = anodisedMaterial();
  const kn = knurlTextures();
  kn.normal.repeat.set(1, 1);
  const knurl = anodisedMaterial({ knurl: kn.normal });
  const P = FLASH_PROFILE;
  const tail = new THREE.Mesh(lathe([[0, -0.0868], ...P.slice(0, 7)], 64), body);
  const grip = new THREE.Mesh(lathe(P.slice(6, 10), 96), knurl);
  const headMat = body.clone(); headMat.emissive = new THREE.Color(0xb8501e); headMat.emissiveIntensity = 0;    // glows when it overheats
  const head = new THREE.Mesh(lathe([...P.slice(9), [0.0172, 0.0842]], 96), headMat);
  // the reflector: a parabolic mirror down to the emitter
  const refl = [];
  for (let i = 0; i <= 24; i++) { const r = 0.0042 + (0.0170 - 0.0042) * (i / 24); refl.push([r, 0.0705 + 0.0132 * ((r * r - 0.0042 * 0.0042) / (0.017 * 0.017 - 0.0042 * 0.0042))]); }
  const mirror = new THREE.Mesh(lathe(refl, 64), new THREE.MeshPhysicalMaterial({ color: 0xe8ecef, metalness: 1, roughness: 0.1, side: THREE.DoubleSide }));
  // emitter: a yellow phosphor square on a white board
  const board = new THREE.Mesh(new THREE.CylinderGeometry(0.0042, 0.0042, 0.0008, 24).rotateX(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0xdedad0, roughness: 0.6 }));
  board.position.z = 0.0703;
  const ledMat = new THREE.MeshStandardMaterial({ color: 0xf2d27a, roughness: 0.4, emissive: new THREE.Color(0xfff2d8), emissiveIntensity: 0 });
  const led = new THREE.Mesh(new THREE.BoxGeometry(0.0032, 0.0032, 0.0012), ledMat);
  led.position.z = 0.0710;
  const glass = new THREE.Mesh(new THREE.CircleGeometry(0.0173, 48), new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0, roughness: 0.03, transparent: true, opacity: 0.16, clearcoat: 1, ior: 1.5, depthWrite: false }));
  glass.position.z = 0.0838;
  const btn = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2).scale(0.0088, 0.0088, 0.0028).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x18191a, roughness: 0.92 }));
  btn.position.z = -0.0866;
  // a bare-metal ring at the bezel crown, worn through the anodising
  const crown = new THREE.Mesh(new THREE.TorusGeometry(0.0190, 0.0011, 10, 64), new THREE.MeshPhysicalMaterial({ color: 0x9a9ea4, metalness: 1, roughness: 0.35 }));
  crown.position.z = 0.0842;
  for (const m of [tail, grip, head, mirror, board, led, btn, crown]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  g.add(glass);
  g.userData = { led: ledMat, head: headMat, lensZ: 0.0845 };
  return g;
}

// ------------------------------------------------------------------ aerosol can
export const CAN = { r: 0.0333, z0: -0.095, z1: 0.074 };
export function canSDF(p) {
  const r = Math.hypot(p.x, p.y);
  let top = CAN.z1;
  if (r < CAN.r) top = CAN.z1 + 0.018 * (1 - Math.pow(r / CAN.r, 2));      // the domed shoulder
  const dr = r - CAN.r, dz = Math.max(CAN.z0 - p.z, p.z - top, 0);
  return dz > 0 ? Math.hypot(Math.max(dr, 0), dz) : Math.max(dr, Math.max(CAN.z0 - p.z, p.z - top));
}
export function makeCan() {
  const g = new THREE.Group();
  const metal = new THREE.MeshPhysicalMaterial({ color: 0xc9ccd0, metalness: 0.9, roughness: 0.32, clearcoat: 0.3 });
  const label = new THREE.MeshPhysicalMaterial({ map: canLabelTexture(), roughness: 0.42, clearcoat: 0.5, clearcoatRoughness: 0.25 });
  const bottom = new THREE.Mesh(lathe([[0, -0.0915], [0.026, -0.0925], [0.0305, -0.0950], [0.0330, -0.0935], [0.0333, -0.0880]], 64), metal);
  const lab = new THREE.Mesh(lathe([[0.0333, -0.0880], [0.0333, 0.0720]], 96), label);
  const shoulder = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16, r = 0.0333 - (0.0333 - 0.0140) * Math.sin(t * Math.PI / 2); shoulder.push([r, 0.0720 + 0.0215 * Math.sin(t * Math.PI / 2 + 0.0) * (0.4 + 0.6 * t)]); }
  shoulder.push([0.0150, 0.0950], [0.0128, 0.0960]);
  const top = new THREE.Mesh(lathe(shoulder, 64), metal);
  // the white actuator cap with its nozzle
  const capMat = new THREE.MeshStandardMaterial({ color: 0xf0eee8, roughness: 0.55 });
  const cap = new THREE.Mesh(lathe([[0, 0.1190], [0.0115, 0.1185], [0.0132, 0.1160], [0.0135, 0.0965], [0.0128, 0.0950]], 48), capMat);
  const nozzle = new THREE.Mesh(new THREE.CylinderGeometry(0.0022, 0.0022, 0.004, 16).rotateZ(Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.6 }));
  nozzle.position.set(-0.0128, 0, 0.1105);       // on the side away from the label's front: it sprays away from you
  for (const m of [bottom, lab, top, cap, nozzle]) { m.castShadow = true; m.receiveShadow = true; g.add(m); }
  // the label's text faces outward on the visible side
  lab.rotation.z = -Math.PI * 0.1;
  return g;
}
