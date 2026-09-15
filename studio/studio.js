// app-preview-craft studio. The previews are live stage.html pages; this file only
// owns state (category, theme, overrides, slides) and turns it into specs.
import { getPath, isObj, merge, resolveTheme, setPath } from '/stage/catalog/resolve.js'
import { fontStack } from '/stage/catalog/fonts.js'

const $ = (s, el = document) => el.querySelector(s)
const $$ = (s, el = document) => [...el.querySelectorAll(s)]
const h = (tag, attrs = {}, ...kids) => {
  const el = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null || v === false) continue
    if (k === 'class') el.className = v
    else if (k === 'style' && isObj(v)) for (const [p, x] of Object.entries(v)) p.startsWith('--') ? el.style.setProperty(p, x) : (el.style[p] = x)
    else if (k.startsWith('on')) el.addEventListener(k.slice(2), v)
    else if (k === 'html') el.innerHTML = v
    else el.setAttribute(k, v === true ? '' : v)
  }
  for (const kid of kids.flat()) if (kid != null && kid !== false) el.append(kid.nodeType ? kid : document.createTextNode(kid))
  return el
}
const ICON = {
  left: '<svg viewBox="0 0 24 24"><path d="M15 6l-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 6l6 6-6 6"/></svg>',
  trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h13l-3-3M20 16H7l3 3"/></svg>',
  focus: '<svg viewBox="0 0 24 24"><path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  reset: '<svg viewBox="0 0 24 24"><path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/></svg>',
  play: '<svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M7 5h4v14H7zM13 5h4v14h-4z"/></svg>',
}

/* ── state ─────────────────────────────────────────────────────────────── */

const boot = await fetch('/api/state').then((r) => r.json())
const { catalog } = boot
const THEMES = boot.themes
const custom = { ...boot.custom }
const STORE = `app-preview-craft-studio:${boot.cwd}`

const initial = (() => {
  try {
    return JSON.parse(localStorage.getItem(STORE)) ?? {}
  } catch {
    return {}
  }
})()

const state = {
  category: initial.category ?? boot.project?.config?.category ?? 'app-store',
  themeByCat: initial.themeByCat ?? {},
  overridesByCat: initial.overridesByCat ?? {},
  sizeByCat: initial.sizeByCat ?? {},
  slides: initial.slides ?? boot.project?.slides ?? null,
  brand: initial.brand ?? boot.project?.config?.brand ?? null,
  index: 0,
  focus: null,
  tab: 'slides',
  panel: initial.panel ?? false,
  export: initial.export ?? {},
}
if (boot.project?.config?.theme && typeof boot.project.config.theme === 'string' && !initial.themeByCat) {
  state.themeByCat[state.category] = boot.project.config.theme
}
const usingSamples = () => !state.slides?.length
const slides = () => (usingSamples() ? (currentThemeRaw().samples === 'tall' ? boot.samples.tall : boot.samples.slides) : state.slides)
const brand = () => state.brand ?? (usingSamples() ? boot.samples.brand : {})
const cat = () => catalog.categories[state.category]
const themeId = () => state.themeByCat[state.category] ?? cat().defaultTheme
const overrides = () => (state.overridesByCat[state.category] ??= {})
const allThemes = () => ({ ...THEMES[state.category], ...Object.fromEntries(Object.entries(custom).filter(([, t]) => !t.category || t.category === state.category)) })
const currentThemeRaw = () => allThemes()[themeId()] ?? {}
const sizeKey = () => state.sizeByCat[state.category] ?? cat().defaultSize
const size = () => ({ key: sizeKey(), ...catalog.sizes[sizeKey()] })
const isVideo = () => cat().kind === 'video'

let saveTimer
function save() {
  clearTimeout(saveTimer)
  saveTimer = setTimeout(() => {
    const { focus, index, ...rest } = state
    localStorage.setItem(STORE, JSON.stringify(rest))
  }, 200)
}

function theme() {
  let t = resolveTheme(state.category, themeId(), { custom, overrides: [overrides()] })
  const s = size()
  if (s.frame === 'tablet' && !['frameless', 'none'].includes(t.device.mode)) {
    t = merge(t, { device: { mode: 'flat', flat: 'tablet', size: Math.min(t.device.size, 0.66) } })
  }
  return t
}

/* ── screen treatments (sharp, via the server) ─────────────────────────── */

const prepCache = new Map()
function treatmentOf(t) {
  const s = t.screen
  const active = s.cleanStatusBar || s.tint || s.duotone || s.saturate !== 1 || s.brightness !== 1 || s.sharpen
  return active ? { cleanStatusBar: s.cleanStatusBar, statusBarTime: s.statusBarTime, tint: s.tint, tintAmount: s.tintAmount, duotone: s.duotone, saturate: s.saturate, brightness: s.brightness, sharpen: s.sharpen } : null
}
async function prepared(screen, treatment) {
  if (!screen || screen.kind !== 'image' || !treatment) return null
  const key = JSON.stringify([screen.path, treatment])
  if (!prepCache.has(key)) {
    prepCache.set(
      key,
      fetch('/api/prepare', { method: 'POST', body: JSON.stringify({ path: screen.path, treatment }) })
        .then((r) => r.json())
        .catch(() => null),
    )
  }
  return prepCache.get(key)
}
const toStageScreen = async (screen, treatment) => {
  if (!screen) return undefined
  if (screen.kind === 'video') return { frames: screen.frames, w: screen.w, h: screen.h }
  const p = await prepared(screen, treatment)
  return p?.url ? { url: p.url, w: p.w, h: p.h, backdrop: p.backdrop } : { url: screen.url, w: screen.w, h: screen.h }
}

async function buildSpec(index, pixelRatio) {
  const t = theme()
  const s = size()
  const treatment = treatmentOf(t)
  const list = await Promise.all(
    slides().map(async (sl) => ({
      ...sl,
      screen: await toStageScreen(sl.screen, treatment),
      desktop: await toStageScreen(sl.desktop, null),
      hold: sl.hold ?? (sl.screen?.kind === 'video' ? sl.screen.duration : undefined),
    })),
  )
  return {
    category: state.category,
    kind: cat().kind,
    theme: t,
    width: s.w,
    height: s.h,
    slides: list,
    index,
    count: list.length,
    brand: brand(),
    pixelRatio,
    animated: isVideo(),
    editable: true,
    assetBase: '/',
    screenScale: 0.6,
  }
}

/* ── frames ────────────────────────────────────────────────────────────── */

const canvas = $('#canvas')
let frames = []
let loadSeq = 0

function frameCount() {
  if (cat().set) return slides().length
  return 1
}

