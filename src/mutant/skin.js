import * as THREE from 'three';
import { fbmGrid, heightToNormal } from '../textures.js';

// Bare skin for the fused bugs: a normal map of fine creases and pores, and a material that uses it.
let skinN = null;
export function skinNormal() {
  if (skinN) return skinN;
  const N = 512, a = fbmGrid(N, 9, 911, 5, true), b = fbmGrid(N, 44, 313, 2, true), c = fbmGrid(N, 4, 77, 3, true);
  const H = new Float32Array(N * N);
  for (let i = 0; i < N * N; i++) H[i] = (1 - Math.abs(a[i] * 2 - 1)) * 0.55 + b[i] * 0.3 + c[i] * 0.15;
  const t = new THREE.CanvasTexture(heightToNormal(H, N, N, 4, true));
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.NoColorSpace; t.anisotropy = 8;
  return (skinN = t);
}
export const skinMat = (o = {}) => new THREE.MeshPhysicalMaterial({
  color: 0xffffff, roughness: 0.55, clearcoat: 0.3, clearcoatRoughness: 0.45, sheen: 0.4, sheenRoughness: 0.5, sheenColor: new THREE.Color('#d8b8bc'),
  normalMap: skinNormal(), normalScale: new THREE.Vector2(0.6, 0.6), ...o,
});

