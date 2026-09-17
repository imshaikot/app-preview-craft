#!/usr/bin/env node
// Invariants for the whole pipeline. Each check renders into a private temp
// dir and inspects the files — pixels, sizes, alpha, streams, metadata.
//
//   node scripts/selftest.mjs [--quick] [--only <substring>]
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { CATEGORIES, SIZES } from '../stage/catalog/categories.js'
import { DEVICES } from '../stage/catalog/devices.js'
import { FONTS } from '../stage/catalog/fonts.js'
import { LAYOUTS } from '../stage/catalog/layouts.js'
import { coerce, resolveTheme } from '../stage/catalog/resolve.js'
import { THEMES } from '../stage/themes/index.js'
import { markup } from '../stage/lib/text.js'
import { launchBrowser } from './browser.mjs'
import { buildJobs, loadCustomThemes, renderJob } from './render.mjs'
import { SKILL, startServer } from './server.mjs'
import { hasFfmpeg, probe } from './video.mjs'

const args = process.argv.slice(2)
const quick = args.includes('--quick')
const only = args.includes('--only') ? args[args.indexOf('--only') + 1] : null
const ROOT = join(tmpdir(), 'app-preview-craft', `selftest-${process.pid}`)
const SAMPLES = join(SKILL, 'assets', 'samples')
mkdirSync(ROOT, { recursive: true })

const results = []
let server
let browser
async function check(name, fn) {
  if (only && !name.includes(only)) return
  const t0 = Date.now()
  try {
    await fn()
    results.push([true, name, Date.now() - t0])
    console.log(`  ✓ ${name}  (${((Date.now() - t0) / 1000).toFixed(1)}s)`)
  } catch (err) {
    results.push([false, name, Date.now() - t0])
    console.log(`  ✗ ${name}\n      ${String(err?.stack ?? err).split('\n').slice(0, 4).join('\n      ')}`)
  }
}
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg)
}
const render = async (cli, sub = cli.category) => {
  const out = join(ROOT, sub)
  const [job] = buildJobs({ cli: { quiet: true, out, ...cli } })
  return renderJob(job, { browser, server, log: () => {}, custom: await loadCustomThemes([], out) })
}
const ffprobe = (file) => JSON.parse(spawnSync('ffprobe', ['-v', 'error', '-print_format', 'json', '-show_streams', '-show_format', file], { encoding: 'utf8' }).stdout)

/** Standard deviation of luminance inside a region: a blank screen is flat. */
async function detail(file, [x, y, w, h]) {
  const img = sharp(file)
  const m = await img.metadata()
  const { data } = await sharp(file)
    .extract({ left: Math.round(x * m.width), top: Math.round(y * m.height), width: Math.round(w * m.width), height: Math.round(h * m.height) })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true })
  let sum = 0
  let sq = 0
  for (const v of data) {
    sum += v
    sq += v * v
  }
  const mean = sum / data.length
  return Math.sqrt(sq / data.length - mean * mean)
}

console.log(`app-preview-craft selftest → ${ROOT}\n`)

/* ── catalog ───────────────────────────────────────────────────────────── */

