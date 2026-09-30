// CPU-spawned instanced billboard particles (drift sparks, smoke puffs). One InstancedMesh per effect pool.
import * as THREE from 'three/webgpu';
import { color, attribute, uv, float, smoothstep, vec3 } from 'three/tsl';

export class ParticlePool {
  readonly mesh: THREE.InstancedMesh;
  private pos: Float32Array; private vel: Float32Array; private life: Float32Array; private max: Float32Array; private size: Float32Array;
  private colAttr: THREE.InstancedBufferAttribute;
  private n: number; private next = 0;
  private m4 = new THREE.Matrix4(); private q = new THREE.Quaternion(); private v = new THREE.Vector3(); private s = new THREE.Vector3();
  gravity = -6; drag = 2.5;

  constructor(n: number, opts: { additive: boolean; soft?: boolean }) {
    this.n = n;
    this.pos = new Float32Array(n * 3); this.vel = new Float32Array(n * 3); this.life = new Float32Array(n); this.max = new Float32Array(n).fill(1); this.size = new Float32Array(n);
    const g = new THREE.PlaneGeometry(1, 1);
    const cols = new Float32Array(n * 3).fill(1);
    this.colAttr = new THREE.InstancedBufferAttribute(cols, 3);
    g.setAttribute('pcolor', this.colAttr);
    const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, blending: opts.additive ? THREE.AdditiveBlending : THREE.NormalBlending, side: THREE.DoubleSide, fog: !opts.additive });
    const d = uv().sub(0.5).length();
    const alpha = smoothstep(0.5, opts.soft ? 0.0 : 0.25, d);
    m.colorNode = vec3(attribute('pcolor', 'vec3')).mul(opts.additive ? float(3) : float(1));
    m.opacityNode = alpha;
    void color;
    this.mesh = new THREE.InstancedMesh(g, m, n);
    this.mesh.frustumCulled = false;
    this.mesh.count = n;
    for (let i = 0; i < n; i++) this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number, c: THREE.Color): void {
    const i = this.next; this.next = (this.next + 1) % this.n;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
    this.colAttr.setXYZ(i, c.r, c.g, c.b);
    this.colAttr.needsUpdate = true;
  }

  update(dt: number, camera: THREE.Camera): void {
    this.q.copy(camera.quaternion);
    const drag = Math.max(0, 1 - this.drag * dt);
    for (let i = 0; i < this.n; i++) {
      if (this.life[i]! <= 0) { continue; }
      this.life[i]! -= dt;
      const o = i * 3;
      this.vel[o + 1]! += this.gravity * dt;
      this.vel[o]! *= drag; this.vel[o + 1]! *= drag; this.vel[o + 2]! *= drag;
      this.pos[o]! += this.vel[o]! * dt; this.pos[o + 1]! += this.vel[o + 1]! * dt; this.pos[o + 2]! += this.vel[o + 2]! * dt;
      const k = Math.max(0, this.life[i]! / this.max[i]!);
      const sc = this.size[i]! * (0.4 + 0.6 * k);
      this.mesh.setMatrixAt(i, this.m4.compose(this.v.set(this.pos[o]!, this.pos[o + 1]!, this.pos[o + 2]!), this.q, this.s.set(sc, sc, sc)));
      if (this.life[i]! <= 0) this.mesh.setMatrixAt(i, this.m4.makeScale(0, 0, 0));
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
