// The stage: one page renders one output (a still slide or a whole video).
//
//   await stage.load(spec)   build everything; resolves when fonts, images and
//                            models are ready
//   await stage.seek(t)      pose every layer for time t and paint a frame
//
// spec = {category, theme (resolved object), width, height, slides, index,
//         count, brand, pixelRatio, editable, animated, credits}
import { FONTS } from './catalog/fonts.js'
import { DEVICES } from './catalog/devices.js'
import { LAYOUTS } from './catalog/layouts.js'
import { merge } from './catalog/resolve.js'
import { buildBackground } from './lib/backgrounds.js'
import { buildDecor } from './lib/decor.js'
import { FlatDevice } from './lib/flat.js'
import { makeSource } from './lib/screen.js'
import { STILL } from './layouts/still.js'
import { MOTION } from './layouts/motion.js'

const IMPL = { ...STILL, ...MOTION }
const $ = (id) => document.getElementById(id)
const nextFrame = () => new Promise((r) => requestAnimationFrame(() => r()))

const loadedCss = new Set()
async function loadFonts(ids, base) {
  const links = []
  for (const id of ids) {
    const f = FONTS[id]
    if (!f) continue
    for (const css of f.css) {
      const href = `${base}${f.pkg}/${css}`
      if (loadedCss.has(href)) continue
      loadedCss.add(href)
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = href
      links.push(new Promise((ok) => ((link.onload = ok), (link.onerror = ok))))
      document.head.append(link)
    }
  }
  await Promise.all(links)
  const probes = []
  for (const id of ids) {
    const f = FONTS[id]
    if (!f) continue
    for (const w of [400, 600, 800]) probes.push(document.fonts.load(`${w} 40px "${f.family}"`, 'AaBb123'))
    probes.push(document.fonts.load(`italic 400 40px "${f.family}"`, 'Aa'))
  }
  await Promise.allSettled(probes)
  await document.fonts.ready
}

class Stage {
  constructor() {
    this.root = $('stage')
    this.layers = { bg: $('bg'), back: $('back'), mid: $('mid'), front: $('front') }
    this.three = null
    this.ready = false
  }

  reset() {
    this.stop?.()
    this.ready = false
    for (const l of Object.values(this.layers)) {
      l.innerHTML = ''
      l.removeAttribute('style')
    }
    if (this.three) {
      this.three.dispose()
      this.three = null
    }
    // A fresh canvas: a WebGL context cannot be re-created on the old one.
    const old = $('gl')
    const canvas = document.createElement('canvas')
    canvas.id = 'gl'
    old.replaceWith(canvas)
    this.canvas = canvas
  }

