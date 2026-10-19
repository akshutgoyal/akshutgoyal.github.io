/** Ease toward real asset progress without jumps, reversals or a final snap. */
export function advanceProgress(current, target, deltaMs) {
  const dt = Math.min(0.05, Math.max(0, deltaMs / 1000))
  const remaining = Math.max(0, Math.min(1, target) - current)
  const step = Math.min(0.85 * dt, remaining * (1 - Math.exp(-8 * dt)))
  const next = current + step
  return target === 1 && 1 - next < 0.0005 ? 1 : next
}
