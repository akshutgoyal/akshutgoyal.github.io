import { palette } from '../../core/theme.js'
import * as THREE from 'three'
import { damp } from '../../core/device.js'

/**
 * ShapeRing — the "shapes" the stack section lands on.
 * Three concentric rings of instanced octahedra: one InstancedMesh
 * for the whole thing, one draw call, fresnel-lit so no scene lights
 * are required anywhere in the world.
 *
 * The rings counter-rotate on their own and take an extra spin from
 * scroll, which gives the section a sense of machinery.
 */
export class ShapeRing {
  constructor({ count = 64, center = new THREE.Vector3(0, 0.5, -228) }) {
    this.group = new THREE.Group()
    this.group.position.copy(center)
    this.group.name = 'shape-ring'
    // Scaled up so the rings reach past the copy on a wide screen — the
    // section frames them as a structure you fly over, not a small prop.
    this.group.scale.setScalar(1.25)

    const rand = mulberry32(77123)
    const rings = [
      { r: 6.4, y: 0.0, tilt: 0.0, scale: 1.0 },
      { r: 9.6, y: 1.1, tilt: 0.35, scale: 0.82 },
      { r: 12.6, y: -0.6, tilt: -0.42, scale: 0.66 },
    ]

    const geo = new THREE.OctahedronGeometry(0.34, 0)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(palette.secondary) },
        uAccent: { value: new THREE.Color(palette.accent) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vSeed;

        void main() {
          vSeed = position.x * 5.0 + position.y * 3.0 + float(gl_InstanceID) * 0.37;
          vec3 p = position * (1.0 + sin(uTime * 1.1 + vSeed) * 0.06);
          vec4 world = modelMatrix * instanceMatrix * vec4(p, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * normal);
          vViewDir = normalize(cameraPosition - world.xyz);
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity, uTime;
        uniform vec3 uColor, uAccent;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vSeed;

        void main() {
          float fres = pow(1.0 - clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0), 1.7);
          float which = step(0.6, fract(vSeed * 0.41));
          vec3 col = mix(uColor, uAccent, which * 0.85);
          float pulse = 0.7 + 0.3 * sin(uTime * 1.5 + vSeed * 2.0);
          gl_FragColor = vec4(col * (0.42 + fres * 1.6), (0.14 + fres * 1.0) * uOpacity * pulse);
        }
      `,
    })

    // One instanced mesh, distributed across the three rings.
    const total = count
    this.instances = new THREE.InstancedMesh(geo, mat, total)
    const m = new THREE.Matrix4()
    const q = new THREE.Quaternion()
    const e = new THREE.Euler()
    const s = new THREE.Vector3()
    const pos = new THREE.Vector3()

    this.ringMeta = []
    for (let i = 0; i < total; i++) {
      const ring = rings[i % rings.length]
      const angle = (i / total) * Math.PI * 2 * 3 + rand() * 0.12
      pos.set(Math.cos(angle) * ring.r, ring.y + (rand() - 0.5) * 1.4, Math.sin(angle) * ring.r * 0.62)
      e.set(rand() * Math.PI, angle, rand() * Math.PI)
      q.setFromEuler(e)
      const sc = ring.scale * (0.7 + rand() * 0.85)
      s.setScalar(sc)
      m.compose(pos, q, s)
      this.instances.setMatrixAt(i, m)
      this.ringMeta.push({ ringIndex: i % rings.length, angle, baseY: pos.y })
    }
    this.instances.instanceMatrix.needsUpdate = true
    this.instances.frustumCulled = false
    this.group.add(this.instances)

    this.material = mat
    this.uniforms = mat.uniforms
    this._opacity = 0
  }

  update({ time, progress, camera, dt = 1 / 60 }) {
    // Present for the stack section only. These two windows are tuned to
    // where the archive/stack stations actually fall in page progress
    // (≈0.78 and ≈0.91 with ten panels): the ring fades in as the
    // archive list is read, is at full opacity for the whole stack
    // section, and is gone again by the contact station.
    const target =
      THREE.MathUtils.smoothstep(progress, 0.8, 0.87) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.9, 0.98))
    this._opacity = damp(this._opacity, target, 3, dt)
    const o = this._opacity
    this.uniforms.uTime.value = time
    this.uniforms.uOpacity.value = o

    this.group.rotation.y = time * 0.06 + progress * 2.4
    this.group.rotation.x = Math.sin(time * 0.12) * 0.05
    this.group.visible = o > 0.01
  }
}

function mulberry32(seed) {
  let a = seed >>> 0
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}
