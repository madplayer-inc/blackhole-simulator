import * as THREE from 'three';
import { LENS_GLSL, shared } from './shared';
import { ergoRadius, type KerrRadii } from '../physics/kerr';
import { criticalCurve, type CriticalCurve } from '../physics/photon';

// Shadow, photon ring, horizon, ergosphere and reference orbits.

const ringVert = /* glsl */ `
${LENS_GLSL}
uniform float uRadius;
varying float vVis;
void main() {
  vec3 world = position * uRadius;
  float mag, vis;
  vec3 lensed = lensWorld(world, mag, vis);
  vVis = vis;
  gl_Position = projectionMatrix * viewMatrix * vec4(lensed, 1.0);
}
`;
const ringFrag = /* glsl */ `
uniform vec3 uColor;
uniform float uOpacity;
varying float vVis;
void main() {
  if (vVis < 0.5) discard;
  gl_FragColor = vec4(uColor * uOpacity, 1.0);
}
`;

const ergoVert = /* glsl */ `
${LENS_GLSL}
uniform float uA;
varying float vVis;
varying float vEq;
void main() {
  vec3 d = normalize(position);
  float r = uM + sqrt(max(uM * uM - uA * uA * d.y * d.y, 0.0));
  float mag, vis;
  vec3 lensed = lensWorld(d * r, mag, vis);
  vVis = vis;
  vEq = 1.0 - abs(d.y);
  gl_Position = projectionMatrix * viewMatrix * vec4(lensed, 1.0);
}
`;
const ergoFrag = /* glsl */ `
uniform float uOpacity;
varying float vVis;
varying float vEq;
void main() {
  if (vVis < 0.5) discard;
  gl_FragColor = vec4(vec3(0.35, 0.6, 1.0) * uOpacity * (0.4 + vEq), 1.0);
}
`;

// Photon ring: a strip that follows the critical curve. aD = signed distance from the curve
// in units of the mean shadow radius (negative inside).
const glowVert = /* glsl */ `
attribute float aD;
varying float vD;
void main() { vD = aD; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
`;
const glowFrag = /* glsl */ `
uniform float uStrength;
varying float vD;
void main() {
  float ring = exp(-pow((vD - 0.015) / 0.018, 2.0));
  float halo = vD > 0.0 ? exp(-vD * 5.6) * 0.25 : 0.0;
  gl_FragColor = vec4(vec3(1.0, 0.78, 0.5) * (ring + halo) * uStrength, 1.0);
}
`;

const GLOW_IN = 0.06;
const GLOW_OUT = 0.8;

export interface RefRing {
  key: keyof KerrRadii | 'ergo';
  label: string;
  color: number;
  mesh: THREE.LineLoop;
}

export class BlackHoleVisual {
  readonly group = new THREE.Group();
  readonly shadow: THREE.Mesh;
  readonly glow: THREE.Mesh;
  readonly horizon: THREE.Mesh;
  readonly ergo: THREE.LineSegments;
  readonly rings: RefRing[] = [];
  readonly ringGroup = new THREE.Group();
  private glowMat: THREE.ShaderMaterial;
  private ergoMat: THREE.ShaderMaterial;
  /** billboard frame at the hole: x = e_α, y = e_β, z = towards the camera */
  readonly billboard = new THREE.Group();
  curve: CriticalCurve = criticalCurve(0.6, 0);
  private curveKey = '';
  private shadowPos!: THREE.BufferAttribute;
  private glowPos!: THREE.BufferAttribute;
  private glowD!: THREE.BufferAttribute;
  private eA = new THREE.Vector3();
  private eB = new THREE.Vector3();
  private o = new THREE.Vector3();
  private basis = new THREE.Matrix4();
  inclinationDeg = 90;

