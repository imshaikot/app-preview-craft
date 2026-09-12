// Still layouts. Each is async (ctx) => update(t); stills call update(0)
// once, but the functions stay time-aware so a still layout also animates
// gently when used in the studio's live preview.
import { addText, headlineSize, screenState, textBox } from './common.js'
import { wobble } from '../lib/ease.js'
import { drawCover } from '../lib/screen.js'
import { fontStack } from '../catalog/fonts.js'
import { markup } from '../lib/text.js'

const slideFields = (ctx, i = ctx.index) => {
  const s = ctx.slides[i] ?? {}
  return { kicker: s.kicker ?? ctx.theme.text.kicker, title: s.title, subtitle: s.subtitle }
}

function headline(ctx) {
  const pos = ctx.theme.text.position
  if (pos === 'none') return null
  return addText(ctx, slideFields(ctx), textBox(ctx, pos))
}

const poseOf = (d) => ({ rx: d.pose?.[0] ?? 0, ry: d.pose?.[1] ?? 0, rz: d.pose?.[2] ?? 0 })

/** Place one device from a {x, y, size, pose, z} block (page fractions). */
function placeFrom(ctx, dev, d, extra = {}) {
  const { W, H } = ctx
  dev.place({
    x: d.x * W,
    y: d.y * H,
    z: (d.z ?? 0) * H,
    size: d.size * (dev.isLaptop ? W : H),
    byWidth: dev.isLaptop,
    ...poseOf(d),
    ...extra,
  })
}

async function paintSlide(ctx, dev, i = ctx.index) {
  dev?.paint(await screenState(ctx, i))
}