function layoutFrames() {
  const s = size()
  const vp = $('#viewport').getBoundingClientRect()
  const set = cat().set
  const availH = vp.height - 18 - (isVideo() ? 84 : 54) - (set ? 20 : 0)
  const availW = vp.width - 80
  const n = frames.length
  let scale
  if (state.focus != null && set) scale = Math.min(availH / s.h, (availW - 44) / s.w)
  // A set shares the row with two spacers and the add tile (0.55 of a frame).
  else if (set) scale = Math.min(availH / s.h, (availW - (n + 2) * 22) / (n + 0.55) / s.w)
  else scale = Math.min(availH / s.h, (availW - 44) / s.w)
  if (set && state.focus == null) scale = Math.max(scale, Math.min(availH / s.h, 150 / s.w))
  for (const f of frames) {
    const w = Math.round(s.w * scale)
    const hgt = Math.round(s.h * scale)
    f.wrap.style.width = `${w}px`
    f.wrap.style.height = `${hgt}px`
    f.iframe.style.width = `${s.w}px`
    f.iframe.style.height = `${s.h}px`
    f.iframe.style.transform = `scale(${scale})`
    f.scale = scale
    f.el.hidden = state.focus != null && set && f.index !== state.focus
    f.el.classList.toggle('focus', state.focus === f.index && set)
  }
  const add = $('.add-tile', canvas)
  if (add) {
    add.style.width = `${Math.round(s.w * scale * 0.55)}px`
    add.style.height = `${Math.round(s.h * scale)}px`
    add.hidden = state.focus != null
  }
  return scale
}

function buildFrames() {
  for (const f of frames) f.el.remove()
  canvas.innerHTML = ''
  frames = []
  const n = frameCount()
  const set = cat().set
  canvas.append(h('div', { class: 'spacer-l' }))
  for (let i = 0; i < n; i++) {
    const iframe = h('iframe', { src: '/stage/stage.html?embed=1', scrolling: 'no', title: `preview ${i + 1}` })
    const wrap = h('div', { class: 'stage-wrap' }, iframe, h('div', { class: 'loading' }, h('i')))
    const title = set ? (slides()[i]?.title ?? '').replace(/\*/g, '') : ''
    const meta = h(
      'div',
      { class: 'frame-meta' },
      set ? h('b', {}, String(i + 1).padStart(2, '0')) : null,
      h('span', { class: 't' }, set ? title : `${size().label ?? size().key} · ${size().w}×${size().h}`),
      set
        ? h(
            'span',
            { class: 'tools' },
            h('button', { class: 'icon-btn', title: 'Focus', html: ICON.focus, onclick: (e) => (e.stopPropagation(), toggleFocus(i)) }),
            h('button', { class: 'icon-btn', title: 'Move left', html: ICON.left, onclick: (e) => (e.stopPropagation(), moveSlide(i, -1)) }),
            h('button', { class: 'icon-btn', title: 'Move right', html: ICON.right, onclick: (e) => (e.stopPropagation(), moveSlide(i, 1)) }),
            h('button', { class: 'icon-btn', title: 'Replace screenshot', html: ICON.swap, onclick: (e) => (e.stopPropagation(), pickFiles((files) => replaceScreen(i, files[0]))) }),
            h('button', { class: 'icon-btn', title: 'Remove', html: ICON.trash, onclick: (e) => (e.stopPropagation(), removeSlide(i)) }),
          )
        : null,
    )
    const el = h('div', { class: 'frame', 'data-index': i }, wrap, meta)
    const f = { el, wrap, iframe, index: i, ready: false, loadId: 0, scale: 1 }
    iframe.addEventListener('load', () => {})
    el.addEventListener('dblclick', () => set && toggleFocus(i))
    attachRotate(f)
    frames.push(f)
    canvas.append(el)
  }
  if (cat().set) {
    canvas.append(
      h('div', { class: 'add-tile', onclick: () => pickFiles(addFiles) }, h('div', { html: `${ICON.plus}<b>Add screens</b><span class="dim">or drop files anywhere</span>` })),
    )
  }
  canvas.append(h('div', { class: 'spacer-r' }))
  layoutFrames()
  refreshAll()
  renderSlidePicker()
  document.body.classList.toggle('video', isVideo())
  $('#transport').hidden = !isVideo()
}

const frameFor = (win) => frames.find((f) => f.iframe.contentWindow === win)

window.addEventListener('message', (e) => {
  const msg = e.data
  const f = frameFor(e.source)
  if (!msg || !f) return
  switch (msg.type) {
    case 'stage:ready':
      f.ready = true
      refresh(f)
      break
    case 'stage:loaded':
      if (msg.id !== f.loadId) return
      f.el.classList.remove('busy')
      $('.error', f.wrap)?.remove()
      f.info = msg.info
      if (isVideo()) onVideoLoaded(f)
      break
    case 'stage:error':
      if (msg.id !== f.loadId) return
      f.el.classList.remove('busy')
      $('.error', f.wrap)?.remove()
      f.wrap.append(h('div', { class: 'error' }, msg.error))
      break
    case 'stage:edit': {
      const list = ensureOwnSlides()
      if (!list[msg.index]) return
      list[msg.index][msg.field] = msg.value
      save()
      renderSlidesPane()
      // Other frames show this text only in video captions; refresh the rest.
      refreshAll({ except: cat().set ? f : null })
      break
    }
    case 'stage:time':
      if (f === frames[0]) setTime(msg.time)
      break
  }
})

let refreshTimer
function refreshAll({ except = null, delay = 120 } = {}) {
  clearTimeout(refreshTimer)
  refreshTimer = setTimeout(() => frames.forEach((f) => f !== except && refresh(f)), delay)
}

async function refresh(f) {
  if (!f.ready) return
  const id = ++loadSeq
  f.loadId = id
  f.el.classList.add('busy')
  const pr = Math.max(0.5, Math.min(1.5, f.scale * devicePixelRatio))
  const index = cat().set ? f.index : Math.min(state.index, slides().length - 1)
  const spec = await buildSpec(index, pr)
  if (f.loadId !== id) return
  playing = false
  updatePlayButton()
  f.iframe.contentWindow.postMessage({ type: 'stage:load', id, spec }, '*')
}

/* ── drag to rotate a 3D device ────────────────────────────────────────── */

