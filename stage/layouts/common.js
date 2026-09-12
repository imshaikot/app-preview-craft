// Helpers every layout shares: text boxes, the slide timeline, screen state
// at a time, and captions that change per beat.
import { clamp, ease, span } from '../lib/ease.js'
import { TextBlock } from '../lib/text.js'

/** Headline box for a named position, honoring text.margin and text.width. */
export function textBox(ctx, position = ctx.theme.text.position, extra = {}) {
  const { W, H, theme } = ctx
  const t = theme.text
  const m = t.margin
  const portrait = H >= W
  const mx = m * W
  const my = m * H * (portrait ? 0.75 : 1)
  const w = (extra.width ?? t.width) * W
  const align = extra.align ?? t.align
  const xFor = (bw) => (align === 'left' ? mx : align === 'right' ? W - mx - bw : (W - bw) / 2)
  switch (position) {
    case 'bottom': {
      const h = (extra.height ?? (portrait ? 0.2 : 0.3)) * H
      return { x: xFor(w), y: H - my - h, w, h, align, valign: 'bottom' }
    }
    case 'left': {
      const bw = (extra.width ?? (portrait ? t.width : 0.42)) * W
      return { x: mx, y: my, w: bw, h: H - 2 * my, align: extra.align ?? 'left', valign: 'center' }
    }
    case 'right': {
      const bw = (extra.width ?? (portrait ? t.width : 0.42)) * W
      return { x: W - mx - bw, y: my, w: bw, h: H - 2 * my, align: extra.align ?? 'left', valign: 'center' }
    }
    case 'center':
      return { x: xFor(w), y: H * 0.3, w, h: H * 0.4, align, valign: 'center' }
    case 'top':
    default: {
      const h = (extra.height ?? (portrait ? 0.22 : 0.3)) * H
      return { x: xFor(w), y: my, w, h, align, valign: 'top' }
    }
  }
}

/** Base headline size for a canvas. */
export const headlineSize = (ctx) => {
  const { W, H } = ctx
  return H >= W ? Math.min(W * 0.088, H * 0.05) : Math.min(H * 0.105, W * 0.06)
}

export function addText(ctx, fields, box, opts = {}) {
  const block = new TextBlock(ctx.layers[opts.layer ?? 'front'], ctx.theme, fields, box, {
    base: (opts.base ?? headlineSize(ctx)) * (opts.scale ?? 1),
    editable: ctx.editable && opts.editable !== false,
    onEdit: (field, value) => ctx.onEdit?.(opts.slide ?? ctx.index, field, value),
    cls: opts.cls,
  })
  ctx.texts.push(block)
  return block
}

/**
 * Beat timeline for videos. Each slide gets `slide.hold` seconds, or its
 * recording's length, or an equal share of what is left of motion.duration.
 */
export function timeline(ctx, { intro = 0, outro = 0, min = 0.4 } = {}) {
  const m = ctx.theme.motion
  const n = Math.max(1, ctx.slides.length)
  const lens = ctx.slides.map((s, i) => s.hold ?? (ctx.sources[i]?.duration || null))
  const fixed = lens.reduce((a, b) => a + (b ?? 0), 0)
  const free = lens.filter((x) => x == null).length
  const body = Math.max(0, m.duration / m.speed - intro - outro - m.hold)
  const each = free ? Math.max(min, (body - fixed) / free) : 0
  if (free && each < 1.2 && !ctx.warnedPace) {
    ctx.warnedPace = true
    ctx.warnings?.push(`${free} slides share ${Math.max(0, body - fixed).toFixed(1)}s — ${each.toFixed(1)}s each is fast; raise --duration or drop slides`)
  }
  const beats = []
  let t = intro
  for (let i = 0; i < n; i++) {
    const len = lens[i] ?? each
    beats.push({ i, start: t, len })
    t += len
  }
  const total = t + outro + m.hold
  return {
    beats,
    intro,
    outro,
    total,
    bodyEnd: t,
    /** active beat at t (clamped), local seconds, entry progress over `trans` */
    at(time, trans = 0.7) {
      let b = beats[0]
      for (const x of beats) if (time >= x.start) b = x
      const local = time - b.start
      return { ...b, local, p: b.i === 0 && intro === 0 ? 1 : clamp(local / trans), progress: clamp(local / b.len) }
    },
  }
}

