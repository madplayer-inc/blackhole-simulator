// Custom icon set: 24×24 grid, round 1.6 px strokes, currentColor.
// Drawn for this project (no external icon library).

const svg = (body: string) =>
  `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

export const icons = {
  play: svg('<path d="M8 5.5v13l10.5-6.5z" fill="currentColor" fill-opacity=".15"/>'),
  pause: svg('<rect x="6.5" y="5.5" width="3.6" height="13" rx="1"/><rect x="13.9" y="5.5" width="3.6" height="13" rx="1"/>'),
  time: svg('<circle cx="12" cy="13.5" r="7.5"/><path d="M12 13.5V9.5M12 13.5l3 1.8M10 2.8h4M18.6 6.4l1.3-1.3"/>'),
  planet: svg(
    '<circle cx="10" cy="14" r="5.2"/><path d="M3.2 17.6c-1-1.9 2.3-4.9 7.2-6.7 4.9-1.8 9.3-1.8 10.2.1"/><path d="M15.5 3.5l4 0 0 4M19.5 3.5l-4.6 4.6"/>',
  ),
  mass: svg(
    '<circle cx="12" cy="12" r="3.6" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.5" ry="3.4" transform="rotate(-18 12 12)"/><path d="M12 5.2a6.8 6.8 0 0 1 6.6 5" opacity=".55"/>',
  ),
  spin: svg(
    '<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3"/><path d="M17.8 2.9l-.3 3.9 3.9.3"/>',
  ),
  layers: svg('<path d="M12 3.5l8.5 4.6L12 12.7 3.5 8.1z"/><path d="M3.5 12.2l8.5 4.6 8.5-4.6"/><path d="M3.5 16.2l8.5 4.6 8.5-4.6" opacity=".55"/>'),
  camera: svg('<rect x="2.8" y="7" width="13" height="10" rx="2.2"/><path d="M15.8 10.6l5.4-3v8.8l-5.4-3"/><circle cx="9.3" cy="12" r="2"/>'),
  scenes: svg(
    '<path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6z"/><path d="M18.5 14.5l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8z"/><path d="M5.5 15.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z"/>',
  ),
  reset: svg('<path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3"/><path d="M6.2 2.9l.3 3.9-3.9.3"/>'),
  screenshot: svg(
    '<path d="M3 8V5.5A2.5 2.5 0 0 1 5.5 3H8M16 3h2.5A2.5 2.5 0 0 1 21 5.5V8M21 16v2.5a2.5 2.5 0 0 1-2.5 2.5H16M8 21H5.5A2.5 2.5 0 0 1 3 18.5V16"/><circle cx="12" cy="12" r="3.4"/>',
  ),
  share: svg(
    '<path d="M10 14a4.2 4.2 0 0 0 6 0l3-3a4.2 4.2 0 0 0-6-6l-1 1"/><path d="M14 10a4.2 4.2 0 0 0-6 0l-3 3a4.2 4.2 0 0 0 6 6l1-1"/>',
  ),
  lang: svg('<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.8 2.7 2.8 15.3 0 18M12 3c-2.8 2.7-2.8 15.3 0 18"/>'),
  settings: svg(
    '<path d="M4 6.5h9M17 6.5h3M4 12h3M11 12h9M4 17.5h11M19 17.5h1"/><circle cx="15" cy="6.5" r="2"/><circle cx="9" cy="12" r="2"/><circle cx="17" cy="17.5" r="2"/>',
  ),
  close: svg('<path d="M6 6l12 12M18 6L6 18"/>'),

  // planet kinds
  rocky: svg('<circle cx="12" cy="12" r="8"/><circle cx="9" cy="9.5" r="1.8"/><circle cx="14.8" cy="14.2" r="2.4"/><circle cx="14.6" cy="7.8" r=".9"/>'),
  gas: svg('<circle cx="12" cy="12" r="8"/><path d="M4.6 9h14.8M4 12.5h16M5 16h14"/><ellipse cx="14.5" cy="14.3" rx="2" ry="1" />'),
  ice: svg('<circle cx="12" cy="12" r="8"/><path d="M12 7v10M7.7 9.5l8.6 5M7.7 14.5l8.6-5"/>'),
  lava: svg('<circle cx="12" cy="12" r="8"/><path d="M6 10.5l3 1.3 1.2 3.2 3.4.6M12.4 4.8l.5 3.4 3.4 1.6 1.7 3.6" />'),

  // camera presets
  camFront: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M2.5 12h4M17.5 12h4"/><path d="M5 12c2-4.5 12-4.5 14 0" opacity=".5"/>'),
  camTop: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="7.5"/><path d="M12 1.5v3"/>'),
  camSide: svg('<circle cx="12" cy="13" r="3" fill="currentColor"/><ellipse cx="12" cy="13" rx="9" ry="3.6" transform="rotate(-12 12 13)"/><path d="M18 3.5l-2.5 3"/>'),
  camClose: svg('<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.3 15.3l5.2 5.2M10.5 7.5v6M7.5 10.5h6"/>'),
  camOrbit: svg('<ellipse cx="12" cy="12" rx="9" ry="4"/><circle cx="12" cy="12" r="2.4" fill="currentColor"/><path d="M18.5 6.8l2.5 1.4-1.4 2.5"/>'),

  // scenes
  sceneTde: svg('<circle cx="12" cy="12" r="2.6" fill="currentColor"/><path d="M20 6c-2-1.5-5-1.2-6.8.4M20 6c.6 2.7-.4 5.4-2.8 7.4-3.8 3.1-9.5 3.2-12.2.6"/><circle cx="20" cy="6" r="1.6"/>'),
  sceneSgr: svg('<circle cx="12" cy="12" r="2" fill="currentColor"/><path d="M12 12c4-1 6 2 4 5s-8 3-10-1-1-10 5-11 11 4 9 9"/>'),
  sceneM87: svg('<circle cx="12" cy="12" r="8.5" stroke-width="3.2" stroke-opacity=".35"/><circle cx="12" cy="12" r="8.5"/><circle cx="12" cy="12" r="4.6" fill="currentColor" fill-opacity=".15"/>'),
  sceneRiver: svg('<circle cx="12" cy="12" r="2.2" fill="currentColor"/><circle cx="12" cy="12" r="6" stroke-dasharray="2 2.4"/><circle cx="12" cy="12" r="9.5" stroke-dasharray="2 3" opacity=".6"/><path d="M12 1.8v4M22.2 12h-4"/>'),
  scenePhoton: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/><ellipse cx="12" cy="12" rx="8.5" ry="6"/><ellipse cx="12" cy="12" rx="6" ry="8.5" transform="rotate(35 12 12)" opacity=".6"/>'),

  // layers
  grid: svg('<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="8.5" ry="3.2"/><ellipse cx="12" cy="12" rx="3.2" ry="8.5"/>'),
  tracers: svg('<circle cx="12" cy="12" r="1.8" fill="currentColor"/><path d="M4 6l3 2M20 6l-3 2M4 18l3-2M20 18l-3-2M12 2.5V6M12 21.5V18"/>'),
  shell: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/><path d="M5 12a7 5.5 0 0 0 14 0 7 5.5 0 0 0-14 0z"/><path d="M8.5 7.3c2-1.6 5-1.6 7 0M8.5 16.7c2 1.6 5 1.6 7 0" opacity=".55"/>'),
  orbits: svg('<circle cx="12" cy="12" r="2.4" fill="currentColor"/><ellipse cx="12" cy="12" rx="9" ry="4.5" transform="rotate(25 12 12)"/><circle cx="19.4" cy="15.2" r="1.3" fill="currentColor"/>'),
  rings: svg('<circle cx="12" cy="12" r="3.5"/><circle cx="12" cy="12" r="6.5" stroke-dasharray="1.5 2"/><circle cx="12" cy="12" r="9.3"/>'),
  lensing: svg('<circle cx="12" cy="12" r="3" fill="currentColor"/><circle cx="12" cy="12" r="6.5"/><path d="M2 5.5c4 0 6 2.5 6.6 4.2M22 18.5c-4 0-6-2.5-6.6-4.2"/>'),
  stars: svg('<path d="M12 4l1.4 4.6L18 10l-4.6 1.4L12 16l-1.4-4.6L6 10l4.6-1.4z"/><circle cx="5" cy="18.5" r=".9" fill="currentColor"/><circle cx="19" cy="18" r=".9" fill="currentColor"/>'),
  disk: svg('<circle cx="12" cy="12" r="2.6" fill="currentColor"/><ellipse cx="12" cy="12" rx="9.5" ry="3.3"/><ellipse cx="12" cy="12" rx="6.3" ry="2.1" opacity=".55"/>'),

} as const;

export type IconName = keyof typeof icons;