export const STILL = {
  async 'hero-top'(ctx) {
    headline(ctx)
    const d = ctx.theme.device
    const dev = await ctx.device()
    if (dev) {
      placeFrom(ctx, dev, d)
      await paintSlide(ctx, dev)
    }
    return (t) => {
      if (dev && ctx.animated && d.float) placeFrom(ctx, dev, d, { y: d.y * ctx.H + wobble(t, 1) * ctx.u * 1.5 * d.float })
    }
  },

  async 'hero-bottom'(ctx) {
    return STILL['hero-top'](ctx)
  },

  async tilt(ctx) {
    return STILL['hero-top'](ctx)
  },

  async callout(ctx) {
    return STILL['hero-top'](ctx)
  },

  async duo(ctx) {
    headline(ctx)
    const d = ctx.theme.device
    const back = await ctx.device()
    const front = await ctx.device()
    if (!front) return () => {}
    placeFrom(ctx, back, { ...d, ...d.secondary })
    placeFrom(ctx, front, d)
    await paintSlide(ctx, back, ctx.index + 1)
    await paintSlide(ctx, front)
    return () => {}
  },

  async fan(ctx) {
    headline(ctx)
    const { W, H } = ctx
    const d = ctx.theme.device
    const spread = d.spread ?? 0.3
    const ang = d.fanAngle ?? 12
    const devs = []
    for (const k of [-1, 1, 0]) {
      const dev = await ctx.device()
      if (!dev) return () => {}
      const side = k !== 0
      dev.place({
        x: (d.x + k * spread * (H > W ? 1 : 0.55)) * W,
        y: d.y * H + (side ? H * 0.03 : 0),
        z: side ? -0.08 * H : 0,
        size: d.size * H * (side ? 0.86 : 1),
        rx: 0,
        ry: -k * ang * 1.4,
        rz: -k * ang,
      })
      await paintSlide(ctx, dev, ctx.index + k)
      devs.push(dev)
    }
    return () => {}
  },

  async split(ctx) {
    const th = ctx.theme
    const portrait = ctx.H > ctx.W
    const pos = portrait ? 'top' : th.text.position === 'right' ? 'right' : 'left'
    addText(ctx, slideFields(ctx), textBox(ctx, pos, portrait ? {} : { width: th.text.splitWidth ?? 0.44 }), {
      base: headlineSize(ctx) * (portrait ? 1 : 1.05),
    })
    const dev = await ctx.device()
    if (dev) {
      const d = { ...th.device }
      if (pos === 'right' && d.x > 0.5) d.x = 1 - d.x
      if (portrait) Object.assign(d, { x: 0.5, y: 0.64, size: 0.7 })
      // Sizes are tuned for ~1.9:1 cards; shrink toward square.
      else d.size *= Math.min(1, Math.max(0.72, ctx.W / ctx.H / 1.9))
      placeFrom(ctx, dev, d)
      await paintSlide(ctx, dev)
    }
    return () => {}
  },

  async 'big-type'(ctx) {
    const { W, H, theme } = ctx
    const s = ctx.slides[ctx.index] ?? {}
    const word = s.bigWord ?? s.kicker ?? (s.title ?? '').replace(/\*/g, '').split(/\s+/)[0] ?? ''
    const big = document.createElement('div')
    big.className = 'big-word'
    big.textContent = word
    Object.assign(big.style, {
      fontFamily: fontStack(theme.type.display),
      fontWeight: theme.type.weight,
      color: theme.bigType?.fill ?? 'transparent',
      WebkitTextStroke: theme.bigType?.stroke === false ? '0' : `${Math.max(2, W * 0.003)}px ${theme.palette.accent}`,
      top: `${(theme.bigType?.y ?? 0.08) * H}px`,
      fontSize: `${(theme.bigType?.size ?? 0.34) * W}px`,
      opacity: theme.bigType?.opacity ?? 0.9,
      textTransform: 'uppercase',
    })
    if (theme.bigType?.vertical) {
      big.style.writingMode = 'vertical-rl'
      big.style.fontSize = `${(theme.bigType?.size ?? 0.34) * H * 0.5}px`
    }
    ctx.layers.back.append(big)
    // Shrink the word to the canvas width.
    ctx.fitters.push(() => {
      for (let i = 0; i < 30 && big.scrollWidth > W * 0.96; i++) big.style.fontSize = `${parseFloat(big.style.fontSize) * 0.94}px`
    })
    addText(ctx, { title: s.title, subtitle: s.subtitle }, textBox(ctx, theme.text.position === 'top' ? 'top' : 'bottom'))
    const dev = await ctx.device()
    if (dev) {
      placeFrom(ctx, dev, theme.device)
      await paintSlide(ctx, dev)
    }
    return () => {}
  },

  async bento(ctx) {
    const { W, H, theme, u } = ctx
    const p = theme.palette
    const portrait = H > W
    const gap = u * 2
    const m = theme.text.margin * Math.min(W, H) * 1.2
    const grid = document.createElement('div')
    grid.className = 'bento'
    Object.assign(grid.style, {
      left: `${m}px`,
      top: `${m}px`,
      width: `${W - 2 * m}px`,
      height: `${H - 2 * m}px`,
      gap: `${gap}px`,
      gridTemplateColumns: portrait ? '1fr 1fr' : '1.25fr 0.8fr 0.8fr',
      gridTemplateRows: portrait ? '1.1fr 1fr 1fr' : '1fr 1fr',
    })
    ctx.layers.front.append(grid)
    const tile = (area, bg) => {
      const d = document.createElement('div')
      d.className = 'bento-tile'
      Object.assign(d.style, { gridArea: area, background: bg ?? p.surface, borderRadius: `${u * 3}px` })
      grid.append(d)
      return d
    }
    const s = ctx.slides[ctx.index] ?? {}
    const textTile = tile(portrait ? '1 / 1 / 2 / 3' : '1 / 1 / 3 / 2', theme.bento?.textTile ?? p.surface)
    const tb = document.createElement('div')
    tb.className = 'bento-text'
    tb.style.padding = `${u * 4}px`
    const base = headlineSize(ctx) * (portrait ? 0.9 : 0.95)
    tb.innerHTML = `
      ${s.kicker ? `<div style="font:650 ${base * 0.26}px ${fontStack(theme.type.body)};letter-spacing:.14em;text-transform:uppercase;color:${p.accent}">${s.kicker}</div>` : ''}
      <div class="tb-title" style="font-family:${fontStack(theme.type.display)};font-weight:${theme.type.weight};font-size:${base}px;line-height:${theme.type.leading};letter-spacing:${theme.type.tracking}em;color:${p.ink};margin-top:${base * 0.2}px">${markup(s.title ?? '')}</div>
      <div style="font-family:${fontStack(theme.type.body)};font-weight:${theme.type.bodyWeight};font-size:${base * 0.36}px;color:${p.sub};margin-top:${base * 0.3}px;line-height:1.35">${markup(s.subtitle ?? '', { words: false })}</div>`
    textTile.append(tb)
    textTile.classList.add(`hl-${theme.type.highlight}`)
    textTile.style.setProperty('--accent', p.accent)
    textTile.style.setProperty('--accent2', p.accent2)
    textTile.style.setProperty('--bg', p.bg)

    const areas = portrait
      ? ['2 / 1 / 4 / 2', '2 / 2 / 3 / 3', '3 / 2 / 4 / 3']
      : ['1 / 2 / 3 / 3', '1 / 3 / 2 / 4', '2 / 3 / 3 / 4']
    const crops = theme.bento?.crops ?? [[0.5, 0.0, 1], [0.5, 0.35, 1.6], [0.5, 0.7, 1.4]]
    for (const [k, area] of areas.entries()) {
      const t = tile(area, theme.bento?.shotTile ?? p.bg2)
      const c = document.createElement('canvas')
      t.append(c)
      ctx.fitters.push(async () => {
        const r = t.getBoundingClientRect()
        c.width = Math.round(r.width * 1.5)
        c.height = Math.round(r.height * 1.5)
        const st = await screenState(ctx, ctx.index + k)
        if (!st) return
        const [fx, fy, zoom] = crops[k % crops.length]
        drawCover(c.getContext('2d'), st.img, 0, 0, c.width, c.height, { fx, fy, zoom })
      })
    }
    return () => {}
  },

  async 'laptop-phone'(ctx) {
    headline(ctx)
    const d = ctx.theme.device
    const laptop = await ctx.device({ mode: '3d', model: d.laptop ?? 'macbook-pro-16' })
    const phone = await ctx.device({ mode: d.mode === 'flat' ? 'flat' : '3d' })
    placeFrom(ctx, laptop, d)
    placeFrom(ctx, phone, { ...d, ...d.phone })
    laptop.paint(await screenState(ctx, ctx.desktopIndex ?? ctx.index, 0, 1, { desktop: true }))
    await paintSlide(ctx, phone)
    return () => {}
  },

  async showcase(ctx) {
    headline(ctx)
    const dev = await ctx.device({ mode: '3d' })
    placeFrom(ctx, dev, ctx.theme.device)
    await paintSlide(ctx, dev)
    return () => {}
  },

  async pedestal(ctx) {
    headline(ctx)
    const { W, H, theme } = ctx
    const pl = theme.scene.plinth ?? {}
    ctx.three.addPlinth({
      y: pl.y * H,
      height: pl.height * H,
      radius: pl.radius * Math.min(W, H),
      color: pl.color ?? theme.palette.bg3,
      finish: pl.finish ?? 'matte',
    })
    const dev = await ctx.device({ mode: '3d' })
    placeFrom(ctx, dev, theme.device)
    await paintSlide(ctx, dev)
    return () => {}
  },

  async lineup(ctx) {
    headline(ctx)
    const { W, H, theme } = ctx
    const d = theme.device
    const ids = theme.devices ?? ['iphone-17-pro']
    const n = ids.length
    const span = Math.min(0.84, 0.2 * n)
    for (const [k, id] of ids.entries()) {
      const dev = await ctx.device({ mode: '3d', model: id })
      const x = n === 1 ? 0.5 : 0.5 - span / 2 + (span * k) / (n - 1)
      const size = d.size * (dev.isLaptop ? 1.5 : 1)
      const bottom = theme.scene.floor ? theme.scene.floor.y : d.y + size / 2
      // Stand every device on the floor line.
      const h = size * H
      dev.place({ x: x * W, y: (bottom - 0.003) * H - dev.standHeight(h) / 2, size: h, ...poseOf(d), z: (Math.abs(k - (n - 1) / 2) * -0.04) * H })
      await paintSlide(ctx, dev, ctx.index + k)
    }
    return () => {}
  },

  async flatlay(ctx) {
    headline(ctx)
    const { theme } = ctx
    const items = theme.flatlay ?? [
      { x: 0.33, y: 0.52, rz: -14, size: 0.78 },
      { x: 0.66, y: 0.48, rz: 9, size: 0.78, model: 'iphone-17-pro-max' },
    ]
    for (const [k, it] of items.entries()) {
      const dev = await ctx.device({ mode: '3d', model: it.model })
      placeFrom(ctx, dev, { x: it.x, y: it.y, size: (it.size ?? theme.device.size), pose: [0, it.back ? 180 : 0, it.rz ?? 0] })
      await paintSlide(ctx, dev, ctx.index + k)
    }
    return () => {}
  },
}
