import * as THREE from 'three';
import { LAPSE_GLSL, LENS_GLSL, shared } from './shared';
import { RIVER_GLSL, river } from './river';

// ───────────────────────────── river tracers
// Free-falling "space" markers on exact Kerr zero-angular-momentum geodesics (render/river.ts).
// Each tracer restarts at its origin after crossing the horizon.

const tracerVert = /* glsl */ `
${LENS_GLSL}
${LAPSE_GLSL}
${RIVER_GLSL}
uniform float uPixelRatio;
attribute vec3 aDir;
attribute float aR0;
attribute float aPhase;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float r0, c, ph0;
  toOblate(aDir * aR0 / uM, r0, c, ph0);
  float c2 = c * c;
  float F0 = max(riverF(r0, c2), 1e-3);
  float tau = mod(uClock + aPhase * F0, F0);
  float r = riverInvF(F0 - tau, c2);
  float ph = ph0 + uTwist * (riverG(r) - riverG(r0));
  vec3 world = fromOblate(r, c, ph) * uM;
  vColor = lapseColor(staticRedshift(r, c2)) * 1.2;
  vAlpha = smoothstep(0.0, 0.08, tau / F0) * smoothstep(uRHn, uRHn * 1.4, r);
  float mag, vis;
  vec3 lensed = lensWorld(world, mag, vis);
  vAlpha *= vis;
  vec4 mv = viewMatrix * vec4(lensed, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(1.2 * uPixelRatio * 90.0 / -mv.z, 1.0, 3.0 * uPixelRatio);
}
`;

const tracerFrag = /* glsl */ `
uniform float uOpacity;
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = vAlpha * uOpacity * (1.0 - d * 4.0);
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

export class RiverTracers {
  readonly object: THREE.Points;
  readonly material: THREE.ShaderMaterial;
  constructor() {
    this.material = new THREE.ShaderMaterial({
      vertexShader: tracerVert,
      fragmentShader: tracerFrag,
      uniforms: { ...shared, ...river, uImage: { value: 1 }, uOpacity: { value: 0.45 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.object = new THREE.Points(new THREE.BufferGeometry(), this.material);
    this.object.frustumCulled = false;
  }

  rebuild(count: number, rMax: number) {
    const dir = new Float32Array(count * 3);
    const r0 = new Float32Array(count);
    const ph = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const z = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      dir[i * 3] = s * Math.cos(t);
      dir[i * 3 + 1] = z;
      dir[i * 3 + 2] = s * Math.sin(t);
      r0[i] = rMax * (0.35 + 0.65 * Math.random());
      ph[i] = Math.random();
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    g.setAttribute('aDir', new THREE.BufferAttribute(dir, 3));
    g.setAttribute('aR0', new THREE.BufferAttribute(r0, 1));
    g.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1));
    this.object.geometry.dispose();
    this.object.geometry = g;
  }
}

// ───────────────────────────── background stars (lensed, both images)

const starVert = /* glsl */ `
${LENS_GLSL}
uniform float uPixelRatio;
attribute float aSize;
attribute vec3 aColor;
varying vec3 vColor;
varying float vAlpha;
void main() {
  float mag, vis;
  vec3 lensed = lensWorld(position, mag, vis);
  float m = min(mag, 8.0);
  vColor = aColor;
  vAlpha = vis * min(m, 3.0);
  vec4 mv = viewMatrix * vec4(lensed, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = aSize * uPixelRatio * clamp(sqrt(m), 0.4, 2.5);
}
`;
const starFrag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = vAlpha * exp(-d * 14.0);
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

export class StarField {
  readonly group = new THREE.Group();
  readonly primary: THREE.Points;
  readonly secondary: THREE.Points;
  constructor(count = 9000, radius = 8000) {
    const pos = new Float32Array(count * 3);
    const size = new Float32Array(count);
    const col = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      const z = Math.random() * 2 - 1;
      const t = Math.random() * Math.PI * 2;
      const s = Math.sqrt(1 - z * z);
      // concentrate some stars in a band (galactic plane look)
      const band = Math.random() < 0.45;
      const zz = band ? (Math.random() - 0.5) * 0.25 : z;
      const ss = Math.sqrt(1 - zz * zz);
      pos[i * 3] = radius * (band ? ss : s) * Math.cos(t);
      pos[i * 3 + 1] = radius * (band ? zz * 0.6 + 0.3 * ss * Math.sin(t) : z);
      pos[i * 3 + 2] = radius * (band ? ss : s) * Math.sin(t);
      const b = Math.pow(Math.random(), 6);
      size[i] = 1.2 + b * 4.5;
      const temp = Math.random();
      const c = temp < 0.2 ? [1.0, 0.75, 0.55] : temp < 0.75 ? [1.0, 0.95, 0.9] : [0.7, 0.8, 1.0];
      const lum = 0.35 + b * 1.4;
      col.set([c[0] * lum, c[1] * lum, c[2] * lum], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aColor', new THREE.BufferAttribute(col, 3));
    const mk = (img: number) =>
      new THREE.ShaderMaterial({
        vertexShader: starVert,
        fragmentShader: starFrag,
        uniforms: { ...shared, uImage: { value: img } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    this.primary = new THREE.Points(g, mk(1));
    this.secondary = new THREE.Points(g, mk(-1));
    this.primary.frustumCulled = this.secondary.frustumCulled = false;
    this.primary.renderOrder = this.secondary.renderOrder = -10;
    this.group.add(this.primary, this.secondary);
  }
}