/** What a display shows for slide i at `local` seconds into its beat. */
export async function screenState(ctx, i, local = 0, len = 1, { desktop = false } = {}) {
  const n = ctx.sources.length
  if (!n) return null
  const idx = ((i % n) + n) % n
  const desk = desktop ? ctx.desktopSources?.[idx] : null
  const src = desk ?? ctx.sources[idx]
  // A slide without a screen (e.g. a file that went missing) shows a blank display.
  if (!src) return null
  // A portrait capture on a landscape display is letterboxed, not cropped.
  if (desktop && !desk && src) {
    return { img: await src.at(local), contain: true }
  }
  const slide = ctx.slides[idx] ?? {}
  const img = await src.at(local)
  const focus = slide.focus // [fx, fy, zoom]
  let zoom = 1
  let fx = 0.5
  let fy = ctx.theme.screen.fit === 'top' ? 0 : 0.5
  if (focus && ctx.animated) {
    const k = span(local, len * 0.25, len * 0.5, ease.inOutCubic)
    zoom = 1 + ((focus[2] ?? 1.8) - 1) * k
    fx = 0.5 + (focus[0] - 0.5) * k
    fy = 0.5 + (focus[1] - 0.5) * k
  } else if (focus && slide.zoomStill) {
    ;[fx, fy, zoom] = focus
  }
  const scroll = ctx.animated ? span(local, len * 0.12, len * 0.76, ease.inOutSine) : (slide.scroll ?? 0)
  return { img, scroll, zoom, fx, fy }
}

/** Paint device `dev` with the transition between beats a -> b. */
export async function paintBeat(ctx, dev, tl, t, { offset = 0, mode } = {}) {
  const beat = tl.at(t)
  const i = beat.i + offset
  const cur = await screenState(ctx, i, beat.local, beat.len)
  if (beat.p < 1 && beat.i > 0) {
    const prevBeat = tl.beats[beat.i - 1]
    const prev = await screenState(ctx, i - 1, t - prevBeat.start, prevBeat.len)
    dev.paint(prev, cur, beat.p, mode ?? ctx.theme.screen.transition)
  } else dev.paint(cur)
  return beat
}

/**
 * One caption block per slide; only the active beat's is visible.
 * style: rise | fade | blur
 */
export function captions(ctx, tl, box, { style = 'rise', scale = 1, exit = 0.35 } = {}) {
  const blocks = ctx.slides.map((s, i) =>
    addText(ctx, { kicker: s.kicker, title: s.title, subtitle: s.subtitle }, box, { scale, slide: i }),
  )
  return (t) => {
    const beat = tl.at(t)
    blocks.forEach((b, i) => {
      if (i !== beat.i) {
        b.opacity = 0
        return
      }
      const inP = clamp(beat.local / 0.9)
      const outP = i < blocks.length - 1 ? clamp((beat.len - beat.local) / exit) : 1
      b.opacity = outP
      b.reveal(i === 0 && tl.intro === 0 && !ctx.animated ? 1 : inP, style)
      b.move(0, (1 - outP) * -ctx.u * 2)
    })
  }
}

/** Intro title + outro end card, shared by all video layouts. */
export function bookends(ctx, tl) {
  const { brand = {} } = ctx.spec
  const parts = []
  if (tl.intro > 0) {
    const box = textBox(ctx, 'center', { width: 0.84 })
    const block = addText(ctx, { kicker: brand.name, title: brand.tagline ?? ctx.slides[0]?.title, subtitle: '' }, box, { scale: 1.15, editable: false, cls: 'bookend' })
    parts.push((t) => {
      const inP = clamp(t / 0.8)
      const outP = clamp((tl.intro - t) / 0.45)
      block.opacity = Math.min(inP * 1.5, outP)
      block.reveal(inP, 'blur')
      block.move(0, 0, 1 + t * 0.02)
    })
  }
  if (tl.outro > 0) {
    const box = textBox(ctx, 'center', { width: 0.84 })
    const block = addText(ctx, { kicker: brand.cta ?? 'Available now', title: brand.name ?? '', subtitle: brand.url ?? '' }, box, { scale: 1.2, editable: false, cls: 'bookend' })
    parts.push((t) => {
      const local = t - tl.bodyEnd
      const p = clamp(local / 0.8)
      block.opacity = p
      block.reveal(p, 'rise')
    })
  }
  return (t) => parts.forEach((f) => f(t))
}

/** Fade everything but the outro card when the outro plays. */
export function outroFade(tl, t) {
  if (!tl.outro) return 1
  return 1 - clamp((t - tl.bodyEnd) / 0.6)
}
