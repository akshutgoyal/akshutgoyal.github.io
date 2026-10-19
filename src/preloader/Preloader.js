import gsap from 'gsap'
import { bootLines } from '../config/site.config.js'
import { advanceProgress } from './progress.js'

/**
 * Preloader — "the dash"
 * ─────────────────────────────────────────────────────────────
 * Four beats, in order:
 *
 *   1. DASH IN      the wordmark arrives in a fast stagger, three
 *                   speed-lines tear across the screen
 *   2. LOAD         counter climbs, the rail fills, a dash shuttle
 *                   runs the rail, status text cycles. The counter
 *                   eases toward actual asset progress without jumping
 *   3. READY        100% waits for assets and a real rendered frame
 *   4. PART         letters dash off to the right while six dark
 *                   blinds drop to uncover the site
 *
 * The reveal is gated on two honest things: every tracked asset has
 * settled, *and* the world has rendered at least one real frame. No
 * fixed timeout pretending to be loading.
 */

export class Preloader {
  constructor({ reduced = false, onReveal } = {}) {
    this.root = document.getElementById('preloader')
    this.reduced = reduced
    this.onReveal = onReveal
    this.tracker = null
    this._value = { v: 0 }

    if (!this.root) {
      this.missing = true
      return
    }

    this.countEl = this.root.querySelector('#pre-count')
    this.fillEl = this.root.querySelector('#pre-fill')
    this.dashEl = this.root.querySelector('#pre-dash')
    this.statusEl = this.root.querySelector('#pre-status')
    this.streaks = [...this.root.querySelectorAll('[data-streak]')]
    this.blinds = [...this.root.querySelectorAll('.pre__blind')]
    this.curtain = [this.root.querySelector('.pre__bg'), this.root.querySelector('.pre__grid')].filter(Boolean)

    this.word = this.root.querySelector('[data-split-word]')
    this.letters = []
    if (this.word) {
      // index.html splits this inline, before the first paint, so only
      // build spans when they are genuinely missing.
      if (!this.word.querySelector('span')) {
        this.word.innerHTML = [...this.word.textContent.trim()]
          .map((c) => `<span>${c === ' ' ? '&nbsp;' : c}</span>`)
          .join('')
      }
      this.letters = [...this.word.querySelectorAll('span')]
    }
  }

  /** Paint the first, un-animated state so nothing flashes. */
  prime() {
    if (this.missing || !this.word) return
    // The word is hidden in the critical CSS precisely until this runs.
    gsap.set(this.word, { opacity: 1 })
    // y: 0 matters — the inline pre-split wrote its offset as a translateY
    // in pixels, which GSAP would otherwise keep adding to yPercent.
    gsap.set(this.letters, { yPercent: 120, y: 0, opacity: 0 })
    gsap.set(this.blinds, { scaleY: 1 })
    gsap.set(this.dashEl, { left: '-20%' })
    this.render()
  }

  async play(tracker) {
    this.tracker = tracker
    if (this.missing) return Promise.resolve()

    if (this.reduced) return this._playReduced()

    this.prime()

    // ── 1. dash in
    const intro = gsap.timeline()
    intro
      .to(this.letters, {
        yPercent: 0,
        opacity: 1,
        duration: 0.85,
        ease: 'expo.out',
        stagger: { each: 0.032, from: 'start' },
      })
      .to(this.root, { duration: 0.1 }, 0) // keep the timeline non-empty

    this._startStreaks(intro)

    // ── 2. load
    this._startShuttle()
    this._startStatusCycle()
    await this._animateProgress()
    this._setStatus('ready')

    // ── 4. part
    await this._reveal()
  }

  // ─────────────────────────── pieces

  _startStreaks(timeline) {
    this.streaks.forEach((el, i) => {
      const fire = () => {
        gsap.set(el, { y: gsap.utils.random(12, 88, 1) + '%' })
        gsap.fromTo(
          el,
          { x: '0vw', opacity: 0, scaleX: 0.6 },
          {
            x: '160vw',
            opacity: 1,
            scaleX: 1.6,
            duration: gsap.utils.random(0.36, 0.6),
            ease: 'power2.in',
            onComplete: () => gsap.set(el, { opacity: 0 }),
          }
        )
      }
      timeline.call(fire, undefined, 0.1 + i * 0.16)
      // Keep them dashing while the counter runs.
      const loop = gsap.timeline({ repeat: -1, delay: 1.1 + i * 0.35 })
      loop.call(fire).to({}, { duration: gsap.utils.random(1.1, 2.1) })
      this._streakLoops = this._streakLoops || []
      this._streakLoops.push(loop)
    })
  }

