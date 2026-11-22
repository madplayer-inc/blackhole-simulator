import { icons, type IconName } from './icons';
import { params, type PlanetKind } from '../params';
import { t, lang, type I18nKey } from '../i18n';
import { readouts, MASS_PRESETS } from './panel';
import { kerrRadii } from '../physics/kerr';

// Floating glass dock. The glass itself (blur, refraction, hover lens) is drawn by the
// post-processing shader in render/glass.ts; this module only provides transparent buttons,
// popovers, and the screen rectangles the shader should treat as glass.

export type SceneId = 'tde' | 'sgr' | 'm87' | 'river' | 'photon';
export type CameraId = 'front' | 'top' | 'side' | 'close';

export interface DockActions {
  togglePause(): void;
  launchPlanet(): void;
  clearPlanets(): void;
  setMassExp(exp: number): void;
  changed(): void; // a param changed through the dock → refresh panel etc.
  seedDisk(): void;
  scene(id: SceneId): void;
  camera(id: CameraId): void;
  reset(): void;
  screenshot(): void;
  share(): void;
  toggleLang(): void;
  toggleSettings(): void;
  settingsOpen(): boolean;
}

type ItemId =
  | 'play' | 'time' | 'planet' | 'mass' | 'spin' | 'layers' | 'camera' | 'scenes'
  | 'reset' | 'screenshot' | 'share' | 'lang' | 'settings';

const GROUPS: ItemId[][] = [
  ['play', 'time'],
  ['planet', 'mass', 'spin'],
  ['layers', 'camera', 'scenes'],
  ['reset', 'screenshot', 'share', 'lang', 'settings'],
];
const POPOVER: Partial<Record<ItemId, true>> = { time: true, planet: true, mass: true, spin: true, layers: true, camera: true, scenes: true };
const ICON: Record<ItemId, IconName> = {
  play: 'pause', time: 'time', planet: 'planet', mass: 'mass', spin: 'spin', layers: 'layers', camera: 'camera',
  scenes: 'scenes', reset: 'reset', screenshot: 'screenshot', share: 'share', lang: 'lang', settings: 'settings',
};
const LABEL: Record<ItemId, I18nKey> = {
  play: 'dock.pause', time: 'dock.time', planet: 'dock.planet', mass: 'dock.mass', spin: 'dock.spin', layers: 'dock.layers',
  camera: 'dock.camera', scenes: 'dock.scenes', reset: 'dock.reset', screenshot: 'dock.screenshot', share: 'dock.share',
  lang: 'dock.lang', settings: 'dock.settings',
};

const el = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, html?: string) => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (html != null) e.innerHTML = html;
  return e;
};

export class Dock {
  readonly root: HTMLElement;
  readonly pop: HTMLElement;
  private tip: HTMLElement;
  private buttons = new Map<ItemId, HTMLButtonElement>();
  private open: ItemId | null = null;
  private updaters: Array<() => void> = [];
  /** hovered button centre in client px (for the lens), or null */
  hover: { x: number; y: number } | null = null;
  /** last pointer press, used for a short "pulse" of the lens */
  pressAt = 0;

