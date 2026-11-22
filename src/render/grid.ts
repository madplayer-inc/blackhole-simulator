import * as THREE from 'three';
import { LAPSE_GLSL, LENS_GLSL, shared } from './shared';
import { RIVER_GLSL, river } from './river';

// Flowing spacetime lattice — the Kerr "river": space falls inward along the paths of
// zero-angular-momentum free fallers (exact Kerr geodesics, see physics/river.ts) and is
// twisted prograde by frame dragging.
//
// Two structures:
//  • sphere: concentric shells of equal remaining fall time move inward like a conveyor and are
//    re-emitted at the outer edge (seamless); radial "spokes" are the flow lines themselves.
//  • cartesian / equator: a uniform grid of fallers released at once; two copies released half a
//    period apart cross-fade (weights sin² + cos² = 1), so the lattice keeps falling in.
// Colour = time dilation of a static observer, √(1 − 2Mr/ρ²) (zero on the ergosurface).
// Bright pulses ride with the flow (phase = remaining fall time + clock).

const vert = /* glsl */ `
${LENS_GLSL}
${RIVER_GLSL}
uniform float uMode;        // 0 = cartesian release, 1 = sphere conveyor
uniform float uAge;         // cartesian: age of this copy [M]
uniform float uFmax;        // sphere: fall time of the outermost shell [M]
uniform float uShellN;
uniform float uShellPhase;  // clock mod Fmax [M]
uniform float uPulsePeriod;
uniform float uPulsePhase;  // clock mod pulse period [M]
uniform float uExtentN;     // lattice extent / M
attribute vec4 aSph;        // sphere: (cosθ, φ0, shell index or −1, spoke parameter)
varying float vAlpha;
varying float vLapse;
varying float vPhase;

void main() {
  float r, c, ph, F;
  float alpha = 1.0;
  float emph = 1.0;
  if (uMode < 0.5) {
    vec3 p = position / uM;
    float r0, ph0;
    toOblate(p, r0, c, ph0);
    float c2 = c * c;
    F = riverF(r0, c2) - uAge;
    alpha = step(uRHn * 1.001, r0) * step(0.0, F);
    r = riverInvF(F, c2);
    ph = ph0 + uTwist * (riverG(r) - riverG(r0));
    float d0 = length(p);
    alpha *= 1.0 - smoothstep(uExtentN * 0.6, uExtentN * 1.05, d0);
    alpha *= mix(1.0, 0.3, smoothstep(uExtentN * 0.12, uExtentN * 0.9, d0));
    if (abs(position.y) < 1e-3) emph = 2.2;
  } else {
    c = aSph.x;
    float c2 = c * c;
    if (aSph.z >= 0.0) {
      F = mod(aSph.z * uFmax / uShellN - uShellPhase, uFmax);
      r = riverInvF(F, c2);
      alpha = 1.0 - smoothstep(0.82 * uFmax, uFmax, F);
      if (abs(c) < 1e-3) emph = 2.0;
    } else {
      r = uRHn + (uExtentN - uRHn) * aSph.w * aSph.w;
      F = riverF(r, c2);
      alpha = 0.55 * (1.0 - smoothstep(0.82 * uFmax, uFmax, F));
    }
    ph = aSph.y + uTwist * riverG(r);
    alpha *= mix(1.0, 0.25, smoothstep(uExtentN * 0.15, uExtentN * 0.9, r));
  }
  float c2 = c * c;
  vLapse = staticRedshift(r, c2);
  vPhase = (F + uPulsePhase) / uPulsePeriod;
  vAlpha = alpha * emph * smoothstep(uRHn * 1.02, uRHn * 1.6, r);

  vec3 world = fromOblate(r, c, ph) * uM;
  float mag, vis;
  vec3 lensed = lensWorld(world, mag, vis);
  vAlpha *= vis;
  gl_Position = projectionMatrix * viewMatrix * vec4(lensed, 1.0);
}
`;

const frag = /* glsl */ `
${LAPSE_GLSL}
uniform float uOpacity;
uniform float uPulses;
uniform float uCopyAlpha;
varying float vAlpha;
varying float vLapse;
varying float vPhase;
void main() {
  float f = fract(vPhase);
  float pulse = uPulses * (exp(-f * 14.0) * 2.2);
  vec3 col = lapseColor(vLapse);
  float a = uOpacity * uCopyAlpha * vAlpha * (0.55 + pulse);
  if (a < 0.003) discard;
  gl_FragColor = vec4(col * a, 1.0);
}
`;

export type GridMode = 'sphere' | '3d' | 'equator';

export class SpacetimeGrid {
  readonly group = new THREE.Group();
  /** uniforms common to both copies */
  readonly common = {
    uMode: { value: 1 },
    uFmax: { value: 200 },
    uShellN: { value: 12 },
    uShellPhase: { value: 0 },
    uPulsePeriod: { value: 25 },
    uPulsePhase: { value: 0 },
    uExtentN: { value: 60 },
    uOpacity: { value: 0.3 },
    uPulses: { value: 1 },
  };
  private copies: Array<{ line: THREE.LineSegments; mat: THREE.ShaderMaterial }> = [];
  mode: GridMode = 'sphere';

