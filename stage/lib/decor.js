// Decorations layered around the device. Each item is
// {kind, x, y, scale, rotate, delay, ...kind params}; x/y are page fractions.
import { fontStack } from '../catalog/fonts.js'
import { clamp, ease, rng, span, wobble } from './ease.js'
import { markup } from './text.js'
import { drawCover } from './screen.js'

export const ICONS = {
  star: 'M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z',
  bolt: 'M13 2 4 14h7l-1 8 9-12h-7z',
  heart: 'M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.9 4.5c2.1 0 3.6 1.1 5.1 3 1.5-1.9 3-3 5.1-3 3.9 0 6 3.9 4.5 7.3C19.5 16.4 12 21 12 21z',
  check: 'M4 12.5l5 5L20 6.5',
  sparkle: 'M12 1.5c.8 5.6 3.9 8.7 9.5 10.5-5.6 1.8-8.7 4.9-9.5 10.5-.8-5.6-3.9-8.7-9.5-10.5C8.1 10.2 11.2 7.1 12 1.5z',
  trophy: 'M7 3h10v3h3v2a5 5 0 0 1-5 5 5 5 0 0 1-2 2.6V18h3v3H8v-3h3v-2.4A5 5 0 0 1 9 13a5 5 0 0 1-5-5V6h3z',
  leaf: 'M20 4C9 4 4 9.5 4 16c0 1.5.4 2.8 1 4 1-4 4-8 9-10-4 3-6.5 6-7.5 10 1 .3 2 .5 3 .5C16 20.5 20 15 20 4z',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3h1.5v11h-13V10zm2 0h6V7a3 3 0 0 0-6 0z',
  music: 'M9 18.5a3 3 0 1 1-2-2.8V5l12-2.5v12.5a3 3 0 1 1-2-2.8V7.3L9 9z',
  pin: 'M12 22s-7-7.2-7-12.5a7 7 0 0 1 14 0C19 14.8 12 22 12 22zm0-9.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  flame: 'M12 22c-4.4 0-7.5-3-7.5-7.2 0-3.8 2.6-6 3.8-9.8 2.2 1.6 3 3.6 3 5.4 1-1 1.7-2.5 1.7-4.4 3.3 2.2 5.5 5.3 5.5 8.8 0 4.2-2.9 7.2-6.5 7.2z',
  bell: 'M12 22a2.5 2.5 0 0 0 2.4-2h-4.8A2.5 2.5 0 0 0 12 22zm7-6V11a7 7 0 0 0-5.5-6.8V3a1.5 1.5 0 0 0-3 0v1.2A7 7 0 0 0 5 11v5l-2 2v1h18v-1z',
  chart: 'M4 20V10h3v10zm6.5 0V4h3v16zM17 20v-7h3v7z',
  shield: 'M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5z',
  globe: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zm6.9 9h-3a15.7 15.7 0 0 0-1.3-6 8 8 0 0 1 4.3 6zM12 4.1c.9 1.2 1.9 3.5 2 6.9h-4c.1-3.4 1.1-5.7 2-6.9zM9.4 5a15.7 15.7 0 0 0-1.3 6h-3a8 8 0 0 1 4.3-6zm-4.3 8h3a15.7 15.7 0 0 0 1.3 6 8 8 0 0 1-4.3-6zm6.9 6.9c-.9-1.2-1.9-3.5-2-6.9h4c-.1 3.4-1.1 5.7-2 6.9zm2.6-.9a15.7 15.7 0 0 0 1.3-6h3a8 8 0 0 1-4.3 6z',
  play: 'M7 4v16l13-8z',
}

const svgIcon = (name, color, size) =>
  ICONS[name]
    ? `<svg viewBox="0 0 24 24" width="${size}" height="${size}" style="flex:none"><path d="${ICONS[name]}" fill="${name === 'check' ? 'none' : color}" stroke="${name === 'check' ? color : 'none'}" stroke-width="${name === 'check' ? 3 : 0}" stroke-linecap="round" stroke-linejoin="round"/></svg>`
    : ''