await check('SKILL.md frontmatter uses only spec keys, a matching name and a short description', () => {
  const fm = readFileSync(join(SKILL, 'SKILL.md'), 'utf8').split(/^---$/m)[1]
  // Nested metadata keys are indented, so only top-level keys match.
  const keys = [...fm.matchAll(/^([\w-]+):/gm)].map((m) => m[1])
  const allowed = ['name', 'description', 'license', 'compatibility', 'metadata', 'allowed-tools']
  const bad = keys.filter((k) => !allowed.includes(k))
  assert(!bad.length, `unexpected frontmatter keys: ${bad}`)
  assert(/^name: app-preview-craft$/m.test(fm), 'name must match the folder name')
  const description = fm.match(/^description: "(.*)"$/m)?.[1] ?? ''
  assert(description.length > 0 && description.length <= 1024, `description is ${description.length} chars`)
  const compatibility = fm.match(/^compatibility: "(.*)"$/m)?.[1] ?? ''
  assert(compatibility.length <= 500, `compatibility is ${compatibility.length} chars`)
})
await check('every category has at least five themes', () => {
  for (const c of Object.keys(CATEGORIES)) assert(Object.keys(THEMES[c] ?? {}).length >= 5, `${c} has ${Object.keys(THEMES[c] ?? {}).length}`)
})
await check('every theme resolves to a layout of its category kind, with known fonts and devices', () => {
  for (const [c, list] of Object.entries(THEMES)) {
    for (const id of Object.keys(list)) {
      const t = resolveTheme(c, id)
      assert(LAYOUTS[t.layout], `${c}/${id}: unknown layout ${t.layout}`)
      assert(LAYOUTS[t.layout].kind === CATEGORIES[c].kind, `${c}/${id}: ${t.layout} is a ${LAYOUTS[t.layout].kind}`)
      for (const f of [t.type.display, t.type.body, t.type.italicFont].filter(Boolean)) assert(FONTS[f], `${c}/${id}: unknown font ${f}`)
      assert(DEVICES[t.device.model], `${c}/${id}: unknown device ${t.device.model}`)
      for (const d of t.devices ?? []) assert(DEVICES[d], `${c}/${id}: unknown device ${d}`)
      assert(t.id === id, `${c}/${id}: id mismatch`)
    }
  }
})
await check('every category size exists and every font package is installed', () => {
  for (const c of Object.values(CATEGORIES)) for (const s of c.sizes) assert(SIZES[s], `unknown size ${s}`)
  for (const f of Object.values(FONTS)) for (const css of f.css) assert(existsSync(join(SKILL, 'node_modules', f.pkg, css)), `${f.pkg}/${css} missing`)
})
await check('every device model file is present with a CC-BY credit', () => {
  const credits = JSON.parse(readFileSync(join(SKILL, 'assets', 'models', 'credits.json'), 'utf8'))
  for (const [id, d] of Object.entries(DEVICES)) {
    assert(existsSync(join(SKILL, 'assets', 'models', d.file)), `${d.file} missing`)
    assert(d.credit.author && d.credit.license.startsWith('CC-BY'), `${id} credit incomplete`)
    assert(credits.some((c) => c.id === id), `${id} not in credits.json`)
  }
})
await check('--set values are coerced by the schema', () => {
  assert(coerce('device.pose', '1, 2,3').join() === '1,2,3', 'pose')
  assert(coerce('type.size', '1.2') === 1.2, 'range')
  assert(coerce('background.panorama', 'yes') === true, 'bool')
  assert(coerce('device.finish', 'null') === null, 'null')
  assert(Array.isArray(coerce('decor', '[{"kind":"sparkles"}]')), 'json')
})
await check('*highlight* markup keeps trailing punctuation with its word', () => {
  const html = markup('Train *smarter*, not longer')
  assert(/<span class="w"><span class="hl hl-l hl-r">smarter<\/span>,<\/span>/.test(html), html)
  const multi = markup('*one glance*')
  assert(multi.includes('hl-gap') && multi.includes('hl-l') && multi.includes('hl-r'), multi)
})

