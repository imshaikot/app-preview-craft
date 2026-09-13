// Screenshot treatments with sharp (libvips). Everything here runs before the
// browser starts, so the stage only ever loads finished, right-sized images.
import { copyFileSync, mkdirSync } from 'node:fs'
import { basename, extname, join } from 'node:path'
import sharp from 'sharp'

const hex = (c) => {
  const m = String(c).trim().match(/^#?([0-9a-f]{3}|[0-9a-f]{6})$/i)
  if (!m) throw new Error(`expected a hex color, got "${c}"`)
  let h = m[1]
  if (h.length === 3) h = [...h].map((x) => x + x).join('')
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
}
const toHex = (rgb) => `#${rgb.map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`

/** iOS-style status bar (9:41, full signal, full battery) as SVG, in 402pt units scaled to width. */
function statusBarSvg(width, height, bg, ink, time) {
  const s = width / 402
  return Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <rect width="100%" height="100%" fill="${bg}"/>
    <g transform="scale(${s})" fill="${ink}">
      <text x="72" y="37.5" text-anchor="middle" font-family="-apple-system, 'SF Pro Text', 'Helvetica Neue', Helvetica, Arial, sans-serif" font-size="17" font-weight="600" letter-spacing="-0.2">${time}</text>
      <rect x="294" y="30.5" width="3" height="4.5" rx="0.8"/><rect x="298.8" y="28.5" width="3" height="6.5" rx="0.8"/>
      <rect x="303.6" y="26.3" width="3" height="8.7" rx="0.8"/><rect x="308.4" y="24" width="3" height="11" rx="0.8"/>
      <path transform="translate(316 24.2)" d="M8.1 10.8 5.5 8.1a3.7 3.7 0 0 1 5.2 0zM3.2 5.9a6.9 6.9 0 0 1 9.8 0l-1.3 1.3a5.1 5.1 0 0 0-7.2 0zM.9 3.6a10.1 10.1 0 0 1 14.4 0L14 4.9a8.3 8.3 0 0 0-11.8 0z"/>
      <rect x="337.5" y="24.2" width="24.5" height="11.6" rx="3.6" fill="none" stroke="${ink}" stroke-opacity="0.4" stroke-width="1"/>
      <rect x="339.5" y="26.2" width="20.5" height="7.6" rx="2"/>
      <path d="M363.4 28.2v3.6c.8-.3 1.3-1 1.3-1.8s-.5-1.5-1.3-1.8z" fill-opacity="0.45"/>
    </g></svg>`)
}

/** Most vivid color in an image: hue buckets weighted by saturation and value. */
export async function vibrantColor(file) {
  const { data } = await sharp(file).resize(72, 72, { fit: 'inside' }).removeAlpha().raw().toBuffer({ resolveWithObject: true })
  const buckets = Array.from({ length: 36 }, () => ({ w: 0, r: 0, g: 0, b: 0 }))
  for (let i = 0; i < data.length; i += 3) {
    const r = data[i] / 255
    const g = data[i + 1] / 255
    const b = data[i + 2] / 255
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    const d = max - min
    if (d < 0.12 || max < 0.25) continue
    let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
    h = (h * 60 + 360) % 360
    const w = (d / max) * max * d
    const k = buckets[Math.floor(h / 10)]
    k.w += w
    k.r += data[i] * w
    k.g += data[i + 1] * w
    k.b += data[i + 2] * w
  }
  const best = buckets.reduce((a, b) => (b.w > a.w ? b : a))
  if (!best.w) return null
  return toHex([best.r / best.w, best.g / best.w, best.b / best.w])
}

/**
 * Apply a theme's `screen` treatment to one screenshot and write it into
 * `workDir`. Returns {file, w, h, backdrop}.
 */
export async function prepareScreen(input, workDir, treatment = {}, { name, maxHeight = 2880 } = {}) {
  mkdirSync(workDir, { recursive: true })
  const base = name ?? basename(input, extname(input))
  const meta = await sharp(input).metadata()
  const w0 = meta.autoOrient?.width ?? meta.width
  const h0 = meta.autoOrient?.height ?? meta.height
  const k = Math.min(1, maxHeight / h0)
  const W = Math.round(w0 * k)
  const H = Math.round(h0 * k)

  let img = sharp(input).rotate().resize(W, H, { kernel: 'lanczos3' })
  const layers = []

  const phoneLike = H / W > 1.9 && H / W < 2.4
  if (treatment.cleanStatusBar && phoneLike) {
    const barH = Math.round((54 / 874) * H)
    const sample = await sharp(input)
      .rotate()
      .resize(W, H)
      .extract({ left: 0, top: Math.round(barH * 0.1), width: Math.round(W * 0.22), height: Math.round(barH * 0.8) })
      .stats()
    const bg = sample.channels.slice(0, 3).map((c) => c.median ?? c.mean)
    const lum = (0.2126 * bg[0] + 0.7152 * bg[1] + 0.0722 * bg[2]) / 255
    layers.push({ input: statusBarSvg(W, barH, toHex(bg), lum < 0.55 ? '#ffffff' : '#000000', treatment.statusBarTime ?? '9:41'), top: 0, left: 0 })
  }
  if (layers.length) img = sharp(await img.composite(layers).png().toBuffer())

  if (treatment.saturate != null && treatment.saturate !== 1) img = img.modulate({ saturation: treatment.saturate })
  if (treatment.brightness != null && treatment.brightness !== 1) img = img.modulate({ brightness: treatment.brightness })
  if (treatment.duotone) {
    const [dark, light] = String(treatment.duotone).split(',').map(hex)
    img = sharp(await img.grayscale().toColourspace('srgb').png().toBuffer()).linear(
      light.map((l, i) => (l - dark[i]) / 255),
      dark,
    )
  }
  if (treatment.tint) {
    const [r, g, b] = hex(treatment.tint)
    const overlay = await sharp({ create: { width: W, height: H, channels: 4, background: { r, g, b, alpha: treatment.tintAmount ?? 0.35 } } }).png().toBuffer()
    img = sharp(await img.png().toBuffer()).composite([{ input: overlay, blend: 'soft-light' }])
  }
  if (treatment.sharpen) img = img.sharpen({ sigma: 0.8 })

  const file = join(workDir, `${base}.png`)
  await img.png({ compressionLevel: 3 }).toFile(file)

  // A small, pre-blurred copy for blur-shot backgrounds: blurring a 3000px
  // image in CSS on every frame is far slower than this.
  const backdrop = join(workDir, `${base}-backdrop.jpg`)
  await sharp(file).resize(360).blur(12).modulate({ saturation: 1.4 }).jpeg({ quality: 80 }).toFile(backdrop)
  return { file, w: W, h: H, backdrop }
}

/** Copy an arbitrary asset (icon, background image) into the work dir. */
export function stageAsset(input, workDir, name) {
  mkdirSync(workDir, { recursive: true })
  const dst = join(workDir, `${name}${extname(input).toLowerCase()}`)
  copyFileSync(input, dst)
  return dst
}

/**
 * Post-process a captured frame: exact size, alpha handling, format.
 * App Store Connect rejects screenshots with an alpha channel, so opaque
 * outputs are always flattened.
 */
export async function finishStill(buffer, out, { width, height, format = 'png', transparent = false, background = '#000000', quality = 92, metadata = {} }) {
  let img = sharp(buffer).resize(width, height, { fit: 'fill' })
  if (!transparent || format === 'jpg') img = img.flatten({ background }).removeAlpha()
  const exif = { IFD0: { Software: 'app-preview-craft', ...metadata } }
  if (format === 'jpg' || format === 'jpeg') img = img.jpeg({ quality, mozjpeg: true, chromaSubsampling: '4:4:4' })
  else if (format === 'webp') img = img.webp({ quality, alphaQuality: 100 })
  else if (format === 'avif') img = img.avif({ quality })
  else img = img.png({ compressionLevel: 8, adaptiveFiltering: true })
  await img.withExif(exif).toFile(out)
  return out
}

/** Contact sheet of rendered stills, for a quick look at a whole set. */
export async function contactSheet(files, out, { height = 900, gap = 24, background = '#16171b', columns } = {}) {
  const metas = await Promise.all(files.map((f) => sharp(f).metadata()))
  const cols = columns ?? files.length
  const rows = Math.ceil(files.length / cols)
  const cellH = Math.round(rows > 1 ? height / rows : height)
  const tiles = await Promise.all(
    files.map(async (f, i) => {
      const w = Math.round((metas[i].width / metas[i].height) * cellH)
      return { input: await sharp(f).resize(w, cellH).toBuffer(), w }
    }),
  )
  const rowWidths = Array.from({ length: rows }, (_, r) => tiles.slice(r * cols, r * cols + cols).reduce((a, t) => a + t.w + gap, gap))
  const W = Math.max(...rowWidths)
  const H = rows * (cellH + gap) + gap
  const comps = []
  tiles.forEach((t, i) => {
    const r = Math.floor(i / cols)
    const before = tiles.slice(r * cols, i).reduce((a, x) => a + x.w + gap, gap)
    comps.push({ input: t.input, left: before, top: gap + r * (cellH + gap) })
  })
  await sharp({ create: { width: W, height: H, channels: 3, background } }).composite(comps).png().toFile(out)
  return out
}