  constructor(host: HTMLElement, private actions: DockActions) {
    this.root = el('nav', 'dock');
    this.root.setAttribute('role', 'toolbar');
    this.pop = el('div', 'pop');
    this.pop.hidden = true;
    this.tip = el('div', 'dock-tip');
    host.append(this.root, this.pop, this.tip);
    this.build();

    document.addEventListener('pointerdown', (e) => {
      if (!this.open) return;
      const tgt = e.target as Node;
      if (this.pop.contains(tgt) || this.root.contains(tgt)) return;
      this.close();
    });
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this.close();
    });
    window.addEventListener('resize', () => this.place());
  }

  /** rebuild labels (language switch) */
  build() {
    const reopen = this.open;
    this.close();
    this.root.innerHTML = '';
    this.buttons.clear();
    GROUPS.forEach((g, gi) => {
      if (gi > 0) this.root.append(el('span', 'dock-sep'));
      for (const id of g) {
        const b = el('button', 'dock-btn', icons[ICON[id]]) as HTMLButtonElement;
        b.type = 'button';
        b.dataset.id = id;
        b.setAttribute('aria-label', t(LABEL[id]));
        if (POPOVER[id]) b.setAttribute('aria-haspopup', 'dialog');
        b.addEventListener('click', () => this.click(id));
        b.addEventListener('pointerenter', () => this.enter(id));
        b.addEventListener('pointerleave', () => this.leave());
        b.addEventListener('focus', () => this.enter(id));
        b.addEventListener('blur', () => this.leave());
        b.addEventListener('pointerdown', () => (this.pressAt = performance.now()));
        this.buttons.set(id, b);
        this.root.append(b);
      }
    });
    this.sync();
    if (reopen) this.toggle(reopen);
  }

  /** glass rectangles in client px */
  rects(): DOMRect[] {
    const r = [this.root.getBoundingClientRect()];
    if (!this.pop.hidden) r.push(this.pop.getBoundingClientRect());
    return r;
  }

  /** periodic refresh of dynamic text and states */
  sync() {
    const play = this.buttons.get('play');
    if (play) {
      play.innerHTML = params.paused ? icons.play : icons.pause;
      play.setAttribute('aria-label', t(params.paused ? 'dock.play' : 'dock.pause'));
      play.classList.toggle('on', params.paused);
    }
    this.buttons.get('settings')?.classList.toggle('on', this.actions.settingsOpen());
    for (const u of this.updaters) u();
  }

  private enter(id: ItemId) {
    const b = this.buttons.get(id)!;
    const r = b.getBoundingClientRect();
    this.hover = { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    if (this.open) return; // a popover is open: no tooltips
    this.tip.textContent = b.getAttribute('aria-label');
    this.tip.style.left = `${r.left + r.width / 2}px`;
    this.tip.style.top = `${r.top - 10}px`;
    this.tip.classList.add('show');
  }

  private leave() {
    this.hover = null;
    this.tip.classList.remove('show');
  }

  private click(id: ItemId) {
    this.tip.classList.remove('show');
    if (POPOVER[id]) return this.toggle(id);
    this.close();
    const a = this.actions;
    ({ play: a.togglePause, reset: a.reset, screenshot: a.screenshot, share: a.share, lang: a.toggleLang, settings: a.toggleSettings } as Record<string, () => void>)[id]?.call(a);
    this.sync();
  }

  close() {
    if (this.open) this.buttons.get(this.open)?.classList.remove('active');
    this.open = null;
    this.pop.hidden = true;
    this.pop.innerHTML = '';
    this.updaters = [];
  }

  private toggle(id: ItemId) {
    if (this.open === id) return this.close();
    this.close();
    this.open = id;
    this.buttons.get(id)?.classList.add('active');
    const title = el('div', 'pop-title', t(LABEL[id]));
    this.pop.append(title, this.content(id));
    this.pop.setAttribute('role', 'dialog');
    this.pop.setAttribute('aria-label', t(LABEL[id]));
    this.pop.hidden = false;
    this.place();
    for (const u of this.updaters) u();
  }

  private place() {
    if (!this.open) return;
    const b = this.buttons.get(this.open);
    if (!b) return;
    const br = b.getBoundingClientRect();
    const dr = this.root.getBoundingClientRect();
    const pw = this.pop.offsetWidth;
    const x = Math.min(Math.max(br.left + br.width / 2 - pw / 2, 8), window.innerWidth - pw - 8);
    this.pop.style.left = `${x}px`;
    this.pop.style.bottom = `${window.innerHeight - dr.top + 10}px`;
  }

  // ───────────────────────── popover contents

  private slider(min: number, max: number, step: number, get: () => number, set: (v: number) => void, fmt: (v: number) => string) {
    const row = el('div', 'pop-slider');
    const input = el('input') as HTMLInputElement;
    Object.assign(input, { type: 'range', min: String(min), max: String(max), step: String(step) });
    const out = el('output');
    input.addEventListener('input', () => {
      set(Number(input.value));
      out.textContent = fmt(Number(input.value));
      this.actions.changed();
    });
    this.updaters.push(() => {
      if (document.activeElement !== input) input.value = String(get());
      out.textContent = fmt(get());
    });
    row.append(input, out);
    return row;
  }

  private chip(icon: IconName | null, label: string, onClick: () => void, isOn?: () => boolean, cls = 'chip') {
    const b = el('button', cls, `${icon ? icons[icon] : ''}<span>${label}</span>`) as HTMLButtonElement;
    b.type = 'button';
    b.addEventListener('click', () => {
      onClick();
      this.actions.changed();
      for (const u of this.updaters) u();
    });
    if (isOn) this.updaters.push(() => b.classList.toggle('on', isOn()));
    return b;
  }

  private hint(get: () => string) {
    const h = el('div', 'pop-hint');
    this.updaters.push(() => (h.textContent = get()));
    return h;
  }

  private content(id: ItemId): HTMLElement {
    const box = el('div', 'pop-body');
    const np = params.newPlanet;
    switch (id) {
      case 'time':
        box.append(
          this.slider(-2, 4, 0.01, () => params.timeExp, (v) => (params.timeExp = v), (v) => `×10^${v.toFixed(2)}`),
          this.hint(() => t('pop.time.hint', { scale: readouts.timeScale })),
        );
        break;
      case 'planet': {
        const kinds = el('div', 'chip-row');
        for (const k of ['rocky', 'gas', 'ice', 'lava'] as PlanetKind[]) {
          kinds.append(this.chip(k, t(`planet.${k}` as I18nKey), () => (np.kind = k), () => np.kind === k, 'chip tall'));
        }
        const lab = el('div', 'pop-label', t('pop.planet.peri'));
        const retro = this.chip(null, t('pop.planet.retro'), () => (np.retrograde = !np.retrograde), () => np.retrograde, 'chip toggle');
        const go = el('div', 'chip-row');
        go.append(
          this.chip('planet', t('pop.planet.launch'), () => this.actions.launchPlanet(), undefined, 'chip primary'),
          this.chip('close', t('pop.planet.clear'), () => this.actions.clearPlanets()),
        );
        box.append(
          kinds,
          lab,
          this.slider(3, 40, 0.5, () => np.pericenter, (v) => (np.pericenter = v), (v) => `${v.toFixed(1)} M`),
          this.hint(() => {
            const rt = np.radius * Math.cbrt(Math.pow(10, -np.massExp));
            return t('pop.planet.rt', {
              rt: rt.toFixed(1),
              peri: np.pericenter.toFixed(1),
              verdict: t(np.pericenter < rt ? 'pop.planet.willDisrupt' : 'pop.planet.willSurvive'),
            });
          }),
          retro,
          go,
        );
        break;
      }
      case 'mass': {
        const col = el('div', 'chip-col');
        for (const m of MASS_PRESETS) {
          col.append(this.chip('mass', t(m.key), () => this.actions.setMassExp(m.exp), () => Math.abs(params.massExp - m.exp) < 0.005));
        }
        box.append(col, this.hint(() => t('pop.mass.current', { mass: readouts.massSolar.split('  ')[0] })));
        break;
      }
      case 'spin':
        box.append(
          this.slider(0, 0.998, 0.001, () => params.spin, (v) => (params.spin = v), (v) => `a/M = ${v.toFixed(3)}`),
          this.hint(() => {
            const k = kerrRadii(1, params.spin);
            return t('pop.spin.hint', { rh: k.horizon.toFixed(2), isco: k.iscoPro.toFixed(2) });
          }),
        );
        break;
      case 'layers': {
        const g = el('div', 'chip-grid');
        const tog = (icon: IconName, key: I18nKey, p: 'grid' | 'tracers' | 'photonShell' | 'photonOrbits' | 'rings' | 'lensing' | 'stars') =>
          g.append(this.chip(icon, t(key), () => (params[p] = !params[p]), () => params[p], 'chip toggle'));
        tog('grid', 'layer.grid', 'grid');
        tog('tracers', 'layer.tracers', 'tracers');
        tog('shell', 'layer.shell', 'photonShell');
        tog('orbits', 'layer.orbits', 'photonOrbits');
        tog('rings', 'layer.rings', 'rings');
        tog('lensing', 'layer.lensing', 'lensing');
        tog('stars', 'layer.stars', 'stars');
        g.append(this.chip('disk', t('layer.disk'), () => this.actions.seedDisk()));
        box.append(g);
        break;
      }
      case 'camera': {
        const g = el('div', 'chip-grid');
        const cam = (icon: IconName, key: I18nKey, c: CameraId) => g.append(this.chip(icon, t(key), () => this.actions.camera(c)));
        cam('camFront', 'cam.front', 'front');
        cam('camTop', 'cam.top', 'top');
        cam('camSide', 'cam.side', 'side');
        cam('camClose', 'cam.close', 'close');
        g.append(this.chip('camOrbit', t('cam.orbit'), () => (params.autoRotate = !params.autoRotate), () => params.autoRotate, 'chip toggle'));
        box.append(g);
        break;
      }
      case 'scenes': {
        const list = el('div', 'scene-list');
        const scenes: Array<[SceneId, IconName]> = [
          ['tde', 'sceneTde'],
          ['sgr', 'sceneSgr'],
          ['m87', 'sceneM87'],
          ['river', 'sceneRiver'],
          ['photon', 'scenePhoton'],
        ];
        for (const [sid, icon] of scenes) {
          const b = el(
            'button',
            'scene',
            `${icons[icon]}<span><b>${t(`scene.${sid}` as I18nKey)}</b><small>${t(`scene.${sid}.desc` as I18nKey)}</small></span>`,
          ) as HTMLButtonElement;
          b.type = 'button';
          b.addEventListener('click', () => {
            this.actions.scene(sid);
            this.close();
          });
          list.append(b);
        }
        box.append(list);
        break;
      }
    }
    box.lang = lang();
    return box;
  }
}
