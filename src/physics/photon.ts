// Spherical photon orbits of a Kerr black hole, the shadow (critical curve) and the photon shell.
// Units G = c = M = 1 (callers scale lengths and times by M). Spin axis = +Y.
//
// A spherical photon orbit at Boyer–Lindquist radius r has the conserved quantities
//   ξ = L/E = (r²(3 − r) − a²(r + 1)) / (a (r − 1))
//   η = Q/E² = r³ (4a² − r (r − 3)²) / (a² (r − 1)²)
// (Bardeen 1973; Teo 2003). The orbits exist for r between the prograde and retrograde
// equatorial photon-orbit radii; together they fill the "photon shell".
//
// The shadow edge seen by a distant observer at inclination θo (from the spin axis) is the
// image of these orbits:
//   α = −ξ / sin θo,   β = ±sqrt(η + a² cos²θo − ξ² cot²θo)

import { kerrRadii } from './kerr';

export const SHADOW_LOOKUP = 64;

export function xiEta(r: number, a: number): [number, number] {
  const xi = (r * r * (3 - r) - a * a * (r + 1)) / (a * (r - 1));
  const eta = (r * r * r * (4 * a * a - r * (r - 3) * (r - 3))) / (a * a * (r - 1) * (r - 1));
  return [xi, eta];
}

/** cos²θ of the latitude turning point (P) and the auxiliary root (Q) of the θ-motion. */
export function thetaRoots(xi: number, eta: number, a: number): [number, number] {
  const B = eta - a * a + xi * xi;
  const D = Math.sqrt(B * B + 4 * a * a * Math.max(eta, 0));
  const P = Math.min(1, Math.max(0, (-B + D) / (2 * a * a)));
  const Q = (B + D) / (2 * a * a);
  return [P, Q];
}

function bisect(f: (x: number) => number, lo: number, hi: number, iters = 60): number {
  let flo = f(lo);
  for (let i = 0; i < iters; i++) {
    const mid = 0.5 * (lo + hi);
    const fm = f(mid);
    if ((fm > 0) === (flo > 0)) {
      lo = mid;
      flo = fm;
    } else hi = mid;
  }
  return 0.5 * (lo + hi);
}

export interface CriticalCurve {
  /** closed loop of sky coordinates (α, β), interleaved, in units of M */
  points: Float64Array;
  count: number;
  /** distance from the hole's direction to the curve vs. sky angle, SHADOW_LOOKUP samples */
  radial: Float32Array;
  width: number;
  height: number;
  /** horizontal displacement of the shadow centre (towards the receding side is +) */
  shift: number;
  rRange: [number, number];
}

/** Shadow outline for spin chi (a/M) and observer inclination cosθo. exact=false gives the 3√3 circle. */
export function criticalCurve(chi: number, cosTheta: number, exact = true, samples = 240): CriticalCurve {
  const pts: number[] = [];
  let rRange: [number, number] = [3, 3];
  const a = Math.min(Math.max(chi, 1e-3), 0.9995);
  if (!exact) {
    const b = 3 * Math.sqrt(3);
    for (let i = 0; i < 2 * samples - 2; i++) {
      const t = (i / (2 * samples - 2)) * Math.PI * 2;
      pts.push(-b * Math.cos(t), b * Math.sin(t));
    }
  } else {
    const ct = Math.max(-1, Math.min(1, cosTheta));
    const st = Math.max(Math.sqrt(1 - ct * ct), Math.sin((0.3 * Math.PI) / 180));
    const cot2 = (ct * ct) / (st * st);
    const R = kerrRadii(1, a);
    const lo = R.photonPro, hi = R.photonRetro;
    const beta2 = (r: number) => {
      const [xi, eta] = xiEta(r, a);
      return eta + a * a * ct * ct - xi * xi * cot2;
    };
    // polar orbit (ξ = 0) is always visible; expand from it to both roots of β²
    const r0 = bisect((r) => xiEta(r, a)[0], lo + 1e-9, hi - 1e-9);
    const r1 = beta2(lo + 1e-9) >= 0 ? lo + 1e-9 : bisect(beta2, lo + 1e-9, r0);
    const r2 = beta2(hi - 1e-9) >= 0 ? hi - 1e-9 : bisect(beta2, r0, hi - 1e-9);
    rRange = [r1, r2];
    const upper: Array<[number, number]> = [];
    for (let k = 0; k < samples; k++) {
      const r = r1 + ((r2 - r1) * (1 - Math.cos((Math.PI * k) / (samples - 1)))) / 2;
      const [xi] = xiEta(r, a);
      upper.push([-xi / st, Math.sqrt(Math.max(beta2(r), 0))]);
    }
    for (const [x, y] of upper) pts.push(x, y);
    for (let k = samples - 2; k >= 1; k--) pts.push(upper[k][0], -upper[k][1]);
  }

  const count = pts.length / 2;
  const points = Float64Array.from(pts);
  let minX = Infinity, maxX = -Infinity, maxY = 0;
  for (let i = 0; i < count; i++) {
    minX = Math.min(minX, points[2 * i]);
    maxX = Math.max(maxX, points[2 * i]);
    maxY = Math.max(maxY, Math.abs(points[2 * i + 1]));
  }

  // radial lookup from the hole direction (the outline is convex and contains the origin)
  const radial = new Float32Array(SHADOW_LOOKUP);
  for (let j = 0; j < SHADOW_LOOKUP; j++) {
    const ang = (j / SHADOW_LOOKUP) * Math.PI * 2;
    const dx = Math.cos(ang), dy = Math.sin(ang);
    let best = 0;
    for (let i = 0; i < count; i++) {
      const px = points[2 * i], py = points[2 * i + 1];
      const qx = points[2 * ((i + 1) % count)], qy = points[2 * ((i + 1) % count) + 1];
      const ex = qx - px, ey = qy - py;
      const den = dx * ey - dy * ex;
      if (Math.abs(den) < 1e-12) continue;
      const t = (px * ey - py * ex) / den;
      const s = (px * dy - py * dx) / den;
      if (t > 0 && s >= -1e-9 && s <= 1 + 1e-9) best = Math.max(best, t);
    }
    radial[j] = best || 3 * Math.sqrt(3);
  }

  return { points, count, radial, width: maxX - minX, height: 2 * maxY, shift: (maxX + minX) / 2, rRange };
}