  _startShuttle() {
    this._shuttle = gsap.fromTo(
      this.dashEl,
      { left: '-18%', opacity: 0.15 },
      {
        left: '104%',
        opacity: 0.9,
        duration: 0.75,
        ease: 'power1.inOut',
        repeat: -1,
        repeatDelay: 0.12,
      }
    )
  }

  _startStatusCycle() {
    let i = 0
    this._statusLoop = gsap.timeline({ repeat: -1 })
    for (let k = 0; k < bootLines.length - 1; k++) {
      this._statusLoop
        .call(() => this._setStatus(bootLines[i++ % (bootLines.length - 1)]))
        .to({}, { duration: 0.62 })
    }
  }

  _setStatus(text) {
    if (!this.statusEl) return
    this.statusEl.textContent = text
  }

  /** The displayed value is already smoothed; never clamp it to a jumping asset count. */
  render() {
    if (this.missing) return
    const shown = this._value.v
    const pct = Math.max(0, Math.min(100, Math.floor(shown * 100)))

    if (this.countEl && this._lastPct !== pct) this.countEl.textContent = String(pct).padStart(3, '0')
    this._lastPct = pct
    if (this.fillEl) this.fillEl.style.transform = `scaleX(${shown})`
  }

  _animateProgress() {
    let settled = !this.tracker
    this.tracker?.done.then(() => { settled = true })
    return new Promise((resolve) => {
      const tick = (_time, deltaMs) => {
        // Leave room for actual readiness; slow requests may pause progress,
        // but neither a new asset nor a slow frame can jump the counter.
        const target = settled ? 1 : Math.min(0.96, (this.tracker?.progress || 0) * 0.94 + 0.04)
        this._value.v = advanceProgress(this._value.v, target, deltaMs)
        this.render()
        if (this._value.v === 1) {
          gsap.ticker.remove(tick)
          resolve()
        }
      }
      gsap.ticker.add(tick)
    })
  }

  async _reveal() {
    if (this._shuttle) this._shuttle.kill()
    this._streakLoops?.forEach((l) => l.kill())
    this._statusLoop?.kill()

    return new Promise((resolve) => {
      const tl = gsap.timeline({ onComplete: resolve })

      // Last dash across the rail, then everything leaves.
      tl.call(() => {
        gsap.fromTo(
          this.dashEl,
          { left: '-18%', opacity: 1, scaleY: 3 },
          { left: '112%', duration: 0.32, ease: 'power3.in', scaleY: 1 }
        )
      })
        .to(this.letters, {
          xPercent: 60,
          opacity: 0,
          duration: 0.5,
          ease: 'power3.in',
          stagger: { each: 0.018, from: 'start' },
        }, 0.05)
        .to(this.root.querySelector('.pre__count'), { opacity: 0, y: -14, duration: 0.35, ease: 'power2.in' }, 0.05)
        .to(this.root.querySelectorAll('.pre__row'), { opacity: 0, duration: 0.3 }, 0)

        // Hand over to the site: camera dolly + DOM reveals start here.
        .call(() => this.onReveal?.(), undefined, 0.34)

        // Blinds drop, bottom-anchored, staggered left → right.
        .to(this.blinds, {
          scaleY: 0,
          duration: 0.95,
          ease: 'power4.inOut',
          stagger: { each: 0.055, from: 'start' },
        }, 0.34)
        .to(this.curtain, { opacity: 0, duration: 0.7, ease: 'power2.inOut' }, 0.5)

      // Reveal the site underneath while the blinds are still moving.
      tl.call(() => document.documentElement.classList.remove('is-loading'), undefined, 0.34)
      tl.call(() => {
        document.documentElement.classList.add('preloader-done')
        this.root.setAttribute('aria-hidden', 'true')
      })
    })
  }

  _playReduced() {
    // Reduced motion: no streaks, no blinds — just a quick, quiet hand-off.
    return new Promise((resolve) => {
      gsap.set(this.letters, { yPercent: 0, y: 0, opacity: 1 })
      if (this.word) gsap.set(this.word, { opacity: 1 })
      this._value.v = 0

      this._animateProgress().then(() => {
        this.onReveal?.()
        document.documentElement.classList.remove('is-loading')
        document.documentElement.classList.add('preloader-done')
        this.root.setAttribute('aria-hidden', 'true')
        resolve()
      })
    })
  }

}
