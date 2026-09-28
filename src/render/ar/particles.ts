import * as THREE from 'three';

/**
 * Частицы на GPU: кольцевой буфер, CPU только пишет точку рождения, скорость и цвет —
 * положение, размер и прозрачность по возрасту считает вершинный шейдер.
 */
const VERT = /* glsl */ `
  uniform float uTime;
  uniform float uSize;
  attribute vec3 aVel;
  attribute vec3 aColor;
  attribute float aBirth;
  attribute float aLife;
  attribute float aGravity;
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    float age = uTime - aBirth;
    float k = clamp(age / aLife, 0.0, 1.0);
    vec3 p = position + aVel * age + vec3(0.0, aGravity * age * age, 0.0);
    vColor = aColor;
    vAlpha = (age < 0.0 || age > aLife) ? 0.0 : (1.0 - k) * smoothstep(0.0, 0.08, age);
    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    gl_PointSize = uSize * (1.0 - 0.6 * k);
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vColor;
  varying float vAlpha;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    if (d > 0.5 || vAlpha <= 0.0) discard;
    float glow = pow(1.0 - d * 2.0, 1.8);
    gl_FragColor = vec4(vColor * (0.6 + glow), glow * vAlpha);
  }
`;

export class GpuParticles extends THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial> {
  private cursor = 0;
  private readonly cap: number;

  constructor(capacity = 1500, size = 22) {
    const g = new THREE.BufferGeometry();
    const f = (n: number) => new THREE.BufferAttribute(new Float32Array(capacity * n), n).setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('position', f(3));
    g.setAttribute('aVel', f(3));
    g.setAttribute('aColor', f(3));
    g.setAttribute('aBirth', f(1));
    g.setAttribute('aLife', f(1));
    g.setAttribute('aGravity', f(1));
    // рождённые «в прошлом» — невидимы до первого эмита
    (g.getAttribute('aBirth') as THREE.BufferAttribute).array.fill(-1e6);
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e6);
    const m = new THREE.ShaderMaterial({
      vertexShader: VERT,
      fragmentShader: FRAG,
      uniforms: { uTime: { value: 0 }, uSize: { value: size * (window.devicePixelRatio || 1) } },
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    super(g, m);
    this.cap = capacity;
    this.frustumCulled = false;
  }

  set time(t: number) {
    this.material.uniforms.uTime.value = t;
  }

  /** Родить n частиц в точке (сцена в пикселях, y вверх). */
  emit(
    n: number,
    at: THREE.Vector3,
    opts: { color: THREE.Color; speed: number; spread?: number; life?: number; gravity?: number; dir?: THREE.Vector3; jitter?: number },
  ) {
    const g = this.geometry;
    const pos = g.getAttribute('position') as THREE.BufferAttribute;
    const vel = g.getAttribute('aVel') as THREE.BufferAttribute;
    const col = g.getAttribute('aColor') as THREE.BufferAttribute;
    const birth = g.getAttribute('aBirth') as THREE.BufferAttribute;
    const life = g.getAttribute('aLife') as THREE.BufferAttribute;
    const grav = g.getAttribute('aGravity') as THREE.BufferAttribute;
    const now = this.material.uniforms.uTime.value as number;
    for (let k = 0; k < n; k++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.cap;
      const a = Math.random() * Math.PI * 2;
      const s = opts.speed * (0.4 + Math.random() * 0.6);
      const dir = opts.dir ?? new THREE.Vector3(Math.cos(a), Math.sin(a), 0);
      const sp = opts.spread ?? 1;
      const j = opts.jitter ?? 0;
      pos.setXYZ(i, at.x + (Math.random() - 0.5) * j, at.y + (Math.random() - 0.5) * j, at.z);
      vel.setXYZ(
        i,
        dir.x * s + Math.cos(a) * s * sp * 0.5,
        dir.y * s + Math.sin(a) * s * sp * 0.5,
        0,
      );
      col.setXYZ(i, opts.color.r, opts.color.g, opts.color.b);
      birth.setX(i, now);
      life.setX(i, (opts.life ?? 0.6) * (0.7 + Math.random() * 0.6));
      grav.setX(i, opts.gravity ?? 0);
    }
    for (const a of [pos, vel, col, birth, life, grav]) a.needsUpdate = true;
  }
}
