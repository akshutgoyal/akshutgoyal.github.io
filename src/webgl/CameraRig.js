import * as THREE from 'three'
import { clamp, damp, easeInOut, viewShape } from '../core/device.js'
import { introPose } from '../config/site.config.js'

/**
 * CameraRig — scroll becomes camera movement.
 * ─────────────────────────────────────────────────────────────
 * Stations are authored in the HTML itself, on whatever element
 * should own that framing:
 *
 *   <section data-camera='{"pos":[0,.45,9.2],"target":[0,.1,0],"fov":42,"roll":0}'>
 *
 * The rig reads them in document order, converts each element's
 * midpoint into a page-scroll progress value, and then flies the
 * camera along that polyline. Authoring the camera next to the copy
 * it frames means the two can never drift apart.
 *
 * Three layers of motion stack here:
 *   1. scroll   → position/target/fov/roll along the polyline
 *   2. pointer  → small parallax offset, damped
 *   3. intro    → a one-shot dolly that plays after the preloader
 */
export class CameraRig {
  constructor(camera, { reduced = false } = {}) {
    this.camera = camera
    this.reduced = reduced

    /** @type {{p:number,pos:THREE.Vector3,target:THREE.Vector3,fov:number,roll:number}[]} */
    this.stations = []
    this.rawProgress = 0
    this.progress = 0
    this.intro = 0
    this.fov = camera.fov
    this.roll = 0

    this.pointer = new THREE.Vector2()
    this._pointer = new THREE.Vector2()

    this._pos = new THREE.Vector3()
    this._target = new THREE.Vector3()
    this._curPos = new THREE.Vector3()
    this._curTarget = new THREE.Vector3()

    this.maxLead = 11 // never let the damped camera fall further behind than this
    this._seeded = false
    this.shape = viewShape()
  }

  /** Re-read the viewport shape (cheap — safe to call before a rebuild). */
  readShape() {
    this.shape = viewShape()
    return this.shape
  }

  buildFromDOM(root = document) {
    const nodes = [...root.querySelectorAll('[data-camera]')]
    const vh = window.innerHeight
    const docH = Math.max(1, document.documentElement.scrollHeight - vh)
    const { portrait } = this.shape

    this.stations = nodes
      .map((el) => {
        let data
        try {
          data = JSON.parse(el.dataset.camera)
        } catch {
          console.warn('[camera] bad data-camera on', el)
          return null
        }
        // On a portrait screen the 3D subject can't sit beside the copy,
        // so a station may carry its own pose for that composition.
        if (portrait && data.portrait) data = { ...data, ...data.portrait }
        const rect = el.getBoundingClientRect()
        const top = rect.top + window.scrollY
        // Anchor: the moment this element's centre crosses the viewport centre.
        const anchor = (top + rect.height / 2 - vh / 2) / docH
        return {
          p: clamp(anchor),
          pos: new THREE.Vector3().fromArray(data.pos),
          target: new THREE.Vector3().fromArray(data.target),
          fov: data.fov ?? 45,
          roll: data.roll ?? 0,
          ease: data.ease || 'inOut',
          el,
        }
      })
      .filter(Boolean)
      .sort((a, b) => a.p - b.p)

    if (this.stations.length) {
      this.stations[0].p = 0
      this.stations[this.stations.length - 1].p = 1
    }

    // Seed the smoothed values so the first frame is already framed.
    // Only on first build: a refresh (resize, fonts landing, ScrollTrigger
    // re-measure) must not teleport the camera back to the hero.
    const first = this.stations[0]
    if (first && !this._seeded) {
      this._curPos.copy(first.pos)
      this._curTarget.copy(first.target)
      this._seeded = true
    }
    return this
  }

  get stationCount() {
    return this.stations.length
  }

  /** Called on resize — anchors are relative to page height. */
  refresh() {
    const currentEl = this.currentStationEl
    this.readShape()
    this.buildFromDOM()
    if (currentEl) {
      const idx = this.stations.findIndex((s) => s.el === currentEl)
      if (idx >= 0) this._index = idx
    }
    // Re-anchor at the progress we're already at: a resize should re-frame
    // the shot, not replay the flight from the hero.
    if (this._seeded) this.snap(this.progress)
  }

  setProgress(p) {
    this.rawProgress = clamp(p)
  }

  setPointer(x, y) {
    this.pointer.set(x, y)
  }