/** Meridional outline (ρ, y) of the photon shell: the region swept by spherical photon orbits. */
export function photonShellOutline(chi: number, samples = 160): Array<[number, number]> {
  const a = Math.min(Math.max(chi, 1e-3), 0.9995);
  const R = kerrRadii(1, a);
  const lo = R.photonPro, hi = R.photonRetro;
  const upper: Array<[number, number]> = [];
  for (let k = 0; k < samples; k++) {
    const r = lo + ((hi - lo) * (1 - Math.cos((Math.PI * k) / (samples - 1)))) / 2;
    const [xi, eta] = xiEta(r, a);
    const [P] = thetaRoots(xi, eta, a);
    upper.push([Math.sqrt(r * r + a * a) * Math.sqrt(1 - P), r * Math.sqrt(P)]);
  }
  const out = [...upper];
  for (let k = samples - 2; k >= 0; k--) out.push([upper[k][0], -upper[k][1]]);
  return out;
}

/**
 * One photon on a spherical orbit, integrated exactly along the Kerr geodesic.
 * θ-motion uses cosθ = √P sinψ, which removes the turning points:
 *   dψ/dλ = a √(P sin²ψ + Q)
 *   dφ/dλ = −(a − ξ/sin²θ) + a (r² + a² − aξ)/Δ
 *   dt/dλ = −a (a sin²θ − ξ) + (r² + a²)(r² + a² − aξ)/Δ
 */
export class SphericalPhoton {
  r: number;
  a: number;
  xi: number;
  eta: number;
  P: number;
  Q: number;
  psi: number;
  phi: number;

  constructor(r: number, a: number, psi0: number, phi0: number) {
    this.r = r;
    this.a = Math.max(a, 1e-3);
    [this.xi, this.eta] = xiEta(r, this.a);
    [this.P, this.Q] = thetaRoots(this.xi, this.eta, this.a);
    this.psi = psi0;
    this.phi = phi0;
  }

  private rates(psi: number): [number, number, number] {
    const { r, a, xi, P, Q } = this;
    const u = Math.sqrt(P) * Math.sin(psi);
    const s2 = Math.max(1 - u * u, 1e-6);
    const delta = r * r - 2 * r + a * a;
    const k = r * r + a * a - a * xi;
    const dpsi = a * Math.sqrt(P * Math.sin(psi) ** 2 + Q);
    const dphi = -(a - xi / s2) + (a * k) / delta;
    const dt = -a * (a * s2 - xi) + ((r * r + a * a) * k) / delta;
    return [dpsi, dphi, dt];
  }

  /** advance by coordinate time dt (units of M) */
  advance(dt: number) {
    let left = dt;
    let guard = 0;
    // near the pole φ swings fast while the Cartesian position barely moves, so φ gets a looser
    // step limit than ψ; the substep budget keeps a frame bounded
    while (left > 1e-9 && guard++ < 60) {
      const [dpsi, dphi, dtl] = this.rates(this.psi);
      const h = Math.min(left / dtl, 0.04 / Math.max(Math.abs(dpsi), 1e-6), 0.4 / Math.max(Math.abs(dphi), 1e-6));
      const [dpsi2, dphi2, dtl2] = this.rates(this.psi + 0.5 * h * dpsi);
      this.psi += h * dpsi2;
      this.phi += h * dphi2;
      left -= h * dtl2;
    }
  }

  position(out: [number, number, number]) {
    const u = Math.sqrt(this.P) * Math.sin(this.psi);
    const s = Math.sqrt(Math.max(1 - u * u, 0));
    const rho = Math.sqrt(this.r * this.r + this.a * this.a) * s;
    out[0] = rho * Math.cos(this.phi);
    out[1] = this.r * u;
    out[2] = -rho * Math.sin(this.phi);
  }
}
