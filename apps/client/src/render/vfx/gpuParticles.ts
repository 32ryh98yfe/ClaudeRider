// Stateless GPU particles (30-art-bible §10): the CPU only writes spawn records into ring buffers of instanced
// attributes; the vertex stage evaluates p = p0 + v0·(1 − e^(−k·age))/k + ½·g·age² and billboards (or stretches
// along velocity for sparks). No compute, so it runs on the WebGL2 backend.
// One premultiplied-alpha material draws additive sparks (alpha 0) and soft smoke (alpha > 0) in the same draw,
// so every pool costs one draw call and all pools share one material.
import * as THREE from 'three/webgpu';
import {
  attribute, uniform, float, vec2, vec3, vec4, uv, cameraViewMatrix, cameraProjectionMatrix, positionLocal, Fn, exp, max, mix,
  smoothstep, clamp, abs, length, sin, cos, floor, mod, varyingProperty, pow, select,
} from 'three/tsl';
import { MaterialLibrary } from '../materials/library.ts';
import { setEmissive, vnoise } from '../materials/tsl.ts';

type N = any;

/** Particle look (fragment shape). */
export const Shape = { SOFT: 0, SPARK: 1, STAR: 2, RING: 3, SQUARE: 4, SMOKE: 5 } as const;
export type ShapeId = (typeof Shape)[keyof typeof Shape];

export interface SpawnOpts {
  shape: ShapeId;
  /** true = additive glow (ignores alpha), false = alpha-blended (smoke, dust, debris). */
  additive: boolean;
  size0: number; size1: number;
  gravity: number; drag: number;
  /** Spark stretch (s): quad length += |v| · stretch. */
  stretch?: number;
  /** Bloom intensity written to the emissive MRT (additive particles). */
  emissive?: number;
  /** Spin (rad/s) for squares and stars. */
  spin?: number;
  /** Peak opacity for alpha particles. */
  alpha?: number;
}

const shared = {
  now: uniform(0),
  fogColor: uniform(new THREE.Color('#cfe6f5')), fogNear: uniform(120), fogFar: uniform(900),
};

/** Current render time for all particle pools (seconds, scaled by the camera director's slow motion). */
export function setParticleClock(t: number): void { shared.now.value = t; }
export function particleClock(): number { return shared.now.value; }
export function setParticleFog(c: THREE.Color, near: number, far: number): void { shared.fogColor.value.copy(c); shared.fogNear.value = near; shared.fogFar.value = far; }

