// CSS backgrounds. Every kind reads palette + background settings, supports
// a pattern overlay, grain and vignette, and may animate with t.
import { rng, wobble } from './ease.js'

const el = (cls, css = {}) => {
  const d = document.createElement('div')
  d.className = cls
  Object.assign(d.style, css)
  return d
}

const GRAIN = (amount) =>
  `url("data:image/svg+xml;utf8,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='240' height='240'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 0 0.5 0 0 0 ${amount * 2.2} 0'/></filter><rect width='100%' height='100%' filter='url(#n)'/></svg>`,
  )}")`

function patternCss(kind, color, scale, u) {
  const s = (n) => `${n * scale * u}px`
  switch (kind) {
    case 'grid':
      return {
        backgroundImage: `linear-gradient(${color} 1.5px, transparent 1.5px), linear-gradient(90deg, ${color} 1.5px, transparent 1.5px)`,
        backgroundSize: `${s(8)} ${s(8)}`,
      }
    case 'dots':
      return { backgroundImage: `radial-gradient(${color} ${s(0.45)}, transparent ${s(0.5)})`, backgroundSize: `${s(4)} ${s(4)}` }
    case 'stripes':
      return { backgroundImage: `repeating-linear-gradient(-45deg, ${color} 0 ${s(1.2)}, transparent ${s(1.2)} ${s(3.6)})` }
    case 'rays':
      return { backgroundImage: `repeating-conic-gradient(from 0deg at 50% 38%, ${color} 0deg 6deg, transparent 6deg 18deg)` }
    case 'checker':
      return {
        backgroundImage: `conic-gradient(${color} 25%, transparent 0 50%, ${color} 0 75%, transparent 0)`,
        backgroundSize: `${s(10)} ${s(10)}`,
      }
    case 'waves': {
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='120' height='40'><path d='M0 20 Q 30 0 60 20 T 120 20' fill='none' stroke='${color}' stroke-width='2.5'/></svg>`
      return { backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, backgroundSize: `${s(12)} ${s(4)}` }
    }
    case 'topo': {
      const rings = Array.from({ length: 9 }, (_, i) => `<ellipse cx='150' cy='150' rx='${20 + i * 17}' ry='${14 + i * 13}' fill='none' stroke='${color}' stroke-width='2' transform='rotate(${i * 7} 150 150)'/>`).join('')
      const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='300' height='300'>${rings}</svg>`
      return { backgroundImage: `url("data:image/svg+xml;utf8,${encodeURIComponent(svg)}")`, backgroundSize: `${s(40)} ${s(40)}` }
    }
    case 'noise':
      return { backgroundImage: GRAIN(0.5), backgroundSize: `${s(30)} ${s(30)}` }
    default:
      return null
  }
}

/**
 * Build the background into `layer`. ctx: {W, H, u, index, count, shotUrl}.
 * Returns update(t).
 */
