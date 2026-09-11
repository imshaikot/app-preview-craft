// Self-hosted fonts (Fontsource, all SIL OFL). Served from node_modules at
// /fonts/<package>/<css>, so renders never depend on Google Fonts.
export const FONTS = {
  inter: { family: 'Inter Variable', pkg: '@fontsource-variable/inter', css: ['index.css'], kind: 'sans' },
  manrope: { family: 'Manrope Variable', pkg: '@fontsource-variable/manrope', css: ['index.css'], kind: 'sans' },
  jakarta: { family: 'Plus Jakarta Sans Variable', pkg: '@fontsource-variable/plus-jakarta-sans', css: ['index.css'], kind: 'sans' },
  'space-grotesk': { family: 'Space Grotesk Variable', pkg: '@fontsource-variable/space-grotesk', css: ['index.css'], kind: 'sans' },
  sora: { family: 'Sora Variable', pkg: '@fontsource-variable/sora', css: ['index.css'], kind: 'sans' },
  outfit: { family: 'Outfit Variable', pkg: '@fontsource-variable/outfit', css: ['index.css'], kind: 'sans' },
  nunito: { family: 'Nunito Variable', pkg: '@fontsource-variable/nunito', css: ['index.css'], kind: 'rounded' },
  bricolage: { family: 'Bricolage Grotesque Variable', pkg: '@fontsource-variable/bricolage-grotesque', css: ['index.css'], kind: 'display' },
  syne: { family: 'Syne Variable', pkg: '@fontsource-variable/syne', css: ['index.css'], kind: 'display' },
  unbounded: { family: 'Unbounded Variable', pkg: '@fontsource-variable/unbounded', css: ['index.css'], kind: 'display' },
  'big-shoulders': { family: 'Big Shoulders Display Variable', pkg: '@fontsource-variable/big-shoulders-display', css: ['index.css'], kind: 'condensed' },
  fraunces: { family: 'Fraunces Variable', pkg: '@fontsource-variable/fraunces', css: ['index.css', 'wght-italic.css'], kind: 'serif' },
  playfair: { family: 'Playfair Display Variable', pkg: '@fontsource-variable/playfair-display', css: ['index.css', 'wght-italic.css'], kind: 'serif' },
  'dm-serif': { family: 'DM Serif Display', pkg: '@fontsource/dm-serif-display', css: ['index.css', '400-italic.css'], kind: 'serif' },
  'instrument-serif': { family: 'Instrument Serif', pkg: '@fontsource/instrument-serif', css: ['index.css', '400-italic.css'], kind: 'serif' },
  'jetbrains-mono': { family: 'JetBrains Mono Variable', pkg: '@fontsource-variable/jetbrains-mono', css: ['index.css'], kind: 'mono' },
  'press-start': { family: 'Press Start 2P', pkg: '@fontsource/press-start-2p', css: ['index.css'], kind: 'pixel' },
  caveat: { family: 'Caveat', pkg: '@fontsource/caveat', css: ['index.css', '700.css'], kind: 'hand' },
}

// Single quotes: stacks are also interpolated into style="…" attributes.
export const fontStack = (id) => {
  const f = FONTS[id]
  if (!f) return 'system-ui, sans-serif'
  const tail = { serif: 'Georgia, serif', mono: 'ui-monospace, monospace', hand: 'cursive' }[f.kind] ?? 'system-ui, sans-serif'
  return `'${f.family}', ${tail}`
}