  async load(spec) {
    this.reset()
    this.spec = spec
    const W = spec.width
    const H = spec.height
    const index = spec.index ?? 0
    const slides = spec.slides?.length ? spec.slides : [{}]
    const slide = slides[index] ?? {}
    // Per-slide overrides apply to stills only; a video has one theme.
    const theme = spec.animated && spec.kind === 'video' ? spec.theme : merge(spec.theme, slide.theme)
    this.theme = theme
    const warnings = []

    Object.assign(this.root.style, { width: `${W}px`, height: `${H}px` })
    document.documentElement.style.setProperty('--W', `${W}px`)
    document.documentElement.style.setProperty('--H', `${H}px`)
    document.body.style.background = spec.transparent ? 'transparent' : theme.palette.bg

    const assetBase = spec.assetBase ?? '/'
    const fontIds = new Set([theme.type.display, theme.type.body, theme.type.italicFont, 'caveat'].filter(Boolean))
    const fontsP = loadFonts(fontIds, `${assetBase}fonts/`)

    const sources = slides.map((s) => makeSource(s.screen))
    const desktopSources = slides.map((s) => makeSource(s.desktop))
    await Promise.all([...sources, ...desktopSources].filter(Boolean).map((s) => s.load()))
    await fontsP

    const layoutMeta = LAYOUTS[theme.layout]
    const impl = IMPL[theme.layout]
    if (!impl) throw new Error(`unknown layout "${theme.layout}"`)
    const decorItems = slide.decor ?? theme.decor ?? []
    const needs3d =
      layoutMeta?.needs3d ||
      (theme.device.mode === '3d' && layoutMeta?.kind === 'still') ||
      (theme.device.mode === '3d' && layoutMeta?.kind === 'video') ||
      theme.layout === 'laptop-phone' ||
      decorItems.some((d) => ['orbs', 'rings', 'shapes'].includes(d?.kind))

    if (needs3d) {
      const { Stage3D } = await import('./lib/three-stage.js')
      this.three = new Stage3D(this.canvas, {
        width: W,
        height: H,
        pixelRatio: spec.pixelRatio ?? 1,
        fov: theme.scene.fov,
        look: theme.scene,
      })
      const sc = theme.scene
      if (sc.wall && theme.device.shadow > 0) this.three.addWall({ depth: sc.wall.depth, opacity: sc.wall.opacity * (theme.device.shadow / 0.35) })
      if (sc.floor) {
        this.three.addFloor({
          y: sc.floor.y * H,
          opacity: sc.floor.opacity ?? 0.35,
          mirror: sc.floor.mirror ?? 0,
          radius: sc.floor.radius ?? 0.6,
          tint: sc.floor.tint ?? '#ffffff',
          center: [theme.device.x ?? 0.5, sc.floor.z ?? 0],
        })
      }
      this.three.setView({ ...sc.camera })
    }

    const u = Math.min(W, H) / 100
    const firstShot = sources[index] ?? sources[0]
    const ctx = {
      W,
      H,
      u,
      spec,
      theme,
      slides,
      index,
      count: spec.count ?? slides.length,
      sources,
      desktopSources,
      layers: this.layers,
      three: this.three,
      texts: [],
      fitters: [],
      animated: !!spec.animated,
      editable: !!spec.editable,
      onEdit: (i, field, value) => window.parent?.postMessage({ type: 'stage:edit', index: i, field, value }, '*'),
      device: (opts) => this.makeDevice(ctx, opts),
      warnings,
    }
    this.ctx = ctx

    this.bgUpdate = buildBackground(this.layers.bg, theme, {
      W,
      H,
      index,
      count: ctx.count,
      shotUrl: slide.screen?.backdrop ?? slide.screen?.url ?? slide.screen?.frames?.poster,
    })

    const result = await impl(ctx)
    this.layout = typeof result === 'function' ? { update: result } : result

    const creditText = (spec.credits ?? []).map((c) => `${c.title} by ${c.author} (${c.license})`).join(' · ')
    this.decor = buildDecor(decorItems, {
      ...ctx,
      layer: this.layers.front,
      shotImg: firstShot?.img ?? firstShot?.first,
      creditText,
    })

    // Fit text once fonts are live and layout is in the DOM.
    await nextFrame()
    for (const t of ctx.texts) t.fit()
    for (const f of ctx.fitters) await f()

    const kind = layoutMeta?.kind ?? 'still'
    const fps = theme.motion.fps
    const duration = kind === 'video' ? (this.layout.duration ?? theme.motion.duration) : 0
    this.ready = true
    await this.seek(spec.time ?? 0)
    const used = [...new Set((this.three?.devices ?? []).map((d) => d.id))]
    this.info = { duration }
    return {
      kind,
      duration,
      fps,
      frames: kind === 'video' ? Math.ceil(duration * fps) : 1,
      devices: used,
      credits: used.map((id) => DEVICES[id].credit),
      warnings,
      gl: this.three ? this.glInfo() : null,
    }
  }

