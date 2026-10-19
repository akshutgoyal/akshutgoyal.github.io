import gsap from 'gsap'
import { marquee as words } from '../config/site.config.js'

/**
 * Marquee — the stack ticker.
 * Content is written three times so a single -33.33% translate loops
 * seamlessly. Every other word takes the accent colour.
 */
export class Marquee {
  constructor({ reduced = false } = {}) {
    this.host = document.getElementById('marquee-track')
    if (!this.host) return
    this.reduced = reduced

    const run = words
      .map((w, i) => `<b>${w}</b><i aria-hidden="true">/</i>`)
      .join('')

    this.host.innerHTML = run + run + run

    if (reduced) return
    this.tween = gsap.to(this.host, {
      xPercent: -33.3333,
      duration: 26,
      ease: 'none',
      repeat: -1,
    })
  }

  /** Nudge speed with scroll velocity — reads as momentum, not chaos. */
  link(scrollManager) {
    if (!this.host || !this.tween || this.reduced) return
    let speed = 1
    gsap.ticker.add(() => {
      const v = Math.min(Math.abs(scrollManager.velocity) / 60, 1)
      speed += (1 + v * 2.4 - speed) * 0.07
      this.tween.timeScale(speed)
    })
  }
}
