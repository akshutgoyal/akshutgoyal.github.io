import * as THREE from 'three'
import { Backdrop } from './objects/Backdrop.js'
import { ParticleField } from './objects/ParticleField.js'
import { HeroCore } from './objects/HeroCore.js'
import { DataCluster } from './objects/DataCluster.js'
import { ProjectPanels } from './objects/ProjectPanels.js'
import { ShapeRing } from './objects/ShapeRing.js'
import { CameraRig } from './CameraRig.js'

/**
 * World — the scene graph.
 *
 * Everything here is procedural: no GLB downloads, no texture files,
 * no external fetches. That keeps the first paint honest and the
 * byte budget tiny, and means the corridor panels can be regenerated
 * from site.config.js at any time.
 *
 * Everything is also unlit: fresnel + additive shaders instead of
 * lights. One lighting model, one visual language, far fewer knobs.
 */
export class World {
  constructor({ renderer, tier, projects }) {
    this.renderer = renderer
    this.tier = tier

    this.scene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1500)
    this.camera.position.set(0, 0.45, 9.2)

    this.rig = new CameraRig(this.camera, { reduced: tier.reduced })

    this.backdrop = new Backdrop({ tier })
    this.particles = new ParticleField({ count: tier.particles, tier })
    this.core = new HeroCore({ tier })
    this.cluster = new DataCluster({})
    this.panels = new ProjectPanels({
      projects,
      tier,
      anisotropy: renderer.renderer.capabilities.getMaxAnisotropy(),
    })
    // The ring closes the corridor: past the last panel (z = -158),
    // the archive block, then here — see the stack station in index.html.
    this.rings = new ShapeRing({ count: tier.shapes, center: new THREE.Vector3(0, 0.5, -228) })

    this.scene.add(
      this.backdrop.mesh,
      this.particles.points,
      this.core.group,
      this.cluster.group,
      this.panels.group,
      this.rings.group
    )

    // ── pointer + hover
    this.raycaster = new THREE.Raycaster()
    this._ndc = new THREE.Vector2(0, 0)
    this._hoverIndex = -1
    this._rayFrame = 0
    this._rayEnabled = false
    this.onHover = null

    // ── first-frame promise: the preloader waits for a real rendered
    //    frame, not a timer, so the reveal can never stutter.
    this._firstFrame = new Promise((resolve) => (this._resolveFirstFrame = resolve))
    this._rendered = 0
    this._idleTime = 0

    renderer.attachPost(this.scene, this.camera)
    renderer.onResize = () => {
      // Shape first: the fov fit must not lag behind the canvas resize.
      this.rig.readShape()
      // Anchors are page-relative, so re-measure once the layout settles.
      if (this._resizeTimer) clearTimeout(this._resizeTimer)
      this._resizeTimer = setTimeout(() => this.rig.refresh(), 220)
    }
  }

  get firstFrame() {
    return this._firstFrame
  }

  /** Re-read data-camera anchors (after fonts land / layout settles). */
  build() {
    this.rig.buildFromDOM()
    return this
  }

  /** NDC in (-1..1, y up). */
  setPointer(x, y) {
    if (this.tier.reduced) { x = 0; y = 0 }
    this._ndc.set(x, -y)
    this.rig.setPointer(x, -y)
  }

  enableHover(on) {
    this._rayEnabled = on
  }

  invalidate() {
    this._idleTime = 0
  }

  update({ dt, time, progress, velocity }) {
    const size = this.renderer.size
    const changed = this._lastProgress !== progress || this._lastWidth !== size.width
      || this._lastHeight !== size.height || this._lastDpr !== this.renderer.pixelRatio
      || this._lastHover !== this.panels.hovered
    this._idleTime = changed ? 0 : this._idleTime + dt
    this._lastProgress = progress
    this._lastWidth = size.width
    this._lastHeight = size.height
    this._lastDpr = this.renderer.pixelRatio
    this._lastHover = this.panels.hovered
    // Skip CPU updates as well as GPU work once a static scene has settled.
    if (this.tier.reduced && this._idleTime >= 2 && this._rendered >= 2) return

    if (this.tier.reduced) time = 0
    this.rig.setProgress(progress)
    this.rig.update(dt, time)

    this.backdrop.update({ progress, time, camera: this.camera })
    this.particles.setPerspective(
      this.renderer.size.height,
      this.renderer.pixelRatio,
      this.camera.fov
    )
    this.particles.update({ time, progress, pointer: this._ndc, dt })
    this.core.update({ time, progress, pointer: this._ndc, hover: 0, dt })
    this.cluster.update({ time, progress, dt })
    this.panels.update({ time, camera: this.camera, dt })
    this.rings.update({ time, progress, camera: this.camera, dt })

    if (this._rayEnabled && this.panels.group.visible && ++this._rayFrame % 3 === 0) this._raycast()

    // Let opacity/proximity damping settle, then stop submitting identical
    // GPU frames when motion is disabled. Scrolling, resizing and hover wake it.
    if (!this.tier.reduced || this._idleTime < 2 || this._rendered < 2) {
      this.renderer.watchPerformance(dt)
      this.renderer.render()
      if (this._rendered++ === 1) this._resolveFirstFrame()
    }
    void velocity
  }

  _raycast() {
    this.raycaster.setFromCamera(this._ndc, this.camera)
    const hits = this.raycaster.intersectObjects(this.panels.meshes, false)
    const next = hits.length ? hits[0].object.userData.projectIndex : -1
    if (next === this._hoverIndex) return
    this._hoverIndex = next
    this.panels.setHovered(next)
    this.onHover?.(next)
  }

  dispose() {
    this.panels.dispose()
    this.scene.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
      if (o.material) {
        const mats = Array.isArray(o.material) ? o.material : [o.material]
        mats.forEach((m) => {
          Object.values(m.uniforms || {}).forEach((u) => u.value?.dispose?.())
          m.dispose()
        })
      }
    })
  }
}