  /**
   * Jump straight to the framing for a scroll progress, no fly-through.
   * Used on deep links (#work on load), with reduced motion, and after a
   * layout change that invalidated the anchors — anywhere a 2-second
   * camera flight would be noise rather than storytelling.
   */
  snap(p = this.rawProgress) {
    if (!this._seeded) return
    this.rawProgress = p
    this.progress = p
    const { a, b, t } = this._segment(p)
    const e = a.ease === 'linear' ? t : easeInOut(t)
    this._pos.lerpVectors(a.pos, b.pos, e)
    this._target.lerpVectors(a.target, b.target, e)
    this._curPos.copy(this._pos)
    this._curTarget.copy(this._target)
    this.fov = a.fov + (b.fov - a.fov) * e
    this.fov *= this.shape.fovScale
    this.camera.position.copy(this._curPos)
    this.camera.lookAt(this._curTarget)
    this.camera.fov = this.fov
    this.camera.updateProjectionMatrix()
  }

  /** Which HTML element owns the framing right now. */
  get currentStationEl() {
    if (!this.stations.length) return null
    const seg = this._segment(this.progress)
    return seg.b.el
  }

  _segment(p) {
    const s = this.stations
    if (s.length === 1) return { a: s[0], b: s[0], t: 0 }
    let i = 0
    while (i < s.length - 2 && p > s[i + 1].p) i++
    const a = s[i]
    const b = s[i + 1]
    const span = Math.max(1e-5, b.p - a.p)
    const t = clamp((p - a.p) / span)
    return { a, b, t }
  }

  update(dt, time = 0) {
    if (!this._seeded) return

    // Fixed-substep integration: damping is expressed per second, so on a
    // slow device a single clamped step would make the camera crawl and
    // fall behind the scroll. Substepping keeps wall-clock behaviour
    // identical at 120fps and at 15fps, without ever taking a big jump.
    const total = Math.min(dt, 0.5)
    const STEP = 1 / 60
    let remaining = total
    let t = time - total
    while (remaining > 0) {
      const d = Math.min(STEP, remaining)
      this._step(d, t)
      remaining -= d
      t += d
    }
  }

  _step(dt, time) {
    // ── 1. scroll → framing (damped so wheel clicks don't snap)
    const smoothing = this.reduced ? 1 : 1 - Math.exp(-6.5 * dt)
    this.progress += (this.rawProgress - this.progress) * smoothing

    const { a, b, t } = this._segment(this.progress)
    const e = a.ease === 'linear' ? t : easeInOut(t)

    this._pos.lerpVectors(a.pos, b.pos, e)
    this._target.lerpVectors(a.target, b.target, e)
    // Fit the authored horizontal composition (see viewShape).
    const fov = (a.fov + (b.fov - a.fov) * e) * this.shape.fovScale
    this.roll = a.roll + (b.roll - a.roll) * e

    // ── 2. pointer parallax
    const pk = this.reduced ? 0 : 1 - Math.exp(-4.2 * dt)
    this._pointer.x += (this.pointer.x - this._pointer.x) * pk
    this._pointer.y += (this.pointer.y - this._pointer.y) * pk
    this._pos.x += this._pointer.x * 0.62
    this._pos.y += this._pointer.y * 0.42

    // ── 3. intro dolly (1 → 0, tweened by App)
    let introFov = 0
    if (this.intro > 0.0005) {
      const k = this.intro
      const eased = k * k // hold the wide pose briefly, then settle
      this._pos.x += introPose.offset[0] * eased
      this._pos.y += introPose.offset[1] * eased
      this._pos.z += introPose.offset[2] * eased
      introFov = introPose.fovBoost * eased
    }

    // ── idle: nothing on screen is ever perfectly still
    if (!this.reduced) {
      this._pos.x += Math.sin(time * 0.27) * 0.09
      this._pos.y += Math.sin(time * 0.35 + 1.1) * 0.07
      this._target.y += Math.sin(time * 0.22 + 0.4) * 0.05
    }

    // ── damp toward the computed pose, with a leash
    const posK = this.reduced ? 1 : 1 - Math.exp(-9 * dt)
    const tgtK = this.reduced ? 1 : 1 - Math.exp(-7 * dt)
    this._curPos.lerp(this._pos, posK)
    this._curTarget.lerp(this._target, tgtK)

    const lead = this._curPos.distanceTo(this._pos)
    if (lead > this.maxLead) {
      this._curPos.lerp(this._pos, 1 - this.maxLead / lead)
    }

    this.camera.position.copy(this._curPos)
    this.camera.lookAt(this._curTarget)
    if (this.roll) this.camera.rotateZ(this.roll)

    const targetFov = fov + introFov
    this.fov += (targetFov - this.fov) * (this.reduced ? 1 : 1 - Math.exp(-6 * dt))
    if (Math.abs(this.camera.fov - this.fov) > 0.001) {
      this.camera.fov = this.fov
      this.camera.updateProjectionMatrix()
    }
  }
}
