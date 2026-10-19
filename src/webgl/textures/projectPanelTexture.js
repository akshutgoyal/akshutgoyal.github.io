/**
 * projectPanelTexture.js
 * ─────────────────────────────────────────────────────────────
 * Draws each project's 3D panel as a canvas texture. Everything is
 * vector text + hairlines, so it stays crisp at any panel size and
 * the whole corridor costs zero network requests.
 *
 * Canvas space: 1600 × 900 (16:9), drawn at devicePixelRatio-aware
 * scale by the caller.
 */

const W = 1600
const H = 900

const FONT_SANS = '500 %spx "Space Grotesk", system-ui, sans-serif'
const FONT_SANS_BOLD = '600 %spx "Space Grotesk", system-ui, sans-serif'
const FONT_MONO = '500 %spx "JetBrains Mono", ui-monospace, monospace'

function withAlpha(hex, alpha) {
  const c = hex.replace('#', '')
  const n = parseInt(c.length === 3 ? c.replace(/./g, (m) => m + m) : c, 16)
  const r = (n >> 16) & 255
  const g = (n >> 8) & 255
  const b = n & 255
  return `rgba(${r},${g},${b},${alpha})`
}

/** Wrap complete text; the caller fits its font before drawing it. */
function wrap(ctx, text, maxWidth) {
  const words = text.split(' ')
  const lines = []
  let line = ''
  for (const word of words) {
    const test = line ? `${line} ${word}` : word
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line)
      line = word
    } else {
      line = test
    }
  }
  if (line) lines.push(line)
  return lines
}

function fitText(ctx, text, font, size, maxWidth) {
  ctx.font = font.replace('%s', String(size))
  while (ctx.measureText(text).width > maxWidth && size > 16) {
    size--
    ctx.font = font.replace('%s', String(size))
  }
  return size
}

