// Particle / planet dynamics around a (pseudo-)Kerr black hole.
//
// Units: G = c = 1, initial mass M0 = 1. Spin axis = +Y.
//
// Gravity model
//  • radial force from the Artemova–Björnsson–Novikov (1996) pseudo-Newtonian potential
//      F(r) = M / ( r^(2−β) (r − r+)^β ),  β = r_isco/r+ − 1
//    which reduces to Paczyński–Wiita for a = 0 and reproduces the prograde Kerr ISCO
//    and the horizon singularity at r+.
//  • optional weak-field gravitomagnetic (Lense–Thirring) acceleration
//      a_gm = 2 v × [ J − 3 (J·r̂) r̂ ] / r³,  J = a M ŷ
//    which gives prograde/retrograde asymmetry and nodal precession of tilted orbits.
//
// Tidal physics
//  • every planet has a tidal radius r_t = R (M/m)^{1/3};  χ = (r_t / r)³
//  • χ > 0.5 : mass shedding through the inner/outer Lagrange points
//  • χ ≥ 1   : full disruption into test-particle fragments that keep the planet's
//              velocity field (rigid rotation, tidally locked) — the stream then
//              stretches by itself under differential gravity (spaghettification)
//
// Disk formation
//  • a fragment that has passed pericenter once enters "disk mode": its velocity is
//    relaxed toward a circular orbit in the mean debris plane at rate viscosity × Ω,
//    plus a small radial inflow (α-disk–like). Inside the ISCO no support → plunge.

import { kerrRadii, type KerrRadii } from './kerr';
import { params, type PlanetKind } from '../params';

export const MAX_PARTICLES = 80000;

export interface Planet {
  id: number;
  /** short tag shown after the localized kind name, e.g. 'A' or '#4' */
  tag: string;
  kind: PlanetKind;
  pos: [number, number, number];
  vel: [number, number, number];
  /** original radius */
  R0: number;
  /** original mass (absolute, in units of M0) */
  m0: number;
  /** remaining mass fraction */
  frac: number;
  /** tidal parameter χ = (r_t / r)³ */
  chi: number;
  /** radial stretch factor used for rendering */
  stretch: number;
  shedAccum: number;
  alive: boolean;
  status: PlanetStatus;
  color: [number, number, number];
  color2: [number, number, number];
  /** fragment budget for a full disruption */
  fragmentBudget: number;
}

export type PlanetStatus = 'orbit' | 'shedding' | 'partial';

/** language-neutral event: key into the i18n dictionary + variables */
export interface SimEvent {
  key: 'ev.swallowed' | 'ev.escaped' | 'ev.shedding' | 'ev.disrupted' | 'ev.added' | 'ev.custom';
  planet?: Planet;
  vars?: Record<string, string | number>;
}

const FLAG_RDOT_NEG = 1;
const FLAG_DISK = 2;

const PLANET_COLORS: Record<PlanetKind, { c1: [number, number, number]; c2: [number, number, number] }> = {
  rocky: { c1: [0.55, 0.42, 0.32], c2: [0.3, 0.33, 0.38] },
  gas: { c1: [0.85, 0.7, 0.48], c2: [0.62, 0.38, 0.25] },
  ice: { c1: [0.7, 0.85, 0.95], c2: [0.35, 0.55, 0.75] },
  lava: { c1: [0.25, 0.12, 0.1], c2: [1.0, 0.45, 0.12] },
};

export class BlackHoleSim {
  M = 1;
  time = 0;
  absorbedMass = 0;
  radii: KerrRadii = kerrRadii(1, params.spin);

  planets: Planet[] = [];
  private nextId = 1;

  count = 0;
  readonly pos = new Float32Array(MAX_PARTICLES * 3);
  readonly vel = new Float32Array(MAX_PARTICLES * 3);
  readonly col = new Float32Array(MAX_PARTICLES * 3);
  readonly heat = new Float32Array(MAX_PARTICLES);
  readonly mass = new Float32Array(MAX_PARTICLES);
  readonly flags = new Uint8Array(MAX_PARTICLES);

