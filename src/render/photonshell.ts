import * as THREE from 'three';
import { LENS_GLSL, shared } from './shared';
import { kerrRadii } from '../physics/kerr';
import { photonShellOutline, SphericalPhoton } from '../physics/photon';

// Drawn as a 3D diagram in Boyer–Lindquist-like coordinates (no lens displacement): the shell is a
// region of space, not something you would see directly.
//
// Photon shell: the region filled by spherical photon orbits (a solid of revolution whose
// meridional section reaches the poles only at the polar-orbit radius), plus photons that
// travel along exact spherical Kerr geodesics with fading trails.

const shellVert = /* glsl */ `
${LENS_GLSL}
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
varying float vVis;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vW = w.xyz;
  vN = normalize(mat3(modelMatrix) * normal);
  vUv = uv;
  float mag, vis;
  vec3 lensed = lensWorld(w.xyz, mag, vis);
  vVis = vis;
  gl_Position = projectionMatrix * viewMatrix * vec4(lensed, 1.0);
}
`;
const shellFrag = /* glsl */ `
uniform vec3 uCamPos;
uniform float uOpacity;
varying vec3 vN;
varying vec3 vW;
varying vec2 vUv;
varying float vVis;
void main() {
  if (vVis < 0.5) discard;
  vec3 v = normalize(uCamPos - vW);
  float fres = pow(1.0 - abs(dot(normalize(vN), v)), 2.0);
  float meridian = smoothstep(0.035, 0.0, abs(fract(vUv.x * 24.0) - 0.5) - 0.465);
  float a = uOpacity * (0.2 + 0.8 * fres + 0.9 * meridian);
  gl_FragColor = vec4(vec3(1.0, 0.8, 0.45) * a, 1.0);
}
`;