  constructor() {
    this.shadow = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.DoubleSide }));
    this.shadow.renderOrder = -5;
    this.shadow.frustumCulled = false;

    this.glowMat = new THREE.ShaderMaterial({
      vertexShader: glowVert,
      fragmentShader: glowFrag,
      uniforms: { uStrength: { value: 1 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.glowMat.side = THREE.DoubleSide;
    this.glow = new THREE.Mesh(new THREE.BufferGeometry(), this.glowMat);
    this.glow.renderOrder = 5;
    this.glow.frustumCulled = false;
    this.billboard.matrixAutoUpdate = false;
    this.billboard.add(this.shadow, this.glow);

    this.horizon = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 32), new THREE.MeshBasicMaterial({ color: 0x000000 }));

    this.ergoMat = new THREE.ShaderMaterial({
      vertexShader: ergoVert,
      fragmentShader: ergoFrag,
      uniforms: { ...shared, uImage: { value: 1 }, uA: { value: 0 }, uOpacity: { value: 0.35 } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    this.ergo = new THREE.LineSegments(new THREE.WireframeGeometry(new THREE.SphereGeometry(1, 36, 18)), this.ergoMat);
    this.ergo.frustumCulled = false;

    const circle = new THREE.BufferGeometry();
    const pts: number[] = [];
    for (let i = 0; i < 256; i++) {
      const t = (i / 256) * Math.PI * 2;
      pts.push(Math.cos(t), 0, Math.sin(t));
    }
    circle.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
    const defs: Array<[RefRing['key'], string, number]> = [
      ['iscoPro', 'ISCO (순행)', 0x46e08c],
      ['iscoRetro', 'ISCO (역행)', 0x2a8a58],
      ['photonPro', '광자 궤도 (순행)', 0xffd25a],
      ['photonRetro', '광자 궤도 (역행)', 0xb08a30],
      ['ergo', '에르고구 (적도)', 0x5a9aff],
    ];
    for (const [key, label, color] of defs) {
      const mat = new THREE.ShaderMaterial({
        vertexShader: ringVert,
        fragmentShader: ringFrag,
        uniforms: { ...shared, uImage: { value: 1 }, uRadius: { value: 1 }, uColor: { value: new THREE.Color(color) }, uOpacity: { value: 0.8 } },
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      });
      const mesh = new THREE.LineLoop(circle, mat);
      mesh.frustumCulled = false;
      this.rings.push({ key, label, color, mesh });
      this.ringGroup.add(mesh);
    }

    this.group.add(this.billboard, this.horizon, this.ergo, this.ringGroup);
  }

  private allocate(count: number) {
    const sg = new THREE.BufferGeometry();
    this.shadowPos = new THREE.BufferAttribute(new Float32Array((count + 1) * 3), 3);
    sg.setAttribute('position', this.shadowPos);
    const idx: number[] = [];
    for (let i = 0; i < count; i++) idx.push(count, i, (i + 1) % count);
    sg.setIndex(idx);
    this.shadow.geometry.dispose();
    this.shadow.geometry = sg;

    const gg = new THREE.BufferGeometry();
    this.glowPos = new THREE.BufferAttribute(new Float32Array(count * 2 * 3), 3);
    this.glowD = new THREE.BufferAttribute(new Float32Array(count * 2), 1);
    gg.setAttribute('position', this.glowPos);
    gg.setAttribute('aD', this.glowD);
    const gi: number[] = [];
    for (let i = 0; i < count; i++) {
      const j = (i + 1) % count;
      gi.push(2 * i, 2 * i + 1, 2 * j, 2 * j, 2 * i + 1, 2 * j + 1);
    }
    gg.setIndex(gi);
    this.glow.geometry.dispose();
    this.glow.geometry = gg;
  }

  /** Sky frame of the camera and the Kerr shadow outline; also feeds the lens shader. */
  private updateShadow(camera: THREE.Camera, M: number, spin: number, exact: boolean) {
    const Dd = camera.position.length();
    this.o.copy(camera.position).divideScalar(Dd);
    const cosI = this.o.y; // spin axis = +Y
    this.inclinationDeg = (Math.acos(Math.max(-1, Math.min(1, cosI))) * 180) / Math.PI;
    this.eB.set(0, 1, 0).addScaledVector(this.o, -cosI);
    if (this.eB.lengthSq() < 1e-6) {
      // looking down the spin axis: the shadow is round, any sky axis will do
      this.eB.set(0, 1, 0).applyQuaternion(camera.quaternion);
      this.eB.addScaledVector(this.o, -this.o.dot(this.eB));
    }
    this.eB.normalize();
    this.eA.crossVectors(this.eB, this.o).normalize();
    this.basis.makeBasis(this.eA, this.eB, this.o);
    this.billboard.matrix.copy(this.basis);
    this.billboard.matrixWorldNeedsUpdate = true;
    shared.uEA.value.copy(this.eA);
    shared.uEB.value.copy(this.eB);

    const key = `${exact ? 1 : 0}:${spin.toFixed(4)}:${this.inclinationDeg.toFixed(1)}`;
    if (key !== this.curveKey) {
      const prev = this.curve.count;
      this.curve = criticalCurve(spin, Math.cos((Number(this.inclinationDeg.toFixed(1)) * Math.PI) / 180), exact);
      this.curveKey = key;
      if (!this.shadowPos || prev !== this.curve.count) this.allocate(this.curve.count);
    }
    const c = this.curve;
    for (let j = 0; j < c.radial.length; j++) shared.uShadowR.value[j] = c.radial[j] * M;

    // apparent size at finite distance: angle asin(b/D) projected onto the plane through the hole
    const n = c.count;
    const sp = this.shadowPos.array as Float32Array;
    const gp = this.glowPos.array as Float32Array;
    const gd = this.glowD.array as Float32Array;
    let meanR = 0;
    const X = new Float64Array(n), Y = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const x = c.points[2 * i] * M, y = c.points[2 * i + 1] * M;
      const b = Math.hypot(x, y);
      const f = 1 / Math.sqrt(Math.max(1 - (b * b) / (Dd * Dd), 0.05));
      X[i] = x * f;
      Y[i] = y * f;
      meanR += Math.hypot(X[i], Y[i]);
    }
    meanR /= n;
    let cx = 0, cy = 0;
    for (let i = 0; i < n; i++) { cx += X[i]; cy += Y[i]; }
    cx /= n; cy /= n;
    for (let i = 0; i < n; i++) {
      sp[3 * i] = X[i]; sp[3 * i + 1] = Y[i]; sp[3 * i + 2] = 0;
      const ip = (i - 1 + n) % n, inx = (i + 1) % n;
      let nx = Y[inx] - Y[ip], ny = -(X[inx] - X[ip]);
      const nl = Math.hypot(nx, ny) || 1;
      nx /= nl; ny /= nl;
      if (nx * (X[i] - cx) + ny * (Y[i] - cy) < 0) { nx = -nx; ny = -ny; }
      gp[6 * i] = X[i] - nx * GLOW_IN * meanR; gp[6 * i + 1] = Y[i] - ny * GLOW_IN * meanR; gp[6 * i + 2] = 0;
      gp[6 * i + 3] = X[i] + nx * GLOW_OUT * meanR; gp[6 * i + 4] = Y[i] + ny * GLOW_OUT * meanR; gp[6 * i + 5] = 0;
      gd[2 * i] = -GLOW_IN;
      gd[2 * i + 1] = GLOW_OUT;
    }
    sp[3 * n] = cx; sp[3 * n + 1] = cy; sp[3 * n + 2] = 0;
    this.shadowPos.needsUpdate = true;
    this.glowPos.needsUpdate = true;
    this.glowD.needsUpdate = true;
  }

  update(camera: THREE.Camera, radii: KerrRadii, M: number, spin: number, lensing: boolean, showErgo: boolean, showRings: boolean, glowStrength: number, exactShadow: boolean) {
    this.updateShadow(camera, M, spin, exactShadow);
    this.shadow.visible = lensing;
    this.glow.visible = lensing;
    this.horizon.visible = !lensing;
    this.glowMat.uniforms.uStrength.value = glowStrength;
    this.horizon.scale.setScalar(radii.horizon);

    this.ergo.visible = showErgo && spin > 0.02;
    this.ergoMat.uniforms.uA.value = spin * M;
    this.ringGroup.visible = showRings;
    for (const r of this.rings) {
      const radius = r.key === 'ergo' ? ergoRadius(M, spin, 0) : (radii[r.key] as number);
      (r.mesh.material as THREE.ShaderMaterial).uniforms.uRadius.value = radius;
      r.mesh.visible = !(r.key === 'ergo' && spin < 0.02);
    }
  }
}