  /** unit normal of the mean debris disk plane */
  diskNormal: [number, number, number] = [0, 1, 0];
  diskParticles = 0;
  /** sim-time-averaged accretion rate (mass per GM/c³) */
  accretionRate = 0;
  lastSubsteps = 0;
  /** particles that hit the per-frame substep budget (time scale too high for them) */
  laggedParticles = 0;

  onEvent: (e: SimEvent) => void = () => {};

  // cached per-step constants
  private rH = 2;
  private rIn = 6;
  private beta = 2;
  private Jy = 0;

  constructor() {
    this.updateConstants();
  }

  reset() {
    this.M = 1;
    this.time = 0;
    this.absorbedMass = 0;
    this.accretionRate = 0;
    this.planets = [];
    this.count = 0;
    this.nextId = 1;
    this.updateConstants();
  }

  updateConstants() {
    this.radii = kerrRadii(this.M, params.spin);
    this.rH = this.radii.horizon;
    this.rIn = this.radii.iscoPro;
    this.beta = this.rIn / this.rH - 1;
    this.Jy = params.gravitomagnetic ? params.spin * this.M * this.M : 0;
  }

  /** radial force magnitude F(r) (pointing inward) */
  force(r: number): number {
    const d = r - this.rH;
    return this.M / (Math.pow(r, 2 - this.beta) * Math.pow(d, this.beta));
  }

  /** circular orbital speed in the pseudo-potential */
  circularSpeed(r: number): number {
    return Math.sqrt(r * this.force(r));
  }

  tidalRadius(p: Planet): number {
    return p.R0 * Math.cbrt(this.M / p.m0);
  }

  // ───────────────────────────────────────────── planets

  addPlanet(opts: {
    tag?: string;
    kind: PlanetKind;
    radius: number;
    massExp: number;
    pericenter: number;
    eccentricity: number;
    inclinationDeg: number;
    retrograde?: boolean;
    startRadius?: number;
    phaseDeg?: number;
  }): Planet {
    const M = this.M;
    const rp = Math.max(opts.pericenter, this.rH * 1.5);
    const e = Math.min(Math.max(opts.eccentricity, 0), 0.995);
    // Newtonian initial conditions (good far from the hole, which is where we start)
    const a = rp / (1 - e);
    const ra = rp * (1 + e) / (1 - e);
    const r0 = e < 1e-3 ? rp : Math.min(opts.startRadius ?? Math.min(ra, 110), ra);
    const h = Math.sqrt(M * a * (1 - e * e));
    let v2 = M * (2 / r0 - 1 / a);
    if (e < 1e-3) v2 = this.circularSpeed(r0) ** 2; // exact circular speed in the pseudo-potential
    const vt = e < 1e-3 ? Math.sqrt(v2) : h / r0;
    const vr = -Math.sqrt(Math.max(v2 - vt * vt, 0)); // inbound

    // in-plane frame: orbit in x–z plane, normal +Y (prograde), then tilt about X
    const phase = ((opts.phaseDeg ?? Math.random() * 360) * Math.PI) / 180;
    const rx = Math.cos(phase), rz = Math.sin(phase);
    // prograde tangential direction t = ŷ × r̂ ... with L = r × v ∥ +Y  ⇒ t = (rz, 0, −rx)
    const sgn = opts.retrograde ? -1 : 1;
    const tx = sgn * rz, tz = sgn * -rx;
    const p: [number, number, number] = [rx * r0, 0, rz * r0];
    const v: [number, number, number] = [rx * vr + tx * vt, 0, rz * vr + tz * vt];
    const inc = (opts.inclinationDeg * Math.PI) / 180;
    const ci = Math.cos(inc), si = Math.sin(inc);
    const rot = (q: [number, number, number]): [number, number, number] => [q[0], q[1] * ci - q[2] * si, q[1] * si + q[2] * ci];

    const kind = opts.kind;
    const c = PLANET_COLORS[kind];
    const id = this.nextId++;
    const planet: Planet = {
      id,
      tag: opts.tag ?? `#${id}`,
      kind,
      pos: rot(p),
      vel: rot(v),
      R0: opts.radius,
      m0: Math.pow(10, opts.massExp) * M,
      frac: 1,
      chi: 0,
      stretch: 1,
      shedAccum: 0,
      alive: true,
      status: 'orbit',
      color: c.c1,
      color2: c.c2,
      fragmentBudget: params.fragments,
    };
    this.planets.push(planet);
    return planet;
  }

