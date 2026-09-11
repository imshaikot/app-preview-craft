// Headline blocks. Markup: *word* highlights, a newline or " | " breaks a line.
import { fontStack } from '../catalog/fonts.js'
import { clamp, ease } from './ease.js'

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** "Track *every* run | and more" -> HTML with word spans. */
export function markup(text, { words = true } = {}) {
  if (!text) return ''
  const lines = String(text).replace(/\s+\|\s+/g, '\n').split('\n')
  return lines.map((line) => markupLine(line, words)).join('<br>')
}

function markupLine(line, words) {
  const segs = line
    .split(/(\*[^*]+\*)/)
    .filter(Boolean)
    .map((p) => {
      const hl = p.length > 2 && p.startsWith('*') && p.endsWith('*')
      return { hl, text: hl ? p.slice(1, -1) : p }
    })
  // Flatten into pieces and spaces. A word is a run of non-space characters
  // even across a highlight edge, so "*smarter*," never breaks before the comma.
  const items = []
  let word = -1
  for (const s of segs) {
    for (const part of s.text.split(/(\s+)/)) {
      if (!part) continue
      if (/^\s+$/.test(part)) items.push({ space: true, hl: s.hl })
      else {
        if (!items.length || items.at(-1).space) word++
        items.push({ space: false, hl: s.hl, text: part, word })
      }
    }
  }
  // Rounded ends only where a highlight run starts or stops.
  items.forEach((it, i) => {
    it.l = it.hl && !items[i - 1]?.hl
    it.r = it.hl && !items[i + 1]?.hl
  })
  const piece = (it) => (it.hl ? `<span class="hl${it.l ? ' hl-l' : ''}${it.r ? ' hl-r' : ''}">${esc(it.text)}</span>` : esc(it.text))
  let html = ''
  for (let i = 0; i < items.length; i++) {
    const it = items[i]
    if (it.space) {
      html += it.hl && items[i - 1]?.hl && items[i + 1]?.hl ? '<span class="hl hl-gap"> </span>' : ' '
      continue
    }
    if (!words) {
      html += piece(it)
      continue
    }
    let group = ''
    while (i < items.length && !items[i].space && items[i].word === it.word) group += piece(items[i++])
    i--
    html += `<span class="w">${group}</span>`
  }
  return html
}

const CASES = { upper: 'uppercase', lower: 'lowercase', title: 'capitalize', none: 'none' }

export class TextBlock {
  /**
   * box: {x, y, w, h, align, valign} in page px. base: headline px size.
   * fields: {kicker, title, subtitle}
   */
  constructor(layer, theme, fields, box, { base, editable = false, onEdit, cls = '' } = {}) {
    const { type, palette } = theme
    this.el = document.createElement('div')
    this.el.className = `text-block hl-${type.highlight} ${cls}`
    const s = this.el.style
    s.left = `${box.x}px`
    s.top = `${box.y}px`
    s.width = `${box.w}px`
    s.height = `${box.h}px`
    s.textAlign = box.align ?? 'center'
    s.justifyContent = { top: 'flex-start', center: 'center', bottom: 'flex-end' }[box.valign ?? 'top']
    s.alignItems = { left: 'flex-start', center: 'center', right: 'flex-end' }[box.align ?? 'center']
    s.setProperty('--ink', palette.ink)
    s.setProperty('--sub', palette.sub)
    s.setProperty('--accent', palette.accent)
    s.setProperty('--accent2', palette.accent2)
    s.setProperty('--surface', palette.surface)
    s.setProperty('--bg', palette.bg)

    this.base = base * type.size
    this.parts = {}
    const add = (key, text, css) => {
      if (!text && !editable) return
      const d = document.createElement('div')
      d.className = `tb-${key}`
      d.innerHTML = markup(text)
      Object.assign(d.style, css)
      if (editable) {
        d.contentEditable = 'plaintext-only'
        d.spellcheck = false
        d.dataset.field = key
        d.dataset.placeholder = { kicker: 'Kicker', title: 'Headline — *highlight* words', subtitle: 'Subtitle' }[key]
        d.addEventListener('focus', () => {
          d.textContent = fields[key] ?? ''
        })
        d.addEventListener('blur', () => {
          const v = d.innerText.replace(/\n+$/, '')
          fields[key] = v
          d.innerHTML = markup(v)
          onEdit?.(key, v)
        })
        d.addEventListener('keydown', (e) => {
          if (e.key === 'Escape') d.blur()
        })
      }
      this.el.append(d)
      this.parts[key] = d
    }
    const shadow = type.shadow > 0 ? `0 ${base * 0.03}px ${base * 0.25}px rgba(0,0,0,${type.shadow})` : 'none'
    add('kicker', fields.kicker, {
      fontFamily: fontStack(type.body),
      fontWeight: 650,
      fontSize: `${this.base * 0.26}px`,
      letterSpacing: '0.14em',
      textTransform: 'uppercase',
      color: palette.accent,
      marginBottom: `${this.base * 0.22}px`,
    })
    add('title', fields.title, {
      fontFamily: fontStack(type.display),
      fontWeight: type.weight,
      fontStyle: type.italic ? 'italic' : 'normal',
      fontSize: `${this.base}px`,
      lineHeight: type.leading,
      letterSpacing: `${type.tracking}em`,
      textTransform: CASES[type.case] ?? 'none',
      color: palette.ink,
      textShadow: shadow,
      fontVariationSettings: type.variation ?? 'normal',
    })
    add('subtitle', fields.subtitle, {
      fontFamily: fontStack(type.body),
      fontWeight: type.bodyWeight,
      fontSize: `${this.base * 0.4 * type.subSize}px`,
      lineHeight: 1.3,
      color: palette.sub,
      marginTop: `${this.base * 0.28}px`,
      textShadow: shadow,
      maxWidth: `${box.w * (type.subWidth ?? 0.92)}px`,
    })
    if (type.italicFont) s.setProperty('--hl-font', fontStack(type.italicFont))
    layer.append(this.el)
    this.box = box
  }

  /** Shrink until the block fits its box (fonts must be loaded first). */
  fit() {
    const { el, box } = this
    let k = 1
    for (let i = 0; i < 24; i++) {
      const over = el.scrollHeight > box.h + 1 || [...el.children].some((c) => c.scrollWidth > box.w + 2)
      if (!over) break
      k *= 0.94
      for (const d of Object.values(this.parts)) d.style.fontSize = `${parseFloat(d.style.fontSize) * 0.94}px`
    }
    this.scale = k
    return k
  }

  /** Word-by-word entrance; p in [0, 1]. style: rise | fade | blur | none */
  reveal(p, style = 'rise') {
    if (style === 'none') return
    const words = this.el.querySelectorAll('.w')
    const n = words.length || 1
    words.forEach((w, i) => {
      const local = ease.outCubic(clamp(p * (n * 0.35 + 1) - i * 0.35))
      w.style.opacity = local
      if (style === 'rise') w.style.transform = `translateY(${(1 - local) * 0.5}em)`
      if (style === 'blur') w.style.filter = `blur(${(1 - local) * 0.25}em)`
    })
  }

  set opacity(v) {
    this.el.style.opacity = v
  }

  move(dx = 0, dy = 0, scale = 1) {
    this.el.style.transform = `translate(${dx}px, ${dy}px) scale(${scale})`
  }
}
