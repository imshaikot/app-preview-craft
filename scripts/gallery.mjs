// One thumbnail per theme, labelled, on a single sheet — the quickest way to
// show someone what a category can look like before rendering at full size.
//
//   node cli.mjs gallery <category> [--size key] [--out dir]
import { mkdirSync, rmSync } from 'node:fs'
import { join, relative } from 'node:path'
import sharp from 'sharp'
import { CATEGORIES } from '../stage/catalog/categories.js'
import { resolveSize } from '../stage/catalog/resolve.js'
import { THEMES } from '../stage/themes/index.js'
import { launchBrowser } from './browser.mjs'
import { buildJobs, loadCustomThemes, renderJob, TEMP_ROOT } from './render.mjs'
import { startServer } from './server.mjs'

const esc = (s) => String(s).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' })[c])

export async function renderGallery(category, { size, out, frames, themes, thumb = 520, density = 2, log = console.error } = {}) {
  const cat = CATEGORIES[category]
  if (!cat) throw new Error(`unknown category "${category}"`)
  const full = resolveSize(category, size)
  const custom = await loadCustomThemes()
  const ids = themes ?? Object.keys(THEMES[category])
  // The sheet is laid out in `thumb` units and drawn at `density` (less when
  // that would pass 3400px), so it stays sharp on a retina display.
  const aspect = full.w / full.h
  const cols = Math.min(ids.length, aspect > 1 ? 3 : 5)
  const cw1 = Math.round(thumb * Math.min(1, aspect) * (aspect > 1 ? 1.6 : 1))
  const D = Math.max(1, Math.min(density, 3400 / (cols * (cw1 + 28) + 28)))
  const cw = Math.round(cw1 * D)
  const ch = Math.round(cw / aspect)
  const k = Math.min(1, Math.max(1100, cw, ch) / Math.max(full.w, full.h))
  const small = `${Math.round((full.w * k) / 2) * 2}x${Math.round((full.h * k) / 2) * 2}`
  const tmp = join(TEMP_ROOT, `gallery-${process.pid}`)
  mkdirSync(tmp, { recursive: true })
  const server = await startServer()
  const browser = await launchBrowser()
  const cells = []
  try {
    for (const id of ids) {
      const [job] = buildJobs({ cli: { category, theme: id, size: small, out: tmp, name: id, index: 0, quiet: true, sheet: false, frames: cat.kind === 'video' ? [frames ?? 'mid'] : undefined, scale: 1 } })
      const r = await renderJob(job, { custom, browser, server, log: () => {} })
      const file = r.files[0]
      const t = THEMES[category][id] ?? custom[id]
      cells.push({ file, name: t.name ?? id, id, sub: t.appCategory ?? t.layout })
      log(`  · ${id}`)
    }
  } finally {
    await browser.close()
    await server.close()
  }

  const rows = Math.ceil(cells.length / cols)
  const pad = Math.round(28 * D)
  const label = Math.round(64 * D)
  const head = Math.round(70 * D)
  const W = cols * (cw + pad) + pad
  const H = rows * (ch + label + pad) + pad + head
  const comps = [
    {
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${head}"><text x="${pad}" y="${46 * D}" font-family="Helvetica Neue, Arial" font-size="${30 * D}" font-weight="700" fill="#fff">${esc(cat.name)}</text><text x="${W - pad}" y="${46 * D}" text-anchor="end" font-family="Helvetica Neue, Arial" font-size="${20 * D}" fill="#9a9aa6">${cells.length} themes · ${full.key} ${full.w}×${full.h}</text></svg>`),
      left: 0,
      top: 0,
    },
  ]
  for (const [i, c] of cells.entries()) {
    const x = pad + (i % cols) * (cw + pad)
    const y = head + pad + Math.floor(i / cols) * (ch + label + pad)
    comps.push({ input: await sharp(c.file).resize(cw, ch).png().toBuffer(), left: x, top: y })
    comps.push({
      input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cw}" height="${label}"><text x="${2 * D}" y="${28 * D}" font-family="Helvetica Neue, Arial" font-size="${22 * D}" font-weight="700" fill="#fff">${esc(c.name)}  <tspan fill="#8b8b99" font-weight="400" font-size="${17 * D}">${esc(c.id)}</tspan></text><text x="${2 * D}" y="${52 * D}" font-family="Helvetica Neue, Arial" font-size="${16 * D}" fill="#8b8b99">${esc(c.sub ?? '')}</text></svg>`),
      left: x,
      top: y + ch + Math.round(4 * D),
    })
  }
  const dir = out ?? process.cwd()
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `gallery-${category}.png`)
  await sharp({ create: { width: W, height: H, channels: 3, background: '#111114' } }).composite(comps).png({ compressionLevel: 9 }).toFile(file)
  rmSync(tmp, { recursive: true, force: true })
  log(`  ✓ ${relative(process.cwd(), file) || file}`)
  return { file, themes: cells.map((c) => c.id) }
}
