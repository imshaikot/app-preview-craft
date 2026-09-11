// Screen content: still screenshots, tall scrolling captures and screen
// recordings (pre-split into frames by ffmpeg), painted onto a canvas that
// both the 3D displays and the flat frames use as their texture.
import { clamp, ease, lerp } from './ease.js'

const loadImage = (url) =>
  new Promise((ok, fail) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => img.decode().then(() => ok(img), () => ok(img))
    img.onerror = () => fail(new Error(`image failed to load: ${url}`))
    img.src = url
  })

export class ImageSource {
  constructor(screen) {
    this.url = screen.url
    this.w = screen.w
    this.h = screen.h
    this.duration = 0
  }
  async load() {
    this.img = await loadImage(this.url)
    this.w = this.img.naturalWidth
    this.h = this.img.naturalHeight
    return this
  }
  async at() {
    return this.img
  }
}

/** A screen recording, extracted to numbered JPEGs at the output frame rate. */
export class FrameSource {
  constructor(screen) {
    this.base = screen.frames.base // URL prefix, frames are base + 00001.jpg
    this.count = screen.frames.count
    this.fps = screen.frames.fps
    this.ext = screen.frames.ext ?? 'jpg'
    this.w = screen.w
    this.h = screen.h
    this.duration = this.count / this.fps
    this.cache = new Map()
  }
  url(i) {
    return `${this.base}${String(i + 1).padStart(5, '0')}.${this.ext}`
  }
  frame(i) {
    i = clamp(i, 0, this.count - 1)
    let p = this.cache.get(i)
    if (!p) {
      p = loadImage(this.url(i))
      this.cache.set(i, p)
      // Keep the cache bounded; frames are only ever read forward in a render.
      if (this.cache.size > 48) this.cache.delete(this.cache.keys().next().value)
    }
    return p
  }
  async load() {
    this.first = await this.frame(0)
    return this
  }
  async at(t = 0) {
    const i = Math.floor(Math.max(0, t) * this.fps + 1e-6)
    this.frame(i + 1) // warm the next frame
    return this.frame(i)
  }
}

export function makeSource(screen) {
  if (!screen) return null
  return screen.frames ? new FrameSource(screen) : new ImageSource(screen)
}

/** Draw `img` to cover (w,h), or fit width and scroll when it is a tall capture. */
export function drawCover(ctx, img, x, y, w, h, { scroll = 0, zoom = 1, fx = 0.5, fy = 0.5, contain = false } = {}) {
  if (!img) return
  if (contain) return drawContain(ctx, img, x, y, w, h)
  const iw = img.naturalWidth || img.videoWidth || img.width
  const ih = img.naturalHeight || img.videoHeight || img.height
  const boxAspect = w / h
  const imgAspect = iw / ih
  let sw, sh
  if (imgAspect > boxAspect) {
    sh = ih
    sw = ih * boxAspect
  } else {
    sw = iw
    sh = iw / boxAspect
  }
  sw /= zoom
  sh /= zoom
  let sx = (iw - sw) * fx
  let sy
  // A capture much taller than the display scrolls instead of centering.
  if (ih / iw > (h / w) * 1.15) sy = (ih - sh) * clamp(scroll)
  else sy = (ih - sh) * fy
  sx = clamp(sx, 0, iw - sw)
  sy = clamp(sy, 0, ih - sh)
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h)
}

/**
 * Letterbox `img` inside (w,h) over a blurred, darkened copy of itself — how a
 * phone screenshot is shown on a laptop display when no desktop capture exists.
 */
export function drawContain(ctx, img, x, y, w, h) {
  const iw = img.naturalWidth || img.width
  const ih = img.naturalHeight || img.height
  ctx.save()
  ctx.filter = `blur(${Math.round(w / 40)}px) brightness(0.55) saturate(1.3)`
  drawCover(ctx, img, x - w * 0.05, y - h * 0.05, w * 1.1, h * 1.1)
  ctx.restore()
  const k = Math.min((w * 0.92) / iw, (h * 0.9) / ih)
  const dw = iw * k
  const dh = ih * k
  const dx = x + (w - dw) / 2
  const dy = y + (h - dh) / 2
  ctx.save()
  ctx.shadowColor = 'rgba(0,0,0,.45)'
  ctx.shadowBlur = w / 40
  ctx.beginPath()
  ctx.roundRect(dx, dy, dw, dh, dw * 0.08)
  ctx.clip()
  ctx.drawImage(img, dx, dy, dw, dh)
  ctx.restore()
}

/**
 * Paints transitions between two screen states. A state is
 * {img, scroll, zoom, fx, fy}; `mode` picks how b replaces a.
 */
export class ScreenPainter {
  constructor(width, height, { background = '#000' } = {}) {
    this.canvas = document.createElement('canvas')
    this.canvas.width = Math.round(width)
    this.canvas.height = Math.round(height)
    this.ctx = this.canvas.getContext('2d')
    this.ctx.imageSmoothingQuality = 'high'
    this.background = background
    this.version = 0
  }
  get w() {
    return this.canvas.width
  }
  get h() {
    return this.canvas.height
  }
  paint(a, b = null, p = 1, mode = 'slide') {
    const { ctx, w, h } = this
    ctx.save()
    ctx.fillStyle = this.background
    ctx.fillRect(0, 0, w, h)
    const draw = (s, dx = 0, dy = 0, scale = 1, alpha = 1) => {
      if (!s?.img || alpha <= 0) return
      ctx.save()
      ctx.globalAlpha = alpha
      ctx.translate(w / 2 + dx, h / 2 + dy)
      ctx.scale(scale, scale)
      drawCover(ctx, s.img, -w / 2, -h / 2, w, h, s)
      ctx.restore()
    }
    if (!b || p >= 1) draw(b && p >= 1 ? b : a)
    else if (p <= 0) draw(a)
    else {
      const e = ease.inOutCubic(p)
      switch (mode) {
        case 'fade':
          draw(a)
          draw(b, 0, 0, 1, e)
          break
        case 'push-up':
          draw(a, 0, -h * e)
          draw(b, 0, h * (1 - e))
          break
        case 'zoom':
          draw(a, 0, 0, lerp(1, 0.9, e), 1 - e)
          draw(b, 0, 0, lerp(1.12, 1, e), e)
          break
        case 'wipe': {
          draw(a)
          ctx.save()
          ctx.beginPath()
          ctx.rect(0, 0, w * e, h)
          ctx.clip()
          draw(b)
          ctx.restore()
          break
        }
        case 'slide':
        default:
          draw(a, -w * e * 0.35, 0, 1, 1)
          ctx.fillStyle = `rgba(0,0,0,${0.35 * e})`
          ctx.fillRect(0, 0, w, h)
          draw(b, w * (1 - e), 0)
      }
    }
    ctx.restore()
    this.version++
  }
}