  addDefaultScene() {
    this.addPlanet({ tag: 'A', kind: 'rocky', radius: 0.8, massExp: -4, pericenter: 8.5, eccentricity: 0.8, inclinationDeg: 12, startRadius: 70, phaseDeg: 200 });
    this.addPlanet({ tag: 'B', kind: 'gas', radius: 1.6, massExp: -3, pericenter: 42, eccentricity: 0, inclinationDeg: 25, phaseDeg: 40 });
    this.addPlanet({ tag: 'C', kind: 'ice', radius: 0.6, massExp: -5, pericenter: 75, eccentricity: 0.1, inclinationDeg: 160, phaseDeg: 300 });
  }

  clearDebris() {
    this.count = 0;
    this.diskParticles = 0;
  }

  /** seed an already-existing thin disk */
  seedDisk(n: number) {
    const rin = this.rIn * 1.05;
    const rout = 32;
    for (let k = 0; k < n && this.count < MAX_PARTICLES; k++) {
      const r = rin + (rout - rin) * Math.pow(Math.random(), 1.4);
      const ph = Math.random() * Math.PI * 2;
      const y = (Math.random() - 0.5) * 0.04 * r;
      const g = this.Jy / (r * r);
      const vc = -g + Math.sqrt(g * g + r * this.force(r));
      const i = this.count++;
      const x = Math.cos(ph) * r, z = Math.sin(ph) * r;
      this.pos.set([x, y, z], i * 3);
      this.vel.set([vc * Math.sin(ph), 0, -vc * Math.cos(ph)], i * 3);
      this.col.set([1.0, 0.6, 0.3], i * 3);
      this.heat[i] = 1;
      this.mass[i] = 1e-7;
      this.flags[i] = FLAG_DISK;
    }
  }

  // ───────────────────────────────────────────── integration

  step(dt: number) {
    if (dt <= 0) return;
    this.updateConstants();
    const massBefore = this.absorbedMass;
    this.stepPlanets(dt);
    this.computeDiskNormal();
    this.stepParticles(dt);
    this.time += dt;
    const rate = (this.absorbedMass - massBefore) / dt;
    const k = Math.min(1, dt / 200);
    this.accretionRate += (rate - this.accretionRate) * k;
  }

  private accel(x: number, y: number, z: number, vx: number, vy: number, vz: number, out: Float64Array) {
    const r2 = x * x + y * y + z * z;
    const r = Math.sqrt(r2);
    const f = this.force(r) / r;
    let ax = -f * x, ay = -f * y, az = -f * z;
    const J = this.Jy;
    if (J !== 0) {
      // B = (J − 3 (J·r̂) r̂) / r³ with J = (0, J, 0)
      const inv3 = 1 / (r2 * r);
      const jr = (J * y) / r;
      const bx = (-3 * jr * x / r) * inv3;
      const by = (J - (3 * jr * y) / r) * inv3;
      const bz = (-3 * jr * z / r) * inv3;
      ax += 2 * (vy * bz - vz * by);
      ay += 2 * (vz * bx - vx * bz);
      az += 2 * (vx * by - vy * bx);
    }
    out[0] = ax; out[1] = ay; out[2] = az;
  }

  private tmpA = new Float64Array(3);