export function buildBackground(layer, theme, ctx) {
  const { W, H, index = 0, count = 1 } = ctx
  const b = theme.background
  const p = theme.palette
  const u = Math.min(W, H) / 100
  const pano = b.panorama && count > 1
  const fullW = pano ? W * count : W
  layer.innerHTML = ''
  const root = el('bg-root', { width: `${fullW}px`, height: `${H}px`, transform: `translateX(${pano ? -index * W : 0}px)` })
  layer.append(root)
  const updates = []
  const rand = rng(b.seed ?? 7)

  const fill = (css) => root.append(el('bg-fill', css))

  switch (b.kind) {
    case 'none':
      break
    case 'solid':
      fill({ background: p.bg })
      break
    case 'gradient':
      fill({ background: `linear-gradient(${b.angle}deg, ${p.bg}, ${p.bg2}${p.bg3 && b.stops !== 2 ? `, ${p.bg3}` : ''})` })
      break
    case 'radial':
      fill({ background: `radial-gradient(120% 80% at ${b.cx ?? 50}% ${b.cy ?? 30}%, ${p.bg2}, ${p.bg} 70%)` })
      break
    case 'split': {
      const at = b.at ?? 58
      fill({ background: `linear-gradient(${b.angle}deg, ${p.bg} ${at}%, ${p.bg2} ${at}%)` })
      break
    }
    case 'mesh': {
      fill({ background: p.bg })
      const blobs =
        b.blobs ??
        [p.bg2, p.accent, p.bg3, p.accent2, p.bg2].map((color, i) => ({
          x: (i + 0.5) / 5 + (rand() - 0.5) * 0.3,
          y: rand() * 0.9 + 0.05,
          r: 0.45 + rand() * 0.35,
          color,
        }))
      const layers = blobs
        .map((m) => {
          const cx = pano ? m.x * count * W : m.x * W
          return `radial-gradient(${m.r * Math.max(W, H)}px ${m.r * Math.max(W, H) * 0.8}px at ${cx}px ${m.y * H}px, ${m.color}, transparent 70%)`
        })
        .join(', ')
      fill({ background: layers, opacity: b.meshOpacity ?? 0.9 })
      break
    }
    case 'aurora': {
      fill({ background: `linear-gradient(${b.angle}deg, ${p.bg}, ${p.bg2})` })
      const colors = b.colors ?? [p.accent, p.accent2, p.bg3]
      const orbs = colors.map((c, i) => {
        const d = el('bg-orb', {
          width: `${fullW * 0.9}px`,
          height: `${H * 0.45}px`,
          background: `radial-gradient(closest-side, ${c}, transparent)`,
          filter: `blur(${u * 6}px)`,
          opacity: b.intensity ?? 0.75,
          mixBlendMode: b.blend ?? 'screen',
        })
        root.append(d)
        return { d, i }
      })
      updates.push((t) => {
        for (const { d, i } of orbs) {
          const x = fullW * (0.05 + 0.25 * i) + wobble(t * 0.35, i + 1) * W * 0.12
          const y = H * (0.12 + 0.28 * i) + wobble(t * 0.3, i + 7) * H * 0.06
          d.style.transform = `translate(${x - fullW * 0.45}px, ${y - H * 0.2}px) rotate(${-12 + i * 14 + wobble(t * 0.2, i) * 8}deg)`
        }
      })
      break
    }
    case 'spotlight':
      fill({ background: p.bg })
      fill({
        background: `radial-gradient(${W * 0.9}px ${H * 0.75}px at 50% ${b.cy ?? 20}%, ${p.bg2}, transparent 70%)`,
      })
      fill({
        background: `conic-gradient(from 180deg at 50% -10%, transparent 160deg, ${p.bg3} 175deg, ${p.bg3} 185deg, transparent 200deg)`,
        opacity: b.beam ?? 0.35,
        filter: `blur(${u * 3}px)`,
      })
      break
    case 'sunset': {
      fill({ background: `linear-gradient(180deg, ${p.bg} 0%, ${p.bg2} 55%, ${p.bg3} 100%)` })
      const r = (b.sun ?? 0.32) * W
      const sun = el('bg-sun', {
        width: `${r * 2}px`,
        height: `${r * 2}px`,
        left: `${(b.sunX ?? 0.5) * fullW - r}px`,
        top: `${(b.sunY ?? 0.42) * H - r}px`,
        background: `linear-gradient(180deg, ${p.accent2}, ${p.accent})`,
        WebkitMaskImage: `repeating-linear-gradient(180deg, #000 0 ${r * 1.05}px, transparent ${r * 1.05}px ${r * 1.12}px, #000 ${r * 1.12}px ${r * 1.24}px, transparent ${r * 1.24}px ${r * 1.34}px, #000 ${r * 1.34}px ${r * 1.44}px, transparent ${r * 1.44}px ${r * 1.56}px, #000 ${r * 1.56}px)`,
        boxShadow: `0 0 ${r * 0.6}px ${p.accent}66`,
      })
      root.append(sun)
      break
    }
    case 'synth': {
      fill({ background: `linear-gradient(180deg, ${p.bg} 0%, ${p.bg2} 48%, ${p.bg} 48.2%, ${p.bg} 100%)` })
      const r = 0.28 * Math.min(fullW, H * 0.6)
      root.append(
        el('bg-sun', {
          width: `${r * 2}px`,
          height: `${r * 2}px`,
          left: `${(b.sunX ?? 0.5) * fullW - r}px`,
          top: `${H * 0.48 - r * 1.35}px`,
          background: `linear-gradient(180deg, ${p.accent2}, ${p.accent})`,
          WebkitMaskImage: `linear-gradient(180deg, #000 55%, transparent 55% 60%, #000 60% 68%, transparent 68% 73%, #000 73% 79%, transparent 79% 85%, #000 85% 89%, transparent 89%)`,
          filter: `drop-shadow(0 0 ${u * 4}px ${p.accent})`,
        }),
      )
      const floor = el('bg-synth-floor', { top: `${H * 0.48}px`, height: `${H * 0.52}px`, perspective: `${H * 0.35}px` })
      const grid = el('bg-synth-grid', {
        backgroundImage: `linear-gradient(${p.accent} 2px, transparent 2px), linear-gradient(90deg, ${p.accent} 2px, transparent 2px)`,
        backgroundSize: `${u * 9}px ${u * 9}px`,
        filter: `drop-shadow(0 0 ${u * 0.6}px ${p.accent})`,
      })
      floor.append(grid)
      root.append(floor)
      root.append(el('bg-fill', { background: `linear-gradient(180deg, transparent 46%, ${p.bg} 50%, transparent 62%)` }))
      updates.push((t) => {
        grid.style.backgroundPosition = `0 ${(t * (b.speed ?? 1) * u * 9) % (u * 9)}px`
      })
      break
    }
    case 'paper':
      fill({ background: p.bg })
      fill({ backgroundImage: GRAIN(0.9), backgroundSize: '480px 480px', mixBlendMode: 'multiply', opacity: 0.35 })
      break
    case 'blur-shot':
    case 'image': {
      const url = b.kind === 'image' ? b.image : ctx.shotUrl
      fill({ background: p.bg })
      if (url) {
        fill({
          backgroundImage: `url("${url}")`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          filter: `blur(${b.blur * (W / 1000)}px) saturate(${b.saturate ?? 1.3})`,
          transform: 'scale(1.25)',
        })
      }
      fill({ background: `linear-gradient(180deg, rgba(0,0,0,${b.dim}), rgba(0,0,0,${Math.min(1, b.dim * 1.6)}))` })
      break
    }
    default:
      fill({ background: p.bg })
  }

  // Free-form shapes in page fractions (or panorama fractions): circles,
  // rounded rects, rings, arcs. The panorama theme relies on these crossing
  // slide edges.
  // In a panorama, x spans the whole set unless the shape repeats per slide.
  const placed = (b.shapes ?? []).flatMap((s) =>
    pano && s.repeat ? Array.from({ length: count }, (_, k) => ({ ...s, px: (k + s.x) * W })) : [{ ...s, px: (pano ? s.x * count : s.x) * W }],
  )
  for (const s of placed) {
    const size = s.size * Math.min(W, H)
    const x = s.px
    const shape = el(`bg-shape bg-${s.kind ?? 'circle'}`, {
      width: `${size * (s.aspect ?? 1)}px`,
      height: `${size}px`,
      left: `${x - (size * (s.aspect ?? 1)) / 2}px`,
      top: `${s.y * H - size / 2}px`,
      background: s.kind === 'ring' ? 'transparent' : (s.color ?? p.accent),
      borderColor: s.color ?? p.accent,
      borderWidth: s.kind === 'ring' ? `${size * (s.stroke ?? 0.08)}px` : 0,
      opacity: s.opacity ?? 1,
      transform: `rotate(${s.rotate ?? 0}deg)`,
      filter: s.blur ? `blur(${s.blur * u}px)` : '',
      borderRadius: s.kind === 'rect' ? `${(s.radius ?? 0.2) * size}px` : s.kind === 'pill' ? `${size}px` : '50%',
    })
    root.append(shape)
    if (s.drift) {
      updates.push((t) => {
        shape.style.transform = `translate(${wobble(t * 0.4, s.x * 10) * u * s.drift}px, ${wobble(t * 0.35, s.y * 10) * u * s.drift}px) rotate(${(s.rotate ?? 0) + t * (s.spin ?? 0)}deg)`
      })
    }
  }

  const pat = patternCss(b.pattern, b.patternColor ?? p.ink, b.patternScale, u)
  if (pat) {
    const d = el('bg-fill bg-pattern', { ...pat, opacity: b.patternOpacity })
    if (b.patternMask !== false) d.style.WebkitMaskImage = `radial-gradient(120% 90% at 50% 40%, #000 30%, transparent 90%)`
    root.append(d)
    if (b.patternDrift) {
      updates.push((t) => {
        d.style.backgroundPosition = `${t * b.patternDrift * u}px ${t * b.patternDrift * u * 0.6}px`
      })
    }
  }
  if (b.grain > 0) {
    root.append(el('bg-fill bg-grain', { backgroundImage: GRAIN(b.grain), backgroundSize: '240px 240px', mixBlendMode: 'overlay' }))
  }
  if (b.vignette > 0) {
    root.append(el('bg-fill', { background: `radial-gradient(120% 90% at 50% 45%, transparent 50%, rgba(0,0,0,${b.vignette}))` }))
  }
  return (t) => updates.forEach((f) => f(t))
}
