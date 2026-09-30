// Skid-mark ribbons (30-art-bible §10.1): one shared ring buffer of quads for all karts (1 draw call), a quad per
// 0.25 m of travel per rear wheel, lifted 1.5 cm, tinted by surface, fading over 10 s in the shader.
import * as THREE from 'three/webgpu';
import { attribute, uv, float, smoothstep, abs, clamp } from 'three/tsl';
import { MaterialLibrary } from '../materials/library.ts';
import { particleClock } from './gpuParticles.ts';
import { uniform } from 'three/tsl';

const FADE_SEC = 10;
const now = uniform(0);

interface Emitter { on: boolean; x: number; y: number; z: number; lx: number; ly: number; lz: number; rx: number; ry: number; rz: number }

export class SkidMarks {
  readonly mesh: THREE.Mesh;
  private cap: number; private next = 0;
  private pos: THREE.BufferAttribute; private col: THREE.BufferAttribute; private tim: THREE.BufferAttribute;
  private em = new Map<number, Emitter>();
  private lo = Infinity; private hi = -1;

  constructor(segments: number) {
    const n = (this.cap = Math.max(64, Math.floor(segments)));
    const g = new THREE.BufferGeometry();
    this.pos = new THREE.BufferAttribute(new Float32Array(n * 4 * 3), 3); this.pos.setUsage(THREE.DynamicDrawUsage);
    this.col = new THREE.BufferAttribute(new Float32Array(n * 4 * 4), 4); this.col.setUsage(THREE.DynamicDrawUsage);
    this.tim = new THREE.BufferAttribute(new Float32Array(n * 4).fill(-1e6), 1); this.tim.setUsage(THREE.DynamicDrawUsage);
    const uvs = new Float32Array(n * 4 * 2), idx = new Uint32Array(n * 6);
    for (let i = 0; i < n; i++) {
      uvs.set([0, 0, 1, 0, 0, 1, 1, 1], i * 8);
      const v = i * 4; idx.set([v, v + 2, v + 1, v + 1, v + 2, v + 3], i * 6);
    }
    g.setAttribute('position', this.pos); g.setAttribute('skidCol', this.col); g.setAttribute('skidT', this.tim);
    g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2)); g.setIndex(new THREE.BufferAttribute(idx, 1));
    const mat = MaterialLibrary.custom('skids', () => {
      const m = new THREE.MeshBasicNodeMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4 });
      const c = attribute('skidCol', 'vec4');
      const age = now.sub(attribute('skidT', 'float'));
      const life = clamp(float(1).sub(age.div(FADE_SEC)), 0, 1);
      const edge = smoothstep(0.5, 0.2, abs(uv().x.sub(0.5)));
      m.colorNode = c.rgb;
      m.opacityNode = c.a.mul(life).mul(edge);
      return m;
    });
    this.mesh = new THREE.Mesh(g, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.mesh.name = 'skids';
  }

  /** Extends the mark of emitter `key` to (x, y, z); `rx..rz` = unit lateral axis; `w` = mark width. */
  add(key: number, x: number, y: number, z: number, rx: number, ry: number, rz: number, w: number, a: number, r: number, g: number, b: number): void {
    let e = this.em.get(key);
    if (!e) { e = { on: false, x: 0, y: 0, z: 0, lx: 0, ly: 0, lz: 0, rx: 0, ry: 0, rz: 0 }; this.em.set(key, e); }
    const hw = w * 0.5;
    const lx = x - rx * hw, ly = y - ry * hw + 0.015, lz = z - rz * hw;
    const qx = x + rx * hw, qy = y + ry * hw + 0.015, qz = z + rz * hw;
    if (!e.on) { e.on = true; e.x = x; e.y = y; e.z = z; e.lx = lx; e.ly = ly; e.lz = lz; e.rx = qx; e.ry = qy; e.rz = qz; return; }
    const dx = x - e.x, dy = y - e.y, dz = z - e.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < 0.0625) return;               // 0.25 m
    if (d2 > 9) { e.on = false; return; }   // teleport / respawn: start a new mark
    const i = this.next; this.next = (i + 1) % this.cap;
    const P = this.pos.array as Float32Array, C = this.col.array as Float32Array, T = this.tim.array as Float32Array;
    const v = i * 12;
    P[v] = e.lx; P[v + 1] = e.ly; P[v + 2] = e.lz; P[v + 3] = e.rx; P[v + 4] = e.ry; P[v + 5] = e.rz;
    P[v + 6] = lx; P[v + 7] = ly; P[v + 8] = lz; P[v + 9] = qx; P[v + 10] = qy; P[v + 11] = qz;
    const t = particleClock();
    for (let k = 0; k < 4; k++) { const c = (i * 4 + k) * 4; C[c] = r; C[c + 1] = g; C[c + 2] = b; C[c + 3] = a; T[i * 4 + k] = t; }
    e.x = x; e.y = y; e.z = z; e.lx = lx; e.ly = ly; e.lz = lz; e.rx = qx; e.ry = qy; e.rz = qz;
    if (i < this.lo) this.lo = i;
    if (i > this.hi) this.hi = i;
  }

  /** Ends the current mark of `key` (wheel lifted or drift ended). */
  lift(key: number): void { const e = this.em.get(key); if (e) e.on = false; }

  flush(): void {
    now.value = particleClock();
    if (this.hi < 0) return;
    const lo = this.lo, n = this.hi - lo + 1;
    this.pos.clearUpdateRanges(); this.pos.addUpdateRange(lo * 12, n * 12); this.pos.needsUpdate = true;
    this.col.clearUpdateRanges(); this.col.addUpdateRange(lo * 16, n * 16); this.col.needsUpdate = true;
    this.tim.clearUpdateRanges(); this.tim.addUpdateRange(lo * 4, n * 4); this.tim.needsUpdate = true;
    this.lo = Infinity; this.hi = -1;
  }

  dispose(): void { this.mesh.geometry.dispose(); }
}
