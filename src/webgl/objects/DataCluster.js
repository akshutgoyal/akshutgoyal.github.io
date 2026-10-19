import { palette } from '../../core/theme.js'
import * as THREE from 'three'
import { damp } from '../../core/device.js'

/**
 * DataCluster — the "system diagram" the About section flies you into.
 *
 * Nodes are one InstancedMesh, links are one LineSegments (built from
 * a deterministic pseudo-random graph). Colours carry meaning: accent
 * nodes are the public/engine pieces, blue nodes the surfaces.
 */
export class DataCluster {
  constructor({ position = new THREE.Vector3(-11, 0.4, -24), count = 34 } = {}) {
    this.group = new THREE.Group()
    this.group.position.copy(position)
    this.group.name = 'data-cluster'

    const rand = mulberry32(20261017)
    const nodes = []
    for (let i = 0; i < count; i++) {
      // Two lobes + a spine: reads as a considered structure, not a cloud.
      const lobe = i % 3
      const t = i / count
      const x = (rand() - 0.5) * 7.2 + (lobe === 1 ? 3.1 : lobe === 2 ? -2.6 : 0)
      const y = (rand() - 0.5) * 4.6
      const z = (rand() - 0.5) * 5.4 - t * 3.0
      nodes.push(new THREE.Vector3(x, y, z))
    }

    const geo = new THREE.OctahedronGeometry(0.13, 0)
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: { value: 0 },
        uOpacity: { value: 0 },
        uColor: { value: new THREE.Color(palette.rim) },
        uAccent: { value: new THREE.Color(palette.accent) },
      },
      vertexShader: /* glsl */ `
        uniform float uTime;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vSeed;
        void main() {
          vSeed = position.x * 3.1 + position.y * 7.7;
          vec3 p = position * (1.0 + sin(uTime * 1.6 + vSeed) * 0.08);
          vec4 world = instanceMatrix * vec4(p, 1.0);
          world = modelMatrix * world;
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
          float fres = pow(1.0 - clamp(dot(normalize(vNormalW), normalize(vViewDir)), 0.0, 1.0), 2.0);
          vec3 col = mix(uColor, uAccent, step(0.72, fract(vSeed * 0.37)));
          float pulse = 0.6 + 0.4 * sin(uTime * 1.9 + vSeed);
          gl_FragColor = vec4(col * (0.5 + fres * 1.4), (0.14 + fres * 0.85) * uOpacity * pulse);
        }
      `,
    })

    this.nodes = new THREE.InstancedMesh(geo, mat, count)
    const m = new THREE.Matrix4()
    nodes.forEach((n, i) => {
      const s = 0.55 + rand() * 1.5
      m.makeScale(s, s, s)
      m.setPosition(n)
      this.nodes.setMatrixAt(i, m)
    })
    this.nodes.instanceMatrix.needsUpdate = true
    this.nodes.frustumCulled = false
    this.group.add(this.nodes)

    // ── links: nearest-neighbour graph, capped so it stays legible
    const points = []
    for (let i = 0; i < nodes.length; i++) {
      const a = nodes[i]
      const neighbours = nodes
        .map((b, j) => ({ j, d: a.distanceTo(b) }))
        .filter((o) => o.j !== i)
        .sort((p, q) => p.d - q.d)
        .slice(0, 2)
      for (const n of neighbours) {
        if (n.j < i) continue
        if (rand() < 0.45) continue
        points.push(a.x, a.y, a.z, nodes[n.j].x, nodes[n.j].y, nodes[n.j].z)
      }
    }

    const linkGeo = new THREE.BufferGeometry()
    linkGeo.setAttribute('position', new THREE.Float32BufferAttribute(points, 3))
    this.linkUniforms = {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(palette.secondary) },
    }
    this.links = new THREE.LineSegments(
      linkGeo,
      new THREE.ShaderMaterial({
        uniforms: this.linkUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        vertexShader: /* glsl */ `
          varying float vAlong;
          void main() {
            vAlong = position.x * 0.31 + position.z * 0.17;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform float uOpacity, uTime;
          uniform vec3 uColor;
          varying float vAlong;
          void main() {
            // Data trickling along the links.
            float flow = 0.4 + 0.6 * smoothstep(0.2, 1.0, sin(vAlong * 2.0 - uTime * 1.5));
            gl_FragColor = vec4(uColor * (0.7 + flow * 0.8), uOpacity * (0.12 + flow * 0.5));
          }
        `,
      })
    )
    this.links.frustumCulled = false
    this.group.add(this.links)

    this.group.rotation.y = -0.24
    this._opacity = 0
    this._rand = rand
  }

  update({ time, progress, dt = 1 / 60 }) {
    // Visible while the About copy is on screen (roughly 0.16 → 0.32).
    const target =
      THREE.MathUtils.smoothstep(progress, 0.1, 0.18) *
      (1 - THREE.MathUtils.smoothstep(progress, 0.28, 0.4))
    this._opacity = damp(this._opacity, target, 3, dt)
    const o = this._opacity

    this.nodes.material.uniforms.uTime.value = time
    this.nodes.material.uniforms.uOpacity.value = o
    this.linkUniforms.uTime.value = time
    this.linkUniforms.uOpacity.value = o

    this.group.rotation.y = -0.24 + Math.sin(time * 0.14) * 0.12
    this.group.visible = o > 0.01
  }
}

/** Tiny deterministic PRNG so the cluster is identical every load. */
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
