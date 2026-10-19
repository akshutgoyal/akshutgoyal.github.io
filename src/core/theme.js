// Read once at boot. HTML applies URL-scoped preview colors before first paint.
const style = getComputedStyle(document.documentElement)
const color = (name) => style.getPropertyValue(name).trim()
export const palette = {
  accent: color('--accent'),
  secondary: color('--accent-2'),
  deep: color('--core-deep'),
  rim: color('--core-rim'),
  shell: color('--core-shell'),
}
