import gsap from 'gsap'
import { ScrollTrigger } from 'gsap/ScrollTrigger'
import { AssetTracker } from './AssetTracker.js'
import { ScrollManager } from './ScrollManager.js'
import { detectTier, hasWebGL } from './device.js'
import { Preloader } from '../preloader/Preloader.js'
import { Navigation } from '../ui/Navigation.js'
import { Cursor } from '../ui/Cursor.js'
import { Reveals } from '../ui/Reveals.js'
import { ScrollRail } from '../ui/ScrollRail.js'
import { Marquee } from '../ui/Marquee.js'
import { ProjectNavigator } from '../ui/ProjectNavigator.js'
import { ProjectPreviews } from '../ui/ProjectPreviews.js'
import { projects, introPose } from '../config/site.config.js'

/**
 * App — the conductor.
 *
 * Boot order matters and is deliberate:
 *   1. capability detection, so everything downstream knows its budget
 *   2. preloader primes itself (first paint is the loading screen)
 *   3. scroll + UI wired up but *held* (no scroll before the reveal)
 *   4. WebGL world built and rendering behind the curtain — this is
 *      where shaders compile and textures upload, hidden from view
 *   5. the preloader waits for real progress, then hands over:
 *      camera intro dolly + DOM reveals fire on the same frame
 *
 * Everything animates off GSAP's single ticker. There is exactly one
 * rAF loop in this site.
 */
export class App {
  constructor() {
    this.tier = detectTier()
    this.pointer = { x: 0, y: 0 }
    this.hoverIndex = -1
    this.hotIndex = -1
    this.rafActive = false

    document.body.classList.add(this.tier.low ? 'tier-low' : 'tier-high')
    if (this.tier.reduced) document.documentElement.classList.add('reduced-motion')
  }