/** A laurel branch curving up the left side; mirrored for the right. */
const LAUREL = (color, flip) => {
  const cx = 62
  const cy = 55
  const r = 42
  const rad = (d) => (d * Math.PI) / 180
  let leaves = ''
  for (let i = 0; i < 8; i++) {
    const a = 102 + i * 21
    const x = cx + r * Math.cos(rad(a))
    const y = cy + r * Math.sin(rad(a))
    for (const side of [-1, 1]) {
      const ox = x + side * 6.5 * Math.cos(rad(a))
      const oy = y + side * 6.5 * Math.sin(rad(a))
      const size = 1 - i * 0.045
      leaves += `<ellipse cx="${ox.toFixed(1)}" cy="${oy.toFixed(1)}" rx="${(3.4 * size).toFixed(2)}" ry="${(8.6 * size).toFixed(2)}" transform="rotate(${a + side * 32} ${ox.toFixed(1)} ${oy.toFixed(1)})" fill="${color}"/>`
    }
  }
  const p0 = [cx + r * Math.cos(rad(96)), cy + r * Math.sin(rad(96))]
  const p1 = [cx + r * Math.cos(rad(252)), cy + r * Math.sin(rad(252))]
  const stem = `<path d="M${p0[0].toFixed(1)} ${p0[1].toFixed(1)} A${r} ${r} 0 0 1 ${p1[0].toFixed(1)} ${p1[1].toFixed(1)}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linecap="round"/>`
  return `<svg viewBox="4 2 66 108" style="height:100%;flex:none;transform:${flip ? 'scaleX(-1)' : 'none'}">${stem}${leaves}</svg>`
}

function box(cls, css) {
  const d = document.createElement('div')
  d.className = `decor ${cls}`
  Object.assign(d.style, css)
  return d
}

/**
 * ctx: {W, H, u, theme, layer, three, slide, shotImg, screenPoint(u,v)}
 * Returns [{el, update(t)}].
 */
