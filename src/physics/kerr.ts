// Kerr black hole characteristic radii in geometric units (G = c = 1).
// M: mass, chi: dimensionless spin a/M in [0, 1).

export interface KerrRadii {
  /** outer event horizon r+ */
  horizon: number;
  /** inner (Cauchy) horizon r- */
  innerHorizon: number;
  /** equatorial ergosphere radius (= 2M) */
  ergoEquator: number;
  /** ISCO for prograde / retrograde equatorial orbits (Bardeen, Press & Teukolsky 1972) */
  iscoPro: number;
  iscoRetro: number;
  /** circular photon orbits in the equatorial plane */
  photonPro: number;
  photonRetro: number;
  /** marginally bound circular orbits */
  mbPro: number;
  mbRetro: number;
  /** critical impact parameter used for the shadow size (Schwarzschild value 3√3 M) */
  shadowB: number;
}

export function kerrRadii(M: number, chi: number): KerrRadii {
  const c = Math.min(Math.max(chi, 0), 0.9999);
  const a = c * M;
  const s = Math.sqrt(1 - c * c);
  const z1 = 1 + Math.cbrt(1 - c * c) * (Math.cbrt(1 + c) + Math.cbrt(1 - c));
  const z2 = Math.sqrt(3 * c * c + z1 * z1);
  const root = Math.sqrt((3 - z1) * (3 + z1 + 2 * z2));
  return {
    horizon: M * (1 + s),
    innerHorizon: M * (1 - s),
    ergoEquator: 2 * M,
    iscoPro: M * (3 + z2 - root),
    iscoRetro: M * (3 + z2 + root),
    photonPro: 2 * M * (1 + Math.cos((2 / 3) * Math.acos(-c))),
    photonRetro: 2 * M * (1 + Math.cos((2 / 3) * Math.acos(c))),
    mbPro: 2 * M - a + 2 * Math.sqrt(M * (M - a)),
    mbRetro: 2 * M + a + 2 * Math.sqrt(M * (M + a)),
    // The Kerr shadow is slightly flattened and shifted; its mean radius stays within
    // a few percent of 3√3 M, so we use that.
    shadowB: 3 * Math.sqrt(3) * M,
  };
}

/** Ergosphere boundary r_E(θ) = M + sqrt(M² − a² cos²θ); cosTheta measured from the spin axis. */
export function ergoRadius(M: number, chi: number, cosTheta: number): number {
  const a = chi * M;
  return M + Math.sqrt(Math.max(M * M - a * a * cosTheta * cosTheta, 0));
}

/** Angular velocity of frame dragging for a zero-angular-momentum observer in the equatorial plane. */
export function frameDragOmega(M: number, chi: number, r: number): number {
  const a = chi * M;
  return (2 * M * a * r) / (r * r * r + a * a * r + 2 * M * a * a);
}

/** Orbital period (coordinate time) of a prograde equatorial circular orbit. */
export function circularPeriod(M: number, chi: number, r: number): number {
  const a = chi * M;
  return 2 * Math.PI * (Math.pow(r, 1.5) + a * Math.sqrt(M)) / Math.sqrt(M);
}

/** Gravitational time dilation dτ/dt of a static observer (Schwarzschild, outside the horizon). */
export function staticLapse(M: number, r: number): number {
  return Math.sqrt(Math.max(1 - (2 * M) / r, 0));
}