export function createProjectPanelTexture(project, { dpr = 1 } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(W * dpr)
  canvas.height = Math.round(H * dpr)
  const ctx = canvas.getContext('2d')
  ctx.scale(canvas.width / W, canvas.height / H)

  const accent = project.accent || '#d8ff3e'
  const pad = 84

  // ── base
  ctx.fillStyle = '#070910'
  ctx.fillRect(0, 0, W, H)

  // ── faint engineering grid
  ctx.strokeStyle = 'rgba(255,255,255,0.035)'
  ctx.lineWidth = 1
  for (let x = 0; x <= W; x += 50) {
    ctx.beginPath()
    ctx.moveTo(x + 0.5, 0)
    ctx.lineTo(x + 0.5, H)
    ctx.stroke()
  }
  for (let y = 0; y <= H; y += 50) {
    ctx.beginPath()
    ctx.moveTo(0, y + 0.5)
    ctx.lineTo(W, y + 0.5)
    ctx.stroke()
  }

  // ── inner vignette so the panel reads as an object, not a slide
  const vig = ctx.createRadialGradient(W * 0.42, H * 0.4, 40, W * 0.5, H * 0.5, W * 0.66)
  vig.addColorStop(0, 'rgba(10,13,22,0)')
  vig.addColorStop(1, 'rgba(3,4,7,0.85)')
  ctx.fillStyle = vig
  ctx.fillRect(0, 0, W, H)

  // ── accent hairline down the left edge
  ctx.fillStyle = accent
  ctx.fillRect(pad - 26, pad - 26 + 20, 3, 132)

  // ── index (big, outlined) — the block's top-left anchor
  ctx.font = FONT_SANS_BOLD.replace('%s', '124')
  ctx.textBaseline = 'top'
  ctx.lineWidth = 2
  ctx.strokeStyle = withAlpha(accent, 0.9)
  ctx.strokeText(project.index, pad, pad - 26)

  // ── category + year, with the outlined index retained as the anchor
  ctx.fillStyle = 'rgba(185,192,207,0.75)'
  ctx.font = FONT_MONO.replace('%s', '24')
  const category = (project.category || project.kicker).toUpperCase()
  fitText(ctx, category, FONT_MONO, 24, 1000)
  ctx.fillText(category, pad + 210, pad + 16)

  ctx.fillStyle = withAlpha(accent, 0.85)
  ctx.textAlign = 'right'
  ctx.font = FONT_MONO.replace('%s', '24')
  ctx.fillText(project.year, W - pad, pad + 16)
  ctx.textAlign = 'left'

  // ── title
  const titleTop = 216
  fitText(ctx, project.title, FONT_SANS, 152, W - pad * 2)
  ctx.fillStyle = '#f3f6fc'
  ctx.fillText(project.title, pad - 8, titleTop)

  // ── a short, complete description of what this project does
  const summary = project.summary || project.kicker
  let summarySize = 32
  let summaryLines
  do {
    ctx.font = FONT_SANS.replace('%s', String(summarySize))
    summaryLines = wrap(ctx, summary, W - pad * 2)
    if (summaryLines.length <= 2) break
    summarySize--
  } while (summarySize > 18)
  ctx.fillStyle = 'rgba(196,205,222,0.88)'
  summaryLines.forEach((text, i) => ctx.fillText(text, pad - 8, 397 + i * 42))

  const ruleY = 475
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(pad - 8, ruleY, W - pad * 2 + 16, 1)

  // ── stack chips
  let cx = pad - 8
  let chipY = 501
  // Fit the whole stack, including short tags such as R2; never silently
  // drop a technology or let the row run through the panel's edge.
  let chipSize = 23
  const chipWidth = (text) => ctx.measureText(text.toUpperCase()).width + 38
  const availableWidth = W - pad * 2 + 8
  const totalWidth = () => project.stack.reduce((sum, text) => sum + chipWidth(text) + 12, -12)
  ctx.font = FONT_MONO.replace('%s', String(chipSize))
  while (totalWidth() > availableWidth && chipSize > 19) {
    chipSize--
    ctx.font = FONT_MONO.replace('%s', String(chipSize))
  }
  for (const chip of project.stack) {
    const text = chip.toUpperCase()
    const w = chipWidth(chip)
    if (cx + w > W - pad) { cx = pad - 8; chipY += 58 }
    ctx.strokeStyle = withAlpha(accent, 0.42)
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.roundRect(cx, chipY, w, 50, 25)
    ctx.stroke()

    ctx.fillStyle = 'rgba(230,235,245,0.86)'
    ctx.fillText(text, cx + 19, chipY + 15)
    cx += w + 12
  }

  // ── two project-specific details replace repeated year / stack counts
  const detailsTop = Math.max(594, chipY + 82)
  ctx.fillStyle = 'rgba(255,255,255,0.09)'
  ctx.fillRect(pad - 8, detailsTop, W - pad * 2 + 16, 1)
  const detailWidth = 660
  const highlights = project.highlights || [project.kicker]
  highlights.forEach((detail, i) => {
    const x = pad - 8 + i * 736
    ctx.font = FONT_MONO.replace('%s', '20')
    ctx.fillStyle = 'rgba(114,125,148,0.85)'
    ctx.fillText(i === 0 ? 'BUILT AROUND' : 'WHAT MATTERS', x, detailsTop + 28)
    ctx.fillStyle = 'rgba(206,214,230,0.88)'
    fitText(ctx, detail, FONT_SANS, 29, detailWidth)
    ctx.fillText(detail, x, detailsTop + 65)
  })

  // Source availability is explicit, including the harness's public extension.
  const sourceY = detailsTop + 142
  ctx.fillStyle = withAlpha(accent, 0.85)
  ctx.font = FONT_MONO.replace('%s', '21')
  ctx.fillText((project.access || 'Source').toUpperCase(), pad - 8, sourceY)
  const note = project.repo || 'private build'
  ctx.fillStyle = 'rgba(185,192,207,0.85)'
  fitText(ctx, note, FONT_MONO, 22, W - pad - 430)
  ctx.fillText(note, 430, sourceY)

  // ── footer note
  ctx.fillStyle = 'rgba(120,131,154,0.9)'
  ctx.font = FONT_MONO.replace('%s', '21')
  ctx.fillText('SELECTED WORK', pad - 8, H - pad)
  ctx.textAlign = 'right'
  ctx.fillText('AKSHUT GOYAL — PORTFOLIO', W - pad, H - pad)
  ctx.textAlign = 'left'

  // ── corner ticks
  ctx.strokeStyle = withAlpha(accent, 0.55)
  ctx.lineWidth = 2
  const t = 34
  const corners = [
    [26, 26, 1, 1],
    [W - 26, 26, -1, 1],
    [26, H - 26, 1, -1],
    [W - 26, H - 26, -1, -1],
  ]
  for (const [x, y, dx, dy] of corners) {
    ctx.beginPath()
    ctx.moveTo(x + dx * t, y)
    ctx.lineTo(x, y)
    ctx.lineTo(x, y + dy * t)
    ctx.stroke()
  }

  return canvas
}
