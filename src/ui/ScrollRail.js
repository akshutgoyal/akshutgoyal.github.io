import gsap from 'gsap'
import { nav } from '../config/site.config.js'

/**
 * ScrollRail — the vertical progress indicator on the right.
 * Ticks are generated from the nav config so the rail can never
 * disagree with the menu, and each tick is a real scroll link.
 */
export class ScrollRail {
  constructor({ scrollManager }) {
    this.scrollManager = scrollManager
    this.root = document.getElementById('rail')
    this.bar = document.getElementById('rail-progress')
    this.tickHost = document.getElementById('rail-ticks')
    if (!this.root || !this.tickHost) return

    this.ticks = nav.map((item) => {
      const tick = document.createElement('button')
      tick.type = 'button'
      tick.className = 'rail__tick'
      tick.textContent = item.index
      tick.setAttribute('aria-label', `Jump to ${item.label}`)
      tick.addEventListener('click', () => scrollManager.scrollToSection(`#${item.id}`))
      this.tickHost.appendChild(tick)
      return { el: tick, id: item.id }
    })

    scrollManager.onSectionChange((id) => {
      this.ticks.forEach((t) => t.el.classList.toggle('is-active', t.id === id))
    })

    this.displayed = 0
    this._tick = this._tick.bind(this)
    gsap.ticker.add(this._tick)
  }

  _tick(time, dt) {
    if (!this.bar) return
    const target = this.scrollManager.progress
    this.displayed += (target - this.displayed) * Math.min(1, (dt / 1000) * 8)
    this.bar.style.height = `${Math.max(0, Math.min(1, this.displayed)) * 100}%`
    void time
  }
}
