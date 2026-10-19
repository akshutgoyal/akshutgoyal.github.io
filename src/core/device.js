/**
 * device.js — capability + preference detection.
 * One place that decides how heavy we're allowed to go.
 */

const mq = (q) => (typeof matchMedia === 'function' ? matchMedia(q) : { matches: false })

export function hasWebGL() {
  try {
    const canvas = document.createElement('canvas')
    const gl =
      canvas.getContext('webgl2') ||
      canvas.getContext('webgl') ||
      canvas.getContext('experimental-webgl')
    if (!gl) return false
    // Release the probe context immediately — browsers cap live contexts.
    const lose = gl.getExtension('WEBGL_lose_context')
    if (lose) lose.loseContext()
    return true
  } catch {
    return false
  }
}

/**
 * Quality tiers.
 *   high  — desktop, real GPU, bloom on, full particle count
 *   low   — phones / small screens / weak CPUs: fewer points, no bloom, dpr 1.5
 */
export function detectTier() {
  const params = new URLSearchParams(location.search)
  const forced = params.get('tier') // ?tier=low / ?tier=high — handy for QA
  const coarse = mq('(pointer: coarse)').matches
  const small = Math.min(window.innerWidth, window.innerHeight) < 720
  const cores = navigator.hardwareConcurrency || 4
  const memory = navigator.deviceMemory || 8
  const saveData = navigator.connection?.saveData === true

  let low = coarse || small || cores <= 4 || memory <= 4 || saveData
  if (forced === 'low') low = true
  if (forced === 'high') low = false
  // Opting out of motion is a separate, explicit preference.
  const reduced =
    params.get('motion') === 'off' || mq('(prefers-reduced-motion: reduce)').matches

  return {
    low,
    reduced,
    dprCap: low ? 1.5 : 2,
    bloom: !low,
    particles: low ? 1700 : 5600,
    shapes: low ? 26 : 64,
  }
}

/** Small, allocation-free clamp/lerp helpers used across modules. */
export const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v))
export const lerp = (a, b, t) => a + (b - a) * t
/** Frame-rate independent damping (Freya Holmér's exponential form). */
export const damp = (current, target, lambda, dt) =>
  lerp(current, target, 1 - Math.exp(-lambda * Math.max(dt, 0)))

/**
 * Camera framing is authored against this aspect (see the `data-camera`
 * notes in index.html). The composition is horizontal — copy on one
 * side, a 3D panel on the other — so the rig fits the *width* and lets
 * the height fall where it may. On a landscape window that keeps every
 * panel exactly the same pixel size and simply reveals more floor and
 * ceiling on taller screens.
 */
export const REF_ASPECT = 1.6
export const STACKED_LAYOUT_QUERY = '(orientation: portrait), (max-width: 900px)'

/**
 * The viewport's shape, and how much the authored fov has to grow to keep
 * the horizontal composition intact. Portrait is a different composition
 * entirely, so stations may carry their own portrait pose.
 */
export function viewShape() {
  const aspect = Math.max(0.05, window.innerWidth / Math.max(1, window.innerHeight))
  // This has to agree with the CSS breakpoint that stacks the copy
  // (`(orientation: portrait), (max-width: 900px)` in main.css): a narrow
  // landscape window lays the DOM out like a phone, so it must be framed
  // like one too.
  const portrait = mq(STACKED_LAYOUT_QUERY).matches
  return {
    aspect,
    portrait,
    fovScale: portrait ? 1 : clamp(REF_ASPECT / aspect, 0.7, 1.35),
  }
}

export const smoothstep = (t) => {
  const x = clamp(t)
  return x * x * (3 - 2 * x)
}
export const easeInOut = (t) => {
  const x = clamp(t)
  return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2
}
