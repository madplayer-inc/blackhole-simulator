import { Pane } from 'tweakpane';
import { params, type PlanetKind } from '../params';
import { t } from '../i18n';

export interface Readouts {
  timeScale: string;
  simTime: string;
  massSolar: string;
  rs: string;
  horizon: string;
  isco: string;
  photon: string;
  iscoPeriod: string;
  hawkingT: string;
  evaporation: string;
  entropy: string;
  timeUnit: string;
  rtEarth: string;
  rtSun: string;
  planets: string;
  particles: string;
  accretion: string;
  newPlanetRt: string;
  perf: string;
  inclination: string;
  shadowSize: string;
  shadowShift: string;
  shellRange: string;
  flowInfo: string;
}

export const readouts: Readouts = {
  timeScale: '',
  simTime: '',
  massSolar: '',
  rs: '',
  horizon: '',
  isco: '',
  photon: '',
  iscoPeriod: '',
  hawkingT: '',
  evaporation: '',
  entropy: '',
  timeUnit: '',
  rtEarth: '',
  rtSun: '',
  planets: '',
  particles: '',
  accretion: '',
  newPlanetRt: '',
  perf: '',
  inclination: '',
  shadowSize: '',
  shadowShift: '',
  shellRange: '',
  flowInfo: '',
};

export interface PanelActions {
  reset(): void;
  addPlanet(): void;
  defaultPlanets(): void;
  clearPlanets(): void;
  seedDisk(): void;
  rebuildGrid(): void;
  rebuildTracers(): void;
  massChanged(): void;
}

export const MASS_PRESETS: Array<{ key: 'mass.stellar' | 'mass.imbh' | 'mass.sgr' | 'mass.m87'; exp: number }> = [
  { key: 'mass.stellar', exp: 1 },
  { key: 'mass.imbh', exp: 4 },
  { key: 'mass.sgr', exp: 6.63 },
  { key: 'mass.m87', exp: 9.81 },
];
const massOptions = () => Object.fromEntries(MASS_PRESETS.map((m) => [t(m.key), m.exp]));

/** remembered open/closed state of folders across rebuilds (language switch) */
const expandedState = new Map<number, boolean>();

