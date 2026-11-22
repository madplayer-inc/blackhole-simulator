import { t } from '../i18n';

// Conversions between geometric simulation units and physical (SI-ish) units.
// One length unit = GM/c², one time unit = GM/c³, for the *initial* mass M0 = 1.

export const KM_PER_MSUN = 1.476625; // GM☉/c² in km
export const SEC_PER_MSUN = 4.925491e-6; // GM☉/c³ in s
export const GRAM_PER_MSUN = 1.98847e33;
export const CM_PER_KM = 1e5;
export const R_SUN_KM = 695700;

/** ħc³/(G M☉ k_B) in kelvin: T_H(Schwarzschild) = this / (8π M/M☉) */
const HAWKING_COEF_K = 1.5505e-6;
/** S/k_B of a 1 M☉ Schwarzschild hole */
const ENTROPY_MSUN = 1.0494e77;
/** Hawking evaporation time of a 1 M☉ Schwarzschild hole (photons + gravitons, Page 1976 order) in years */
const EVAP_YEARS_MSUN = 2.1e67;

export function hawkingTemperatureK(massSolar: number, chi: number): number {
  const s = Math.sqrt(1 - chi * chi);
  return (HAWKING_COEF_K / massSolar) * (s / (4 * Math.PI * (1 + s)));
}

export function entropyKb(massSolar: number, chi: number): number {
  // A_Kerr / A_Schw = r+ / 2M
  const rPlusOver2M = (1 + Math.sqrt(1 - chi * chi)) / 2;
  return ENTROPY_MSUN * massSolar * massSolar * rPlusOver2M;
}

export function evaporationYears(massSolar: number): number {
  return EVAP_YEARS_MSUN * massSolar ** 3;
}

/**
 * Tidal disruption radius r_t = R (M/m)^{1/3} = (3M / 4πρ)^{1/3}, returned in units of GM/c².
 * densityGcc in g/cm³.
 */
export function tidalRadiusInM(massSolar: number, densityGcc: number): number {
  const Mg = massSolar * GRAM_PER_MSUN;
  const rtCm = Math.cbrt((3 * Mg) / (4 * Math.PI * densityGcc));
  const rgCm = massSolar * KM_PER_MSUN * CM_PER_KM;
  return rtCm / rgCm;
}

export function formatSeconds(s: number): string {
  const a = Math.abs(s);
  if (a === 0) return '0 s';
  if (a < 1e-6) return `${(s * 1e9).toPrecision(3)} ns`;
  if (a < 1e-3) return `${(s * 1e6).toPrecision(3)} µs`;
  if (a < 1) return `${(s * 1e3).toPrecision(3)} ms`;
  if (a < 120) return `${s.toPrecision(3)} s`;
  if (a < 7200) return `${(s / 60).toPrecision(3)} ${t('unit.min')}`;
  if (a < 172800) return `${(s / 3600).toPrecision(3)} ${t('unit.hour')}`;
  if (a < 3.156e7 * 2) return `${(s / 86400).toPrecision(3)} ${t('unit.day')}`;
  return `${fmtNum(s / 3.156e7)} ${t('unit.year')}`;
}

export function formatKm(km: number): string {
  const a = Math.abs(km);
  if (a < 1) return `${(km * 1000).toPrecision(3)} m`;
  if (a < 1e6) return `${km.toPrecision(3)} km`;
  const au = km / 1.495979e8;
  if (au < 1e4) return `${fmtNum(km)} km (${au.toPrecision(3)} AU)`;
  return `${fmtNum(km)} km (${fmtNum(km / 9.4607e12)} ${t('unit.ly')})`;
}

export function fmtNum(x: number, digits = 3): string {
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e-3 && a < 1e5) return x.toPrecision(digits);
  return x.toExponential(digits - 1).replace('e+', 'e');
}
