import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import type { Pane } from 'tweakpane';

import { params } from './params';
import { BlackHoleSim, type Planet, type SimEvent } from './physics/sim';
import { circularPeriod } from './physics/kerr';
import {
  KM_PER_MSUN,
  R_SUN_KM,
  SEC_PER_MSUN,
  entropyKb,
  evaporationYears,
  fmtNum,
  formatKm,
  formatSeconds,
  hawkingTemperatureK,
  tidalRadiusInM,
} from './physics/units';
import { shared } from './render/shared';
import { SpacetimeGrid } from './render/grid';
import { river, updateRiverTable } from './render/river';
import { fallTime, twistFromInfinity, zamoOmega } from './physics/river';
import { RiverTracers, StarField } from './render/fields';
import { DebrisRenderer } from './render/debris';
import { PlanetRenderer } from './render/planets';
import { BlackHoleVisual } from './render/blackhole';
import { PhotonShellVisual } from './render/photonshell';
import { buildPanel, readouts, type PanelActions } from './ui/panel';
import { GlassPass } from './render/glass';
import { Dock, type CameraId, type SceneId } from './ui/dock';
import { icons } from './ui/icons';
import { applyDocument, lang, onLangChange, setLang, t, type I18nKey } from './i18n';

applyDocument();

// ───────────────────────────── capability check
function hasWebGL2() {
  try {
    return !!document.createElement('canvas').getContext('webgl2');
  } catch {
    return false;
  }
}
if (!hasWebGL2()) {
  const f = document.getElementById('fatal')!;
  f.textContent = t('app.noWebgl');
  f.hidden = false;
  document.getElementById('loading')?.remove();
  throw new Error('WebGL2 unavailable');
}

// small or touch screens: lighter defaults
const MOBILE = window.matchMedia('(max-width: 760px), (pointer: coarse)').matches;
if (MOBILE) {
  params.tracerCount = 1000;
  params.fragments = 3000;
  params.shellCount = 9;
  params.photonCount = 6;
}
/** pristine copy used by scene presets */
const DEFAULTS = structuredClone(params);

// ───────────────────────────── renderer / scene
const viewport = document.getElementById('viewport')!;
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, MOBILE ? 1.5 : 2));
renderer.setClearColor(0x000000, 1);
viewport.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 30000);
camera.position.set(38, 14, 92);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 12;
controls.maxDistance = 900;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), params.bloomStrength, 0.55, 0.12);
composer.addPass(bloom);
const glass = new GlassPass();
composer.addPass(glass);
composer.addPass(new OutputPass());

// ───────────────────────────── simulation + views
const sim = new BlackHoleSim();
sim.addDefaultScene();

const stars = new StarField();
const grid = new SpacetimeGrid();
const tracers = new RiverTracers();
const debris = new DebrisRenderer(sim);
const planets = new PlanetRenderer();
const bh = new BlackHoleVisual();
const photonShell = new PhotonShellVisual();
scene.add(stars.group, grid.group, tracers.object, debris.group, planets.group, bh.group, photonShell.group);

function rebuildGrid() {
  grid.rebuild(params.gridMode, params.gridDivisions, params.gridExtent, params.shellCount);
}
function rebuildTracers() {
  tracers.rebuild(params.tracerCount, Math.max(params.gridExtent, 40));
}
rebuildGrid();
rebuildTracers();

// ───────────────────────────── HUD events
const hudEvents = document.getElementById('hud-events')!;
const hudTime = document.getElementById('hud-time')!;
const planetName = (p: Planet) => `${t(`planet.${p.kind}` as I18nKey)} ${p.tag}`;
function toast(text: string) {
  const div = document.createElement('div');
  div.textContent = text;
  hudEvents.prepend(div);
  while (hudEvents.children.length > 5) hudEvents.lastChild?.remove();
  setTimeout(() => div.remove(), 6500);
}
sim.onEvent = (e: SimEvent) => toast(t(e.key, { ...(e.vars ?? {}), name: e.planet ? planetName(e.planet) : '' }));