function attachRotate(f) {
  let start = null
  let moved = false
  const t = () => theme()
  f.wrap.addEventListener('pointerdown', (e) => {
    if (t().device.mode !== '3d' || e.button !== 0) return
    if (e.target.closest?.('[contenteditable]')) return
    start = { x: e.clientX, y: e.clientY, lx: e.clientX, ly: e.clientY }
    moved = false
  })
  window.addEventListener('pointermove', (e) => {
    if (!start) return
    const dx = e.clientX - start.lx
    const dy = e.clientY - start.ly
    if (!moved && Math.hypot(e.clientX - start.x, e.clientY - start.y) < 4) return
    moved = true
    f.el.classList.add('dragging-3d')
    start.lx = e.clientX
    start.ly = e.clientY
    const k = 0.012
    f.iframe.contentWindow.postMessage({ type: 'stage:nudge', dx: dx * k, dy: dy * k }, '*')
  })
  window.addEventListener('pointerup', (e) => {
    if (!start) return
    const s = start
    start = null
    f.el.classList.remove('dragging-3d')
    if (!moved) return
    const deg = 0.012 * (180 / Math.PI)
    const pose = [...(t().device.pose ?? [0, 0, 0])]
    pose[0] += (e.clientY - s.y) * deg
    pose[1] += (e.clientX - s.x) * deg
    setOverride('device.pose', pose.map((v) => Math.round(v * 10) / 10))
  })
}

/* ── video transport ───────────────────────────────────────────────────── */

let playing = false
let duration = 0
function onVideoLoaded(f) {
  duration = f.info.duration
  const beats = $('#beats')
  beats.innerHTML = ''
  const list = slides()
  // Mirror the stage timeline roughly for markers.
  const t = theme()
  const intro = t.motion.intro ? 1.8 : 0
  const outro = t.motion.outro ? 2.2 : 0
  const lens = list.map((s) => s.hold ?? (s.screen?.kind === 'video' ? s.screen.duration : null))
  const fixed = lens.reduce((a, b) => a + (b ?? 0), 0)
  const free = lens.filter((x) => x == null).length
  const each = free ? Math.max(1.4, (t.motion.duration / t.motion.speed - intro - outro - t.motion.hold - fixed) / free) : 0
  let at = intro
  lens.forEach((l, i) => {
    beats.append(h('i', { style: { left: `${(at / duration) * 100}%` } }), h('span', { style: { left: `${(at / duration) * 100}%` } }, String(i + 1)))
    at += l ?? each
  })
  setTime(0)
  play()
}
function setTime(t) {
  $('#time').textContent = `${t.toFixed(1)} / ${duration.toFixed(1)}s`
  if (!scrubbing) $('#scrub').value = duration ? Math.round((t / duration) * 1000) : 0
}
function updatePlayButton() {
  $('#play').innerHTML = playing ? ICON.pause : ICON.play
}
function play() {
  const f = frames[0]
  if (!f) return
  playing = true
  updatePlayButton()
  f.iframe.contentWindow.postMessage({ type: 'stage:play', time: (Number($('#scrub').value) / 1000) * duration }, '*')
}
function pause() {
  playing = false
  updatePlayButton()
  frames[0]?.iframe.contentWindow.postMessage({ type: 'stage:pause' }, '*')
}
let scrubbing = false
$('#play').onclick = () => (playing ? pause() : play())
$('#scrub').addEventListener('input', () => {
  scrubbing = true
  pause()
  const t = (Number($('#scrub').value) / 1000) * duration
  $('#time').textContent = `${t.toFixed(1)} / ${duration.toFixed(1)}s`
  frames[0]?.iframe.contentWindow.postMessage({ type: 'stage:seek', time: t, fast: true }, '*')
})
$('#scrub').addEventListener('change', () => (scrubbing = false))

/* ── top bar ───────────────────────────────────────────────────────────── */

function renderCats() {
  const inner = h('div', { class: 'cats-inner' })
  for (const [id, c] of Object.entries(catalog.categories)) {
    inner.append(
      h(
        'button',
        { class: `cat${id === state.category ? ' on' : ''}`, role: 'tab', title: c.blurb, onclick: () => setCategory(id) },
        h('span', { class: 'label' }, c.name.replace(' screenshots', '').replace('Social media ', 'Social ').replace('Mobile screens video', 'Screen video')),
        c.kind === 'video' ? h('span', { class: 'kind' }, 'VIDEO') : c.uses3d && id !== 'app-store' && id !== 'social-card' ? h('span', { class: 'kind' }, '3D') : null,
      ),
    )
  }
  $('#cats').replaceChildren(inner)
}

function renderSizes() {
  const sel = $('#size')
  sel.replaceChildren(
    ...cat().sizes.map((k) => {
      const s = catalog.sizes[k]
      return h('option', { value: k, selected: k === sizeKey() }, `${s.label} · ${s.w}×${s.h}`)
    }),
  )
}
$('#size').onchange = (e) => {
  state.sizeByCat[state.category] = e.target.value
  save()
  buildFrames()
}

function setCategory(id) {
  if (id === state.category) return
  pause()
  state.category = id
  state.focus = null
  state.index = 0
  save()
  renderAll()
}

function renderAll() {
  renderCats()
  renderSizes()
  renderThemes()
  buildFrames()
  renderPanel()
}

/* ── theme dock ────────────────────────────────────────────────────────── */

function renderThemes() {
  const list = Object.values(allThemes())
  $('#theme-label').textContent = `${cat().name}`
  $('#theme-meta').textContent = `${list.length} themes · ${currentThemeRaw().name ?? themeId()}${currentThemeRaw().inspiredBy ? ` — inspired by ${currentThemeRaw().inspiredBy.split(' — ')[0]}` : ''}`
  const box = $('#themes')
  box.replaceChildren(
    ...list.map((raw) => {
      const t = resolveTheme(state.category, raw.id, { custom })
      const p = t.palette
      const rot = t.device.pose?.[2] ?? 0
      const card = h(
        'button',
        {
          class: `tcard${raw.id === themeId() ? ' on' : ''}`,
          title: `${raw.blurb ?? ''}${raw.inspiredBy ? `\nInspired by: ${raw.inspiredBy}` : ''}`,
          style: {
            '--c-bg': p.bg,
            '--c-bg2': t.background.kind === 'solid' ? p.bg : p.bg2,
            '--c-ink': p.ink,
            '--c-accent': p.accent,
            '--c-frame': t.device.mode === 'frameless' ? 'transparent' : t.device.mode === 'flat' ? t.device.frame : (t.device.finish ?? '#d9d9de'),
            '--c-rot': `${rot + (t.device.pose?.[1] ?? 0) * -0.15}deg`,
          },
          onclick: () => setTheme(raw.id),
        },
        h(
          'div',
          { class: 'sw' },
          h('div', { class: 'dots' }, ...[p.accent, p.accent2, p.bg3].map((c) => h('i', { style: { '--c': c } }))),
          h('span', { class: 'aa', style: { fontFamily: fontStack(t.type.display), fontWeight: t.type.weight, fontStyle: t.type.italic ? 'italic' : 'normal', textTransform: t.type.case === 'upper' ? 'uppercase' : 'none' } }, 'A', h('em', {}, 'a')),
          t.device.mode === 'none' ? null : h('div', { class: 'ph' }),
        ),
        h('div', { class: 'tn' }, raw.name ?? raw.id, raw.file ? h('span', { class: 'badge' }, 'CUSTOM') : null),
        h('div', { class: 'ts' }, raw.appCategory ?? catalog.layouts[t.layout]?.label ?? ''),
      )
      return card
    }),
  )
  // Load every display font used by the cards.
  const ids = new Set(list.map((raw) => resolveTheme(state.category, raw.id, { custom }).type.display))
  for (const id of ids) {
    const f = catalog.fonts[id]
    if (!f) continue
    const href = `/fonts/${f.pkg}/${f.css[0]}`
    if (!document.querySelector(`link[href="${href}"]`)) document.head.append(h('link', { rel: 'stylesheet', href }))
  }
  $('.tcard.on', box)?.scrollIntoView({ block: 'nearest', inline: 'center' })
}

