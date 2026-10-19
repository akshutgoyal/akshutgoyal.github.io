import { palette } from '../../core/theme.js'
import * as THREE from 'three'
import { damp } from '../../core/device.js'

/**
 * ParticleField — the dust the whole journey is suspended in.
 * One BufferGeometry, one draw call, ~14k points on desktop.
 *
 * Each point carries a seed that drives size, twinkle rate, colour
 * mix and drift phase, so nothing in the field is synchronised and
 * the camera never sees a repeating pattern.
 */
export class ParticleField {
  constructor({ count = 9000, tier }) {
    this.tier = tier
    this.count = count
    const positions = new Float32Array(count * 3)
    const seeds = new Float32Array(count)
    const scales = new Float32Array(count)

    const X = 84
    const Y = 44
    const Z_NEAR = 42
    const Z_FAR = -392

    for (let i = 0; i < count; i++) {
      const i3 = i * 3
      // Cube-root-ish bias so points crowd the centre line where the
      // camera actually travels, instead of an even fog.
      const r = Math.pow(Math.random(), 0.62)
      const angle = Math.random() * Math.PI * 2
      positions[i3] = Math.cos(angle) * r * X * (0.35 + Math.random() * 0.65)
      positions[i3 + 1] = (Math.random() - 0.5) * Y * (0.4 + r * 0.9)
      positions[i3 + 2] = Z_NEAR + Math.random() * (Z_FAR - Z_NEAR)

      seeds[i] = Math.random()
      scales[i] = 0.35 + Math.pow(Math.random(), 2.2) * 2.6
    }

    const geometry = new THREE.BufferGeometry()
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1))
    geometry.setAttribute('aScale', new THREE.BufferAttribute(scales, 1))
    geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, -140), 320)

    this.uniforms = {
      uTime: { value: 0 },
      uSize: { value: 0.5 },
      uPerspective: { value: 800 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uColorA: { value: new THREE.Color(palette.rim) },
      uColorB: { value: new THREE.Color('#ffffff') },
      uColorC: { value: new THREE.Color(palette.accent) },
      uPointer: { value: new THREE.Vector2() },
      uFar: { value: 260 },
    }

    const material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        uniform float uTime, uSize, uPerspective, uProgress, uFar;
        uniform vec2 uPointer;
        attribute float aSeed;
        attribute float aScale;
        varying float vAlpha;
        varying float vSeed;
        varying float vDepth;

        void main() {
          vec3 p = position;

          // Slow, unsynchronised drift.
          float t = uTime * 0.5;
          p.x += sin(t * 0.7 + aSeed * 24.0) * 0.9;
          p.y += cos(t * 0.55 + aSeed * 31.0) * 0.8;
          p.z += sin(t * 0.42 + aSeed * 17.0) * 0.7;

          // The field leans very slightly with the pointer — enough to
          // feel parallax without becoming a gimmick.
          p.xy += uPointer * (1.2 + aSeed * 2.4);

          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          float dist = -mv.z;

          gl_PointSize = uSize * aScale * uPerspective / max(dist, 0.6);
          // Hard ceiling on point size: without it, a particle passing the
          // lens becomes a 40px blob and the field turns into bokeh soup.
          gl_PointSize = clamp(gl_PointSize, 0.5, 2.8);

          // Fade the ones on the lens, fade the ones past the fog, and
          // keep the near field faint so it never competes with content.
          // Content lives within ~40 units of the camera, so that is
          // exactly where the field has to stay out of the way.
          float near = smoothstep(6.0, 44.0, dist);
          float far = 1.0 - smoothstep(uFar * 0.45, uFar, dist);
          float depthLift = mix(0.2, 0.72, smoothstep(10.0, 90.0, dist));
          vAlpha = near * far * depthLift;
          vSeed = aSeed;
          vDepth = dist;

          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime, uOpacity;
        uniform vec3 uColorA, uColorB, uColorC;
        varying float vAlpha;
        varying float vSeed;
        varying float vDepth;

        void main() {
          float d = length(gl_PointCoord - 0.5);
          if (d > 0.5) discard;

          float core = 1.0 - smoothstep(0.02, 0.5, d);
          core *= core;

          float twinkle = 0.62 + 0.38 * sin(uTime * (0.8 + vSeed * 2.6) + vSeed * 42.0);

          vec3 col = mix(uColorA, uColorB, smoothstep(0.35, 0.95, vSeed));
          // A few rare accents carry the brand colour.
          col = mix(col, uColorC, step(0.975, vSeed) * 0.85);

          float a = core * (0.26 + twinkle * 0.5) * vAlpha * uOpacity;
          if (a < 0.004) discard;
          gl_FragColor = vec4(col, a);
        }
      `,
    })

    this.points = new THREE.Points(geometry, material)
    this.points.frustumCulled = false
    this.points.renderOrder = -500
    this.points.name = 'particle-field'
    this.material = material
    this._targetOpacity = tier.low ? 0.22 : 0.26
  }

  /** Keep point size honest as the fov moves with the camera. */
  setPerspective(heightPx, pixelRatio, fovDeg) {
    const fov = (fovDeg * Math.PI) / 180
    this.uniforms.uPerspective.value = (heightPx * pixelRatio) / (2 * Math.tan(fov / 2))
  }

  update({ time, progress, pointer, dt = 1 / 60 }) {
    this.uniforms.uTime.value = this.tier.reduced ? 0 : time
    this.uniforms.uProgress.value = progress
    this.uniforms.uPointer.value.set(pointer.x * 0.35, pointer.y * 0.35)
    // Fade the field in as the intro finishes so it doesn't pop.
    this.uniforms.uOpacity.value = damp(this.uniforms.uOpacity.value, this._targetOpacity, 3, dt)
  }
}
