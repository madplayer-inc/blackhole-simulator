import * as THREE from 'three';

// Uniforms shared by every lensed material. Spread `shared` into a material's uniforms:
// the {value} objects are shared, so updating them once per frame updates all materials.
export const shared = {
  uCamPos: { value: new THREE.Vector3() },
  uM: { value: 1 },
  uLens: { value: 1 },
  /** shadow outline radius (units of length, already × M) vs. sky angle around the hole */
  uShadowR: { value: new Array<number>(64).fill(3 * Math.sqrt(3)) },
  /** sky basis: e_α (horizontal, towards the receding side) and e_β (projected spin axis) */
  uEA: { value: new THREE.Vector3(1, 0, 0) },
  uEB: { value: new THREE.Vector3(0, 1, 0) },
  uRH: { value: 2 },
  uRin: { value: 6 },
  uJ: { value: 0 },
  uTime: { value: 0 },
  uPixelRatio: { value: 1 },
  uDoppler: { value: 1 },
};

// Thin point-lens approximation applied per vertex in world space (black hole at the origin).
// For a source behind the lens plane the two images sit at
//   θ± = ( β ± sqrt(β² + 4 θ_E²) ) / 2,   θ_E² = 4M · D_ds / (D_d · D_s)
// The vertex is rotated about the camera to the image direction, keeping its distance
// (so depth ordering against the shadow disk stays correct).
// uImage = +1 renders the primary image, −1 the secondary (opposite side, inside the ring).
export const LENS_GLSL = /* glsl */ `
uniform vec3 uCamPos;
uniform float uM;
uniform float uLens;
uniform float uShadowR[64];
uniform vec3 uEA;
uniform vec3 uEB;
uniform float uImage;

// angular radius of the (Kerr) shadow edge in the direction of the image offset q
float shadowRadiusAt(vec3 q) {
  float ang = atan(dot(q, uEB), dot(q, uEA));
  float f = (ang / 6.28318530718 + 1.0) * 64.0;
  float fl = floor(f);
  int i0 = int(mod(fl, 64.0));
  int i1 = int(mod(fl + 1.0, 64.0));
  return mix(uShadowR[i0], uShadowR[i1], f - fl);
}

vec3 lensWorld(vec3 P, out float mag, out float visible) {
  mag = 1.0;
  visible = 1.0;
  if (uLens < 0.5) {
    if (uImage < 0.0) visible = 0.0;
    return P;
  }
  vec3 L = -uCamPos;
  float Dd = length(L);
  vec3 l = L / Dd;
  vec3 S = P - uCamPos;
  float Ds = max(length(S), 1e-4);
  vec3 s = S / Ds;
  float Dds = dot(P, l);
  if (Dds <= 0.0) {
    if (uImage < 0.0) visible = 0.0;
    return P;
  }
  float c = clamp(dot(s, l), -1.0, 1.0);
  float beta = acos(c);
  float thE2 = 4.0 * uM * Dds / (Dd * Ds);
  float root = sqrt(beta * beta + 4.0 * thE2);
  float theta = 0.5 * (beta + uImage * root);
  vec3 perp = s - l * c;
  float pl = length(perp);
  perp = pl > 1e-7 ? perp / pl : normalize(cross(l, vec3(0.0, 1.0, 0.13)));
  vec3 dir = l * cos(theta) + perp * sin(theta);
  float u = beta / sqrt(thE2 + 1e-12);
  float u2 = u * u;
  mag = abs((u2 + 2.0) / (2.0 * max(u, 1e-3) * sqrt(u2 + 4.0)) + 0.5 * uImage);
  // light that would arrive inside the shadow is captured by the hole
  float thSh = asin(clamp(shadowRadiusAt(dir - l * dot(dir, l)) / Dd, 0.0, 1.0));
  if (abs(theta) < thSh) visible = 0.0;
  return uCamPos + dir * Ds;
}
`;

// Approximate blackbody colour for a normalised temperature (1 ≈ 6500 K white).
export const BLACKBODY_GLSL = /* glsl */ `
vec3 blackbody(float t) {
  t = max(t, 0.0);
  vec3 c1 = vec3(0.35, 0.02, 0.0);   // deep red
  vec3 c2 = vec3(1.0, 0.32, 0.05);   // orange
  vec3 c3 = vec3(1.0, 0.78, 0.45);   // yellow-white
  vec3 c4 = vec3(1.0, 0.97, 0.92);   // white
  vec3 c5 = vec3(0.62, 0.75, 1.0);   // blue-white
  if (t < 0.35) return mix(vec3(0.0), c1, t / 0.35);
  if (t < 0.6) return mix(c1, c2, (t - 0.35) / 0.25);
  if (t < 0.85) return mix(c2, c3, (t - 0.6) / 0.25);
  if (t < 1.2) return mix(c3, c4, (t - 0.85) / 0.35);
  return mix(c4, c5, clamp((t - 1.2) / 1.3, 0.0, 1.0));
}
`;

/** Lapse-based colour: cool blue far away → hot orange near the horizon. */
export const LAPSE_GLSL = /* glsl */ `
vec3 lapseColor(float lapse) {
  vec3 far = vec3(0.22, 0.45, 1.0);
  vec3 mid = vec3(0.55, 0.35, 1.0);
  vec3 near = vec3(1.0, 0.42, 0.12);
  return lapse > 0.6 ? mix(mid, far, (lapse - 0.6) / 0.4) : mix(near, mid, lapse / 0.6);
}
`;
