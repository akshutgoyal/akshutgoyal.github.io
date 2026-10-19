import * as THREE from 'three'

/** An infinitely distant starfield. Empty space stays completely black. */
export class Backdrop {
  constructor({ radius = 620, tier }) {
    this.tier = tier
    this.mesh = new THREE.Mesh(
      new THREE.SphereGeometry(radius, 24, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        depthWrite: false,
        depthTest: false,
        fog: false,
        uniforms: { uTime: { value: 0 } },
        vertexShader: /* glsl */ `
          varying vec3 vDirection;
          void main() {
            vDirection = position;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }
        `,
        fragmentShader: /* glsl */ `
          precision highp float;
          uniform float uTime;
          varying vec3 vDirection;

          float hash(vec2 p) {
            vec3 q = fract(vec3(p.xyx) * 0.1031);
            q += dot(q, q.yzx + 33.33);
            return fract((q.x + q.y) * q.z);
          }

          vec3 stars(vec2 uv, float density, float rarity) {
            vec2 grid = uv * density;
            vec2 cell = floor(grid);
            float seed = hash(cell);
            vec2 center = vec2(hash(cell + 17.3), hash(cell + 41.7));
            center = 0.18 + center * 0.64;
            float distanceToStar = length(fract(grid) - center);
            float radius = mix(0.025, 0.065, seed);
            float aa = max(length(fwidth(grid)) * 0.45, 0.001);
            float core = 1.0 - smoothstep(max(0.0, radius - aa), radius + aa, distanceToStar);
            float halo = exp(-distanceToStar * distanceToStar * 160.0) * 0.035;
            float twinkle = 0.86 + 0.14 * sin(uTime * (0.3 + seed * 0.5) + seed * 93.0);
            vec3 tint = mix(vec3(0.58, 0.7, 1.0), vec3(1.0, 0.94, 0.84), hash(cell + 8.2));
            return tint * (core + halo) * step(rarity, seed)
              * mix(0.12, 0.58, hash(cell + 63.1)) * twinkle;
          }

          void main() {
            // Use the dominant cube face to keep stars round at the poles.
            vec3 dir = normalize(vDirection);
            vec3 axis = abs(dir);
            vec2 uv;
            float face;
            if (axis.z >= axis.x && axis.z >= axis.y) {
              uv = dir.xy / axis.z;
              face = dir.z > 0.0 ? 0.0 : 1.0;
            } else if (axis.x >= axis.y) {
              uv = dir.zy / axis.x;
              face = dir.x > 0.0 ? 2.0 : 3.0;
            } else {
              uv = dir.xz / axis.y;
              face = dir.y > 0.0 ? 4.0 : 5.0;
            }
            uv = uv * 0.5 + 0.5 + face * 13.7;

            vec3 color = stars(uv, 180.0, 0.94);
            color += stars(uv + 9.7, 72.0, 0.975) * 1.2;
            gl_FragColor = vec4(color * 0.8, 1.0);
          }
        `,
      })
    )
    this.mesh.renderOrder = -1000
    this.mesh.frustumCulled = false
    this.mesh.name = 'deep-space-starfield'
  }

  update({ time, camera }) {
    // Follow the camera so stars stay infinitely far away throughout the journey.
    this.mesh.position.copy(camera.position)
    this.mesh.material.uniforms.uTime.value = this.tier.reduced ? 0 : time
  }
}