  async init() {
    const tracker = new AssetTracker()
    this.tracker = tracker

    // ── 1. preloader owns the first paint
    this.preloader = new Preloader({
      reduced: this.tier.reduced,
      onReveal: () => this.reveal(),
    })
    this.preloader.prime?.()

    // ── 2. scroll: created, then frozen at the top
    this.scroll = new ScrollManager({ reduced: this.tier.reduced })
    this.scroll.reset()

    // ── 3. UI
    this.nav = new Navigation({ scrollManager: this.scroll })
    this.rail = new ScrollRail({ scrollManager: this.scroll })
    this.cursor = new Cursor({ reduced: this.tier.reduced })
    this.marquee = new Marquee({ reduced: this.tier.reduced })
    this.marquee.link(this.scroll)
    this.reveals = new Reveals({ reduced: this.tier.reduced })
    this._bindWorkList()
    this.projectNavigator = new ProjectNavigator({ scrollManager: this.scroll })

    // Register readiness before starting the counter. The heavier scene code
    // downloads separately so the loading UI can paint and respond first.
    let resolveWorld
    tracker.track('world', new Promise((resolve) => { resolveWorld = resolve }))
    tracker.track('fonts', document.fonts?.ready ?? Promise.resolve())
    tracker.track('layout', new Promise((r) => requestAnimationFrame(() => r())))
    tracker.track('document', document.readyState === 'complete' ? Promise.resolve()
      : new Promise((r) => window.addEventListener('load', r, { once: true })))
    const loading = this.preloader.play(tracker)
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))

    // ── 4. WebGL
    const host = document.getElementById('webgl')
    if (host && hasWebGL()) {
      try {
        const [{ Renderer }, { World }] = await Promise.all([
          import('./Renderer.js'), import('../webgl/World.js'),
        ])
        this.renderer = new Renderer(host, { tier: this.tier })
        this.world = new World({ renderer: this.renderer, tier: this.tier, projects })
        this.world.build()
        this.world.onHover = (i) => this.setHot(i)
        // Hold the wide intro pose until the curtain lifts.
        this.world.rig.intro = this.tier.reduced ? 0 : 1
        // Where supported, let the GPU compile shaders asynchronously while
        // the counter is moving instead of blocking the first scene frame.
        await this.renderer.renderer.compileAsync(this.world.scene, this.world.camera)
        this.world.firstFrame.then(() => {
          this.sceneReady = true
          resolveWorld()
        })
      } catch (err) {
        console.error('[app] WebGL world failed to start — falling back', err)
        this._failWebGL()
        resolveWorld()
      }
    } else {
      this._failWebGL()
      resolveWorld()
    }

    this.projectPreviews = new ProjectPreviews({
      projects,
      panels: this.world?.panels,
      onLayout: () => requestAnimationFrame(() => {
        ScrollTrigger.refresh()
        this.world?.build()
      }),
    })

    // ── 5. pointer (screen-space normalised, y down)
    window.addEventListener('pointermove', (e) => {
      this.pointer.x = (e.clientX / window.innerWidth) * 2 - 1
      this.pointer.y = (e.clientY / window.innerHeight) * 2 - 1
      if (this.world) this.world.enableHover(this.hotIndex === -1)
    }, { passive: true })

    // ── 6. tab visibility: stop burning frames in a hidden tab
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopLoop()
      else if (this.booted) {
        this.world?.invalidate()
        this.startLoop()
      }
    })

    this.startLoop()

    await loading

    // Re-measure now that fonts, masks and the world are all in place.
    this.world?.build()

    // Opened mid-journey (deep link, or a reload further down the page)?
    // Land where the reader already is instead of flying in from the hero.
    let hashTarget
    try { hashTarget = document.getElementById(decodeURIComponent(location.hash.slice(1))) } catch { /* malformed fragment */ }
    this.scroll.lenis.resize()
    if (hashTarget?.classList.contains('work')) {
      this.projectNavigator.go(Number(hashTarget.dataset.project), { immediate: true })
    } else {
      this.nav.restoreHash()
    }
    if (location.hash || window.scrollY > 8) {
      this.world?.rig.snap(this.scroll.progress)
    }
    this.booted = true

    // Camera stations are page positions, so anything that can change the
    // page's height has to re-anchor them: a resize, a font finally
    // landing, a SplitText re-split, an image arriving.
    this._debouncedRebuild = this._debouncedRebuild.bind(this)
    window.addEventListener('resize', this._debouncedRebuild, { passive: true })
    ScrollTrigger.addEventListener('refresh', this._debouncedRebuild)
    document.fonts?.ready.then(this._debouncedRebuild)
    document.querySelector('.stack__cols')?.addEventListener('toggle', () => {
      requestAnimationFrame(() => {
        this.scroll.lenis.resize()
        ScrollTrigger.refresh()
        this.world?.build()
      })
    }, true)
  }

  // ───────────────────────────── reveal

  /** Called by the preloader the instant the blinds start to drop. */
  reveal() {
    this.sceneRevealed = true
    this.scroll.start()
    this.reveals.play()
    document.documentElement.classList.add('is-ready')

    if (this.world && !this.tier.reduced) {
      gsap.to(this.world.rig, {
        intro: 0,
        duration: introPose.duration,
        ease: 'power3.inOut',
      })
    }
    if (this.world) this.world.enableHover(true)
  }

  // ───────────────────────────── loop

  startLoop() {
    if (this.rafActive) return
    this.rafActive = true
    // Time-based animation must stay time-based: GSAP's default lag
    // smoothing rewrites the delta after a slow frame, which would make
    // the preloader counter and every scroll tween crawl on weak GPUs.
    // Our camera clamps its own dt, so a jump can't teleport it.
    gsap.ticker.lagSmoothing(0)
    this._tick = this._tick.bind(this)
    gsap.ticker.add(this._tick)
  }

  stopLoop() {
    if (!this.rafActive) return
    this.rafActive = false
    gsap.ticker.remove(this._tick)
  }

  _tick(time, deltaMs) {
    if (!this.world) return
    // Two real frames establish readiness. Further hidden GPU frames only
    // compete with the progress counter until the curtain begins to open.
    if (this.sceneReady && !this.sceneRevealed) return
    this.frames = (this.frames || 0) + 1
    // Clamp dt: a tab that was hidden for a minute, or one pathological
    // frame, must not teleport the camera. Everything downstream either
    // sub-steps (the rig) or damps against dt, so this is only a guard
    // against absurd jumps — not a frame budget.
    const dt = Math.min(deltaMs / 1000, 0.5)

    this.world.setPointer(this.pointer.x, this.pointer.y)
    this.world.update({
      dt,
      time,
      progress: this.scroll.progress,
      velocity: this.scroll.velocity,
    })
  }

  // ───────────────────────────── DOM ⇄ 3D

  /** Hovering a row in the DOM and flying past a panel are one state. */
  _bindWorkList() {
    this.workRows = [...document.querySelectorAll('.work')]
    this.workRows.forEach((row) => {
      const index = Number(row.dataset.project)
      row.addEventListener('pointerenter', () => {
        this.world?.enableHover(false)
        this.setHot(index)
      })
      row.addEventListener('pointerleave', () => {
        this.world?.enableHover(true)
        this.setHot(-1)
      })
      row.addEventListener('focusin', () => this.setHot(index))
      row.addEventListener('focusout', (event) => {
        if (!row.contains(event.relatedTarget)) this.setHot(-1)
      })
    })
  }

  setHot(index) {
    if (index === this.hotIndex) return
    this.hotIndex = index
    this.workRows?.forEach((row, i) => row.classList.toggle('is-hot', i === index))
    this.world?.panels.setHovered(index)
  }

  // ───────────────────────────── fallbacks

  _failWebGL() {
    document.documentElement.classList.add('no-webgl')
    this.world = null
    this.renderer = null
    // The normal loader hand-off also handles the complete DOM fallback.
  }

  _debouncedRebuild() {
    clearTimeout(this._rebuildTimer)
    this._rebuildTimer = setTimeout(() => this.world?.build(), 260)
  }
}