export function buildPanel(container: HTMLElement, actions: PanelActions): Pane {
  const pane = new Pane({ container });
  const mon = { readonly: true, interval: 200 } as const;

  // ── 시간
  const fTime = pane.addFolder({ title: t('f.time') });
  fTime.addBinding(params, 'timeExp', { label: t('p.timeExp'), min: -2, max: 4, step: 0.01 });
  fTime.addBinding(readouts, 'timeScale', { ...mon, label: t('p.timeScale') });
  fTime.addBinding(readouts, 'simTime', { ...mon, label: t('p.simTime') });
  fTime.addBinding(params, 'paused', { label: t('p.paused') });
  fTime.addButton({ title: t('p.reset') }).on('click', actions.reset);

  // ── 블랙홀
  const fBH = pane.addFolder({ title: t('f.bh') });
  fBH.addBinding(params, 'spin', { label: t('p.spin'), min: 0, max: 0.998, step: 0.001 });
  // bound to massExp itself so it always shows the current preset
  fBH.addBinding(params, 'massExp', { label: t('p.massPreset'), options: massOptions() }).on('change', () => {
    pane.refresh();
    actions.massChanged();
  });
  fBH.addBinding(params, 'massExp', { label: t('p.massExp'), min: 0, max: 10.5, step: 0.01 }).on('change', actions.massChanged);
  fBH.addBinding(readouts, 'massSolar', { ...mon, label: t('p.massNow') });
  fBH.addBinding(params, 'accretionGrowth', { label: t('p.accretionGrowth') });
  fBH.addBinding(params, 'gravitomagnetic', { label: t('p.gravitomagnetic') });

  // ── 행성
  const fP = pane.addFolder({ title: t('f.planets') });
  const np = params.newPlanet;
  fP.addBinding(np, 'kind', { label: t('p.kind'), options: { [t('planet.rocky')]: 'rocky', [t('planet.gas')]: 'gas', [t('planet.ice')]: 'ice', [t('planet.lava')]: 'lava' } as Record<string, PlanetKind> });
  fP.addBinding(np, 'radius', { label: t('p.radius'), min: 0.2, max: 3, step: 0.05 });
  fP.addBinding(np, 'massExp', { label: t('p.pmassExp'), min: -7, max: -1.5, step: 0.1 });
  fP.addBinding(readouts, 'newPlanetRt', { ...mon, label: t('p.rt') });
  fP.addBinding(np, 'pericenter', { label: t('p.peri'), min: 3, max: 80, step: 0.5 });
  fP.addBinding(np, 'eccentricity', { label: t('p.ecc'), min: 0, max: 0.99, step: 0.01 });
  fP.addBinding(np, 'inclination', { label: t('p.inc'), min: 0, max: 90, step: 1 });
  fP.addBinding(np, 'retrograde', { label: t('p.retro') });
  fP.addButton({ title: t('p.addPlanet') }).on('click', actions.addPlanet);
  fP.addButton({ title: t('p.defaultPlanets') }).on('click', actions.defaultPlanets);
  fP.addButton({ title: t('p.clearPlanets') }).on('click', actions.clearPlanets);

  // ── 강착 원반
  const fD = pane.addFolder({ title: t('f.disk') });
  fD.addBinding(readouts, 'particles', { ...mon, label: t('p.particles') });
  fD.addBinding(readouts, 'accretion', { ...mon, label: t('p.accretion'), multiline: true, rows: 2 });
  fD.addBinding(params, 'viscosity', { label: t('p.viscosity'), min: 0, max: 0.5, step: 0.005 });
  fD.addBinding(params, 'inflow', { label: t('p.inflow'), min: 0, max: 0.08, step: 0.001 });
  fD.addBinding(params, 'fragments', { label: t('p.fragments'), min: 500, max: 20000, step: 100 });
  fD.addBinding(params, 'diskTemp', { label: t('p.diskTemp'), min: 0.3, max: 2.5, step: 0.01 });
  fD.addBinding(params, 'particleSize', { label: t('p.particleSize'), min: 0.3, max: 3, step: 0.05 });
  fD.addButton({ title: t('p.seedDisk') }).on('click', actions.seedDisk);

  // ── 시공간 격자
  const fG = pane.addFolder({ title: t('f.grid') });
  fG.addBinding(params, 'grid', { label: t('p.grid') });
  fG.addBinding(params, 'gridMode', { label: t('p.gridMode'), options: { [t('grid.sphere')]: 'sphere', [t('grid.3d')]: '3d', [t('grid.equator')]: 'equator' } }).on('change', actions.rebuildGrid);
  fG.addBinding(params, 'shellCount', { label: t('p.shellCount'), min: 4, max: 30, step: 1 }).on('change', actions.rebuildGrid);
  fG.addBinding(params, 'gridDivisions', { label: t('p.gridDivisions'), min: 4, max: 24, step: 2 }).on('change', actions.rebuildGrid);
  fG.addBinding(params, 'gridExtent', { label: t('p.gridExtent'), min: 20, max: 150, step: 5 }).on('change', actions.rebuildGrid);
  fG.addBinding(params, 'releasePeriod', { label: t('p.releasePeriod'), min: 10, max: 300, step: 5 });
  fG.addBinding(params, 'flowSpeedExp', { label: t('p.flowSpeedExp'), min: -0.5, max: 3, step: 0.05 });
  fG.addBinding(params, 'flowSync', { label: t('p.flowSync') });
  fG.addBinding(params, 'twist', { label: t('p.twist'), min: 0, max: 10, step: 0.1 });
  fG.addBinding(readouts, 'flowInfo', { ...mon, label: t('p.flowInfo'), multiline: true, rows: 4 });
  fG.addBinding(params, 'gridOpacity', { label: t('p.gridOpacity'), min: 0.02, max: 1, step: 0.01 });
  fG.addBinding(params, 'pulses', { label: t('p.pulses') });
  fG.addBinding(params, 'pulsePeriod', { label: t('p.pulsePeriod'), min: 5, max: 100, step: 1 });
  fG.addBinding(params, 'tracers', { label: t('p.tracers') });
  fG.addBinding(params, 'tracerCount', { label: t('p.tracerCount'), min: 500, max: 30000, step: 500 }).on('change', actions.rebuildTracers);

  // ── 광자 껍질 · 그림자
  const fS = pane.addFolder({ title: t('f.shell') });
  fS.addBinding(params, 'kerrShadow', { label: t('p.kerrShadow') });
  fS.addBinding(readouts, 'inclination', { ...mon, label: t('p.inclination') });
  fS.addBinding(readouts, 'shadowSize', { ...mon, label: t('p.shadowSize') });
  fS.addBinding(readouts, 'shadowShift', { ...mon, label: t('p.shadowShift') });
  fS.addBinding(params, 'photonShell', { label: t('p.photonShell') });
  fS.addBinding(params, 'shellOpacity', { label: t('p.shellOpacity'), min: 0.02, max: 0.5, step: 0.01 });
  fS.addBinding(readouts, 'shellRange', { ...mon, label: t('p.shellRange') });
  fS.addBinding(params, 'photonOrbits', { label: t('p.photonOrbits') });
  fS.addBinding(params, 'photonCount', { label: t('p.photonCount'), min: 1, max: 24, step: 1 });
  fS.addBinding(params, 'photonSpeedExp', { label: t('p.photonSpeedExp'), min: -1, max: 2.5, step: 0.05 });
  fS.addBinding(params, 'photonTrail', { label: t('p.photonTrail'), min: 5, max: 200, step: 5 });
  const shellLegend = {
    legend: t('p.photonLegend'),
  };
  fS.addBinding(shellLegend, 'legend', { readonly: true, multiline: true, rows: 3, label: t('p.photonLegendLabel') });

  // ── 시각 효과
  const fV = pane.addFolder({ title: t('f.visual') });
  fV.addBinding(params, 'lensing', { label: t('p.lensing') });
  fV.addBinding(params, 'secondaryImages', { label: t('p.secondaryImages') });
  fV.addBinding(params, 'doppler', { label: t('p.doppler') });
  fV.addBinding(params, 'bloom', { label: t('p.bloom') });
  fV.addBinding(params, 'bloomStrength', { label: t('p.bloomStrength'), min: 0, max: 3, step: 0.05 });
  fV.addBinding(params, 'glass', { label: t('p.glass') });
  fV.addBinding(params, 'rings', { label: t('p.rings') });
  fV.addBinding(params, 'ergosphere', { label: t('p.ergosphere') });
  fV.addBinding(params, 'stars', { label: t('p.stars') });
  const legend = {
    legend: t('p.ringLegend'),
  };
  fV.addBinding(legend, 'legend', { readonly: true, multiline: true, rows: 3, label: t('p.ringLegendLabel') });

  // ── 물리량
  const fR = pane.addFolder({ title: t('f.phys') });
  fR.addBinding(readouts, 'rs', { ...mon, label: t('p.rs') });
  fR.addBinding(readouts, 'horizon', { ...mon, label: t('p.horizon') });
  fR.addBinding(readouts, 'isco', { ...mon, label: t('p.isco') });
  fR.addBinding(readouts, 'photon', { ...mon, label: t('p.photon') });
  fR.addBinding(readouts, 'iscoPeriod', { ...mon, label: t('p.iscoPeriod') });
  fR.addBinding(readouts, 'timeUnit', { ...mon, label: t('p.timeUnit') });
  fR.addBinding(readouts, 'hawkingT', { ...mon, label: t('p.hawkingT') });
  fR.addBinding(readouts, 'evaporation', { ...mon, label: t('p.evaporation') });
  fR.addBinding(readouts, 'entropy', { ...mon, label: t('p.entropy') });
  fR.addBinding(readouts, 'rtEarth', { ...mon, label: t('p.rtEarth'), multiline: true, rows: 2 });
  fR.addBinding(readouts, 'rtSun', { ...mon, label: t('p.rtSun'), multiline: true, rows: 2 });
  fR.addBinding(readouts, 'perf', { ...mon, label: t('p.perf') });

  // the dock covers everyday controls, so detailed folders start closed
  const defaults = [false, true, true, false, false, false, false, false];
  pane.children.forEach((c, i) => {
    const f = c as unknown as { expanded: boolean; on(ev: 'fold', cb: (e: { expanded: boolean }) => void): void };
    f.expanded = expandedState.get(i) ?? defaults[i] ?? false;
    f.on('fold', (e) => expandedState.set(i, e.expanded));
  });
  return pane;
}
