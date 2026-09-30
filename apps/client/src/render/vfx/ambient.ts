// Ambient air particles around the camera, per theme (EnvLook.ambient): snow, fireflies, desert dust, rain
// streaks, mine embers, falling leaves, petals, sunlit motes, space sparkles. Uses the shared particle pools.
import type * as THREE from 'three/webgpu';
import type { AmbientKind } from '../env/look.ts';
import { Shape, type GpuParticles, type SpawnOpts } from './gpuParticles.ts';

interface Recipe { rate: number; pool: 'sparks' | 'smoke'; o: SpawnOpts; life: [number, number]; col: [number, number, number][]; vel: (out: number[]) => void; radius: number; height: [number, number] }

const R = (): number => Math.random() - 0.5;
const RECIPES: Partial<Record<AmbientKind, Recipe>> = {
  snow: { rate: 90, pool: 'smoke', o: { shape: Shape.SOFT, additive: false, size0: 0.09, size1: 0.07, gravity: 0, drag: 0.2, alpha: 0.9 }, life: [4, 6], col: [[1, 1, 1]], vel: (v) => { v[0] = R() * 1.2; v[1] = -1.4; v[2] = R() * 1.2; }, radius: 28, height: [2, 16] },
  rain: { rate: 260, pool: 'sparks', o: { shape: Shape.SPARK, additive: true, size0: 0.025, size1: 0.025, gravity: -18, drag: 0, stretch: 0.05, emissive: 0.25 }, life: [0.7, 0.9], col: [[0.55, 0.62, 0.75]], vel: (v) => { v[0] = 1.5; v[1] = -16; v[2] = 0.8; }, radius: 22, height: [8, 16] },
  fireflies: { rate: 10, pool: 'sparks', o: { shape: Shape.SOFT, additive: true, size0: 0.22, size1: 0.12, gravity: 0, drag: 0.4, emissive: 2.4 }, life: [3, 5], col: [[0.8, 1, 0.45], [1, 0.85, 0.4]], vel: (v) => { v[0] = R() * 0.8; v[1] = R() * 0.4; v[2] = R() * 0.8; }, radius: 30, height: [0.5, 5] },
  dust: { rate: 30, pool: 'smoke', o: { shape: Shape.SMOKE, additive: false, size0: 1.5, size1: 3.5, gravity: 0, drag: 0.3, alpha: 0.12 }, life: [3, 5], col: [[0.91, 0.76, 0.48]], vel: (v) => { v[0] = 2.5; v[1] = 0.1; v[2] = 1 + R(); }, radius: 35, height: [0.3, 3] },
  embers: { rate: 22, pool: 'sparks', o: { shape: Shape.SOFT, additive: true, size0: 0.1, size1: 0.02, gravity: 0.8, drag: 0.5, emissive: 3 }, life: [2, 3.5], col: [[1, 0.42, 0.17], [1, 0.78, 0.34]], vel: (v) => { v[0] = R() * 0.6; v[1] = 0.8 + Math.random(); v[2] = R() * 0.6; }, radius: 26, height: [0, 4] },
  leaves: { rate: 14, pool: 'smoke', o: { shape: Shape.SQUARE, additive: false, size0: 0.14, size1: 0.12, gravity: -0.6, drag: 0.8, spin: 3, alpha: 1 }, life: [4, 6], col: [[0.31, 0.62, 0.24], [0.61, 0.77, 0.24], [0.89, 0.55, 0.2]], vel: (v) => { v[0] = 1 + R(); v[1] = -0.6; v[2] = R(); }, radius: 26, height: [3, 12] },
  petals: { rate: 10, pool: 'smoke', o: { shape: Shape.SQUARE, additive: false, size0: 0.09, size1: 0.08, gravity: -0.3, drag: 0.8, spin: 4, alpha: 0.95 }, life: [4, 6], col: [[1, 0.85, 0.82], [0.98, 0.97, 0.96], [0.85, 0.47, 0.34]], vel: (v) => { v[0] = 1.2 + R(); v[1] = -0.4; v[2] = R(); }, radius: 26, height: [2, 9] },
  motes: { rate: 16, pool: 'sparks', o: { shape: Shape.SOFT, additive: true, size0: 0.06, size1: 0.05, gravity: 0, drag: 0.3, emissive: 0.6 }, life: [3, 5], col: [[1, 0.96, 0.85]], vel: (v) => { v[0] = R() * 0.5; v[1] = 0.1; v[2] = R() * 0.5; }, radius: 18, height: [0.5, 5] },
  stars: { rate: 12, pool: 'sparks', o: { shape: Shape.STAR, additive: true, size0: 0.25, size1: 0.05, gravity: 0, drag: 1, emissive: 2, spin: 1 }, life: [1, 2], col: [[0.65, 1, 0.8], [0.49, 0.89, 0.99]], vel: (v) => { v[0] = 0; v[1] = 0; v[2] = 0; }, radius: 30, height: [1, 12] },
  bubbles: { rate: 14, pool: 'sparks', o: { shape: Shape.RING, additive: true, size0: 0.15, size1: 0.22, gravity: 0.6, drag: 0.5, emissive: 0.6 }, life: [2, 3], col: [[0.75, 0.95, 1]], vel: (v) => { v[0] = R() * 0.3; v[1] = 0.8; v[2] = R() * 0.3; }, radius: 16, height: [0, 4] },
};

export class AmbientFx {
  private r: Recipe | null;
  private v = [0, 0, 0];
  private sparks: GpuParticles; private smoke: GpuParticles;

  constructor(kind: AmbientKind, sparks: GpuParticles, smoke: GpuParticles) {
    this.r = RECIPES[kind] ?? null;
    this.sparks = sparks; this.smoke = smoke;
  }

  /** Spawns around (and ahead of) the camera; `fwd` biases spawns into the view. */
  update(cam: THREE.Vector3, fwd: THREE.Vector3, dt: number): void {
    const r = this.r; if (!r) return;
    const pool = r.pool === 'sparks' ? this.sparks : this.smoke;
    const n = pool.rate(r.rate, dt);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2, d = Math.sqrt(Math.random()) * r.radius;
      const x = cam.x + fwd.x * r.radius * 0.5 + Math.cos(a) * d, z = cam.z + fwd.z * r.radius * 0.5 + Math.sin(a) * d;
      const y = cam.y + r.height[0] + Math.random() * (r.height[1] - r.height[0]) - 1.5;
      r.vel(this.v);
      const c = r.col[i % r.col.length]!;
      pool.spawn(x, y, z, this.v[0]!, this.v[1]!, this.v[2]!, r.life[0] + Math.random() * (r.life[1] - r.life[0]), c[0], c[1], c[2], r.o);
    }
  }
}