  private stepPlanets(dt: number) {
    const a = this.tmpA;
    for (const p of this.planets) {
      if (!p.alive) continue;
      let t = 0;
      let guard = 0;
      while (t < dt && guard++ < 4000 && p.alive) {
        const [x, y, z] = p.pos;
        const r = Math.hypot(x, y, z);
        const hmax = 0.01 * Math.sqrt((r * r * r) / this.M) * Math.min(1, (3 * (r - this.rH)) / r);
        const h = Math.min(dt - t, Math.max(hmax, 1e-4));
        // KDK leapfrog
        this.accel(x, y, z, p.vel[0], p.vel[1], p.vel[2], a);
        p.vel[0] += a[0] * h * 0.5; p.vel[1] += a[1] * h * 0.5; p.vel[2] += a[2] * h * 0.5;
        p.pos[0] += p.vel[0] * h; p.pos[1] += p.vel[1] * h; p.pos[2] += p.vel[2] * h;
        this.accel(p.pos[0], p.pos[1], p.pos[2], p.vel[0], p.vel[1], p.vel[2], a);
        p.vel[0] += a[0] * h * 0.5; p.vel[1] += a[1] * h * 0.5; p.vel[2] += a[2] * h * 0.5;
        t += h;
        this.planetTides(p, h);
      }
    }
    this.planets = this.planets.filter((p) => p.alive);
  }

  private planetTides(p: Planet, h: number) {
    const [x, y, z] = p.pos;
    const r = Math.hypot(x, y, z);
    if (r < this.rH * 1.05 + p.R0 * Math.cbrt(p.frac) * 0.5) {
      p.alive = false;
      this.absorb(p.m0 * p.frac);
      this.onEvent({ key: 'ev.swallowed', planet: p });
      return;
    }
    if (r > 5000) {
      p.alive = false;
      this.onEvent({ key: 'ev.escaped', planet: p });
      return;
    }
    const rt = this.tidalRadius(p);
    p.chi = Math.pow(rt / r, 3);
    p.stretch = 1 + 0.9 * Math.min(p.chi, 1.2);

    if (p.chi >= 1 || p.frac < 0.04) {
      this.disrupt(p);
      return;
    }
    if (p.chi > 0.5) {
      if (p.status === 'orbit') {
        p.status = 'shedding';
        this.onEvent({ key: 'ev.shedding', planet: p, vars: { r: r.toFixed(1) } });
      }
      const omega = Math.sqrt(this.M / (r * r * r));
      const df = Math.min(p.frac, 0.25 * (p.chi - 0.5) * omega * h);
      p.frac -= df;
      p.shedAccum += df * p.fragmentBudget;
      const n = Math.floor(p.shedAccum);
      if (n > 0) {
        p.shedAccum -= n;
        this.emitFromPlanet(p, n, 'lagrange');
      }
    } else if (p.status === 'shedding') {
      p.status = 'partial';
    }
  }

  private disrupt(p: Planet) {
    const n = Math.round(p.fragmentBudget * p.frac);
    const r = Math.hypot(...p.pos);
    this.emitFromPlanet(p, n, 'volume');
    p.alive = false;
    this.onEvent({ key: 'ev.disrupted', planet: p, vars: { r: r.toFixed(1), rt: this.tidalRadius(p).toFixed(1), n } });
  }

