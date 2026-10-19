import * as THREE from 'three'
import { createProjectPanelTexture } from '../textures/projectPanelTexture.js'
import { clamp, damp } from '../../core/device.js'

/**
 * ProjectPanels — the corridor.
 *
 * Each project gets a 16:9 panel, alternating left and right, angled
 * toward the flight path. The camera slaloms between them (see
 * CameraRig, driven by data-camera on each <article>), so reading the
 * work list on the page and flying past the panels are the same act.
 *
 * Panel look: canvas texture + shader-drawn border and proximity
 * glow + a reveal wipe + a subtle lift when hovered. One material per
 * panel, no post-processing per object.
 */
export class ProjectPanels {
  constructor({ projects, tier, anisotropy = 8 }) {
    this.reduced = tier.reduced
    this.group = new THREE.Group()
    this.group.name = 'project-corridor'
    this.panels = []
    this.meshes = []
    this.projects = projects

    const W = 7.0
    const H = W * (9 / 16)

    // Panels are drawn at roughly the size they will actually occupy on
    // screen (plus a little headroom) rather than at a fixed 1600×900:
    // eight full-size canvases with mipmaps is a lot of VRAM for art that
    // is never shown at that scale, especially on a phone.
    const panelPx = clamp(window.innerWidth * 0.47, 320, 940)
    const artDpr = (panelPx * (tier.low ? 2 : 1.5)) / 1600

    projects.forEach((project, i) => {
      const side = i % 2 === 0 ? 1 : -1
      const z = -46 - i * 16
      const x = 4.9 * side

      const canvas = createProjectPanelTexture(project, { dpr: artDpr })
      const texture = new THREE.CanvasTexture(canvas)
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = anisotropy
      texture.generateMipmaps = true
      texture.minFilter = THREE.LinearMipmapLinearFilter
      texture.magFilter = THREE.LinearFilter

      const uniforms = {
        uMap: { value: texture },
        uTime: { value: 0 },
        uProximity: { value: 0 },
        uHover: { value: 0 },
        uReveal: { value: 0 },
        uAccent: { value: new THREE.Color(project.accent || '#d8ff3e') },
        uOpacity: { value: 1 },
        // Half size in world units — the shader measures its edge glow in
        // world space so it stays the same width on both axes.
        uHalf: { value: new THREE.Vector2(W / 2, H / 2) },
      }

      const material = new THREE.ShaderMaterial({
        uniforms,
        transparent: true,
        depthWrite: false,
        side: THREE.DoubleSide,
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying vec2 vUv;
          varying float vDepth;
          varying vec3 vViewDir;

          void main() {
            vUv = uv;
            vec3 p = position;
            // A slow breath so the corridor never looks like a static slide deck.
            p.y += sin(uTime * 0.7 + position.x * 0.4) * 0.045;

            vec4 world = modelMatrix * vec4(p, 1.0);
            vec4 mv = viewMatrix * world;
            vDepth = -mv.z;
            vViewDir = normalize(cameraPosition - world.xyz);

            gl_Position = projectionMatrix * mv;
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform sampler2D uMap;
          uniform float uProximity, uHover, uReveal, uOpacity;
          uniform vec3 uAccent;
          uniform vec2 uHalf;
          varying vec2 vUv;
          varying float vDepth;
          varying vec3 vViewDir;

          void main() {
            vec4 tex = texture2D(uMap, vUv);

            // ── reveal wipe (bottom → top) driven from the camera rig
            float cut = 1.0 - uReveal;
            float mask = smoothstep(cut - 0.05, cut + 0.01, vUv.y);
            float wipeLine = exp(-pow((vUv.y - cut) * 42.0, 2.0)) * (1.0 - uReveal);

            // ── edge treatment, measured in world units so the glow is the
            //    same width on the long and short sides (in UV it would be
            //    ~1.8× wider across the width of the panel). Both scale up
            //    with distance: a fixed world-space hairline goes sub-pixel
            //    once the panel is ~25 units away, which is exactly where
            //    the portrait stations sit.
            float k = mix(1.0, 3.4, smoothstep(12.0, 30.0, vDepth));
            vec2 d = min(vUv, 1.0 - vUv) * uHalf;
            float edge = min(d.x, d.y);
            float border = 1.0 - smoothstep(0.0, 0.014 * k, edge);
            float inner = exp(-edge * (5.5 / k));

            // ── surface. These are *additions* on a near-black card, so the
            //    coefficients stay small: the art has to stay readable, not
            //    glowing.
            vec3 col = tex.rgb;
            col += uAccent * border * 0.55;
            col += uAccent * inner * (0.012 + uProximity * 0.03);
            col += uAccent * wipeLine * 0.3;

            // A uniform hover lift preserves the clean, dark card surface.
            col *= 1.0 + uHover * 0.12;

            // Distance fade keeps the far end of the corridor receding.
            float fade = 1.0 - smoothstep(46.0, 84.0, vDepth);
            float near = smoothstep(2.0, 6.0, vDepth);

            float alpha = (0.55 + uProximity * 0.45) * mask * fade * near * uOpacity;
            if (alpha < 0.004) discard;

            gl_FragColor = vec4(col, alpha);
          }
        `,
      })

      const mesh = new THREE.Mesh(new THREE.PlaneGeometry(W, H, 1, 1), material)
      mesh.position.set(x, 0, z)
      mesh.rotation.y = -0.34 * side
      mesh.frustumCulled = false
      mesh.userData.projectIndex = i
      mesh.renderOrder = i

      this.group.add(mesh)
      this.panels.push({ mesh, uniforms, project, index: i, baseY: 0, z, x, side })
      this.meshes.push(mesh)
    })

    this._hovered = -1
  }

  /** Called from the pointer raycast in World. */
  setHovered(index) {
    if (index === this._hovered) return
    this._hovered = index
  }

  get hovered() {
    return this._hovered
  }

  update({ time, camera, dt = 1 / 60 }) {
    this.panels.forEach((p, i) => {
      const u = p.uniforms
      u.uTime.value = time

      // Proximity: 1 when the panel is right beside you.
      const dist = camera.position.distanceTo(p.mesh.position)
      const target = 1 - THREE.MathUtils.smoothstep(dist, 12, 40)
      u.uProximity.value = damp(u.uProximity.value, target, 5, dt)

      const hoverTarget = this._hovered === i ? 1 : 0
      u.uHover.value = damp(u.uHover.value, hoverTarget, 6, dt)

      // Reveal once we're close enough that the panel is legible.
      const revealTarget = dist < 26 ? 1 : 0
      u.uReveal.value = this.reduced ? revealTarget : damp(u.uReveal.value, revealTarget, 3.5, dt)

      // Face the flight path a little more when the camera is near.
      const lean = -0.34 * p.side + u.uProximity.value * 0.16 * p.side
      p.mesh.rotation.y = damp(p.mesh.rotation.y, lean, 4, dt)
    })
  }

  setVisible(v) {
    this.group.visible = v
  }

  dispose() {
    this.panels.forEach((p) => {
      p.mesh.geometry.dispose()
      p.mesh.material.uniforms.uMap.value.dispose()
      p.mesh.material.dispose()
    })
  }
}
