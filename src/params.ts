// All user-adjustable variables live here; the panel binds to this object.

export const params = {
  // ── 시간
  /** time scale exponent: 1 real second = 10^timeExp GM/c³ */
  timeExp: 2.0,
  paused: false,

  // ── 블랙홀
  /** dimensionless spin a/M */
  spin: 0.6,
  /** log10 of the physical mass in solar masses (only affects unit conversion and readouts) */
  massExp: 6.63,
  /** absorbed debris adds to the hole's mass */
  accretionGrowth: true,
  /** gravitomagnetic (Lense–Thirring) term in the equations of motion */
  gravitomagnetic: true,

  // ── 강착 원반 (파편 역학)
  /** effective viscosity: damping rate toward circular orbits = viscosity × Ω */
  viscosity: 0.1,
  /** radial inflow speed as a fraction of the circular speed */
  inflow: 0.012,
  /** debris particles produced by a full disruption */
  fragments: 5000,
  /** disk temperature scale (visual) */
  diskTemp: 1.0,
  particleSize: 1.0,

  // ── 시공간 격자
  grid: true,
  gridMode: 'sphere' as 'sphere' | '3d' | 'equator',
  gridDivisions: 10,
  gridExtent: 60,
  /** sphere mode: number of flowing shells */
  shellCount: 12,
  /** cartesian modes: a fresh grid of fallers is released every this many GM/c³ */
  releasePeriod: 60,
  /** flow playback: 1 real second = 10^flowSpeedExp GM/c³ (unless synced to the main clock) */
  flowSpeedExp: 1.3,
  flowSync: false,
  /** frame-dragging twist gain (1 = exact Kerr value) */
  twist: 1,
  gridOpacity: 0.28,
  pulses: true,
  pulsePeriod: 25,

  tracers: true,
  tracerCount: 2000,

  // ── 시각 효과
  lensing: true,
  secondaryImages: true,
  doppler: true,
  bloom: true,
  bloomStrength: 0.9,
  rings: true,
  ergosphere: false,
  stars: true,
  /** glass dock with gravitational-lens hover effect (post-processing) */
  glass: true,
  autoRotate: false,

  // ── 광자 껍질 · 그림자
  /** exact Kerr shadow outline (Bardeen critical curve) instead of the 3√3 M circle */
  kerrShadow: true,
  photonShell: true,
  shellOpacity: 0.035,
  photonOrbits: true,
  photonCount: 9,
  /** photon playback: 1 real second = 10^photonSpeedExp GM/c³ (separate from the main clock) */
  photonSpeedExp: 1.0,
  /** trail length in GM/c³ */
  photonTrail: 40,

  // ── 새 행성 투입
  newPlanet: {
    kind: 'rocky' as PlanetKind,
    radius: 0.8,
    /** log10(m / M) */
    massExp: -4,
    pericenter: 9,
    eccentricity: 0.85,
    inclination: 15,
    retrograde: false,
  },
};

export type PlanetKind = 'rocky' | 'gas' | 'ice' | 'lava';

export type Params = typeof params;
