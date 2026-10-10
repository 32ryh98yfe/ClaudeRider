import { describe, expect, it } from 'vitest';
import { PropCollision } from '../src/track/PropCollision.ts';
import { TFLAG } from '../src/track/format.ts';
import type { TypedArray } from '../src/track/container.ts';
import type { Contact } from '../src/track/BakedTrack.ts';

const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const point = (m: number[], x: number, y: number, z: number): number[] => [0, 1, 2].map(a => m[a]! * x + m[a + 4]! * y + m[a + 8]! * z + m[a + 12]!);
const contacts = (n = 8): Contact[] => Array.from({ length: n }, () => ({ x: 0, y: 0, z: 0, nx: 0, ny: 0, nz: 0, depth: 0, flags: 0, tri: 0 }));
function fixture(matrices: number[][]) {
  const arrays = new Map<string, TypedArray>([
    ['model.pos', new Float64Array([-10, -10, 0, 10, -10, 0, 0, 10, 0])], ['model.idx', new Uint32Array([0, 1, 2])],
    ['prop0.mat', new Float64Array(matrices.flat())], ['prop0.geo', new Uint32Array(matrices.length)], ['prop0.flags', new Uint8Array(matrices.length).fill(TFLAG.PROP)],
    ['prop0.contacts', new Uint32Array(matrices.flatMap((_m, i) => [100 + i, 1]))],
  ]);
  const meta = { geometries: [{ prefix: 'model' }], sets: [{ kind: 'triangle', policy: 'solid' as const, n: matrices.length }] };
  return { arrays, meta, collision: new PropCollision(meta, arrays, 100) };
}

describe('instanced prop collision', () => {
  it('matches analytic plane contact under rotation, shear, reflection and nonuniform scale', () => {
    for (const m of [identity, [0, 0, 3, 0, 0, 2, 0, 0, -0.25, 0, 0, 0, 3000, 5, -800, 1], [-2, 0.4, 0.8, 0, 0.3, 1.5, 0.2, 0, 0.4, 0.2, 0.75, 0, -90, 25, 500, 1]]) {
      const { collision } = fixture([m]), out = contacts();
      const p = point(m, 0, -2, 0);
      const n = [m[1]! * m[6]! - m[2]! * m[5]!, m[2]! * m[4]! - m[0]! * m[6]!, m[0]! * m[5]! - m[1]! * m[4]!];
      const length = Math.hypot(...n); for (let i = 0; i < 3; i++) n[i] = n[i]! / length;
      for (const side of [-1, 1]) {
        const c = p.map((v, i) => v + n[i]! * side * 0.3);
        expect(collision.sphere(c[0]!, c[1]!, c[2]!, 0.85, out, 8, 0)).toBe(1);
        expect(out[0]!.depth).toBeCloseTo(0.55, 9);
        for (const [axis, key] of ['x', 'y', 'z'].entries()) expect(out[0]![key as 'x' | 'y' | 'z']).toBeCloseTo(p[axis]!, 9);
        expect(out[0]!.nx).toBeCloseTo(n[0]! * side, 9); expect(out[0]!.ny).toBeCloseTo(n[1]! * side, 9); expect(out[0]!.nz).toBeCloseTo(n[2]! * side, 9);
        expect(out[0]!.tri).toBe(100); expect(out[0]!.flags).toBe(TFLAG.PROP);
      }
    }
  });

  it('queries all distant instances and chooses deepest stable contacts with a bounded output', () => {
    const matrices = Array.from({ length: 40 }, (_, i) => { const m = [...identity]; m[12] = i * 1000; return m; });
    const { collision } = fixture(matrices), out = contacts(2);
    for (let i = 0; i < 40; i++) {
      expect(collision.sphere(i * 1000, 0, 0.25, 0.85, out, 2, 0)).toBe(1);
      expect(out[0]!.tri).toBe(100 + i);
    }
    const overlap = fixture([identity, identity, identity]).collision;
    out[0]!.tri = 20; out[0]!.depth = 0.1;
    expect(overlap.sphere(0, 0, 0.25, 0.85, out, 2, 1)).toBe(2);
    expect(out.map(c => c.tri).sort()).toEqual([100, 101]);
    expect(overlap.sphere(0, 0, 0.85, 0.85, out, 2, 0)).toBe(0);
    expect(overlap.sphere(NaN, 0, 0, 0.85, out, 2, 0)).toBe(0);
  });

  it('rejects invalid transforms and supports empty or ground-credited geometry', () => {
    const empty = new PropCollision({ geometries: [], sets: [] }, new Map(), 0);
    expect(empty.sphere(0, 0, 0, 1, contacts(), 8, 0)).toBe(0);
    const f = fixture([identity]);
    f.arrays.set('prop0.geo', new Uint32Array([0xffffffff])); f.arrays.set('prop0.contacts', new Uint32Array([100, 0]));
    expect(new PropCollision(f.meta, f.arrays, 100).sphere(0, 0, 0, 1, contacts(), 8, 0)).toBe(0);
    const singular = [...identity]; singular[0] = 0;
    expect(() => fixture([singular])).toThrow('Singular');
  });
});
