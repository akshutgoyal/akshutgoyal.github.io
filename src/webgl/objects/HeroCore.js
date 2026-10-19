import { palette } from '../../core/theme.js'
import * as THREE from 'three'
import { noise3D } from '../shaders/lib.js'
import { damp } from '../../core/device.js'

/**
 * HeroCore — the one object the site opens on.
 *
 * A displaced icosahedron: simplex noise pushes the surface along its
 * normal, fresnel lights the rim, and a wireframe shell plus two thin
 * rings give it structure. It is the only "hero object" in the scene,
 * which is the point — one idea, executed with weight, rather than a
 * pile of effects.
 */
export class HeroCore {
  constructor({ radius = 1.75, tier }) {
    this.group = new THREE.Group()
    this.group.name = 'hero-core'

    const detail = tier.low ? 4 : 5

    this.coreUniforms = {
      uTime: { value: 0 },
      uAmp: { value: 0.16 },
      uFreq: { value: 1.15 },
      uOpacity: { value: 0 },
      uHover: { value: 0 },
      uColorDeep: { value: new THREE.Color(palette.deep) },
      uColorRim: { value: new THREE.Color(palette.rim) },
      uColorAccent: { value: new THREE.Color(palette.accent) },
      uPointer: { value: new THREE.Vector2() },
    }

    const coreGeo = new THREE.IcosahedronGeometry(radius, detail)
    const coreMat = new THREE.ShaderMaterial({
      uniforms: this.coreUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        ${noise3D}
        uniform float uTime, uAmp, uFreq;
        uniform vec2 uPointer;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vNoise;
        varying float vUp;

        void main() {
          vec3 n = normalize(normal);
          // Two octaves keep the surface from reading as a simple pulse.
          float t = uTime * 0.34;
          float n1 = snoise(n * uFreq + vec3(0.0, 0.0, t));
          float n2 = snoise(n * (uFreq * 2.35) - vec3(t * 0.4, 0.0, 0.0)) * 0.5;
          float disp = (n1 + n2) * uAmp;

          vec3 p = position + n * disp;
          // A slow lean driven by the pointer, applied in object space.
          p.xy += uPointer * 0.16 * (0.4 + abs(n1));

          vec4 world = modelMatrix * vec4(p, 1.0);
          vNormalW = normalize(mat3(modelMatrix) * n);
          vViewDir = normalize(cameraPosition - world.xyz);
          vNoise = (n1 + n2) * 0.5;
          vUp = clamp(n.y * 0.5 + 0.5, 0.0, 1.0);

          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity, uHover;
        uniform vec3 uColorDeep, uColorRim, uColorAccent;
        varying vec3 vNormalW;
        varying vec3 vViewDir;
        varying float vNoise;
        varying float vUp;

        void main() {
          float fres = pow(1.0 - clamp(dot(vNormalW, vViewDir), 0.0, 1.0), 2.4);

          vec3 col = mix(uColorDeep, uColorRim, fres * 0.9);
          col += uColorAccent * smoothstep(0.42, 0.95, vNoise) * 0.55;
          col += uColorRim * fres * (0.5 + uHover * 0.9);

          // Fine latitudinal banding: reads as an instrument, not a ball.
          float bands = 0.5 + 0.5 * sin(vUp * 190.0);
          col *= 0.86 + bands * 0.14;

          // The body stays nearly transparent — the shell, the rings and
          // the rim are what you actually see.
          float alpha = (0.1 + fres * 1.0 + uHover * 0.12) * uOpacity;
          gl_FragColor = vec4(col, alpha);
        }
      `,
    })

    this.core = new THREE.Mesh(coreGeo, coreMat)
    this.core.frustumCulled = false
    this.group.add(this.core)

    // ── wireframe shell
    this.shellUniforms = {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(palette.shell) },
    }
    const shellGeo = new THREE.IcosahedronGeometry(radius * 1.42, 1)
    this.shell = new THREE.Mesh(
      shellGeo,
      new THREE.ShaderMaterial({
        uniforms: this.shellUniforms,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        wireframe: true,
        vertexShader: /* glsl */ `
          uniform float uTime;
          varying float vSeed;
          void main() {
            vSeed = position.x + position.y * 2.0 + position.z * 3.0;
            vec3 p = position;
            p += normalize(position) * sin(uTime * 0.7 + vSeed * 3.0) * 0.05;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform float uOpacity, uTime;
          uniform vec3 uColor;
          varying float vSeed;
          void main() {
            float flicker = 0.55 + 0.45 * sin(uTime * 1.3 + vSeed * 5.0);
            gl_FragColor = vec4(uColor, uOpacity * flicker * 0.5);
          }
        `,
      })
    )
    this.shell.frustumCulled = false
    this.group.add(this.shell)

    // ── two thin rings
    this.ringUniforms = {
      uOpacity: { value: 0 },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(palette.accent) },
    }
    const ringMat = new THREE.ShaderMaterial({
      uniforms: this.ringUniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        varying float vAngle;
        void main() {
          vUv = uv;
          vAngle = atan(position.x, position.z);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uOpacity, uTime;
        uniform vec3 uColor;
        varying vec2 vUv;
        varying float vAngle;
        void main() {
          // Dashes around the ring, brighter where the sweep passes.
          float dashes = smoothstep(0.34, 0.5, abs(fract(vAngle * 0.9) - 0.5));
          float sweep = 0.35 + 0.65 * smoothstep(-1.0, 1.0, sin(vAngle + uTime * 0.8));
          gl_FragColor = vec4(uColor, uOpacity * (0.2 + dashes * 0.85) * sweep);
        }
      `,
    })
    this.ringA = new THREE.Mesh(new THREE.TorusGeometry(radius * 2.35, 0.0055, 6, 220), ringMat)
    this.ringA.rotation.set(1.32, 0.28, 0.2)
    this.ringB = new THREE.Mesh(new THREE.TorusGeometry(radius * 2.95, 0.004, 6, 220), ringMat)
    this.ringB.rotation.set(1.05, -0.5, -0.35)
    this.group.add(this.ringA, this.ringB)

    // ── soft glow billboard: gives bloom something to hold on to
    const glowCanvas = document.createElement('canvas')
    glowCanvas.width = glowCanvas.height = 256
    const gctx = glowCanvas.getContext('2d')
    const grad = gctx.createRadialGradient(128, 128, 0, 128, 128, 128)
    grad.addColorStop(0, 'rgba(120,160,255,0.34)')
    grad.addColorStop(0.32, 'rgba(70,110,255,0.1)')
    grad.addColorStop(1, 'rgba(0,0,0,0)')
    gctx.fillStyle = grad
    gctx.fillRect(0, 0, 256, 256)
    const glowTex = new THREE.CanvasTexture(glowCanvas)
    glowTex.colorSpace = THREE.SRGBColorSpace
    this.glow = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: glowTex,
        transparent: true,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
        opacity: 0,
      })
    )
    // The glow is a halo behind the core, not a screen-wide wash: at
    // radius × 9 it filled the whole hero frame and flattened it to grey.
    this.glow.scale.setScalar(radius * 4.4)
    this.group.add(this.glow)