  private emitFromPlanet(p: Planet, n: number, mode: 'lagrange' | 'volume') {
    const [px, py, pz] = p.pos;
    const [vx, vy, vz] = p.vel;
    const r = Math.hypot(px, py, pz);
    const ux = px / r, uy = py / r, uz = pz / r;
    // orbital angular velocity vector (tidally locked spin)
    const wx = (py * vz - pz * vy) / (r * r);
    const wy = (pz * vx - px * vz) / (r * r);
    const wz = (px * vy - py * vx) / (r * r);
    const R = p.R0 * Math.cbrt(Math.max(p.frac, 0.02));
    const mEach = (p.m0 / p.fragmentBudget);
    for (let k = 0; k < n && this.count < MAX_PARTICLES; k++) {
      let ox: number, oy: number, oz: number;
      if (mode === 'volume') {
        // uniform in a sphere
        do {
          ox = Math.random() * 2 - 1; oy = Math.random() * 2 - 1; oz = Math.random() * 2 - 1;
        } while (ox * ox + oy * oy + oz * oz > 1);
        ox *= R; oy *= R; oz *= R;
      } else {
        // inner (L1) or outer (L2) point with a small spread
        const side = Math.random() < 0.5 ? -1 : 1;
        ox = ux * R * side + (Math.random() - 0.5) * 0.4 * R;
        oy = uy * R * side + (Math.random() - 0.5) * 0.4 * R;
        oz = uz * R * side + (Math.random() - 0.5) * 0.4 * R;
      }
      const i = this.count++;
      const i3 = i * 3;
      this.pos[i3] = px + ox; this.pos[i3 + 1] = py + oy; this.pos[i3 + 2] = pz + oz;
      this.vel[i3] = vx + (wy * oz - wz * oy);
      this.vel[i3 + 1] = vy + (wz * ox - wx * oz);
      this.vel[i3 + 2] = vz + (wx * oy - wy * ox);
      const t = Math.random();
      this.col[i3] = p.color[0] * (1 - t) + p.color2[0] * t;
      this.col[i3 + 1] = p.color[1] * (1 - t) + p.color2[1] * t;
      this.col[i3 + 2] = p.color[2] * (1 - t) + p.color2[2] * t;
      this.heat[i] = 0;
      this.mass[i] = mEach;
      const rdot = (this.pos[i3] * this.vel[i3] + this.pos[i3 + 1] * this.vel[i3 + 1] + this.pos[i3 + 2] * this.vel[i3 + 2]);
      this.flags[i] = rdot < 0 ? FLAG_RDOT_NEG : 0;
    }
  }

  private computeDiskNormal() {
    let lx = 0, ly = 0, lz = 0, nDisk = 0;
    const P = this.pos, V = this.vel;
    for (let i = 0; i < this.count; i++) {
      if (!(this.flags[i] & FLAG_DISK)) continue;
      const i3 = i * 3;
      const x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      const vx = V[i3], vy = V[i3 + 1], vz = V[i3 + 2];
      lx += y * vz - z * vy; ly += z * vx - x * vz; lz += x * vy - y * vx;
      nDisk++;
    }
    this.diskParticles = nDisk;
    // before any disk exists, use the angular momentum of all debris
    if (nDisk < 50) {
      lx = ly = lz = 0;
      for (let i = 0; i < this.count; i++) {
        const i3 = i * 3;
        const x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
        const vx = V[i3], vy = V[i3 + 1], vz = V[i3 + 2];
        lx += y * vz - z * vy; ly += z * vx - x * vz; lz += x * vy - y * vx;
      }
    }
    const l = Math.hypot(lx, ly, lz);
    if (l > 1e-9) this.diskNormal = [lx / l, ly / l, lz / l];
  }