// ───────────────────────────── actions shared by the panel and the dock
let lastScene: SceneId = 'tde';
function launchPlanet() {
  const np = params.newPlanet;
  const p = sim.addPlanet({
    kind: np.kind,
    radius: np.radius,
    massExp: np.massExp,
    pericenter: np.pericenter,
    eccentricity: np.eccentricity,
    inclinationDeg: np.inclination,
    retrograde: np.retrograde,
  });
  sim.onEvent({ key: 'ev.added', planet: p, vars: { peri: np.pericenter, rt: sim.tidalRadius(p).toFixed(1) } });
}
function resetAll() {
  sim.reset();
  planets.clear();
  sim.addDefaultScene();
}
const panelActions: PanelActions = {
  reset: resetAll,
  addPlanet: launchPlanet,
  defaultPlanets: () => sim.addDefaultScene(),
  clearPlanets: () => (sim.planets = []),
  seedDisk: () => sim.seedDisk(6000),
  rebuildGrid,
  rebuildTracers,
  massChanged() {},
};

// ───────────────────────────── settings drawer
const panelEl = document.getElementById('panel')!;
const paneHost = document.getElementById('pane-host')!;
const panelClose = document.getElementById('panel-close')!;
panelClose.innerHTML = icons.close;
let pane: Pane = buildPanel(paneHost, panelActions);
function setPanel(open: boolean) {
  panelEl.classList.toggle('open', open);
  panelEl.setAttribute('aria-hidden', String(!open));
  document.body.classList.toggle('panel-open', open);
  panelClose.setAttribute('aria-label', t('panel.close'));
}
panelClose.addEventListener('click', () => setPanel(false));
setPanel(window.innerWidth >= 1400 && !MOBILE);

// ───────────────────────────── camera moves
const CAMERAS: Record<CameraId, THREE.Vector3> = {
  front: new THREE.Vector3(0, 3, 52),
  top: new THREE.Vector3(0.01, 72, 0.6),
  side: new THREE.Vector3(38, 22, 62),
  close: new THREE.Vector3(7, 4, 24),
};
let camTween: { from: THREE.Vector3; to: THREE.Vector3; t: number } | null = null;
function moveCamera(to: THREE.Vector3) {
  camTween = { from: camera.position.clone(), to: to.clone(), t: 0 };
}
function stepCamera(dt: number) {
  if (!camTween) return;
  camTween.t = Math.min(1, camTween.t + dt / 1.4);
  const k = 1 - Math.pow(1 - camTween.t, 3);
  // move along a sphere-ish path so the camera never cuts through the hole
  const d0 = camTween.from.length(), d1 = camTween.to.length();
  const dir = camTween.from.clone().normalize().lerp(camTween.to.clone().normalize(), k);
  if (dir.lengthSq() < 1e-6) dir.set(0, 1, 0);
  camera.position.copy(dir.normalize().multiplyScalar(d0 + (d1 - d0) * k));
  controls.target.set(0, 0, 0);
  if (camTween.t >= 1) camTween = null;
}

// ───────────────────────────── scene presets
const KEEP: Array<keyof typeof params> = ['glass', 'bloom', 'bloomStrength', 'autoRotate'];
function applyScene(id: SceneId, moveCam = true) {
  const keep = Object.fromEntries(KEEP.map((k) => [k, params[k]]));
  Object.assign(params, structuredClone(DEFAULTS), keep);
  sim.reset();
  planets.clear();
  const disk = MOBILE ? 5000 : 9000;
  let cam = new THREE.Vector3(38, 14, 92);
  const quiet = () => Object.assign(params, { tracers: false, photonShell: false, photonOrbits: false, rings: false, gridOpacity: 0.12 });
  switch (id) {
    case 'tde':
      sim.addDefaultScene();
      break;
    case 'sgr':
      Object.assign(params, { massExp: 6.63, spin: 0.9, timeExp: 1.3 });
      quiet();
      sim.seedDisk(disk);
      cam = new THREE.Vector3(0, 3.5, 46);
      break;
    case 'm87':
      Object.assign(params, { massExp: 9.81, spin: 0.9, timeExp: 1.3 });
      quiet();
      sim.seedDisk(disk);
      // M87*'s jet points ~17° from our line of sight
      cam = new THREE.Vector3(0, Math.cos((17 * Math.PI) / 180), Math.sin((17 * Math.PI) / 180)).multiplyScalar(55);
      break;
    case 'river':
      Object.assign(params, { spin: 0.95, twist: 3, photonShell: false, photonOrbits: false, rings: false, tracerCount: MOBILE ? 1500 : 3000 });
      cam = new THREE.Vector3(40, 45, 80);
      break;
    case 'photon':
      Object.assign(params, { spin: 0.99, grid: false, tracers: false, rings: false, shellOpacity: 0.05, photonCount: MOBILE ? 10 : 16 });
      cam = new THREE.Vector3(3, 8, 26);
      break;
  }
  lastScene = id;
  rebuildGrid();
  rebuildTracers();
  pane.refresh();
  if (moveCam) moveCamera(cam);
  return cam;
}