function setTheme(id) {
  if (id === themeId()) return
  const had = Object.keys(overrides()).length
  const previous = { theme: themeId(), overrides: overrides() }
  state.themeByCat[state.category] = id
  state.overridesByCat[state.category] = {}
  save()
  renderThemes()
  buildFrames()
  renderPanel()
  if (had) {
    toast({
      title: 'Theme switched — your tweaks were cleared',
      actions: [
        {
          label: 'Keep them',
          run: () => {
            state.overridesByCat[state.category] = previous.overrides
            save()
            buildFrames()
            renderPanel()
          },
        },
      ],
      timeout: 5000,
    })
  }
}
$('#shuffle').onclick = () => {
  const ids = Object.keys(allThemes()).filter((x) => x !== themeId())
  setTheme(ids[Math.floor(Math.random() * ids.length)])
}

/* ── overrides ─────────────────────────────────────────────────────────── */

function setOverride(path, value) {
  state.overridesByCat[state.category] = setPath(overrides(), path, value)
  save()
  refreshAll()
  syncField(path)
}
function clearOverride(path) {
  const o = merge(overrides())
  const keys = path.split('.')
  let node = o
  for (const k of keys.slice(0, -1)) {
    if (!isObj(node[k])) return
    node = node[k]
  }
  delete node[keys.at(-1)]
  // prune empty objects
  const prune = (x) => {
    for (const [k, v] of Object.entries(x)) {
      if (isObj(v)) {
        prune(v)
        if (!Object.keys(v).length) delete x[k]
      }
    }
  }
  prune(o)
  state.overridesByCat[state.category] = o
  save()
  refreshAll()
  renderPanel()
}

/* ── slides ────────────────────────────────────────────────────────────── */

function ensureOwnSlides() {
  if (usingSamples()) state.slides = structuredClone(slides())
  return state.slides
}

function pickFiles(cb) {
  const input = $('#file')
  input.value = ''
  input.onchange = () => input.files.length && cb([...input.files])
  input.click()
}

async function upload(file) {
  const r = await fetch(`/api/upload?name=${encodeURIComponent(file.name)}`, { method: 'POST', body: file })
  const body = await r.json()
  if (!r.ok) throw new Error(body.error)
  return body
}

async function addFiles(files) {
  const t = toast({ title: `Uploading ${files.length} file${files.length > 1 ? 's' : ''}…`, progress: 0 })
  try {
    // Replacing the samples: the first real upload starts a fresh list.
    const list = usingSamples() ? (state.slides = []) : state.slides
    let n = 0
    for (const file of files) {
      const screen = await upload(file)
      list.push({ screen, title: suggestTitle(file.name), subtitle: '' })
      t.progress(++n / files.length)
    }
    state.focus = null
    save()
    t.close()
    buildFrames()
    renderPanel()
  } catch (err) {
    t.close()
    toast({ title: 'Upload failed', sub: String(err.message ?? err), error: true })
  }
}

async function replaceScreen(i, file, key = 'screen') {
  const list = ensureOwnSlides()
  try {
    list[i][key] = await upload(file)
    save()
    buildFrames()
    renderPanel()
  } catch (err) {
    toast({ title: 'Upload failed', sub: String(err.message ?? err), error: true })
  }
}

function suggestTitle(name) {
  const base = name.replace(/\.[a-z0-9]+$/i, '').replace(/[-_]+/g, ' ').replace(/\b(screenshot|simulator|screen shot|iphone|img)\b/gi, '').replace(/\d{2,}/g, '').trim()
  return base ? base[0].toUpperCase() + base.slice(1) : 'Your *headline* here'
}

function moveSlide(i, d) {
  const list = ensureOwnSlides()
  const j = i + d
  if (j < 0 || j >= list.length) return
  ;[list[i], list[j]] = [list[j], list[i]]
  if (state.focus === i) state.focus = j
  save()
  buildFrames()
  renderPanel()
}
function removeSlide(i) {
  const list = ensureOwnSlides()
  const [gone] = list.splice(i, 1)
  if (state.focus != null) state.focus = null
  save()
  buildFrames()
  renderPanel()
  toast({
    title: 'Slide removed',
    timeout: 4000,
    actions: [{ label: 'Undo', run: () => (list.splice(i, 0, gone), save(), buildFrames(), renderPanel()) }],
  })
}
function toggleFocus(i) {
  state.focus = state.focus === i ? null : i
  layoutFrames()
  refreshAll({ delay: 0 })
  if (state.focus != null) frames[i]?.el.scrollIntoView({ inline: 'center' })
}

function renderSlidePicker() {
  $('.slide-pick')?.remove()
  document.body.classList.remove('has-picker')
  if (cat().set || isVideo() || slides().length < 2) return
  document.body.classList.add('has-picker')
  const bar = h('div', { class: 'slide-pick' }, h('span', { class: 'dim', style: { padding: '4px 6px' } }, 'Content from'))
  slides().forEach((s, i) => bar.append(h('button', { class: `chip${i === state.index ? ' on' : ''}`, onclick: () => ((state.index = i), renderSlidePicker(), refreshAll({ delay: 0 })) }, `Slide ${i + 1}`)))
  $('#viewport').append(bar)
}

/* ── drag and drop ─────────────────────────────────────────────────────── */