export function buildDecor(items, ctx) {
  const { W, H, theme } = ctx
  const p = theme.palette
  const u = Math.min(W, H) / 100
  const bodyFont = fontStack(theme.type.body)
  const out = []

  for (const [n, item] of (items ?? []).entries()) {
    if (!item || item.enabled === false) continue
    const sc = item.scale ?? 1
    // Decor sits in front of the device unless it asks for the back layer.
    const layerName = item.layer ?? (item.kind === 'blob' ? 'back' : 'front')
    const at = (el) => {
      el.style.left = `${(item.x ?? 0.5) * W}px`
      el.style.top = `${(item.y ?? 0.5) * H}px`
      el.dataset.rotate = item.rotate ?? 0
      ;(ctx.layers?.[layerName] ?? ctx.layer).append(el)
      return el
    }
    const glass = item.style ?? theme.decorStyle ?? 'glass'
    const surface = {
      glass: { background: p.surface, backdropFilter: `blur(${u * 2}px)`, border: `1px solid rgba(255,255,255,0.18)`, color: p.ink },
      solid: { background: item.color ?? p.accent, color: item.ink ?? p.bg },
      light: { background: '#ffffff', color: '#111111', boxShadow: `0 ${u * 0.8}px ${u * 3}px rgba(0,0,0,.18)` },
      dark: { background: '#111216', color: '#ffffff', boxShadow: `0 ${u * 0.8}px ${u * 3}px rgba(0,0,0,.35)` },
      outline: { background: 'transparent', border: `${u * 0.25}px solid ${item.color ?? p.ink}`, color: item.color ?? p.ink },
    }[glass]
    let el
    let update = null
    // Base type size for decor; tuned so a 1320px-wide store shot reads at a glance.
    const f = u * 3.3 * sc

    switch (item.kind) {
      case 'badge':
        el = at(box('d-badge', { ...surface, fontFamily: bodyFont, fontSize: `${f}px`, padding: `${f * 0.5}px ${f * 0.9}px`, gap: `${f * 0.45}px` }))
        el.innerHTML = `${svgIcon(item.icon ?? 'star', item.iconColor ?? p.accent, f * 1.15)}<span>${markup(item.text ?? 'Top rated', { words: false })}</span>`
        break
      case 'rating': {
        el = at(box('d-rating', { fontFamily: bodyFont, color: item.color ?? p.ink, fontSize: `${f}px`, gap: `${f * 0.3}px` }))
        const stars = Array.from({ length: 5 }, () => svgIcon('star', item.starColor ?? p.accent, f * 1.3)).join('')
        el.innerHTML = `<div class="d-stars">${stars}</div><div class="d-score"><b>${item.score ?? '4.9'}</b> <span>${item.label ?? '120K ratings'}</span></div>`
        break
      }
      case 'laurels': {
        el = at(box('d-laurels', { fontFamily: bodyFont, color: item.color ?? p.ink, height: `${f * 4.6}px`, gap: `${f * 0.4}px` }))
        el.innerHTML = `${LAUREL(item.color ?? p.ink, false)}<div class="d-laurel-text"><small style="font-size:${f * 0.62}px">${item.top ?? ''}</small><b style="font-size:${f * 1.05}px">${markup(item.text ?? 'Loved by millions', { words: false })}</b><small style="font-size:${f * 0.62}px">${item.bottom ?? ''}</small></div>${LAUREL(item.color ?? p.ink, true)}`
        break
      }
      case 'chips': {
        el = at(box('d-chips', { fontFamily: bodyFont, fontSize: `${f * 0.9}px`, gap: `${f * 0.45}px`, maxWidth: `${(item.width ?? 0.86) * W}px` }))
        el.innerHTML = (item.items ?? ['Offline', 'Private', 'Synced'])
          .map((t, i) => `<span class="d-chip" style="padding:${f * 0.42}px ${f * 0.8}px;background:${i === 0 && item.lead !== false ? p.accent : p.surface};color:${i === 0 && item.lead !== false ? p.bg : p.ink}">${item.icons?.[i] ? svgIcon(item.icons[i], 'currentColor', f) : ''}${t}</span>`)
          .join('')
        break
      }
      case 'notification': {
        const light = glass !== 'dark'
        el = at(
          box('d-notif', {
            width: `${(item.width ?? 0.62) * W}px`,
            padding: `${f * 0.7}px`,
            gap: `${f * 0.6}px`,
            borderRadius: `${f * 1.1}px`,
            background: light ? 'rgba(250,250,252,0.86)' : 'rgba(28,28,32,0.86)',
            color: light ? '#111' : '#fff',
            backdropFilter: `blur(${u * 3}px) saturate(1.6)`,
            boxShadow: `0 ${u}px ${u * 4}px rgba(0,0,0,.25)`,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            fontSize: `${f * 0.82}px`,
          }),
        )
        const icon = item.icon
          ? `<img src="${item.icon}" style="width:${f * 2.1}px;height:${f * 2.1}px;border-radius:${f * 0.5}px">`
          : `<div style="width:${f * 2.1}px;height:${f * 2.1}px;border-radius:${f * 0.5}px;background:linear-gradient(135deg,${p.accent},${p.accent2});display:grid;place-items:center">${svgIcon(item.glyph ?? 'bell', '#fff', f * 1.2)}</div>`
        el.innerHTML = `${icon}<div style="flex:1;min-width:0"><div style="display:flex;justify-content:space-between;opacity:.6;font-size:.82em"><span>${item.app ?? 'APP'}</span><span>${item.time ?? 'now'}</span></div><div style="font-weight:650;margin-top:.15em">${item.title ?? 'Goal reached'}</div><div style="opacity:.85">${item.body ?? 'You closed all your rings today.'}</div></div>`
        break
      }
      case 'stat': {
        el = at(box('d-stat', { ...surface, padding: `${f * 0.8}px ${f * 1.1}px`, borderRadius: `${f * 0.9}px`, fontFamily: bodyFont }))
        el.innerHTML = `<div style="font-size:${f * 0.7}px;opacity:.7;text-transform:uppercase;letter-spacing:.1em">${item.label ?? 'This week'}</div><div style="font-family:${fontStack(theme.type.display)};font-weight:${theme.type.weight};font-size:${f * 2.2}px;line-height:1.05">${item.value ?? '42.7 km'}</div>${item.trend ? `<div style="font-size:${f * 0.8}px;color:${item.trendColor ?? p.accent};font-weight:650">${item.trend}</div>` : ''}`
        break
      }
      case 'logo': {
        el = at(box('d-logo', { fontFamily: fontStack(theme.type.display), color: item.color ?? p.ink, fontSize: `${f * 1.3}px`, gap: `${f * 0.5}px`, fontWeight: 700 }))
        const s = f * 2.4
        const icon = item.src
          ? `<img src="${item.src}" style="width:${s}px;height:${s}px;border-radius:${s * 0.225}px;box-shadow:0 ${u * 0.4}px ${u * 1.5}px rgba(0,0,0,.25)">`
          : `<div style="width:${s}px;height:${s}px;border-radius:${s * 0.225}px;background:linear-gradient(140deg,${p.accent},${p.accent2});display:grid;place-items:center;color:#fff;font-size:${s * 0.5}px">${(item.name ?? 'A')[0]}</div>`
        el.innerHTML = `${icon}${item.name && item.showName !== false ? `<span>${item.name}</span>` : ''}`
        break
      }
      case 'store-badge': {
        el = at(box('d-store', { background: item.color ?? '#000', color: '#fff', border: '1.5px solid rgba(255,255,255,.4)', fontFamily: 'system-ui, sans-serif', padding: `${f * 0.45}px ${f * 1}px`, borderRadius: `${f * 0.55}px`, gap: `${f * 0.5}px` }))
        el.innerHTML = item.src
          ? `<img src="${item.src}" style="height:${f * 2}px">`
          : `<div style="line-height:1.05"><div style="font-size:${f * 0.55}px;opacity:.85">${item.top ?? 'Download now on'}</div><div style="font-size:${f * 1.05}px;font-weight:600">${item.text ?? 'iPhone & Android'}</div></div>`
        break
      }
      case 'arrow': {
        const w = (item.w ?? 0.2) * W
        const h = (item.h ?? 0.08) * H
        el = at(box('d-arrow', { width: `${w}px`, height: `${h}px`, color: item.color ?? p.accent }))
        const flip = item.flip ? 'scale(-1,1)' : ''
        el.innerHTML = `<svg viewBox="0 0 200 80" preserveAspectRatio="none" style="width:100%;height:100%;overflow:visible;transform:${flip}"><path class="d-arrow-path" d="M6 70 C 50 10, 130 0, 186 30" fill="none" stroke="currentColor" stroke-width="${item.stroke ?? 5}" stroke-linecap="round" vector-effect="non-scaling-stroke"/><path d="M168 16 L188 31 L166 42" fill="none" stroke="currentColor" stroke-width="${item.stroke ?? 5}" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>${item.text ? `<div class="d-arrow-note" style="font-family:${fontStack(item.font ?? 'caveat')};font-size:${f * 1.6}px">${item.text}</div>` : ''}`
        break
      }
      case 'callout': {
        // A magnified crop of the screenshot, floating as a card.
        const [rx, ry, rw, rh] = item.rect ?? [0.08, 0.3, 0.84, 0.18]
        const w = (item.w ?? 0.62) * W
        const img = ctx.shotImg
        const iw = img?.naturalWidth ?? 1000
        const ih = img?.naturalHeight ?? 2000
        const h = (w * (rh * ih)) / (rw * iw)
        el = at(box('d-callout', { width: `${w}px`, height: `${h}px`, borderRadius: `${(item.radius ?? 0.05) * w}px`, boxShadow: `0 ${u * 1.5}px ${u * 6}px rgba(0,0,0,${item.shadow ?? 0.35})`, outline: item.border ? `${u * 0.4}px solid ${item.border}` : 'none' }))
        const c = document.createElement('canvas')
        c.width = Math.round(w * 1.5)
        c.height = Math.round(h * 1.5)
        if (img) c.getContext('2d').drawImage(img, rx * iw, ry * ih, rw * iw, rh * ih, 0, 0, c.width, c.height)
        el.append(c)
        break
      }
      case 'sparkles':
      case 'confetti': {
        const rand = rng(item.seed ?? 11 + n)
        const count = item.count ?? (item.kind === 'sparkles' ? 10 : 36)
        const area = item.area ?? [0, 0, 1, 1]
        el = at(box('d-field', { left: 0, top: 0, width: `${W}px`, height: `${H}px` }))
        el.style.left = '0px'
        el.style.top = '0px'
        const colors = item.colors ?? [p.accent, p.accent2, p.ink]
        const bits = Array.from({ length: count }, (_, i) => {
          const x = (area[0] + rand() * (area[2] - area[0])) * W
          const y = (area[1] + rand() * (area[3] - area[1])) * H
          const s = (item.kind === 'sparkles' ? 2 + rand() * 3.5 : 1.2 + rand() * 1.8) * u * sc
          const color = colors[i % colors.length]
          const d = document.createElement('div')
          d.className = 'd-bit'
          Object.assign(d.style, { left: `${x}px`, top: `${y}px`, width: `${s}px`, height: `${item.kind === 'confetti' ? s * 0.45 : s}px` })
          d.innerHTML = item.kind === 'sparkles' ? svgIcon('sparkle', color, s) : ''
          if (item.kind === 'confetti') {
            d.style.background = color
            d.style.borderRadius = rand() > 0.5 ? '50%' : '2px'
          }
          const rot = rand() * 360
          d.style.transform = `rotate(${rot}deg)`
          el.append(d)
          return { d, rot, phase: rand() * 6, y }
        })
        update = (t) => {
          for (const b of bits) {
            if (item.kind === 'sparkles') {
              const tw = 0.55 + 0.45 * Math.sin(t * 2.2 + b.phase)
              b.d.style.opacity = tw
              b.d.style.transform = `rotate(${b.rot * 0.1}deg) scale(${0.7 + tw * 0.3})`
            } else {
              const fall = ctx.animated ? ((t * u * 6 + b.phase * 50) % (H * 0.3)) : 0
              b.d.style.transform = `translateY(${fall}px) rotate(${b.rot + t * 90}deg)`
            }
          }
        }
        break
      }
      case 'blob': {
        const s = (item.size ?? 0.8) * Math.min(W, H)
        el = at(box('d-blob', { width: `${s}px`, height: `${s}px`, transform: `translate(-50%,-50%) rotate(${item.rotate ?? 0}deg)` }))
        el.innerHTML = `<svg viewBox="0 0 200 200" width="100%" height="100%"><path fill="${item.color ?? p.accent}" opacity="${item.opacity ?? 1}" d="M44.7,-58.5C57.1,-50.9,65.5,-36.1,70.2,-20.1C74.9,-4.1,75.9,13.1,69.4,26.7C62.9,40.4,48.9,50.5,34,58.6C19.1,66.7,3.2,72.9,-13.6,72.2C-30.4,71.5,-48.1,64,-58.9,50.9C-69.7,37.8,-73.6,19.1,-72.4,1.2C-71.2,-16.7,-64.9,-33.8,-53.4,-41.9C-41.9,-50,-25.2,-49.1,-9.4,-47.7C6.4,-46.3,32.3,-66.1,44.7,-58.5Z" transform="translate(100 100)"/></svg>`
        update = (t) => {
          if (ctx.animated) el.style.transform = `translate(-50%,-50%) rotate(${(item.rotate ?? 0) + t * 8}deg) scale(${1 + wobble(t, 3) * 0.03})`
        }
        break
      }
      case 'orbs':
      case 'rings':
      case 'shapes': {
        if (!ctx.three) break
        const rand = rng(item.seed ?? 5 + n)
        const kinds = item.kind === 'orbs' ? ['orb'] : item.kind === 'rings' ? ['ring'] : (item.shapes ?? ['orb', 'ring', 'pill', 'cube'])
        // Scatter inside `area` [x0, y0, x1, y1]; by default keep to the side margins.
        const area = item.area
        const list = item.items ?? Array.from({ length: item.count ?? 4 }, (_, i) => ({
          kind: kinds[i % kinds.length],
          x: area ? area[0] + rand() * (area[2] - area[0]) : rand() < 0.5 ? 0.08 + rand() * 0.22 : 0.7 + rand() * 0.22,
          y: area ? area[1] + rand() * (area[3] - area[1]) : 0.15 + rand() * 0.75,
          // Far enough back that a device turned toward the camera never clips them.
          z: -0.12 - rand() * 0.2,
          size: (item.size ?? 0.12) * (0.6 + rand() * 0.8),
          color: (item.colors ?? [p.accent, p.accent2, p.bg3])[i % 3],
          rot: [rand() * 90, rand() * 90, rand() * 90],
        }))
        const meshes = list.map((s) => ctx.three.addShape({ finish: item.finish ?? 'glossy', ...s }))
        update = (t) => {
          if (!ctx.animated) return
          meshes.forEach((m, i) => {
            const b = m.userData.base
            m.rotation.x = ((b.rot[0] + t * 20 * (i % 2 ? 1 : -1)) * Math.PI) / 180
            m.rotation.y = ((b.rot[1] + t * 30) * Math.PI) / 180
            m.position.y = ctx.three.world(0, b.y * H).y + wobble(t, i + 2) * u * 1.5
          })
        }
        break
      }
      case 'credit': {
        el = at(box('d-credit', { fontFamily: bodyFont, color: item.color ?? p.sub, fontSize: `${u * 1.2 * sc}px`, opacity: 0.75 }))
        el.textContent = item.text ?? ctx.creditText ?? ''
        break
      }
      default:
        console.warn(`unknown decor kind "${item.kind}"`)
    }

    if (!el && !update) continue
    const anim = item.animate ?? 'pop'
    const delay = item.delay ?? 0.4 + n * 0.15
    const rot = item.rotate ?? 0
    const floatAmt = item.float ?? 0.6
    out.push({
      el,
      item,
      update: (t) => {
        update?.(t)
        if (!el || item.kind === 'sparkles' || item.kind === 'confetti' || item.kind === 'blob') return
        let k = 1
        let dy = 0
        if (ctx.animated) {
          k = anim === 'none' ? 1 : span(t, delay, 0.7, anim === 'pop' ? ease.outBack : ease.outCubic)
          dy = wobble(t * 0.8, n + 1) * u * floatAmt
        }
        el.style.opacity = clamp(k * 1.4)
        el.style.transform = `translate(-50%, -50%) translateY(${dy + (1 - k) * u * 3}px) rotate(${rot}deg) scale(${sc === 1 ? 0.85 + 0.15 * k : 0.85 + 0.15 * k})`
      },
    })
  }
  return out
}

export { drawCover }
