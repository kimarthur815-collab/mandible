// Materials for the first-person arms: blue nitrile gloves, white flash-spun (Tyvek-like) suit,
// black anodised flashlight, aerosol can. Everything is generated in code.
import * as THREE from 'three';
import { fbm, hash2, heightToNormal, vnoise } from '../textures.js';

export function canvasTex(c, srgb, repeat = true) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 8;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}
function canvas(w, h = w) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
const fract = (x) => x - Math.floor(x);

// ------------------------------------------------------------------ Tyvek
// Flash-spun polyethylene: a cloudy, blotchy look (thicker and thinner patches of fibre), fine
// fibre grain, and sharp-ish creases from being crumpled. Texture covers ~16 cm x 16 cm.
export function tyvekTextures(N = 512, seed = 3) {
  const H = new Float32Array(N * N), C = new Float32Array(N * N);
  // crease network: random line segments, tiled
  const lines = [];
  let s = seed * 9301 + 7;
  const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  for (let i = 0; i < 70; i++) {
    const cx = R(), cy = R(), a = R() * Math.PI, L = 0.05 + R() * 0.22, w = 0.0025 + R() * 0.006, d = 0.4 + R() * 0.6;
    lines.push({ cx, cy, dx: Math.cos(a), dy: Math.sin(a), L, w, d });
  }
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const u = x / N, v = y / N;
    // soft large folds
    let h = fbm(u * 4, v * 4, seed + 1, 4, 4, 4) * 0.55;
    // ridged creases
    const r1 = 1 - Math.abs(fbm(u * 7, v * 7, seed + 2, 4, 7, 7) * 2 - 1);
    h += Math.pow(r1, 6) * 0.35;
    // crumple lines
    for (const l of lines) {
      let px = u - l.cx, py = v - l.cy; px -= Math.round(px); py -= Math.round(py);
      const t = px * l.dx + py * l.dy;
      if (Math.abs(t) > l.L) continue;
      const n = Math.abs(-px * l.dy + py * l.dx);
      if (n > l.w * 3) continue;
      const fade = 1 - Math.pow(Math.abs(t) / l.L, 2);
      h += l.d * fade * Math.max(0, 1 - n / l.w) * 0.25;
    }
    // fibre grain: fine, slightly stretched
    const g = fbm(u * 120, v * 90, seed + 3, 2, 120, 90);
    h += g * 0.05;
    H[y * N + x] = h;
    // cloudy blotches (thicker = whiter, thinner = slightly greyer/more translucent)
    const b = fbm(u * 22, v * 22, seed + 4, 4, 22, 22);
    const b2 = fbm(u * 60, v * 60, seed + 5, 3, 60, 60);
    C[y * N + x] = 0.9 + (b - 0.5) * 0.12 + (b2 - 0.5) * 0.05;
  }
  const cc = canvas(N), g = cc.getContext('2d'), id = g.createImageData(N, N);
  for (let i = 0; i < N * N; i++) {
    const c = Math.max(0, Math.min(1, C[i]));
    id.data[i * 4] = 236 * c + 12; id.data[i * 4 + 1] = 239 * c + 12; id.data[i * 4 + 2] = 241 * c + 12; id.data[i * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  return { map: canvasTex(cc, true), normal: canvasTex(heightToNormal(H, N, N, 7), false) };
}

export function sleeveMaterial(tex) {
  return new THREE.MeshPhysicalMaterial({
    color: 0xe2e4e6, map: tex.map, normalMap: tex.normal, normalScale: new THREE.Vector2(0.55, 0.55),
    roughness: 0.86, metalness: 0, sheen: 0.55, sheenColor: new THREE.Color(0xffffff), sheenRoughness: 0.55,
    side: THREE.DoubleSide,
  });
}

// ------------------------------------------------------------------ nitrile glove
// The glove's fine detail is procedural, driven by each vertex's rest position and its nearest
// joint: knuckle wrinkles when a finger is straight, deep creases on the palm side when it bends,
// loose stretched folds over the back of the hand, textured fingertips and a fine orange-peel.
export function gloveMaterial(uBend) {
  const m = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#1d48d4'), roughness: 0.42, metalness: 0,
    clearcoat: 0.3, clearcoatRoughness: 0.35,
    sheen: 0.08, sheenColor: new THREE.Color('#5a7cff'), sheenRoughness: 0.5,
    specularIntensity: 0.6,
  });
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uBend = uBend;
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nattribute vec4 aZone; attribute vec3 aRest; varying vec4 vZone; varying vec3 vRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvZone = aZone; vRest = aRest;');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>
        varying vec4 vZone; varying vec3 vRest;
        uniform float uBend[15];
        #define GDK ${(typeof window !== 'undefined' && window.__GDK !== undefined) ? window.__GDK.toFixed(2) : '1.0'}
        float ghash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
        float gnoise(vec3 x) {
          vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
          return mix(mix(mix(ghash(i), ghash(i + vec3(1,0,0)), f.x), mix(ghash(i + vec3(0,1,0)), ghash(i + vec3(1,1,0)), f.x), f.y),
                     mix(mix(ghash(i + vec3(0,0,1)), ghash(i + vec3(1,0,1)), f.x), mix(ghash(i + vec3(0,1,1)), ghash(i + vec3(1,1,1)), f.x), f.y), f.z);
        }
        float gloveH(vec3 r, vec4 z, float fw) {
          float h = 0.0;
          int j = int(z.x + 0.5);
          float ax = z.y, side = z.z, region = z.w;
          float palm = clamp(-side, 0.0, 1.0), back = clamp(side, 0.0, 1.0);
          if (j >= 0) {
            float b = clamp(uBend[j], 0.0, 1.0);
            float lim = j == 14 ? 0.022 : (j >= 12 ? 0.012 : 0.009);
            float fall = exp(-ax * ax / (lim * lim));
            // palm side: creases fold in as the joint bends
            float c1 = exp(-pow((ax - 0.0012) / 0.0011, 2.0)), c2 = exp(-pow((ax + 0.0024) / 0.0012, 2.0));
            h -= palm * (0.15 + b) * fall * 0.00045 * (c1 + 0.65 * c2);
            // back side: loose rings of wrinkles over a straight knuckle, stretched smooth when bent
            float aa = clamp(1.0 - fw * 2400.0 * 0.35, 0.0, 1.0);
            float rings = sin(ax * 2400.0 + gnoise(r * 420.0) * 3.5);
            if (j >= 4) h += back * (1.0 - 0.8 * b) * fall * 0.00007 * rings * aa;
            // fabric bunching between the fingers' bases when they curl
            if (j < 4) h += palm * b * fall * 0.0001 * sin(ax * 1500.0 + r.x * 900.0) * aa;
            // grip texture on the fingertip pads
            if (j >= 8 && j <= 11 && ax > 0.003) h += palm * 0.00003 * (gnoise(r * 4200.0) - 0.5) * clamp(1.0 - fw * 4200.0 * 0.3, 0.0, 1.0);
          }
          // loose, stretched folds over the back of the hand and the palm
          if (region < 0.5) {
            float f1 = abs(gnoise(r * vec3(150.0, 110.0, 55.0)) - 0.5) * 2.0;
            h += 0.00016 * (0.5 - f1) * clamp(1.0 - fw * 150.0 * 0.4, 0.0, 1.0);
          }
          // fine orange peel everywhere
          h += 0.000012 * (gnoise(r * 2600.0) - 0.5) * clamp(1.0 - fw * 2600.0 * 0.3, 0.0, 1.0);
          return h;
        }`)
      .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
        {
          float fw = length(fwidth(vRest));
          float Hh = gloveH(vRest, vZone, fw) * GDK;
          vec3 sx = dFdx(-vViewPosition), sy = dFdy(-vViewPosition);
          vec3 R1 = cross(sy, normal), R2 = cross(normal, sx);
          float det = dot(sx, R1) * faceDirection;
          vec3 grad = sign(det) * (dFdx(Hh) * R1 + dFdy(Hh) * R2);
          normal = normalize(abs(det) * normal - grad);
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        {
          int j = int(vZone.x + 0.5);
          if (j >= 8 && j <= 11 && vZone.y > 0.003 && vZone.z < 0.0) roughnessFactor = min(1.0, roughnessFactor + 0.18);
          roughnessFactor = clamp(roughnessFactor + (gnoise(vRest * 300.0) - 0.5) * 0.08, 0.0, 1.0);
        }`);
  };
  m.customProgramCacheKey = () => 'nitrile-glove';
  return m;
}

