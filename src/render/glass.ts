import * as THREE from 'three';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

// Post-processing pass that turns screen rectangles (the dock and its popover) into frosted,
// refracting glass, and puts a tiny point-mass gravitational lens under the hovered icon.
//
// Glass: rounded-rect signed distance d. Inside, the background is sampled slightly inward
// near the rim (refraction), blurred with a 16-tap disk, split into RGB (dispersion), tinted,
// and lit with a thin top-weighted rim highlight. Outside, a soft shadow.
// Lens: the same thin-lens map as the scene, β = θ − θ_E²/θ, with a small shadow and an
// Einstein-ring glow; its strength eases in on hover and pulses on press.

const MAX_RECTS = 3;

const frag = /* glsl */ `
uniform sampler2D tDiffuse;
uniform vec2 uRes;
uniform float uPR;
uniform vec4 uRect[${MAX_RECTS}];
uniform float uRadius[${MAX_RECTS}];
uniform int uCount;
uniform vec3 uLens;     // centre px (bottom-left origin), strength 0..1
uniform float uLensRE;  // Einstein radius px
uniform float uEnabled;
varying vec2 vUv;

float sdRound(vec2 p, vec4 r, float rad) {
  vec2 c = r.xy + 0.5 * r.zw;
  vec2 q = abs(p - c) - 0.5 * r.zw + rad;
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;
}

float field(vec2 p, out int idx) {
  float d = 1e6;
  idx = -1;
  for (int i = 0; i < ${MAX_RECTS}; i++) {
    if (i >= uCount) break;
    float di = sdRound(p, uRect[i], uRadius[i]);
    if (di < d) { d = di; idx = i; }
  }
  return d;
}

vec3 tex(vec2 px) { return texture2D(tDiffuse, clamp(px / uRes, vec2(0.0), vec2(1.0))).rgb; }

// gravitational-lens remap of a sample position
vec2 lensMap(vec2 px, out float shadow, out float ring) {
  shadow = 0.0;
  ring = 0.0;
  if (uLens.z < 0.002) return px;
  vec2 d = px - uLens.xy;
  float th = length(d);
  float te = uLensRE * uLens.z;
  float R = te * 3.2;
  if (th > R) return px;
  float w = smoothstep(R, R * 0.55, th);
  vec2 n = d / max(th, 1e-3);
  vec2 beta = d - n * (te * te / max(th, 1e-3));
  shadow = 1.0 - smoothstep(te * 0.32, te * 0.46, th);
  ring = exp(-pow((th - te) / (te * 0.085), 2.0)) * w;
  return mix(px, uLens.xy + beta, w);
}

void main() {
  vec2 px = vUv * uRes;
  vec4 base = texture2D(tDiffuse, vUv);
  if (uEnabled < 0.5) { gl_FragColor = base; return; }

  int idx;
  float d = field(px, idx);
  float shadow, ring;
  vec2 src = lensMap(px, shadow, ring);

  vec3 col;
  if (d < 0.0) {
    // outward normal from the SDF gradient
    int k;
    float e = 1.0;
    vec2 g = vec2(field(px + vec2(e, 0.0), k) - field(px - vec2(e, 0.0), k),
                  field(px + vec2(0.0, e), k) - field(px - vec2(0.0, e), k));
    g = normalize(g + 1e-6);
    float rim = 14.0 * uPR;
    float inside = clamp(-d / rim, 0.0, 1.0);
    float bend = pow(1.0 - inside, 2.2) * 16.0 * uPR;
    vec2 s = src - g * bend;

    // 16-tap golden-angle disk blur with RGB dispersion
    float br = 7.0 * uPR;
    vec3 acc = vec3(0.0);
    for (int i = 0; i < 16; i++) {
      float fi = float(i);
      float r = br * sqrt((fi + 0.5) / 16.0);
      float a = fi * 2.39996;
      vec2 o = vec2(cos(a), sin(a)) * r;
      vec2 disp = g * (1.0 - inside) * 2.0 * uPR;
      acc += vec3(tex(s + o + disp).r, tex(s + o).g, tex(s + o - disp).b);
    }
    col = acc / 16.0;
    // tint and lift so the glass reads even on black space
    col = col * 0.6 + vec3(0.032, 0.036, 0.048);
    // rim light: brighter on the top edge, thin line along the border
    float edge = exp(-(-d) / (1.4 * uPR));
    float top = 0.55 + 0.45 * g.y;
    col += vec3(0.55, 0.6, 0.7) * edge * top * 0.55;
    col += vec3(0.25, 0.28, 0.35) * pow(1.0 - inside, 6.0) * 0.12;
  } else {
    col = src == px ? base.rgb : tex(src);
    // soft drop shadow under the glass
    col *= 1.0 - 0.35 * exp(-d / (18.0 * uPR)) * float(uCount > 0);
  }

  col = mix(col, vec3(0.0), shadow * uLens.z);
  col += vec3(1.0, 0.74, 0.42) * ring * uLens.z * 0.9;
  gl_FragColor = vec4(col, base.a);
}
`;

const vert = /* glsl */ `
varying vec2 vUv;
void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;

export class GlassPass extends ShaderPass {
  private lensStrength = 0;
  private lensPos = new THREE.Vector2();

  constructor() {
    super({
      uniforms: {
        tDiffuse: { value: null },
        uRes: { value: new THREE.Vector2(1, 1) },
        uPR: { value: 1 },
        uRect: { value: Array.from({ length: MAX_RECTS }, () => new THREE.Vector4()) },
        uRadius: { value: new Array(MAX_RECTS).fill(0) },
        uCount: { value: 0 },
        uLens: { value: new THREE.Vector3() },
        uLensRE: { value: 14 },
        uEnabled: { value: 1 },
      },
      vertexShader: vert,
      fragmentShader: frag,
    });
  }

  /**
   * canvas: the WebGL canvas; rects/radii in client px; hover = lens centre in client px.
   * pressAge = seconds since the last press (for a short pulse).
   */
  update(canvas: HTMLCanvasElement, rects: DOMRect[], radii: number[], hover: { x: number; y: number } | null, dt: number, pressAge: number, enabled: boolean) {
    const u = this.uniforms;
    const cr = canvas.getBoundingClientRect();
    const pr = canvas.width / Math.max(cr.width, 1);
    u.uRes.value.set(canvas.width, canvas.height);
    u.uPR.value = pr;
    u.uEnabled.value = enabled ? 1 : 0;
    const n = Math.min(rects.length, MAX_RECTS);
    for (let i = 0; i < n; i++) {
      const r = rects[i];
      u.uRect.value[i].set((r.left - cr.left) * pr, (cr.bottom - r.bottom) * pr, r.width * pr, r.height * pr);
      u.uRadius.value[i] = radii[i] * pr;
    }
    u.uCount.value = n;

    const target = hover ? 1 : 0;
    this.lensStrength += (target - this.lensStrength) * Math.min(1, dt * 9);
    if (hover) this.lensPos.set((hover.x - cr.left) * pr, (cr.bottom - hover.y) * pr);
    const pulse = pressAge < 0.35 ? 1 - 0.45 * Math.sin((pressAge / 0.35) * Math.PI) : 1;
    u.uLens.value.set(this.lensPos.x, this.lensPos.y, this.lensStrength * pulse);
    u.uLensRE.value = 15 * pr;
  }
}
