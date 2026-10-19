import gsap from 'gsap'
import { damp } from '../core/device.js'

/**
 * Cursor — a dot that tracks 1:1 and a ring that trails behind it.
 * The ring reacts to anything interactive; elements can hand it a
 * label via data-cursor="Write".
 *
 * Disabled entirely on touch devices (CSS hides it too).
 */
export class Cursor {
  constructor({ reduced = false } = {}) {
    this.el = document.getElementById('cursor')
    this.labelEl = document.getElementById('cursor-label')
    if (!this.el || matchMedia('(hover: none), (pointer: coarse)').matches) return

    this.dot = this.el.querySelector('.cursor__dot')
    this.ring = this.el.querySelector('.cursor__ring')
    this.reduced = reduced

    this.target = { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    this.dotPos = { ...this.target }
    this.ringPos = { ...this.target }
    this.visible = false

    this._onMove = this._onMove.bind(this)
    this._onOver = this._onOver.bind(this)
    this._onOut = this._onOut.bind(this)
    this._tick = this._tick.bind(this)

    window.addEventListener('pointermove', this._onMove, { passive: true })
    document.addEventListener('pointerover', this._onOver, true)
    document.addEventListener('pointerout', this._onOut, true)
    window.addEventListener('pointerleave', () => this.hide())
    gsap.ticker.add(this._tick)
  }

  _onMove(e) {
    this.target.x = e.clientX
    this.target.y = e.clientY
    if (!this.visible) this.show()
  }

  show() {
    this.visible = true
    document.body.classList.add('has-cursor')
    gsap.to(this.el, { opacity: 1, duration: 0.3, overwrite: true })
  }

  hide() {
    this.visible = false
    gsap.to(this.el, { opacity: 0, duration: 0.3, overwrite: true })
  }

  _onOver(e) {
    const hit = e.target.closest?.('a, button, [data-cursor], .work')
    if (!hit) return
    const label = hit.dataset?.cursor || ''
    document.body.classList.toggle('cursor-hover', true)
    if (label) {
      this.labelEl.textContent = label
      document.body.classList.add('cursor-label-on')
    }
  }

  _onOut(e) {
    const hit = e.target.closest?.('a, button, [data-cursor], .work')
    if (!hit) return
    const next = e.relatedTarget?.closest?.('a, button, [data-cursor], .work')
    if (next === hit) return
    document.body.classList.remove('cursor-hover', 'cursor-label-on')
  }

  _tick(time, dt) {
    if (!this.visible || document.hidden) return
    const d = dt / 1000
    const r = this.reduced ? 1 : 1 - Math.exp(-11 * d)
    this.dotPos.x = damp(this.dotPos.x, this.target.x, this.reduced ? 60 : 26, d)
    this.dotPos.y = damp(this.dotPos.y, this.target.y, this.reduced ? 60 : 26, d)
    this.ringPos.x += (this.target.x - this.ringPos.x) * r
    this.ringPos.y += (this.target.y - this.ringPos.y) * r

    // Positioning lives here; the -50% centring stays composed in.
    this.dot.style.transform = `translate3d(${this.dotPos.x}px, ${this.dotPos.y}px, 0) translate(-50%, -50%)`
    this.ring.style.transform = `translate3d(${this.ringPos.x}px, ${this.ringPos.y}px, 0) translate(-50%, -50%)`

    const on = document.body.classList.contains('cursor-label-on')
    this.labelEl.style.transform =
      `translate3d(${this.ringPos.x}px, ${this.ringPos.y}px, 0) translate(-50%, -50%) scale(${on ? 1 : 0.8})`
    void time
  }
}
