// "River model" of a Kerr black hole: the flow of space = free-falling observers that start
// at rest at infinity with zero angular momentum (E = 1, L = 0, Q = 0). Units G = c = M = 1.
//
// Exact geodesic equations for these observers (Boyer–Lindquist r, θ):
//   dr/dτ = −sqrt(2r (r² + a²)) / ρ²,   ρ² = r² + a² cos²θ,   θ = const
//   dφ/dr = −a sqrt(2r) / (Δ sqrt(r² + a²))                  (frame dragging, Δ = r² − 2r + a²)
//
// Fall time (proper time = Doran / Painlevé time) from r down to the horizon:
//   F(r, θ) = I1(r) + a² cos²θ · I0(r),
//   I1 = ∫_{r+}^{r} r'² / sqrt(2r'(r'² + a²)) dr',   I0 = ∫_{r+}^{r} 1 / sqrt(2r'(r'² + a²)) dr'
//
// Picture: Kerr–Schild Cartesian coordinates, x + i z' = (r + i a) e^{iφ̃} sinθ, y = r cosθ
// (horizon-regular, flat far away). In it a faller keeps θ and turns prograde by
//   dΦ/dr = −(a / (r² + a²)) · x / (1 + x),   x = sqrt(2r / (r² + a²))
// so the total twist from r to infinity is G(r) = ∫_r^∞ (a/(r'²+a²)) x/(1+x) dr'  (finite at r+).
// Far away G → (2/3) a √2 r^{-3/2}, the weak-field Lense–Thirring result.
// Note: the amount of twist depends on the time slicing; in Doran coordinates the fallers do not
// turn at all and frame dragging lives only in the rotation of local frames.

export const RIVER_N = 2048;
export const RIVER_RMAX = 600;

export interface RiverTable {
  a: number;
  rH: number;
  rMax: number;
  n: number;
  /** RGBA per sample: I1, I0, G, 0 */
  data: Float32Array;
  r: Float64Array;
  I1: Float64Array;
  I0: Float64Array;
  G: Float64Array;
}

export function riverRadius(i: number, rH: number, n = RIVER_N, rMax = RIVER_RMAX): number {
  const x = i / (n - 1);
  return rH + (rMax - rH) * x * x;
}

export function buildRiverTable(chi: number, n = RIVER_N, rMax = RIVER_RMAX): RiverTable {
  const a = Math.min(Math.max(chi, 1e-3), 0.9995);
  const a2 = a * a;
  const rH = 1 + Math.sqrt(1 - a2);
  const f1 = (r: number) => (r * r) / Math.sqrt(2 * r * (r * r + a2));
  const f0 = (r: number) => 1 / Math.sqrt(2 * r * (r * r + a2));
  const g = (r: number) => {
    const x = Math.sqrt((2 * r) / (r * r + a2));
    return (a / (r * r + a2)) * (x / (1 + x));
  };
  const simpson = (f: (r: number) => number, lo: number, hi: number) => ((hi - lo) / 6) * (f(lo) + 4 * f(0.5 * (lo + hi)) + f(hi));

  const r = new Float64Array(n), I1 = new Float64Array(n), I0 = new Float64Array(n), G = new Float64Array(n);
  for (let i = 0; i < n; i++) r[i] = riverRadius(i, rH, n, rMax);
  for (let i = 1; i < n; i++) {
    I1[i] = I1[i - 1] + simpson(f1, r[i - 1], r[i]);
    I0[i] = I0[i - 1] + simpson(f0, r[i - 1], r[i]);
  }
  // tail beyond rMax (x ≪ 1): ∫ a √2 r^{-5/2} (1 − √(2/r)) dr
  G[n - 1] = a * Math.SQRT2 * ((2 / 3) * Math.pow(rMax, -1.5) - Math.SQRT2 * 0.5 * Math.pow(rMax, -2));
  for (let i = n - 2; i >= 0; i--) G[i] = G[i + 1] + simpson(g, r[i], r[i + 1]);

  const data = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) {
    data[4 * i] = I1[i];
    data[4 * i + 1] = I0[i];
    data[4 * i + 2] = G[i];
  }
  return { a, rH, rMax, n, data, r, I1, I0, G };
}

function lookup(t: RiverTable, arr: Float64Array, r: number): number {
  const x = Math.min(Math.max((r - t.rH) / (t.rMax - t.rH), 0), 1);
  const f = Math.sqrt(x) * (t.n - 1);
  const i0 = Math.floor(f);
  const i1 = Math.min(i0 + 1, t.n - 1);
  return arr[i0] + (arr[i1] - arr[i0]) * (f - i0);
}

export function fallTime(t: RiverTable, r: number, cos2: number): number {
  return lookup(t, t.I1, r) + t.a * t.a * cos2 * lookup(t, t.I0, r);
}

export function twistFromInfinity(t: RiverTable, r: number): number {
  return lookup(t, t.G, r);
}

/** radius reached when the remaining fall time is F (same Newton scheme as the shader) */
export function radiusAtFallTime(t: RiverTable, F: number, cos2: number): number {
  const a2 = t.a * t.a;
  const Fs = ((2 / 3) * Math.pow(t.rH, 1.5)) / Math.SQRT2;
  let r = Math.max(Math.pow(1.5 * Math.SQRT2 * (F + Fs), 2 / 3), t.rH);
  for (let i = 0; i < 4; i++) {
    const gF = fallTime(t, r, cos2) - F;
    const d = (r * r + a2 * cos2) / Math.sqrt(2 * r * (r * r + a2));
    r = Math.max(r - gF / d, t.rH);
  }
  return r;
}

/** angular velocity of the zero-angular-momentum frames seen from far away, ω = 2ar / Σ² */
export function zamoOmega(a: number, r: number, cosTheta: number): number {
  const a2 = a * a;
  const delta = r * r - 2 * r + a2;
  const s2 = 1 - cosTheta * cosTheta;
  return (2 * a * r) / ((r * r + a2) ** 2 - a2 * delta * s2);
}