server = await startServer()
browser = await launchBrowser()
try {
  /* ── stills ────────────────────────────────────────────────────────── */

  await check('app-store set: one file per slide at the exact size, opaque, plus a sheet and credits', async () => {
    const r = await render({ category: 'app-store', theme: 'stride', size: 'iphone-6.9' })
    const shots = r.files.filter((f) => /\/\d\d-.*\.png$/.test(f))
    assert(shots.length === 5, `expected 5 screenshots, got ${shots.length}`)
    for (const f of shots) {
      const m = await sharp(f).metadata()
      assert(m.width === 1320 && m.height === 2868, `${f} is ${m.width}×${m.height}`)
      assert(!m.hasAlpha, `${f} has an alpha channel (App Store Connect rejects those)`)
    }
    assert(r.files.some((f) => f.endsWith('overview.png')), 'no contact sheet')
    assert(r.creditFiles.length === 1 && readFileSync(r.creditFiles[0], 'utf8').includes('Ranguel'), 'credits missing')
  })

  await check('3D screens show the screenshot, not a blank panel', async () => {
    const r = await render({ category: 'app-store', theme: 'ledger', size: '660x1434', set: [['device.pose', '0,0,0']], index: 0 }, 'blank-check')
    const sd = await detail(r.files[0], [0.4, 0.55, 0.2, 0.15])
    assert(sd > 12, `screen region is flat (σ=${sd.toFixed(1)}) — texture not showing`)
  })

  await check('a slide without a screen renders a blank display instead of failing', async () => {
    const r = await render({ category: 'app-store', theme: 'ledger', size: '440x956', slides: [{ title: 'No *screen* yet' }, { screen: join(SAMPLES, 'tempo-02.png'), title: 'Has one' }], sheet: false }, 'no-screen')
    assert(r.files.length === 2, `expected 2 files, got ${r.files.length}`)
  })

  await check('flat-only renders write no CREDITS.txt', async () => {
    const r = await render({ category: 'app-store', theme: 'canvas', size: '660x1434', index: 0 }, 'flat-only')
    assert(r.creditFiles.length === 0, 'credits written for a render without 3D models')
  })

  await check('transparent mockup keeps alpha with clear corners', async () => {
    const r = await render({ category: 'device-mockup', theme: 'studio', size: '800x600', transparent: true }, 'transparent')
    const m = await sharp(r.files[0]).metadata()
    assert(m.hasAlpha, 'no alpha channel')
    const { data } = await sharp(r.files[0]).extract({ left: 0, top: 0, width: 4, height: 4 }).raw().toBuffer({ resolveWithObject: true })
    assert(data[3] === 0, `corner alpha is ${data[3]}`)
  })

  await check('custom theme file extends a built-in, and --set wins over it', async () => {
    const dir = join(ROOT, 'custom', '.app-preview-craft', 'themes')
    mkdirSync(dir, { recursive: true })
    writeFileSync(join(dir, 'brandy.json'), JSON.stringify({ extends: 'app-store/sizzle', palette: { bg: '#00ff00' } }))
    const [job] = buildJobs({ cli: { category: 'app-store', theme: 'brandy', size: '400x868', index: 0, quiet: true, out: join(ROOT, 'custom'), set: [['background.pattern', 'none'], ['background.shapes', '[]'], ['decor', '[]']] } })
    const r = await renderJob(job, { browser, server, log: () => {}, custom: await loadCustomThemes([], join(ROOT, 'custom')) })
    const { data } = await sharp(r.files[0]).extract({ left: 392, top: 4, width: 2, height: 2 }).raw().toBuffer({ resolveWithObject: true })
    assert(data[1] > 200 && data[0] < 60, `expected the custom green background, got rgb(${data[0]},${data[1]},${data[2]})`)
  })

  await check('screen treatment: duotone reaches the rendered screen', async () => {
    const r = await render({ category: 'social-card', theme: 'editorial', size: 'og' }, 'duotone')
    const { data } = await sharp(r.files[0]).extract({ left: 820, top: 250, width: 60, height: 60 }).raw().toBuffer({ resolveWithObject: true })
    let chroma = 0
    for (let i = 0; i < data.length; i += 3) chroma += Math.max(data[i], data[i + 1], data[i + 2]) - Math.min(data[i], data[i + 1], data[i + 2])
    assert(chroma / (data.length / 3) < 40, `screen still colourful (mean chroma ${(chroma / (data.length / 3)).toFixed(1)})`)
  })

  await check('user screenshot of a different aspect is accepted (tablet frame on iPad size)', async () => {
    const r = await render({ category: 'app-store', theme: 'serene', size: 'ipad-13', index: 0, slides: [{ screen: join(SAMPLES, 'tempo-desktop.png'), title: 'Wide *input*' }] }, 'ipad')
    const m = await sharp(r.files[0]).metadata()
    assert(m.width === 2064 && m.height === 2752, `${m.width}×${m.height}`)
  })

  if (!quick) {
    for (const [c, list] of Object.entries(THEMES)) {
      await check(`every ${c} theme renders without page errors`, async () => {
        for (const id of Object.keys(list)) {
          const kind = CATEGORIES[c].kind
          const size = c === 'app-store' ? '440x956' : kind === 'video' ? '540x960' : '800x500'
          const r = await render({ category: c, theme: id, size, index: 0, frames: kind === 'video' ? ['mid'] : undefined, scale: 1 }, `themes/${c}`)
          assert(r.files.length >= 1, `${id}: nothing rendered`)
        }
      })
    }
  }

  /* ── studio ────────────────────────────────────────────────────────── */

  await check('studio loads, previews every slide and switches category without errors', async () => {
    const { startStudio } = await import('./studio.mjs')
    // An empty project dir, so a config in the caller's cwd cannot change the slide count.
    const cwd = process.cwd()
    const dir = join(ROOT, 'studio-project')
    mkdirSync(dir, { recursive: true })
    process.chdir(dir)
    const { server: studio, link } = await startStudio({ port: 0, open: false, quiet: true }).finally(() => process.chdir(cwd))
    const page = await browser.newPage()
    try {
      await page.setViewport({ width: 1440, height: 900 })
      const errors = []
      page.on('pageerror', (e) => errors.push(String(e)))
      await page.evaluateOnNewDocument(() => localStorage.clear())
      await page.goto(link, { waitUntil: 'load' })
      const settled = (n) =>
        page.waitForFunction((count) => {
          const frames = [...document.querySelectorAll('.frame')]
          return frames.length === count && frames.every((f) => !f.classList.contains('busy')) && frames.every((f) => f.querySelector('iframe').contentWindow.stage?.ready)
        }, { timeout: 60_000 }, n)
      await settled(5)
      const failures = await page.$$eval('.frame .error', (els) => els.map((e) => e.textContent.slice(0, 200)))
      assert(!failures.length, `preview errors: ${failures.join(' | ')}`)
      await page.keyboard.press('4') // device-video
      await settled(1)
      assert(await page.$eval('#transport', (el) => !el.hidden), 'video transport hidden')
      assert(!errors.length, errors.join('\n'))
    } finally {
      await page.close()
      await studio.close()
    }
  })

  /* ── video ─────────────────────────────────────────────────────────── */

  if (!hasFfmpeg()) {
    console.log('  - ffmpeg missing: video checks skipped')
  } else {
    await check('device video: requested duration, 30fps, H.264, credits in metadata', async () => {
      const r = await render({ category: 'device-video', theme: 'turntable', size: '540x960', duration: 3 }, 'video')
      const info = ffprobe(r.files[0])
      const v = info.streams.find((s) => s.codec_type === 'video')
      assert(v.codec_name === 'h264' && v.pix_fmt === 'yuv420p', `${v.codec_name}/${v.pix_fmt}`)
      assert(Math.abs(Number(info.format.duration) - 3) < 0.1, `duration ${info.format.duration}`)
      assert(v.r_frame_rate === '30/1', v.r_frame_rate)
      assert(/Ranguel/.test(info.format.tags?.comment ?? ''), 'no credit in metadata')
    })

    await check('screen recordings drive the timeline (slide holds for the clip length)', async () => {
      const r = await render({ category: 'screen-video', theme: 'store-preview', size: '443x960', duration: 2, slides: [{ screen: join(SAMPLES, 'tempo-recording.mp4'), title: 'Live' }, { screen: join(SAMPLES, 'tempo-02.png'), title: 'Map', hold: 1 }] }, 'recording')
      const d = probe(r.files[0]).duration
      // 3.5s clip + 1s hold + the theme's 0.8s end hold; motion.duration is ignored
      assert(Math.abs(d - 5.3) < 0.15, `duration ${d}, expected ~5.3`)
    })

    await check('app-preview size gets a silent stereo AAC track', async () => {
      const r = await render({ category: 'screen-video', theme: 'store-preview', size: 'app-preview', duration: 2, fps: 30 }, 'preview')
      const a = ffprobe(r.files[0]).streams.find((s) => s.codec_type === 'audio')
      assert(a && a.codec_name === 'aac' && a.channels === 2, 'no stereo aac track')
    })

    await check('transparent ProRes 4444 keeps alpha', async () => {
      const r = await render({ category: 'device-video', theme: 'float', size: '360x640', duration: 1, format: 'mov', transparent: true }, 'alpha')
      const v = ffprobe(r.files[0]).streams.find((s) => s.codec_type === 'video')
      assert(v.codec_name === 'prores' && /yuva/.test(v.pix_fmt), `${v.codec_name}/${v.pix_fmt}`)
    })

    await check('gif export', async () => {
      const r = await render({ category: 'screen-video', theme: 'stack', size: '360x640', duration: 2, format: 'gif' }, 'gif')
      const m = await sharp(r.files[0], { animated: true }).metadata()
      assert(m.format === 'gif' && m.pages > 10, `${m.format} with ${m.pages} frames`)
    })
  }
} finally {
  await browser.close()
  await server.close()
}

const failed = results.filter(([ok]) => !ok)
console.log(`\n${results.length - failed.length}/${results.length} passed${failed.length || args.includes('--keep') ? ` — renders kept in ${ROOT}` : ''}`)
if (!failed.length && !args.includes('--keep')) rmSync(ROOT, { recursive: true, force: true })
process.exitCode = failed.length ? 1 : 0
