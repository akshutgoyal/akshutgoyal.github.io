import Lenis from 'lenis'
import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { sectionPosition } from './sectionPosition.js'

gsap.registerPlugin(ScrollTrigger)

/**
 * ScrollManager
 * ─────────────────────────────────────────────────────────────
 * Lenis owns the scroll position, GSAP's ticker owns the frame
 * loop, and ScrollTrigger stays in sync for section reveals.
 * The 3D world reads `.progress` (0 → 1 across the whole page)
 * which is what drives the camera.
 *
 * Lenis drives *native* scroll (not a transform), so the page
 * stays accessible, keyboard-navigable and SEO-legible.
 */
export class ScrollManager {
  constructor({ reduced = false } = {}) {
    this.reduced = reduced
    this.progress = 0
    this.velocity = 0
    this.started = false
    this.section = null
    this._sectionListeners = new Set()
    this._tick = null

    this.lenis = new Lenis({
      // Reduced-motion users get instant, un-eased scrolling.
      duration: reduced ? 0 : 1.15,
      lerp: reduced ? 1 : 0.085,
      wheelMultiplier: 1,
      touchMultiplier: 1.7,
      smoothWheel: !reduced,
      syncTouch: false,
      autoRaf: false,
      anchors: false,
    })

    this.lenis.on('scroll', (e) => {
      this.progress = this.lenis.limit > 0 ? this.lenis.scroll / this.lenis.limit : 0
      this.velocity = e.velocity ?? 0
      ScrollTrigger.update()
      this._readSection()
      document.body.classList.toggle('is-scrolled', this.lenis.scroll > 40)
    })

    // Recompute trigger positions once fonts land and the page settles.
    if (document.fonts?.ready) document.fonts.ready.then(() => ScrollTrigger.refresh())
    window.addEventListener('load', () => ScrollTrigger.refresh(), { once: true })
  }

  /** Called by App once the preloader has finished. */
  start() {
    if (this.started) return
    this.started = true
    this.lenis.start()

    // Everything renders off GSAP's single ticker — no second rAF loop.
    this._tick = (time) => this.lenis.raf(time * 1000)
    gsap.ticker.add(this._tick)
    gsap.ticker.lagSmoothing(0)
  }

  stop() {
    this.lenis.stop()
  }

  /** Freeze input + jump to top while the preloader is on screen. */
  reset() {
    this.lenis.scrollTo(0, { immediate: true, force: true })
    this.lenis.stop()
  }

  scrollTo(target, { offset = -68, duration = 1.5, immediate = this.reduced } = {}) {
    // Resizing or expanding a skill group can change native scroll anchoring
    // before Lenis receives its next resize event. Sync before a jump.
    this.lenis.resize()
    this.lenis.scrollTo(target, {
      offset,
      immediate,
      duration: this.reduced ? 0 : duration,
      easing: (t) => 1 - Math.pow(1 - t, 3),
    })
  }

  /** In-page navigation lands on readable content, beyond the fixed header. */
  scrollToSection(target, options = {}) {
    const section = typeof target === 'string' ? document.querySelector(target) : target
    if (!section) return
    if (section.id === 'hero') {
      this.scrollTo(0, { ...options, offset: 0 })
      return
    }
    const content = section.querySelector(':scope > .section__inner') || section
    const rect = content.getBoundingClientRect()
    const headerHeight = document.querySelector('.nav')?.getBoundingClientRect().height || 68
    const position = sectionPosition({
      contentTop: rect.top,
      contentHeight: rect.height,
      scrollY: window.scrollY,
      viewportHeight: window.innerHeight,
      headerHeight,
      // Work continues through eight projects: always begin at its heading.
      center: section.id !== 'work',
    })
    // A numeric destination avoids applying CSS scroll margins a second time.
    this.scrollTo(position, { ...options, offset: 0 })
  }

  onSectionChange(fn) {
    this._sectionListeners.add(fn)
    return () => this._sectionListeners.delete(fn)
  }

  _readSection() {
    const mid = window.innerHeight / 2
    let current = null
    for (const el of document.querySelectorAll('main section[id]')) {
      const { top, bottom } = el.getBoundingClientRect()
      if (top <= mid && bottom > mid) current = el.id
    }
    if (current && current !== this.section) {
      this.section = current
      this._sectionListeners.forEach((fn) => fn(current))
    }
  }

  destroy() {
    if (this._tick) gsap.ticker.remove(this._tick)
    this.lenis.destroy()
  }
}
