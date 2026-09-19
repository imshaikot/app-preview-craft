#!/usr/bin/env node
// The studio: a preview-first editor served on localhost. Every preview is
// the same stage.html the renderer captures, so what you see is what exports.
//
//   node scripts/studio.mjs [--port 4747] [--out dir] [--no-open]
import { spawn } from 'node:child_process'
import { createHash, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { basename, dirname, extname, join, relative, resolve } from 'node:path'
import { CATEGORIES, SIZES } from '../stage/catalog/categories.js'
import { DEVICES, FLAT_FRAMES } from '../stage/catalog/devices.js'
import { FONTS } from '../stage/catalog/fonts.js'
import { LAYOUTS } from '../stage/catalog/layouts.js'
import { BASE } from '../stage/catalog/resolve.js'
import { SCHEMA } from '../stage/catalog/schema.js'
import { THEMES } from '../stage/themes/index.js'
import { launchBrowser } from './browser.mjs'
import { prepareScreen } from './images.mjs'
import { buildJobs, findConfig, loadConfig, loadCustomThemes, renderJob, SAMPLE_BRAND, SAMPLE_SLIDES, SAMPLE_SLIDES_DESK, SAMPLE_SLIDES_TALL, TEMP_ROOT } from './render.mjs'
import { sendFile, SKILL, startServer } from './server.mjs'
import { extractFrames, probe, VIDEO_EXT } from './video.mjs'

const IMAGE_EXT = /\.(png|jpe?g|webp|avif|gif|heic)$/i

function readBody(req, limit = 512 * 1024 * 1024) {
  return new Promise((ok, fail) => {
    const chunks = []
    let size = 0
    req.on('data', (c) => {
      size += c.length
      if (size > limit) {
        fail(new Error('upload too large'))
        req.destroy()
      } else chunks.push(c)
    })
    req.on('end', () => ok(Buffer.concat(chunks)))
    req.on('error', fail)
  })
}

const json = (res, code, body) => {
  res.writeHead(code, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
  res.end(JSON.stringify(body))
}

export async function startStudio({ port = 4747, out, open = true, config: configArg, quiet = false } = {}) {
  const cwd = process.cwd()
  const outDir = resolve(cwd, out ?? '.')
  const session = join(TEMP_ROOT, `studio-${process.pid}`)
  const uploadDir = join(cwd, '.app-preview-craft', 'uploads')
  mkdirSync(session, { recursive: true })

  // Files the browser may read through /file: samples, uploads, and whatever
  // the project config points at. Nothing else on disk is reachable.
  const allowed = new Map()
  const fileUrl = (p) => {
    const id = createHash('sha1').update(p).digest('hex').slice(0, 16)
    allowed.set(id, p)
    return `/file/${id}/${encodeURIComponent(basename(p))}`
  }

  async function describe(p) {
    if (VIDEO_EXT.test(p)) {
      const info = probe(p)
      const key = createHash('sha1').update(p + statSync(p).mtimeMs).digest('hex').slice(0, 12)
      const dir = join(session, `frames-${key}`)
      const fps = 30
      const count = existsSync(dir) ? undefined : await extractFrames(p, dir, { fps, maxHeight: 1400, quality: 5 })
      const frames = count ?? (await import('node:fs')).readdirSync(dir).length
      const base = fileUrl(dir).replace(/[^/]+$/, '')
      return { path: p, kind: 'video', w: info.width, h: info.height, duration: info.duration, frames: { base, count: frames, fps } }
    }
    const { default: sharp } = await import('sharp')
    const m = await sharp(p).metadata()
    return { path: p, kind: 'image', url: fileUrl(p), w: m.width, h: m.height }
  }

  const sampleDir = join(SKILL, 'assets', 'samples')
  const sampleSlides = async (list) =>
    Promise.all(list.map(async (s) => ({ ...s, screen: await describe(join(sampleDir, s.screen)), desktop: s.desktop ? await describe(join(sampleDir, s.desktop)) : undefined })))

  let project = null
  const configPath = configArg ? resolve(cwd, configArg) : findConfig(cwd)
  if (configPath) {
    const cfg = loadConfig(configPath)
    const slides = []
    const missing = []
    for (const s of cfg.slides ?? []) {
      const o = typeof s === 'string' ? { screen: s } : { ...s }
      for (const key of ['screen', 'desktop']) {
        const src = typeof o[key] === 'string' ? o[key] : o[key]?.src
        if (!src) continue
        const p = resolve(cfg.__dir, src)
        if (existsSync(p)) o[key] = await describe(p)
        else {
          o[key] = undefined
          missing.push(relative(cwd, p) || p)
        }
      }
      slides.push(o)
    }
    project = { path: configPath, config: { ...cfg, __dir: undefined }, slides, missing }
    if (missing.length && !quiet) console.error(`  warning: ${missing.length} file(s) in ${basename(configPath)} not found:\n    ${missing.join('\n    ')}`)
  }

  const custom = await loadCustomThemes([], cwd)
  let browser = null
  const renders = new Map()
  const prepared = new Map()

  async function api(req, res, url) {
    const path = url.pathname
    if (path.startsWith('/file/')) {
      const [, , id, ...rest] = path.split('/')
      const base = allowed.get(id)
      if (!base) return json(res, 404, { error: 'unknown file' }), true
      // Directory handles (frame folders) serve their children.
      const target = statSync(base).isDirectory() ? join(base, decodeURIComponent(rest.at(-1))) : base
      if (!target.startsWith(base)) return json(res, 403, { error: 'outside' }), true
      sendFile(req, res, target)
      return true
    }
    if (!path.startsWith('/api/')) return false
    try {
      if (path === '/api/state' && req.method === 'GET') {
        json(res, 200, {
          cwd,
          outDir,
          uploadDir: relative(cwd, uploadDir),
          catalog: {
            categories: CATEGORIES,
            sizes: SIZES,
            devices: Object.fromEntries(Object.entries(DEVICES).map(([k, d]) => [k, { name: d.name, kind: d.kind, credit: d.credit }])),
            flat: FLAT_FRAMES,
            fonts: FONTS,
            layouts: LAYOUTS,
            schema: SCHEMA,
            base: BASE,
          },
          themes: THEMES,
          custom,
          samples: { slides: await sampleSlides(SAMPLE_SLIDES), tall: await sampleSlides(SAMPLE_SLIDES_TALL), desk: await sampleSlides(SAMPLE_SLIDES_DESK), brand: SAMPLE_BRAND },
          project,
        })
        return true
      }
      if (path === '/api/upload' && req.method === 'POST') {
        const name = basename(url.searchParams.get('name') ?? `upload-${Date.now()}.png`).replace(/[^\w.\- ]+/g, '_')
        if (!IMAGE_EXT.test(name) && !VIDEO_EXT.test(name)) return json(res, 415, { error: `unsupported file type: ${extname(name)}` }), true
        const buf = await readBody(req)
        mkdirSync(uploadDir, { recursive: true })
        let dst = join(uploadDir, name)
        if (existsSync(dst) && !readFileSync(dst).equals(buf)) dst = join(uploadDir, `${basename(name, extname(name))}-${randomBytes(2).toString('hex')}${extname(name)}`)
        writeFileSync(dst, buf)
        json(res, 200, await describe(dst))
        return true
      }
      if (path === '/api/prepare' && req.method === 'POST') {
        // Preview a screen treatment (status bar, tint, duotone…) through sharp.
        const { path: src, treatment } = JSON.parse(await readBody(req))
        if (![...allowed.values()].includes(src)) return json(res, 403, { error: 'unknown file' }), true
        const key = createHash('sha1').update(JSON.stringify([src, treatment])).digest('hex').slice(0, 16)
        if (!prepared.has(key)) {
          prepared.set(key, prepareScreen(src, join(session, 'prepared'), treatment, { name: key, maxHeight: 1800 }).then((r) => ({ url: fileUrl(r.file), backdrop: fileUrl(r.backdrop), w: r.w, h: r.h })))
        }
        json(res, 200, await prepared.get(key))
        return true
      }
      if (path === '/api/render' && req.method === 'POST') {
        const body = JSON.parse(await readBody(req))
        const id = randomBytes(4).toString('hex')
        const status = { id, fraction: 0, label: 'starting', files: [], error: null, done: false, started: Date.now() }
        renders.set(id, status)
        const controller = new AbortController()
        status.abort = () => controller.abort()
        ;(async () => {
          try {
            browser ??= await launchBrowser()
            const cli = { ...body.job, out: body.job.out ? resolve(cwd, body.job.out) : outDir, quiet: true }
            const [job] = buildJobs({ cli })
            job.__dir = cwd
            const r = await renderJob(job, {
              custom: { ...custom, ...(body.custom ?? {}) },
              browser,
              server,
              log: (m) => (status.label = String(m).trim()),
              onProgress: (f, label) => Object.assign(status, { fraction: f, label }),
              signal: controller.signal,
            })
            status.files = [...r.files, ...r.creditFiles].map((f) => ({ path: f, rel: relative(cwd, f) }))
          } catch (err) {
            status.error = String(err?.message ?? err)
          } finally {
            status.done = true
            status.fraction = 1
          }
        })()
        json(res, 200, { id })
        return true
      }
      const m = path.match(/^\/api\/render\/(\w+)(\/cancel)?$/)
      if (m) {
        const status = renders.get(m[1])
        if (!status) return json(res, 404, { error: 'no such render' }), true
        if (m[2]) status.abort()
        const { abort, ...rest } = status
        json(res, 200, rest)
        return true
      }
      if (path === '/api/theme' && req.method === 'POST') {
        const { id, theme } = JSON.parse(await readBody(req))
        const safe = String(id).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-|-$/g, '')
        if (!safe) throw new Error('theme needs a name')
        const dir = join(cwd, '.app-preview-craft', 'themes')
        mkdirSync(dir, { recursive: true })
        const file = join(dir, `${safe}.json`)
        writeFileSync(file, JSON.stringify({ ...theme, id: safe }, null, 2) + '\n')
        custom[safe] = { ...theme, id: safe, file }
        json(res, 200, { id: safe, file: relative(cwd, file) })
        return true
      }
      if (path === '/api/config' && req.method === 'POST') {
        const { config } = JSON.parse(await readBody(req))
        const file = configPath ?? join(cwd, 'app-preview-craft.json')
        // Store slide paths relative to the config file so it stays portable.
        const dir = dirname(file)
        const rel = (p) => (p ? relative(dir, p) || p : undefined)
        config.slides = (config.slides ?? []).map((s) => ({ ...s, screen: rel(s.screen), desktop: rel(s.desktop) }))
        writeFileSync(file, JSON.stringify(config, null, 2) + '\n')
        json(res, 200, { file: relative(cwd, file) || file })
        return true
      }
      if (path === '/api/reveal' && req.method === 'POST') {
        const { path: p } = JSON.parse(await readBody(req))
        const target = resolve(cwd, p)
        if (!target.startsWith(cwd) && !target.startsWith(outDir)) return json(res, 403, { error: 'outside project' }), true
        const cmd = process.platform === 'darwin' ? ['open', ['-R', target]] : process.platform === 'win32' ? ['explorer', [`/select,${target}`]] : ['xdg-open', [dirname(target)]]
        spawn(cmd[0], cmd[1], { stdio: 'ignore', detached: true }).unref()
        json(res, 200, { ok: true })
        return true
      }
      json(res, 404, { error: 'no such endpoint' })
      return true
    } catch (err) {
      json(res, 500, { error: String(err?.message ?? err) })
      return true
    }
  }

  let server
  for (let p = port; p < port + 20; p++) {
    try {
      server = await startServer({ port: p, api })
      break
    } catch (err) {
      if (err.code !== 'EADDRINUSE') throw err
    }
  }
  if (!server) throw new Error(`no free port in ${port}..${port + 19}`)
  const link = `${server.origin}/studio/`
  if (!quiet) {
    console.error(`\n  app-preview-craft studio  →  ${link}`)
    console.error(`  project: ${cwd}${project ? `  (config: ${relative(cwd, project.path)})` : ''}`)
    console.error(`  exports: ${outDir}\n  Ctrl+C to stop.\n`)
  }
  if (open) {
    const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'start' : 'xdg-open'
    spawn(opener, [link], { stdio: 'ignore', detached: true, shell: process.platform === 'win32' }).unref()
  }
  const close = async () => {
    await browser?.close().catch(() => {})
    await server.close()
  }
  if (!quiet) {
    const shutdown = () => close().then(() => process.exit(0))
    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)
  }
  return { server: { ...server, close }, link }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2)
  const get = (k) => {
    const i = args.indexOf(k)
    return i >= 0 ? args[i + 1] : undefined
  }
  startStudio({ port: Number(get('--port') ?? 4747), out: get('--out'), open: !args.includes('--no-open'), config: get('--config') })
}
