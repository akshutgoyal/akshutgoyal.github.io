import * as THREE from 'three'
import { damp } from '../../core/device.js'

/**
 * GridFloor — the floor of the world.
 *
 * Procedural grid drawn in the fragment shader from world position:
 * no texture, no mip shimmer, resolution-independent. Two densities
 * (minor 1.5u, major 7.5u), a travelling pulse band tied to scroll,
 * and distance fades so the plane can be enormous without costing
 * anything to fill.
 *
 * Anti-aliasing is done by widening the line with distance rather
 * than with fwidth() — portable across WebGL1/2 and stable in motion.
 */
export class GridFloor {
  constructor({ y = -7.2, size = [340, 520], center = new THREE.Vector3(0, 0, -140) }) {
    const geometry = new THREE.PlaneGeometry(size[0], size[1], 1, 1)
    geometry.rotateX(-Math.PI / 2)

    this.uniforms = {
      uTime: { value: 0 },
      uProgress: { value: 0 },
      uOpacity: { value: 0 },
      uMinor: { value: new THREE.Color('#1e2744') },
      uMajor: { value: new THREE.Color('#36497f') },
      uPulse: { value: new THREE.Color('#d8ff3e') },
      uPulseZ: { value: 20 },
      uNear: { value: 8.0 },
      uFar: { value: 190.0 },
      uCenter: { value: new THREE.Vector2(0, -140) },
    }

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      vertexShader: /* glsl */ `
        varying vec3 vWorld;
        void main() {
          vec4 world = modelMatrix * vec4(position, 1.0);
          vWorld = world.xyz;
          gl_Position = projectionMatrix * viewMatrix * world;
        }
      `,
      fragmentShader: /* glsl */ `
        precision highp float;
        uniform float uTime, uProgress, uOpacity, uPulseZ, uNear, uFar;
        uniform vec3 uMinor, uMajor, uPulse;
        uniform vec2 uCenter;
        varying vec3 vWorld;

        // Distance (in cell units) to the nearest line centre.
        float cellDist(vec2 p, float cell) {
          vec2 f = abs(fract(p / cell) - 0.5);
          return min(f.x, f.y);
        }

        void main() {
          vec2 p = vWorld.xz;
          float distCam = length(vWorld - cameraPosition);
          float distZ = length(p - uCenter);

          // Widen the line as it recedes: cheap, stable anti-aliasing.
          float w = 0.012 + distCam * 0.00042;

          float minor = 1.0 - smoothstep(0.0, w, cellDist(p, 1.5));
          float major = 1.0 - smoothstep(0.0, w * 1.7, cellDist(p, 7.5));

          float near = smoothstep(uNear, uNear + 14.0, distCam);
          float far = 1.0 - smoothstep(uFar * 0.5, uFar, distCam);
          float edge = 1.0 - smoothstep(90.0, 168.0, distZ);
          float fade = near * far * edge;

          // Travelling pulse: a band of light that leads the camera.
          float band = exp(-pow((vWorld.z - uPulseZ) * 0.055, 2.0));
          float bandRipple = 0.75 + 0.25 * sin(p.x * 0.35 + uTime * 1.6);

          vec3 col = uMinor * minor * 0.32 + uMajor * major * 0.5;
          col += uPulse * band * bandRipple * (minor * 0.5 + major * 0.7) * 0.3;

          float alpha = (minor * 0.2 + major * 0.32) * fade;
          alpha += band * fade * 0.06;

          if (alpha < 0.002) discard;
          gl_FragColor = vec4(col, alpha * uOpacity);
        }
      `,
    })

    this.mesh = new THREE.Mesh(geometry, this.material)
    this.mesh.position.copy(center).setY(y)
    this.mesh.frustumCulled = false
    this.mesh.renderOrder = -400
    this.mesh.name = 'grid-floor'
    this._opacity = 0
  }

  update({ time, progress, cameraZ, dt = 1 / 60 }) {
    this.uniforms.uTime.value = time
    this.uniforms.uProgress.value = progress
    // The pulse sits a little ahead of the camera, so scrolling feels
    // like the ground is answering you.
    this.uniforms.uPulseZ.value = cameraZ - 26
    this._opacity = damp(this._opacity, 1, 1.6, dt)
    this.uniforms.uOpacity.value = this._opacity
  }
}
