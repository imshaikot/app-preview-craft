// 3D device hero stills. Pass --transparent for a cut-out PNG.
export default {
  studio: {
    id: 'studio',
    name: 'Studio',
    blurb: 'Seamless light-grey sweep, soft contact shadow, three-quarter turn. The catalogue shot.',
    layout: 'showcase',
    palette: { bg: '#f2f3f5', bg2: '#ffffff', bg3: '#dcdfe5', ink: '#111', sub: '#555', accent: '#2563eb', accent2: '#111' },
    background: { kind: 'radial', cx: 50, cy: 40, grain: 0.02 },
    device: { model: 'iphone-17-pro', size: 0.8, pose: [0, -24, 0], y: 0.5 },
    scene: { floor: { y: 0.91, mirror: 0, opacity: 0.32 }, env: 1.15, shadow: { blur: 30 } },
  },

  noir: {
    id: 'noir',
    name: 'Noir',
    blurb: 'Black glass floor, a single beam and a cool rim light on a dark Pro Max.',
    layout: 'showcase',
    palette: { bg: '#030304', bg2: '#17181d', bg3: '#ffffff', ink: '#fff', sub: '#aaa', accent: '#93c5fd', accent2: '#fff' },
    background: { kind: 'spotlight', cy: 5, beam: 0.2, grain: 0.05, vignette: 0.5 },
    device: { model: 'iphone-17-pro-max', size: 0.78, pose: [0, -30, 0], finish: '#2f3036', glare: 0.9 },
    scene: {
      floor: { y: 0.9, mirror: 0.5, opacity: 0.6 },
      ambient: 0.1,
      env: 0.7,
      rims: [{ color: '#93c5fd', intensity: 5, dir: [1, 0.3, -0.7] }],
      key: { dir: [-0.2, 1, 0.4], intensity: 2.6 },
      camera: { pitch: 4 },
    },
  },

  pedestal: {
    id: 'pedestal',
    name: 'Pedestal',
    blurb: 'Pastel set piece: the phone stands on a matte plinth against a two-tone wall.',
    layout: 'pedestal',
    palette: { bg: '#f7d6c9', bg2: '#f2c2b0', bg3: '#fbe8df', ink: '#3b1f14', sub: '#6b4a3c', accent: '#e76f51', accent2: '#264653' },
    background: { kind: 'split', angle: 180, at: 70, grain: 0.04 },
    device: { model: 'iphone-17-pro', finish: '#f1e4dc', size: 0.56, y: 0.45 },
    scene: { plinth: { y: 0.735, height: 0.3, radius: 0.24, color: '#fbe8df' }, env: 1.05, shadow: { blur: 24 } },
  },

  levitate: {
    id: 'levitate',
    name: 'Levitate',
    blurb: 'A tilted phone hovering over a vivid gradient, casting a long soft shadow.',
    layout: 'hero-top',
    palette: { bg: '#4f46e5', bg2: '#db2777', bg3: '#f59e0b', ink: '#fff', sub: '#eee', accent: '#fff', accent2: '#fff' },
    text: { position: 'none' },
    background: { kind: 'gradient', angle: 135, grain: 0.06 },
    device: { model: 'iphone-17-pro', x: 0.5, y: 0.5, size: 0.82, pose: [22, -28, 18], glare: 0.8 },
    scene: { wall: { depth: 0.22, opacity: 0.35 }, shadow: { blur: 34 }, key: { dir: [-0.9, 0.9, 1] } },
  },

  lineup: {
    id: 'lineup',
    name: 'Line-up',
    blurb: 'Every phone model in a row on a dark mirror, each showing a different screen.',
    layout: 'lineup',
    palette: { bg: '#0b0d12', bg2: '#1f2430', bg3: '#ffffff', ink: '#fff', sub: '#aaa', accent: '#fff', accent2: '#fff' },
    background: { kind: 'radial', cx: 50, cy: 35, grain: 0.04, vignette: 0.4 },
    device: { size: 0.6, pose: [0, -12, 0] },
    scene: { floor: { y: 0.84, mirror: 0.3, opacity: 0.45 }, camera: { pitch: 3 } },
  },

  flatlay: {
    id: 'flatlay',
    name: 'Flat lay',
    blurb: 'Top-down desk shot: two phones laid on warm paper with short, crisp shadows.',
    layout: 'flatlay',
    palette: { bg: '#e9dfd2', bg2: '#ddd0bf', bg3: '#cbb9a3', ink: '#222', sub: '#555', accent: '#c2410c', accent2: '#222' },
    background: { kind: 'paper', grain: 0, pattern: 'noise', patternOpacity: 0.25, patternMask: false },
    device: { size: 0.8 },
  },

  'desk-duo': {
    id: 'desk-duo',
    name: 'Desk duo',
    blurb: 'MacBook and phone together, no copy — a clean hero for landing pages.',
    layout: 'laptop-phone',
    palette: { bg: '#dfe7f1', bg2: '#f8fafc', bg3: '#c7d2e0', ink: '#0f172a', sub: '#475569', accent: '#0ea5e9', accent2: '#6366f1' },
    text: { position: 'none' },
    background: { kind: 'radial', cx: 50, cy: 30, grain: 0.02 },
    device: { x: 0.45, y: 0.5, size: 0.56, pose: [10, -18, 0], phone: { x: 0.79, y: 0.6, size: 0.54, pose: [0, -26, 0] } },
    scene: { wall: { depth: 0.08, opacity: 0.25 }, shadow: { blur: 26 } },
  },
}