  glInfo() {
    const gl = this.three.renderer.getContext()
    const ext = gl.getExtension('WEBGL_debug_renderer_info')
    return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)
  }

  async makeDevice(ctx, opts = {}) {
    const { theme } = ctx
    const d = theme.device
    const mode = opts.mode ?? d.mode
    if (mode === 'none') return null
    if (mode === '3d') {
      if (!this.three) throw new Error('3D device requested but WebGL stage is not initialised')
      const model = opts.model ?? d.model
      const dev = await this.three.addDevice(model, {
        finish: opts.finish ?? d.finish,
        glare: d.glare,
        background: theme.screen.background,
        modelBase: `${ctx.spec.assetBase ?? '/'}assets/models/`,
        screenScale: ctx.spec.screenScale ?? 1,
      })
      dev.isLaptop = DEVICES[model].kind === 'laptop'
      dev.aspect = DEVICES[model].display[0] / DEVICES[model].display[1]
      dev.standHeight = (size) => size * dev.dims.y
      return dev
    }
    // Flat and frameless: aspect follows the frame, or the screenshot itself.
    const src = ctx.sources[opts.slide ?? ctx.index] ?? ctx.sources[0]
    const shotAspect = src ? src.w / src.h : 0.46
    const variant = mode === 'frameless' ? 'frameless' : (opts.flat ?? (ctx.spec.flatFrame || d.flat))
    const width = (d.size ?? 0.6) * ctx.H * (variant === 'browser' ? 1.4 : shotAspect) * (ctx.spec.screenScale ?? 1) * (opts.resolution ?? 1)
    const dev = new FlatDevice(opts.layer ?? ctx.layers.mid, {
      variant,
      aspect: variant === 'frameless' ? shotAspect : undefined,
      width: Math.min(2400, width),
      background: theme.screen.background,
      style: { frame: d.frame, edge: d.edge, corner: d.corner, shadow: d.shadow > 0, shadowColor: `rgba(0,0,0,${d.shadow})`, border: d.border, glow: d.glow },
    })
    dev.isLaptop = variant === 'browser'
    dev.standHeight = (size) => size
    return dev
  }

  /** Pose everything for t. `fast` skips waiting for paint (live preview). */
  async seek(t, { fast = false } = {}) {
    if (!this.ready) throw new Error('stage not loaded')
    this.time = t
    await this.layout.update?.(t)
    this.bgUpdate?.(t)
    for (const d of this.decor) d.update(t)
    this.three?.render()
    if (fast) return
    await nextFrame()
    await nextFrame()
  }

  /** Real-time playback for the studio. Returns a stop function. */
  play(from = 0, { loop = true, onTime } = {}) {
    this.stop?.()
    const duration = this.info?.duration || 0
    let running = true
    let busy = false
    const t0 = performance.now() - from * 1000
    const tick = async (now) => {
      if (!running) return
      let t = (now - t0) / 1000
      if (duration && t > duration) {
        if (!loop) return this.stop()
        t %= duration
      }
      if (!busy) {
        busy = true
        await this.seek(t, { fast: true }).catch(() => {})
        busy = false
        onTime?.(t)
      }
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
    this.stop = () => {
      running = false
      this.stop = null
    }
    return this.stop
  }
}

const stage = new Stage()
window.stage = stage

// Studio embedding: specs arrive by postMessage, errors go back the same way.
// Loads are serialised and collapse to the newest, so fast slider drags never
// leave two half-built scenes fighting over one canvas.
let loading = false
let queued = null
async function runLoad(msg, source) {
  if (loading) {
    queued = { msg, source }
    return
  }
  loading = true
  try {
    const info = await stage.load(msg.spec)
    source?.postMessage({ type: 'stage:loaded', id: msg.id, info }, '*')
  } catch (err) {
    console.error(err)
    source?.postMessage({ type: 'stage:error', id: msg.id, error: String(err?.stack ?? err) }, '*')
  } finally {
    loading = false
    if (queued) {
      const q = queued
      queued = null
      runLoad(q.msg, q.source)
    }
  }
}

window.addEventListener('message', async (e) => {
  const msg = e.data
  if (!msg || typeof msg !== 'object') return
  try {
    if (msg.type === 'stage:load') {
      runLoad(msg, e.source)
    } else if (msg.type === 'stage:nudge') {
      // Live drag-to-rotate; the studio commits the pose when the drag ends.
      for (const d of stage.three?.devices ?? []) {
        d.pivot.rotation.y += msg.dx
        d.pivot.rotation.x += msg.dy
      }
      stage.three?.render()
    } else if (msg.type === 'stage:seek') {
      stage.stop?.()
      await stage.seek(msg.time, { fast: !!msg.fast })
      e.source?.postMessage({ type: 'stage:seeked', id: msg.id, time: msg.time }, '*')
    } else if (msg.type === 'stage:play') {
      stage.play(msg.time ?? 0, { onTime: (t) => e.source?.postMessage({ type: 'stage:time', time: t }, '*') })
    } else if (msg.type === 'stage:pause') {
      stage.stop?.()
    }
  } catch (err) {
    console.error(err)
    e.source?.postMessage({ type: 'stage:error', id: msg.id, error: String(err?.stack ?? err) }, '*')
  }
})

window.stageReady = true
window.parent?.postMessage({ type: 'stage:ready' }, '*')