function particleMaterial(): THREE.MeshBasicNodeMaterial {
  return MaterialLibrary.custom('particles', () => {
    const m = new THREE.MeshBasicNodeMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor, blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });
    const iPos = attribute('iPos', 'vec4'), iVel = attribute('iVel', 'vec4'), iCol = attribute('iCol', 'vec4');
    const iPar = attribute('iPar', 'vec4'), iPhy = attribute('iPhy', 'vec4');
    const vDepth = varyingProperty('float', 'vPDepth');
    const age = shared.now.sub(iPos.w);
    const life = max(iVel.w, 0.001);
    const t = clamp(age.div(life), 0, 1);
    const kind = floor(mod(iPar.z, 16));
    m.vertexNode = Fn(() => {
      const g = iPhy.x, k = max(iPhy.y, 0.0005);
      const alive = select(age.greaterThanEqual(0).and(age.lessThanEqual(life)), float(1), float(0));
      const decay = float(1).sub(exp(k.negate().mul(age))).div(k);
      const p = iPos.xyz.add(iVel.xyz.mul(decay)).add(vec3(0, g.mul(0.5).mul(age).mul(age), 0));
      const vNow = iVel.xyz.mul(exp(k.negate().mul(age))).add(vec3(0, g.mul(age), 0));
      const size = mix(iPar.x, iPar.y, t).mul(alive);
      const vc = cameraViewMatrix.mul(vec4(p, 1)).toVar();
      const c = positionLocal.xy;
      const isSpark = select(kind.equal(1), float(1), float(0));
      // velocity-aligned stretch (sparks) or spin (everything else)
      const vv = cameraViewMatrix.mul(vec4(vNow, 0)).xy;
      const vlen = length(vv);
      const dir = select(vlen.greaterThan(0.0001), vv.div(vlen), vec2(0, 1));
      const perp = vec2(dir.y.negate(), dir.x);
      const len = size.add(vlen.mul(iPhy.z)).mul(alive);
      const sparkOff = dir.mul(c.y).mul(len).add(perp.mul(c.x).mul(size));
      const ang = iPar.w.mul(6.283).add(age.mul(iPhy.w));
      const ca = cos(ang), sa = sin(ang);
      const rotOff = vec2(c.x.mul(ca).sub(c.y.mul(sa)), c.x.mul(sa).add(c.y.mul(ca))).mul(size);
      const off = mix(rotOff, sparkOff, isSpark);
      vc.xy.addAssign(off);
      vDepth.assign(vc.z.negate());
      return cameraProjectionMatrix.mul(vc);
    })();
    const st = uv().sub(0.5);
    const r = length(st).mul(2);
    const soft = pow(smoothstep(1, 0, r), 1.5);
    const smokeN = vnoise(vec3(st.mul(3.2), iPar.w.mul(37).add(t.mul(0.8))));
    const smoke = smoothstep(1, 0.15, r).mul(smokeN.mul(0.8).add(0.35)).clamp(0, 1);
    const spark = exp(st.x.mul(st.x).mul(-60)).mul(smoothstep(0.5, 0.2, abs(st.y)));
    const star = clamp(float(1).sub(abs(st.x.mul(st.y)).mul(90)).sub(r.mul(0.75)), 0, 1).add(smoothstep(0.35, 0, r).mul(0.6)).clamp(0, 1);
    const ring = smoothstep(0.62, 0.84, r).mul(smoothstep(1.0, 0.88, r));
    const sq = smoothstep(0.5, 0.44, max(abs(st.x), abs(st.y)));
    const shape = select(kind.equal(0), soft, select(kind.equal(1), spark, select(kind.equal(2), star, select(kind.equal(3), ring, select(kind.equal(4), sq, smoke)))));
    // life curve: quick fade-in, ease-out fade
    const fade = smoothstep(0, 0.08, t).mul(float(1).sub(t).pow(select(kind.equal(1), float(0.6), float(1.2))));
    const additive = select(iPar.z.greaterThanEqual(16), float(0), float(1));
    const a = shape.mul(fade);
    const fog = smoothstep(shared.fogNear, shared.fogFar, vDepth);
    const col = iCol.rgb;
    const opa = a.mul(float(1).sub(additive)).mul(attribute('iAlp', 'float'));
    // premultiplied: additive → rgb·a, alpha 0; normal → rgb·opa (fogged), alpha opa
    const addRgb = col.mul(a).mul(float(1).sub(fog));
    const normRgb = mix(col, vec3(shared.fogColor as N), fog).mul(opa);
    m.colorNode = mix(normRgb, addRgb, additive);
    m.opacityNode = opa;
    setEmissive(m, col.mul(iCol.w).mul(a).mul(additive).mul(float(1).sub(fog)));
    return m;
  });
}

/** A ring buffer of particles drawn with one instanced draw call. */
export class GpuParticles {
  readonly mesh: THREE.Mesh;
  readonly capacity: number;
  private geo: THREE.InstancedBufferGeometry;
  private aPos: THREE.InstancedBufferAttribute; private aVel: THREE.InstancedBufferAttribute; private aCol: THREE.InstancedBufferAttribute;
  private aPar: THREE.InstancedBufferAttribute; private aPhy: THREE.InstancedBufferAttribute; private aAlp: THREE.InstancedBufferAttribute;
  private next = 0; private dirtyLo = Infinity; private dirtyHi = -1;
  /** Spawn multiplier from the quality tier (25 % … 150 %). */
  budget = 1;
  private acc = 0;