  private stepParticles(dt: number) {
    const P = this.pos, V = this.vel;
    const a = this.tmpA;
    const M = this.M;
    const rH = this.rH;
    const rAbs = rH * 1.02;
    const rIn = this.rIn;
    const [nx, ny, nz] = this.diskNormal;
    const visc = params.viscosity;
    const inflow = params.inflow;
    let totalSub = 0;
    this.laggedParticles = 0;

    let i = 0;
    while (i < this.count) {
      const i3 = i * 3;
      let x = P[i3], y = P[i3 + 1], z = P[i3 + 2];
      let vx = V[i3], vy = V[i3 + 1], vz = V[i3 + 2];
      let flags = this.flags[i];
      let heat = this.heat[i];
      let t = 0;
      let removed: 'absorb' | 'escape' | null = null;
      let guard = 0;
      while (t < dt) {
        const r = Math.sqrt(x * x + y * y + z * z);
        if (r < rAbs) { removed = 'absorb'; break; }
        if (r > 4000) { removed = 'escape'; break; }
        const hmax = 0.03 * Math.sqrt((r * r * r) / M) * Math.min(1, (3 * (r - rH)) / r);
        // substep budget exhausted: let this particle lag behind instead of taking an unstable step
        if (++guard > 400) { this.laggedParticles++; break; }
        const h = Math.min(Math.max(hmax, 2e-4), dt - t);

        this.accel(x, y, z, vx, vy, vz, a);
        vx += a[0] * h * 0.5; vy += a[1] * h * 0.5; vz += a[2] * h * 0.5;
        x += vx * h; y += vy * h; z += vz * h;
        this.accel(x, y, z, vx, vy, vz, a);
        vx += a[0] * h * 0.5; vy += a[1] * h * 0.5; vz += a[2] * h * 0.5;
        t += h;

        // pericenter passage detection → disk mode
        const rdot = x * vx + y * vy + z * vz;
        if (rdot < 0) flags |= FLAG_RDOT_NEG;
        else if (flags & FLAG_RDOT_NEG) {
          flags &= ~FLAG_RDOT_NEG;
          flags |= FLAG_DISK;
        }

        if ((flags & FLAG_DISK) && visc > 0) {
          // project onto the disk plane
          const zc = x * nx + y * ny + z * nz;
          const qx = x - zc * nx, qy = y - zc * ny, qz = z - zc * nz;
          const rho = Math.sqrt(qx * qx + qy * qy + qz * qz);
          if (rho > rIn) {
            // circular speed including the gravitomagnetic radial term for this disk orientation:
            // v²/r = F − 2 v J_n / r³  ⇒  v = −J_n/r² + sqrt(J_n²/r⁴ + rF)
            const Jn = this.Jy * ny;
            const g = Jn / (rho * rho);
            const vc = -g + Math.sqrt(g * g + rho * this.force(rho));
            const omega = vc / rho;
            // tangential unit vector n × q̂
            const tx = (ny * qz - nz * qy) / rho, ty = (nz * qx - nx * qz) / rho, tz = (nx * qy - ny * qx) / rho;
            const vin = inflow * vc;
            // inflow needs a torque: a sub-circular tangential target removes angular momentum
            // at the rate that yields drift speed vin (dL/dr = L/2r for Keplerian orbits)
            const vphi = vc * Math.max(0.5, 1 - inflow / (2 * visc));
            const tgx = vphi * tx - vin * qx / rho;
            const tgy = vphi * ty - vin * qy / rho;
            const tgz = vphi * tz - vin * qz / rho;
            const k = 1 - Math.exp(-visc * omega * h);
            const dvx = (tgx - vx) * k, dvy = (tgy - vy) * k, dvz = (tgz - vz) * k;
            vx += dvx; vy += dvy; vz += dvz;
            // dissipated kinetic energy heats the gas (visual)
            heat = Math.min(1, heat + (dvx * dvx + dvy * dvy + dvz * dvz) * 40 + visc * omega * h * 0.15);
          }
        }
      }
      totalSub += guard;

      if (removed) {
        if (removed === 'absorb') this.absorb(this.mass[i]);
        // swap-remove
        const last = --this.count;
        if (i !== last) {
          const l3 = last * 3;
          P[i3] = P[l3]; P[i3 + 1] = P[l3 + 1]; P[i3 + 2] = P[l3 + 2];
          V[i3] = V[l3]; V[i3 + 1] = V[l3 + 1]; V[i3 + 2] = V[l3 + 2];
          this.col[i3] = this.col[l3]; this.col[i3 + 1] = this.col[l3 + 1]; this.col[i3 + 2] = this.col[l3 + 2];
          this.heat[i] = this.heat[last];
          this.mass[i] = this.mass[last];
          this.flags[i] = this.flags[last];
        }
        continue; // re-process the swapped-in particle at index i
      }
      P[i3] = x; P[i3 + 1] = y; P[i3 + 2] = z;
      V[i3] = vx; V[i3 + 1] = vy; V[i3 + 2] = vz;
      this.flags[i] = flags;
      this.heat[i] = heat;
      i++;
    }
    this.lastSubsteps = totalSub;
  }

  private absorb(m: number) {
    this.absorbedMass += m;
    if (params.accretionGrowth) this.M += m;
  }
}
