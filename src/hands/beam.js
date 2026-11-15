// The flashlight's look, shared by the hands viewer and the game: the beam's pattern on what it
// hits (a hot centre, a faint reflector ring and a soft spill), the shaft of light through dusty
// air, and how much the beam is turned down when it lands on something close.
import * as THREE from 'three';

const V3 = THREE.Vector3;

export function beamPattern() {
  const N = 256, c = document.createElement('canvas'); c.width = c.height = N;
  const g = c.getContext('2d'), id = g.createImageData(N, N);
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) {
    const r = Math.hypot(x - N / 2 + 0.5, y - N / 2 + 0.5) / (N / 2);
    // hot centre, a faint ring from the reflector's edge, soft spill
    let v = Math.exp(-r * r / 0.06) * 1.0 + Math.exp(-Math.pow((r - 0.5) / 0.12, 2)) * 0.05 + Math.exp(-r * r / 0.3) * 0.38;
    v *= 1 - Math.pow(Math.min(1, r), 6);
    const k = Math.min(255, v * 230);
    id.data[(y * N + x) * 4] = k; id.data[(y * N + x) * 4 + 1] = k * 0.97; id.data[(y * N + x) * 4 + 2] = k * 0.92; id.data[(y * N + x) * 4 + 3] = 255;
  }
  g.putImageData(id, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
export function makeCone() {
  const L = 7, g = new THREE.CylinderGeometry(0.02, L * Math.tan(0.36), L, 48, 24, true);
  g.translate(0, -L / 2, 0); g.rotateX(-Math.PI / 2);
  const m = new THREE.ShaderMaterial({
    uniforms: { uK: { value: 0.7 }, uLen: { value: L } },
    vertexShader: `varying vec3 vN; varying vec3 vV; varying float vZ; varying float vAl;
      void main(){ vec4 mv = modelViewMatrix * vec4(position, 1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vZ = position.z;
        vec3 ax = normalize((modelViewMatrix * vec4(0.0, 0.0, 1.0, 0.0)).xyz); vAl = abs(dot(ax, vec3(0.0, 0.0, -1.0)));
        gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `uniform float uK, uLen; varying vec3 vN; varying vec3 vV; varying float vZ; varying float vAl;
      void main(){ float e = abs(dot(normalize(vN), normalize(vV))); float d = vZ / uLen;
        // seen end-on (shining away from you) a shaft of light is barely visible
        float a = pow(e, 2.2) * exp(-d * 2.6) * smoothstep(0.0, 0.12, d) * 0.055 * uK * (1.0 - smoothstep(0.75, 0.97, vAl) * 0.85);
        gl_FragColor = vec4(vec3(1.0, 0.96, 0.9) * a, 1.0); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
  });
  return new THREE.Mesh(g, m);
}

// beam strength for a surface at distance d: full beyond ~2.8 m; closer in, the light on it is held
// level (as an eye adjusting would), instead of growing with the inverse square into a white blot
export function beamNear(d) { return Math.min(1, Math.max(0.1, (d / 2.8) * (d / 2.8))); }
