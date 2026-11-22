import * as THREE from 'three';
import { buildRiverTable, type RiverTable } from '../physics/river';

// GPU side of the Kerr river (see physics/river.ts). The table texture holds I1, I0, G
// sampled at r = r+ + (rMax − r+)(i/(N−1))², read with texelFetch + manual interpolation.
// All lengths in these functions are in units of M; callers divide world positions by uM.

export const river = {
  uRiverTex: { value: null as THREE.DataTexture | null },
  uRiverN: { value: 2048 },
  uRiverRmax: { value: 600 },
  uSpin: { value: 0.6 },
  uRHn: { value: 1.8 },
  uTwist: { value: 1 },
  /** flow clock in GM/c³ (world units), reduced on the CPU where possible */
  uClock: { value: 0 },
};

let table: RiverTable | null = null;
let tableKey = '';

export function updateRiverTable(spin: number): RiverTable {
  const key = spin.toFixed(4);
  if (table && key === tableKey) return table;
  table = buildRiverTable(spin);
  tableKey = key;
  const tex = new THREE.DataTexture(table.data, table.n, 1, THREE.RGBAFormat, THREE.FloatType);
  tex.minFilter = tex.magFilter = THREE.NearestFilter;
  tex.needsUpdate = true;
  river.uRiverTex.value?.dispose();
  river.uRiverTex.value = tex;
  river.uRiverN.value = table.n;
  river.uRiverRmax.value = table.rMax;
  river.uSpin.value = table.a;
  river.uRHn.value = table.rH;
  return table;
}

export const RIVER_GLSL = /* glsl */ `
uniform sampler2D uRiverTex;
uniform float uRiverN;
uniform float uRiverRmax;
uniform float uSpin;
uniform float uRHn;
uniform float uTwist;
uniform float uClock;

vec3 riverFetch(float r) {
  float x = clamp((r - uRHn) / (uRiverRmax - uRHn), 0.0, 1.0);
  float f = sqrt(x) * (uRiverN - 1.0);
  float i0 = floor(f);
  float i1 = min(i0 + 1.0, uRiverN - 1.0);
  vec3 a = texelFetch(uRiverTex, ivec2(int(i0), 0), 0).xyz;
  vec3 b = texelFetch(uRiverTex, ivec2(int(i1), 0), 0).xyz;
  return mix(a, b, f - i0);
}
// remaining proper fall time to the horizon
float riverF(float r, float c2) {
  vec3 t = riverFetch(r);
  return t.x + uSpin * uSpin * c2 * t.y;
}
float riverInvF(float F, float c2) {
  float a2 = uSpin * uSpin;
  float Fs = (2.0 / 3.0) * pow(uRHn, 1.5) / sqrt(2.0);
  float r = max(pow(1.5 * sqrt(2.0) * (max(F, 0.0) + Fs), 2.0 / 3.0), uRHn);
  for (int i = 0; i < 4; i++) {
    float g = riverF(r, c2) - F;
    float d = (r * r + a2 * c2) / sqrt(2.0 * r * (r * r + a2));
    r = max(r - g / d, uRHn);
  }
  return r;
}
// prograde twist accumulated between r and infinity (Kerr–Schild azimuth)
float riverG(float r) { return riverFetch(r).z; }

// Kerr–Schild Cartesian <-> oblate spheroidal (r, cosθ, φ); spin axis +Y, prograde φ: (cos, ·, −sin)
void toOblate(vec3 p, out float r, out float c, out float phi) {
  float a2 = uSpin * uSpin;
  float b = dot(p, p) - a2;
  float r2 = 0.5 * (b + sqrt(b * b + 4.0 * a2 * p.y * p.y));
  r = sqrt(max(r2, 1e-8));
  c = clamp(p.y / r, -1.0, 1.0);
  phi = atan(-p.z, p.x);
}
vec3 fromOblate(float r, float c, float phi) {
  float s = sqrt(max(1.0 - c * c, 0.0));
  float rho = sqrt(r * r + uSpin * uSpin) * s;
  return vec3(rho * cos(phi), r * c, -rho * sin(phi));
}
// time dilation of a static observer, sqrt(1 − 2r/ρ²); reaches 0 on the ergosurface
float staticRedshift(float r, float c2) {
  return sqrt(max(1.0 - 2.0 * r / (r * r + uSpin * uSpin * c2), 0.0));
}
`;