let dragDepth = 0
window.addEventListener('dragenter', (e) => {
  if (![...e.dataTransfer.types].includes('Files')) return
  dragDepth++
  $('#drop').hidden = false
})
window.addEventListener('dragleave', () => {
  if (--dragDepth <= 0) $('#drop').hidden = true
})
window.addEventListener('dragover', (e) => e.preventDefault())
window.addEventListener('drop', (e) => {
  e.preventDefault()
  dragDepth = 0
  $('#drop').hidden = true
  const files = [...e.dataTransfer.files].filter((f) => /^(image|video)\//.test(f.type) || /\.(png|jpe?g|webp|mp4|mov|webm)$/i.test(f.name))
  if (!files.length) return
  // Dropped on a frame of a set: replace that slide's screen.
  const frameEl = e.target.closest?.('.frame')
  if (frameEl && cat().set && files.length === 1 && !usingSamples()) replaceScreen(Number(frameEl.dataset.index), files[0])
  else addFiles(files)
})

/* ── panel ─────────────────────────────────────────────────────────────── */

function setPanel(open) {
  state.panel = open
  document.body.classList.toggle('panel-open', open)
  $('#btn-panel').classList.toggle('on', open)
  save()
  setTimeout(() => (layoutFrames(), refreshAll({ delay: 0 })), 260)
}
$('#btn-panel').onclick = () => setPanel(!state.panel)
$('#panel-close').onclick = () => setPanel(false)
$$('.panel-tabs [data-tab]').forEach((b) =>
  b.addEventListener('click', () => {
    state.tab = b.dataset.tab
    renderPanel()
  }),
)

function renderPanel() {
  $$('.panel-tabs [data-tab]').forEach((b) => b.classList.toggle('on', b.dataset.tab === state.tab))
  $$('.panel-body').forEach((p) => (p.hidden = p.dataset.pane !== state.tab))
  if (state.tab === 'slides') renderSlidesPane()
  if (state.tab === 'style') renderStylePane()
  if (state.tab === 'output') renderOutputPane()
}

function input(value, onchange, attrs = {}) {
  const el = h('input', { class: 'in', value: value ?? '', ...attrs })
  el.addEventListener('change', () => onchange(el.value))
  return el
}
function textarea(value, onchange, attrs = {}) {
  const el = h('textarea', { class: 'in', rows: 2, ...attrs })
  el.value = value ?? ''
  el.addEventListener('change', () => onchange(el.value))
  return el
}

function renderSlidesPane() {
  const pane = $('#pane-slides')
  const list = slides()
  const video = isVideo()
  pane.replaceChildren(
    h('div', { class: 'section-title' }, `Slides (${list.length})`, h('span', { class: 'spacer' }), h('button', { class: 'btn small ghost', onclick: () => pickFiles(addFiles) }, h('span', { html: ICON.plus }), 'Add')),
    usingSamples() ? h('p', { class: 'note' }, 'Showing the bundled sample app. Drop your own screenshots or recordings to replace it — edits here copy the samples into your project.') : null,
    ...list.map((s, i) => {
      const upd = (k) => (v) => {
        ensureOwnSlides()[i][k] = v === '' ? undefined : v
        save()
        refreshAll()
      }
      const thumb = s.screen?.kind === 'video' ? `${s.screen.frames.base}00001.jpg` : s.screen?.url
      return h(
        'div',
        { class: `slide${(cat().set ? state.focus : state.index) === i ? ' on' : ''}` },
        h(
          'div',
          { class: 'thumb', style: { backgroundImage: thumb ? `url("${thumb}")` : 'none' }, title: 'Replace', onclick: () => pickFiles((f) => replaceScreen(i, f[0])) },
          s.screen?.kind === 'video' ? h('span', { class: 'kind' }, `${s.screen.duration.toFixed(1)}s`) : null,
        ),
        h(
          'div',
          { class: 'fields' },
          h(
            'div',
            { class: 'head' },
            h('b', {}, `Slide ${i + 1}`),
            h('button', { class: 'icon-btn', title: 'Move up', html: ICON.left, style: { transform: 'rotate(90deg)' }, onclick: () => moveSlide(i, -1) }),
            h('button', { class: 'icon-btn', title: 'Move down', html: ICON.right, style: { transform: 'rotate(90deg)' }, onclick: () => moveSlide(i, 1) }),
            h('button', { class: 'icon-btn', title: 'Remove', html: ICON.trash, onclick: () => removeSlide(i) }),
          ),
          input(s.kicker, upd('kicker'), { placeholder: 'Kicker' }),
          textarea(s.title, upd('title'), { placeholder: 'Headline — *highlight* words, " | " breaks' }),
          textarea(s.subtitle, upd('subtitle'), { placeholder: 'Subtitle' }),
          h(
            'details',
            {},
            h('summary', {}, 'More: desktop screen, timing, focus, decor, per-slide style'),
            h('div', { class: 'row', style: { marginTop: '6px' } }, h('button', { class: 'btn small ghost', onclick: () => pickFiles((f) => replaceScreen(i, f[0], 'desktop')) }, s.desktop ? 'Replace desktop screen' : 'Add desktop screen (laptop)')),
            video ? h('div', { class: 'field' }, h('label', {}, 'Hold (s)'), input(s.hold, (v) => upd('hold')(v === '' ? '' : Number(v)), { type: 'number', step: 0.1, placeholder: 'auto' }), h('span')) : null,
            h('div', { class: 'field' }, h('label', { title: 'x, y, zoom — zoom-tour target' }, 'Focus x,y,zoom'), input(s.focus?.join(','), (v) => upd('focus')(v ? v.split(',').map(Number) : '')), h('span')),
            h('p', { class: 'note' }, 'Decor (JSON list) — badge, rating, laurels, chips, notification, stat, callout, arrow, logo, store-badge, sparkles, confetti, blob, orbs, rings, shapes'),
            textarea(s.decor ? JSON.stringify(s.decor, null, 1) : '', (v) => {
              try {
                upd('decor')(v.trim() ? JSON.parse(v) : '')
              } catch (err) {
                toast({ title: 'Decor is not valid JSON', sub: err.message, error: true })
              }
            }, { class: 'in code', placeholder: '[{"kind":"badge","text":"4.9 ★","x":0.5,"y":0.93}]' }),
            h('p', { class: 'note' }, 'Per-slide theme overrides (JSON), e.g. {"device":{"pose":[0,20,-6]}}'),
            textarea(s.theme ? JSON.stringify(s.theme) : '', (v) => {
              try {
                upd('theme')(v.trim() ? JSON.parse(v) : '')
              } catch (err) {
                toast({ title: 'Not valid JSON', sub: err.message, error: true })
              }
            }, { class: 'in code' }),
          ),
        ),
      )
    }),
    h('div', { class: 'section-title' }, 'Brand'),
    h('p', { class: 'note' }, 'Used by intro/outro cards, logo and store badges.'),
    ...['name', 'tagline', 'cta', 'url'].map((k) =>
      h('div', { class: 'field' }, h('label', {}, k[0].toUpperCase() + k.slice(1)), input(brand()[k], (v) => ((state.brand = { ...brand(), [k]: v || undefined }), save(), refreshAll())), h('span')),
    ),
  )
}

/* style pane, generated from the schema */

const fieldRefs = new Map()
function renderStylePane() {
  const pane = $('#pane-style')
  const t = theme()
  const o = overrides()
  fieldRefs.clear()
  const kind = cat().kind
  const layouts = Object.entries(catalog.layouts).filter(([, l]) => l.kind === kind)
  const top = h(
    'div',
    {},
    h(
      'div',
      { class: 'section-title' },
      currentThemeRaw().name ?? themeId(),
      h('span', { class: 'spacer' }),
      h('button', { class: 'btn small ghost', onclick: () => ((state.overridesByCat[state.category] = {}), save(), refreshAll(), renderPanel()) }, h('span', { html: ICON.reset }), 'Reset'),
      h('button', { class: 'btn small ghost', onclick: saveTheme }, 'Save as theme'),
    ),
    currentThemeRaw().inspiredBy ? h('p', { class: 'note' }, `Inspired by ${currentThemeRaw().inspiredBy}`) : null,
    h(
      'div',
      { class: 'field' + (o.layout ? ' changed' : '') },
      h('label', {}, 'Layout'),
      h(
        'select',
        {
          class: 'in',
          onchange: (e) => {
            const id = e.target.value
            state.overridesByCat[state.category] = merge(overrides(), catalog.layouts[id].defaults ?? {}, { layout: id })
            save()
            refreshAll()
            renderPanel()
          },
        },
        ...layouts.map(([id, l]) => h('option', { value: id, selected: id === t.layout }, `${id} — ${l.label}`)),
      ),
      h('button', { class: 'icon-btn reset', html: ICON.reset, title: 'Reset', onclick: () => clearOverride('layout') }),
    ),
  )
  const groups = new Map()
  for (const f of catalog.schema) {
    if (f.path === 'layout') continue
    if (f.group === 'Motion' && kind !== 'video') continue
    if (!groups.has(f.group)) groups.set(f.group, [])
    groups.get(f.group).push(f)
  }
  const openGroups = new Set(JSON.parse(sessionStorage.getItem('open-groups') ?? '["Colors","Type","Device"]'))
  const sections = [...groups].map(([name, fields]) => {
    const count = fields.filter((f) => getPath(o, f.path) !== undefined).length
    const det = h('details', { class: 'group', open: openGroups.has(name) }, h('summary', {}, name, count ? h('span', { class: 'count' }, `${count} changed`) : null), ...fields.map((f) => fieldControl(f, t, o)))
    det.addEventListener('toggle', () => {
      det.open ? openGroups.add(name) : openGroups.delete(name)
      sessionStorage.setItem('open-groups', JSON.stringify([...openGroups]))
    })
    return det
  })
  const raw = h('details', { class: 'group' }, h('summary', {}, 'Raw overrides (JSON)'), h('p', { class: 'note' }, 'Everything above lands here. Any theme key works — scene.rims, background.shapes, bento, wall…'))
  raw.append(
    textarea(JSON.stringify(o, null, 2), (v) => {
      try {
        state.overridesByCat[state.category] = v.trim() ? JSON.parse(v) : {}
        save()
        refreshAll()
        renderPanel()
      } catch (err) {
        toast({ title: 'Not valid JSON', sub: err.message, error: true })
      }
    }, { class: 'in code', rows: 10 }),
  )
  pane.replaceChildren(top, ...sections, raw)
}

function fieldControl(f, t, o) {
  const value = getPath(t, f.path)
  const changed = getPath(o, f.path) !== undefined
  let ctl
  const set = (v) => setOverride(f.path, v)
  switch (f.type) {
    case 'color': {
      const text = input(value ?? '', (v) => set(v === '' && f.nullable ? null : v), { placeholder: f.nullable ? 'none' : '' })
      const hex = /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000'
      const pick = h('input', { type: 'color', class: 'swatch', value: hex })
      pick.addEventListener('input', () => {
        text.value = pick.value
        set(pick.value)
      })
      ctl = h('div', { class: 'ctl' }, pick, text)
      break
    }
    case 'range': {
      const r = h('input', { type: 'range', min: f.min, max: f.max, step: f.step, value: value ?? f.min })
      const n = h('input', { class: 'in num', type: 'number', min: f.min, max: f.max, step: f.step, value: value ?? '' })
      r.addEventListener('input', () => {
        n.value = r.value
        set(Number(r.value))
      })
      n.addEventListener('change', () => {
        r.value = n.value
        set(Number(n.value))
      })
      ctl = h('div', { class: 'ctl' }, r, n)
      break
    }
    case 'select':
    case 'font':
      ctl = h(
        'select',
        { class: 'in', onchange: (e) => set(typeof f.options[0] === 'number' ? Number(e.target.value) : e.target.value) },
        ...f.options.map((x) => h('option', { value: x, selected: String(x) === String(value) }, f.type === 'font' ? `${x} — ${catalog.fonts[x].kind}` : String(x))),
      )
      break
    case 'bool': {
      const cb = h('input', { type: 'checkbox', checked: !!value })
      cb.addEventListener('change', () => set(cb.checked))
      ctl = h('label', { class: 'toggle' }, cb, h('span'))
      break
    }
    case 'pose': {
      const p = value ?? [0, 0, 0]
      ctl = h(
        'div',
        { class: 'pose' },
        ...[0, 1, 2].map((k) => {
          const n = h('input', { class: 'in', type: 'number', step: 1, value: p[k] ?? 0, title: ['tilt x', 'turn y', 'roll z'][k] })
          n.addEventListener('change', () => {
            const next = [...(getPath(theme(), f.path) ?? [0, 0, 0])]
            next[k] = Number(n.value)
            set(next)
          })
          return n
        }),
      )
      break
    }
    case 'list':
      ctl = textarea(JSON.stringify(value ?? []), (v) => {
        try {
          set(JSON.parse(v || '[]'))
        } catch (err) {
          toast({ title: 'Not valid JSON', sub: err.message, error: true })
        }
      }, { class: 'in code', rows: 3 })
      break
    default:
      ctl = input(value ?? '', (v) => set(v === '' ? null : v))
  }
  const row = h('div', { class: `field${changed ? ' changed' : ''}` }, h('label', { title: f.path }, f.label), ctl, h('button', { class: 'icon-btn reset', title: 'Reset to theme', html: ICON.reset, onclick: () => clearOverride(f.path) }))
  fieldRefs.set(f.path, row)
  return row
}

function syncField(path) {
  const row = fieldRefs.get(path)
  if (row) row.classList.toggle('changed', getPath(overrides(), path) !== undefined)
}

async function saveTheme() {
  const name = prompt('Name for this theme (saved to .app-preview-craft/themes/):', `${themeId()}-custom`)
  if (!name) return
  const theme = { extends: `${state.category}/${themeId()}`, category: state.category, name, ...overrides() }
  const r = await fetch('/api/theme', { method: 'POST', body: JSON.stringify({ id: name, theme }) }).then((x) => x.json())
  if (r.error) return toast({ title: 'Could not save theme', sub: r.error, error: true })
  custom[r.id] = { ...theme, id: r.id, file: r.file }
  state.themeByCat[state.category] = r.id
  state.overridesByCat[state.category] = {}
  save()
  renderThemes()
  renderPanel()
  toast({ title: `Saved theme "${r.id}"`, sub: r.file, timeout: 5000 })
}

/* output pane */

function jobFor(opts = {}) {
  const list = slides().map((s) => ({
    screen: s.screen?.path,
    desktop: s.desktop?.path,
    title: s.title,
    subtitle: s.subtitle,
    kicker: s.kicker,
    decor: s.decor,
    theme: s.theme,
    focus: s.focus,
    hold: s.hold,
  }))
  const ex = { ...state.export, ...opts }
  return {
    category: state.category,
    theme: themeId(),
    themeOverrides: overrides(),
    size: (ex.sizes?.[state.category]?.length ? ex.sizes[state.category] : [sizeKey()]).join(','),
    format: ex.format?.[state.category],
    transparent: ex.transparent || undefined,
    all: ex.all || undefined,
    index: cat().set ? undefined : state.index,
    slides: list,
    brand: state.brand ?? (usingSamples() ? boot.samples.brand : undefined),
    out: ex.out || undefined,
  }
}

const shellQuote = (s) => (/^[\w./,:=@%+-]+$/.test(String(s)) ? String(s) : `'${String(s).replace(/'/g, `'\\''`)}'`)
function flatten(obj, prefix = '', out = []) {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const p = prefix ? `${prefix}.${k}` : k
    if (isObj(v)) flatten(v, p, out)
    else out.push([p, Array.isArray(v) || isObj(v) ? JSON.stringify(v) : String(v)])
  }
  return out
}
function cliCommand() {
  const j = jobFor()
  const parts = ['node', '"$SKILL/scripts/cli.mjs"', j.category]
  if (!usingSamples()) parts.push(...j.slides.map((s) => shellQuote(s.screen)))
  parts.push('--theme', j.theme, '--size', j.size)
  if (!usingSamples()) for (const s of j.slides) parts.push('--title', shellQuote(s.title ?? ''))
  if (j.format) parts.push('--format', j.format)
  if (j.transparent) parts.push('--transparent')
  for (const [p, v] of flatten(j.themeOverrides)) parts.push('--set', shellQuote(`${p}=${v}`))
  return parts.join(' ')
}

function renderOutputPane() {
  const pane = $('#pane-output')
  pane.replaceChildren(
    h('div', { class: 'section-title' }, 'Where files go'),
    h('p', { class: 'note' }, 'Exports land in ', h('code', {}, boot.outDir), ' unless you set a folder below (relative to the project).'),
    h('div', { class: 'field' }, h('label', {}, 'Output folder'), input(state.export.out ?? '', (v) => ((state.export.out = v), save()), { placeholder: '.' }), h('span')),
    h('div', { class: 'section-title' }, 'Same render from the terminal'),
    h('p', { class: 'note' }, 'The agent skill runs exactly this. $SKILL is the skill folder.'),
    h('code', { class: 'cmd' }, cliCommand()),
    h('div', { class: 'row', style: { marginTop: '8px' } }, h('button', { class: 'btn small ghost', onclick: () => navigator.clipboard.writeText(cliCommand()).then(() => toast({ title: 'Command copied', timeout: 2000 })) }, 'Copy command'), h('button', { class: 'btn small ghost', onclick: saveConfig }, 'Save app-preview-craft.json')),
    h('div', { class: 'section-title' }, '3D model credits'),
    h('p', { class: 'note' }, 'The device models are CC-BY-4.0. Exports that show one write CREDITS.txt beside the files; keep the credit when you publish.'),
    ...Object.values(catalog.devices).map((d) => h('p', { class: 'note' }, h('b', {}, d.name), ` — ${d.credit.author} · `, h('a', { href: d.credit.source, target: '_blank', style: { color: '#b9afff' } }, 'source'))),
  )
}

async function saveConfig() {
  const j = jobFor()
  const config = {
    category: j.category,
    theme: j.theme,
    themeOverrides: j.themeOverrides,
    size: j.size,
    brand: j.brand,
    out: j.out,
    slides: j.slides,
  }
  const r = await fetch('/api/config', { method: 'POST', body: JSON.stringify({ config }) }).then((x) => x.json())
  if (r.error) return toast({ title: 'Could not save config', sub: r.error, error: true })
  toast({ title: 'Saved project config', sub: `${r.file} — render it with: cli.mjs --config ${r.file}`, timeout: 6000 })
}

/* ── export ────────────────────────────────────────────────────────────── */

const pop = $('#export-pop')
function renderExport() {
  const c = cat()
  const ex = state.export
  ex.sizes ??= {}
  ex.format ??= {}
  const chosen = new Set(ex.sizes[state.category]?.length ? ex.sizes[state.category] : [sizeKey()])
  const formats = c.kind === 'video' ? ['mp4', 'hevc', 'mov', 'webm', 'gif'] : ['png', 'jpg', 'webp', 'avif']
  const fmt = ex.format[state.category] ?? formats[0]
  pop.replaceChildren(
    h('h3', {}, `Export ${c.name.toLowerCase()}`),
    h('div', { class: 'note' }, c.set ? `${slides().length} slides × each size` : c.kind === 'video' ? 'Rendered frame by frame, encoded by ffmpeg' : 'One image per size'),
    h(
      'div',
      { class: 'sizes' },
      ...c.sizes.map((k) => {
        const s = catalog.sizes[k]
        const cb = h('input', { type: 'checkbox', checked: chosen.has(k) })
        cb.addEventListener('change', () => {
          cb.checked ? chosen.add(k) : chosen.delete(k)
          ex.sizes[state.category] = [...chosen]
          save()
        })
        return h('label', {}, cb, h('span', {}, s.label), h('small', {}, `${s.w}×${s.h}`))
      }),
    ),
    h(
      'div',
      { class: 'field' },
      h('label', {}, 'Format'),
      h('select', { class: 'in', onchange: (e) => ((ex.format[state.category] = e.target.value), save()) }, ...formats.map((x) => h('option', { value: x, selected: x === fmt }, { mov: 'mov (ProRes 4444, alpha)', webm: 'webm (VP9, alpha)', hevc: 'mp4 (HEVC)', mp4: 'mp4 (H.264)' }[x] ?? x))),
      h('span'),
    ),
    c.kind !== 'video' || true
      ? h(
          'div',
          { class: 'field' },
          h('label', {}, 'Transparent'),
          (() => {
            const cb = h('input', { type: 'checkbox', checked: !!ex.transparent })
            cb.addEventListener('change', () => ((ex.transparent = cb.checked), save()))
            return h('label', { class: 'toggle' }, cb, h('span'))
          })(),
          h('span'),
        )
      : null,
    !c.set && c.kind === 'still'
      ? h(
          'div',
          { class: 'field' },
          h('label', {}, 'Every slide'),
          (() => {
            const cb = h('input', { type: 'checkbox', checked: !!ex.all })
            cb.addEventListener('change', () => ((ex.all = cb.checked), save()))
            return h('label', { class: 'toggle' }, cb, h('span'))
          })(),
          h('span'),
        )
      : null,
    h('div', { class: 'note' }, 'Saving to ', h('code', {}, ex.out || boot.outDir)),
    h('div', { class: 'row', style: { justifyContent: 'flex-end', marginTop: '10px' } }, h('button', { class: 'btn ghost small', onclick: () => (pop.hidden = true) }, 'Cancel'), h('button', { class: 'btn primary', onclick: startExport }, 'Render')),
  )
}
$('#btn-export').onclick = () => {
  pop.hidden = !pop.hidden
  if (!pop.hidden) renderExport()
}
document.addEventListener('pointerdown', (e) => {
  if (!pop.hidden && !pop.contains(e.target) && !e.target.closest('#btn-export')) pop.hidden = true
})

async function startExport() {
  pop.hidden = true
  const job = jobFor()
  const t = toast({ title: `Rendering ${cat().name.toLowerCase()}`, sub: 'starting…', progress: 0, actions: [{ label: 'Cancel', keep: true, run: () => fetch(`/api/render/${id}/cancel`) }] })
  const { id, error } = await fetch('/api/render', { method: 'POST', body: JSON.stringify({ job, custom }) }).then((r) => r.json())
  if (error) {
    t.close()
    return toast({ title: 'Render failed to start', sub: error, error: true })
  }
  const poll = async () => {
    const s = await fetch(`/api/render/${id}`).then((r) => r.json())
    t.progress(s.fraction)
    t.sub(s.label)
    if (!s.done) return setTimeout(poll, 400)
    t.close()
    if (s.error) return toast({ title: 'Render failed', sub: s.error, error: true })
    toast({
      title: `Done — ${s.files.length} file${s.files.length === 1 ? '' : 's'}`,
      sub: `${((Date.now() - s.started) / 1000).toFixed(1)}s`,
      files: s.files,
    })
  }
  poll()
}

/* ── toasts ────────────────────────────────────────────────────────────── */

function toast({ title, sub, progress, error, files, actions = [], timeout }) {
  const subEl = h('div', { class: 'sub' }, sub ?? '')
  const bar = progress != null ? h('div', { class: 'bar' }, h('i')) : null
  const el = h(
    'div',
    { class: `toast${error ? ' err' : ''}` },
    h('div', { class: 'tt' }, title, h('span', { class: 'spacer' }), ...actions.map((a) => h('button', { class: 'chip', onclick: () => (a.run(), !a.keep && close()) }, a.label)), h('button', { class: 'icon-btn', style: { width: '22px', height: '22px' }, html: '<svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>', onclick: () => close() })),
    sub != null ? subEl : null,
    bar,
    files?.length
      ? h(
          'div',
          { class: 'files' },
          ...files.map((f) => h('button', { title: 'Reveal in Finder', onclick: () => fetch('/api/reveal', { method: 'POST', body: JSON.stringify({ path: f.path }) }) }, f.rel || f.path)),
        )
      : null,
  )
  $('#toasts').append(el)
  const close = () => el.remove()
  if (timeout || (!progress && !files && !error)) setTimeout(close, timeout ?? 3500)
  return {
    close,
    progress: (p) => bar && ($('i', bar).style.width = `${Math.round(p * 100)}%`),
    sub: (s) => ((subEl.textContent = s ?? ''), !subEl.isConnected && el.insertBefore(subEl, bar)),
  }
}

/* ── keyboard ──────────────────────────────────────────────────────────── */

window.addEventListener('keydown', (e) => {
  if (e.target.closest('input, textarea, select, [contenteditable]')) return
  const ids = Object.keys(allThemes())
  const i = ids.indexOf(themeId())
  if (e.key === 'ArrowRight' && !e.metaKey) setTheme(ids[(i + 1) % ids.length])
  else if (e.key === 'ArrowLeft' && !e.metaKey) setTheme(ids[(i - 1 + ids.length) % ids.length])
  else if (e.key === ' ' && isVideo()) (e.preventDefault(), playing ? pause() : play())
  else if (e.key.toLowerCase() === 'c') setPanel(!state.panel)
  else if (e.key.toLowerCase() === 'e') $('#btn-export').click()
  else if (e.key.toLowerCase() === 'r') $('#shuffle').click()
  else if (e.key === 'Escape') {
    pop.hidden = true
    if (state.focus != null) toggleFocus(state.focus)
  } else if (/^[1-5]$/.test(e.key)) setCategory(Object.keys(catalog.categories)[Number(e.key) - 1])
})

let resizeTimer
window.addEventListener('resize', () => {
  layoutFrames()
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(() => refreshAll({ delay: 0 }), 300)
})

document.body.classList.toggle('panel-open', state.panel)
$('#btn-panel').classList.toggle('on', state.panel)
renderAll()
if (boot.project?.missing?.length) {
  toast({ title: `${boot.project.missing.length} file(s) from the project config are missing`, sub: boot.project.missing.join(' · '), error: true })
}
