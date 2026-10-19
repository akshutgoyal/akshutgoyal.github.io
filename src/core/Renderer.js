import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'

/**
 * Renderer — owns the WebGL canvas, the post chain and the resize
 * story. Deliberately small: the scene graph lives in World.
 *
 * Post: RenderPass → UnrealBloom → OutputPass (tone map + sRGB).
 * Bloom is what makes the accents read as light rather than paint,
 * so it's the one effect worth the fill cost — and the first thing
 * we drop if the frame budget says no.
 */
export class Renderer {
  constructor(host, { tier }) {
    this.host = host
    this.tier = tier
    this.bloomEnabled = tier.bloom
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, tier.dprCap)
    this.dprBudget = tier.dprCap
    this.size = { width: 0, height: 0 }

    this.renderer = new THREE.WebGLRenderer({
      antialias: !tier.low,
      alpha: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    })
    this.renderer.setPixelRatio(this.pixelRatio)
    this.renderer.outputColorSpace = THREE.SRGBColorSpace
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping
    this.renderer.toneMappingExposure = 0.96
    this.renderer.setClearColor(0x000000, 1)
    this.renderer.domElement.setAttribute('aria-hidden', 'true')
    host.appendChild(this.renderer.domElement)

    // ── post chain (built lazily once we know the scene + camera)
    this.composer = null
    this.bloom = null

    this._onResize = this._onResize.bind(this)
    window.addEventListener('resize', this._onResize, { passive: true })
    window.addEventListener('orientationchange', this._onResize, { passive: true })
    this._ro = new ResizeObserver(this._onResize)
    this._ro.observe(host)

    this._onResize()

    // ── opportunistic auto-degrade: if we can't hold ~40fps we drop
    //    bloom and then the pixel ratio, rather than shipping jank.
    this._frames = 0
    this._acc = 0
    this._strikes = 0
    this._degradeWatched = false
  }

  attachPost(scene, camera) {
    this.scene = scene
    this.camera = camera
    // The renderer owns the viewport, so it owns the camera's aspect ratio.
    // (Sizing the canvas without this leaves the aspect at PerspectiveCamera's
    // default of 1 and stretches the whole scene sideways.)
    this._applyAspect()
    const { width, height } = this.size
    const target = new THREE.WebGLRenderTarget(width * this.pixelRatio, height * this.pixelRatio, {
      type: THREE.HalfFloatType,
      samples: this.tier.low ? 0 : 2,
    })
    this.composer = new EffectComposer(this.renderer, target)
    this.composer.setSize(width, height)
    this.composer.addPass(new RenderPass(scene, camera))
    if (this.bloomEnabled) {
      // Tight bloom: only genuinely bright things (lime accents, the orb core)
      // are meant to glow. A low threshold turns every grid line and dust mote
      // into a blue haze, which is what made the whole scene read as "blue
      // background" instead of black space.
      this.bloom = new UnrealBloomPass(new THREE.Vector2(width, height), 0.32, 0.62, 0.94)
      this.composer.addPass(this.bloom)
    }
    this.composer.addPass(new OutputPass())
    this._degradeWatched = true
  }

  watchPerformance(dt) {
    if (!this._degradeWatched || this.tier.reduced) return
    this._frames++
    this._acc += dt
    if (this._acc < 2) return
    const fps = this._frames / this._acc
    this._frames = 0
    this._acc = 0
    if (fps >= 40) {
      this._strikes = Math.max(0, this._strikes - 1)
      return
    }
    this._strikes++
    if (this._strikes < 2) return
    this._strikes = 0
    if (this.bloom) {
      // Drop the expensive pass first.
      this.bloom.enabled = false
      this.bloom = null
      if (import.meta.env?.DEV) console.info('[renderer] bloom disabled — holding frame budget')
      return
    }
    if (this.pixelRatio > 1) {
      this.pixelRatio = Math.max(1, this.pixelRatio - 0.5)
      this.dprBudget = this.pixelRatio
      this.renderer.setPixelRatio(this.pixelRatio)
      this.composer?.setPixelRatio(this.pixelRatio)
      if (import.meta.env?.DEV) console.info('[renderer] pixel ratio →', this.pixelRatio)
    }
  }

  render() {
    if (this.composer) this.composer.render()
    else this.renderer.render(this.scene, this.camera)
  }

  _onResize() {
    const width = Math.max(1, this.host.clientWidth || window.innerWidth)
    const height = Math.max(1, this.host.clientHeight || window.innerHeight)
    if (width === this.size.width && height === this.size.height) return
    this.size = { width, height }

    const dpr = Math.min(window.devicePixelRatio || 1, this.dprBudget)
    if (dpr !== this.pixelRatio && !this.tier.low) {
      this.pixelRatio = dpr
      this.renderer.setPixelRatio(dpr)
      this.composer?.setPixelRatio(dpr)
    }

    this.renderer.setSize(width, height, false)
    this.composer?.setSize(width, height)
    this._applyAspect()
    this.onResize?.(width, height)
  }

  _applyAspect() {
    if (!this.camera) return
    const aspect = this.size.width / this.size.height
    if (Math.abs(this.camera.aspect - aspect) < 1e-4) return
    this.camera.aspect = aspect
    this.camera.updateProjectionMatrix()
  }

  dispose() {
    this._ro.disconnect()
    window.removeEventListener('resize', this._onResize)
    window.removeEventListener('orientationchange', this._onResize)
    this.composer?.dispose?.()
    this.renderer.dispose()
    this.renderer.domElement.remove()
  }
}