// ------------------------------------------------------------------ flashlight
export function knurlTextures() {
  const W = 512, Hh = 1024, H = new Float32Array(W * Hh);
  for (let y = 0; y < Hh; y++) for (let x = 0; x < W; x++) {
    const u = x / W, v = y / Hh;
    // diamond knurl: two crossing sets of V-grooves
    const k = 40;
    const a = Math.abs(fract(u * k + v * k * 2) - 0.5) * 2, b = Math.abs(fract(u * k - v * k * 2) - 0.5) * 2;
    const kn = Math.min(a, b);
    H[y * W + x] = Math.pow(kn, 0.8) + hash2(x, y, 3) * 0.03;
  }
  const n = canvasTex(heightToNormal(H, W, Hh, 4), false);
  return { normal: n };
}
// black anodised aluminium: faint brushed grain
export function anodisedMaterial({ knurl = null } = {}) {
  const W = 256, H = new Float32Array(W * W);
  for (let y = 0; y < W; y++) for (let x = 0; x < W; x++) H[y * W + x] = vnoise(x / W * 3, y / W * 180, 9, 3, 180) * 0.6 + hash2(x, y, 4) * 0.08;
  const brushed = canvasTex(heightToNormal(H, W, W, 1.2), false);
  return new THREE.MeshPhysicalMaterial({
    color: new THREE.Color('#17191c'), metalness: 0.6, roughness: knurl ? 0.48 : 0.3,
    clearcoat: 0.25, clearcoatRoughness: 0.4,
    normalMap: knurl || brushed, normalScale: knurl ? new THREE.Vector2(1.1, 1.1) : new THREE.Vector2(0.35, 0.35),
  });
}