// ───────────────────────────── share link (scene + key params + camera + language)
const SHARE_KEYS = [
  'timeExp', 'spin', 'massExp', 'grid', 'gridMode', 'tracers', 'photonShell', 'photonOrbits', 'rings', 'lensing', 'stars',
  'twist', 'flowSpeedExp', 'gridOpacity', 'kerrShadow', 'ergosphere', 'photonCount', 'shellOpacity',
] as const;
function encodeState(): string {
  const p: Record<string, unknown> = {};
  for (const k of SHARE_KEYS) p[k] = params[k];
  const c = camera.position.toArray().map((v) => Math.round(v * 10) / 10);
  const json = JSON.stringify({ s: lastScene, p, c, l: lang() });
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function decodeState(h: string): boolean {
  try {
    const b = h.replace(/-/g, '+').replace(/_/g, '/');
    const st = JSON.parse(decodeURIComponent(escape(atob(b))));
    if (['tde', 'sgr', 'm87', 'river', 'photon'].includes(st.s)) applyScene(st.s, false);
    for (const k of SHARE_KEYS) if (st.p && k in st.p && typeof st.p[k] === typeof params[k]) (params as Record<string, unknown>)[k] = st.p[k];
    if (Array.isArray(st.c) && st.c.length === 3) camera.position.fromArray(st.c.map(Number));
    if (st.l === 'ko' || st.l === 'en') setLang(st.l);
    rebuildGrid();
    rebuildTracers();
    pane.refresh();
    return true;
  } catch {
    return false;
  }
}
async function share() {
  const url = `${location.origin}${location.pathname}#s=${encodeState()}`;
  history.replaceState(null, '', url);
  try {
    await navigator.clipboard.writeText(url);
    toast(t('toast.linkCopied'));
  } catch {
    toast(t('toast.linkFailed'));
  }
}

// ───────────────────────────── screenshot (taken right after a render, same task)
let wantShot = false;
function saveShot() {
  renderer.domElement.toBlob((blob) => {
    if (!blob) return;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `blackhole-${new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)}.png`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
    toast(t('toast.screenshot'));
  }, 'image/png');
}

// ───────────────────────────── dock
const dock = new Dock(document.body, {
  togglePause: () => {
    params.paused = !params.paused;
    pane.refresh();
  },
  launchPlanet,
  clearPlanets: () => (sim.planets = []),
  setMassExp: (exp) => (params.massExp = exp),
  changed: () => pane.refresh(),
  seedDisk: () => sim.seedDisk(MOBILE ? 4000 : 6000),
  scene: (id) => applyScene(id),
  camera: (id) => moveCamera(CAMERAS[id]),
  reset: () => {
    applyScene('tde');
    toast(t('toast.reset'));
  },
  screenshot: () => (wantShot = true),
  share,
  toggleLang: () => setLang(lang() === 'ko' ? 'en' : 'ko'),
  toggleSettings: () => setPanel(!panelEl.classList.contains('open')),
  settingsOpen: () => panelEl.classList.contains('open'),
});

onLangChange(() => {
  pane.dispose();
  pane = buildPanel(paneHost, panelActions);
  dock.build();
  setPanel(panelEl.classList.contains('open'));
  updateReadouts();
});

window.addEventListener('keydown', (e) => {
  const tag = (e.target as HTMLElement).tagName;
  if (e.code === 'Space' && tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'BUTTON') {
    params.paused = !params.paused;
    pane.refresh();
    dock.sync();
    e.preventDefault();
  }
});

const hash = location.hash.match(/#s=([\w-]+)/);
if (hash) decodeState(hash[1]);

// ───────────────────────────── resize
function resize() {
  const w = viewport.clientWidth;
  const h = viewport.clientHeight;
  renderer.setSize(w, h);
  composer.setSize(w, h);
  bloom.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  shared.uPixelRatio.value = renderer.getPixelRatio();
}
window.addEventListener('resize', resize);
resize();

// ───────────────────────────── readouts
let readoutTimer = 0;
let fpsFrames = 0;
let fpsTime = 0;
let fps = 0;
let stepMs = 0;

function updateReadouts() {
  const M0sun = Math.pow(10, params.massExp);
  const Msun = M0sun * sim.M; // current physical mass
  const lenKm = KM_PER_MSUN * M0sun; // one sim length unit (GM0/c²)
  const tSec = SEC_PER_MSUN * M0sun; // one sim time unit (GM0/c³)
  const rad = sim.radii;
  const scale = Math.pow(10, params.timeExp);

  readouts.timeScale = `${fmtNum(scale)} GM/c³ ≈ ${formatSeconds(scale * tSec)}`;
  readouts.simTime = `${fmtNum(sim.time)} GM/c³ = ${formatSeconds(sim.time * tSec)}`;
  readouts.massSolar = `${fmtNum(Msun, 4)} M☉  (M = ${sim.M.toFixed(6)})`;
  readouts.rs = formatKm(2 * sim.M * lenKm);
  readouts.horizon = `${rad.horizon.toFixed(3)} M = ${formatKm(rad.horizon * lenKm)}`;
  readouts.isco = `${rad.iscoPro.toFixed(2)} / ${rad.iscoRetro.toFixed(2)} M`;
  readouts.photon = `${rad.photonPro.toFixed(2)} / ${rad.photonRetro.toFixed(2)} M`;
  readouts.iscoPeriod = formatSeconds(circularPeriod(sim.M, params.spin, rad.iscoPro) * tSec);
  readouts.timeUnit = formatSeconds(tSec);
  readouts.hawkingT = `${fmtNum(hawkingTemperatureK(Msun, params.spin))} K`;
  readouts.evaporation = `${fmtNum(evaporationYears(Msun))} ${t('unit.year')} (${t('r.nonRotating')})`;
  readouts.entropy = fmtNum(entropyKb(Msun, params.spin));
  const rtE = tidalRadiusInM(Msun, 5.51);
  const rtS = R_SUN_KM * Math.cbrt(Msun) / (KM_PER_MSUN * Msun);
  const verdict = (rt: number) => (rt > rad.horizon / sim.M ? t('r.disruptOutside', { x: fmtNum(rt / (rad.horizon / sim.M)) }) : t('r.swallowedWhole'));
  readouts.rtEarth = `${fmtNum(rtE)} M = ${formatKm(rtE * KM_PER_MSUN * Msun)}\n→ ${verdict(rtE)}`;
  readouts.rtSun = `${fmtNum(rtS)} M = ${formatKm(rtS * KM_PER_MSUN * Msun)}\n→ ${verdict(rtS)}`;

  renderPlanetCards();
  readouts.particles = `${sim.count} (${t('r.disk')} ${sim.diskParticles})`;
  const accSun = sim.absorbedMass * M0sun;
  const rateSunPerYr = (sim.accretionRate * M0sun) / tSec * 3.156e7;
  readouts.accretion = `${t('r.cumulative')} ${fmtNum(sim.absorbedMass)} M = ${fmtNum(accSun)} M☉\n${t('r.rate')} ${fmtNum(rateSunPerYr)} ${t('r.perYear')}`;
  const np = params.newPlanet;
  readouts.newPlanetRt = `${(np.radius * Math.cbrt(Math.pow(10, -np.massExp))).toFixed(1)} M`;
  const cv = bh.curve;
  readouts.inclination = t('r.incl', { deg: bh.inclinationDeg.toFixed(1) });
  readouts.shadowSize = `${(cv.width * sim.M).toFixed(2)} × ${(cv.height * sim.M).toFixed(2)} M (${t('r.circle')}: ${(6 * Math.sqrt(3) * sim.M).toFixed(2)})`;
  readouts.shadowShift = `${(cv.shift * sim.M).toFixed(2)} M (${t('r.towardsReceding')})`;
  readouts.shellRange = `r = ${photonShell.range[0].toFixed(2)} ~ ${photonShell.range[1].toFixed(2)} M`;
  {
    const rt = updateRiverTable(params.spin);
    const a = rt.a;
    const rH = rt.rH;
    const omegaH = a / (2 * rH); // horizon angular velocity [1/M]
    const periodH = ((2 * Math.PI) / omegaH) * sim.M * tSec;
    const twistDeg = ((twistFromInfinity(rt, rH) - twistFromInfinity(rt, params.gridExtent / sim.M)) * 180) / Math.PI;
    const omegaIsco = zamoOmega(a, sim.radii.iscoPro / sim.M, 0);
    readouts.flowInfo =
      t('r.flow1', { w: omegaH.toFixed(3), period: formatSeconds(periodH) }) + '\n' +
      t('r.flow2', { deg: twistDeg.toFixed(1), total: ((twistFromInfinity(rt, rH) * 180) / Math.PI).toFixed(1) }) + '\n' +
      t('r.flow3', { w: omegaIsco.toFixed(4) }) + '\n' +
      t('r.flow4', { t: formatSeconds(fallTime(rt, params.gridExtent / sim.M, 0) * sim.M * tSec) });
  }
  readouts.perf = `${fps.toFixed(0)} fps · ${t('r.physics')} ${stepMs.toFixed(1)} ms${sim.laggedParticles ? ` · ${t('r.lagged')} ${sim.laggedParticles}` : ''}`;
}

// ───────────────────────────── planet cards (HUD)
const cardsEl = document.getElementById('planet-cards')!;
const css = (c: [number, number, number]) => `rgb(${c.map((v) => Math.round(Math.min(1, v * 1.3) * 255)).join(',')})`;
function renderPlanetCards() {
  const CHI_MAX = 1.2;
  cardsEl.innerHTML = sim.planets
    .map((p) => {
      const r = Math.hypot(...p.pos);
      const w = (Math.min(p.chi, CHI_MAX) / CHI_MAX) * 100;
      const pct = p.frac < 0.999 ? ` · ${(p.frac * 100).toFixed(0)}%` : '';
      return `<div class="pcard${p.chi > 0.5 ? ' hot' : ''}"><span class="dot" style="background:radial-gradient(circle at 35% 35%,${css(p.color)},${css(p.color2)})"></span><span class="name">${planetName(p)}</span><span class="r">r ${r.toFixed(1)} · r_t ${sim.tidalRadius(p).toFixed(1)} M</span><span class="bar" title="${t('r.chi')}"><i style="width:${w.toFixed(1)}%"></i><b style="left:${((0.5 / CHI_MAX) * 100).toFixed(1)}%"></b><b style="left:${((1 / CHI_MAX) * 100).toFixed(1)}%"></b></span><span class="st">${t(`status.${p.status}` as I18nKey)}${pct} · ${t('r.chi')} ${p.chi.toFixed(2)}</span></div>`;
    })
    .join('');
}

// ───────────────────────────── loop
let lastNow = performance.now();
let flowClock = 0;
function frame(now: number) {
  const rawDt = Math.max(0, (now - lastNow) / 1000);
  lastNow = now;
  // cap the step so a background tab or a long frame doesn't explode the integrator
  const dtReal = Math.min(rawDt, 0.05);

  if (!params.paused) {
    const t0 = performance.now();
    sim.step(dtReal * Math.pow(10, params.timeExp));
    stepMs = stepMs * 0.9 + (performance.now() - t0) * 0.1;
  } else {
    sim.updateConstants();
  }

  stepCamera(rawDt);
  controls.autoRotate = params.autoRotate;
  controls.autoRotateSpeed = 0.6;
  controls.update();

  // shared uniforms
  shared.uCamPos.value.copy(camera.position);
  shared.uM.value = sim.M;
  shared.uLens.value = params.lensing ? 1 : 0;
  shared.uRH.value = sim.radii.horizon;
  shared.uRin.value = sim.radii.iscoPro;
  shared.uJ.value = params.spin * sim.M * sim.M;
  shared.uTime.value = sim.time % 1e5;
  shared.uDoppler.value = params.doppler ? 1 : 0;

  // flowing lattice (Kerr river)
  if (params.flowSync) flowClock = sim.time;
  else if (!params.paused) flowClock += dtReal * Math.pow(10, params.flowSpeedExp);
  const rt = updateRiverTable(params.spin);
  const clockN = flowClock / sim.M;
  const extentN = params.gridExtent / sim.M;
  river.uTwist.value = params.twist;
  river.uClock.value = clockN % 1e4;
  grid.group.visible = params.grid;
  grid.common.uOpacity.value = params.gridOpacity;
  grid.common.uPulses.value = params.pulses ? 1 : 0;
  grid.update(clockN, Math.max(fallTime(rt, extentN, 0), 1), params.releasePeriod, extentN, params.pulsePeriod);
  tracers.object.visible = params.tracers;

  stars.group.visible = params.stars;
  stars.secondary.visible = params.secondaryImages && params.lensing;
  debris.secondary.visible = params.secondaryImages && params.lensing;
  debris.update(sim, params.particleSize, params.diskTemp);
  const diskLight = Math.min(1.2, sim.diskParticles / 4000);
  planets.update(sim, params.secondaryImages && params.lensing, diskLight);
  bh.update(camera, sim.radii, sim.M, params.spin, params.lensing, params.ergosphere, params.rings, 0.06 + 0.16 * diskLight, params.kerrShadow);
  photonShell.update(dtReal, {
    spin: params.spin,
    M: sim.M,
    showShell: params.photonShell,
    showOrbits: params.photonOrbits,
    shellOpacity: params.shellOpacity,
    count: params.photonCount,
    speedExp: params.photonSpeedExp,
    trailM: params.photonTrail,
    paused: params.paused,
  });

  bloom.enabled = params.bloom;
  bloom.strength = params.bloomStrength;
  const showDock = !(MOBILE && panelEl.classList.contains('open'));
  document.body.classList.toggle('no-glass', !params.glass);
  glass.update(
    renderer.domElement,
    showDock && params.glass ? dock.rects() : [],
    [22, 18],
    params.glass ? dock.hover : null,
    rawDt,
    (performance.now() - dock.pressAt) / 1000,
    params.glass,
  );
  composer.render();
  if (wantShot) {
    wantShot = false;
    saveShot();
  }

  // readouts / HUD
  fpsFrames++;
  fpsTime += rawDt;
  if (fpsTime > 0.5) {
    fps = fpsFrames / fpsTime;
    fpsFrames = 0;
    fpsTime = 0;
  }
  readoutTimer -= dtReal;
  if (readoutTimer <= 0) {
    readoutTimer = 0.2;
    updateReadouts();
    hudTime.textContent = `${params.paused ? `⏸ ${t('hud.paused')} · ` : ''}${t('hud.time', { t: readouts.simTime, scale: readouts.timeScale })}`;
    dock.sync();
  }
  requestAnimationFrame(frame);
}
updateReadouts();
requestAnimationFrame(frame);
requestAnimationFrame(() => document.getElementById('loading')?.classList.add('done'));

// for debugging in the console
(window as unknown as { bh: unknown }).bh = { sim, params, camera, renderer, scene, composer, photonShell, bh, grid, rebuildGrid, applyScene, dock, setLang };