  constructor() {
    for (let k = 0; k < 2; k++) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { ...shared, ...river, ...this.common, uImage: { value: 1 }, uAge: { value: 0 }, uCopyAlpha: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const line = new THREE.LineSegments(new THREE.BufferGeometry(), mat);
      line.frustumCulled = false;
      this.copies.push({ line, mat });
      this.group.add(line);
    }
  }

  rebuild(mode: GridMode, divisions: number, extent: number, shells: number) {
    this.mode = mode;
    const g = mode === 'sphere' ? sphereGeometry(shells) : cartesianGeometry(divisions, extent, mode);
    for (const c of this.copies) c.line.geometry.dispose();
    this.copies[0].line.geometry = g;
    this.copies[1].line.geometry = g;
    this.common.uMode.value = mode === 'sphere' ? 1 : 0;
    this.common.uShellN.value = shells;
    this.copies[1].line.visible = mode !== 'sphere';
  }

  /**
   * clockN: flow clock in units of M; fmax: fall time from the lattice edge (equator) in M;
   * release: cartesian re-release period in M.
   */
  update(clockN: number, fmax: number, release: number, extentN: number, pulsePeriod: number) {
    const u = this.common;
    u.uFmax.value = fmax;
    u.uShellPhase.value = ((clockN % fmax) + fmax) % fmax;
    u.uPulsePeriod.value = pulsePeriod;
    u.uPulsePhase.value = clockN % pulsePeriod;
    u.uExtentN.value = extentN;
    if (this.mode === 'sphere') {
      this.copies[0].mat.uniforms.uAge.value = 0;
      this.copies[0].mat.uniforms.uCopyAlpha.value = 1;
    } else {
      for (let k = 0; k < 2; k++) {
        const age = (clockN + (k * release) / 2) % release;
        this.copies[k].mat.uniforms.uAge.value = age;
        this.copies[k].mat.uniforms.uCopyAlpha.value = Math.sin((Math.PI * age) / release) ** 2;
      }
    }
  }
}

function cartesianGeometry(divisions: number, extent: number, mode: GridMode): THREE.BufferGeometry {
  const n = Math.max(2, Math.round(divisions / 2) * 2); // even → a plane through the origin
  const seg = 160;
  const coords: number[] = [];
  for (let i = 0; i <= n; i++) coords.push(-extent + (2 * extent * i) / n);
  const pts: number[] = [];
  const line = (a: (t: number) => [number, number, number]) => {
    for (let s = 0; s < seg; s++) pts.push(...a(-extent + (2 * extent * s) / seg), ...a(-extent + (2 * extent * (s + 1)) / seg));
  };
  const ys = mode === '3d' ? coords : [0];
  for (const y of ys) {
    for (const z of coords) line((t) => [t, y, z]);
    for (const x of coords) line((t) => [x, y, t]);
  }
  if (mode === '3d') for (const x of coords) for (const z of coords) line((t) => [x, t, z]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return g;
}

function sphereGeometry(shells: number): THREE.BufferGeometry {
  const sph: number[] = [];
  const push = (c: number, ph: number, shell: number, s: number) => sph.push(c, ph, shell, s);
  const lats = [30, 60, 90, 120, 150].map((d) => (d * Math.PI) / 180);
  const nLon = 12;
  const segAround = 96;
  const segMer = 48;
  for (let k = 0; k < shells; k++) {
    for (const th of lats) {
      const c = Math.abs(th - Math.PI / 2) < 1e-6 ? 0 : Math.cos(th);
      for (let i = 0; i < segAround; i++) {
        push(c, (i / segAround) * 2 * Math.PI, k, 0);
        push(c, ((i + 1) / segAround) * 2 * Math.PI, k, 0);
      }
    }
    for (let j = 0; j < nLon; j++) {
      const ph = (j / nLon) * 2 * Math.PI;
      for (let i = 0; i < segMer; i++) {
        push(Math.cos((i / segMer) * Math.PI), ph, k, 0);
        push(Math.cos(((i + 1) / segMer) * Math.PI), ph, k, 0);
      }
    }
  }
  // spokes: the flow lines (fixed θ, twisted by frame dragging)
  // no spokes exactly on the spin axis: seen from near the pole they collapse into one bright stripe
  const spokeLats = lats;
  const segR = 96;
  for (const th of spokeLats) {
    const c = Math.abs(th - Math.PI / 2) < 1e-6 ? 0 : Math.cos(th);
    const lons = th === 0 || th === Math.PI ? 1 : nLon;
    for (let j = 0; j < lons; j++) {
      const ph = (j / nLon) * 2 * Math.PI;
      for (let i = 0; i < segR; i++) {
        push(c, ph, -1, i / segR);
        push(c, ph, -1, (i + 1) / segR);
      }
    }
  }
  const count = sph.length / 4;
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(new Float32Array(count * 3), 3));
  g.setAttribute('aSph', new THREE.Float32BufferAttribute(sph, 4));
  return g;
}
