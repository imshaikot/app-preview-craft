// Flat devices drawn in CSS: a crisp phone/tablet/browser frame or a bare
// rounded screenshot. Same interface as Device3D (place, paint).
import { ScreenPainter } from './screen.js'
import { FLAT_FRAMES } from '../catalog/devices.js'

export class FlatDevice {
  /**
   * variant: phone | phone-android | tablet | browser | frameless
   * style: {frame, edge, corner, shadow, border, glow}
   */
  constructor(layer, { variant = 'phone', aspect, width, style = {}, background = '#000' }) {
    const spec = FLAT_FRAMES[variant] ?? { radius: style.corner ?? 0.06, bezel: 0, aspect: aspect ?? 0.46 }
    this.variant = variant
    this.spec = spec
    this.aspect = aspect ?? spec.aspect
    const bezel = variant === 'frameless' ? 0 : spec.bezel
    const bar = spec.bar ?? 0
    this.el = document.createElement('div')
    this.el.className = `flat-device fd-${variant}`
    const body = document.createElement('div')
    body.className = 'fd-body'
    const screen = document.createElement('div')
    screen.className = 'fd-screen'
    body.append(screen)
    this.el.append(body)

    // Frame geometry is proportional to the device width, set by place().
    this.bezel = bezel
    this.bar = bar
    this.radius = variant === 'frameless' ? (style.corner ?? 0.07) : spec.radius
    this.body = body
    this.screen = screen

    if (variant === 'browser') {
      const chrome = document.createElement('div')
      chrome.className = 'fd-bar'
      chrome.innerHTML = '<i></i><i></i><i></i><b></b>'
      body.prepend(chrome)
    }
    if (spec.island && variant !== 'frameless') {
      const island = document.createElement('div')
      island.className = 'fd-island'
      body.append(island)
    }
    if (spec.punch && variant !== 'frameless') {
      const punch = document.createElement('div')
      punch.className = 'fd-punch'
      body.append(punch)
    }

    const s = this.el.style
    s.setProperty('--frame', style.frame ?? '#101014')
    s.setProperty('--edge', style.edge ?? '#4a4a52')
    if (style.shadow === false) this.el.classList.add('no-shadow')
    if (style.shadowColor) s.setProperty('--shadow', style.shadowColor)
    if (style.border) s.setProperty('--border', style.border)
    if (style.glow) s.setProperty('--glow', style.glow)
    layer.append(this.el)

    this.width = width ?? 400
    const sw = Math.round(this.width * (1 - 2 * bezel) * 2)
    this.painter = new ScreenPainter(sw, sw / this.aspect, { background })
    this.painter.canvas.className = 'fd-canvas'
    screen.append(this.painter.canvas)
  }

  /** Height of the frame for a given width. */
  heightFor(w) {
    const inner = w * (1 - 2 * this.bezel)
    return inner / this.aspect + w * this.bezel * 2 + w * this.bar
  }

  /** Place by page pixels. `size` is the frame height (width if byWidth). */
  place({ x, y, size, byWidth = false, rx = 0, ry = 0, rz = 0, scale = 1, opacity = 1, z = 0, visible = true }) {
    const w = byWidth ? size : size / this.heightFor(1)
    const h = this.heightFor(w)
    const s = this.el.style
    s.width = `${w}px`
    s.height = `${h}px`
    s.left = `${x - w / 2}px`
    s.top = `${y - h / 2}px`
    s.opacity = opacity
    s.zIndex = Math.round(z)
    s.visibility = visible && scale > 0.001 ? 'visible' : 'hidden'
    s.transform = `perspective(${Math.max(w, h) * 3.2}px) rotateY(${ry}deg) rotateX(${rx}deg) rotateZ(${rz}deg) scale(${scale})`
    s.setProperty('--w', `${w}px`)
    s.setProperty('--r', `${this.radius * w}px`)
    s.setProperty('--bz', `${this.bezel * w}px`)
    s.setProperty('--bar', `${this.bar * w}px`)
    this.rect = { x: x - w / 2, y: y - h / 2, w, h }
  }

  paint(a, b, p, mode) {
    this.painter.paint(a, b, p, mode)
  }

  /** Page rect of the screen area (untransformed). */
  screenRect() {
    const { x, y, w, h } = this.rect
    const bz = this.bezel * w
    const bar = this.bar * w
    return { x: x + bz, y: y + bz + bar, w: w - 2 * bz, h: h - 2 * bz - bar }
  }
}