    this.tier = tier
    this._opacity = 0
    this._targetOpacity = 1
    this._rot = new THREE.Vector2()
  }

  /** progress 0→1 across the whole page decides how present the core is. */
  update({ time, progress, pointer, hover = 0, dt = 1 / 60 }) {
    this.coreUniforms.uTime.value = time
    this.shellUniforms.uTime.value = time
    this.ringUniforms.uTime.value = time

    // Present on the hero screen, gone once we've travelled to About.
    const fade = 1 - THREE.MathUtils.smoothstep(progress, 0.05, 0.19)
    this._targetOpacity = fade
    this._opacity = damp(this._opacity, this._targetOpacity, 5, dt)

    const o = this._opacity
    this.coreUniforms.uOpacity.value = o
    this.shellUniforms.uOpacity.value = o
    this.ringUniforms.uOpacity.value = o
    this.glow.material.opacity = o * 0.62

    this.coreUniforms.uPointer.value.set(pointer.x * 0.5, pointer.y * 0.5)
    this.coreUniforms.uHover.value = damp(this.coreUniforms.uHover.value, hover, 5, dt)

    // Idle rotation + a touch of pointer steer, damped.
    this._rot.x = damp(this._rot.x, pointer.y * 0.28, 3, dt)
    this._rot.y = damp(this._rot.y, pointer.x * 0.45, 3, dt)

    this.group.rotation.y = time * 0.09 + this._rot.y
    this.group.rotation.x = this._rot.x * 0.7
    this.core.rotation.y = -time * 0.05

    const breathe = 1 + Math.sin(time * 0.7) * 0.014
    this.group.scale.setScalar(breathe * (0.9 + o * 0.1))
    this.ringA.rotation.z = 0.2 + time * 0.066
    this.ringB.rotation.z = -0.35 - time * 0.042
    this.group.position.y = Math.sin(time * 0.42) * 0.06

    this.group.visible = o > 0.01
  }
}