  constructor(capacity: number, name: string) {
    this.capacity = Math.max(16, Math.floor(capacity));
    const n = this.capacity;
    const base = new THREE.PlaneGeometry(1, 1);
    const g = new THREE.InstancedBufferGeometry();
    g.index = base.index; g.setAttribute('position', base.attributes.position!); g.setAttribute('uv', base.attributes.uv!);
    const mk = (size: number): THREE.InstancedBufferAttribute => { const a = new THREE.InstancedBufferAttribute(new Float32Array(n * size), size); a.setUsage(THREE.DynamicDrawUsage); return a; };
    this.aPos = mk(4); this.aVel = mk(4); this.aCol = mk(4); this.aPar = mk(4); this.aPhy = mk(4); this.aAlp = mk(1);
    // everything starts dead: spawn time far in the future
    for (let i = 0; i < n; i++) { this.aPos.array[i * 4 + 3] = 1e9; this.aVel.array[i * 4 + 3] = 0.001; }
    g.setAttribute('iPos', this.aPos); g.setAttribute('iVel', this.aVel); g.setAttribute('iCol', this.aCol);
    g.setAttribute('iPar', this.aPar); g.setAttribute('iPhy', this.aPhy); g.setAttribute('iAlp', this.aAlp);
    g.instanceCount = n;
    this.geo = g;
    this.mesh = new THREE.Mesh(g, particleMaterial());
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 5;
    this.mesh.name = `particles:${name}`;
  }

  /** Rate-limited spawn helper: returns how many particles to emit this frame for `perSec` (budget-scaled). */
  rate(perSec: number, dt: number): number {
    this.acc += perSec * this.budget * dt;
    const n = Math.floor(this.acc);
    this.acc -= n;
    return n;
  }
  /** Budget-scaled burst count (at least `min`). */
  burst(n: number, min = 1): number { return Math.max(min, Math.round(n * this.budget)); }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, r: number, g: number, b: number, o: SpawnOpts, seed = Math.random()): void {
    const i = this.next; this.next = (i + 1) % this.capacity;
    const P = this.aPos.array as Float32Array, V = this.aVel.array as Float32Array, C = this.aCol.array as Float32Array;
    const Q = this.aPar.array as Float32Array, H = this.aPhy.array as Float32Array, A = this.aAlp.array as Float32Array;
    const j = i * 4;
    P[j] = x; P[j + 1] = y; P[j + 2] = z; P[j + 3] = shared.now.value;
    V[j] = vx; V[j + 1] = vy; V[j + 2] = vz; V[j + 3] = life;
    C[j] = r; C[j + 1] = g; C[j + 2] = b; C[j + 3] = o.emissive ?? (o.additive ? 1.2 : 0);
    Q[j] = o.size0; Q[j + 1] = o.size1; Q[j + 2] = o.shape + (o.additive ? 0 : 16); Q[j + 3] = seed;
    H[j] = o.gravity; H[j + 1] = o.drag; H[j + 2] = o.stretch ?? 0; H[j + 3] = o.spin ?? 0;
    A[i] = o.alpha ?? 1;
    if (i < this.dirtyLo) this.dirtyLo = i;
    if (i > this.dirtyHi) this.dirtyHi = i;
  }

  /** Uploads the spawn records written this frame (one contiguous range per attribute). */
  flush(): void {
    if (this.dirtyHi < 0) return;
    const lo = this.dirtyLo, n = this.dirtyHi - lo + 1;
    for (const a of [this.aPos, this.aVel, this.aCol, this.aPar, this.aPhy]) { a.clearUpdateRanges(); a.addUpdateRange(lo * 4, n * 4); a.needsUpdate = true; }
    this.aAlp.clearUpdateRanges(); this.aAlp.addUpdateRange(lo, n); this.aAlp.needsUpdate = true;
    this.dirtyLo = Infinity; this.dirtyHi = -1;
  }

  dispose(): void { this.geo.dispose(); }
}

export { vec2 };