// the aerosol can's label: generic insecticide, no brand
export function canLabelTexture() {
  const W = 1024, Hh = 512, c = canvas(W, Hh), g = c.getContext('2d');
  const grd = g.createLinearGradient(0, 0, 0, Hh);
  grd.addColorStop(0, '#f2c52f'); grd.addColorStop(1, '#dcaa1f');
  g.fillStyle = grd; g.fillRect(0, 0, W, Hh);
  g.fillStyle = '#161616'; g.fillRect(0, 0, W, 70); g.fillRect(0, Hh - 48, W, 48);
  g.save(); g.beginPath(); g.rect(0, Hh - 48, W, 48); g.clip();
  g.fillStyle = '#f2c52f';
  for (let x = -60; x < W + 60; x += 46) { g.beginPath(); g.moveTo(x, Hh); g.lineTo(x + 22, Hh); g.lineTo(x + 52, Hh - 48); g.lineTo(x + 30, Hh - 48); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = '#f4f1e8'; g.font = '700 46px "Noto Sans KR", sans-serif'; g.textBaseline = 'middle';
  g.fillText('KX 방역용', 40, 36);
  g.fillStyle = '#161616'; g.font = '900 120px "Noto Sans KR", sans-serif';
  g.fillText('살충제', 40, 190);
  g.font = '700 34px "Noto Sans KR", sans-serif';
  g.fillText('강력 분사형 · 대형 해충용', 44, 290);
  g.font = '500 24px "Noto Sans KR", sans-serif';
  g.fillText('사람에게 직접 분사하지 마십시오. 환기가 잘 되는 곳에서 사용.', 44, 346);
  g.fillText('경고: 인화성 · 고압가스 · 40°C 이상 보관 금지', 44, 380);
  // a crossed-out bug pictogram
  g.save(); g.translate(820, 230); g.strokeStyle = '#161616'; g.lineWidth = 14; g.fillStyle = '#161616';
  g.beginPath(); g.ellipse(0, 0, 46, 74, 0, 0, Math.PI * 2); g.fill();
  g.beginPath(); g.arc(0, -86, 26, 0, Math.PI * 2); g.fill();
  g.lineWidth = 8;
  for (const sgn of [-1, 1]) for (const k of [-1, 0, 1]) { g.beginPath(); g.moveTo(sgn * 40, k * 34); g.lineTo(sgn * 92, k * 34 + k * 22 - 12); g.stroke(); }
  g.strokeStyle = '#c0261c'; g.lineWidth = 20; g.beginPath(); g.arc(0, -10, 128, 0, Math.PI * 2); g.stroke();
  g.beginPath(); g.moveTo(-90, -100); g.lineTo(90, 80); g.stroke();
  g.restore();
  // scuffs
  for (let i = 0; i < 400; i++) { g.fillStyle = `rgba(40,30,10,${Math.random() * 0.08})`; g.fillRect(Math.random() * W, Math.random() * Hh, 2 + Math.random() * 18, 1 + Math.random() * 2); }
  const t = canvasTex(c, true, false);
  t.wrapS = THREE.RepeatWrapping;
  return t;
}
