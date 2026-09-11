// Deterministic time helpers. Every animation is a pure function of t, so a
// frame rendered headless at t=3.2s is identical to the studio's preview.

export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, p) => a + (b - a) * p
export const invLerp = (a, b, v) => clamp((v - a) / (b - a))
export const deg = (d) => (d * Math.PI) / 180

export const ease = {
  linear: (x) => x,
  inQuad: (x) => x * x,
  outQuad: (x) => 1 - (1 - x) * (1 - x),
  inOutQuad: (x) => (x < 0.5 ? 2 * x * x : 1 - (-2 * x + 2) ** 2 / 2),
  outCubic: (x) => 1 - (1 - x) ** 3,
  inOutCubic: (x) => (x < 0.5 ? 4 * x * x * x : 1 - (-2 * x + 2) ** 3 / 2),
  outQuart: (x) => 1 - (1 - x) ** 4,
  inOutQuart: (x) => (x < 0.5 ? 8 * x ** 4 : 1 - (-2 * x + 2) ** 4 / 2),
  outExpo: (x) => (x === 1 ? 1 : 1 - 2 ** (-10 * x)),
  inOutExpo: (x) => (x === 0 ? 0 : x === 1 ? 1 : x < 0.5 ? 2 ** (20 * x - 10) / 2 : (2 - 2 ** (-20 * x + 10)) / 2),
  inOutSine: (x) => -(Math.cos(Math.PI * x) - 1) / 2,
  outBack: (x) => 1 + 2.70158 * (x - 1) ** 3 + 1.70158 * (x - 1) ** 2,
  outElastic: (x) =>
    x === 0 || x === 1 ? x : 2 ** (-10 * x) * Math.sin((x * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1,
}

/** Progress of t through [start, start+dur], eased. */
export const span = (t, start, dur, fn = ease.inOutCubic) => fn(clamp((t - start) / dur))

/**
 * Keyframe track. frames = [[time, {a: 1, b: 2}, easeFn?], ...]; the ease on a
 * frame shapes the segment that ends at it. Values missing from a frame hold.
 */
export function track(frames) {
  const keys = [...new Set(frames.flatMap(([, v]) => Object.keys(v)))]
  const filled = []
  let last = {}
  for (const [time, v, fn] of frames) {
    last = { ...last, ...v }
    filled.push([time, last, fn ?? ease.inOutCubic])
  }
  return (t) => {
    if (t <= filled[0][0]) return { ...filled[0][1] }
    for (let i = 1; i < filled.length; i++) {
      const [t1, v1, fn] = filled[i]
      if (t <= t1) {
        const [t0, v0] = filled[i - 1]
        const p = fn(clamp((t - t0) / (t1 - t0 || 1)))
        const out = {}
        for (const k of keys) out[k] = lerp(v0[k] ?? v1[k] ?? 0, v1[k] ?? v0[k] ?? 0, p)
        return out
      }
    }
    return { ...filled.at(-1)[1] }
  }
}

/** Smooth pseudo-random in [-1, 1], stable for a given seed. */
export function wobble(t, seed = 0, speed = 1) {
  const s = seed * 12.9898
  return (
    Math.sin(t * speed * 1.0 + s) * 0.5 +
    Math.sin(t * speed * 2.3 + s * 1.7) * 0.3 +
    Math.sin(t * speed * 4.1 + s * 2.9) * 0.2
  )
}

/** Seeded PRNG (mulberry32) so decor scatter is stable across renders. */
export function rng(seed = 1) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Split [0, duration] into `n` beats for slides. Returns {i, p, local} for t:
 * the active slide, the transition progress into it (0..1 during the first
 * `trans` seconds), and seconds since the beat began.
 */
export function beats(t, n, duration, trans = 0.6) {
  const len = duration / Math.max(1, n)
  const i = Math.min(n - 1, Math.floor(t / len))
  const local = t - i * len
  const p = i === 0 ? 1 : clamp(local / trans)
  return { i, p, local, len }
}
