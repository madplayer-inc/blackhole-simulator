import * as THREE from 'three';
import { BLACKBODY_GLSL, LENS_GLSL, shared } from './shared';
import type { BlackHoleSim } from '../physics/sim';

// Debris / accretion-disk particles.
// Colour: planet material colour → thermal emission as the gas heats up.
// Disk temperature profile: Shakura–Sunyaev / Novikov–Thorne-like
//   T ∝ r^{-3/4} (1 − √(r_in / r))^{1/4}
// Observed temperature is shifted by the Doppler factor δ = 1/(γ(1 − β·n)) and by
// gravitational redshift g = √(1 − 2M/r); bolometric brightness ∝ (δg)⁴ (relativistic beaming).

const vert = /* glsl */ `
${LENS_GLSL}
${BLACKBODY_GLSL}
uniform float uRin;
uniform float uDoppler;
uniform float uPixelRatio;
uniform float uSize;
uniform float uTemp;
attribute vec3 aVel;
attribute vec3 aColor;
attribute float aHeat;
varying vec3 vColor;
varying float vAlpha;

void main() {
  vec3 P = position;
  float r = max(length(P), 1e-3);
  float x = clamp(uRin / r, 0.0, 1.0);
  float ss = pow(x, 0.75) * pow(max(1.0 - sqrt(x), 0.0), 0.25) / 0.488;

  vec3 n = normalize(uCamPos - P);
  float v2 = min(dot(aVel, aVel), 0.98);
  float gamma = inversesqrt(1.0 - v2);
  float delta = 1.0 / (gamma * (1.0 - clamp(dot(aVel, n), -0.99, 0.99)));
  float g = sqrt(max(1.0 - 2.0 * uM / r, 0.02));
  float shift = mix(1.0, delta * g, uDoppler);

  float T = (0.25 + 0.95 * ss) * uTemp * shift;
  vec3 hot = blackbody(T) * (0.35 + 1.4 * ss) * pow(shift, 3.0);
  vec3 cold = aColor * (0.55 + 0.45 * pow(shift, 2.0));
  vColor = mix(cold, hot, aHeat);

  float mag, vis;
  vec3 lensed = lensWorld(P, mag, vis);
  float m = min(mag, 5.0);
  vAlpha = vis * m;
  vec4 mv = viewMatrix * vec4(lensed, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(uSize * uPixelRatio * 140.0 / -mv.z * (0.7 + 0.3 * sqrt(m)), 1.0, 9.0 * uPixelRatio);
}
`;

const frag = /* glsl */ `
varying vec3 vColor;
varying float vAlpha;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25) discard;
  float a = vAlpha * exp(-d * 10.0) * 0.85;
  gl_FragColor = vec4(vColor * a, 1.0);
}
`;

export class DebrisRenderer {
  readonly group = new THREE.Group();
  private readonly geometry = new THREE.BufferGeometry();
  private readonly attrs: THREE.BufferAttribute[];
  readonly primaryMat: THREE.ShaderMaterial;
  readonly secondaryMat: THREE.ShaderMaterial;
  readonly secondary: THREE.Points;

  constructor(sim: BlackHoleSim) {
    const pos = new THREE.BufferAttribute(sim.pos, 3).setUsage(THREE.DynamicDrawUsage);
    const vel = new THREE.BufferAttribute(sim.vel, 3).setUsage(THREE.DynamicDrawUsage);
    const col = new THREE.BufferAttribute(sim.col, 3).setUsage(THREE.DynamicDrawUsage);
    const heat = new THREE.BufferAttribute(sim.heat, 1).setUsage(THREE.DynamicDrawUsage);
    this.geometry.setAttribute('position', pos);
    this.geometry.setAttribute('aVel', vel);
    this.geometry.setAttribute('aColor', col);
    this.geometry.setAttribute('aHeat', heat);
    this.geometry.setDrawRange(0, 0);
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5);
    this.attrs = [pos, vel, col, heat];

    const mk = (img: number) =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { ...shared, uImage: { value: img }, uSize: { value: 1 }, uTemp: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
    this.primaryMat = mk(1);
    this.secondaryMat = mk(-1);
    // share size/temp uniforms between both images
    this.secondaryMat.uniforms.uSize = this.primaryMat.uniforms.uSize;
    this.secondaryMat.uniforms.uTemp = this.primaryMat.uniforms.uTemp;
    const primary = new THREE.Points(this.geometry, this.primaryMat);
    this.secondary = new THREE.Points(this.geometry, this.secondaryMat);
    primary.frustumCulled = this.secondary.frustumCulled = false;
    this.group.add(primary, this.secondary);
  }

  update(sim: BlackHoleSim, size: number, temp: number) {
    const n = sim.count;
    this.geometry.setDrawRange(0, n);
    for (const a of this.attrs) {
      a.clearUpdateRanges();
      a.addUpdateRange(0, n * a.itemSize);
      a.needsUpdate = true;
    }
    this.primaryMat.uniforms.uSize.value = size;
    this.primaryMat.uniforms.uTemp.value = temp;
  }
}
