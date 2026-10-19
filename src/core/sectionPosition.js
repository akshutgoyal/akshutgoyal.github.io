/** Fit a section's content into the usable viewport, or start at its heading. */
export function sectionPosition({ contentTop, contentHeight, scrollY, viewportHeight, headerHeight, center = true }) {
  const gap = 20
  const available = Math.max(0, viewportHeight - headerHeight - gap * 2)
  const extra = center ? Math.max(0, (available - contentHeight) / 2) : 0
  return Math.max(0, scrollY + contentTop - headerHeight - gap - extra)
}