const trailVert = /* glsl */ `
${LENS_GLSL}
attribute float aAge;
varying float vA;
void main() {
  float mag, vis;
  vec3 lensed = lensWorld(position, mag, vis);
  vA = pow(1.0 - aAge, 1.6) * vis;
  gl_Position = projectionMatrix * viewMatrix * vec4(lensed, 1.0);
}
`;
const trailFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vA;
void main() {
  if (vA < 0.004) discard;
  gl_FragColor = vec4(uColor * vA * uOpacity, 1.0);
}
`;

const headVert = /* glsl */ `
${LENS_GLSL}
uniform float uPixelRatio;
attribute vec3 aColor;
varying vec3 vColor;
varying float vVis;
void main() {
  float mag, vis;
  vec3 lensed = lensWorld(position, mag, vis);
  vVis = vis;
  vColor = aColor;
  vec4 mv = viewMatrix * vec4(lensed, 1.0);
  gl_Position = projectionMatrix * mv;
  gl_PointSize = clamp(220.0 / -mv.z, 2.5, 7.0) * uPixelRatio;
}
`;
const headFrag = /* glsl */ `
varying vec3 vColor;
varying float vVis;
void main() {
  vec2 c = gl_PointCoord - 0.5;
  float d = dot(c, c);
  if (d > 0.25 || vVis < 0.5) discard;
  gl_FragColor = vec4(vColor * exp(-d * 12.0) * 1.6, 1.0);
}
`;

const TRAIL_POINTS = 320;

interface Trail {
  photon: SphericalPhoton;
  line: THREE.Line;
  pos: Float32Array;
  attr: THREE.BufferAttribute;
}

export class PhotonShellVisual {
  readonly group = new THREE.Group();
  readonly shell: THREE.Mesh;
  readonly orbits = new THREE.Group();
  private shellMat: THREE.ShaderMaterial;
  private trails: Trail[] = [];
  private heads: THREE.Points;
  private headPos = new Float32Array(0);
  private shellKey = '';
  private orbitKey = '';
  private acc = 0;
  private tmp: [number, number, number] = [0, 0, 0];
  private ageAttr: THREE.BufferAttribute;
  private trailMats: THREE.ShaderMaterial[] = [];
  /** range of radii covered by the shell (units of M) */
  range: [number, number] = [0, 0];

  constructor() {
    this.shellMat = new THREE.ShaderMaterial({
      vertexShader: shellVert,
      fragmentShader: shellFrag,
      uniforms: { ...shared, uLens: { value: 0 }, uImage: { value: 1 }, uOpacity: { value: 0.06 } },
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
      blending: THREE.AdditiveBlending,
    });
    this.shell = new THREE.Mesh(new THREE.BufferGeometry(), this.shellMat);
    this.shell.frustumCulled = false;

    const age = new Float32Array(TRAIL_POINTS);
    for (let i = 0; i < TRAIL_POINTS; i++) age[i] = i / (TRAIL_POINTS - 1);
    this.ageAttr = new THREE.BufferAttribute(age, 1);

    this.heads = new THREE.Points(
      new THREE.BufferGeometry(),
      new THREE.ShaderMaterial({
        vertexShader: headVert,
        fragmentShader: headFrag,
        uniforms: { ...shared, uLens: { value: 0 }, uImage: { value: 1 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    );
    this.heads.frustumCulled = false;
    this.orbits.add(this.heads);
    this.group.add(this.shell, this.orbits);
  }

  private rebuildShell(spin: number) {
    const outline = photonShellOutline(spin).map(([x, y]) => new THREE.Vector2(Math.max(x, 1e-4), y));
    const g = new THREE.LatheGeometry(outline, 96);
    this.shell.geometry.dispose();
    this.shell.geometry = g;
  }

  private rebuildOrbits(spin: number, count: number, trailM: number, M: number) {
    for (const t of this.trails) {
      this.orbits.remove(t.line);
      t.line.geometry.dispose();
    }
    for (const m of this.trailMats) m.dispose();
    this.trails = [];
    this.trailMats = [];
    const a = Math.max(spin, 1e-3);
    const R = kerrRadii(1, a);
    const lo = R.photonPro, hi = R.photonRetro;
    const gold = new THREE.Color(1.0, 0.82, 0.35), white = new THREE.Color(1, 1, 1), orange = new THREE.Color(1.0, 0.48, 0.22);
    const headCol = new Float32Array(count * 3);
    this.headPos = new Float32Array(count * 3);
    for (let k = 0; k < count; k++) {
      const f = count === 1 ? 0.5 : k / (count - 1);
      const r = lo + (hi - lo) * (0.03 + 0.94 * f);
      const photon = new SphericalPhoton(r, a, Math.random() * Math.PI * 2, Math.random() * Math.PI * 2);
      const col = f < 0.5 ? gold.clone().lerp(white, f * 2) : white.clone().lerp(orange, (f - 0.5) * 2);
      headCol.set([col.r, col.g, col.b], k * 3);
      const mat = new THREE.ShaderMaterial({
        vertexShader: trailVert,
        fragmentShader: trailFrag,
        uniforms: { ...shared, uLens: { value: 0 }, uImage: { value: 1 }, uColor: { value: col }, uOpacity: { value: 0.9 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      this.trailMats.push(mat);
      const pos = new Float32Array(TRAIL_POINTS * 3);
      const g = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage);
      g.setAttribute('position', attr);
      g.setAttribute('aAge', this.ageAttr);
      const line = new THREE.Line(g, mat);
      line.frustumCulled = false;
      this.orbits.add(line);
      const trail: Trail = { photon, line, pos, attr };
      // pre-fill the trail (oldest at the end)
      const dtp = trailM / TRAIL_POINTS;
      for (let i = TRAIL_POINTS - 1; i >= 0; i--) {
        photon.advance(dtp);
        photon.position(this.tmp);
        pos.set([this.tmp[0] * M, this.tmp[1] * M, this.tmp[2] * M], i * 3);
      }
      attr.needsUpdate = true;
      this.trails.push(trail);
    }
    const hg = new THREE.BufferGeometry();
    hg.setAttribute('position', new THREE.BufferAttribute(this.headPos, 3));
    hg.setAttribute('aColor', new THREE.BufferAttribute(headCol, 3));
    this.heads.geometry.dispose();
    this.heads.geometry = hg;
  }

  update(dtReal: number, opts: { spin: number; M: number; showShell: boolean; showOrbits: boolean; shellOpacity: number; count: number; speedExp: number; trailM: number; paused: boolean }) {
    const { spin, M } = opts;
    const R = kerrRadii(1, Math.max(spin, 1e-3));
    this.range = [R.photonPro, R.photonRetro];

    this.shell.visible = opts.showShell;
    this.orbits.visible = opts.showOrbits;
    this.shellMat.uniforms.uOpacity.value = opts.shellOpacity;
    const sKey = spin.toFixed(4);
    if (opts.showShell && sKey !== this.shellKey) {
      this.rebuildShell(spin);
      this.shellKey = sKey;
    }
    this.shell.scale.setScalar(M);

    if (!opts.showOrbits) return;
    const oKey = `${spin.toFixed(4)}:${opts.count}:${opts.trailM}`;
    if (oKey !== this.orbitKey) {
      this.rebuildOrbits(spin, opts.count, opts.trailM, M);
      this.orbitKey = oKey;
      this.acc = 0;
    }
    if (!opts.paused) this.acc += dtReal * Math.pow(10, opts.speedExp);
    const dtp = opts.trailM / TRAIL_POINTS;
    let steps = Math.floor(this.acc / dtp);
    this.acc -= steps * dtp;
    steps = Math.min(steps, TRAIL_POINTS);
    for (let k = 0; k < this.trails.length; k++) {
      const t = this.trails[k];
      if (steps > 0) {
        t.pos.copyWithin(steps * 3, 0, (TRAIL_POINTS - steps) * 3);
        for (let i = steps - 1; i >= 0; i--) {
          t.photon.advance(dtp);
          t.photon.position(this.tmp);
          t.pos[i * 3] = this.tmp[0] * M;
          t.pos[i * 3 + 1] = this.tmp[1] * M;
          t.pos[i * 3 + 2] = this.tmp[2] * M;
        }
        t.attr.needsUpdate = true;
      }
      this.headPos[k * 3] = t.pos[0];
      this.headPos[k * 3 + 1] = t.pos[1];
      this.headPos[k * 3 + 2] = t.pos[2];
    }
    const hp = this.heads.geometry.getAttribute('position') as THREE.BufferAttribute | undefined;
    if (hp) hp.needsUpdate = true;
  }
}
