import * as THREE from 'three';
import { LENS_GLSL, shared } from './shared';
import type { BlackHoleSim, Planet } from '../physics/sim';

// Planets: procedural surface, lit by the hot inner disk at the origin,
// stretched along the radial direction by the tidal field (spaghettification),
// and lensed per vertex (both images).

const vert = /* glsl */ `
${LENS_GLSL}
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vVis;
varying float vMag;
void main() {
  vObj = position;
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vNormalW = normalize(mat3(modelMatrix) * normal);
  float mag, vis;
  vec3 lensed = lensWorld(w.xyz, mag, vis);
  vVis = vis;
  vMag = mag;
  gl_Position = projectionMatrix * viewMatrix * vec4(lensed, 1.0);
}
`;

const frag = /* glsl */ `
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform float uSeed;
uniform float uBands;
uniform float uHeat;
uniform float uImage;
uniform float uLight;
varying vec3 vObj;
varying vec3 vNormalW;
varying vec3 vWorld;
varying float vVis;
varying float vMag;

float hash(vec3 p) { return fract(sin(dot(p, vec3(127.1, 311.7, 74.7)) + uSeed) * 43758.5453); }
float noise(vec3 p) {
  vec3 i = floor(p); vec3 f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash(i), hash(i + vec3(1,0,0)), f.x), mix(hash(i + vec3(0,1,0)), hash(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i + vec3(0,0,1)), hash(i + vec3(1,0,1)), f.x), mix(hash(i + vec3(0,1,1)), hash(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm(vec3 p) { float s = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { s += a * noise(p); p *= 2.03; a *= 0.5; } return s; }

void main() {
  if (uImage < 0.0 && vVis < 0.5) discard;
  vec3 p = normalize(vObj);
  float n = fbm(p * 3.0);
  float t = uBands > 0.5 ? 0.5 + 0.5 * sin(p.y * 14.0 + n * 4.0) : smoothstep(0.35, 0.65, n);
  vec3 base = mix(uColor1, uColor2, t);
  vec3 L = normalize(-vWorld);
  float diff = max(dot(normalize(vNormalW), L), 0.0);
  vec3 col = base * (0.08 + uLight * diff);
  // tidal heating: glowing cracks / hot limb
  col += uHeat * vec3(1.0, 0.35, 0.08) * (0.4 + smoothstep(0.55, 0.75, n)) * 1.4;
  float a = uImage < 0.0 ? clamp(vMag, 0.0, 1.0) * vVis : 1.0;
  gl_FragColor = vec4(col * a, 1.0);
}
`;

interface PlanetView {
  primary: THREE.Mesh;
  secondary: THREE.Mesh;
  uniforms: Record<string, THREE.IUniform>;
}

export class PlanetRenderer {
  readonly group = new THREE.Group();
  private views = new Map<number, PlanetView>();
  private geometry = new THREE.SphereGeometry(1, 48, 32);
  private q = new THREE.Quaternion();
  private xAxis = new THREE.Vector3(1, 0, 0);
  private tmp = new THREE.Vector3();

  private create(p: Planet): PlanetView {
    const own = {
      uColor1: { value: new THREE.Color(...p.color) },
      uColor2: { value: new THREE.Color(...p.color2) },
      uSeed: { value: Math.random() * 100 },
      uBands: { value: p.kind === 'gas' ? 1 : 0 },
      uHeat: { value: 0 },
      uLight: { value: 1 },
    };
    const mk = (img: number) =>
      new THREE.ShaderMaterial({
        vertexShader: vert,
        fragmentShader: frag,
        uniforms: { ...shared, ...own, uImage: { value: img } },
        blending: img < 0 ? THREE.AdditiveBlending : THREE.NormalBlending,
        transparent: img < 0,
        depthWrite: img > 0,
      });
    const primary = new THREE.Mesh(this.geometry, mk(1));
    const secondary = new THREE.Mesh(this.geometry, mk(-1));
    primary.frustumCulled = secondary.frustumCulled = false;
    this.group.add(primary, secondary);
    return { primary, secondary, uniforms: own };
  }

  update(sim: BlackHoleSim, secondaryOn: boolean, diskLight: number) {
    const alive = new Set<number>();
    for (const p of sim.planets) {
      alive.add(p.id);
      let v = this.views.get(p.id);
      if (!v) {
        v = this.create(p);
        this.views.set(p.id, v);
      }
      const R = p.R0 * Math.cbrt(p.frac);
      const s = p.stretch;
      this.tmp.set(...p.pos).normalize();
      this.q.setFromUnitVectors(this.xAxis, this.tmp);
      for (const m of [v.primary, v.secondary]) {
        m.position.set(...p.pos);
        m.quaternion.copy(this.q);
        m.scale.set(R * s, R / Math.sqrt(s), R / Math.sqrt(s));
      }
      v.secondary.visible = secondaryOn;
      v.uniforms.uHeat.value = Math.max(0, Math.min(1, (p.chi - 0.35) * 1.6));
      v.uniforms.uLight.value = 0.25 + diskLight;
    }
    for (const [id, v] of this.views) {
      if (alive.has(id)) continue;
      this.group.remove(v.primary, v.secondary);
      (v.primary.material as THREE.Material).dispose();
      (v.secondary.material as THREE.Material).dispose();
      this.views.delete(id);
    }
  }

  clear() {
    for (const [, v] of this.views) {
      this.group.remove(v.primary, v.secondary);
      (v.primary.material as THREE.Material).dispose();
      (v.secondary.material as THREE.Material).dispose();
    }
    this.views.clear();
  }
}
